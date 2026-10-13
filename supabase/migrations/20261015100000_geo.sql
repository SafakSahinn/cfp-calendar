-- Harita görünümü: etkinlik konumlarının koordinatları + konum çözümleme önbelleği.

alter table public.events add column lat double precision, add column lng double precision;

-- Sadece arka plan işi (service role) kullanır; politika yok → istemciler erişemez.
create table public.geocache (
  query        text primary key,
  lat          double precision,
  lng          double precision,
  display_name text,
  ok           boolean not null,
  looked_up_at timestamptz not null default now()
);
alter table public.geocache enable row level security;
revoke all on public.geocache from anon, authenticated;
