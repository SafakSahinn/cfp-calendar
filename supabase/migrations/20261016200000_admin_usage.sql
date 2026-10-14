-- Yönetici paneli → İstatistikler: büyüme ve kullanım (yalnızca toplu sayılar; kişisel veri dönmez).

create function public.admin_usage_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return jsonb_build_object(
    -- Son 12 haftanın yeni üyeleri (Türkiye saatine göre pazartesi başlayan haftalar, boş haftalar 0)
    'signups_weekly', (
      select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'n', coalesce(c.n, 0)) order by w.week), '[]')
      from (
        select (date_trunc('week', (now() at time zone 'Europe/Istanbul')) - make_interval(weeks => g))::date as week
        from generate_series(0, 11) g
      ) w
      left join (
        select date_trunc('week', created_at at time zone 'Europe/Istanbul')::date as week, count(*)::int as n
        from auth.users group by 1
      ) c using (week)
    ),
    'top_events', (
      select coalesce(jsonb_agg(t order by t.n desc, t.title), '[]') from (
        select e.id, e.acronym, e.title, count(*)::int as n
        from public.interests i join public.events e on e.id = i.event_id
        where e.submission_deadline > now()
        group by e.id, e.acronym, e.title
        order by count(*) desc, e.title
        limit 10
      ) t
    ),
    'top_topics', (
      select coalesce(jsonb_agg(t order by t.n desc, t.topic), '[]') from (
        select topic, count(*)::int as n from public.interests where topic is not null
        group by topic order by count(*) desc, topic limit 10
      ) t
    ),
    'adoption', jsonb_build_object(
      'users',          (select count(*) from auth.users),
      'calendar',       (select count(*) from public.calendar_connections),
      'push_users',     (select count(distinct user_id) from public.push_subscriptions),
      'push_devices',   (select count(*) from public.push_subscriptions),
      'series_users',   (select count(distinct user_id) from public.series_follows),
      'topic_users',    (select count(distinct user_id) from public.interests where topic is not null),
      'group_users',    (select count(distinct user_id) from public.group_members),
      'submission_users', (select count(distinct user_id) from public.submissions),
      'comments_30d',   (select count(*) from public.group_comments where created_at > now() - interval '30 days')
    )
  );
end;
$$;
revoke all on function public.admin_usage_stats() from public, anon;
grant execute on function public.admin_usage_stats() to authenticated;
