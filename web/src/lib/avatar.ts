// Profil fotoğrafı: tarayıcıda kare kırpıp 256×256'ya küçültme, kapalı depoya yükleme, onay akışı.
// Sahibi kendi son yüklediğini her zaman görür; grup arkadaşları yalnızca yönetici onaylı fotoğrafı görür.

import { useEffect, useMemo, useState } from 'react';
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

// ---------------------------------------------------------------------------
// Yükleme / kaldırma (her yükleme benzersiz ad: onaylı dosyanın üzerine yazılmaz)
// ---------------------------------------------------------------------------

const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

export async function uploadAvatar(userId: string, blob: Blob): Promise<void> {
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar-${randomHex()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type, cacheControl: '86400' });
  if (error) throw error;
  const { data: old, error: rpcErr } = await supabase.rpc('set_avatar', { p_path: path });
  if (rpcErr) {
    await supabase.storage.from('avatars').remove([path]);
    throw rpcErr;
  }
  if (old) await supabase.storage.from('avatars').remove([old as string]); // onaylanmamış önceki yükleme
  clearAvatarCache();
}

export async function removeAvatar(): Promise<void> {
  const { data, error } = await supabase.rpc('clear_avatar');
  if (error) throw error;
  const paths = (data ?? []) as string[];
  if (paths.length) await supabase.storage.from('avatars').remove(paths);
  clearAvatarCache();
}

// ---------------------------------------------------------------------------
// Gösterim: kapalı depodan imzalı (süreli) adresler, oturum boyunca önbellekte
// ---------------------------------------------------------------------------

const URL_TTL = 3600; // saniye
const signed = new Map<string, { url: string; until: number }>();

export function clearAvatarCache() {
  signed.clear();
  listeners.forEach((l) => l());
}
const listeners = new Set<() => void>();

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const missing = paths.filter((p) => (signed.get(p)?.until ?? 0) <= now);
  if (missing.length) {
    const { data } = await supabase.storage.from('avatars').createSignedUrls(missing, URL_TTL);
    for (const r of data ?? []) if (r.signedUrl && r.path) signed.set(r.path, { url: r.signedUrl, until: now + (URL_TTL - 120) * 1000 });
  }
  return new Map(paths.filter((p) => signed.has(p)).map((p) => [p, signed.get(p)!.url]));
}

/** Kendi fotoğrafım: son yüklenen (onay bekliyor olsa da) → Google fotoğrafı → null (baş harfler). */
export function useAvatarSrc(profile: { avatar_path: string | null; avatar_url: string | null } | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const path = profile?.avatar_path ?? null;
  const google = profile?.avatar_url ?? null;
  useEffect(() => {
    const l = () => setTick((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setSrc(google);
      return;
    }
    signedUrls([path]).then((m) => alive && setSrc(m.get(path) ?? google));
    return () => {
      alive = false;
    };
  }, [path, google, tick]);
  return src;
}

/** Grup arkadaşlarının ONAYLI fotoğrafları (kendim için son yüklediğim): kullanıcı id → adres. */
export function usePeerAvatars(userIds: string[]): Map<string, string> {
  const key = useMemo(() => [...new Set(userIds)].sort().join(','), [userIds]);
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) return setMap(new Map());
    (async () => {
      const { data } = await supabase.rpc('peer_avatar_paths', { p_users: ids });
      const rows = (data ?? []) as { user_id: string; path: string }[];
      const urls = await signedUrls(rows.map((r) => r.path));
      if (alive) setMap(new Map(rows.filter((r) => urls.has(r.path)).map((r) => [r.user_id, urls.get(r.path)!])));
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr');
}
