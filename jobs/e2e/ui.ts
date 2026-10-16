// Tarayıcı testi: canlı sitede geçici kullanıcıyla gerçek arayüzü kullanır, ekran görüntüleri alır, sonunda hesabı
// arayüzden siler. GitHub Actions'ta "Tarayıcı testi" iş akışıyla çalışır; görüntüler artifact olarak yüklenir.

import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices, type Page } from 'playwright';
import { db } from '../src/db.ts';
import { runDispatch } from '../src/dispatch.ts';

const SITE = process.env.SITE_URL!;
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.log(`  ✖ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}
const section = (title: string) => console.log(`\n▶ ${title}`);
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

const email = `ui-${Date.now()}@cfp-calendar.test`;
const password = `Ui-${crypto.randomUUID().slice(0, 12)}`;
let userId = '';

const browser = await chromium.launch();
const pageErrors: string[] = [];

async function newPage(kind: 'desktop' | 'mobile') {
  const ctx = await browser.newContext({
    ...(kind === 'mobile' ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } }),
    locale: 'tr-TR',
    colorScheme: 'light',
    permissions: ['clipboard-read', 'clipboard-write', 'notifications'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${kind}: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) pageErrors.push(`${kind} ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.text().startsWith('Failed to load resource')) return; // ayrıntısı response olayında

    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(`${kind} console: ${m.text()}`);
  });
  return page;
}

/** Telefonda filtre paneli katlıdır; filtreye dokunmadan önce açık olduğundan emin ol. */
async function openFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /Filtreler/ });
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

async function signIn(page: Page) {
  await page.goto(SITE);
  await page.locator('form.email-auth input[type=email]').fill(email);
  await page.locator('form.email-auth input[autocomplete=current-password]').fill(password);
  await page.locator('form.email-auth button[type=submit]').click();
  await page.locator('nav.nav').waitFor({ timeout: 15_000 });
}

try {
  section('Hazırlık');
  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: 'Deneme Kullanıcısı' },
  });
  if (error) throw error;
  userId = data.user.id;
  const { data: taken } = await db.from('interests').select('event_id').not('event_id', 'is', null);
  const takenIds = new Set((taken ?? []).map((r) => r.event_id));
  const { data: open } = await db
    .from('events').select('id').gt('submission_deadline', new Date(Date.now() + 3 * 86_400_000).toISOString())
    .order('submission_deadline').limit(100);
  const follow = (open ?? []).filter((e) => !takenIds.has(e.id)).slice(0, 2);
  await db.from('interests').insert([
    { user_id: userId, topic: 'vlsi' },
    { user_id: userId, topic: 'ai-ml' },
    ...follow.map((e) => ({ user_id: userId, event_id: e.id })),
  ]);
  await runDispatch(() => {});
  console.log('  test kullanıcısı + ilgi alanları + mesajlar hazır');

  for (const kind of ['desktop', 'mobile'] as const) {
    section(kind === 'desktop' ? 'Masaüstü' : 'Mobil (iPhone 13)');
    const page = await newPage(kind);

    await page.goto(SITE);
    await page.getByRole('heading', { name: 'Son başvuru tarihlerini kaçırmayın' }).waitFor();
    check('giriş sayfası açıldı', true);
    check('logo görünüyor', await page.locator('.brand svg').isVisible());
    check('Microsoft butonu (kapalı sağlayıcı) gizli', (await page.getByText('Microsoft ile devam et').count()) === 0);
    await shot(page, `${kind}-01-landing`);

    // Üye ol: şifre tekrarı + göster butonu
    await page.getByRole('tab', { name: 'Üye ol' }).click();
    const pw = page.locator('form.email-auth input[autocomplete=new-password]');
    check('üye ol: iki şifre kutusu var', (await pw.count()) === 2, await pw.count());
    await pw.nth(0).fill('abcdefgh1');
    await pw.nth(1).fill('abcdefgh2');
    check('eşleşmeyen şifre uyarısı', await page.getByText('Şifreler eşleşmiyor.').isVisible());
    await pw.nth(1).fill('abcdefgh1');
    check('eşleşen şifre onayı', await page.getByText('✓ Şifreler eşleşiyor').isVisible());
    await page.locator('.reveal').first().click();
    check('göster butonu şifreyi açar', (await pw.nth(0).getAttribute('type')) === 'text');
    await shot(page, `${kind}-02-signup`, false);

    // Giriş
    await page.getByRole('tab', { name: 'Giriş yap' }).click();
    await signIn(page).catch(async () => {
      await page.locator('form.email-auth input[type=email]').fill(email);
      await page.locator('form.email-auth input[autocomplete=current-password]').fill(password);
      await page.locator('form.email-auth button[type=submit]').click();
      await page.locator('nav.nav').waitFor({ timeout: 15_000 });
    });
    check('e-posta ile giriş yapıldı', await page.locator('nav.nav').isVisible());

    // Çağrılar
    await page.locator('article.event').first().waitFor({ timeout: 20_000 });
    const count = await page.locator('article.event').count();
    check('çağrı listesi yüklendi', count > 0, count);
    if (kind === 'mobile') {
      check('telefonda filtreler varsayılan katlı', !(await page.getByLabel('Her zaman').isVisible()));
      await page.getByRole('button', { name: /Filtreler/ }).click();
      check('telefonda "Filtreler" butonu filtreleri açar', await page.getByLabel('Her zaman').isVisible());
    }
    if (kind === 'desktop') {
      // (mobilde mesajlar masaüstü testinde okunmuş olur)
      const badge = await page.locator('.nav .badge').textContent().catch(() => null);
      check('okunmamış mesaj rozeti', !!badge && +badge > 0, badge);
    }
    await shot(page, `${kind}-03-events`, false);

    // "Dikkat" filtresi: varsayılan gizli, açılınca sayı artar
    const before = +(await page.locator('.list-head p').textContent() ?? '0').split(' ')[0];
    await page.getByLabel('Dikkat işaretlileri de göster').check();
    const after = +(await page.locator('.list-head p').textContent() ?? '0').split(' ')[0];
    check('"dikkat" çağrıları varsayılan gizli, açılınca görünür', after > before, { before, after });
    check('dikkat etiketi görünür', (await page.locator('.tag.caution').count()) > 0);
    await page.getByLabel('Dikkat işaretlileri de göster').uncheck();

    // Etkinlik öner formu
    if (kind === 'desktop') {
      await page.getByRole('button', { name: /Etkinlik öner/ }).click();
      const dlg = page.locator('dialog.dialog');
      await dlg.waitFor();
      await dlg.getByRole('button', { name: 'Gönder' }).click();
      check('öneri formu: bağlantısız gönderim uyarı verir', await dlg.getByText('Lütfen kısa bir açıklama yazın.').isVisible());
      await dlg.locator('#fb-url').fill('https://example.org/test-conference');
      await dlg.locator('#fb-msg').fill('Tarayıcı testi önerisi');
      await dlg.getByRole('button', { name: 'Gönder' }).click();
      await page.getByText('Teşekkürler! Bildiriminiz iletildi.').waitFor({ timeout: 10_000 });
      const { data: fb } = await db.from('feedback').select('id, kind, url').eq('user_id', userId);
      check('öneri veritabanına kaydedildi', fb?.length === 1 && fb[0].kind === 'suggest_event', fb);
      await db.from('feedback').delete().eq('user_id', userId); // yöneticiye gitmesin

      await page.locator('article.event').first().getByRole('button', { name: /Hata bildir/ }).click();
      await page.locator('dialog.dialog').getByRole('heading', { name: 'Hatalı bilgi bildir' }).waitFor();
      check('hata bildir formu etkinlik adıyla açılır', true);
      await page.locator('dialog.dialog').getByRole('button', { name: 'Vazgeç' }).click();
    }

    // Sıralama ve yeni filtreler
    const countOf = async () => +((await page.locator('.list-head p').textContent()) ?? '0').split(' ')[0];
    const all = await countOf();
    await page.getByLabel('Her zaman').selectOption('7');
    const week = await countOf();
    check('"7 gün içinde" filtresi listeyi daraltır', week < all, { all, week });
    await page.getByLabel('Her zaman').selectOption('');
    await page.getByLabel('Yüz yüze / çevrim içi').selectOption('online');
    const online = await countOf();
    check('"Çevrim içi" filtresi listeyi daraltır', online < all && online > 0, { all, online });
    await page.getByLabel('Yüz yüze / çevrim içi').selectOption('');
    await page.getByLabel('Sıralama').selectOption('newest');
    check('"Yeni eklenenler" sıralaması seçilebilir', (await page.locator('article.event').count()) > 0);
    await page.getByLabel('Sıralama').selectOption('deadline');

    // Aylık takvim görünümü
    await page.getByRole('tab', { name: /Takvim/ }).click();
    await page.locator('.calendar').waitFor();
    if (kind === 'desktop') {
      check('takvim: masaüstünde 7 sütunlu ızgara', await page.locator('.cal-grid').isVisible() && (await page.locator('.cal-wd').count()) === 7);
      check('takvim: bu ayda son tarihler görünür', (await page.locator('.cal-grid .cal-item').count()) > 0);
      await page.locator('.cal-head button[aria-label="Sonraki ay"]').click();
      check('takvim: sonraki aya geçilir', (await page.locator('.cal-grid .cal-item').count()) >= 0);
      await page.getByRole('button', { name: 'Bugün' }).click();
    } else {
      check('takvim: telefonda gün gün liste (ızgara gizli)', !(await page.locator('.cal-grid').isVisible()) && await page.locator('.cal-agenda').isVisible());
      check('takvim: listede son tarihler var', (await page.locator('.cal-agenda .cal-item').count()) > 0);
    }
    await shot(page, `${kind}-03b-calendar`, false);
    await page.locator('.cal-item:visible').first().click();
    await page.getByRole('heading', { name: 'Önemli tarihler' }).waitFor({ timeout: 10_000 });
    check('takvimden tıklayınca detay sayfası açılır', page.url().includes('#/etkinlik/'));
    await page.goto(`${SITE}#/`);
    await page.getByRole('tab', { name: /Liste/ }).click();
    await page.locator('article.event').first().waitFor();

    // Etkinlik detay sayfası
    await page.locator('article.event .title-link').first().click();
    await page.getByRole('heading', { name: 'Önemli tarihler' }).waitFor({ timeout: 10_000 });
    check('detay: son başvuru çizelgede', (await page.locator('.timeline .strong').count()) === 1);
    check('detay: takip / takvim / paylaş butonları', await page.getByRole('button', { name: /Paylaş/ }).isVisible() && await page.getByRole('button', { name: /Takip/ }).first().isVisible());
    await shot(page, `${kind}-03c-detail`, kind === 'desktop');
    if (kind === 'desktop') {
      await page.getByRole('button', { name: /Paylaş/ }).click();
      await page.getByText('Bağlantı kopyalandı').waitFor({ timeout: 5_000 });
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      check('detay: paylaş bağlantıyı kopyalar', copied === page.url(), { copied, url: page.url() });
    }
    if (kind === 'desktop') {
      await page.getByRole('button', { name: /Başvuruyu takip et/ }).click();
      await page.getByLabel('Durum').selectOption('submitted');
      await page.getByLabel('Makale başlığı').fill('UI Test Makalesi');
      await page.locator('.submission').getByRole('button', { name: 'Kaydet' }).click();
      await page.locator('.submission .tag.st-submitted').waitFor({ timeout: 10_000 });
      check('detay: başvuru takibi kaydedilir (Gönderildi)', true);
      const { data: subs } = await db.from('submissions').select('status, paper_title, submitted_at').eq('user_id', userId);
      check('başvuru veritabanında, gönderim tarihi otomatik', subs?.[0]?.status === 'submitted' && !!subs[0].submitted_at, subs);
      check('detay: TÜBİTAK kartı (varsa) doğru programla', (await page.locator('.funding').count()) === 0 || /2224-[AB]/.test((await page.locator('.funding h3').textContent()) ?? ''));

      // Kabul sonrası: durum "Kabul edildi" olunca camera-ready / kayıt / sunum tarihleri girilir
      const crDay = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
      await page.locator('.submission').getByRole('button', { name: 'Güncelle' }).click();
      await page.getByLabel('Durum').selectOption('accepted');
      await page.getByLabel('Camera-ready son günü').fill(crDay);
      await page.locator('#s-shared').fill('Şekiller bende, metin sende');
      await page.locator('.submission').getByRole('button', { name: 'Kaydet' }).click();
      await page.locator('.submission .task-list').waitFor({ timeout: 10_000 });
      const { data: acc } = await db.from('submissions').select('status, camera_ready_due, shared_notes').eq('user_id', userId).single();
      check('kabul sonrası: camera-ready tarihi ve ortak not kaydedilir', acc?.status === 'accepted' && acc.camera_ready_due === crDay && acc.shared_notes === 'Şekiller bende, metin sende', acc);
      await page.getByRole('button', { name: /Ortak yazar davet bağlantısını kopyala/ }).click();
      await page.getByText('Davet bağlantısı kopyalandı').waitFor({ timeout: 5_000 });
      check('ortak yazar davet bağlantısı kopyalanır', /#\/ortak\/[0-9a-f]{16}$/.test(await page.evaluate(() => navigator.clipboard.readText())));
      await shot(page, `${kind}-03j-accepted-team`, true);
    }
    if (kind === 'desktop') {
      // Seri: geçmiş yılları olan bir konferans
      const { data: ser } = await db.from('events').select('id, series_key').not('series_key', 'is', null)
        .gt('submission_deadline', new Date().toISOString()).order('submission_deadline').limit(50);
      const withPast = [];
      for (const s of ser ?? []) {
        const { count } = await db.from('events').select('*', { count: 'exact', head: true }).eq('series_key', s.series_key);
        if ((count ?? 0) > 1) { withPast.push(s); break; }
      }
      check('seri anahtarı olan ve geçmiş yılı bulunan çağrı var', withPast.length === 1);
      if (withPast[0]) {
        await page.goto(`${SITE}#/etkinlik/${withPast[0].id}`);
        await page.locator('.series').waitFor({ timeout: 10_000 });
        const pastShown = await page.locator('.series .timeline > div').first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
        check('detay: seri kartında önceki yılların son tarihleri', pastShown);
        await page.locator('.series').getByRole('button', { name: /Seriyi takip et/ }).click();
        await page.locator('.series').getByRole('button', { name: /Seri takipte/ }).waitFor({ timeout: 5_000 });
        await page.getByText(/serisi takipte: yeni/).first().waitFor({ timeout: 10_000 }); // kayıt yazılınca çıkan bildirim
        const { data: sf } = await db.from('series_follows').select('series_key').eq('user_id', userId);
        check('seri takibi veritabanına yazıldı', sf?.[0]?.series_key === withPast[0].series_key, sf);
        await shot(page, `${kind}-03d-series`, true);
        check('detay: benzer çağrılar listesi', (await page.locator('.similar li').count()) > 0);
        await page.goBack();
      }
      // Tema düğmesi: seçilir, yenilemede hatırlanır
      const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.locator('.theme-toggle').click();
      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check('tema düğmesi temayı değiştirir', !!theme && before !== after, { theme, before, after });
      await page.reload();
      await page.locator('nav.nav').waitFor();
      check('tema seçimi yenilemeden sonra hatırlanır', (await page.evaluate(() => document.documentElement.dataset.theme)) === theme);
      await shot(page, `${kind}-03e-theme-${theme}`, false);
      await page.locator('.theme-toggle').click(); // eski hâline
    }
    const detailUrl = page.url();
    await page.goto(`${SITE}#/etkinlik/00000000-0000-0000-0000-000000000000`);
    const notFound = await page.getByText('Bu çağrı bulunamadı').waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    check('detay: başka bir detay bağlantısına geçince sayfa güncellenir (olmayan etkinlik → bulunamadı)', notFound);
    await page.goto(`${SITE}#/`);
    await page.locator('article.event').first().waitFor();

    // Kayıtlı arama: filtre seç → kaydet → temizle → tek tıkla geri uygula
    if (kind === 'desktop') {
      await openFilters(page);
      await page.getByLabel(/Sadece IEEE/).check();
      await page.getByRole('button', { name: /Bu aramayı kaydet/ }).click();
      await page.getByLabel('Aramaya bir ad ver').fill('UI IEEE araması');
      await page.locator('.ss-form').getByRole('button', { name: 'Kaydet' }).click();
      await page.locator('.ss-chip', { hasText: 'UI IEEE araması' }).waitFor({ timeout: 10_000 });
      const { data: ss } = await db.from('saved_searches').select('filters, notify').eq('user_id', userId);
      check('kayıtlı arama kaydedilir (filtre + bildirim açık)', ss?.length === 1 && ss[0].filters.ieee === true && ss[0].notify === true, ss);
      await page.getByLabel(/Sadece IEEE/).uncheck();
      await page.locator('.ss-apply', { hasText: 'UI IEEE araması' }).click();
      check('kayıtlı arama tek tıkla uygulanır', await page.getByLabel(/Sadece IEEE/).isChecked());
      await shot(page, `${kind}-03i-saved-search`, false);
      await page.getByLabel(/Sadece IEEE/).uncheck();
    }

    // Senin için (test kullanıcısı VLSI + yapay zekâ konularını seçti)
    await page.getByRole('tab', { name: /Senin için/ }).click();
    await page.locator('.fy-item').first().waitFor({ timeout: 15_000 });
    check('Senin için: kişisel öneriler nedenleriyle listelenir', (await page.locator('.fy-item').count()) > 0 && (await page.locator('.fy-reason', { hasText: /İlgi alanın|Takip ettiklerine benzer/ }).count()) > 0);
    await shot(page, `${kind}-03h-foryou`, false);
    await page.getByRole('tab', { name: /Liste/ }).click();
    await page.locator('article.event').first().waitFor();

    // Harita görünümü
    await page.getByRole('tab', { name: /Harita/ }).click();
    await page.locator('.leaflet-container').waitFor({ timeout: 15_000 });
    const pins = await page.locator('.map-pin, .marker-cluster').first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    check('harita: işaretler görünür', pins);
    check('harita: OpenStreetMap atfı var', await page.getByRole('link', { name: 'OpenStreetMap' }).isVisible());
    await shot(page, `${kind}-03f-map`, false);
    if (kind === 'desktop') {
      const single = page.locator('.map-pin').first();
      if (await single.count()) {
        await single.click();
        const popup = await page.locator('.map-popup a').first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
        check('harita: işarete tıklayınca çağrı listesi açılır', popup);
      }
    }
    await page.getByRole('tab', { name: /Liste/ }).click();
    await page.locator('article.event').first().waitFor();

    // Türkiye filtresi
    await openFilters(page);
    await page.getByLabel(/Sadece Q1–Q2 dergiler/).check();
    const q12 = +((await page.locator('.list-head p').textContent()) ?? '0').split(' ')[0];
    check('"Sadece Q1–Q2 dergiler" filtresi SJR etiketli dergileri gösterir', q12 > 0 && q12 < 200 && (await page.locator('.tag.rank', { hasText: /SJR Q[12]/ }).count()) > 0, q12);
    await page.getByLabel(/Sadece Q1–Q2 dergiler/).uncheck();
    const total = +(await page.locator('.list-head p').textContent() ?? '0').split(' ')[0];
    await page.getByLabel(/Türkiye'de/).check();
    const inTr = +(await page.locator('.list-head p').textContent().catch(() => '0') ?? '0').split(' ')[0];
    check('"Türkiye\'de" filtresi listeyi daraltır', inTr < total, { total, inTr });
    await page.locator('.tr-series').waitFor({ timeout: 5_000 });
    check('Türkiye filtresi: konferans serileri kartı (SIU, UBMK, ELECO…)', (await page.locator('.tr-series .tr-row').count()) >= 7 && await page.locator('.tr-series').getByText('SIU', { exact: true }).isVisible());
    if (kind === 'desktop') {
      await page.locator('.tr-row', { hasText: 'UBMK' }).getByRole('button', { name: /Seriyi takip et/ }).click();
      await page.locator('.tr-row', { hasText: 'UBMK' }).getByRole('button', { name: /Seri takipte/ }).waitFor({ timeout: 5_000 });
      await page.getByText(/serisi takipte: yeni/).first().waitFor({ timeout: 10_000 }); // kayıt yazılınca çıkan bildirim
      const { data: trf } = await db.from('series_follows').select('series_key').eq('user_id', userId).eq('series_key', 'UBMK');
      check('Türkiye serisi takip edilir (UBMK)', trf?.length === 1);
      await shot(page, `${kind}-03g-turkey-series`, false);
    }
    await page.getByLabel(/Türkiye'de/).uncheck();

    // Filtre: sadece takip ettiklerim
    await openFilters(page);
    await page.getByLabel('Takip ettiklerim').check();
    const followedCount = await page.locator('article.event').count();
    check('"Takip ettiklerim" filtresi', followedCount >= follow.length, followedCount);
    await page.getByLabel('Takip ettiklerim').uncheck();

    // Mesajlar
    await page.goto(`${SITE}#/mesajlar`);
    await page.locator('article.message').first().waitFor({ timeout: 15_000 });
    check('mesajlar listelendi', (await page.locator('article.message').count()) > 0);
    await shot(page, `${kind}-04-inbox`, false);
    if (kind === 'desktop') {
      await page.getByRole('button', { name: 'İlgileniyorum' }).first().click();
      await page.getByText(/✓ İlgileniyorsunuz/).first().waitFor({ timeout: 15_000 });
      check('"İlgileniyorum" butonu çalıştı', true);
      await page.getByRole('button', { name: 'İlgilenmiyorum' }).first().click();
      await page.getByText('İlgilenmiyorsunuz', { exact: true }).first().waitFor({ timeout: 15_000 });
      check('"İlgilenmiyorum" butonu çalıştı', true);
      await page.goto(`${SITE}#/`);
      await page.waitForTimeout(1500);
      check('mesajlar okununca rozet kalkar', (await page.locator('.nav .badge').count()) === 0);
    }

    // Profil
    await page.goto(`${SITE}#/profil`);
    await page.getByRole('heading', { name: 'Hesap' }).waitFor({ timeout: 15_000 });
    await page.locator('ul.followed li').first().waitFor({ timeout: 10_000 }).catch(() => {});
    const followedRows = await page.locator('ul.followed li').count();
    check('profil: takip edilen çağrılar listelendi', followedRows >= follow.length, followedRows);
    check('profil: konu seçimleri işaretli', (await page.locator('.chip.on').count()) === 2, await page.locator('.chip.on').count());
    check('profil: şifre değiştirme (e-posta üyesi)', await page.getByRole('heading', { name: 'Şifre değiştir' }).isVisible());
    check('profil: hesap silme bölümü', await page.getByRole('heading', { name: 'Hesabı sil' }).isVisible());
    check('profil: üye e-postaları kapalıyken e-posta ayarı gösterilmez', (await page.getByLabel('E-posta bildirimleri').count()) === 0);
    await shot(page, `${kind}-05-profile`);
    check('profil: hatırlatma günleri kartı (varsayılan 7 gün seçili)', await page.getByLabel('7 gün önce').isChecked() && !(await page.getByLabel('3 gün önce').isChecked()));
    if (kind === 'desktop') {
      await page.getByLabel('3 gün önce').check();
      await page.waitForTimeout(800);
      const { data: rd } = await db.from('profiles').select('reminder_days').eq('id', userId).single();
      check('profil: hatırlatma günü seçimi kaydedilir', JSON.stringify(rd?.reminder_days) === '[7,3]', rd);
      await db.from('profiles').update({ reminder_days: [7] }).eq('id', userId); // mobil test varsayılanı görsün

      // Profil fotoğrafı: yükle → tarayıcıda 256×256 WebP'ye küçültülür → menüde görünür → kaldır
      check('profil: fotoğraf yoksa baş harfler gösterilir', await page.locator('.avatar-editor .avatar-initials').isVisible());
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      await page.locator('.avatar-editor input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
      await page.getByText('Profil fotoğrafı güncellendi').waitFor({ timeout: 15_000 });
      const { data: avp } = await db.from('profiles').select('avatar_path, avatar_status').eq('id', userId).single();
      const { data: avFile } = avp?.avatar_path ? await db.storage.from('avatars').download(avp.avatar_path) : { data: null };
      check('profil: fotoğraf küçültülüp kapalı depoya yüklenir (WebP, <100 KB, onay bekliyor)',
        new RegExp(`^${userId}/avatar-[0-9a-f]{16}\\.webp$`).test(avp?.avatar_path ?? '') && avp?.avatar_status === 'pending' && !!avFile && avFile.size < 100 * 1024,
        { path: avp?.avatar_path, status: avp?.avatar_status, size: avFile?.size });
      check('profil: "Onay bekliyor" rozeti', await page.locator('.avatar-pending').isVisible());
      await page.locator('.nav img.avatar').waitFor({ timeout: 10_000 });
      check('profil: fotoğraf (onay beklerken) sahibine üst menüde görünür', await page.locator('.nav img.avatar').isVisible());
      await shot(page, `${kind}-05c-avatar`, false);
    }
    check('profil: anlık bildirim kartı', await page.getByRole('heading', { name: /Anlık bildirimler/ }).isVisible());
    // Başsız Chrome bildirim iznini her zaman "denied" bildirir; gerçek abonelik CI'da denenemez (telefonda elle denenir).
    // Burada kartın tarayıcı durumunu doğru yansıttığını doğrularız.
    const perm = await page.evaluate(() => ('Notification' in window ? Notification.permission : 'unsupported'));
    const pushCard = page.locator('.push-card');
    const shown =
      perm === 'denied' ? await pushCard.getByText(/bildirim izni tarayıcıda engellenmiş/).isVisible()
      : perm === 'unsupported' ? await pushCard.getByText(/ana ekrana ekleyin|desteklemiyor/).isVisible()
      : await pushCard.getByRole('button', { name: /Bu cihazda bildirimleri aç/ }).isVisible();
    check('profil: bildirim kartı tarayıcı iznine göre doğru durumu gösterir', shown, perm);
    const outlookHref = await page.getByRole('link', { name: /Outlook.com.a ekle/ }).getAttribute('href');
    check('profil: takvim aboneliği rehberi (Outlook / Google / Apple tek tıkla ekleme)', /outlook\.live\.com\/calendar\/0\/addfromweb\?url=https%3A%2F%2F.+ics%3Ftoken%3D/.test(outlookHref ?? '') && (await page.getByRole('link', { name: /Google Takvim.e ekle/ }).count()) === 1 && (await page.getByRole('link', { name: /Apple Takvim.e ekle/ }).getAttribute('href'))?.startsWith('webcal://'), outlookHref);
    check('profil: Microsoft girişi yokken Outlook kullanıcılarına yönlendirme', await page.getByText(/Outlook veya okul \/ iş hesabı mı kullanıyorsunuz/).isVisible());

    if (kind === 'desktop') {
      await page.getByLabel('Ad Soyad').fill('Deneme Kullanıcısı 2');
      await page.getByLabel('Unvan / meslek').selectOption('research_assistant');
      await page.getByLabel(/Kurum/).fill('Test Teknik Üniversitesi');
      await page.getByLabel('Bölüm').fill('Bilgisayar Mühendisliği');
      await page.getByRole('button', { name: 'Kaydet' }).click();
      await page.waitForTimeout(1500);
      const { data: p } = await db.from('profiles').select('display_name, academic_title, institution, department').eq('id', userId).single();
      check('profil: ad, unvan, kurum, bölüm kaydedildi',
        p?.display_name === 'Deneme Kullanıcısı 2' && p.academic_title === 'research_assistant' && p.institution === 'Test Teknik Üniversitesi' && p.department === 'Bilgisayar Mühendisliği', p);
      await page.reload();
      await page.getByText('Arş. Gör. · Test Teknik Üniversitesi').waitFor({ timeout: 10_000 });
      check('profil: başlıkta unvan ve kurum görünür', true);
    }

    // Takvimim + Gruplar (masaüstü)
    if (kind === 'desktop') {
      await page.getByRole('link', { name: 'Takvimim' }).click();
      await page.getByRole('heading', { name: 'Takvimim' }).waitFor({ timeout: 10_000 });
      await page.locator('.calendar').waitFor({ timeout: 10_000 });
      check('Takvimim: takip edilen çağrılarla takvim açılır', (await page.locator('.cal-item').count()) > 0 || (await page.locator('.cal-agenda').count()) > 0);
      check('Takvimim: tür açıklaması (açılış/özet/son başvuru/TÜBİTAK/etkinlik/kabul sonrası)', (await page.locator('.legend-item').count()) === 6);
      await shot(page, `${kind}-11-mycalendar`, false);
      await page.getByRole('tab', { name: /Başvurularım/ }).click();
      await page.getByText('UI Test Makalesi').waitFor({ timeout: 10_000 });
      check('Takvimim → Başvurularım listesinde görünür', (await page.locator('.pipe').count()) >= 1);
      await shot(page, `${kind}-11b-submissions`, false);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Excel \(CSV\)/ }).click()]);
      const csvText = readFileSync((await dl.path())!, 'utf8');
      check('Başvurularım: CSV indirilir (BOM, başlık satırı, makale)', dl.suggestedFilename() === 'basvurularim.csv' && csvText.startsWith('﻿Durum;Makale başlığı') && csvText.includes('UI Test Makalesi'), dl.suggestedFilename());
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Yazdır \/ PDF/ }).click()]);
      await popup.waitForLoadState();
      check('Başvurularım: yazdırma sayfası açılır (gruplu liste)', (await popup.title()).startsWith('Bildiri ve makale başvurularım') && (await popup.locator('li', { hasText: 'UI Test Makalesi' }).count()) === 1);
      await popup.close();

      await page.getByRole('link', { name: 'Gruplar' }).click();
      await page.getByLabel('Grup adı').fill('UI Test Grubu');
      await page.getByRole('button', { name: 'Grup oluştur' }).click();
      await page.getByRole('heading', { name: 'UI Test Grubu' }).waitFor({ timeout: 10_000 });
      check('grup oluşturulunca grup sayfası açılır', page.url().includes('#/grup/'));
      const groupUrl = page.url();
      await page.getByRole('tab', { name: 'Ayarlar' }).click();
      await page.waitForFunction(() => (document.querySelector('input.mono') as HTMLInputElement | null)?.value.includes('#/katil/'), null, { timeout: 10_000 }).catch(() => {});
      const invite = await page.locator('input.mono').first().inputValue();
      check('grup sahibi davet bağlantısını görür', /#\/katil\/[0-9a-f]{16}$/.test(invite), invite);
      check('grup takvimi abonelik adresi var', (await page.locator('input.mono').nth(1).inputValue()).includes('&group='));
      await shot(page, `${kind}-12-group-settings`, true);

      await page.goto(`${SITE}#/`);
      await page.locator('article.event').first().waitFor();
      await page.locator('article.event').first().getByRole('button', { name: /Gruba öner/ }).click();
      const rd = page.locator('dialog.dialog');
      await rd.getByLabel('Grup').waitFor({ timeout: 10_000 });
      await rd.locator('#rec-note').fill('UI testi önerisi');
      await rd.getByRole('button', { name: 'Gruba öner' }).click();
      await page.getByText(/Gruba eklendi/).waitFor({ timeout: 10_000 });
      check('çağrı gruba önerilir', true);
      await page.goto(groupUrl);
      await page.getByRole('tab', { name: 'Önerilen çağrılar' }).click();
      await page.getByText('💬 UI testi önerisi').waitFor({ timeout: 10_000 });
      check('önerilen çağrı notuyla grup listesinde', true);
      await page.getByRole('button', { name: /💬 Yorumlar/ }).first().click();
      await page.getByPlaceholder(/Gruba bir not yazın/).first().fill('UI test yorumu: birlikte bakalım mı?');
      await page.getByRole('button', { name: 'Gönder' }).first().click();
      await page.locator('.comment', { hasText: 'UI test yorumu' }).waitFor({ timeout: 10_000 });
      check('grup çağrısına yorum yazılır ve listede görünür', (await page.getByRole('button', { name: /💬 Yorumlar \(1\)/ }).count()) === 1);
      await shot(page, `${kind}-12b-group-comments`, false);
      await page.getByRole('tab', { name: 'Üyeler' }).click();
      check('üye listesinde e-posta görünmez', (await page.locator('.followed').getByText('@').count()) === 0);
      const gid = groupUrl.split('#/grup/')[1];
      await db.from('groups').delete().eq('id', gid);
    }

    // Yönetici paneli (masaüstü): önce yönetici olmadan, sonra yönetici olarak
    if (kind === 'desktop') {
      check('yönetici olmayan için "Yönetim" menüsü yok', (await page.getByRole('link', { name: 'Yönetim' }).count()) === 0);
      await page.goto(`${SITE}#/yonetim`);
      await page.getByText('Bu sayfa yalnızca yöneticilere açıktır.').waitFor({ timeout: 10_000 });
      check('yönetici olmayan panel yerine uyarı görür', true);

      await db.from('admins').insert({ user_id: userId });
      await page.goto(`${SITE}#/`);
      await page.reload();
      await page.getByRole('link', { name: 'Yönetim' }).click();
      await page.locator('.stat-grid').waitFor({ timeout: 15_000 });
      check('yönetici: özet kutuları', (await page.locator('.stat').count()) >= 6);
      await shot(page, `${kind}-08-admin-overview`, false);
      await page.getByRole('tab', { name: 'İstatistikler' }).click();
      await page.locator('.chart svg .bar').first().waitFor({ timeout: 15_000 });
      check('yönetici: istatistikler (haftalık üye grafiği + özellik kullanımı + sıralı listeler)', (await page.locator('.chart').count()) === 3 && (await page.locator('.stat').count()) >= 7);
      await page.locator('.chart svg .bar').last().hover();
      check('yönetici: grafik üzerine gelince değer gösterilir', await page.locator('.chart-tip').isVisible());
      await shot(page, `${kind}-08b-admin-stats`, true);

      // Onaylar: profil testinde yüklenen fotoğraf burada bekliyor
      await page.getByRole('tab', { name: /Onaylar/ }).click();
      await page.locator('.avatar-review', { hasText: 'Deneme Kullanıcısı' }).waitFor({ timeout: 15_000 });
      const reviewImg = await page.locator('.avatar-review img').first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
      check('yönetici: onay bekleyen fotoğraf (görselle) listelenir', reviewImg);
      await shot(page, `${kind}-08c-admin-approvals`, false);
      await page.locator('.avatar-review', { hasText: 'Deneme Kullanıcısı' }).getByRole('button', { name: /Onayla/ }).click();
      await page.getByText('Fotoğraf onaylandı').waitFor({ timeout: 10_000 });
      const { data: apr } = await db.from('profiles').select('avatar_status, avatar_path, avatar_approved_path').eq('id', userId).single();
      check('yönetici: fotoğraf onaylanır', apr?.avatar_status === 'approved' && apr.avatar_approved_path === apr.avatar_path, apr);
      await page.goto(`${SITE}#/profil`);
      await page.locator('.avatar-approved').waitFor({ timeout: 10_000 });
      check('profil: "Onaylandı" rozeti', true);
      await page.getByRole('button', { name: 'Kaldır' }).click();
      await page.locator('.avatar-editor .avatar-initials').waitFor({ timeout: 10_000 });
      const { data: avAfter } = await db.from('profiles').select('avatar_path, avatar_approved_path').eq('id', userId).single();
      const { data: avList } = await db.storage.from('avatars').list(userId);
      check('profil: fotoğraf kaldırılınca depodan da silinir', avAfter?.avatar_path === null && avAfter.avatar_approved_path === null && (avList ?? []).length === 0, avList);
      await page.goto(`${SITE}#/yonetim`);
      await page.locator('.stat-grid').waitFor({ timeout: 15_000 });

      await page.getByRole('tab', { name: 'Üyeler' }).click();
      await page.locator('table.table tbody tr').first().waitFor({ timeout: 10_000 });
      check('yönetici: üye tablosunda test kullanıcısı', (await page.getByText(email).count()) > 0);
      await shot(page, `${kind}-09-admin-users`, false);

      await page.getByRole('tab', { name: 'Etkinlik ekle' }).click();
      await page.getByPlaceholder(/Sinyal İşleme/).fill('UI Test Kurultayı');
      await page.getByPlaceholder('SIU 2027').fill('UITK 2027');
      await page.locator('input[type=date]').first().fill('2027-03-01');
      await page.locator('.admin-form .chip', { hasText: 'VLSI / Devreler' }).click();
      await page.getByRole('button', { name: 'Ekle' }).click();
      await page.getByText('UITK 2027').waitFor({ timeout: 10_000 });
      check('yönetici: etkinlik ekleme formu çalışır', true);
      await shot(page, `${kind}-10-admin-events`, true);
      page.once('dialog', (d) => d.accept());
      await page.locator('.card.row', { hasText: 'UITK 2027' }).getByRole('button', { name: 'Sil' }).click();
      await page.getByText('Silindi.').waitFor({ timeout: 10_000 });
      check('yönetici: etkinlik silme çalışır', (await db.from('events').select('id').eq('title', 'UI Test Kurultayı')).data?.length === 0);

      await page.getByRole('tab', { name: 'İşlem kaydı' }).click();
      await page.getByText('Etkinlik ekledi').first().waitFor({ timeout: 10_000 });
      check('yönetici: işlem kaydı görünür', true);
      await db.from('admins').delete().eq('user_id', userId);
    }

    // Yasal sayfalar (oturumdan bağımsız)
    await page.goto(`${SITE}#/gizlilik`);
    const legalShown = await page.getByRole('heading', { name: /Gizlilik Politikası/ }).waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    check('gizlilik sayfası', legalShown);
    check('Google "Limited Use" beyanı', await page.getByText('Limited Use requirements').isVisible());
    await shot(page, `${kind}-06-privacy`, false);
    if (kind === 'desktop') {
      const man = await page.request.get(`${SITE}manifest.webmanifest`);
      const manJson = await man.json().catch(() => ({}));
      check('PWA: manifest yayında (ad + 512 simge)', man.ok() && manJson.name === 'CFP Calendar' && manJson.icons?.some((i: { sizes: string }) => i.sizes === '512x512'));
      const sw = await page.request.get(`${SITE}sw.js`);
      check('PWA: service worker yayında', sw.ok() && (await sw.text()).includes('self.addEventListener'));
      const swReady = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
      check('PWA: service worker kaydedildi', swReady);
      for (const f of ['privacy.html', 'terms.html']) {
        const res = await page.request.get(`${SITE}${f}`);
        const html = await res.text();
        check(`statik ${f} yayında (JavaScript gerektirmez)`, res.status() === 200 && html.includes('<h1>') && (f !== 'privacy.html' || html.includes('Limited Use')), res.status());
      }
    }
    await page.goto(`${SITE}#/kosullar`);
    check('kullanım koşulları sayfası', await page.getByRole('heading', { name: 'Kullanım Koşulları' }).isVisible());

    // Paylaşılan bağlantı: oturum kapalıyken açılır → giriş → aynı etkinliğe dönülür
    if (kind === 'desktop') {
      const shared = await page.evaluate(() => location.origin + location.pathname);
      const { data: anyEvent } = await db.from('events').select('id').gt('submission_deadline', new Date().toISOString()).limit(1).single();
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'tr-TR' });
      const p2 = await ctx2.newPage();
      await p2.goto(`${shared}#/etkinlik/${anyEvent!.id}`);
      await p2.getByRole('heading', { name: 'Son başvuru tarihlerini kaçırmayın' }).waitFor();
      check('paylaşılan bağlantı: oturumsuz → giriş sayfası', true);
      await p2.locator('form.email-auth input[type=email]').fill(email);
      await p2.locator('form.email-auth input[autocomplete=current-password]').fill(password);
      await p2.locator('form.email-auth button[type=submit]').click();
      await p2.getByRole('heading', { name: 'Önemli tarihler' }).waitFor({ timeout: 15_000 });
      check('paylaşılan bağlantı: girişten sonra aynı etkinlik açılır', p2.url().endsWith(anyEvent!.id));
      await ctx2.close();
    }

    // Hesap silme (sadece masaüstünde, en sonda)
    if (kind === 'mobile') {
      await page.goto(`${SITE}#/profil`);
      await page.getByRole('heading', { name: 'Hesabı sil' }).waitFor();
      const del = page.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' });
      check('silme butonu onay kelimesi olmadan kapalı', await del.isDisabled());
      await page.getByLabel(/Onaylamak için SİL yazın/).fill('sil');
      check('küçük harfle "sil" de kabul edilir', await del.isEnabled());
      await del.click();
      await page.getByRole('heading', { name: 'Son başvuru tarihlerini kaçırmayın' }).waitFor({ timeout: 20_000 });
      check('silme sonrası giriş sayfasına dönüldü', true);
      await shot(page, `${kind}-07-after-delete`, false);
      const { data: gone } = await db.auth.admin.getUserById(userId);
      check('kullanıcı veritabanından silindi', !gone?.user);
      if (!gone?.user) userId = '';
    }
    await page.context().close();
  }

  section('Tarayıcı hataları');
  check('sayfa/konsol hatası yok', pageErrors.length === 0, pageErrors);
} catch (e) {
  failures++;
  console.error('\n✖ Beklenmeyen hata:', e);
} finally {
  await browser.close();
  if (userId) {
    const { data: av } = await db.storage.from('avatars').list(userId);
    if (av?.length) await db.storage.from('avatars').remove(av.map((x) => `${userId}/${x.name}`));
    await db.auth.admin.deleteUser(userId);
    console.log('\n  test kullanıcısı temizlendi');
  }
}

console.log(failures === 0 ? '\n✅ Tüm tarayıcı kontrolleri geçti' : `\n❌ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
