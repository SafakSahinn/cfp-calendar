// Profil fotoğrafı: tarayıcıda kare kırpıp 256×256'ya küçültme, kapalı depoya yükleme, yalnızca sahibine gösterme.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const AVATAR_SIZE = 256;
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB'tan büyük dosyayı işlemeye bile çalışma
const MAX_OUTPUT_BYTES = 100 * 1024; // depo sınırıyla aynı

/** Fotoğrafı ortadan kare kırpıp 256×256 WebP'ye (desteklenmezse JPEG) çevirir; telefon fotoğrafının yönünü düzeltir. */
export async function resizeToAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  if (file.size > MAX_INPUT_BYTES) throw new Error('too_large');
  let src: CanvasImageSource & { width: number; height: number };
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('unsupported');
  }
  const side = Math.min(src.width, src.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  // Bazı Safari sürümleri WebP üretemez (PNG döndürür): o zaman JPEG
  let blob = await toBlob('image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  if (!blob) throw new Error('unsupported');
  if (blob.size > MAX_OUTPUT_BYTES) blob = (await toBlob('image/jpeg', 0.6)) ?? blob;
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('too_large');
  return blob;
}

// Oturum boyunca indirilen fotoğraflar (yol → tarayıcı içi adres); yeniden yüklemede temizlenir
const cache = new Map<string, Promise<string | null>>();

export function clearAvatarCache() {
  cache.clear();
}

export async function uploadAvatar(userId: string, blob: Blob, previousPath: string | null): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '3600' });
  if (error) throw error;
  if (previousPath && previousPath !== path) await supabase.storage.from('avatars').remove([previousPath]);
  clearAvatarCache();
  return path;
}

export async function removeAvatar(path: string) {
  await supabase.storage.from('avatars').remove([path]);
  clearAvatarCache();
}

/** Gösterilecek fotoğraf: yüklenen (kapalı depodan) → Google fotoğrafı → null (baş harfler). */
export function useAvatarSrc(profile: { avatar_path: string | null; avatar_url: string | null } | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const path = profile?.avatar_path ?? null;
  const google = profile?.avatar_url ?? null;
  useEffect(() => {
    let alive = true;
    if (!path) {
      setSrc(google);
      return;
    }
    if (!cache.has(path)) {
      cache.set(path, supabase.storage.from('avatars').download(path).then(({ data }) => (data ? URL.createObjectURL(data) : null)));
    }
    cache.get(path)!.then((url) => alive && setSrc(url ?? google));
    return () => {
      alive = false;
    };
  }, [path, google]);
  return src;
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr');
}
