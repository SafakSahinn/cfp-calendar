-- Kabul sonrası takip (camera-ready / kayıt / sunum tarihleri) + ortak yazarlar.
-- Gizlilik: kaydın sahibi notes (kişisel notlar) ve grup paylaşımını yönetir; ortak yazarlar sadece ortak alanları
-- (durum, başlık, tarihler, ortak notlar) RPC'lerle görür/değiştirir. Tablo RLS'i değişmez (sadece sahibi).

alter table public.submissions
  add column camera_ready_due date,
  add column registration_due date,
  add column presentation_at  date,
  add column shared_notes     text check (shared_notes is null or length(shared_notes) <= 2000),
  add column invite_code      text unique;

-- Davet kodu sahibine bile tablo üzerinden görünmesin (yalnızca RPC): sütun izinleri
revoke select on public.submissions from authenticated;
grant select (id, user_id, event_id, status, paper_title, notes, submitted_at, decision_at, shared_group_ids, created_at, updated_at,
              share_with_members, camera_ready_due, registration_due, presentation_at, shared_notes)
  on public.submissions to authenticated;
revoke insert, update on public.submissions from authenticated;
grant insert (event_id, status, paper_title, notes, submitted_at, decision_at, shared_group_ids, share_with_members,
              camera_ready_due, registration_due, presentation_at, shared_notes) on public.submissions to authenticated;
grant update (status, paper_title, notes, submitted_at, decision_at, shared_group_ids, share_with_members,
              camera_ready_due, registration_due, presentation_at, shared_notes) on public.submissions to authenticated;

create table public.submission_members (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (submission_id, user_id)
);
create index submission_members_user_idx on public.submission_members (user_id);
alter table public.submission_members enable row level security; -- politika yok: yalnızca RPC
revoke all on public.submission_members from anon, authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'submission_open', 'topic_match', 'dates_changed', 'deadline_reminder', 'announcement', 'group_recommendation',
  'series_new', 'group_comment', 'saved_search', 'submission_task', 'coauthor_update'
));

create function public.is_submission_party(p_submission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submissions where id = p_submission and user_id = auth.uid())
      or exists (select 1 from public.submission_members where submission_id = p_submission and user_id = auth.uid());
$$;

/** Sahip: davet kodu (gerekirse yeniler). */
create function public.submission_invite_code(p_submission uuid, p_regenerate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select invite_code into v from public.submissions where id = p_submission and user_id = auth.uid();
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if v is null or p_regenerate then
    v := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    update public.submissions set invite_code = v where id = p_submission;
  end if;
  return v;
end;
$$;

/** Davet bağlantısı önizlemesi (katılmadan önce). */
create function public.submission_preview(p_code text)
returns table (paper_title text, event_acronym text, event_title text, owner_name text, members integer)
language sql stable security definer set search_path = '' as $$
  select s.paper_title, e.acronym, e.title, p.display_name,
         (select count(*)::int from public.submission_members m where m.submission_id = s.id) + 1
  from public.submissions s join public.events e on e.id = s.event_id left join public.profiles p on p.id = s.user_id
  where auth.uid() is not null and p_code ~ '^[0-9a-f]{16}$' and s.invite_code = p_code;
$$;

create function public.join_submission(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_owner uuid; v_event uuid;
begin
  if auth.uid() is null or p_code !~ '^[0-9a-f]{16}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  select id, user_id, event_id into v_id, v_owner, v_event from public.submissions where invite_code = p_code;
  if v_id is null then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if v_owner = auth.uid() then return v_id; end if;
  if (select count(*) from public.submission_members where submission_id = v_id) >= 20 then
    raise exception 'too_many_coauthors' using errcode = 'P0001';
  end if;
  insert into public.submission_members (submission_id, user_id) values (v_id, auth.uid()) on conflict do nothing;
  insert into public.interests (user_id, event_id) values (auth.uid(), v_event) on conflict do nothing; -- çağrıyı takip et
  return v_id;
end;
$$;

/** Ortak yazar olduğum başvurular (kişisel notlar ve grup paylaşımı YOK). */
create function public.my_coauthored_submissions()
returns table (id uuid, event_id uuid, owner_name text, status text, paper_title text, submitted_at date, decision_at date,
               camera_ready_due date, registration_due date, presentation_at date, shared_notes text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.event_id, p.display_name, s.status, s.paper_title, s.submitted_at, s.decision_at,
         s.camera_ready_due, s.registration_due, s.presentation_at, s.shared_notes, s.updated_at
  from public.submission_members m join public.submissions s on s.id = m.submission_id left join public.profiles p on p.id = s.user_id
  where m.user_id = auth.uid()
  order by s.updated_at desc;
$$;

/** Bir başvurunun ekibi (sahip + ortak yazarlar; e-posta yok). */
create function public.submission_team(p_submission uuid)
returns table (user_id uuid, display_name text, academic_title text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_submission_party(p_submission) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.user_id, p.display_name, p.academic_title, 'owner'::text from public.submissions s left join public.profiles p on p.id = s.user_id where s.id = p_submission
    union all
    select m.user_id, p.display_name, p.academic_title, 'coauthor' from public.submission_members m left join public.profiles p on p.id = m.user_id where m.submission_id = p_submission;
end;
$$;

/** Ortak yazar: ortak alanları günceller (sahip tablo üzerinden zaten güncelleyebilir). */
create function public.update_shared_submission(
  p_submission uuid, p_status text, p_paper_title text, p_submitted_at date, p_decision_at date,
  p_camera_ready_due date, p_registration_due date, p_presentation_at date, p_shared_notes text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_submission_party(p_submission) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.submissions set
    status = p_status, paper_title = nullif(btrim(p_paper_title), ''), submitted_at = p_submitted_at, decision_at = p_decision_at,
    camera_ready_due = p_camera_ready_due, registration_due = p_registration_due, presentation_at = p_presentation_at,
    shared_notes = nullif(btrim(p_shared_notes), '')
  where id = p_submission;
end;
$$;

/** Sahip ortak yazarı çıkarır; ortak yazar kendini çıkarır. */
create function public.remove_coauthor(p_submission uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user <> auth.uid() and not exists (select 1 from public.submissions where id = p_submission and user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.submission_members where submission_id = p_submission and user_id = p_user;
end;
$$;

-- Ortak alan değişince diğer ekip üyelerine günde en fazla bir "başvuru güncellendi" mesajı
create function public.submission_team_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_by text;
begin
  if (old.status, old.paper_title, old.camera_ready_due, old.registration_due, old.presentation_at, old.shared_notes, old.decision_at)
     is not distinct from
     (new.status, new.paper_title, new.camera_ready_due, new.registration_due, new.presentation_at, new.shared_notes, new.decision_at) then
    return new;
  end if;
  select display_name into v_by from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, event_id, type, dedupe_key, payload)
  select u, new.event_id, 'coauthor_update',
         'co:' || new.id || ':' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD'),
         jsonb_build_object('by', v_by, 'status', new.status, 'paper', new.paper_title)
  from (select new.user_id as u union select user_id from public.submission_members where submission_id = new.id) t
  where u is distinct from auth.uid()
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end;
$$;
create trigger submission_team_notify after update on public.submissions
  for each row execute function public.submission_team_notify();

revoke all on function public.is_submission_party(uuid) from public, anon;
revoke all on function public.submission_invite_code(uuid, boolean) from public, anon;
revoke all on function public.submission_preview(text) from public, anon;
revoke all on function public.join_submission(text) from public, anon;
revoke all on function public.my_coauthored_submissions() from public, anon;
revoke all on function public.submission_team(uuid) from public, anon;
revoke all on function public.update_shared_submission(uuid, text, text, date, date, date, date, date, text) from public, anon;
revoke all on function public.remove_coauthor(uuid, uuid) from public, anon;
grant execute on function public.is_submission_party(uuid) to authenticated;
grant execute on function public.submission_invite_code(uuid, boolean) to authenticated;
grant execute on function public.submission_preview(text) to authenticated;
grant execute on function public.join_submission(text) to authenticated;
grant execute on function public.my_coauthored_submissions() to authenticated;
grant execute on function public.submission_team(uuid) to authenticated;
grant execute on function public.update_shared_submission(uuid, text, text, date, date, date, date, date, text) to authenticated;
grant execute on function public.remove_coauthor(uuid, uuid) to authenticated;
