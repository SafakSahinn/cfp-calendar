// Hesabı ve tüm kişisel verileri siler (KVKK / Google API kullanıcı verisi politikası gereği).
// POST { delete_calendar_entries?: boolean }
//
// Sıra: (isteğe bağlı) takvime eklenen kayıtları sil → Google iznini geri çek → kullanıcıyı sil.
// Kullanıcı silinince profiles, interests, notifications, calendar_* satırları ON DELETE CASCADE ile gider;
// profil fotoğrafı (avatars deposu) burada ayrıca silinir.

import { deleteAllEntries, revokeAccess } from '../_shared/calendar.ts';
import { adminClient, calendarEnv, corsHeaders, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = adminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const env = calendarEnv();
  const result: { calendar_entries_deleted: number; warnings: string[] } = { calendar_entries_deleted: 0, warnings: [] };

  // Takvim adımları başarısız olsa bile hesap silme devam eder.
  if (body.delete_calendar_entries) {
    try {
      result.calendar_entries_deleted = await deleteAllEntries(admin, env, user.id);
    } catch (e) {
      result.warnings.push(`calendar_entries: ${e}`);
    }
  }
  try {
    await revokeAccess(admin, env, user.id);
  } catch (e) {
    result.warnings.push(`revoke: ${e}`);
  }

  // Profil fotoğrafı (depodaki dosyalar kullanıcı silinince kendiliğinden gitmez)
  try {
    const { data: files } = await admin.storage.from('avatars').list(user.id);
    if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`));
  } catch (e) {
    result.warnings.push(`avatar: ${e}`);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message, ...result }, 500);
  return json({ ok: true, ...result });
});
