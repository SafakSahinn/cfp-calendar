# Mimari

CFP Calendar'ın nasıl çalıştığı, veri modeli, güvenlik ilkeleri, klasör yapısı, testler ve bilinen sınırlar. Kurulum için [KURULUM.md](KURULUM.md), bakım işleri için [BAKIM.md](BAKIM.md).

## Genel yapı

```mermaid
flowchart LR
  U(["👤 Kullanıcı<br/>tarayıcı / telefon (PWA)"])

  subgraph SRC["📥 Veri kaynakları"]
    S1["ccf-deadlines"]
    S2["WikiCFP"]
    S3["IEEE ComSoc · Computer Society<br/>Sensors · JBHI"]
    S5["Türkiye serileri<br/>(elle derlenen liste)"]
    S4["CORE · SCImago SJR"]
  end

  subgraph GH["GitHub"]
    P["🌐 GitHub Pages<br/>React arayüz"]
    A["⚙️ Actions: veri işi<br/>12 saatte bir"]
    BK["🔒 Actions: haftalık<br/>şifreli yedek"]
  end

  subgraph SB["Supabase (Frankfurt)"]
    AUTH["🔐 Auth"]
    DB[("🗄️ Postgres + RLS")]
    ST[("🖼️ Storage<br/>avatars (kapalı)")]
    F["⚡ Edge Functions"]
  end

  subgraph EXT["Dış servisler"]
    G["📅 Google Calendar"]
    OSM["🗺️ OpenStreetMap"]
    M["✉️ Gmail SMTP"]
    WP["🔔 Tarayıcı push servisleri"]
  end

  S1 & S2 & S3 & S5 & S4 --> A
  A -- "çağrılar, bildirimler,<br/>seriler, koordinatlar" --> DB
  A -- "konum çözümleme<br/>(ülkeyle sınırlı)" --> OSM
  A -- "takvime ekle / güncelle" --> G
  A -- "yönetici raporu<br/>(üye e-postası isteğe bağlı)" --> M
  A -- "günde ≤2 özet (VAPID)" --> WP
  WP -.-> U
  BK -- "döküm (AES-256)" --> DB
  U --> P
  P -- "giriş" --> AUTH
  P -- "okuma, RPC" --> DB
  P -- "profil fotoğrafı" --> ST
  P -- "İlgileniyorum, takvim bağla,<br/>ICS, hesabı sil" --> F
  P -- "harita karoları" --> OSM
  F --> G
  F --> DB
  F --> ST
```

GitHub Pages yalnızca statik dosya sunduğu için üyelik, veritabanı, dosyalar ve gizli anahtarlar Supabase'te tutulur. Tüm yetki kontrolleri veritabanında yapılır (bkz. [Güvenlik ilkeleri](#güvenlik-ilkeleri)). Proje tamamen ücretsiz katmanlarda çalışır.

### 12 saatlik veri işi (`sync.yml` → `jobs/src/main.ts`)

```mermaid
flowchart TD
  F1["1 · Çek<br/>ccf · WikiCFP · ComSoc · IEEE dergileri · Türkiye serileri"]
  F2["2 · Birleştir<br/>aynı çağrı = aynı anahtar (kısaltma + yıl), seri anahtarı"]
  F3["3 · Derecelendir<br/>CORE (konferans) · SJR çeyreği (dergi)"]
  F4["4 · Kalite işaretleri<br/>indeks vaadi · organizatör kalıbı · toplu konferans kümesi"]
  F5["5 · Veritabanına yaz<br/>+ WikiCFP kaydından resmi site bağlantısı"]
  F6["6 · Konum çözümle<br/>OSM, ülkeyle sınırlı · önbellek denetimi"]
  F7["7 · Dağıt (kullanıcı başına)<br/>seri edisyonları · takip · son tarih hatırlatması ·<br/>kabul sonrası işler · kayıtlı aramalar · konu eşleşmeleri ·<br/>Google Takvim kayıtları"]
  F8["8 · Anlık bildirim<br/>kullanıcı başına tek özet, cihaz başına 8 saatte en fazla 1"]
  F9["9 · E-posta<br/>geri bildirim iletimi · üye özetleri (MEMBER_EMAILS=on ise)"]
  F10["10 · Çalışma kaydı · bakım hatırlatmaları · yönetici raporu"]
  F11["11 · Keepalive<br/>zamanlanmış iş 60 günde kapanmasın"]
  F1 --> F2 --> F3 --> F4 --> F5 --> F6 --> F7 --> F8 --> F9 --> F10 --> F11
```

Her adım hata verse de sonraki adımlar mümkün olduğunca çalışır. Kaynaklardan biri düşerse diğerleri devam eder ve çalışma kaydına "HATA" yazılır. Adımlar `sync.yml` üzerinden tek tek de çalıştırılabilir (`fetch`, `geocode`, `dispatch`, `push`, `push-test`, `email`).

### Bir çağrıyı takip edince ne olur?

```mermaid
sequenceDiagram
  autonumber
  actor K as Kullanıcı
  participant W as Site
  participant DB as Veritabanı
  participant J as 12 saatlik iş
  participant G as Google Takvim
  participant T as Telefon

  K->>W: ⭐ Takip et (veya seriyi / kayıtlı aramayı takip et)
  W->>DB: interests / series_follows / saved_searches
  loop her 12 saatte
    J->>DB: kaynaklardan güncel tarihleri yaz
    J->>DB: başvurusu açılan / tarihi değişen / yaklaşan takipli çağrılar?
    alt başvuru açıldı
      J->>DB: 📝 "Başvuru açıldı" mesajı
      J->>G: başvuru başlangıcı, özet, son başvuru kayıtları
    else son tarih değişti
      J->>DB: 🔄 "Son tarih değişti" mesajı
      J->>G: kayıtları güncelle
    else seçilen hatırlatma gününe girdi
      J->>DB: ⏰ "Son başvuruya 3 günden az kaldı"
    end
    J->>T: 🔔 tek özet bildirim (bildirim açıksa)
  end
  K->>W: Mesajlar → İlgileniyorum
  W->>G: konferans günlerini ekle (Edge Function)
```

### Profil fotoğrafı ve onay

```mermaid
sequenceDiagram
  autonumber
  actor K as Kullanıcı
  participant W as Site
  participant ST as Storage (avatars)
  participant DB as Veritabanı
  actor Y as Yönetici
  actor A as Grup arkadaşı

  K->>W: 📷 fotoğraf seç
  W->>W: kare kırp, 256×256 WebP (≈20 KB)
  W->>ST: uid/avatar-rastgele.webp (benzersiz ad, üzerine yazma yok)
  W->>DB: set_avatar → durum "onay bekliyor"
  Note over K,A: Onaya kadar yalnızca sahibi görür, varsa önceki onaylı fotoğraf grupta görünmeye devam eder
  Y->>W: Yönetim → Onaylar
  W->>DB: admin_pending_avatars
  W->>ST: imzalı adresle incele (yönetici okuma izni)
  alt Onayla
    Y->>DB: admin_review_avatar(onay) → onaylı yol = yeni dosya
    W->>ST: eski onaylı dosyayı sil
  else Reddet
    Y->>DB: admin_review_avatar(red) → önceki onaylı yol geri gelir
    W->>ST: reddedilen dosyayı sil
  end
  DB-->>K: 📷 "Fotoğrafın onaylandı / onaylanmadı" mesajı
  A->>DB: peer_avatar_paths (yalnızca ortak gruptakiler, yalnızca onaylı)
  A->>ST: imzalı adresle görüntüle (okuma politikası: sahip · yönetici · onaylıysa grup arkadaşı)
```

## Veri modeli (özet)

| Alan | Tablolar | Not |
|---|---|---|
| Çağrılar | `events` | Kaynaklardan birleştirilmiş çağrılar; `ranks`, `flags` (kalite), `series_key`, `lat/lng`, `source_url` |
| Kullanıcı | `profiles`, `admins` | Unvan, kurum, dil, bildirim tercihleri, `reminder_days`, fotoğraf yolu ve onay durumu |
| İlgi | `interests`, `series_follows`, `saved_searches` | Takip edilen çağrılar ve konular; takip edilen seriler; kayıtlı aramalar (en fazla 10) |
| Mesajlar | `notifications`, `announcements` | Site içi mesajlar (`emailed_at`, `pushed_at`), yönetici duyuruları |
| Takvim | `calendar_connections`, `calendar_entries` | Şifreli erişim anahtarları; eklenen kayıtlar ve özetleri (değişince güncellenir) |
| Gruplar | `groups`, `group_members`, `group_events`, `group_comments` | Ortak takvim, öneriler, yorumlar |
| Başvurular | `submissions`, `submission_members` | Durum, kabul sonrası tarihler, ortak notlar; ortak yazarlar |
| Cihazlar | `push_subscriptions` | Web Push abonelikleri (cihaz başına) |
| Sistem | `sync_runs`, `app_state`, `admin_audit`, `geocache`, `feedback` | Çalışma kayıtları, bakım durumu, yönetici işlem kaydı, konum önbelleği |
| Dosyalar | Storage `avatars` | Herkese kapalı; 100 KB, yalnızca resim |

## Güvenlik ilkeleri

- **Her tabloda Row Level Security.** Kullanıcı yalnızca kendi satırlarını okur ve yazar. Paylaşılan veriler (grup üye listesi, danışman görünümü, ortak yazar görünümü, istatistikler) `SECURITY DEFINER` RPC'lerle ve yalnızca gereken sütunlarla döner; e-posta adresi başka üyelere hiçbir yerde dönmez.
- **Sütun izinleri:** Gizli sütunlar (grup ve başvuru davet kodları, fotoğraf onay durumu, geri bildirim durumu) istemciden okunamaz ve yazılamaz; yalnızca RPC'lerle değişir. Bu yüzden bu tablolarda `select('*')` kullanılmaz; okunacak sütunlar açıkça yazılır.
- **Depo (Storage):** `avatars` herkese kapalıdır. Okuma: sahibi, yöneticiler ve fotoğraf onaylıysa ortak grubu olan üyeler (`can_read_avatar`). Yazma: yalnızca kendi klasörü ve benzersiz dosya adı.
- **Kötüye kullanım sınırları:** Günde 20 geri bildirim, günde 30 grup yorumu, kişi başı 10 grup / 10 kayıtlı arama, grup başı 200 üye, başvuru başı 20 ortak yazar.
- **Gizli anahtarlar:** Takvim anahtarları AES-256-GCM ile şifreli. VAPID ve yedek şifresi yalnızca GitHub secret'larında. Haftalık yedek yüklenmeden önce AES-256 ile şifrelenir ve CI'da çözülüp doğrulanır.
- **Bildirim yoğunluğu:** Telefon bildirimi kullanıcı başına tek özet ve cihaz başına 8 saatte en fazla 1 (günde ≤2). Yorum ve ortak yazar güncellemeleri günde 1 mesajla sınırlı.

## Klasörler

| Klasör | İçerik |
|---|---|
| `web/` | React 19 + Vite + TypeScript arayüzü (GitHub Pages, PWA; ikincil sayfalar ve harita ihtiyaç anında yüklenir; açık çağrı listesi tarayıcıda saklanıp açılışta anında gösterilir, arka planda yenilenir) |
| `web/public/sw.js` | Service worker: kabuk önbelleği, push bildirimi gösterme ve tıklama |
| `jobs/src/` | 12 saatlik iş: `fetch`, `merge`, `quality`, `core`, `sjr`, `geocode`, `dispatch`, `reminders`, `savedSearches`, `push`, `email`, `maintenance`, `adminReport` |
| `jobs/src/sources/` | Kaynak ayrıştırıcıları: `ccf`, `wikicfp`, `comsoc`, `ieeejournals`, `turkiye` |
| `shared/` | Site ve iş tarafında ortak: konular (`topics`), TÜBİTAK dönemleri (`tubitak`), Türkiye serileri (`turkiye`), filtre kuralları (`filters`), dikkat işaretleri (`caution`) |
| `supabase/migrations/` | Veritabanı şeması, RLS ve depo politikaları, RPC'ler, tetikleyiciler |
| `supabase/functions/` | Edge Functions: `respond`, `save-calendar-token`, `ics`, `unsubscribe`, `delete-account` (fotoğrafı da siler); ortak takvim ve şifreleme kodu `_shared/` |
| `.github/workflows/` | `sync` (12 saatlik iş + keepalive), `backup` (haftalık şifreli yedek), `deploy-web`, `deploy-supabase`, `e2e`, `ui-test` |

## Testler

| Test | Kapsam |
|---|---|
| `jobs/test` (birim) | Kaynak ayrıştırıcıları, tarih/saat dilimi, birleştirme, CORE/SJR eşleştirme, kalite işaretleri ve toplu konferans kümeleri, TÜBİTAK, Türkiye serileri, konum/ülke tanıma, hatırlatma eşikleri, kayıtlı aramalar, "Senin için", dışa aktarma, push ve e-posta metinleri |
| `jobs/e2e` (`e2e.yml`) | Canlı veritabanında geçici kullanıcılarla yetki ve gizlilik kontrolleri: RLS, gruplar, yorumlar, başvurular ve ortak yazarlar, duyurular, seriler, kayıtlı aramalar, push abonelikleri, fotoğraf deposu ve onay akışı, yönetici yetkileri, hesap silme |
| `jobs/e2e/ui.ts` (`ui-test.yml`) | Playwright ile masaüstü ve iPhone görünümünde uçtan uca arayüz testleri, ekran görüntüleriyle |

## Kurulum

Adım adım rehber: **[KURULUM.md](KURULUM.md)**

## Bilinen sınırlar

- **Kaynaklar:** IEEE'nin resmi konferans arama sitesi, MDPI, Elsevier ve Springer otomatik erişimi engelliyor; bu yayıncıların çağrılarının önemli kısmı WikiCFP üzerinden geliyor. Türkiye konferansları bu kaynaklarda çoğunlukla yok; `shared/turkiye.ts` elle güncellenir.
- **Başvuru başlangıç tarihi:** Kaynakların çoğu yalnızca son tarihi yayınlıyor. Başlangıç tarihi yoksa çağrının ilk görüldüğü gün "başvuru açıldı" kabul edilir.
- **Google doğrulaması:** Takvim izni hassas kapsam olduğu için, Google doğrulaması tamamlanana kadar takvim bağlama en fazla 100 kullanıcıyla sınırlı.
- **Bildirimler anlık değil:** Mesajlar ve telefon bildirimleri 12 saatlik işle gider.
- **Kalite işaretleri sezgiseldir:** Toplu konferans kuralı meşru bir çatı konferansı yanlışlıkla işaretleyebilir; muaf listesi `REPUTABLE_UMBRELLA` (`jobs/src/quality.ts`).
- **Konumlar yaklaşıktır:** Harita konumları etkinlik yeri metninden otomatik çıkarılır; ülke tutmazsa konum kullanılmaz.
- **Google profil fotoğrafı** onaydan geçmediği için yalnızca sahibine gösterilir; gruplarda yalnızca yüklenip onaylanan fotoğraf görünür.
- Tarihleri her zaman resmi çağrı sayfasından doğrulayın.
