-- Konferans serisi takibi + grupta başvuru görünürlüğü.

-- ---------------------------------------------------------------------------
-- Seri: aynı konferansın yıllık edisyonları (ör. ICASSP-2026, ICASSP-2027 → "ICASSP")
-- ---------------------------------------------------------------------------
alter table public.events add column series_key text;
create index events_series_idx on public.events (series_key) where series_key is not null;

create table public.series_follows (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_key text not null check (series_key ~ '^[A-Z0-9]{2,40}$'),
  label      text check (label is null or length(label) <= 120),
  created_at timestamptz not null default now(),
  primary key (user_id, series_key)
);
alter table public.series_follows enable row level security;
create policy "kendi serilerini okur" on public.series_follows for select to authenticated using (user_id = auth.uid());
create policy "kendi serisini ekler" on public.series_follows for insert to authenticated with check (user_id = auth.uid());
create policy "kendi serisini siler" on public.series_follows for delete to authenticated using (user_id = auth.uid());
revoke all on public.series_follows from anon;

-- Yeni edisyon bildirimi
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'submission_open', 'topic_match', 'dates_changed', 'deadline_reminder', 'announcement', 'group_recommendation', 'series_new'
));

-- ---------------------------------------------------------------------------
-- Grupta başvuru görünürlüğü: kişi açıkça izin verirse grup ARKADAŞLARI ad + durum görür (notlar asla)
-- ---------------------------------------------------------------------------
alter table public.submissions add column share_with_members boolean not null default false;

/** Bu çağrı için, ortak gruplarımdaki kişilerin paylaşılmış başvuruları (benimki hariç). */
create function public.event_group_participants(p_event uuid)
returns table (group_id uuid, group_name text, user_id uuid, display_name text, academic_title text, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  return query
    select g.id, g.name, s.user_id, p.display_name, p.academic_title, s.status
    from public.submissions s
    join public.groups g on g.id = any (s.shared_group_ids)
    join public.group_members me on me.group_id = g.id and me.user_id = auth.uid()
    join public.group_members them on them.group_id = g.id and them.user_id = s.user_id
    left join public.profiles p on p.id = s.user_id
    where s.event_id = p_event
      and s.user_id <> auth.uid()
      and (s.share_with_members or g.owner_id = auth.uid())
    order by g.name, p.display_name;
end;
$$;

/** Grup sayfası: önerilen her çağrı için paylaşılmış başvuru sayısı. */
create function public.group_participation(p_group uuid)
returns table (event_id uuid, participants integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.event_id, count(*)::int
    from public.submissions s
    join public.group_members m on m.group_id = p_group and m.user_id = s.user_id
    where p_group = any (s.shared_group_ids)
      and (s.share_with_members or public.is_group_owner(p_group))
    group by s.event_id;
end;
$$;

revoke all on function public.event_group_participants(uuid) from public, anon;
revoke all on function public.group_participation(uuid) from public, anon;
grant execute on function public.event_group_participants(uuid) to authenticated;
grant execute on function public.group_participation(uuid) to authenticated;
