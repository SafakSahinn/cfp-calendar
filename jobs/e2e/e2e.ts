// Uçtan uca test: gerçek Supabase projesinde geçici bir kullanıcıyla tüm akışı dener, sonunda temizler.
// GitHub Actions'ta "Uçtan uca test" iş akışıyla çalışır (gizli anahtarlar gerekir).
//
// Denenenler: profil tetikleyicisi, RLS kuralları, kolon izinleri, ilgi alanları, dağıtım (bildirimler),
// "İlgileniyorum / İlgilenmiyorum" fonksiyonu, son tarih değişikliği bildirimi, ICS aboneliği, hesap silme.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from '../src/db.ts';
import { runDispatch } from '../src/dispatch.ts';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
if (!ANON) throw new Error('SUPABASE_ANON_KEY gerekli');

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.log(`  ✖ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}
const section = (title: string) => console.log(`\n▶ ${title}`);
const quiet = () => {};

const email = `e2e-${Date.now()}@cfp-calendar.test`;
const password = `E2e-${crypto.randomUUID()}`;
let userId = '';
let restoreDeadline: { id: string; deadline: string } | null = null;

async function fn(user: SupabaseClient, name: string, body: Record<string, unknown>) {
  const { data, error } = await user.functions.invoke(name, { body });
  let status = 200;
  if (error) status = (error as { context?: Response }).context?.status ?? 500;
  return { data, status };
}

try {
  // -------------------------------------------------------------------------
  section('Kayıt ve profil');
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: 'E2E Test' },
  });
  if (createErr) throw createErr;
  userId = created.user.id;
  const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
  check('profil tetikleyicisi satır oluşturdu', !!profile);
  check('ad metadata\'dan alındı', profile?.display_name === 'E2E Test', profile?.display_name);
  check('varsayılan dil tr', profile?.locale === 'tr');
  check('ICS token üretildi', /^[0-9a-f-]{36}$/.test(profile?.ics_token ?? ''));

  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await user.auth.signInWithPassword({ email, password });
  check('e-posta + şifre ile giriş', !signInErr, signInErr?.message);

  // -------------------------------------------------------------------------
  section('Yetki kuralları (RLS)');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: anonEvents } = await anon.from('events').select('id').limit(5);
  check('giriş yapmamış kişi etkinlik okuyamaz', (anonEvents ?? []).length === 0, anonEvents?.length);
  const { data: userEvents } = await user.from('events').select('id').limit(5);
  check('üye etkinlikleri okur', (userEvents ?? []).length === 5, userEvents?.length);
  const { data: conns } = await user.from('calendar_connections').select('*');
  check('üye takvim token tablosunu göremez', (conns ?? []).length === 0, conns?.length);
  const { data: otherProfiles } = await user.from('profiles').select('id').neq('id', userId);
  check('üye başkalarının profilini göremez', (otherProfiles ?? []).length === 0, otherProfiles?.length);

  const { error: providerErr } = await user.from('profiles').update({ calendar_provider: 'google' }).eq('id', userId);
  check('üye calendar_provider alanını değiştiremez', !!providerErr, providerErr?.message);
  const { error: localeErr } = await user.from('profiles').update({ locale: 'en' }).eq('id', userId);
  check('üye dilini değiştirebilir', !localeErr, localeErr?.message);
  await user.from('profiles').update({ locale: 'tr' }).eq('id', userId);

  const { error: foreignInterest } = await user
    .from('interests')
    .insert({ user_id: '00000000-0000-0000-0000-000000000000', topic: 'vlsi' });
  check('üye başkası adına ilgi ekleyemez', !!foreignInterest);

  // -------------------------------------------------------------------------
  section('İlgi alanları ve dağıtım');
  const now = Date.now();
  // Gerçek kullanıcıların takip etmediği etkinlikleri seç (onları etkilememek için)
  const { data: taken } = await db.from('interests').select('event_id').not('event_id', 'is', null);
  const takenIds = new Set((taken ?? []).map((r) => r.event_id));
  const { data: open } = await db
    .from('events')
    .select('id, acronym, submission_deadline, topics, kind')
    .gt('submission_deadline', new Date(now + 2 * 86_400_000).toISOString())
    .order('submission_deadline')
    .limit(400);
  const free = (open ?? []).filter((e) => !takenIds.has(e.id));
  const soon = free.find((e) => new Date(e.submission_deadline).getTime() < now + 7 * 86_400_000);
  const later = free.find((e) => new Date(e.submission_deadline).getTime() > now + 20 * 86_400_000 && e.id !== soon?.id);
  check('test için uygun etkinlikler bulundu', !!soon && !!later, { soon: soon?.acronym, later: later?.acronym });
  if (!soon || !later) throw new Error('Uygun etkinlik yok');

  const { error: intErr } = await user.from('interests').insert([
    { user_id: userId, topic: 'vlsi' },
    { user_id: userId, event_id: soon.id },
    { user_id: userId, event_id: later.id },
  ]);
  check('konu ve etkinlik takibi eklendi', !intErr, intErr?.message);

  await runDispatch(quiet);
  const { data: n1 } = await user.from('notifications').select('*');
  const notifs = n1 ?? [];
  const byType = (type: string, eventId?: string) =>
    notifs.filter((n) => n.type === type && (!eventId || n.event_id === eventId));
  check('takip edilen yakın etkinlik → "başvuru açık" mesajı', byType('submission_open', soon.id).length === 1);
  check('takip edilen uzak etkinlik → "başvuru açık" mesajı', byType('submission_open', later.id).length === 1);
  check('son tarihe <7 gün → hatırlatma mesajı', byType('deadline_reminder', soon.id).length === 1);
  check('uzak etkinliğe hatırlatma yok', byType('deadline_reminder', later.id).length === 0);
  const topicMatches = byType('topic_match');
  check('konu eşleşmesi mesajları geldi (1–15 arası)', topicMatches.length >= 1 && topicMatches.length <= 15, topicMatches.length);
  check('konu mesajları takip edilenleri içermez',
    topicMatches.every((n) => n.event_id !== soon.id && n.event_id !== later.id));
  check('konu mesajları seçilen konuyu taşır', topicMatches.every((n) => (n.payload.topics ?? []).includes('vlsi')));

  await runDispatch(quiet);
  const { count: afterRerun } = await user.from('notifications').select('id', { count: 'exact', head: true });
  check('dağıtım tekrar çalışınca mesaj çoğalmaz', afterRerun === notifs.length, { once: notifs.length, twice: afterRerun });

  // -------------------------------------------------------------------------
  section('Mesaj butonları');
  const { error: respErr } = await user.from('notifications').update({ response: 'interested' }).eq('id', topicMatches[0].id);
  check('üye "response" alanını doğrudan değiştiremez', !!respErr);
  const { error: readErr } = await user.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', topicMatches[0].id);
  check('üye mesajı okundu işaretleyebilir', !readErr, readErr?.message);

  const interested = await fn(user, 'respond', { notification_id: topicMatches[0].id, response: 'interested' });
  check('"İlgileniyorum" → 200', interested.status === 200, interested);
  const { data: followedNow } = await user.from('interests').select('event_id').eq('event_id', topicMatches[0].event_id);
  check('"İlgileniyorum" etkinliği takibe aldı', (followedNow ?? []).length === 1);
  const { data: n2 } = await user.from('notifications').select('response').eq('id', topicMatches[0].id).single();
  check('mesaja yanıt kaydedildi', n2?.response === 'interested', n2);

  if (topicMatches[1]) {
    const notInterested = await fn(user, 'respond', { notification_id: topicMatches[1].id, response: 'not_interested' });
    const { data: noFollow } = await user.from('interests').select('event_id').eq('event_id', topicMatches[1].event_id);
    check('"İlgilenmiyorum" → takibe almaz', notInterested.status === 200 && (noFollow ?? []).length === 0);
  }
  const foreign = await fn(user, 'respond', { notification_id: crypto.randomUUID(), response: 'interested' });
  check('başkasının / olmayan mesaja yanıt → 404', foreign.status === 404, foreign.status);
  const bad = await fn(user, 'respond', { notification_id: topicMatches[0].id, response: 'belki' });
  check('geçersiz yanıt → 400', bad.status === 400, bad.status);
  const noAuth = await fetch(`${URL}/functions/v1/respond`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, body: '{}' });
  check('oturumsuz istek → 401', noAuth.status === 401, noAuth.status);

  // -------------------------------------------------------------------------
  section('Son tarih değişikliği');
  restoreDeadline = { id: later.id, deadline: later.submission_deadline };
  const extended = new Date(new Date(later.submission_deadline).getTime() + 3 * 86_400_000).toISOString();
  await db.from('events').update({ submission_deadline: extended }).eq('id', later.id);
  await runDispatch(quiet);
  const { data: changed } = await user.from('notifications').select('payload').eq('type', 'dates_changed').eq('event_id', later.id);
  check('uzatılan son tarih → "tarih değişti" mesajı', (changed ?? []).length === 1, changed);
  if (changed?.[0]) {
    const p = changed[0].payload;
    check('mesaj eski ve yeni tarihi içerir',
      new Date(p.old_deadline).getTime() === new Date(later.submission_deadline).getTime() &&
      new Date(p.deadline).getTime() === new Date(extended).getTime(), p);
  }

  // -------------------------------------------------------------------------
  section('ICS aboneliği');
  const ics = await fetch(`${URL}/functions/v1/ics?token=${profile.ics_token}`);
  const text = await ics.text();
  check('ICS → 200 text/calendar', ics.status === 200 && (ics.headers.get('content-type') ?? '').includes('text/calendar'), ics.status);
  check('VCALENDAR yapısı', text.startsWith('BEGIN:VCALENDAR') && text.trimEnd().endsWith('END:VCALENDAR'));
  const vevents = (text.match(/BEGIN:VEVENT/g) ?? []).length;
  check('takip edilen etkinlikler için kayıtlar var', vevents >= 4, vevents);
  check('takip edilen etkinlik ICS\'de', text.includes(`UID:${later.id}-deadline@cfp-calendar`));
  const longLines = text.split('\r\n').filter((l) => new TextEncoder().encode(l).length > 75 * 4);
  check('satırlar katlanmış (RFC 5545)', longLines.length === 0, longLines.length);
  const badToken = await fetch(`${URL}/functions/v1/ics?token=${crypto.randomUUID()}`);
  check('geçersiz ICS token → 404', badToken.status === 404, badToken.status);

  // -------------------------------------------------------------------------
  section('Hesap silme');
  const del = await fn(user, 'delete-account', { delete_calendar_entries: true });
  check('hesap silme → 200', del.status === 200, del);
  const { data: gone } = await db.auth.admin.getUserById(userId);
  check('kullanıcı silindi', !gone?.user);
  const { count: leftNotifs } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: leftInterests } = await db.from('interests').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: leftProfile } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
  check('tüm kullanıcı verisi silindi', leftNotifs === 0 && leftInterests === 0 && leftProfile === 0, { leftNotifs, leftInterests, leftProfile });
  if (!gone?.user) userId = '';
} catch (e) {
  failures++;
  console.error('\n✖ Beklenmeyen hata:', e);
} finally {
  section('Temizlik');
  if (restoreDeadline) {
    await db.from('events').update({ submission_deadline: restoreDeadline.deadline }).eq('id', restoreDeadline.id);
    console.log('  son tarih eski hâline döndürüldü');
  }
  if (userId) {
    await db.auth.admin.deleteUser(userId);
    console.log('  test kullanıcısı silindi');
  }
}

console.log(failures === 0 ? '\n✅ Tüm uçtan uca kontroller geçti' : `\n❌ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
