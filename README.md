# Web TÜFE

Web'den toplanan fiyatlarla **günlük** tüketici fiyat endeksi. [webtufe.com](https://www.webtufe.com)'un
yayımlanmış yöntemini olabildiğince aynen uygular. Amaç, resmi aylık TÜFE'ye ek olarak günlük
güncellenen bir fiyat göstergesi ve deflatör elde etmek.

## Durum (12 Kasım 2026)

| Parça | Durum |
|---|---|
| TÜİK 2026 sepeti ve ağırlıkları (428 madde, 174 alt sınıf) | ✅ TÜİK veri portalından otomatik çekiliyor |
| Endeks motoru (Jevons + zincirleme Laspeyres + aylık) | ✅ Yazıldı, 46 test geçiyor |
| Ana gruplar, COICOP düzeyleri, özel göstergeler (B, C, D, E, mallar/hizmet…) | ✅ Var (özel göstergeler yaklaşık, bkz. aşağı) |
| Market ürünleri → TÜİK maddesi eşleme kuralları | ✅ 164 madde, sepet ağırlığının %27,7'si (gıdanın tamamı) |
| marketfiyati.org.tr toplayıcısı | ✅ 12.11.2026'da kullanıcı kararıyla açıldı; 3 şehir, istekler arası 2 sn, ilk gün toplanıyor |
| Diğer kaynaklar (giyim, enerji, ulaştırma, hizmetler…) | ⏳ Yapılacak |
| Zamanlama (her gün otomatik) | ✅ GitHub Actions, her gün 09:17 (bkz. "Günlük otomatik çalışma") |

**Kaynak notu.** İlk denemede (12.11.2026) saniyede ~2 istekle toplarken marketfiyati.org.tr
sunucusu istemcimizi yaklaşık 1 dakika sonra geçici olarak engelledi. Sitenin kullanım koşulları
içeriğin TÜBİTAK BİLGEM'in yazılı izni olmadan kullanılmasını kısıtlıyor; kullanıcı koşulları
okuyup toplamaya engel görmediğini belirterek toplayıcıyı açtı. Hız 2 saniyede bir isteğe
düşürüldü. Sorgu başına sayfa sınırı 8'e indirildiği için şehir başına süre yaklaşık 45-60 dakika.
Toplayıcı yalnızca `toplama.izinler.marketfiyati: true` iken çalışır.

## Yöntem

Kaynaklar: Gedik Yatırım, *Enflasyon Görünümü Kasım 2025* (Web TÜFE metodoloji kutusu);
Web TÜFE, *PCE Metodolojisi ile Uyarlanması* teknik dokümanı (Mayıs 2026); E. Ocakverdi,
*Enflasyondaki yavaşlamayı günlük fiyatlardan takip etmek* (Eylül 2026).

| Adım | Web TÜFE | Bu proje |
|---|---|---|
| Sepet | TÜİK sepetindeki maddeler; web'den derlenebilen 337/407 madde, ağırlıklar 100'e tamamlanır | TÜİK 2026 sepeti (428 madde); kapsanmayan maddelerin ağırlığı kapsananlara orantılı dağıtılır, kapsam oranı her seri için raporlanır |
| Ağırlık | 2022 madde ağırlıkları + 2025 temel başlık ağırlıkları | TÜİK 2026 **alt sınıf** ağırlıkları (resmi). TÜİK madde ağırlığı yayımlamıyor; alt sınıf ağırlığı maddelere **eşit** dağıtılır. `config/madde_agirliklari.csv` ile değiştirilebilir |
| Madde endeksi | Her gün fiyatlar önceki güne oranlanır, madde içinde **geometrik ortalama** alınır | Aynı (zincirleme Jevons). Gözlem birimi = konum × zincir × ürün. Ürün en çok 7 gün önceki son fiyatıyla eşleşir. Oranı 2,5 katı aşan değişimler aykırı sayılıp atılır |
| Üst düzey | Zincirleme **Laspeyres**; Ocak'ta yeni ağırlıklar, 31 Aralık bağlantı günü | Aynı. Yıl içinde kapsama giren madde, girdiği güne kadar serinin seyrini izlemiş sayılır (seri kırılmaz) |
| Baz | 31.12.2024 = 100 | İlk toplama günü = 100 (geçmiş fiyat çekilemiyor) |
| Aylık | Ayın ilk 24 gününün geometrik ortalaması, ayın 24'ünde kesinleşir | Aynı (`config/ayarlar.yaml` → `aylik_son_gun`, `aylik_ortalama`) |
| Kaynaklar | Online süpermarketler, fiyat karşılaştırma siteleri, e-ticaret, kamu ve belediye siteleri, hizmet uygulamaları; günde 1 milyondan fazla fiyat | Şimdilik yalnızca market toplayıcısı (kapalı) |
| Çekirdek göstergeler | B, C, D, E, F, mevsimlik ürünler hariç | B, C, D, E, mevsimlik hariç, mallar/hizmet, enerji, işlenmiş/işlenmemiş gıda. **Yaklaşık**: TÜİK COICOP 2018 için madde listesini yayımlamadı. F (yönetilen fiyatlar) yok |

Henüz olmayanlar: mevsimsel madde giriş-çıkışı (ör. Kasım'da sepete giren nar, kivi),
mevsimsellikten arındırma, F göstergesi, TÜİK alt sınıf değişimleriyle (TT02) karşılaştırma raporu.

## Kurulum ve kullanım

```bash
cd ~/web-tufe
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/webtufe sepet --yil 2026   # TÜİK sepetini indir
.venv/bin/webtufe topla              # fiyatları topla (izin gerekli, bkz. yukarı)
.venv/bin/webtufe esle               # eşleme raporu: data/cikti/eslesme_marketfiyati.csv
.venv/bin/webtufe hesapla            # data/cikti/gunluk.parquet, aylik.csv
.venv/bin/webtufe rapor
.venv/bin/webtufe mansetler          # gerçek fiyatlardan günün manşetleri: data/cikti/mansetler_gercek.csv
.venv/bin/python -m pytest           # testler
```

## Günlük otomatik çalışma

GitHub Actions iş akışı `.github/workflows/gunluk.yml` her gün **09:17**'de (İstanbul) çalışır.
GitHub zamanlanmış işleri yoğun saatlerde bir saate kadar geciktirebilir. İş sırasıyla şunları yapar:

1. Testleri çalıştırır.
2. Yılın TÜİK sepeti yoksa indirmeyi dener (Ocak'ta yeni sepet için).
3. Fiyatları toplar (`webtufe topla`, 3 şehir, yaklaşık 85 dakika).
4. Endeksleri ve manşetleri yeniden hesaplar (`webtufe hesapla`, `webtufe mansetler`).
5. `data/ham`, `data/cikti` ve `data/referans` altındaki değişiklikleri depoya kaydeder.
   Endeks hesabı hata verse bile toplanan ham fiyatlar kaydedilir.

- Toplama tamamlanamazsa iş "başarısız" görünür ve GitHub e-postayla bildirir.
- Aynı gün ikinci kez çalışırsa toplanmış şehirleri atlar.
- Elle çalıştırmak için GitHub'da **Actions → Günlük fiyat toplama → Run workflow**. `erisim_testi`
  modu siteye yalnızca birkaç istek atıp erişimi dener, bir şey kaydetmez.
- Herkese açık depolarda GitHub, 60 gün hiç etkinlik olmazsa zamanlanmış işleri kapatır. Günlük
  veri kayıtları etkinlik sayılır.

**Panodaki manşetler.** Pano bir Claude artifact'i olduğundan GitHub onu doğrudan güncelleyemez.
Claude uygulamasındaki zamanlanmış görev **"webtufe-pano-mansetleri"** her gün 11:30'da (yetişmezse
15:30'da) önce `git pull` ile GitHub'daki son veriyi alır, sonra `data/cikti/mansetler_gercek.csv`
dosyasını panoya yükler. Görev `scripts/pano_manset.py durum` ile dosyanın o günün toplamasından
geldiğini ve daha önce yüklenmediğini kontrol eder; yüklenen dosyanın kimliği yalnızca bu
bilgisayarda, `data/cikti/pano_durum.json` dosyasında tutulur. Görev Mac ve Claude uygulaması
açıkken çalışır; Mac kapalı olduğu günler pano güncellenmez ama veri toplanmaya devam eder.

**Yerelde çalıştırma.** `scripts/gunluk.sh` aynı adımları bir Mac'te çalıştırır (önceden launchd ile
her gün 09:00'da çalışıyordu). GitHub ile aynı gün iki kez toplama yapılmaması için yerel iş kapalı
tutulmalı.

## Sentetik veri ve pano

Gerçek veri gelene kadar motor sentetik fiyatlarla denenebilir:

```bash
.venv/bin/python scripts/sentetik_veri.py
```

TÜİK 2026 sepetindeki 428 maddenin her biri için 3 ürün × 2 zincir × 2 konum, 31.12.2024–11.11.2026
arası günlük fiyat üretir (~3 milyon gözlem): yapışkan fiyatlar, geçici indirimler, taze
meyve-sebzede mevsimsellik, enerji tarifelerinde ve okul ücretlerinde dönemsel zamlar, seyrek
hatalı fiyatlar ve iki eksik gün. Sonuçlar `data/sentetik/cikti/`, panoya giden CSV'ler
`data/sentetik/pano/` altına yazılır.

Panonun yayındaki sayfası `pano/site/index.html` (site görünümü: üst menü, 6 bölüm, alt bilgi).
Parçalarından `.venv/bin/python pano/site/birlestir.py` ile birleştirilir: temel stil ve hesaplar
`pano/index.html`, yeni çizimler `pano/taslak/ek.js`, menü ve görünüm `pano/site/`.
Yerel deneme için `pano/test/` altında panonun çalışma ortamını taklit eden test sayfaları var.

## Dizinler

```
config/
  ayarlar.yaml                   endeks ve toplama ayarları, konumlar, kaynak izinleri
  eslestirme_marketfiyati.yaml   ürün adı/kategorisi -> TÜİK maddesi kuralları
  ozel_gostergeler.yaml          B, C, D, E vb. tanımları
data/
  referans/sepet_<yıl>.csv       TÜİK sepeti ve ağırlıklar
  ham/<kaynak>/tarih=…/          ham fiyat gözlemleri (değiştirilmez)
  cikti/                         endeksler
webtufe/
  tuik.py                        TÜİK veri portalı (JSON-stat, UserLang: tr)
  toplayicilar/                  kaynak başına bir toplayıcı
  eslestirme.py, metin.py        eşleme ve Türkçe metin normalleştirme
  endeks.py                      madde endeksi, Laspeyres zincirleme, aylık
  gostergeler.py                 seriler ve özel göstergeler
tests/
```

## Kaynak kuralları

- Her kaynak için önce `robots.txt` ve kullanım koşulları okunur; izin gerektiren kaynak
  `toplama.izinler` altında açıkça açılmadan çalışmaz.
- İstemci kimliği her zaman `webtufe/0.1` olarak gönderilir. Sunucu engellerse kimlik
  değiştirilmez; toplayıcı art arda 3 hatada kendini durdurur.
- İstekler arası en az 2 saniye beklenir.
