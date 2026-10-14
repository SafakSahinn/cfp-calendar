-- Profil fotoğrafı onayı: yüklenen fotoğraf yönetici onaylayınca grup arkadaşlarına görünür.
--   avatar_path          : en son yüklenen (sahibi her zaman görür; onay bekliyor olabilir)
--   avatar_approved_path : onaylı fotoğraf (grup arkadaşları bunu görür)
--   avatar_status        : null | pending | approved | rejected
-- Her yükleme benzersiz dosya adı alır (<uid>/avatar-<hex>.<ext>): onaylı dosyanın üzerine onaysız fotoğraf yazılamaz.
-- Kullanıcı bu sütunları doğrudan değiştiremez; set_avatar / clear_avatar RPC'leri, yönetici admin_review_avatar kullanır.

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles
  add column avatar_approved_path text,
  add column avatar_status text check (avatar_status is null or avatar_status in ('pending', 'approved', 'rejected')),
  add column avatar_uploaded_at timestamptz;
alter table public.profiles add constraint profiles_avatar_paths_check check (
  (avatar_path is null or (avatar_path ~ '^[0-9a-f-]{36}/avatar(-[0-9a-f]{8,32})?\.(webp|jpg|png)$' and split_part(avatar_path, '/', 1) = id::text))
  and (avatar_approved_path is null or (avatar_approved_path ~ '^[0-9a-f-]{36}/avatar(-[0-9a-f]{8,32})?\.(webp|jpg|png)$' and split_part(avatar_approved_path, '/', 1) = id::text))
);
revoke update (avatar_path) on public.profiles from authenticated;
-- Önceki sürümde yüklenmiş fotoğraflar onaya düşer
update public.profiles set avatar_status = 'pending', avatar_uploaded_at = now() where avatar_path is not null;

-- ---------------------------------------------------------------------------
-- Depo izinleri: sahibi, yöneticiler ve (onaylıysa) aynı grubu paylaşan üyeler okuyabilir
-- ---------------------------------------------------------------------------
create function public.shares_group(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_other
  );
$$;

create function public.can_read_avatar(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    split_part(p_name, '/', 1) = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.avatar_approved_path = p_name and p.avatar_status is not null and public.shares_group(p.id)
    )
  );
$$;
revoke all on function public.shares_group(uuid) from public, anon;
revoke all on function public.can_read_avatar(text) from public, anon;
grant execute on function public.shares_group(uuid) to authenticated;
grant execute on function public.can_read_avatar(text) to authenticated;

drop policy "avatar: kendi fotoğrafını okur" on storage.objects;
drop policy "avatar: kendi klasörüne yükler" on storage.objects;
drop policy "avatar: kendi fotoğrafını günceller" on storage.objects;
drop policy "avatar: kendi fotoğrafını siler" on storage.objects;

create policy "avatar: okuma (sahip, yönetici, onaylıysa grup arkadaşı)" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_read_avatar(name));
-- Yeni dosya: yalnızca kendi klasörü, benzersiz ad; üzerine yazma (update) YOK
create policy "avatar: kendi klasörüne yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ '^[0-9a-f-]{36}/avatar-[0-9a-f]{8,32}\.(webp|jpg|png)$');
create policy "avatar: sahip veya yönetici siler" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Kullanıcı RPC'leri
-- ---------------------------------------------------------------------------
/** Yeni yüklenen dosyayı profile bağlar ve onaya düşürür; silinmesi gereken eski (onaylanmamış) dosyayı döndürür. */
create function public.set_avatar(p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_old text; v_approved text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_path !~ '^[0-9a-f-]{36}/avatar-[0-9a-f]{8,32}\.(webp|jpg|png)$' or split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
    raise exception 'not_uploaded' using errcode = 'P0001';
  end if;
  select avatar_path, avatar_approved_path into v_old, v_approved from public.profiles where id = auth.uid();
  update public.profiles set avatar_path = p_path, avatar_status = 'pending', avatar_uploaded_at = now() where id = auth.uid();
  return case when v_old is not null and v_old <> p_path and v_old is distinct from v_approved then v_old end;
end;
$$;

/** Fotoğrafı kaldırır; silinmesi gereken dosyaları döndürür (dosyaları istemci depo API'siyle siler). */
create function public.clear_avatar() returns text[]
language plpgsql security definer set search_path = '' as $$
declare v_paths text[];
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select array_remove(array[avatar_path, avatar_approved_path], null) into v_paths from public.profiles where id = auth.uid();
  update public.profiles set avatar_path = null, avatar_approved_path = null, avatar_status = null, avatar_uploaded_at = null where id = auth.uid();
  return array(select distinct unnest(coalesce(v_paths, '{}')));
end;
$$;

/** Görünebilir fotoğraf yolları: kendim için en son yüklenen, grup arkadaşlarım için onaylı olan. */
create function public.peer_avatar_paths(p_users uuid[])
returns table (user_id uuid, path text)
language sql stable security definer set search_path = '' as $$
  select p.id, case when p.id = auth.uid() then p.avatar_path else p.avatar_approved_path end
  from public.profiles p
  where p.id = any (p_users[1:500])
    and (p.id = auth.uid() or (p.avatar_approved_path is not null and public.shares_group(p.id)))
    and (case when p.id = auth.uid() then p.avatar_path else p.avatar_approved_path end) is not null;
$$;

revoke all on function public.set_avatar(text) from public, anon;
revoke all on function public.clear_avatar() from public, anon;
revoke all on function public.peer_avatar_paths(uuid[]) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;
grant execute on function public.clear_avatar() to authenticated;
grant execute on function public.peer_avatar_paths(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Yönetici: onay listesi ve karar
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'submission_open', 'topic_match', 'dates_changed', 'deadline_reminder', 'announcement', 'group_recommendation',
  'series_new', 'group_comment', 'saved_search', 'submission_task', 'coauthor_update', 'avatar_reviewed'
));

create function public.admin_pending_avatars()
returns table (user_id uuid, display_name text, email text, avatar_path text, uploaded_at timestamptz, has_approved boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query
    select p.id, p.display_name, p.email, p.avatar_path, p.avatar_uploaded_at, p.avatar_approved_path is not null
    from public.profiles p where p.avatar_status = 'pending' and p.avatar_path is not null
    order by p.avatar_uploaded_at nulls first;
end;
$$;

/** Onayla/Reddet. p_path, incelenen dosya (bu arada kullanıcı yenisini yüklediyse 'stale'). Silinecek dosyaları döndürür. */
create function public.admin_review_avatar(p_user uuid, p_path text, p_approve boolean) returns text[]
language plpgsql security definer set search_path = '' as $$
declare v_cur text; v_approved text; v_delete text[] := '{}';
begin
  perform public.admin_assert();
  select avatar_path, avatar_approved_path into v_cur, v_approved from public.profiles where id = p_user and avatar_status = 'pending';
  if v_cur is null or v_cur <> p_path then raise exception 'stale' using errcode = 'P0001'; end if;
  if p_approve then
    update public.profiles set avatar_approved_path = v_cur, avatar_status = 'approved' where id = p_user;
    if v_approved is not null and v_approved <> v_cur then v_delete := array[v_approved]; end if;
  else
    update public.profiles set avatar_path = v_approved, avatar_status = 'rejected' where id = p_user;
    v_delete := array[v_cur];
  end if;
  insert into public.notifications (user_id, type, dedupe_key, payload)
  values (p_user, 'avatar_reviewed', 'av:' || p_path, jsonb_build_object('approved', p_approve))
  on conflict (user_id, dedupe_key) do nothing;
  perform public.admin_log(case when p_approve then 'avatar_approve' else 'avatar_reject' end, p_user::text, jsonb_build_object('path', p_path));
  return v_delete;
end;
$$;

revoke all on function public.admin_pending_avatars() from public, anon;
revoke all on function public.admin_review_avatar(uuid, text, boolean) from public, anon;
grant execute on function public.admin_pending_avatars() to authenticated;
grant execute on function public.admin_review_avatar(uuid, text, boolean) to authenticated;
