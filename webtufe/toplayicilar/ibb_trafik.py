"""İstanbul trafik indeksi toplayıcısı (İBB Açık Veri).

Kaynak: İBB'nin Trafik İndeksi web servisi (data.ibb.gov.tr > "Trafik İndeksi Web Servisi")
  https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndexHistory/{gün}/{dönem}
  dönem: "5M" (5 dakika) ya da "H" (saat). Son {gün} günün değerlerini döndürür; saatlikte 800
  güne kadar (Eylül 2024'ten) çalışıyor, daha büyük istek sunucu hatası veriyor.
ve 2015-2024 günlük özet arşivi ("İstanbul Trafik İndeksi" veri seti, CSV).

Lisans: İBB Açık Veri Lisansı (ticari kullanım dahil serbest, kaynak gösterilmeli; CC BY 4.0
uyumlu). İndeks, İstanbul geneli tıkanıklık ölçüsüdür (0-99); araç sayısı değildir.

Çıktı (data/ham/ibb_trafik/):
  saatlik.csv          zaman (YYYY-AA-GG SS:00, İstanbul saati), indeks
  5dk/YYYY-AA.csv      zaman (YYYY-AA-GG SS:DD), indeks; aylık dosyalar
  gunluk_arsiv.csv     tarih, en_dusuk, en_yuksek, ortalama (2015-08 – 2024-10)
"""

from __future__ import annotations

import io
import logging
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from ..ayarlar import HAM

log = logging.getLogger(__name__)

KAYNAK = "ibb_trafik"
SERVIS = "https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndexHistory/{gun}/{donem}"
ARSIV_PAKET = "https://data.ibb.gov.tr/api/3/action/package_show?id=istanbul-trafik-indeksi"
ISTEMCI = "webtufe/0.1 (fiyat endeksi arastirmasi; +https://github.com/javahasan/web-tufe)"
TR = ZoneInfo("Europe/Istanbul")
DIZIN = HAM / KAYNAK
AZAMI_SAATLIK_GUN = 800
BEKLEME_SN = 2.0


def _iste(url: str, deneme: int = 3, zaman_asimi: int = 120):
    for i in range(1, deneme + 1):
        try:
            r = requests.get(url, headers={"User-Agent": ISTEMCI}, timeout=zaman_asimi)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if i == deneme:
                raise
            log.warning("İBB isteği başarısız (%s), %ss sonra tekrar: %s", e, 2 ** i, url)
            time.sleep(2 ** i)


def seri_coz(kayitlar: list[dict], donem: str) -> pd.DataFrame:
    """API yanıtı [{TrafficIndex, TrafficIndexDate}] -> zaman, indeks (yinelenenler atılır)."""
    df = pd.DataFrame(kayitlar)
    if df.empty:
        return pd.DataFrame(columns=["zaman", "indeks"])
    z = pd.to_datetime(df["TrafficIndexDate"])
    bicim = "%Y-%m-%d %H:00" if donem == "H" else "%Y-%m-%d %H:%M"
    out = pd.DataFrame({"zaman": z.dt.strftime(bicim), "indeks": pd.to_numeric(df["TrafficIndex"], errors="coerce")})
    return out.dropna().drop_duplicates("zaman", keep="first").sort_values("zaman").reset_index(drop=True)


def birlestir(eski: pd.DataFrame, yeni: pd.DataFrame) -> pd.DataFrame:
    """Aynı zaman damgasında yeni değer eskisinin yerine geçer (servis son saati sonradan düzeltebilir)."""
    df = pd.concat([eski, yeni], ignore_index=True).drop_duplicates("zaman", keep="last")
    return df.sort_values("zaman").reset_index(drop=True)


def _yaz_csv(df: pd.DataFrame, yol: Path) -> None:
    yol.parent.mkdir(parents=True, exist_ok=True)
    gecici = yol.with_suffix(".tmp")
    df.to_csv(gecici, index=False)
    gecici.replace(yol)


def _oku(yol: Path) -> pd.DataFrame:
    return pd.read_csv(yol, dtype={"zaman": str}) if yol.exists() else pd.DataFrame(columns=["zaman", "indeks"])


def saatlik_topla(dizin: Path | None = None) -> int:
    """Son kayıttan bu yana (en az 3 gün, en çok 800 gün) saatlik seriyi çeker ve birleştirir."""
    dizin = dizin or DIZIN
    yol = dizin / "saatlik.csv"
    eski = _oku(yol)
    if eski.empty:
        gun = AZAMI_SAATLIK_GUN
    else:
        son = pd.Timestamp(eski["zaman"].max())
        gun = min(AZAMI_SAATLIK_GUN, max(3, (pd.Timestamp(datetime.now(TR).replace(tzinfo=None)) - son).days + 2))
    yeni = seri_coz(_iste(SERVIS.format(gun=gun, donem="H")).json(), "H")
    df = birlestir(eski, yeni)
    _yaz_csv(df, yol)
    log.info("İBB trafik indeksi saatlik: %d gün istendi, %d yeni saat; toplam %d (%s – %s)", gun,
             len(df) - len(eski), len(df), df["zaman"].min(), df["zaman"].max())
    return len(df) - len(eski)


def bes_dakika_topla(dizin: Path | None = None, gun: int = 2) -> int:
    """Son `gun` günün 5 dakikalık değerlerini aylık dosyalara ekler."""
    dizin = dizin or DIZIN
    yeni = seri_coz(_iste(SERVIS.format(gun=gun, donem="5M")).json(), "5M")
    eklenen = 0
    for ay, parca in yeni.groupby(yeni["zaman"].str[:7]):
        yol = dizin / "5dk" / f"{ay}.csv"
        eski = _oku(yol)
        df = birlestir(eski, parca)
        eklenen += len(df) - len(eski)
        _yaz_csv(df, yol)
    log.info("İBB trafik indeksi 5 dk: %d yeni kayıt", eklenen)
    return eklenen


def arsiv_indir(dizin: Path | None = None, yeniden: bool = False) -> Path | None:
    """2015-2024 günlük özet arşivini bir kez indirir (veri seti artık güncellenmiyor)."""
    dizin = dizin or DIZIN
    yol = dizin / "gunluk_arsiv.csv"
    if yol.exists() and not yeniden:
        return None
    paket = _iste(ARSIV_PAKET).json()["result"]
    url = next(r["url"] for r in paket["resources"] if (r.get("format") or "").upper() == "CSV")
    time.sleep(BEKLEME_SN)
    ham = pd.read_csv(io.StringIO(_iste(url).content.decode("utf-8-sig")))
    df = pd.DataFrame({
        "tarih": ham["trafficindexdate"].astype(str).str[:10],
        "en_dusuk": pd.to_numeric(ham["minimum_traffic_index"], errors="coerce"),
        "en_yuksek": pd.to_numeric(ham["maximum_traffic_index"], errors="coerce"),
        "ortalama": pd.to_numeric(ham["average_traffic_index"], errors="coerce").round(3),
    }).drop_duplicates("tarih").sort_values("tarih")
    _yaz_csv(df, yol)
    log.info("İBB trafik indeksi günlük arşivi: %d gün (%s – %s)", len(df), df["tarih"].min(), df["tarih"].max())
    return yol


def topla(dizin: Path | None = None) -> dict:
    sonuc, hatalar = {}, {}
    for ad, is_ in [("saatlik", lambda: saatlik_topla(dizin)), ("5dk", lambda: bes_dakika_topla(dizin)),
                    ("arsiv", lambda: arsiv_indir(dizin))]:
        try:
            sonuc[ad] = is_()
        except Exception as e:      # biri başarısız olsa da diğerleri denenir
            log.error("İBB trafik %s toplanamadı: %s", ad, e)
            hatalar[ad] = str(e)
        time.sleep(BEKLEME_SN)
    sonuc["hatalar"] = hatalar
    return sonuc
