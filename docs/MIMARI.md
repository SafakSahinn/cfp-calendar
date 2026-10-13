# Mimari

CFP Calendar'ın nasıl çalıştığı, klasör yapısı, testler ve bilinen sınırlar. Kurulum için [KURULUM.md](KURULUM.md), bakım işleri için [BAKIM.md](BAKIM.md).

## Genel yapı

```mermaid
flowchart LR
  U(["👤 Kullanıcı<br/>tarayıcı / telefon"])

  subgraph SRC["📥 Veri kaynakları"]
    S1["ccf-deadlines"]
    S2["WikiCFP"]
    S3["IEEE ComSoc · Computer Society<br/>Sensors · JBHI"]
    S4["CORE · SCImago SJR"]
  end

  subgraph GH["GitHub"]
    P["🌐 GitHub Pages<br/>React arayüz"]
    A["⚙️ GitHub Actions<br/>12 saatte bir"]
  end

  subgraph SB["Supabase (Frankfurt)"]
    AUTH["🔐 Auth"]
    DB[("🗄️ Postgres + RLS")]
    F["⚡ Edge Functions"]
  end

  subgraph EXT["Dış servisler"]
    G["📅 Google Calendar"]
    OSM["🗺️ OpenStreetMap"]
    M["✉️ Gmail SMTP"]
  end

  S1 & S2 & S3 & S4 --> A
  A -- "çağrılar, bildirimler,<br/>seriler, koordinatlar" --> DB
  A -- "konum çözümleme" --> OSM
  A -- "takvime ekle / güncelle" --> G
  A -- "haftalık özet,<br/>yönetici raporu" --> M
  U --> P
  P -- "giriş" --> AUTH
  P -- "okuma, RPC" --> DB
  P -- "İlgileniyorum, takvim bağla, ICS" --> F
  P -- "harita karoları" --> OSM
  F --> G
  F --> DB
```

### Bir çağrıyı takip edince ne olur?

```mermaid
sequenceDiagram
  autonumber
  actor K as Kullanıcı
  participant W as Site
  participant DB as Veritabanı
  participant J as 12 saatlik iş
  participant G as Google Takvim

  K->>W: ⭐ Takip et
  W->>DB: interests kaydı
  loop her 12 saatte
    J->>DB: kaynaklardan güncel tarihleri yaz
    J->>DB: başvurusu açılan takipli çağrılar?
    alt başvuru açıldı
      J->>DB: 📝 "Başvuru açıldı" mesajı
      J->>G: başvuru başlangıcı, özet, son başvuru kayıtları
    else son tarih değişti
      J->>DB: 🔄 "Son tarih değişti" mesajı
      J->>G: kayıtları güncelle
    end
  end
  K->>W: Mesajlar → İlgileniyorum
  W->>G: konferans günlerini ekle (Edge Function)
```

GitHub Pages yalnızca statik dosya sunduğu için üyelik, veritabanı ve gizli anahtarlar Supabase'te tutulur. Tüm yetki kontrolleri veritabanında (Row Level Security + `SECURITY DEFINER` fonksiyonlar) yapılır; takvim erişim anahtarları AES-256-GCM ile şifrelenir. Proje tamamen ücretsiz katmanlarda çalışır.

| Klasör | İçerik |
|---|---|
| `web/` | React 19 + Vite + TypeScript arayüzü (GitHub Pages) |
| `jobs/` | Veri çekme, birleştirme, derecelendirme, konum çözümleme, bildirim/takvim dağıtımı, e-postalar (Node.js) |
| `jobs/src/sources/` | Kaynak ayrıştırıcıları (ccf, WikiCFP, ComSoc, IEEE dergileri) |
| `supabase/migrations/` | Veritabanı şeması, RLS politikaları, RPC'ler |
| `supabase/functions/` | Edge Functions (`respond`, `save-calendar-token`, `ics`, `unsubscribe`, `delete-account`) ve ortak takvim/şifreleme kodu |
| `shared/` | Konu sınıflandırması ve TÜBİTAK dönemleri (arayüz + jobs) |
| `.github/workflows/` | 12 saatlik veri işi, site ve Supabase yayınlama, testler |

## Testler

| Test | Kapsam |
|---|---|
| `jobs/test` (birim) | Kaynak ayrıştırıcıları, tarih/saat dilimi, birleştirme, CORE/SJR eşleştirme, kalite işaretleri, TÜBİTAK, e-posta şablonları |
| `jobs/e2e` (`e2e.yml`) | Canlı veritabanında geçici kullanıcılarla yetki ve gizlilik kontrolleri: RLS, gruplar, başvurular, duyurular, seriler |
| `jobs/e2e/ui.ts` (`ui-test.yml`) | Playwright ile masaüstü ve iPhone görünümünde uçtan uca arayüz testleri, ekran görüntüleriyle |

## Kurulum

Adım adım rehber: **[KURULUM.md](KURULUM.md)**

## Bilinen sınırlar

- **Kaynaklar:** IEEE'nin resmi konferans arama sitesi, MDPI, Elsevier ve Springer otomatik erişimi engelliyor. Bu yayıncıların çağrılarının önemli kısmı WikiCFP üzerinden geliyor.
- **Başvuru başlangıç tarihi:** Kaynakların çoğu yalnızca son tarihi yayınlıyor. Başlangıç tarihi yoksa çağrının ilk görüldüğü gün "başvuru açıldı" kabul edilir.
- **Google doğrulaması:** Takvim izni hassas kapsam olduğu için, Google doğrulaması tamamlanana kadar takvim bağlama en fazla 100 kullanıcıyla sınırlı.
- **Konumlar yaklaşıktır:** Harita konumları etkinlik yeri metninden otomatik çıkarılır.
- Tarihleri her zaman resmi çağrı sayfasından doğrulayın.
