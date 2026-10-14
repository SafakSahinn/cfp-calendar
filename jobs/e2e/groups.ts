// Uçtan uca test: gruplar, ortak takvim, duyurular — üç geçici kullanıcıyla (sahip, üye, dışarıdaki).
// Gizlilik ve yetki sınırlarını sınar; sonunda tüm kullanıcıları ve verileri temizler.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from '../src/db.ts';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.log(`  ✖ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}
const section = (title: string) => console.log(`\n▶ ${title}`);

const created: string[] = [];
async function tempUser(label: string, title: string): Promise<{ id: string; client: SupabaseClient; email: string }> {
  const email = `grp-${label}-${Date.now()}@cfp-calendar.test`;
  const password = `G-${crypto.randomUUID()}`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Test ${label}` } });
  if (error) throw error;
  created.push(data.user.id);
  await db.from('profiles').update({ academic_title: title, institution: 'Test Üniversitesi' }).eq('id', data.user.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw e;
  return { id: data.user.id, client, email };
}

let announcementId: string | null = null;

try {
  section('Hazırlık');
  const owner = await tempUser('sahip', 'assoc_prof');
  const member = await tempUser('uye', 'phd_student');
  const outsider = await tempUser('disari', 'msc_student');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: evs } = await db.from('events').select('id').gt('submission_deadline', new Date().toISOString()).order('submission_deadline').limit(3);
  const [ev1, ev2, ev3] = (evs ?? []).map((e) => e.id);
  check('3 kullanıcı + 3 etkinlik hazır', !!ev3);

  // -------------------------------------------------------------------------
  section('Grup oluşturma');
  const { data: gid, error: cErr } = await owner.client.rpc('create_group', { p_name: 'Test Laboratuvarı', p_description: 'e2e' });
  check('sahip grup oluşturur', !cErr && typeof gid === 'string', cErr?.message);
  const { error: shortName } = await owner.client.rpc('create_group', { p_name: 'x' });
  check('çok kısa grup adı reddedilir', !!shortName);
  const { error: anonCreate } = await anon.rpc('create_group', { p_name: 'Anonim grup' });
  check('giriş yapmamış kişi grup oluşturamaz', !!anonCreate);
  const { data: ownGroups } = await owner.client.from('groups').select('id, name');
  check('sahip grubu görür', (ownGroups ?? []).some((g) => g.id === gid));
  const { error: codeCol } = await owner.client.from('groups').select('invite_code');
  check('davet kodu kolonu doğrudan okunamaz (sahip için bile)', !!codeCol, codeCol?.message);
  const { data: code } = await owner.client.rpc('group_invite_code', { p_group: gid, p_regenerate: false });
  check('sahip davet kodunu alır (16 karakter)', typeof code === 'string' && code.length === 16, code);

  // -------------------------------------------------------------------------
  section('Dışarıdaki kullanıcı: hiçbir şey göremez');
  const { data: outGroups } = await outsider.client.from('groups').select('id').eq('id', gid);
  check('grubu göremez', (outGroups ?? []).length === 0);
  const { data: outMembers } = await outsider.client.from('group_members').select('user_id').eq('group_id', gid);
  check('üyeleri göremez', (outMembers ?? []).length === 0);
  const { error: outList } = await outsider.client.rpc('group_member_list', { p_group: gid });
  check('üye listesi fonksiyonu reddedilir', !!outList);
  const { error: outCode } = await outsider.client.rpc('group_invite_code', { p_group: gid, p_regenerate: false });
  check('davet kodunu alamaz', !!outCode);
  const { error: outAdd } = await outsider.client.rpc('group_add_event', { p_group: gid, p_event: ev1, p_note: null });
  check('gruba çağrı ekleyemez', !!outAdd);
  const { error: outInsert } = await outsider.client.from('group_members').insert({ group_id: gid, user_id: outsider.id, role: 'owner' });
  check('kendini doğrudan üye/sahip yapamaz', !!outInsert);
  const { error: outUpd } = await outsider.client.rpc('update_group', { p_group: gid, p_name: 'Ele geçirildi', p_description: null, p_members_can_post: true });
  check('grubu düzenleyemez', !!outUpd);
  const { error: outDel } = await outsider.client.rpc('delete_group', { p_group: gid });
  check('grubu silemez', !!outDel);
  const { data: badJoin, error: badJoinErr } = await outsider.client.rpc('join_group', { p_code: '0000000000000000' });
  check('yanlış davet koduyla katılamaz', !!badJoinErr && !badJoin, badJoinErr?.message);
  const { data: badPreview } = await outsider.client.rpc('group_preview', { p_code: 'yanlis' });
  check('yanlış kodla grup önizlemesi boş', (badPreview ?? []).length === 0);

  // -------------------------------------------------------------------------
  section('Davet bağlantısıyla katılma');
  const { data: preview } = await member.client.rpc('group_preview', { p_code: code });
  check('önizleme: grup adı ve üye sayısı', preview?.[0]?.name === 'Test Laboratuvarı' && preview[0].member_count === 1, preview);
  const { data: joinedId, error: jErr } = await member.client.rpc('join_group', { p_code: code });
  check('üye davet koduyla katılır', !jErr && joinedId === gid, jErr?.message);
  const { error: rejoin } = await member.client.rpc('join_group', { p_code: code });
  check('tekrar katılmak hata vermez (çift üyelik olmaz)', !rejoin);
  const { data: list } = await member.client.rpc('group_member_list', { p_group: gid });
  check('üye, üye listesini görür (2 kişi)', (list ?? []).length === 2, list?.length);
  const allowed = ['user_id', 'display_name', 'academic_title', 'institution', 'role', 'joined_at'];
  check('üye listesinde e-posta YOK', (list ?? []).every((m: Record<string, unknown>) => Object.keys(m).every((k) => allowed.includes(k)) && !JSON.stringify(m).includes('@')));
  check('sahibin unvanı görünür', (list ?? []).some((m: { role: string; academic_title: string }) => m.role === 'owner' && m.academic_title === 'assoc_prof'));
  const { data: myG } = await member.client.rpc('my_groups');
  check('üyenin "gruplarım" listesinde, rolü üye', myG?.[0]?.id === gid && myG[0].role === 'member', myG);
  const { error: memberCode } = await member.client.rpc('group_invite_code', { p_group: gid, p_regenerate: false });
  check('üye (sahip olmayan) davet kodunu alamaz', !!memberCode);

  // -------------------------------------------------------------------------
  section('Çağrı önerme ve ortak takvim');
  const { error: memberPost } = await member.client.rpc('group_add_event', { p_group: gid, p_event: ev1, p_note: 'deneme' });
  check('varsayılan: üye öneri yapamaz', !!memberPost);
  const { data: sent, error: postErr } = await owner.client.rpc('group_add_event', { p_group: gid, p_event: ev1, p_note: 'Tezinle uyumlu' });
  check('sahip öneri yapar → 1 üyeye mesaj', !postErr && sent === 1, postErr?.message ?? sent);
  const { error: dup } = await owner.client.rpc('group_add_event', { p_group: gid, p_event: ev1, p_note: null });
  check('aynı çağrı ikinci kez eklenemez', !!dup && /already_added/.test(dup.message), dup?.message);
  const { data: rec } = await member.client.from('notifications').select('id, type, payload, group_id, event_id').eq('type', 'group_recommendation');
  check('üyeye "grup önerisi" mesajı geldi (not + öneren)', rec?.length === 1 && rec[0].event_id === ev1 && rec[0].payload.note === 'Tezinle uyumlu' && rec[0].group_id === gid, rec);
  const { data: ownRec } = await owner.client.from('notifications').select('id').eq('type', 'group_recommendation');
  check('öneren kendine mesaj almaz', (ownRec ?? []).length === 0);
  const { data: outRec } = await outsider.client.from('notifications').select('id').eq('type', 'group_recommendation');
  check('dışarıdaki mesaj almaz', (outRec ?? []).length === 0);
  const { data: gEvents } = await member.client.from('group_events').select('event_id, note, events(id)').eq('group_id', gid);
  check('üye ortak takvimi görür', gEvents?.length === 1 && gEvents[0].event_id === ev1);
  const { data: outEvents } = await outsider.client.from('group_events').select('event_id').eq('group_id', gid);
  check('dışarıdaki ortak takvimi göremez', (outEvents ?? []).length === 0);

  const resp = await member.client.functions.invoke('respond', { body: { notification_id: rec![0].id, response: 'interested' } });
  const { data: followed } = await member.client.from('interests').select('event_id').eq('event_id', ev1);
  check('"İlgileniyorum" grup önerisinde de çalışır (takibe alır)', !resp.error && (followed ?? []).length === 1, resp.error?.message);

  await owner.client.rpc('update_group', { p_group: gid, p_name: 'Test Laboratuvarı', p_description: 'e2e', p_members_can_post: true });
  const { error: memberPost2 } = await member.client.rpc('group_add_event', { p_group: gid, p_event: ev2, p_note: null });
  check('ayar açılınca üye de öneri yapabilir', !memberPost2, memberPost2?.message);
  const { error: memberRemoveOwners } = await member.client.rpc('group_remove_event', { p_group: gid, p_event: ev1 });
  check('üye, sahibin önerisini kaldıramaz', !!memberRemoveOwners);
  const { error: memberRemoveOwn } = await member.client.rpc('group_remove_event', { p_group: gid, p_event: ev2 });
  check('üye kendi önerisini kaldırabilir', !memberRemoveOwn, memberRemoveOwn?.message);

  // -------------------------------------------------------------------------
  section('Grup takvimi aboneliği (ICS)');
  const { data: memberProfile } = await db.from('profiles').select('ics_token').eq('id', member.id).single();
  const { data: outProfile } = await db.from('profiles').select('ics_token').eq('id', outsider.id).single();
  const ics = await fetch(`${URL}/functions/v1/ics?token=${memberProfile!.ics_token}&group=${gid}`);
  const icsText = await ics.text();
  check('üye grup takvimine abone olur (grup adı + çağrı)', ics.status === 200 && icsText.includes('X-WR-CALNAME:CFP Calendar · Test Laboratuvarı') && icsText.includes(`UID:${ev1}-deadline`), ics.status);
  const icsOut = await fetch(`${URL}/functions/v1/ics?token=${outProfile!.ics_token}&group=${gid}`);
  check('dışarıdaki, kendi token\'ıyla bile grup takvimini alamaz', icsOut.status === 404, icsOut.status);
  const icsBad = await fetch(`${URL}/functions/v1/ics?token=${memberProfile!.ics_token}&group=x';drop`);
  check('geçersiz grup parametresi → 404', icsBad.status === 404, icsBad.status);

  // -------------------------------------------------------------------------
  section('Başvuru takibi ve danışman görünümü');
  const { data: subIns, error: subErr } = await member.client.from('submissions')
    .insert({ event_id: ev3, status: 'submitted', paper_title: 'Gizli Makale', notes: 'ÖZEL NOT', shared_group_ids: [gid] }).select().single();
  check('üye başvuru kaydı oluşturur (gruba paylaşımlı)', !subErr && subIns?.submitted_at != null, subErr?.message);
  const { data: outSubs } = await outsider.client.from('submissions').select('id');
  check('başkası başvuruyu göremez', (outSubs ?? []).length === 0);
  const { data: ownerSubsDirect } = await owner.client.from('submissions').select('id');
  check('grup sahibi tabloyu doğrudan okuyamaz', (ownerSubsDirect ?? []).length === 0);
  const { data: advisor, error: advErr } = await owner.client.rpc('group_submissions', { p_group: gid });
  check('danışman (grup sahibi) paylaşılan başvuruyu görür', !advErr && advisor?.length === 1 && advisor[0].paper_title === 'Gizli Makale' && advisor[0].status === 'submitted', advErr?.message ?? advisor);
  check('danışman görünümünde kişisel NOT YOK', !JSON.stringify(advisor).includes('ÖZEL NOT') && !Object.keys(advisor?.[0] ?? {}).includes('notes'));
  const { error: memberAdv } = await member.client.rpc('group_submissions', { p_group: gid });
  check('üye (sahip değil) danışman görünümünü açamaz', !!memberAdv);
  const { data: otherGid } = await outsider.client.rpc('create_group', { p_name: 'Başka Grup' });
  const { error: foreignShare } = await member.client.from('submissions').update({ shared_group_ids: [gid, otherGid] }).eq('id', subIns!.id);
  check('üyesi olmadığı grupla paylaşamaz', !!foreignShare && /not_a_member/.test(foreignShare.message), foreignShare?.message);
  const { data: advOther } = await outsider.client.rpc('group_submissions', { p_group: otherGid });
  check('başka grubun sahibi bu başvuruyu görmez', (advOther ?? []).length === 0);
  await member.client.from('submissions').insert({ event_id: ev2, status: 'planning', paper_title: 'Paylaşılmayan' });
  const { data: advisor2 } = await owner.client.rpc('group_submissions', { p_group: gid });
  check('paylaşılmayan başvuru danışmana görünmez', advisor2?.length === 1, advisor2?.length);
  await member.client.from('submissions').update({ status: 'accepted' }).eq('id', subIns!.id);
  const { data: accepted } = await member.client.from('submissions').select('decision_at').eq('id', subIns!.id).single();
  check('kabul edilince karar tarihi otomatik dolar', !!accepted?.decision_at);
  await db.from('groups').delete().eq('id', otherGid);

  // -------------------------------------------------------------------------
  section('Grupta kim başvuruyor (açık rıza ile)');
  const { data: ownerSees } = await owner.client.rpc('event_group_participants', { p_event: ev3 });
  check('grup sahibi (danışman) paylaşılan başvuruyu çağrı sayfasında görür', ownerSees?.length === 1 && ownerSees[0].user_id === member.id, ownerSees);
  const { error: outJoin } = await outsider.client.rpc('join_group', { p_code: code });
  check('üçüncü kişi gruba katılır', !outJoin, outJoin?.message);
  const { data: mateBefore } = await outsider.client.rpc('event_group_participants', { p_event: ev3 });
  check('izin yokken grup arkadaşı başvuruyu GÖRMEZ', (mateBefore ?? []).length === 0, mateBefore);
  const { data: countBefore } = await outsider.client.rpc('group_participation', { p_group: gid });
  check('izin yokken grup sayacında görünmez', (countBefore ?? []).length === 0, countBefore);
  await member.client.from('submissions').update({ share_with_members: true }).eq('id', subIns!.id);
  const { data: mateAfter } = await outsider.client.rpc('event_group_participants', { p_event: ev3 });
  check('izin verilince grup arkadaşı ad + durumu görür', mateAfter?.length === 1 && mateAfter[0].display_name === 'Test uye' && mateAfter[0].status === 'accepted', mateAfter);
  check('grup arkadaşı başlık/not GÖRMEZ', !JSON.stringify(mateAfter).includes('Gizli Makale') && !JSON.stringify(mateAfter).includes('ÖZEL NOT'));
  const { data: countAfter } = await outsider.client.rpc('group_participation', { p_group: gid });
  check('grup sayacı: çağrıda 1 kişi', countAfter?.length === 1 && countAfter[0].event_id === ev3 && countAfter[0].participants === 1, countAfter);
  const { data: selfSees } = await member.client.rpc('event_group_participants', { p_event: ev3 });
  check('kişi kendini listede görmez', (selfSees ?? []).length === 0);
  const { data: unsharedSees } = await outsider.client.rpc('event_group_participants', { p_event: ev2 });
  check('gruba paylaşılmamış başvuru görünmez', (unsharedSees ?? []).length === 0);
  await outsider.client.rpc('leave_group', { p_group: gid });
  const { data: leftSees } = await outsider.client.rpc('event_group_participants', { p_event: ev3 });
  check('gruptan ayrılan artık görmez', (leftSees ?? []).length === 0);
  const { error: leftCount } = await outsider.client.rpc('group_participation', { p_group: gid });
  check('üye olmayan grup sayacını açamaz', !!leftCount);
  const { error: anonPart } = await anon.rpc('event_group_participants', { p_event: ev3 });
  check('giriş yapmamış kişi göremez', !!anonPart);

  // -------------------------------------------------------------------------
  section('Grup yorumları');
  const { error: cErr1 } = await member.client.from('group_comments').insert({ group_id: gid, event_id: ev1, body: 'Ben de gönderiyorum' });
  check('üye grup takvimindeki çağrıya yorum yazar', !cErr1, cErr1?.message);
  await member.client.from('group_comments').insert({ group_id: gid, event_id: ev1, body: 'İkinci not' });
  const { data: ownerCn } = await owner.client.from('notifications').select('type, payload, group_id').eq('type', 'group_comment').eq('event_id', ev1);
  check('sahibe "grup yorumu" bildirimi: aynı gün aynı çağrı için TEK bildirim', ownerCn?.length === 1 && ownerCn[0].payload.note === 'Ben de gönderiyorum' && ownerCn[0].group_id === gid, ownerCn);
  const { data: selfCn } = await member.client.from('notifications').select('id').eq('type', 'group_comment');
  check('yorum yazan kendine bildirim almaz', (selfCn ?? []).length === 0);
  const { data: cList, error: cListErr } = await owner.client.rpc('group_comment_list', { p_group: gid });
  check('üyeler yorumları ad/unvanla görür (e-posta yok)', !cListErr && cList?.length === 2 && cList[0].display_name === 'Test uye' && !JSON.stringify(cList).includes('@'), cListErr?.message ?? cList);
  const { data: cOut } = await outsider.client.from('group_comments').select('id');
  check('dışarıdaki yorumları göremez', (cOut ?? []).length === 0);
  const { error: cOutList } = await outsider.client.rpc('group_comment_list', { p_group: gid });
  check('dışarıdaki yorum listesini açamaz', !!cOutList);
  const { error: cOutIns } = await outsider.client.from('group_comments').insert({ group_id: gid, event_id: ev1, body: 'sızma' });
  check('dışarıdaki yorum yazamaz', !!cOutIns);
  const { error: cNotInGroup } = await member.client.from('group_comments').insert({ group_id: gid, event_id: ev3, body: 'takvimde olmayan çağrı' });
  check('grup takviminde olmayan çağrıya yorum yazılamaz', !!cNotInGroup);
  const { data: ownerC } = await owner.client.from('group_comments').insert({ group_id: gid, event_id: ev1, body: 'Sahip notu' }).select('id').single();
  await member.client.from('group_comments').delete().eq('id', ownerC!.id);
  const { count: ownerCLeft } = await db.from('group_comments').select('*', { count: 'exact', head: true }).eq('id', ownerC!.id);
  check('üye başkasının yorumunu silemez', ownerCLeft === 1);
  const memberC = (cList ?? []).find((c: { body: string }) => c.body === 'İkinci not');
  await owner.client.from('group_comments').delete().eq('id', memberC.id);
  const { count: memberCLeft } = await db.from('group_comments').select('*', { count: 'exact', head: true }).eq('id', memberC.id);
  check('grup sahibi uygunsuz yorumu silebilir', memberCLeft === 0);
  const { error: cEmpty } = await member.client.from('group_comments').insert({ group_id: gid, event_id: ev1, body: '   ' });
  check('boş yorum reddedilir', !!cEmpty);
  let limitErr: string | null = null;
  for (let i = 0; i < 31 && !limitErr; i++) {
    const { error } = await member.client.from('group_comments').insert({ group_id: gid, event_id: ev1, body: `toplu ${i}` });
    if (error) limitErr = error.message;
  }
  check('günde 30 yorum sınırı', !!limitErr && /rate_limited/.test(limitErr), limitErr);

  // -------------------------------------------------------------------------
  section('Hatırlatma günleri');
  const { data: remDefault } = await member.client.from('profiles').select('reminder_days').eq('id', member.id).single();
  check('varsayılan hatırlatma: 7 gün', JSON.stringify(remDefault?.reminder_days) === '[7]', remDefault);
  const { error: remOk } = await member.client.from('profiles').update({ reminder_days: [14, 3, 1] }).eq('id', member.id);
  check('üye hatırlatma günlerini seçer (14/3/1)', !remOk, remOk?.message);
  const { error: remBad } = await member.client.from('profiles').update({ reminder_days: [5] }).eq('id', member.id);
  check('izin verilmeyen gün (5) reddedilir', !!remBad);
  const { error: remNone } = await member.client.from('profiles').update({ reminder_days: [] }).eq('id', member.id);
  check('hatırlatmalar tamamen kapatılabilir', !remNone, remNone?.message);

  // -------------------------------------------------------------------------
  section('Seri takibi');
  const { error: sErr } = await member.client.from('series_follows').insert({ series_key: 'ICASSP', label: 'ICASSP' });
  check('üye seriyi takip eder', !sErr, sErr?.message);
  const { error: sBad } = await member.client.from('series_follows').insert({ series_key: 'bad key;--' });
  check('geçersiz seri anahtarı reddedilir', !!sBad);
  const { error: sForeign } = await outsider.client.from('series_follows').insert({ user_id: member.id, series_key: 'NEURIPS' });
  check('başkası adına seri takibi eklenemez', !!sForeign);
  const { data: sOut } = await outsider.client.from('series_follows').select('series_key');
  check('başkasının seri takibi görünmez', (sOut ?? []).length === 0);
  const { error: sAnon } = await anon.from('series_follows').insert({ series_key: 'AAAI' });
  check('giriş yapmamış kişi seri takip edemez', !!sAnon);

  // -------------------------------------------------------------------------
  section('Anlık bildirim abonelikleri');
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Date.now()}`;
  const sub = { p_endpoint: endpoint, p_p256dh: 'BPe2eKey', p_auth: 'e2eAuth', p_user_agent: 'e2e' };
  const { error: pErr } = await member.client.rpc('save_push_subscription', sub);
  check('üye cihaz aboneliği kaydeder', !pErr, pErr?.message);
  const { data: pMine } = await member.client.from('push_subscriptions').select('endpoint');
  check('üye kendi aboneliğini görür', pMine?.length === 1);
  const { data: pOut } = await outsider.client.from('push_subscriptions').select('endpoint');
  check('başkası aboneliği göremez', (pOut ?? []).length === 0);
  const { error: pUpd } = await member.client.from('push_subscriptions').update({ endpoint: 'https://evil.example/x' }).eq('endpoint', endpoint);
  const { data: pAfter } = await db.from('push_subscriptions').select('endpoint').eq('user_id', member.id);
  check('abonelik doğrudan değiştirilemez', !!pUpd || pAfter?.[0]?.endpoint === endpoint, pUpd?.message);
  const { error: pBad } = await member.client.rpc('save_push_subscription', { ...sub, p_endpoint: 'http://insecure.example/x' });
  check('https olmayan uç nokta reddedilir', !!pBad);
  const { error: pAnon } = await anon.rpc('save_push_subscription', sub);
  check('giriş yapmamış kişi abone olamaz', !!pAnon);
  await outsider.client.rpc('save_push_subscription', sub); // aynı tarayıcıda başka hesapla giriş
  const { data: pMoved } = await db.from('push_subscriptions').select('user_id').eq('endpoint', endpoint);
  check('aynı cihaz başka hesapla abone olunca eski hesaba bildirim gitmez', pMoved?.length === 1 && pMoved[0].user_id === outsider.id, pMoved);
  await outsider.client.from('push_subscriptions').delete().eq('endpoint', endpoint);
  const { count: pLeft } = await db.from('push_subscriptions').select('*', { count: 'exact', head: true }).eq('endpoint', endpoint);
  check('kullanıcı aboneliğini kapatır (silinir)', pLeft === 0);

  // -------------------------------------------------------------------------
  section('Üyelik yönetimi');
  const { error: memberKick } = await member.client.rpc('remove_group_member', { p_group: gid, p_user: owner.id });
  check('üye sahibi çıkaramaz', !!memberKick);
  const { error: ownerLeave } = await owner.client.rpc('leave_group', { p_group: gid });
  check('sahip gruptan ayrılamaz (silmesi gerekir)', !!ownerLeave && /owner_cannot_leave/.test(ownerLeave.message));
  const { data: newCode } = await owner.client.rpc('group_invite_code', { p_group: gid, p_regenerate: true });
  check('davet kodu yenilenir', typeof newCode === 'string' && newCode !== code);
  const { error: oldCode } = await outsider.client.rpc('join_group', { p_code: code });
  check('eski (yenilenmiş) kodla katılınamaz', !!oldCode);
  const { error: kickErr } = await owner.client.rpc('remove_group_member', { p_group: gid, p_user: member.id });
  check('sahip üyeyi çıkarır', !kickErr, kickErr?.message);
  const { data: afterKick } = await member.client.from('group_events').select('event_id').eq('group_id', gid);
  check('çıkarılan üye ortak takvimi artık göremez', (afterKick ?? []).length === 0);
  const icsAfter = await fetch(`${URL}/functions/v1/ics?token=${memberProfile!.ics_token}&group=${gid}`);
  check('çıkarılan üyenin takvim aboneliği kapanır', icsAfter.status === 404, icsAfter.status);
  const { data: subAfter } = await member.client.from('submissions').select('shared_group_ids').eq('event_id', ev3).single();
  check('çıkarılan üyenin başvuru paylaşımı gruptan otomatik kalkar', subAfter?.shared_group_ids.length === 0, subAfter);
  const { data: advAfter } = await owner.client.rpc('group_submissions', { p_group: gid });
  check('danışman çıkarılan üyenin başvurusunu artık görmez', (advAfter ?? []).length === 0);

  // -------------------------------------------------------------------------
  section('Duyurular');
  const { error: nonAdminAnn } = await member.client.rpc('admin_create_announcement', { p_title: 'Sahte duyuru', p_body: 'x', p_url: null, p_recipients: [member.id] });
  check('yönetici olmayan duyuru yayımlayamaz', !!nonAdminAnn);
  const { error: directAnn } = await member.client.from('announcements').insert({ title: 'Sahte', body: 'x' });
  check('duyuru tablosuna doğrudan yazılamaz', !!directAnn);
  const { error: nonAdminStats } = await member.client.rpc('admin_usage_stats');
  check('yönetici olmayan kullanım istatistiklerini göremez', !!nonAdminStats);
  await db.from('admins').insert({ user_id: owner.id });
  const { data: usage, error: usageErr } = await owner.client.rpc('admin_usage_stats');
  check('yönetici kullanım istatistiklerini alır (12 hafta, kişisel veri yok)', !usageErr && usage?.signups_weekly?.length === 12 && usage.adoption.users >= 3 && !JSON.stringify(usage).includes('@'), usageErr?.message);
  const { error: badUrl } = await owner.client.rpc('admin_create_announcement', { p_title: 'Kötü bağlantı', p_body: 'x', p_url: 'javascript:alert(1)', p_recipients: [owner.id] });
  check('duyuruda javascript: bağlantısı reddedilir', !!badUrl);
  const { data: annSent, error: annErr } = await owner.client.rpc('admin_create_announcement', { p_title: 'E2E duyurusu', p_body: 'Merhaba\nikinci satır', p_url: 'https://example.org', p_recipients: [owner.id, member.id, outsider.id] });
  check('yönetici duyuru yayımlar (test: yalnızca 3 test kullanıcısına)', !annErr && annSent === 3, annErr?.message ?? annSent);
  const { data: annMsg } = await outsider.client.from('notifications').select('id, announcement_id, announcements(title, body, url)').eq('type', 'announcement');
  const mine = (annMsg ?? []).find((n) => (n.announcements as unknown as { title: string } | null)?.title === 'E2E duyurusu');
  check('herhangi bir üye duyuruyu mesaj kutusunda görür', !!mine);
  announcementId = mine?.announcement_id ?? null;
  const { data: annList } = await owner.client.rpc('admin_list_announcements');
  const listed = (annList ?? []).find((a: { id: string }) => a.id === announcementId);
  check('yönetici alıcı/okunma sayısını görür', listed?.recipients === 3 && listed?.read_count === 0, listed);
  await outsider.client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine!.id);
  const { data: annList2 } = await owner.client.rpc('admin_list_announcements');
  check('okunma sayısı güncellenir', (annList2 ?? []).find((a: { id: string }) => a.id === announcementId)?.read_count === 1);
  const { error: annDel } = await owner.client.rpc('admin_delete_announcement', { p_id: announcementId });
  const { data: gone } = await outsider.client.from('notifications').select('id').eq('announcement_id', announcementId!);
  check('duyuru silinince mesaj kutularından da kalkar', !annDel && (gone ?? []).length === 0, annDel?.message);
  if (!annDel) announcementId = null;
  await db.from('admins').delete().eq('user_id', owner.id);

  // -------------------------------------------------------------------------
  section('Grubu silme');
  const { error: delErr } = await owner.client.rpc('delete_group', { p_group: gid });
  const { count: leftMembers } = await db.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', gid);
  const { count: leftEvents } = await db.from('group_events').select('*', { count: 'exact', head: true }).eq('group_id', gid);
  check('sahip grubu siler, üyelik ve takvim de gider', !delErr && leftMembers === 0 && leftEvents === 0, delErr?.message);
  const { data: stillFollowed } = await member.client.from('interests').select('event_id').eq('event_id', ev1);
  check('grup silinince üyenin kendi takip listesi korunur', (stillFollowed ?? []).length === 1);
} catch (e) {
  failures++;
  console.error('\n✖ Beklenmeyen hata:', e);
} finally {
  section('Temizlik');
  if (announcementId) await db.from('announcements').delete().eq('id', announcementId);
  await db.from('announcements').delete().in('title', ['E2E duyurusu', 'Kötü bağlantı', 'Sahte duyuru']);
  for (const id of created) {
    await db.from('admins').delete().eq('user_id', id);
    await db.auth.admin.deleteUser(id);
  }
  console.log(`  ${created.length} test kullanıcısı silindi`);
}

console.log(failures === 0 ? '\n✅ Tüm grup/duyuru kontrolleri geçti' : `\n❌ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
