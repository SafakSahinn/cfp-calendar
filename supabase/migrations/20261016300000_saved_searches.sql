-- Kayıtlı aramalar: filtre kombinasyonu kaydedilir; isteğe bağlı olarak uyan yeni çağrılar için mesaj gelir.

create table public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  filters    jsonb not null check (jsonb_typeof(filters) = 'object' and length(filters::text) <= 2000),
  notify     boolean not null default true,
  created_at timestamptz not null default now()
);
create index saved_searches_user_idx on public.saved_searches (user_id);
alter table public.saved_searches enable row level security;
create policy "kendi aramalarini okur" on public.saved_searches for select to authenticated using (user_id = auth.uid());
create policy "kendi aramasini ekler" on public.saved_searches for insert to authenticated with check (user_id = auth.uid());
create policy "kendi aramasini gunceller" on public.saved_searches for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "kendi aramasini siler" on public.saved_searches for delete to authenticated using (user_id = auth.uid());
revoke all on public.saved_searches from anon;
revoke update on public.saved_searches from authenticated;
grant update (name, notify, filters) on public.saved_searches to authenticated;

create function public.saved_searches_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 10 then
    raise exception 'too_many_searches' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger saved_searches_limit before insert on public.saved_searches
  for each row execute function public.saved_searches_limit();

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'submission_open', 'topic_match', 'dates_changed', 'deadline_reminder', 'announcement', 'group_recommendation',
  'series_new', 'group_comment', 'saved_search'
));
