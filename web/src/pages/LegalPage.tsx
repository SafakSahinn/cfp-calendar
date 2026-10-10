import type { ReactNode } from 'react';
import { useI18n, type Lang } from '../lib/i18n';
import { CONTACT_EMAIL, DATA_CONTROLLER, LEGAL_UPDATED, REPO_URL, SITE_NAME } from '../lib/site';

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

// Google doğrulaması için gereken "Limited Use" beyanı (resmi ifade İngilizcedir).
const LIMITED_USE = (
  <p className="callout">
    {SITE_NAME}’s use and transfer of information received from Google APIs to any other app will adhere to the{' '}
    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
      Google API Services User Data Policy
    </a>
    , including the Limited Use requirements.
  </p>
);

function Doc({ title, lang, children }: { title: string; lang: Lang; children: ReactNode }) {
  return (
    <article className="legal card">
      <h1>{title}</h1>
      <p className="muted small">
        {lang === 'tr' ? 'Son güncelleme' : 'Last updated'}: {LEGAL_UPDATED}
      </p>
      {children}
    </article>
  );
}

export function PrivacyTr() {
  return (
    <Doc lang="tr" title="Gizlilik Politikası ve KVKK Aydınlatma Metni">
      <p>
        Bu metin, {SITE_NAME} (“Site”) kullanılırken hangi kişisel verilerin işlendiğini, 6698 sayılı Kişisel Verilerin
        Korunması Kanunu (“KVKK”) kapsamında açıklar. Veri sorumlusu: <strong>{DATA_CONTROLLER}</strong> — iletişim: <Mail />.
      </p>

      <h2>1. İşlenen veriler</h2>
      <ul>
        <li><strong>Hesap bilgileri:</strong> e-posta adresi, ad soyad ve (Google/Microsoft ile girişte) profil fotoğrafı bağlantısı. E-posta ile üyelikte şifreniz yalnızca tek yönlü özet (hash) olarak saklanır.</li>
        <li><strong>Tercihler:</strong> seçtiğiniz konular, takip ettiğiniz çağrılar, dil tercihi, bildirim ayarları.</li>
        <li><strong>Site içi mesajlar:</strong> size gösterilen bildirimler ve “İlgileniyorum / İlgilenmiyorum” yanıtlarınız.</li>
        <li><strong>Takvim bağlantısı (isteğe bağlı):</strong> Google veya Microsoft’un verdiği erişim ve yenileme anahtarları (AES-256 ile şifreli), bağlı hesabın e-posta adresi ve takviminize eklediğimiz kayıtların kimlikleri.</li>
        <li><strong>Teknik kayıtlar:</strong> barındırma sağlayıcılarının tuttuğu IP adresi ve istek günlükleri.</li>
      </ul>

      <h2>2. Takvim verileri (Google / Microsoft)</h2>
      <p>
        Takviminizi bağlarsanız yalnızca <em>etkinlik oluşturma, güncelleme ve silme</em> izni isteriz
        (Google: <code>calendar.events</code>, Microsoft: <code>Calendars.ReadWrite</code>). Bu izni sadece sizin takip
        ettiğiniz veya “İlgileniyorum” dediğiniz çağrıların tarihlerini eklemek, tarih değişince güncellemek ve hesabınızı
        silerken (isterseniz) bu kayıtları kaldırmak için kullanırız. Takviminizdeki diğer etkinlikleri okumaz, saklamaz,
        kimseyle paylaşmayız; bu veriler reklam veya yapay zekâ modeli eğitimi için kullanılmaz.
      </p>
      {LIMITED_USE}

      <h2>3. İşleme amaçları ve hukuki sebep</h2>
      <ul>
        <li>Üyelik ve oturum yönetimi — sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
        <li>Çağrı bildirimleri ve takvim entegrasyonu — sözleşmenin ifası ve açık talebiniz (m.5/2-c).</li>
        <li>Güvenlik ve kötüye kullanımın önlenmesi — meşru menfaat (m.5/2-f).</li>
      </ul>

      <h2>4. Aktarım ve hizmet sağlayıcılar</h2>
      <p>Verileriniz satılmaz ve reklam amacıyla paylaşılmaz. Hizmetin çalışması için aşağıdaki sağlayıcılar kullanılır (yurt dışına aktarım, KVKK m.9 kapsamında açık talebinizle gerçekleşen hizmet ifası içindir):</p>
      <ul>
        <li><strong>Supabase</strong> — veritabanı ve kimlik doğrulama (sunucular: Frankfurt, AB).</li>
        <li><strong>GitHub</strong> — sitenin barındırılması ve zamanlanmış işler (ABD).</li>
        <li><strong>Google / Microsoft</strong> — giriş ve (bağlarsanız) takvim hizmeti.</li>
        <li><strong>Gmail (Google)</strong> — hesap onay ve şifre sıfırlama e-postalarının gönderimi.</li>
      </ul>

      <h2>5. Saklama süresi</h2>
      <p>
        Verileriniz hesabınız açık olduğu sürece saklanır. Profil sayfasındaki <strong>Hesabı sil</strong> butonuyla
        hesabınızı ve ilgili tüm verileri anında silebilirsiniz; bu işlem takvim izninizi de geri çeker ve isterseniz
        takviminize eklediğimiz kayıtları kaldırır. Takvim bağlantısını profil sayfasından istediğiniz an kesebilirsiniz.
      </p>

      <h2>6. Çerezler ve yerel depolama</h2>
      <p>Reklam veya izleme çerezi kullanılmaz. Oturumunuzu, dil ve filtre tercihlerinizi hatırlamak için tarayıcınızın yerel depolaması kullanılır.</p>

      <h2>7. Haklarınız (KVKK m.11)</h2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, aktarıldığı
        üçüncü kişileri bilme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı <Mail />{' '}
        adresine iletebilirsiniz; en geç 30 gün içinde yanıtlanır.
      </p>

      <h2>8. Değişiklikler</h2>
      <p>Bu metin güncellenirse yeni sürüm bu sayfada yayımlanır. Kaynak kod: <a href={REPO_URL}>{REPO_URL}</a></p>
    </Doc>
  );
}

export function PrivacyEn() {
  return (
    <Doc lang="en" title="Privacy Policy">
      <p>
        This policy explains what personal data {SITE_NAME} (“the Site”) processes. Data controller:{' '}
        <strong>{DATA_CONTROLLER}</strong> — contact: <Mail />.
      </p>

      <h2>1. Data we process</h2>
      <ul>
        <li><strong>Account data:</strong> email address, name and (for Google/Microsoft sign-in) profile picture URL. For email sign-up your password is stored only as a one-way hash.</li>
        <li><strong>Preferences:</strong> topics you select, calls you follow, language and notification settings.</li>
        <li><strong>In-site messages:</strong> notifications shown to you and your “Interested / Not interested” responses.</li>
        <li><strong>Calendar connection (optional):</strong> access and refresh tokens issued by Google or Microsoft (encrypted with AES-256), the connected account’s email address and the IDs of entries we added to your calendar.</li>
        <li><strong>Technical logs:</strong> IP addresses and request logs kept by our hosting providers.</li>
      </ul>

      <h2>2. Calendar data (Google / Microsoft)</h2>
      <p>
        If you connect a calendar we only request permission to <em>create, update and delete events</em> (Google:{' '}
        <code>calendar.events</code>, Microsoft: <code>Calendars.ReadWrite</code>). We use it solely to add dates of calls you
        follow or mark as interesting, to update them when they change and, if you choose, to remove them when you delete
        your account. We do not read, store or share your other calendar events, and this data is never used for
        advertising or to train AI models.
      </p>
      {LIMITED_USE}

      <h2>3. Purposes and legal basis</h2>
      <ul>
        <li>Account and session management — performance of a contract.</li>
        <li>Call notifications and calendar integration — performance of a contract, at your request.</li>
        <li>Security and abuse prevention — legitimate interest.</li>
      </ul>

      <h2>4. Service providers</h2>
      <p>We never sell your data or share it for advertising. The following providers are used to run the service:</p>
      <ul>
        <li><strong>Supabase</strong> — database and authentication (servers in Frankfurt, EU).</li>
        <li><strong>GitHub</strong> — website hosting and scheduled jobs (USA).</li>
        <li><strong>Google / Microsoft</strong> — sign-in and, if connected, calendar.</li>
        <li><strong>Gmail (Google)</strong> — sending account confirmation and password reset emails.</li>
      </ul>

      <h2>5. Retention</h2>
      <p>
        Data is kept while your account exists. The <strong>Delete account</strong> button on your profile immediately
        deletes your account and all related data, revokes calendar access and, optionally, removes the entries we added
        to your calendar. You can disconnect your calendar at any time from your profile.
      </p>

      <h2>6. Cookies and local storage</h2>
      <p>No advertising or tracking cookies are used. Your browser’s local storage keeps your session, language and filter preferences.</p>

      <h2>7. Your rights</h2>
      <p>You may request access to, correction or deletion of your data, or object to its processing, by writing to <Mail />. We respond within 30 days.</p>

      <h2>8. Changes</h2>
      <p>Updates to this policy are published on this page. Source code: <a href={REPO_URL}>{REPO_URL}</a></p>
    </Doc>
  );
}

export function TermsTr() {
  return (
    <Doc lang="tr" title="Kullanım Koşulları">
      <p>{SITE_NAME}’ı kullanarak aşağıdaki koşulları kabul etmiş olursunuz.</p>
      <h2>1. Hizmet</h2>
      <p>
        Site; bilgisayar ve elektrik-elektronik mühendisliği alanlarındaki konferans, çalıştay ve dergi çağrılarını herkese
        açık kaynaklardan (ccf-deadlines, WikiCFP) otomatik olarak toplar ve isteğinize bağlı olarak takviminize ekler.
        Hizmet ücretsizdir ve “olduğu gibi” sunulur.
      </p>
      <h2>2. Bilgilerin doğruluğu</h2>
      <p>
        Tarihler üçüncü taraf kaynaklardan otomatik alınır; hatalı, eksik veya güncel olmayabilir. Başvuru yapmadan önce
        tarihleri <strong>daima etkinliğin resmi sayfasından doğrulayın</strong>. Kaçırılan son tarihler veya hatalı
        bilgilerden doğan zararlardan sorumluluk kabul edilmez. Listelenen etkinlikler Site tarafından onaylanmış veya
        önerilmiş sayılmaz.
      </p>
      <h2>3. Hesabınız</h2>
      <p>Hesap bilgilerinizin güvenliğinden siz sorumlusunuz. Siteyi kötüye kullanan, otomatik olarak aşırı istek gönderen veya başkalarının hesabına erişmeye çalışan hesaplar kapatılabilir.</p>
      <h2>4. Takvim erişimi</h2>
      <p>Takvim bağlantısı isteğe bağlıdır ve istediğiniz an profilinizden kaldırılabilir. Verilerinizin nasıl işlendiği <a href="#/gizlilik">Gizlilik Politikası</a>’nda açıklanmıştır.</p>
      <h2>5. Değişiklikler ve iletişim</h2>
      <p>Hizmet ve bu koşullar önceden haber verilmeksizin değiştirilebilir. Sorularınız için: <Mail /></p>
    </Doc>
  );
}

export function TermsEn() {
  return (
    <Doc lang="en" title="Terms of Service">
      <p>By using {SITE_NAME} you agree to the following terms.</p>
      <h2>1. The service</h2>
      <p>
        The Site automatically collects conference, workshop and journal calls in computer and electrical engineering from
        public sources (ccf-deadlines, WikiCFP) and, at your request, adds them to your calendar. The service is free and
        provided “as is”.
      </p>
      <h2>2. Accuracy</h2>
      <p>
        Dates are collected automatically from third parties and may be wrong, incomplete or outdated.{' '}
        <strong>Always verify dates on the event’s official page</strong> before submitting. We accept no liability for
        missed deadlines or damages caused by inaccurate information. Listing an event does not constitute an endorsement.
      </p>
      <h2>3. Your account</h2>
      <p>You are responsible for keeping your account secure. Accounts that abuse the Site, send excessive automated requests or attempt to access other accounts may be closed.</p>
      <h2>4. Calendar access</h2>
      <p>Calendar connection is optional and can be removed from your profile at any time. How your data is handled is described in the <a href="#/gizlilik">Privacy Policy</a>.</p>
      <h2>5. Changes and contact</h2>
      <p>The service and these terms may change without notice. Questions: <Mail /></p>
    </Doc>
  );
}

export function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const { lang } = useI18n();
  if (doc === 'privacy') return lang === 'tr' ? <PrivacyTr /> : <PrivacyEn />;
  return lang === 'tr' ? <TermsTr /> : <TermsEn />;
}
