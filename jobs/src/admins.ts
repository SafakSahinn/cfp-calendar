// Yönetici e-postalarının alıcıları: yönetici rolündeki herkes (admins tablosu → profil e-postası).
// Hiç yönetici yoksa yedek olarak ADMIN_EMAIL değişkeni. Her alıcıya ayrı e-posta gönderilir (birbirinin adresini görmez).

import { db } from './db.ts';

export async function adminRecipients(): Promise<string[]> {
  const { data: admins } = await db.from('admins').select('user_id');
  const ids = (admins ?? []).map((a) => a.user_id as string);
  let emails: string[] = [];
  if (ids.length) {
    const { data: profs } = await db.from('profiles').select('email').in('id', ids);
    emails = (profs ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e && /@/.test(e));
  }
  if (emails.length === 0 && process.env.ADMIN_EMAIL) emails = [process.env.ADMIN_EMAIL];
  return [...new Map(emails.map((e) => [e.trim().toLowerCase(), e.trim()])).values()];
}
