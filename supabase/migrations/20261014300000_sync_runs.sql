-- Sistem durumu: her veri güncellemesinin (12 saatlik iş) kaydı + yönetici raporu durumu.
-- Tablolarda RLS açık ve politika yok: yalnızca service role (iş) yazar, yönetici RPC ile okur.

create table public.sync_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  trigger     text,                       -- schedule | workflow_dispatch
  ok          boolean,
  stats       jsonb not null default '{}', -- kaynak sayıları, değişen etkinlik, bildirim, e-posta…
  error       text
);
alter table public.sync_runs enable row level security;

create table public.app_state (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;

create function public.admin_sync_runs() returns table (
  started_at timestamptz, finished_at timestamptz, trigger text, ok boolean, stats jsonb, error text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query
    select r.started_at, r.finished_at, r.trigger, r.ok, r.stats, r.error
    from public.sync_runs r order by r.started_at desc limit 30;
end;
$$;
revoke all on function public.admin_sync_runs() from public, anon;
grant execute on function public.admin_sync_runs() to authenticated;

-- İstatistiklere grup / başvuru / son çalışma eklendi (dönüş tipi aynı: jsonb)
create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return jsonb_build_object(
    'users',              (select count(*) from auth.users),
    'users_new_7d',       (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_active_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'calendar_connected', (select count(*) from public.calendar_connections),
    'email_on',           (select count(*) from public.profiles where email_notifications),
    'follows',            (select count(*) from public.interests where event_id is not null),
    'groups',             (select count(*) from public.groups),
    'group_members',      (select count(*) from public.group_members),
    'submissions',        (select count(*) from public.submissions),
    'feedback_new',       (select count(*) from public.feedback where status = 'new'),
    'events_open',        (select count(*) from public.events where submission_deadline > now()),
    'events_manual',      (select count(*) from public.events where source = 'manual' and submission_deadline > now()),
    'last_sync',          (select max(finished_at) from public.sync_runs where ok),
    'last_sync_failed',   (select coalesce(not ok, false) from public.sync_runs where finished_at is not null order by started_at desc limit 1)
  );
end;
$$;
