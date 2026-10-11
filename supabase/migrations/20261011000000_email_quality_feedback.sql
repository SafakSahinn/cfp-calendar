-- E-posta bildirimleri, etkinlik kalite işaretleri, kullanıcı geri bildirimi

-- ---------------------------------------------------------------------------
-- E-posta bildirimleri
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column email_notifications boolean not null default true,
  add column email_token uuid not null unique default gen_random_uuid(); -- tek tıkla abonelikten çıkma

grant update (email_notifications) on public.profiles to authenticated;

alter table public.notifications add column emailed_at timestamptz;
create index notifications_email_pending_idx on public.notifications (created_at) where emailed_at is null;

-- ---------------------------------------------------------------------------
-- Kalite işaretleri: 'suspicious' (şüpheli/yağmacı olabilir) ve nedenleri
-- ---------------------------------------------------------------------------
alter table public.events add column flags text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Geri bildirim: etkinlik önerisi, hatalı bilgi bildirimi
-- ---------------------------------------------------------------------------
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  kind        text not null check (kind in ('suggest_event', 'wrong_info', 'other')),
  event_id    uuid references public.events (id) on delete set null,
  url         text check (url is null or length(url) <= 500),
  message     text not null check (length(message) between 3 and 2000),
  status      text not null default 'new' check (status in ('new', 'done', 'rejected')),
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "uye geri bildirim gonderir" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());
create policy "uye kendi geri bildirimlerini gorur" on public.feedback
  for select to authenticated using (user_id = auth.uid());
