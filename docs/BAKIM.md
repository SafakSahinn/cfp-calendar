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

## Bilinmesi gerekenler

- **GitHub zamanlanmış işleri:** Public repoda 60 gün boyunca hiç commit olmazsa GitHub 12 saatlik `sync.yml` işini kendiliğinden devre dışı bırakır. Actions sekmesinde uyarı çıkar; **Enable workflow** ile yeniden açılır.
- **Supabase ücretsiz katman:** 7 gün hiç istek gelmezse proje uyku moduna geçer. 12 saatlik iş veritabanına yazdığı sürece bu olmaz.
- **Google doğrulaması:** Doğrulanmadan takvim bağlama en fazla 100 kullanıcıyla sınırlıdır (bkz. [KURULUM.md](KURULUM.md) §3).
- **E-posta:** `SMTP_USER` / `SMTP_PASS` secret'ları yoksa haftalık özet ve yönetici raporu sessizce atlanır; site normal çalışır.
- **OpenStreetMap Nominatim:** Saniyede en fazla 1 istek kuralına uyulur, sonuçlar `geocache` tablosunda saklanır. Bulunamayan yerler 30 gün sonra yeniden denenir.
