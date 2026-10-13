-- Başvuru takibi: kişinin bir çağrıya yaptığı/planladığı başvurunun durumu.
-- Gizlilik: kayıtları yalnızca sahibi görür/değiştirir. Kişi başvuruyu belirli gruplarla paylaşabilir; o grupların
-- SAHİBİ (danışman) group_submissions() ile durumu görür — kişisel notlar asla paylaşılmaz.

create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id         uuid not null references public.events (id) on delete cascade,
  status           text not null default 'planning' check (status in (
                     'planning', 'submitted', 'under_review', 'revision', 'accepted', 'rejected', 'withdrawn')),
  paper_title      text check (paper_title is null or length(paper_title) <= 300),
  notes            text check (notes is null or length(notes) <= 2000),
  submitted_at     date,
  decision_at      date,
  shared_group_ids uuid[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, event_id)
);
create index submissions_user_idx on public.submissions (user_id);
create index submissions_groups_idx on public.submissions using gin (shared_group_ids);

alter table public.submissions enable row level security;
create policy "kendi basvurularini okur" on public.submissions for select to authenticated using (user_id = auth.uid());
create policy "kendi basvurusunu ekler" on public.submissions for insert to authenticated with check (user_id = auth.uid());
create policy "kendi basvurusunu gunceller" on public.submissions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "kendi basvurusunu siler" on public.submissions for delete to authenticated using (user_id = auth.uid());
revoke all on public.submissions from anon;

-- Paylaşılan gruplar yalnızca kişinin ÜYESİ olduğu gruplar olabilir; durum değişince tarihler otomatik dolar.
create function public.submissions_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.shared_group_ids) g
    where not exists (select 1 from public.group_members m where m.group_id = g and m.user_id = new.user_id)
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  new.shared_group_ids := array(select distinct unnest(new.shared_group_ids));
  if new.status in ('submitted', 'under_review', 'revision', 'accepted', 'rejected') and new.submitted_at is null then
    new.submitted_at := current_date;
  end if;
  if new.status in ('accepted', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.decision_at is null then
    new.decision_at := current_date;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger submissions_before_write before insert or update on public.submissions
  for each row execute function public.submissions_before_write();
revoke all on function public.submissions_before_write() from public, anon, authenticated;

-- Gruptan ayrılan/çıkarılan üyenin paylaşımı o gruptan otomatik kalkar
create function public.group_member_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.submissions set shared_group_ids = array_remove(shared_group_ids, old.group_id)
   where user_id = old.user_id and old.group_id = any (shared_group_ids);
  return old;
end;
$$;
create trigger group_member_removed after delete on public.group_members
  for each row execute function public.group_member_removed();
revoke all on function public.group_member_removed() from public, anon, authenticated;

/** Danışman görünümü: yalnızca grup SAHİBİ; yalnızca bu grupla paylaşılmış başvurular; notlar dönmez. */
create function public.group_submissions(p_group uuid)
returns table (
  user_id uuid, display_name text, academic_title text, event_id uuid, event_acronym text, event_title text,
  submission_deadline timestamptz, notification_date date, status text, paper_title text,
  submitted_at date, decision_at date, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_group_owner(p_group) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select s.user_id, p.display_name, p.academic_title, e.id, e.acronym, e.title, e.submission_deadline, e.notification_date,
           s.status, s.paper_title, s.submitted_at, s.decision_at, s.updated_at
    from public.submissions s
    join public.events e on e.id = s.event_id
    join public.group_members m on m.group_id = p_group and m.user_id = s.user_id
    left join public.profiles p on p.id = s.user_id
    where p_group = any (s.shared_group_ids)
    order by s.updated_at desc;
end;
$$;
revoke all on function public.group_submissions(uuid) from public, anon;
grant execute on function public.group_submissions(uuid) to authenticated;
