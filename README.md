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
| Akaryakıt ve LPG fiyatları (EPDK) | ✅ 24.11.2026'dan beri her gün, 81 il; 8 firma ülke ortalaması 2023'ten. Endekse henüz girmiyor |
| İstanbul trafik hareketliliği (İBB) | ✅ 24.11.2026'dan beri her gün; saatlik seri Eylül 2024'ten, günlük arşiv 2015'ten |
| Diğer kaynaklar (giyim, enerji, ulaştırma, hizmetler…) | ⏳ Yapılacak |
| Zamanlama (her gün otomatik) | ✅ GitHub Actions, her gün 09:17 (bkz. "Günlük otomatik çalışma") |
| Pano ve Analiz Masası | ✅ Gerçek Web TÜFE verisi; resmi seriler TCMB EVDS bağlayıcısından canlı |

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
.venv/bin/webtufe pano               # pano ve Analiz Masası dosyaları: data/cikti/pano/*.csv
.venv/bin/webtufe akaryakit          # EPDK akaryakıt ve LPG fiyatları: data/ham/epdk/
.venv/bin/webtufe mobilite topla     # İBB trafik indeksi: data/ham/ibb_trafik/
.venv/bin/webtufe mobilite hesapla   # zorunlu ve isteğe bağlı hareketlilik: data/cikti/mobilite/
.venv/bin/webtufe haftalik --cikti x.json   # haftalık görünümün Web TÜFE verisi
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

**Pano ve Analiz Masası.** İkisi de Claude artifact'i olduğundan GitHub onları doğrudan
güncelleyemez. Claude uygulamasındaki zamanlanmış görev **"webtufe-pano-mansetleri"** her gün
11:30'da ve 15:30'da önce `scripts/git_guncelle.sh` ile GitHub'daki son veriyi alır (`git pull`
kilitle çalışır; Mac uyandığında kaçırılan görevler aynı anda başlayabildiği için), `webtufe pano` ile
sayfa dosyalarını üretir ve `scripts/pano_yukle.py durum` çıktısındaki dosyaları iki sayfaya yükler.
Bir dosya, verisi en son yüklenenden daha yeniyse yüklenir; GitHub zamanlanmış toplamayı saatlerce
(Kasım 2026'da 8-11 saat) geciktirebildiği için "bugünün verisi" şartı yoktur:
panoda ilgili veri kaynağını yeni dosyaya bağlar, Analiz Masası'nda `veri/guncel` belgesini yazar.
`data/cikti/pano/` depoya kaydedilmez; yüklenen dosyaların kimlikleri yalnızca bu bilgisayarda,
`data/cikti/pano_durum.json` dosyasında tutulur. Görevler Mac ve Claude uygulaması açıkken
çalışır; Mac kapalı olduğu günler sayfalar güncellenmez ama veri toplanmaya devam eder.

**Haftalık görünüm.** Zamanlanmış görev **"webtufe-haftalik-gorunum"** her pazartesi 12:30'da
(yetişmezse salı) `webtufe haftalik` ile haftanın Web TÜFE verisini hazırlar, EVDS bağlıysa resmi
göstergeleri ayrı veri olarak ekler, yorumu yazar ve Analiz Masası'nın `haftalik` koleksiyonuna
kaydeder. Rapordaki grafikler yalnızca bu verilerden çizilir.

**Yerelde çalıştırma.** `scripts/gunluk.sh` aynı adımları bir Mac'te çalıştırır (önceden launchd ile
her gün 09:00'da çalışıyordu). GitHub ile aynı gün iki kez toplama yapılmaması için yerel iş
18.11.2026'dan beri kapalı. GitHub'a erişilemezse yeniden açmak için:

```bash
launchctl enable gui/$(id -u)/local.webtufe.gunluk
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.webtufe.gunluk.plist
```

## Akaryakıt fiyatları (EPDK)

`webtufe akaryakit` (`webtufe/toplayicilar/epdk.py`), EPDK'nın herkese açık XML web servislerinden
(epdk.gov.tr > Akaryakıt Fiyatları) üç veri toplar. GitHub'daki günlük iş bunu market
toplamasından sonra çalıştırır; veri depoya kaydedilir ama **şimdilik Web TÜFE endeksine girmez**.

| Dosya | İçerik | Tarihçe |
|---|---|---|
| `data/ham/epdk/akaryakit_il/tarih=…/iller.parquet` | 81 ilde (İstanbul Anadolu 341, Avrupa 342 ayrı) her dağıtım firmasının her yakıt türü için geçerli bayi satış fiyatı ve fiyatın geçerlilik tarihi | Her gün alınan anlık görüntü |
| `data/ham/epdk/lpg_il/tarih=…/iller.parquet` | 81 ilde LPG firmalarının otogaz, tüplü ve dökme LPG fiyatları | Her gün |
| `data/ham/epdk/sekiz_firma.csv` | En yüksek işlem hacimli 8 firmanın ülke ortalaması bayi satış fiyatı (benzin, motorin, gazyağı, fuel oil, kalorifer yakıtı) | 1.1.2023'ten; eksik günler her çalışmada doldurulur |

- Fiyatlar, dağıtım şirketlerinin EPDK Bildirim Sistemi'ne yaptığı tavan/tavsiye bayi satış
  fiyatı beyanlarıdır; istasyondaki pompa fiyatına çok yakındır ama birebir aynı olmayabilir.
- İl servisi, fiyat bildirmeyi bırakmış firmaların yıllar önceki son fiyatlarını da döndürür;
  geçerlilik tarihi bir yıldan eski satırlar kaydedilmez. Analizde yine de geçerlilik tarihine bakın.
- Ayarlar `config/ayarlar.yaml` > `epdk`. İstekler arası 2 sn; servis art arda 5 kez hata verirse
  toplama durur. Tüm iller yaklaşık 15 dakika sürer.
- Opet de il ve ilçe bazında fiyat veriyor, ama kullanım koşulları içeriğin kopyalanmasını ve başka
  platformda yayımlanmasını yasakladığı için kullanılmadı (depo herkese açık).

## Trafik hareketliliği (İBB)

Amaç, tüketimle ilişkili hareketliliği işe ve okula gidiş gibi zorunlu hareketlilikten ayırmak.
Türkiye geneli için günlük ve açık trafik verisi yok; en sağlam kaynak İBB'nin İstanbul trafik
indeksi web servisi (İBB Açık Veri Lisansı: ticari kullanım dahil serbest, kaynak gösterilmeli).

- `webtufe mobilite topla` (`webtufe/toplayicilar/ibb_trafik.py`): saatlik seri (`saatlik.csv`,
  servis 800 güne kadar geriye, Eylül 2024'ten), 5 dakikalık seri (`5dk/YYYY-AA.csv`, her gün son
  2 gün) ve 2015-2024 günlük özet arşivi (`gunluk_arsiv.csv`, bir kez).
- `webtufe mobilite hesapla` (`webtufe/mobilite.py`): saatlik indeks gün tipine ve saat penceresine
  göre ayrılır; takvim `config/takvim.yaml` (resmi tatil, arife, bayram, MEB okul tatilleri).

| Pencere | Gün | Saat | Tür |
|---|---|---|---|
| zorunlu_sabah | iş günü | 06-09 | zorunlu (işe ve okula gidiş) |
| karma_aksam | iş günü | 16-19 | karma (eve dönüş ve akşam alışverişi) |
| is_gunu_ogle | iş günü | 10-15 | zayıf isteğe bağlı |
| is_gunu_gece | iş günü | 20-23 | isteğe bağlı |
| hafta_sonu_gunduz | Cmt-Paz | 11-19 | isteğe bağlı (en temiz sinyal) |
| hafta_sonu_gece | Cmt-Paz | 20-23 | isteğe bağlı |

Her pencere için yıllık değişim (52 hafta önceki aynı gün ±1 hafta) ve kısa vadeli sapma (son 8
haftanın aynı günleri) hesaplanır. Baz günleri resmi tatil, arife ve bayram çevresi olmamalı ve okul
durumu aynı olmalıdır; ara tatil haftası gibi karşılığı olmayan günlerde baz boş kalır.
`data/cikti/mobilite/pencereler.csv` günlük, `haftalik.csv` haftalık özettir (pencereler eşit ağırlıklı).

Sınırlar: indeks tıkanıklıktır, araç sayısı değil; akşam zirvesinde tavana yaklaşır. Gece
pencerelerinde indeks düşük olduğu için yüzde değişimler oynaktır. Kısa vadeli sapma mevsim
geçişlerinde (ör. Eylül'de şehre dönüş) yanıltır; yıllık değişim esas alınmalı. Yağmur ve kar için
hava düzeltmesi henüz yok. Yalnızca İstanbul.

## Pano ve Analiz Masası

- **Pano** (Web Fiyat Endeksi): 18.11.2026'dan beri gerçek Web TÜFE verisini gösterir. Bir yıllık
  veri birikene kadar açılışta yıllık enflasyon yerine "başlangıçtan bu yana" değişim görünür;
  aylık değişime dayanan göstergeler ilk tam aydan (Aralık 2026) sonra dolar.
- **Analiz Masası** (`pano/analiz/index.html`, ayrı artifact): Haftalık Görünüm, Soru Sor ve
  Raporlarım bölümleri. Soru Sor, soruyu soran kişinin Claude hesabıyla yanıtlanır; Claude, sayfanın
  Web TÜFE araçlarıyla (ve EVDS bağlıysa EVDS araçlarıyla) veri okur, grafikli kısa yanıt ya da
  whitepaper yazar. Grafikler yalnızca araçların döndürdüğü veriden çizilir. Raporlar kişiye
  özeldir (`data/users/<kişi>`), HTML olarak indirilebilir.
- **Resmi Göstergeler** (panoda ayrı bölüm): TÜİK TÜFE genel ve gıda (yıllık, aylık), ABD doları kuru,
  TCMB ağırlıklı ortalama fonlama maliyeti ve Piyasa Katılımcıları Anketi'nin 12 ay sonrası TÜFE
  beklentisi, EVDS bağlayıcısının `get_series_data` aracıyla her açılışta canlı okunur (sayfayı açan
  kişinin kendi EVDS bağlantısıyla). Sorguların bitiş tarihi 31.12.2027; 2028'den önce uzatılmalı.
  Analiz Masası da aynı bağlayıcıyla (`evds_kesfet`, `evds_seri_verisi` araçları) resmi seri okur.
- **Ayrım kuralı:** Web TÜFE ile resmi seriler (TÜİK TÜFE dahil, EVDS'den) hiçbir yerde tek seride
  birleştirilmez, zincirlenmez ya da ortalanmaz. Aynı grafiğe düşerlerse ayrı panellerde, kendi
  ölçekleriyle çizilir; her raporda kaynak tablosu ve uyarılar yer alır.
- Yerel deneme: `pano/test/olustur.py` (pano, gerçek veri) ve `pano/test/analiz_olustur.py`
  (Analiz Masası, sahte Claude ortamıyla) test sayfaları üretir.

## Sentetik veri

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
  ham/epdk/                      akaryakıt ve LPG fiyatları (EPDK)
  ham/ibb_trafik/                İstanbul trafik indeksi (İBB)
  cikti/mobilite/                zorunlu ve isteğe bağlı hareketlilik göstergeleri
  cikti/                         endeksler
  cikti/pano/                    sayfalara giden CSV'ler (depoya kaydedilmez)
webtufe/
  tuik.py                        TÜİK veri portalı (JSON-stat, UserLang: tr)
  toplayicilar/                  kaynak başına bir toplayıcı (marketfiyati, epdk)
  eslestirme.py, metin.py        eşleme ve Türkçe metin normalleştirme
  endeks.py                      madde endeksi, Laspeyres zincirleme, aylık
  gostergeler.py                 seriler ve özel göstergeler
  mansetler.py                   gerçek fiyatlardan günün manşetleri
  pano.py, haftalik.py           pano, Analiz Masası ve haftalık görünüm dosyaları
  mobilite.py                    trafik indeksinden hareketlilik göstergeleri
pano/site/, pano/analiz/         pano ve Analiz Masası sayfaları
tests/
```

## Kaynak kuralları

- Her kaynak için önce `robots.txt` ve kullanım koşulları okunur; izin gerektiren kaynak
  `toplama.izinler` altında açıkça açılmadan çalışmaz.
- İstemci kimliği her zaman `webtufe/0.1` olarak gönderilir. Sunucu engellerse kimlik
  değiştirilmez; toplayıcı art arda 3 hatada kendini durdurur.
- İstekler arası en az 2 saniye beklenir.
