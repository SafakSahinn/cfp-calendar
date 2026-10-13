-- Yönetim paneli: bakım hatırlatmaları (iş tarafından app_state 'maintenance' anahtarına yazılır)
create function public.admin_maintenance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return coalesce((select value || jsonb_build_object('updated_at', updated_at) from public.app_state where key = 'maintenance'), '{}');
end;
$$;
revoke all on function public.admin_maintenance() from public, anon;
grant execute on function public.admin_maintenance() to authenticated;
