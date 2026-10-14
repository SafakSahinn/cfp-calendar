-- Profil fotoğrafı: herkese KAPALI depo; herkes yalnızca kendi klasörüne (<kullanıcı id>/avatar.*) yazar ve onu okur.
-- Fotoğraf tarayıcıda 256×256'ya küçültülüp yüklenir (≈15–30 KB); sunucu tarafında 100 KB ve resim türü sınırı.
-- Fotoğraf yalnızca sahibine gösterilir (başka üyeler göremez), hesap silinince delete-account fonksiyonu siler.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 102400, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar: kendi fotoğrafını okur" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar: kendi klasörüne yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ '^[0-9a-f-]{36}/avatar\.(webp|jpg|png)$');
create policy "avatar: kendi fotoğrafını günceller" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ '^[0-9a-f-]{36}/avatar\.(webp|jpg|png)$');
create policy "avatar: kendi fotoğrafını siler" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Profil: yüklenen fotoğrafın yolu (null = yok → Google fotoğrafı ya da baş harfler). Yalnızca kendi klasörü olabilir.
alter table public.profiles add column avatar_path text
  check (avatar_path is null or (avatar_path ~ '^[0-9a-f-]{36}/avatar\.(webp|jpg|png)$' and split_part(avatar_path, '/', 1) = id::text));
grant update (avatar_path) on public.profiles to authenticated;
