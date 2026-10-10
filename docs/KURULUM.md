# Kurulum Rehberi

Bu rehber projeyi sıfırdan canlıya almak için gereken **tek seferlik** adımları anlatır.
Toplam süre yaklaşık 45 dakikadır. Adımları sırayla yapın; her adımda not etmeniz gereken değerler **kalın** yazılmıştır.

> Örneklerde depo adresi `https://github.com/SafakSahinn/cfp-calendar`, site adresi
> `https://safaksahinn.github.io/cfp-calendar/` olarak geçer.

---

## 1. Supabase projesi

1. https://supabase.com → **New project**. Bölge: `Central EU (Frankfurt)`. Veritabanı şifresini kaydedin → **SUPABASE_DB_PASSWORD**
2. Proje açılınca **Project Settings → General**: **Reference ID** → **SUPABASE_PROJECT_REF** (ör. `abcdxyz`)
3. **Project Settings → API Keys**:
   - Project URL → **SUPABASE_URL** (`https://abcdxyz.supabase.co`)
   - `anon` / publishable anahtar → **SUPABASE_ANON_KEY** (herkese açık olabilir)
   - `service_role` / secret anahtar → **SUPABASE_SERVICE_ROLE_KEY** (⚠️ gizli; asla tarayıcıya koymayın)
4. https://supabase.com/dashboard/account/tokens → **Generate new token** → **SUPABASE_ACCESS_TOKEN**

OAuth geri dönüş adresiniz (sonraki adımlarda lazım):
```
https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

## 2. Token şifreleme anahtarı

Takvim token'ları veritabanında AES-256-GCM ile şifreli tutulur. Bir anahtar üretin:

```powershell
# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```
veya `openssl rand -base64 32` → **TOKEN_ENC_KEY**

⚠️ Bu anahtar değişirse kayıtlı tüm takvim bağlantıları geçersiz olur (kullanıcılar yeniden bağlamak zorunda kalır).

## 3. Google (giriş + Google Takvim)

1. https://console.cloud.google.com → yeni proje: `CFP Takvim`
2. **APIs & Services → Library** → **Google Calendar API** → *Enable*
3. **Google Auth Platform → Branding** (OAuth consent screen):
   - User type: **External**
   - Uygulama adı, destek e-postası, *Authorized domains*: `supabase.co` ve `safaksahinn.github.io`
4. **Data Access → Add or remove scopes**: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/calendar.events`
5. **Audience → Test users**: kendi Gmail adresinizi ve test edecek kişileri ekleyin
   (doğrulama tamamlanana kadar en fazla 100 test kullanıcısı)
6. **Clients → Create client → Web application**
   - Authorized JavaScript origins: `https://safaksahinn.github.io`, `http://localhost:5173`
   - Authorized redirect URIs: `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
   - → **GOOGLE_CLIENT_ID**, **GOOGLE_CLIENT_SECRET**

> **Yayına çıkış:** `calendar.events` "hassas" bir kapsam (sensitive scope). Herkese açmak için **Audience → Publish app**
> ve ardından Google doğrulaması gerekir: gizlilik politikası sayfası, uygulama tanıtım videosu, alan adı doğrulaması.
> Doğrulama gelene kadar test kullanıcıları dışındakiler "Google bu uygulamayı doğrulamadı" uyarısını görür.
> Sadece **giriş** (takvim izni olmadan) bu kısıttan etkilenmez.

## 4. Microsoft (giriş + Outlook Takvim)

1. https://entra.microsoft.com → **App registrations → New registration**
   - Ad: `CFP Takvim`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI (Web): `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
2. **Overview** → *Application (client) ID* → **MS_CLIENT_ID**
3. **Certificates & secrets → New client secret** (24 ay) → *Value* sütunu → **MS_CLIENT_SECRET**
   (⚠️ "Secret ID" değil, "Value"; süresi dolmadan yenileyin)
4. **API permissions → Add → Microsoft Graph → Delegated**:
   `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Calendars.ReadWrite`
5. **Token configuration → Add optional claim → ID → `email`** (Supabase e-posta ister)

## 5. Supabase kimlik doğrulama ayarları

Supabase Dashboard → **Authentication**:

1. **Sign In / Providers → Google**: Enable, Client ID + Secret (3. adım). *Skip nonce check*: açık.
2. **Sign In / Providers → Azure**: Enable, Client ID + Secret (4. adım),
   Azure Tenant URL: `https://login.microsoftonline.com/common/v2.0`
3. **Sign In / Providers → (en üst) User Signups**: *Allow manual linking* → **açık**
   (Google ile girip Outlook takvimi bağlayabilmek için)
4. **URL Configuration**
   - Site URL: `https://safaksahinn.github.io/cfp-calendar/`
   - Redirect URLs: `https://safaksahinn.github.io/cfp-calendar/`, `http://localhost:5173/cfp-calendar/`

## 6. GitHub ayarları

Depo → **Settings → Secrets and variables → Actions**

**Secrets** (gizli):

| Ad | Değer |
|---|---|
| `SUPABASE_URL` | 1. adım |
| `SUPABASE_SERVICE_ROLE_KEY` | 1. adım |
| `SUPABASE_ACCESS_TOKEN` | 1. adım |
| `SUPABASE_DB_PASSWORD` | 1. adım |
| `TOKEN_ENC_KEY` | 2. adım |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 3. adım |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | 4. adım |

**Variables** (açık):

| Ad | Değer |
|---|---|
| `SUPABASE_URL` | 1. adım (aynı değer) |
| `SUPABASE_ANON_KEY` | 1. adım |
| `SUPABASE_PROJECT_REF` | 1. adım |
| `SITE_URL` | `https://safaksahinn.github.io/cfp-calendar/` |

Sonra:

1. **Settings → Pages → Source: GitHub Actions**
2. **Actions** sekmesi → sırayla elle çalıştırın (*Run workflow*):
   1. `Supabase'e yayınla` → tabloları ve fonksiyonları kurar
   2. `Veri çek ve dağıt` → ilk veriyi çeker (~3 dk)
   3. `Siteyi yayınla` → siteyi GitHub Pages'e koyar

Bundan sonra her şey otomatik: `main`'e push edilen değişiklikler yayınlanır, veri 12 saatte bir yenilenir.

## 7. Yerelde geliştirme

```bash
# Arayüz
cd web
cp .env.example .env      # SUPABASE_URL ve ANON_KEY'i doldurun
npm install
npm run dev               # http://localhost:5173/cfp-calendar/

# Veri işleri
cd jobs
npm install
npm test                  # ayrıştırıcı testleri (internet gerekmez)
npm run dry-run           # kaynakları dener, veritabanına yazmaz
# Gerçek çalıştırma için 6. adımdaki secret'ları ortam değişkeni olarak verin:
npm run job               # veya: npm run job -- fetch / dispatch
```

## Sorun giderme

| Belirti | Neden / Çözüm |
|---|---|
| Girişten sonra ana sayfaya dönmüyor | Supabase → URL Configuration'da site adresi eksik (sondaki `/` dahil) |
| "Takvim bağlanamadı: no_refresh_token" | Google izin ekranında takvim kutucuğu işaretlenmemiş; tekrar bağlayın |
| Microsoft girişinde "email" hatası | 4.5 adımı (email optional claim) yapılmamış |
| Takvime hiçbir şey eklenmiyor | Actions → `Veri çek ve dağıt` günlüğüne bakın; `invalid_grant` görürseniz kullanıcı izni geri çekmiştir |
| Zamanlanmış iş çalışmıyor | Depo 60 gün hareketsizse GitHub durdurur; iş akışındaki keepalive adımı bunu önler, durduysa Actions'tan yeniden etkinleştirin |
