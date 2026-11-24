"""EPDK akaryakıt ve LPG fiyatları toplayıcısı.

Kaynak: Enerji Piyasası Düzenleme Kurumu'nun herkese açık XML (SOAP) web servisleri
(epdk.gov.tr > Akaryakıt Fiyatları). Kurum bu servisleri makineyle okunmak üzere yayımlıyor;
robots.txt ya da kullanım kısıtı yok. İstemci kimliği açıkça "webtufe" olarak gönderilir.

  bildirimPetrolAkaryakitFiyatlari  sorguNo 72, parametre: il trafik kodu
      İldeki her dağıtım firmasının her yakıt türü için GEÇERLİ bayi satış fiyatı ve bu fiyatın
      geçerlilik tarihi. Tarih parametresi yok; her gün alınan anlık görüntü tarihçeyi oluşturur.
  bildirimPetrol8FirmaBulten  sorguNo 71, parametre: tarih (GG/AA/YYYY)
      En yüksek işlem hacimli 8 firmanın o günkü ortalama bayi satış fiyatı (ülke geneli).
      Tarihle sorgulandığı için eksik günler sonradan doldurulabilir.
  bildirimLPGTarife  sorguNo 54, parametreler: tarih (GG/AA/YYYY), il trafik kodu
      İldeki LPG firmalarının otogaz, tüplü ve dökme LPG fiyatları.

İstanbul için il kodu 341 (Anadolu yakası) ve 342 (Avrupa yakası); 34 boş döner.

İl servisi, fiyat bildirmeyi bırakmış firmaların yıllar önceki son fiyatlarını da döndürür (Kasım
2026'da satırların yaklaşık üçte ikisi 2016-2021 tarihliydi). Geçerlilik tarihi toplama gününden
ESKI_FIYAT_GUN günden eski satırlar kaydedilmez.

Fiyatlar dağıtım şirketlerinin EPDK Bildirim Sistemi'ne yaptığı tavan/tavsiye bayi satış fiyatı
beyanlarıdır; istasyondaki pompa fiyatına çok yakındır ama birebir aynı olmayabilir.

Çıktı (data/ham/epdk/):
  akaryakit_il/tarih=YYYY-AA-GG/iller.parquet   il x firma x yakıt, geçerlilik tarihiyle
  lpg_il/tarih=YYYY-AA-GG/iller.parquet         il x firma x LPG ürünü
  sekiz_firma.csv                                tarih x yakıt (ülke ortalaması), eksik günler doldurulur
"""

from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import yaml

from ..ayarlar import CONFIG, HAM

log = logging.getLogger(__name__)

KAYNAK = "epdk"
ADRES = "https://lisansws.epdk.gov.tr/services/"
ISTEMCI = "webtufe/0.1 (fiyat endeksi arastirmasi; +https://github.com/javahasan/web-tufe)"
TR = ZoneInfo("Europe/Istanbul")
DIZIN = HAM / KAYNAK
# Geçerlilik tarihi bundan eski il fiyatları (faaliyeti biten firmalar) kaydedilmez
ESKI_FIYAT_GUN = 365

# İl trafik kodu -> ad (İstanbul iki yaka ayrı)
IL_ADLARI = {
    1: "Adana", 2: "Adıyaman", 3: "Afyonkarahisar", 4: "Ağrı", 5: "Amasya", 6: "Ankara", 7: "Antalya",
    8: "Artvin", 9: "Aydın", 10: "Balıkesir", 11: "Bilecik", 12: "Bingöl", 13: "Bitlis", 14: "Bolu",
    15: "Burdur", 16: "Bursa", 17: "Çanakkale", 18: "Çankırı", 19: "Çorum", 20: "Denizli", 21: "Diyarbakır",
    22: "Edirne", 23: "Elazığ", 24: "Erzincan", 25: "Erzurum", 26: "Eskişehir", 27: "Gaziantep",
    28: "Giresun", 29: "Gümüşhane", 30: "Hakkari", 31: "Hatay", 32: "Isparta", 33: "Mersin",
    341: "İstanbul (Anadolu)", 342: "İstanbul (Avrupa)", 35: "İzmir", 36: "Kars", 37: "Kastamonu",
    38: "Kayseri", 39: "Kırklareli", 40: "Kırşehir", 41: "Kocaeli", 42: "Konya", 43: "Kütahya",
    44: "Malatya", 45: "Manisa", 46: "Kahramanmaraş", 47: "Mardin", 48: "Muğla", 49: "Muş",
    50: "Nevşehir", 51: "Niğde", 52: "Ordu", 53: "Rize", 54: "Sakarya", 55: "Samsun", 56: "Siirt",
    57: "Sinop", 58: "Sivas", 59: "Tekirdağ", 60: "Tokat", 61: "Trabzon", 62: "Tunceli", 63: "Şanlıurfa",
    64: "Uşak", 65: "Van", 66: "Yozgat", 67: "Zonguldak", 68: "Aksaray", 69: "Bayburt", 70: "Karaman",
    71: "Kırıkkale", 72: "Batman", 73: "Şırnak", 74: "Bartın", 75: "Ardahan", 76: "Iğdır", 77: "Yalova",
    78: "Karabük", 79: "Kilis", 80: "Osmaniye", 81: "Düzce",
}


@dataclass
class EpdkAyarlari:
    istek_arasi_saniye: float = 2.0
    zaman_asimi_saniye: float = 90.0
    yeniden_deneme: int = 3
    ardisik_hata_siniri: int = 5
    sekiz_firma_baslangic: str = "2023-01-01"
    sekiz_firma_azami_gun: int = 1500
    iller: str | list = "hepsi"

    def il_kodlari(self) -> list[int]:
        if self.iller in (None, "hepsi"):
            return list(IL_ADLARI)
        return [int(k) for k in self.iller]


def ayarlari_yukle() -> EpdkAyarlari:
    yol = CONFIG / "ayarlar.yaml"
    ham = yaml.safe_load(yol.read_text(encoding="utf-8")) if yol.exists() else {}
    return EpdkAyarlari(**(ham.get("epdk") or {}))


class ToplamaDurduruldu(RuntimeError):
    """Servis art arda hata verdi; toplama durduruldu."""


# ------------------------------------------------------------------ yanıt çözümleme (saf işlevler)

def _zarf(sorgu_no: int, parametreler: list[str]) -> bytes:
    p = "".join(f"<parametreler>{x}</parametreler>" for x in parametreler)
    return (
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
        'xmlns:gen="http://genel.service.ws.epvys.g222.tubitak.gov.tr/"><soapenv:Header/><soapenv:Body>'
        f"<gen:genelSorgu><sorguNo>{sorgu_no}</sorguNo>{p}</gen:genelSorgu></soapenv:Body></soapenv:Envelope>"
    ).encode("utf-8")


def zarf_ici(soap: str) -> str:
    """SOAP yanıtındaki <return> içeriğini (kaçışlı XML metni) döndürür; hata zarfında istisna atar."""
    kok = ET.fromstring(soap)
    for e in kok.iter():
        if e.tag.endswith("Fault"):
            mesaj = next((x.text for x in e.iter() if x.tag.endswith("faultstring")), "") or "SOAP hatası"
            raise ValueError(mesaj.strip())
    for e in kok.iter():
        if e.tag == "return" or e.tag.endswith("}return"):
            return (e.text or "").strip()
    raise ValueError("Yanıtta <return> yok.")


def _metin(e: ET.Element, ad: str) -> str | None:
    x = e.find(ad)
    return x.text.strip() if x is not None and x.text is not None else None


def _sayi(s: str | None) -> float | None:
    try:
        return float(s) if s not in (None, "") else None
    except ValueError:
        return None


def il_akaryakit_coz(ic: str) -> list[dict]:
    if not ic:
        return []
    satirlar = []
    for e in ET.fromstring(ic):
        satirlar.append({
            "gecerlilik_tarihi": (_metin(e, "Tarih") or "")[:10] or None,
            "yakit_tipi": _metin(e, "YakitTipi"),
            "il": _metin(e, "Il"),
            "firma": _metin(e, "FirmaMarkasi"),
            "fiyat": _sayi(_metin(e, "Fiyat")),
        })
    return satirlar


def sekiz_firma_coz(ic: str) -> list[dict]:
    if not ic:
        return []
    return [{"yakit_tipi": _metin(e, "YakitTipi"), "birim": _metin(e, "Birim"), "fiyat": _sayi(_metin(e, "Fiyat"))}
            for e in ET.fromstring(ic)]


def lpg_coz(ic: str) -> list[dict]:
    """<Results><Metadata><Column><number/><name/>..</Metadata><Table><Row><c1/>.. biçimi."""
    if not ic:
        return []
    kok = ET.fromstring(ic)
    adlar = {f"c{_metin(c, 'number')}": _metin(c, "name") for c in kok.iter("Column")}
    satirlar = []
    for r in kok.iter("Row"):
        d = {adlar.get(h.tag, h.tag): (h.text or "").strip() for h in r}
        satirlar.append({"urun": d.get("yakitTuru"), "firma": d.get("lisansUnvani"), "fiyat": _sayi(d.get("fiyat"))})
    return satirlar


# ------------------------------------------------------------------ istemci

class EpdkIstemci:
    def __init__(self, ayar: EpdkAyarlari):
        self.ayar = ayar
        self.oturum = requests.Session()
        self.oturum.headers.update({"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"genelSorgu"',
                                    "User-Agent": ISTEMCI})
        self._son = 0.0
        self.ardisik_hata = 0

    def sorgu(self, servis: str, sorgu_no: int, parametreler: list[str]) -> str:
        for deneme in range(1, self.ayar.yeniden_deneme + 1):
            bekle = self.ayar.istek_arasi_saniye - (time.monotonic() - self._son)
            if bekle > 0:
                time.sleep(bekle)
            self._son = time.monotonic()
            try:
                r = self.oturum.post(ADRES + servis, data=_zarf(sorgu_no, parametreler),
                                     timeout=self.ayar.zaman_asimi_saniye)
                if r.status_code == 429 or r.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {r.status_code}")
                r.raise_for_status()
                ic = zarf_ici(r.content.decode("utf-8"))
                self.ardisik_hata = 0
                return ic
            except (requests.RequestException, ValueError, ET.ParseError) as e:
                if deneme == self.ayar.yeniden_deneme:
                    self.ardisik_hata += 1
                    if self.ardisik_hata >= self.ayar.ardisik_hata_siniri:
                        raise ToplamaDurduruldu(f"EPDK servisi art arda {self.ardisik_hata} kez hata verdi: {e}")
                    raise
                log.warning("EPDK %s %s hata (%s); %ss sonra tekrar", servis, parametreler, e, 2 ** deneme)
                time.sleep(2 ** deneme)
        raise RuntimeError("ulaşılamaz")

    def il_akaryakit(self, il: int) -> list[dict]:
        return il_akaryakit_coz(self.sorgu("bildirimPetrolAkaryakitFiyatlari", 72, [str(il)]))

    def sekiz_firma(self, gun: date) -> list[dict]:
        return sekiz_firma_coz(self.sorgu("bildirimPetrol8FirmaBulten", 71, [gun.strftime("%d/%m/%Y")]))

    def il_lpg(self, gun: date, il: int) -> list[dict]:
        return lpg_coz(self.sorgu("bildirimLPGTarife", 54, [gun.strftime("%d/%m/%Y"), str(il)]))


# ------------------------------------------------------------------ toplama

def bugun() -> date:
    return datetime.now(TR).date()


def _yaz_parquet(df: pd.DataFrame, yol: Path) -> None:
    yol.parent.mkdir(parents=True, exist_ok=True)
    gecici = yol.with_suffix(".tmp")
    df.to_parquet(gecici, index=False)
    gecici.replace(yol)


def il_topla(istemci: EpdkIstemci, gun: date, iller: list[int], tur: str, yeniden: bool = False) -> tuple[Path | None, list[int]]:
    """tur: "akaryakit" ya da "lpg". Bütün illeri tek dosyaya yazar; başarısız illeri döndürür."""
    yol = DIZIN / f"{tur}_il" / f"tarih={gun.isoformat()}" / "iller.parquet"
    if yol.exists() and not yeniden:
        log.info("%s %s zaten toplanmış, atlanıyor", tur, gun)
        return None, []
    parcalar, basarisiz = [], []
    for il in iller:
        try:
            satirlar = istemci.il_akaryakit(il) if tur == "akaryakit" else istemci.il_lpg(gun, il)
        except ToplamaDurduruldu:
            basarisiz.extend(iller[iller.index(il):])
            log.error("%s: servis yanıt vermiyor, kalan %d il atlandı", tur, len(basarisiz))
            break
        except Exception as e:
            log.error("%s il %s toplanamadı: %s", tur, il, e)
            basarisiz.append(il)
            continue
        if not satirlar:
            log.warning("%s il %s (%s): boş yanıt", tur, il, IL_ADLARI.get(il))
            continue
        df = pd.DataFrame(satirlar)
        if tur == "akaryakit":
            sinir = (gun - timedelta(days=ESKI_FIYAT_GUN)).isoformat()
            df = df[df["gecerlilik_tarihi"].isna() | (df["gecerlilik_tarihi"] >= sinir)]
        df.insert(0, "il_adi", IL_ADLARI.get(il))
        df.insert(0, "il_kodu", il)
        parcalar.append(df)
    if not parcalar:
        return None, basarisiz
    df = pd.concat(parcalar, ignore_index=True)
    df.insert(0, "tarih", gun.isoformat())
    df["toplama_zamani"] = datetime.now(TR).isoformat(timespec="seconds")
    _yaz_parquet(df, yol)
    log.info("%s %s: %d il, %d satır -> %s", tur, gun, df["il_kodu"].nunique(), len(df), yol.relative_to(HAM))
    return yol, basarisiz


SEKIZ_SUTUNLAR = ["tarih", "yakit_tipi", "birim", "fiyat"]


def sekiz_firma_doldur(istemci: EpdkIstemci, ayar: EpdkAyarlari, son_gun: date, yol: Path | None = None) -> int:
    """sekiz_firma.csv'deki eksik günleri (başlangıçtan son_gun'e) doldurur. Son kayıtlı 2 gün,
    gün içi düzeltmeler için yeniden alınır. Ara ara diske yazar; yarıda kalırsa kaldığı yerden sürer."""
    yol = yol or DIZIN / "sekiz_firma.csv"
    mevcut = pd.read_csv(yol, dtype={"tarih": str}) if yol.exists() else pd.DataFrame(columns=SEKIZ_SUTUNLAR)
    bas = date.fromisoformat(ayar.sekiz_firma_baslangic)
    gunler_var = set(mevcut["tarih"])
    tum = [bas + timedelta(days=i) for i in range((son_gun - bas).days + 1)]
    son_kayit = max(gunler_var) if gunler_var else None
    tazele = {d for d in tum if son_kayit and d >= date.fromisoformat(son_kayit) - timedelta(days=1)}
    eksik = [d for d in tum if d.isoformat() not in gunler_var or d in tazele][-ayar.sekiz_firma_azami_gun:]
    if not eksik:
        return 0
    log.info("8 firma bülteni: %d gün alınacak (%s – %s)", len(eksik), eksik[0], eksik[-1])
    yeni, sayac = [], 0

    def kaydet():
        nonlocal mevcut
        if not yeni:
            return
        ek = pd.DataFrame(yeni, columns=SEKIZ_SUTUNLAR)
        mevcut = pd.concat([mevcut[~mevcut["tarih"].isin(ek["tarih"])], ek], ignore_index=True)
        mevcut = mevcut.sort_values(["tarih", "yakit_tipi"]).reset_index(drop=True)
        yol.parent.mkdir(parents=True, exist_ok=True)
        gecici = yol.with_suffix(".tmp")
        mevcut.to_csv(gecici, index=False)
        gecici.replace(yol)
        yeni.clear()

    for d in eksik:
        try:
            satirlar = istemci.sekiz_firma(d)
        except ToplamaDurduruldu:
            kaydet()
            raise
        except Exception as e:
            log.error("8 firma bülteni %s alınamadı: %s", d, e)
            continue
        if not satirlar:
            log.warning("8 firma bülteni %s boş", d)
        for s in satirlar:
            yeni.append({"tarih": d.isoformat(), **s})
        sayac += 1
        if sayac % 50 == 0:
            kaydet()
            log.info("8 firma bülteni: %d/%d gün", sayac, len(eksik))
    kaydet()
    return sayac


def topla(ayar: EpdkAyarlari | None = None, gun: date | None = None, iller: list[int] | None = None,
          yeniden: bool = False, sekiz_firma: bool = True) -> dict:
    ayar = ayar or ayarlari_yukle()
    gun = gun or bugun()
    istemci = EpdkIstemci(ayar)
    iller = iller or ayar.il_kodlari()
    sonuc = {"tarih": gun.isoformat(), "basarisiz": {}}
    for tur in ("akaryakit", "lpg"):
        yol, basarisiz = il_topla(istemci, gun, iller, tur, yeniden)
        sonuc[tur] = str(yol) if yol else None
        if basarisiz:
            sonuc["basarisiz"][tur] = basarisiz
    if sekiz_firma:
        try:
            sonuc["sekiz_firma_gun"] = sekiz_firma_doldur(istemci, ayar, gun)
        except ToplamaDurduruldu as e:
            log.error("%s", e)
            sonuc["basarisiz"]["sekiz_firma"] = str(e)
    return sonuc
