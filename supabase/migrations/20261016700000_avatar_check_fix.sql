-- Düzeltme: 20261016500000'deki avatar_path kuralı Postgres'te "profiles_check" adıyla oluşmuş (başka sütuna da
-- baktığı için tablo kuralı sayıldı); 20261016600000 onu adıyla bulamadı ve eski kural yeni benzersiz dosya adlarını
-- (avatar-<hex>.webp) reddetti. avatar_path'e bakan eski kuralları tanımından bulup kaldır; yeni kural kalır.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and conname <> 'profiles_avatar_paths_check'
      and pg_get_constraintdef(oid) ilike '%avatar_path%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end;
$$;
