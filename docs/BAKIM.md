# Bakım

Site kendi kendine çalışır; aşağıdakiler dönemsel olarak elle yapılması gereken işlerdir. Yönetici panelindeki **Özet → 🛠️ Bakım** kartı ve günlük yönetici raporu, zamanı gelenleri hatırlatır.

## Dönemsel işler

| Ne zaman | İş | Nasıl |
|---|---|---|
| TÜBİTAK yeni yılın 2224 takvimini açıklayınca (genelde Ocak) | Dönem tarihlerini güncelle | `shared/tubitak.ts` → `KNOWN_PERIODS` |
| Her yıl Haziran sonrası (yeni SJR listesi) | Dergi çeyreklerini yenile | scimagojr.com → *Journal Rankings* → **Download data** (tarayıcıyla; otomatik indirme Cloudflare'e takılır) → `cd jobs && npm run build-sjr -- "<csv yolu>"` → `jobs/data/sjr.json` commit |
| CORE yeni liste yayımlayınca | Canlı liste otomatik çekilir; sitesi erişilemezse `jobs/data/core-icore2026.csv` yedeği kullanılır | Yeni yedek için CSV'yi `jobs/data/` altına koy, `jobs/src/core.ts` içindeki dosya adını güncelle |
| Panel "Türkiye konferansları: … kontrol edilmeli" dediğinde | Serinin yeni yıl çağrısını ekle | Yönetim paneli → **Etkinlik ekle**, aynı kısaltmayla (ör. `SIU 2027`) — seriye otomatik bağlanır, takip edenlere mesaj gider. Ya da `shared/turkiye.ts` → ilgili serinin `editions` listesi. Yeni seri eklemek için de aynı dosya. |
| Bir kaynak "0 çağrı" uyarısı verirse | Sayfa yapısı değişmiş olabilir | Actions günlüğünde `UYARI` satırına bak, `jobs/src/sources/` altındaki ayrıştırıcıyı güncelle |

## Elle çalıştırma

```bash
gh workflow run sync.yml                      # tam güncelleme (veri + konum + bildirim + e-posta)
gh workflow run sync.yml -f step=fetch        # sadece veri çek
gh workflow run sync.yml -f step=geocode      # sadece harita konumlarını çözümle (çalışma başına 200 yer)
gh workflow run sync.yml -f step=email -f test_to_admin=true -f force_weekly=true   # haftalık özeti sadece yöneticiye dene
gh workflow run e2e.yml                       # yetki/gizlilik testleri
gh workflow run ui-test.yml                   # tarayıcı testleri (ekran görüntüleri artifact olarak)
```

## Yedekten geri yükleme

Her pazar `backup.yml` veritabanının tamamını (şema, veriler, kullanıcı hesapları) döker, **AES-256 ile şifreler** ve Actions sayfasında 90 gün saklar (`cfp-calendar-backup-YYYY-MM-DD`). Her yedek, yüklenmeden önce CI'da çözülüp içeriği kontrol edilir. Şifre GitHub'da `BACKUP_PASSPHRASE` secret'ıdır; GitHub secret'ları geri okunamadığı için şifrenin bir kopyası **parola yöneticinizde** olmalı.

1. Actions → *Veritabanı yedeği* → istenen çalışma → **Artifacts** bölümünden dosyayı indirin.
2. Şifreyi çözün: `gpg -d cfp-calendar-backup-YYYY-MM-DD.tar.gz.gpg | tar -xzf -` (şifre sorulur).
3. Yeni/boş bir Supabase projesine sırayla yükleyin: `psql "<bağlantı adresi>" -f schema.sql`, sonra `auth.sql`, sonra `data.sql`.
4. GitHub değişkenlerini/secret'larını yeni projeye göre güncelleyin (bkz. KURULUM.md).

Yedek kişisel veri (e-posta adresleri, şifreli takvim anahtarları) içerir: şifresi çözülmüş dosyaları işiniz bitince silin.

## Bilinmesi gerekenler

- **GitHub zamanlanmış işleri:** Public repoda 60 gün commit olmazsa GitHub zamanlanmış işleri kapatır. `sync.yml` her çalışmada kendini API ile yeniden etkinleştirir (keepalive, commit atmaz). Yine de kapanırsa Actions sekmesinden **Enable workflow**.
- **Supabase ücretsiz katman:** 7 gün hiç istek gelmezse proje uyku moduna geçer. 12 saatlik iş veritabanına yazdığı sürece bu olmaz.
- **Google doğrulaması:** Doğrulanmadan takvim bağlama en fazla 100 kullanıcıyla sınırlıdır (bkz. [KURULUM.md](KURULUM.md) §3).
- **E-posta:** `SMTP_USER` / `SMTP_PASS` secret'ları yoksa hiçbir bildirim e-postası gitmez. Girilirse **sadece yönetici raporu** ve geri bildirim iletimi başlar; üyelere özet e-postası için ayrıca GitHub değişkeni `MEMBER_EMAILS=on` gerekir (açılınca profilde e-posta ayarları da görünür; site yeniden yayınlanmalı). Hesap onay / şifre sıfırlama e-postaları bundan bağımsızdır (Supabase SMTP).
- **Anlık bildirim (Web Push):** VAPID anahtar çifti GitHub'da (`VAPID_PUBLIC_KEY` değişkeni, `VAPID_PRIVATE_KEY` secret). **Değiştirmeyin**; değişirse tüm cihaz abonelikleri geçersiz olur ve kullanıcıların bildirimleri yeniden açması gerekir. Bildirimler 12 saatlik işle gider (anlık değil, en geç 12 saat). İptal edilmiş abonelikler otomatik silinir.
- **OpenStreetMap Nominatim:** Saniyede en fazla 1 istek kuralına uyulur, sonuçlar `geocache` tablosunda saklanır. Bulunamayan yerler 30 gün sonra yeniden denenir.
