-- Yönetici paneli, elle eklenen etkinlikler, özet (abstract) takvim kaydı, geri bildirim sınırı.
--
-- Güvenlik modeli:
--  * admins / admin_audit tablolarında RLS açık ve HİÇ politika yok → istemci asla okuyamaz/yazamaz.
--    Yönetici yalnızca Supabase panelinden (SQL editor) veya service role ile atanır.
--  * Yönetici verisi sadece SECURITY DEFINER fonksiyonlarla gelir; her fonksiyon önce admin_assert() çağırır.
--  * Fonksiyonlarda search_path = '' ve tam nitelikli adlar (search_path ele geçirme saldırısına karşı).
--  * anon rolü hiçbir yönetici fonksiyonunu çalıştıramaz; her değişiklik ve kişisel veri görüntüleme kaydedilir.

-- ---------------------------------------------------------------------------
-- Yöneticiler ve işlem kaydı
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create table public.admin_audit (
  id         bigint generated always as identity primary key,
  admin_id   uuid references auth.users (id) on delete set null,
  action     text not null,
  target     text,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.admin_assert() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create function public.admin_log(p_action text, p_target text, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit (admin_id, action, target, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- Özet istatistikler
-- ---------------------------------------------------------------------------
create function public.admin_stats() returns jsonb
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
    'feedback_new',       (select count(*) from public.feedback where status = 'new'),
    'events_open',        (select count(*) from public.events where submission_deadline > now()),
    'events_manual',      (select count(*) from public.events where source = 'manual' and submission_deadline > now()),
    'last_sync',          (select max(last_seen_at) from public.events where source <> 'manual')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Üyeler (sadece gerekli alanlar; şifre/token gibi gizli veri asla dönmez)
-- ---------------------------------------------------------------------------
create function public.admin_list_users(p_search text default null)
returns table (
  id uuid, email text, display_name text, providers text[], created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed boolean, calendar_provider text, email_notifications boolean,
  followed integer, topics integer, is_admin boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  perform public.admin_log('list_users', null, jsonb_build_object('search', p_search));
  return query
    select u.id, u.email::text, p.display_name,
           coalesce(array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'providers')), '{}'),
           u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
           p.calendar_provider, coalesce(p.email_notifications, false),
           (select count(*)::int from public.interests i where i.user_id = u.id and i.event_id is not null),
           (select count(*)::int from public.interests i where i.user_id = u.id and i.topic is not null),
           exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p_search is null or p_search = ''
       or u.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
    order by u.created_at desc
    limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- Geri bildirimler
-- ---------------------------------------------------------------------------
alter table public.feedback
  add column admin_note text check (admin_note is null or length(admin_note) <= 1000),
  add column handled_by uuid references auth.users (id) on delete set null,
  add column handled_at timestamptz;

create function public.admin_list_feedback(p_status text default null)
returns table (
  id uuid, kind text, status text, message text, url text, created_at timestamptz, admin_note text, handled_at timestamptz,
  user_email text, event_id uuid, event_acronym text, event_title text, event_url text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query
    select f.id, f.kind, f.status, f.message, f.url, f.created_at, f.admin_note, f.handled_at,
           u.email::text, e.id, e.acronym, e.title, e.url
    from public.feedback f
    left join auth.users u on u.id = f.user_id
    left join public.events e on e.id = f.event_id
    where p_status is null or f.status = p_status
    order by f.created_at desc
    limit 500;
end;
$$;

create function public.admin_update_feedback(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  if p_status not in ('new', 'done', 'rejected') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.feedback
     set status = p_status, admin_note = nullif(left(p_note, 1000), ''), handled_by = auth.uid(), handled_at = now()
   where id = p_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  perform public.admin_log('update_feedback', p_id::text, jsonb_build_object('status', p_status));
end;
$$;

-- Kötüye kullanım sınırı: kullanıcı başına günde en fazla 20 geri bildirim
create function public.feedback_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limit' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger feedback_rate_limit before insert on public.feedback
  for each row execute function public.feedback_rate_limit();

-- ---------------------------------------------------------------------------
-- Elle eklenen etkinlikler (ör. Türk konferansları): source = 'manual'
-- Veri çekme işi bu kayıtlara dokunmaz (dedupe_key 'MANUAL-…' hiçbir kaynakla çakışmaz).
-- ---------------------------------------------------------------------------
create function public.admin_save_event(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := btrim(p ->> 'title');
  v_url text := nullif(btrim(p ->> 'url'), '');
  v_kind text := coalesce(p ->> 'kind', 'conference');
  v_deadline timestamptz := (p ->> 'submission_deadline')::timestamptz;
  v_topics text[] := coalesce(array(select jsonb_array_elements_text(p -> 'topics')), '{}');
  v_fields text[] := coalesce(array(select jsonb_array_elements_text(p -> 'fields')), '{}');
begin
  perform public.admin_assert();
  if v_title is null or length(v_title) < 3 or length(v_title) > 300 then raise exception 'invalid title' using errcode = '22023'; end if;
  if v_url is not null and v_url !~ '^https?://[^\s]+$' then raise exception 'invalid url' using errcode = '22023'; end if;
  if v_kind not in ('conference', 'workshop', 'journal') then raise exception 'invalid kind' using errcode = '22023'; end if;
  if v_deadline is null then raise exception 'deadline required' using errcode = '22023'; end if;
  if not (v_fields <@ array['cs', 'ee']) then raise exception 'invalid fields' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.events (
      dedupe_key, source, source_ids, kind, acronym, title, url, location, fields, topics, ranks, is_ieee,
      submission_open, abstract_deadline, submission_deadline, deadlines, deadline_tz, event_start, event_end
    ) values (
      'MANUAL-' || gen_random_uuid()::text, 'manual', '{}', v_kind,
      nullif(left(btrim(p ->> 'acronym'), 60), ''), v_title, v_url, nullif(left(btrim(p ->> 'location'), 200), ''),
      v_fields, v_topics, '{}', coalesce((p ->> 'is_ieee')::boolean, false),
      nullif(p ->> 'submission_open', '')::date, nullif(p ->> 'abstract_deadline', '')::timestamptz, v_deadline,
      jsonb_build_array(jsonb_build_object('deadline', v_deadline)), 'AoE',
      nullif(p ->> 'event_start', '')::date, nullif(p ->> 'event_end', '')::date
    ) returning id into v_id;
    perform public.admin_log('create_event', v_id::text, jsonb_build_object('title', v_title));
  else
    update public.events set
      kind = v_kind, acronym = nullif(left(btrim(p ->> 'acronym'), 60), ''), title = v_title, url = v_url,
      location = nullif(left(btrim(p ->> 'location'), 200), ''), fields = v_fields, topics = v_topics,
      is_ieee = coalesce((p ->> 'is_ieee')::boolean, false),
      submission_open = nullif(p ->> 'submission_open', '')::date,
      abstract_deadline = nullif(p ->> 'abstract_deadline', '')::timestamptz,
      submission_deadline = v_deadline, deadlines = jsonb_build_array(jsonb_build_object('deadline', v_deadline)),
      event_start = nullif(p ->> 'event_start', '')::date, event_end = nullif(p ->> 'event_end', '')::date,
      updated_at = now()
    where id = v_id and source = 'manual';
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    perform public.admin_log('update_event', v_id::text, jsonb_build_object('title', v_title));
  end if;
  return v_id;
end;
$$;

create function public.admin_delete_event(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  perform public.admin_assert();
  delete from public.events where id = p_id and source = 'manual' returning title into v_title;
  if v_title is null then raise exception 'not found' using errcode = 'P0002'; end if;
  perform public.admin_log('delete_event', p_id::text, jsonb_build_object('title', v_title));
end;
$$;

create function public.admin_list_audit() returns table (created_at timestamptz, admin_email text, action text, target text, detail jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query
    select a.created_at, u.email::text, a.action, a.target, a.detail
    from public.admin_audit a left join auth.users u on u.id = a.admin_id
    order by a.created_at desc limit 200;
end;
$$;

-- Fonksiyon yetkileri: varsayılan PUBLIC yürütme hakkını kaldır, sadece giriş yapmış kullanıcılara ver
-- (fonksiyonların kendisi ayrıca yönetici kontrolü yapar).
revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_assert() from public, anon, authenticated;
revoke all on function public.admin_log(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.feedback_rate_limit() from public, anon, authenticated;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_list_users(text) from public, anon;
revoke all on function public.admin_list_feedback(text) from public, anon;
revoke all on function public.admin_update_feedback(uuid, text, text) from public, anon;
revoke all on function public.admin_save_event(jsonb) from public, anon;
revoke all on function public.admin_delete_event(uuid) from public, anon;
revoke all on function public.admin_list_audit() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_list_feedback(text) to authenticated;
grant execute on function public.admin_update_feedback(uuid, text, text) to authenticated;
grant execute on function public.admin_save_event(jsonb) to authenticated;
grant execute on function public.admin_delete_event(uuid) to authenticated;
grant execute on function public.admin_list_audit() to authenticated;

-- ---------------------------------------------------------------------------
-- Takvim: özet (abstract) son tarihi ayrı kayıt olarak
-- ---------------------------------------------------------------------------
alter table public.calendar_entries drop constraint calendar_entries_entry_type_check;
alter table public.calendar_entries add constraint calendar_entries_entry_type_check
  check (entry_type in ('submission_open', 'abstract', 'deadline', 'event_days'));

-- ---------------------------------------------------------------------------
-- Geri bildirim: kullanıcı yalnızca içerik alanlarını yazabilir; durum, yönetici notu, işleyen yönetici ve
-- iletim zamanı (notified_at) yalnızca yönetici fonksiyonları / service role tarafından değiştirilir.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.feedback from authenticated, anon;
grant insert (user_id, kind, event_id, url, message) on public.feedback to authenticated;
