-- Kişiye özel hatırlatma günleri + grup içi çağrı yorumları.

-- ---------------------------------------------------------------------------
-- Hatırlatma günleri: son başvurudan kaç gün önce hatırlatılsın (varsayılan 7)
-- ---------------------------------------------------------------------------
alter table public.profiles add column reminder_days smallint[] not null default '{7}'
  check (reminder_days <@ '{14,7,3,1}'::smallint[] and cardinality(reminder_days) <= 4);
grant update (reminder_days) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Grup yorumları: grubun ortak takvimindeki bir çağrının altında, sadece üyeler
-- ---------------------------------------------------------------------------
create table public.group_comments (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null,
  event_id   uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (group_id, event_id) references public.group_events (group_id, event_id) on delete cascade
);
create index group_comments_thread_idx on public.group_comments (group_id, event_id, created_at);
alter table public.group_comments enable row level security;
create policy "uye yorumlari okur" on public.group_comments for select to authenticated using (public.is_group_member(group_id));
create policy "uye yorum yazar" on public.group_comments for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "kendi yorumunu veya sahip siler" on public.group_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_group_owner(group_id));
revoke all on public.group_comments from anon;
revoke update on public.group_comments from authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'submission_open', 'topic_match', 'dates_changed', 'deadline_reminder', 'announcement', 'group_recommendation', 'series_new', 'group_comment'
));

-- Yeni yorum: günde 30 sınırı + diğer üyelere günde en fazla bir "yorum" bildirimi (çağrı başına)
create function public.group_comment_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_group text;
begin
  if (select count(*) from public.group_comments
      where user_id = new.user_id and created_at > now() - interval '1 day') > 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select display_name into v_name from public.profiles where id = new.user_id;
  select name into v_group from public.groups where id = new.group_id;
  insert into public.notifications (user_id, event_id, group_id, type, dedupe_key, payload)
  select m.user_id, new.event_id, new.group_id, 'group_comment',
         'gc:' || new.group_id || ':' || new.event_id || ':' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD'),
         jsonb_build_object('group_name', v_group, 'by', v_name, 'note', left(new.body, 140))
  from public.group_members m
  where m.group_id = new.group_id and m.user_id <> new.user_id
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end;
$$;
create trigger group_comment_after after insert on public.group_comments
  for each row execute function public.group_comment_after();

/** Grup sayfası: yorumlar + yazanın adı/unvanı (e-posta yok). */
create function public.group_comment_list(p_group uuid)
returns table (id uuid, event_id uuid, user_id uuid, display_name text, academic_title text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select c.id, c.event_id, c.user_id, p.display_name, p.academic_title, c.body, c.created_at
    from public.group_comments c left join public.profiles p on p.id = c.user_id
    where c.group_id = p_group
    order by c.created_at;
end;
$$;
revoke all on function public.group_comment_list(uuid) from public, anon;
grant execute on function public.group_comment_list(uuid) to authenticated;
