-- CFP Takvim: ilk şema

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Etkinlikler (konferans, çalıştay, dergi özel sayısı)
-- ---------------------------------------------------------------------------
create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  dedupe_key          text not null unique,          -- ör. "AAAI-2027"
  source              text not null,                 -- en öncelikli kaynak
  source_ids          jsonb not null default '{}',   -- {"ccf":"aaai27","wikicfp":"12345"}
  kind                text not null check (kind in ('conference', 'workshop', 'journal')),
  acronym             text,
  title               text not null,
  url                 text,
  location            text,
  fields              text[] not null default '{}',  -- 'cs' | 'ee'
  topics              text[] not null default '{}',
  ranks               jsonb not null default '{}',   -- {"ccf":"A","core":"A*"}
  is_ieee             boolean not null default false,
  submission_open     date,                          -- bilinmiyorsa null → first_seen_at kullanılır
  abstract_deadline   timestamptz,
  submission_deadline timestamptz,
  deadlines           jsonb not null default '[]',   -- birden fazla tur: [{"deadline":"...","abstract":"...","comment":"..."}]
  deadline_tz         text,
  notification_date   date,
  event_start         date,
  event_end           date,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index events_deadline_idx on public.events (submission_deadline);
create index events_start_idx on public.events (event_start);
create index events_topics_idx on public.events using gin (topics);

-- ---------------------------------------------------------------------------
-- Profiller (auth.users ile 1-1)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  display_name        text,
  avatar_url          text,
  locale              text not null default 'tr' check (locale in ('tr', 'en')),
  calendar_provider   text check (calendar_provider in ('google', 'microsoft')),
  calendar_account    text,
  topic_notifications boolean not null default true,
  ics_token           uuid not null unique default gen_random_uuid(),
  created_at          timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- İlgi alanları: ya belirli bir etkinlik ya da bir konu
-- ---------------------------------------------------------------------------
create table public.interests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  event_id   uuid references public.events (id) on delete cascade,
  topic      text,
  created_at timestamptz not null default now(),
  check ((event_id is null) <> (topic is null)),
  unique (user_id, event_id),
  unique (user_id, topic)
);

-- ---------------------------------------------------------------------------
-- Takvim bağlantıları: şifreli token'lar, SADECE service role erişir
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  provider          text not null check (provider in ('google', 'microsoft')),
  refresh_token_enc text not null,
  access_token_enc  text,
  access_expires_at timestamptz,
  account_email     text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Takvime eklenmiş kayıtlar (güncelleme/silme için harici kimlik saklanır)
-- ---------------------------------------------------------------------------
create table public.calendar_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  entry_type  text not null check (entry_type in ('submission_open', 'deadline', 'event_days')),
  provider    text not null,
  external_id text,
  synced_hash text,
  status      text not null default 'active' check (status in ('active', 'removed_by_user')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, event_id, entry_type)
);

-- ---------------------------------------------------------------------------
-- Site içi bildirimler (metin istemcide i18n ile üretilir)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  event_id     uuid references public.events (id) on delete cascade,
  type         text not null check (type in ('submission_open', 'topic_match', 'dates_changed', 'deadline_reminder')),
  dedupe_key   text not null,
  payload      jsonb not null default '{}',
  response     text check (response in ('interested', 'not_interested')),
  responded_at timestamptz,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Satır bazlı yetki (RLS)
-- ---------------------------------------------------------------------------
alter table public.events               enable row level security;
alter table public.profiles             enable row level security;
alter table public.interests            enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_entries     enable row level security;
alter table public.notifications        enable row level security;

-- Site sadece üyelere açık
create policy "uyeler etkinlikleri okur" on public.events
  for select to authenticated using (true);

create policy "kendi profilini okur" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "kendi profilini gunceller" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, locale, topic_notifications) on public.profiles to authenticated;

create policy "kendi ilgilerini okur" on public.interests
  for select to authenticated using (user_id = auth.uid());
create policy "kendi ilgisini ekler" on public.interests
  for insert to authenticated with check (user_id = auth.uid());
create policy "kendi ilgisini siler" on public.interests
  for delete to authenticated using (user_id = auth.uid());

-- calendar_connections: hiç politika yok → istemci erişemez, service role erişir.

create policy "kendi takvim kayitlarini okur" on public.calendar_entries
  for select to authenticated using (user_id = auth.uid());

create policy "kendi bildirimlerini okur" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "kendi bildirimini okundu yapar" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Gelen kutusu anlık güncellensin
alter publication supabase_realtime add table public.notifications;
