-- Takvim aboneliği (ICS) adresini yenileme: adres yanlışlıkla paylaşılırsa kullanıcı eskisini geçersiz kılar.
create function public.regenerate_ics_token() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  update public.profiles set ics_token = v where id = auth.uid();
  return v;
end;
$$;
revoke all on function public.regenerate_ics_token() from public, anon;
grant execute on function public.regenerate_ics_token() to authenticated;
