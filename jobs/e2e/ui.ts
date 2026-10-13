// Tarayıcı testi: canlı sitede geçici kullanıcıyla gerçek arayüzü kullanır, ekran görüntüleri alır, sonunda hesabı
// arayüzden siler. GitHub Actions'ta "Tarayıcı testi" iş akışıyla çalışır; görüntüler artifact olarak yüklenir.

import { mkdirSync } from 'node:fs';
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

    // Türkiye filtresi
    const total = +(await page.locator('.list-head p').textContent() ?? '0').split(' ')[0];
    await page.getByLabel(/Türkiye'de/).check();
    const inTr = +(await page.locator('.list-head p').textContent().catch(() => '0') ?? '0').split(' ')[0];
    check('"Türkiye\'de" filtresi listeyi daraltır', inTr < total, { total, inTr });
    await page.getByLabel(/Türkiye'de/).uncheck();

    // Filtre: sadece takip ettiklerim
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
    check('profil: e-posta bildirimleri açık', await page.getByLabel('E-posta bildirimleri').isChecked());
    await shot(page, `${kind}-05-profile`);

    if (kind === 'desktop') {
      await page.getByLabel('Ad Soyad').fill('Deneme Kullanıcısı 2');
      await page.getByRole('button', { name: 'Kaydet' }).click();
      await page.waitForTimeout(1000);
      const { data: p } = await db.from('profiles').select('display_name').eq('id', userId).single();
      check('profil: ad güncellendi', p?.display_name === 'Deneme Kullanıcısı 2', p);
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
    check('gizlilik sayfası', await page.getByRole('heading', { name: /Gizlilik Politikası/ }).isVisible());
    check('Google "Limited Use" beyanı', await page.getByText('Limited Use requirements').isVisible());
    await shot(page, `${kind}-06-privacy`, false);
    if (kind === 'desktop') {
      for (const f of ['privacy.html', 'terms.html']) {
        const res = await page.request.get(`${SITE}${f}`);
        const html = await res.text();
        check(`statik ${f} yayında (JavaScript gerektirmez)`, res.status() === 200 && html.includes('<h1>') && (f !== 'privacy.html' || html.includes('Limited Use')), res.status());
      }
    }
    await page.goto(`${SITE}#/kosullar`);
    check('kullanım koşulları sayfası', await page.getByRole('heading', { name: 'Kullanım Koşulları' }).isVisible());

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
    await db.auth.admin.deleteUser(userId);
    console.log('\n  test kullanıcısı temizlendi');
  }
}

console.log(failures === 0 ? '\n✅ Tüm tarayıcı kontrolleri geçti' : `\n❌ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
