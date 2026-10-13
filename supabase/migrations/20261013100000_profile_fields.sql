-- Profil: unvan/meslek, kurum, bölüm. Yönetici üye listesine de eklenir.

alter table public.profiles
  add column academic_title text check (academic_title is null or academic_title in (
    'prof', 'assoc_prof', 'asst_prof', 'lecturer', 'research_assistant', 'postdoc',
    'phd_student', 'msc_student', 'undergrad', 'engineer', 'researcher', 'other'
  )),
  add column institution text check (institution is null or length(institution) <= 150),
  add column department  text check (department is null or length(department) <= 150);

grant update (academic_title, institution, department) on public.profiles to authenticated;

-- Dönüş tipi değiştiği için fonksiyon yeniden oluşturulur (güvenlik kuralları aynı).
drop function public.admin_list_users(text);

create function public.admin_list_users(p_search text default null)
returns table (
  id uuid, email text, display_name text, academic_title text, institution text, department text,
  providers text[], created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed boolean, calendar_provider text, email_notifications boolean,
  followed integer, topics integer, is_admin boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  perform public.admin_log('list_users', null, jsonb_build_object('search', p_search));
  return query
    select u.id, u.email::text, p.display_name, p.academic_title, p.institution, p.department,
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
       or p.institution ilike '%' || p_search || '%'
    order by u.created_at desc
    limit 500;
end;
$$;

revoke all on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;
