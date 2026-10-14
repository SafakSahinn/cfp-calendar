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
  const { error: profErr } = await user.from('profiles')
    .update({ academic_title: 'assoc_prof', institution: 'Test Üniversitesi', department: 'Elektrik-Elektronik Müh.' }).eq('id', userId);
  check('üye unvan / kurum / bölüm girebilir', !profErr, profErr?.message);
  const { error: badTitle } = await user.from('profiles').update({ academic_title: 'kral' }).eq('id', userId);
  check('geçersiz unvan reddedilir', !!badTitle);
  const { error: longInst } = await user.from('profiles').update({ institution: 'x'.repeat(151) }).eq('id', userId);
  check('çok uzun kurum adı reddedilir', !!longInst);
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
  section('Google takvim bağlama (popup kod akışı)');
  const badCode = await fn(user, 'save-calendar-token', { provider: 'google', code: 'gecersiz-kod' });
  check('geçersiz Google kodu → 400 (Google token uç noktasına gidildi)', badCode.status === 400, badCode);
  const noToken = await fn(user, 'save-calendar-token', { provider: 'google' });
  check('kod/token olmadan → 400', noToken.status === 400, noToken.status);
  const { data: stillNoConn } = await db.from('calendar_connections').select('user_id').eq('user_id', userId);
  check('başarısız denemede bağlantı kaydedilmez', (stillNoConn ?? []).length === 0);

  // -------------------------------------------------------------------------
  section('Geri bildirim');
  const { error: fbErr } = await user.from('feedback').insert({
    user_id: userId, kind: 'suggest_event', url: 'https://example.org/conf', message: 'E2E test önerisi',
  });
  check('üye etkinlik önerebilir', !fbErr, fbErr?.message);
  const { error: fbForeign } = await user.from('feedback').insert({
    user_id: '00000000-0000-0000-0000-000000000000', kind: 'other', message: 'başkası adına',
  });
  check('üye başkası adına geri bildirim gönderemez', !!fbForeign);
  const { error: fbShort } = await user.from('feedback').insert({ user_id: userId, kind: 'other', message: 'x' });
  check('çok kısa mesaj reddedilir', !!fbShort);
  const { error: fbStatus } = await user.from('feedback').insert({ user_id: userId, kind: 'other', message: 'durumu kendim belirleyeyim', status: 'done' });
  check('üye geri bildirim durumunu kendisi belirleyemez', !!fbStatus, fbStatus?.message);
  const { error: fbNotified } = await user.from('feedback').insert({ user_id: userId, kind: 'other', message: 'yöneticiden gizle', notified_at: new Date().toISOString() });
  check('üye notified_at alanını yazamaz (yöneticiden gizleyemez)', !!fbNotified, fbNotified?.message);
  const { data: myFb } = await user.from('feedback').select('id, status');
  check('üye kendi geri bildirimini görür', (myFb ?? []).length === 1 && myFb![0].status === 'new', myFb);
  // Temizlik: test önerisi yöneticiye e-postayla gitmesin
  await db.from('feedback').delete().eq('user_id', userId);

  // -------------------------------------------------------------------------
  section('E-posta tercihleri ve abonelikten çıkma');
  check('e-posta bildirimleri varsayılan açık', profile.email_notifications === true);
  const { error: tokenErr } = await user.from('profiles').update({ email_token: crypto.randomUUID() }).eq('id', userId);
  check('üye abonelik token\'ını değiştiremez', !!tokenErr);
  const unsub = await fetch(`${URL}/functions/v1/unsubscribe?token=${profile.email_token}`);
  const unsubHtml = await unsub.text();
  const { data: afterUnsub } = await db.from('profiles').select('email_notifications').eq('id', userId).single();
  check('abonelikten çık bağlantısı → 200 + bildirimler kapandı', unsub.status === 200 && afterUnsub?.email_notifications === false && unsubHtml.includes('kapatıldı'), unsub.status);
  const unsubBad = await fetch(`${URL}/functions/v1/unsubscribe?token=${crypto.randomUUID()}`);
  check('geçersiz abonelik token\'ı → 404', unsubBad.status === 404, unsubBad.status);
  const { error: reEnable } = await user.from('profiles').update({ email_notifications: true }).eq('id', userId);
  check('üye e-posta bildirimlerini yeniden açabilir', !reEnable, reEnable?.message);

  // -------------------------------------------------------------------------
  section('Kalite işaretleri');
  const { data: flagged } = await user.from('events').select('id, flags').neq('flags', '{}').limit(5);
  check('işaretli etkinlikler var ve flags dizisi dolu', (flagged ?? []).length > 0 && flagged!.every((e) => e.flags.length > 0), flagged?.length);
  const { data: n3 } = await user.from('notifications').select('event_id, events (flags)').eq('type', 'topic_match');
  check('konu bildirimleri işaretli (dikkat) etkinlik içermez',
    (n3 ?? []).every((n) => ((n as unknown as { events: { flags: string[] } | null }).events?.flags ?? []).length === 0));

  // -------------------------------------------------------------------------
  section('Yönetici yetkisi: yönetici OLMAYAN kullanıcı');
  const { data: notAdmin } = await user.rpc('is_admin');
  check('is_admin() → false', notAdmin === false, notAdmin);
  const adminRpcs: [string, Record<string, unknown>][] = [
    ['admin_stats', {}],
    ['admin_list_users', { p_search: null }],
    ['admin_list_feedback', { p_status: null }],
    ['admin_update_feedback', { p_id: crypto.randomUUID(), p_status: 'done', p_note: null }],
    ['admin_save_event', { p: { title: 'Saldırı', submission_deadline: '2030-01-01T00:00:00Z', fields: [], topics: [] } }],
    ['admin_delete_event', { p_id: later.id }],
    ['admin_list_audit', {}],
    ['admin_sync_runs', {}],
  ];
  for (const [fnName, args] of adminRpcs) {
    const { data: d, error: e } = await user.rpc(fnName, args);
    check(`üye ${fnName} çalıştıramaz`, !!e && d == null, e?.message ?? d);
  }
  for (const [fnName, args] of adminRpcs) {
    const { error: e } = await anon.rpc(fnName, args);
    check(`giriş yapmamış kişi ${fnName} çalıştıramaz`, !!e, e?.message);
  }
  for (const internal of ['admin_assert', 'admin_log']) {
    const { error: e } = await user.rpc(internal, internal === 'admin_log' ? { p_action: 'x', p_target: null, p_detail: {} } : {});
    check(`iç fonksiyon ${internal} dışarıdan çağrılamaz`, !!e, e?.message);
  }
  const { data: admRows } = await user.from('admins').select('*');
  check('admins tablosu okunamaz', (admRows ?? []).length === 0);
  const { error: selfPromote } = await user.from('admins').insert({ user_id: userId });
  check('üye kendini yönetici yapamaz', !!selfPromote);
  const { data: stillNot } = await user.rpc('is_admin');
  check('kendini yükseltme denemesinden sonra hâlâ yönetici değil', stillNot === false);
  const { data: runRows } = await user.from('sync_runs').select('*');
  const { data: stateRows } = await user.from('app_state').select('*');
  check('sistem durumu ve uygulama ayarları okunamaz', (runRows ?? []).length === 0 && (stateRows ?? []).length === 0);
  const { data: auditRows } = await user.from('admin_audit').select('*');
  check('işlem kaydı okunamaz', (auditRows ?? []).length === 0);
  const { data: survived } = await db.from('events').select('id').eq('id', later.id);
  check('yetkisiz silme denemesi etkinliği silmedi', (survived ?? []).length === 1);

  // -------------------------------------------------------------------------
  section('Geri bildirim gönderim sınırı');
  const burst = Array.from({ length: 20 }, (_, i) => ({ user_id: userId, kind: 'other', message: `sınır testi ${i}` }));
  const { error: burstErr } = await user.from('feedback').insert(burst);
  check('günde 20 geri bildirim kabul edilir', !burstErr, burstErr?.message);
  const { error: overErr } = await user.from('feedback').insert({ user_id: userId, kind: 'other', message: '21. bildirim' });
  check('21. geri bildirim reddedilir', !!overErr && /rate_limit/.test(overErr.message), overErr?.message);
  await db.from('feedback').delete().eq('user_id', userId);

  // -------------------------------------------------------------------------
  section('Yönetici yetkisi: yönetici kullanıcı');
  await db.from('admins').insert({ user_id: userId }); // yalnızca service role atayabilir
  const { data: isAdm } = await user.rpc('is_admin');
  check('service role ile atanınca is_admin() → true', isAdm === true);
  const { data: stats, error: statsErr } = await user.rpc('admin_stats');
  check('yönetici istatistikleri görür', !statsErr && typeof stats?.users === 'number' && stats.users >= 1, statsErr?.message);
  const { data: runsAdm, error: runsErr } = await user.rpc('admin_sync_runs');
  check('yönetici sistem durumunu (güncelleme kayıtları) görür', !runsErr && Array.isArray(runsAdm) && runsAdm.length > 0, runsErr?.message);
  check('istatistiklerde grup ve başvuru sayıları', typeof stats?.groups === 'number' && typeof stats?.submissions === 'number');
  const { data: users, error: usersErr } = await user.rpc('admin_list_users', { p_search: 'e2e-' });
  const me = (users ?? []).find((u: { id: string }) => u.id === userId);
  check('yönetici üyeleri listeler (arama çalışır)', !usersErr && !!me && me.email === email && me.is_admin === true, usersErr?.message);
  check('yönetici üye listesinde unvan ve kurum görünür', me?.academic_title === 'assoc_prof' && me?.institution === 'Test Üniversitesi', me && { t: me.academic_title, i: me.institution });
  const allowedCols = ['id', 'email', 'display_name', 'academic_title', 'institution', 'department', 'providers', 'created_at', 'last_sign_in_at', 'email_confirmed',
    'calendar_provider', 'email_notifications', 'followed', 'topics', 'is_admin'];
  check('üye listesi gizli alan içermez (token, şifre vb.)', !!me && Object.keys(me).every((k) => allowedCols.includes(k)), me && Object.keys(me));
  check('üye listesinde takip sayısı doğru', me?.followed >= 2, me?.followed);

  const { data: newEventId, error: saveErr } = await user.rpc('admin_save_event', { p: {
    title: 'E2E Test Kurultayı', acronym: 'E2ETK 2027', kind: 'conference', url: 'https://example.org/e2etk',
    location: 'Ankara, Türkiye', submission_deadline: '2027-03-01T23:59:59-12:00', abstract_deadline: '2027-02-20T23:59:59-12:00',
    event_start: '2027-06-01', event_end: '2027-06-03', topics: ['vlsi'], fields: ['ee'], is_ieee: true,
  } });
  check('yönetici etkinlik ekler', !saveErr && typeof newEventId === 'string', saveErr?.message);
  const { data: manual } = await user.from('events').select('source, dedupe_key, title, topics, abstract_deadline, series_key').eq('id', newEventId).single();
  check('elle eklenen etkinlik: source=manual, MANUAL- anahtarı', manual?.source === 'manual' && manual.dedupe_key.startsWith('MANUAL-'), manual);
  check('elle eklenen konferans seriye bağlanır ("E2ETK 2027" → E2ETK)', manual?.series_key === 'E2ETK', manual?.series_key);
  const { error: badUrl } = await user.rpc('admin_save_event', { p: { title: 'Kötü bağlantı', url: 'javascript:alert(1)', submission_deadline: '2027-03-01T00:00:00Z', fields: [], topics: [] } });
  check('geçersiz (javascript:) bağlantı reddedilir', !!badUrl, badUrl?.message);
  const { error: badFields } = await user.rpc('admin_save_event', { p: { title: 'Kötü alan', submission_deadline: '2027-03-01T00:00:00Z', fields: ['xx'], topics: [] } });
  check('geçersiz alan reddedilir', !!badFields);
  const { error: noDeadline } = await user.rpc('admin_save_event', { p: { title: 'Tarihsiz', fields: [], topics: [] } });
  check('son tarihsiz etkinlik reddedilir', !!noDeadline);
  const { error: editForeign } = await user.rpc('admin_save_event', { p: { id: later.id, title: 'Kaynak etkinliğini ezme', submission_deadline: '2027-03-01T00:00:00Z', fields: [], topics: [] } });
  check('yönetici kaynaktan gelen etkinliği düzenleyemez (sadece manual)', !!editForeign);
  const { error: delForeign } = await user.rpc('admin_delete_event', { p_id: later.id });
  check('yönetici kaynaktan gelen etkinliği silemez', !!delForeign);

  const { data: fbId } = await user.from('feedback').insert({ user_id: userId, kind: 'wrong_info', event_id: later.id, message: 'E2E hata bildirimi' }).select('id').single();
  const { data: fbList } = await user.rpc('admin_list_feedback', { p_status: 'new' });
  const mine = (fbList ?? []).find((f: { id: string }) => f.id === fbId?.id);
  check('yönetici geri bildirimi görür (gönderen + etkinlik)', mine?.user_email === email && mine?.event_id === later.id, mine);
  const { error: updErr } = await user.rpc('admin_update_feedback', { p_id: fbId?.id, p_status: 'done', p_note: 'düzeltildi' });
  const { data: fbAfter } = await db.from('feedback').select('status, admin_note, handled_by').eq('id', fbId?.id).single();
  check('yönetici geri bildirimi "yapıldı" yapar', !updErr && fbAfter?.status === 'done' && fbAfter.handled_by === userId, updErr?.message ?? fbAfter);
  const { error: badStatus } = await user.rpc('admin_update_feedback', { p_id: fbId?.id, p_status: 'hacked', p_note: null });
  check('geçersiz durum reddedilir', !!badStatus);

  const { error: delErr } = await user.rpc('admin_delete_event', { p_id: newEventId });
  check('yönetici kendi eklediği etkinliği siler', !delErr, delErr?.message);
  const { data: audit } = await user.rpc('admin_list_audit');
  const actions = new Set((audit ?? []).filter((a: { admin_email: string }) => a.admin_email === email).map((a: { action: string }) => a.action));
  check('tüm yönetici işlemleri kayda geçti', ['list_users', 'create_event', 'update_feedback', 'delete_event'].every((a) => actions.has(a)), [...actions]);
  await db.from('feedback').delete().eq('user_id', userId);
  await db.from('admins').delete().eq('user_id', userId);
  const { data: demoted } = await user.rpc('is_admin');
  check('yöneticilik kaldırılınca erişim anında kapanır', demoted === false);
  const { error: afterDemote } = await user.rpc('admin_stats');
  check('kaldırıldıktan sonra admin_stats reddedilir', !!afterDemote);

  // -------------------------------------------------------------------------
  section('Hesap silme');
  const avPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const { error: avUp } = await user.storage.from('avatars').upload(`${userId}/avatar-0123456789abcdef.png`, avPng, { contentType: 'image/png' });
  check('silmeden önce profil fotoğrafı yüklendi', !avUp, avUp?.message);
  const del = await fn(user, 'delete-account', { delete_calendar_entries: true });
  check('hesap silme → 200', del.status === 200, del);
  const { data: gone } = await db.auth.admin.getUserById(userId);
  check('kullanıcı silindi', !gone?.user);
  const { count: leftNotifs } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: leftInterests } = await db.from('interests').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: leftProfile } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
  check('tüm kullanıcı verisi silindi', leftNotifs === 0 && leftInterests === 0 && leftProfile === 0, { leftNotifs, leftInterests, leftProfile });
  const { data: avLeft } = await db.storage.from('avatars').list(userId);
  check('hesap silinince profil fotoğrafı da depodan silindi', (avLeft ?? []).length === 0, avLeft);
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
