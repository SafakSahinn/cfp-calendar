-- Laboratuvar/araştırma grupları (ortak takvim, çağrı önerisi) ve yönetici duyuruları.
--
-- Gizlilik ve güvenlik:
--  * Grup, üyeleri ve grup takvimi yalnızca grup üyelerine görünür (RLS: is_group_member).
--  * Üyeler birbirinin yalnızca adını, unvanını ve kurumunu görür; e-posta asla dönmez.
--  * Davet kodu yalnızca grup sahibine görünür (kolon izni), 64 bit rastgele, istenince yenilenir.
--  * Tüm yazma işlemleri SECURITY DEFINER fonksiyonlarla; tabloda istemci yazma politikası yok.

-- ---------------------------------------------------------------------------
-- Gruplar
-- ---------------------------------------------------------------------------
create table public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 3 and 80),
  description      text check (description is null or length(description) <= 500),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  invite_code      text not null unique,
  members_can_post boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_events (
  group_id   uuid not null references public.groups (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  added_by   uuid references auth.users (id) on delete set null,
  note       text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (group_id, event_id)
);

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.group_events  enable row level security;

create function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid());
$$;

create function public.is_group_owner(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = p_group and owner_id = auth.uid());
$$;

create policy "uyeler grubu gorur" on public.groups
  for select to authenticated using (public.is_group_member(id));
create policy "uyeler uyelikleri gorur" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "uyeler grup takvimini gorur" on public.group_events
  for select to authenticated using (public.is_group_member(group_id));

-- Davet kodu kolonu doğrudan okunamaz (yalnızca sahibe group_invite_code() ile)
revoke all on public.groups from authenticated, anon;
grant select (id, name, description, owner_id, members_can_post, created_at) on public.groups to authenticated;
revoke all on public.group_members from anon;
revoke insert, update, delete on public.group_members from authenticated;
revoke all on public.group_events from anon;
revoke insert, update, delete on public.group_events from authenticated;

create function public.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
$$;

create function public.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;

create function public.create_group(p_name text, p_description text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_user(); v_id uuid;
begin
  if (select count(*) from public.groups where owner_id = v_uid) >= 10 then
    raise exception 'too_many_groups' using errcode = '54000';
  end if;
  insert into public.groups (name, description, owner_id, invite_code)
  values (btrim(p_name), nullif(btrim(p_description), ''), v_uid, public.new_invite_code())
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end;
$$;

create function public.update_group(p_group uuid, p_name text, p_description text, p_members_can_post boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_group_owner(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.groups set name = btrim(p_name), description = nullif(btrim(p_description), ''),
         members_can_post = coalesce(p_members_can_post, false)
   where id = p_group;
end;
$$;

create function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_group_owner(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.groups where id = p_group;
end;
$$;

create function public.group_invite_code(p_group uuid, p_regenerate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  perform public.require_user();
  if not public.is_group_owner(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_regenerate then
    update public.groups set invite_code = public.new_invite_code() where id = p_group returning invite_code into v_code;
  else
    select invite_code into v_code from public.groups where id = p_group;
  end if;
  return v_code;
end;
$$;

/** Davet koduyla grubun adını gösterir (katılmadan önce onay ekranı için). */
create function public.group_preview(p_code text) returns table (id uuid, name text, description text, member_count integer, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_user();
  return query
    select g.id, g.name, g.description,
           (select count(*)::int from public.group_members m where m.group_id = g.id),
           public.is_group_member(g.id)
    from public.groups g where g.invite_code = p_code;
end;
$$;

create function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_user(); v_id uuid;
begin
  select id into v_id from public.groups where invite_code = p_code;
  if v_id is null then raise exception 'invalid_code' using errcode = 'P0002'; end if;
  if (select count(*) from public.group_members where group_id = v_id) >= 200 then
    raise exception 'group_full' using errcode = '54000';
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  return v_id;
end;
$$;

create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_user();
begin
  if public.is_group_owner(p_group) then raise exception 'owner_cannot_leave' using errcode = '42501'; end if;
  delete from public.group_members where group_id = p_group and user_id = v_uid;
end;
$$;

create function public.remove_group_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_group_owner(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'owner_cannot_leave' using errcode = '42501'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end;
$$;

/** Üye listesi: yalnızca ad, unvan, kurum — e-posta YOK. */
create function public.group_member_list(p_group uuid)
returns table (user_id uuid, display_name text, academic_title text, institution text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_group_member(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, p.display_name, p.academic_title, p.institution, m.role, m.joined_at
    from public.group_members m left join public.profiles p on p.id = m.user_id
    where m.group_id = p_group
    order by (m.role = 'owner') desc, p.display_name nulls last;
end;
$$;

create function public.my_groups()
returns table (id uuid, name text, description text, role text, member_count integer, event_count integer, members_can_post boolean, owner_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public.require_user();
begin
  return query
    select g.id, g.name, g.description, m.role,
           (select count(*)::int from public.group_members x where x.group_id = g.id),
           (select count(*)::int from public.group_events x where x.group_id = g.id),
           g.members_can_post,
           (select p.display_name from public.profiles p where p.id = g.owner_id)
    from public.group_members m join public.groups g on g.id = m.group_id
    where m.user_id = v_uid
    order by g.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bildirim türleri: duyuru ve grup önerisi
-- ---------------------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 3 and 150),
  body       text not null check (length(body) between 1 and 3000),
  url        text check (url is null or url ~ '^https?://[^\s]+$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create policy "uyeler duyurulari okur" on public.announcements for select to authenticated using (true);
revoke insert, update, delete on public.announcements from authenticated, anon;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'submission_open', 'topic_match', 'dates_changed', 'deadline_reminder', 'announcement', 'group_recommendation'
));
alter table public.notifications
  add column announcement_id uuid references public.announcements (id) on delete cascade,
  add column group_id uuid references public.groups (id) on delete cascade;

/** Gruba çağrı öner: grup takvimine ekler, diğer üyelere "İlgileniyor musunuz?" mesajı gönderir. */
create function public.group_add_event(p_group uuid, p_event uuid, p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_user(); v_group public.groups%rowtype; v_by text; v_sent integer;
begin
  select * into v_group from public.groups where id = p_group;
  if v_group.id is null or not public.is_group_member(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_group.owner_id <> v_uid and not v_group.members_can_post then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event) then raise exception 'not found' using errcode = 'P0002'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'invalid note' using errcode = '22023'; end if;

  insert into public.group_events (group_id, event_id, added_by, note)
  values (p_group, p_event, v_uid, nullif(btrim(p_note), ''))
  on conflict (group_id, event_id) do nothing;
  if not found then raise exception 'already_added' using errcode = '23505'; end if;

  select display_name into v_by from public.profiles where id = v_uid;
  insert into public.notifications (user_id, event_id, type, dedupe_key, payload, group_id)
  select m.user_id, p_event, 'group_recommendation', 'grp:' || p_group || ':' || p_event,
         jsonb_build_object('group_name', v_group.name, 'by', v_by, 'note', nullif(btrim(p_note), '')), p_group
  from public.group_members m
  where m.group_id = p_group and m.user_id <> v_uid
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

create function public.group_remove_event(p_group uuid, p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.require_user();
begin
  if not (public.is_group_owner(p_group)
          or exists (select 1 from public.group_events where group_id = p_group and event_id = p_event and added_by = v_uid)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.group_events where group_id = p_group and event_id = p_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Duyurular (yönetici)
-- ---------------------------------------------------------------------------
/** p_recipients: yalnızca otomatik testler için (verilirse duyuru sadece bu kullanıcılara gider; gerçek üyeler etkilenmez). */
create function public.admin_create_announcement(p_title text, p_body text, p_url text default null, p_recipients uuid[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sent integer;
begin
  perform public.admin_assert();
  insert into public.announcements (title, body, url, created_by)
  values (btrim(p_title), p_body, nullif(btrim(p_url), ''), auth.uid())
  returning id into v_id;
  insert into public.notifications (user_id, type, dedupe_key, payload, announcement_id)
  select u.id, 'announcement', 'ann:' || v_id, '{}', v_id from auth.users u
  where p_recipients is null or u.id = any (p_recipients);
  get diagnostics v_sent = row_count;
  perform public.admin_log('create_announcement', v_id::text, jsonb_build_object('title', btrim(p_title), 'recipients', v_sent));
  return v_sent;
end;
$$;

create function public.admin_list_announcements()
returns table (id uuid, title text, body text, url text, created_at timestamptz, recipients integer, read_count integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query
    select a.id, a.title, a.body, a.url, a.created_at,
           (select count(*)::int from public.notifications n where n.announcement_id = a.id),
           (select count(*)::int from public.notifications n where n.announcement_id = a.id and n.read_at is not null)
    from public.announcements a order by a.created_at desc limit 100;
end;
$$;

create function public.admin_delete_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  perform public.admin_assert();
  delete from public.announcements where id = p_id returning title into v_title;
  if v_title is null then raise exception 'not found' using errcode = 'P0002'; end if;
  perform public.admin_log('delete_announcement', p_id::text, jsonb_build_object('title', v_title));
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonksiyon yetkileri
-- ---------------------------------------------------------------------------
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_owner(uuid) from public, anon;
revoke all on function public.new_invite_code() from public, anon, authenticated;
revoke all on function public.require_user() from public, anon, authenticated;
revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.update_group(uuid, text, text, boolean) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.group_invite_code(uuid, boolean) from public, anon;
revoke all on function public.group_preview(text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.group_member_list(uuid) from public, anon;
revoke all on function public.my_groups() from public, anon;
revoke all on function public.group_add_event(uuid, uuid, text) from public, anon;
revoke all on function public.group_remove_event(uuid, uuid) from public, anon;
revoke all on function public.admin_create_announcement(text, text, text, uuid[]) from public, anon;
revoke all on function public.admin_list_announcements() from public, anon;
revoke all on function public.admin_delete_announcement(uuid) from public, anon;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.update_group(uuid, text, text, boolean) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.group_invite_code(uuid, boolean) to authenticated;
grant execute on function public.group_preview(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.group_member_list(uuid) to authenticated;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.group_add_event(uuid, uuid, text) to authenticated;
grant execute on function public.group_remove_event(uuid, uuid) to authenticated;
grant execute on function public.admin_create_announcement(text, text, text, uuid[]) to authenticated;
grant execute on function public.admin_list_announcements() to authenticated;
grant execute on function public.admin_delete_announcement(uuid) to authenticated;
