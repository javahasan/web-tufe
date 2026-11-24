"""Pano ve Analiz Masası için dosyalar.

Endeks çıktılarından (gunluk.parquet, aylik.csv, madde_gunluk_gozlem.csv) ve ham fiyatlardan
üretilir. Gerçek veride `webtufe pano` bunları data/cikti/pano/ altına yazar; dosyalar her gün
yeniden üretildiği için depoya kaydedilmez. Sentetik deneme verisi de aynı biçimi kullanır.

  gunluk.csv            genel, ana grup ve özel göstergelerin günlük endeksi
  aylik.csv             aylık endeks ve değişimler (ayın 24'ünde kesinleşir)
  son_degisimler.csv    madde ve harcama gruplarının son günlük, aylık ve yıllık değişimi
  gozlem.csv            her gün endekse giren, eşleşen ve aykırı diye atılan gözlem sayısı
  agirliklar.csv        TÜİK sepeti ve maddenin market eşleme kuralı olup olmadığı
  madde_endeksleri.csv  madde düzeyinde günlük endeks (yalnızca gerçek veri)
  madde_fiyatlari.csv   her gün her madde için ortanca birim fiyat; tüm zincirler ve son
                        günlerde zincir zincir (yalnızca gerçek veri)

Bu dosyalardaki her şey Web TÜFE'dir (bu projenin topladığı fiyatlar). Resmi TÜFE ve diğer
resmi seriler buraya karışmaz; panoya ayrı kaynak olarak (EVDS) bağlanır.
"""

from __future__ import annotations

import logging
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

# Zincir zincir fiyatlar yalnızca son bu kadar toplama günü için yazılır (dosya boyutu).
ZINCIR_GUN = 28


def pano_yaz(sonuc: dict, sepet: pd.DataFrame, pano: Path, kurallar: set[str]) -> list[Path]:
    """`sonuc`: {"gunluk", "aylik", "madde_ozet"} (endeks.hesapla çıktısı ya da dosyalardan)."""
    pano.mkdir(parents=True, exist_ok=True)
    tum = sonuc["gunluk"].copy()
    tum["tarih"] = pd.to_datetime(tum["tarih"])
    # Günlük yıllık değişim: endeksin 365 gün önceki değerine oranı
    once = tum[["tarih", "seri_kodu", "endeks"]].copy()
    once["tarih"] = once["tarih"] + pd.Timedelta(days=365)
    tum = tum.merge(once.rename(columns={"endeks": "endeks_365"}), on=["tarih", "seri_kodu"], how="left")
    tum["yillik_degisim"] = (tum["endeks"] / tum["endeks_365"] - 1) * 100

    g = tum[tum["duzey"].isin(["genel", "ana_grup", "ozel"])].copy()
    g["tarih"] = g["tarih"].dt.strftime("%Y-%m-%d")
    for c in ["endeks", "gunluk_degisim", "yillik_degisim"]:
        g[c] = pd.to_numeric(g[c], errors="coerce").round(3)
    g["kapsam"] = (g["kapsam"] * 100).round(1)
    g = g.sort_values(["seri_kodu", "tarih"])
    g[["tarih", "seri_kodu", "seri_adi", "duzey", "endeks", "gunluk_degisim", "yillik_degisim", "kapsam"]].to_csv(
        pano / "gunluk.csv", index=False)

    a = sonuc["aylik"]
    a = a[a["duzey"].isin(["genel", "ana_grup", "grup", "ozel", "madde"])].copy()
    for c in ["endeks", "aylik_degisim", "yillik_degisim"]:
        a[c] = pd.to_numeric(a[c], errors="coerce").round(3)
    a["kesin"] = np.where(a["kesin"].astype(bool), "kesin", "geçici")
    a[["ay", "seri_kodu", "seri_adi", "duzey", "endeks", "aylik_degisim", "yillik_degisim", "kesin", "gun"]].to_csv(
        pano / "aylik.csv", index=False)

    # Madde ve harcama grupları için son gün / son ay değişimleri (fiyat hareketleri)
    son_tarih = tum["tarih"].max()
    sg = tum[(tum["tarih"] == son_tarih) & tum["duzey"].isin(["madde", "grup"])][
        ["seri_kodu", "seri_adi", "duzey", "gunluk_degisim"]]
    son_ay = a["ay"].max()
    sa = a[(a["ay"] == son_ay) & a["duzey"].isin(["madde", "grup"])][["seri_kodu", "aylik_degisim", "yillik_degisim"]]
    sd = sg.merge(sa, on="seri_kodu", how="left")
    sd["ana_grup_kodu"] = sd["seri_kodu"].str[:2]
    sd["tarih"] = son_tarih.strftime("%Y-%m-%d")
    sd["ay"] = son_ay
    sd = sd.rename(columns={"gunluk_degisim": "gunluk", "aylik_degisim": "aylik", "yillik_degisim": "yillik"})
    for c in ["gunluk", "aylik", "yillik"]:
        sd[c] = pd.to_numeric(sd[c], errors="coerce").round(3)
    sd.sort_values("seri_kodu")[["seri_kodu", "seri_adi", "duzey", "ana_grup_kodu", "tarih", "ay", "gunluk", "aylik", "yillik"]].to_csv(
        pano / "son_degisimler.csv", index=False)

    o = sonuc["madde_ozet"].groupby("tarih")[["n_birim", "n_eslesen", "n_aykiri"]].sum().reset_index()
    o["tarih"] = pd.to_datetime(o["tarih"]).dt.strftime("%Y-%m-%d")
    o.rename(columns={"n_birim": "gozlem", "n_eslesen": "eslesen", "n_aykiri": "aykiri"}).to_csv(
        pano / "gozlem.csv", index=False)

    s = sepet[["madde_kodu", "madde_adi", "alt_sinif_kodu", "alt_sinif_agirlik", "grup_kodu", "grup_adi",
               "ana_grup_kodu", "ana_grup_adi", "agirlik"]].copy()
    s["agirlik"] = s["agirlik"].round(5)
    s["market_kurali"] = np.where(s["madde_kodu"].isin(kurallar), "evet", "hayır")
    s.to_csv(pano / "agirliklar.csv", index=False)
    return [pano / f for f in ["gunluk.csv", "aylik.csv", "son_degisimler.csv", "gozlem.csv", "agirliklar.csv"]]


def madde_endeksleri_yaz(gunluk: pd.DataFrame, pano: Path) -> Path:
    m = gunluk[gunluk["duzey"] == "madde"].copy()
    m["tarih"] = pd.to_datetime(m["tarih"]).dt.strftime("%Y-%m-%d")
    m = m.dropna(subset=["endeks"])
    for c in ["endeks", "gunluk_degisim"]:
        m[c] = pd.to_numeric(m[c], errors="coerce").round(3)
    yol = pano / "madde_endeksleri.csv"
    m.sort_values(["seri_kodu", "tarih"])[["tarih", "seri_kodu", "seri_adi", "endeks", "gunluk_degisim"]].to_csv(
        yol, index=False)
    return yol


def madde_fiyatlari(ham_desen: str, esleme: pd.DataFrame, adlar: pd.Series,
                    zincir_gun: int = ZINCIR_GUN) -> pd.DataFrame:
    """Her gün, her madde için raf fiyatlarının (kampanyalı fiyat dahil) ortanca birim fiyatı.

    Bir maddenin ürünleri farklı birimlerle (Kg, Lt, Adet) satılabilir; madde için en çok
    görülen birim seçilir ve yalnızca o birimdeki fiyatlar kullanılır. `zincir` = "tum" satırı
    bütün zincirlerin, diğerleri tek zincirin ortancasıdır (son `zincir_gun` toplama günü).
    """
    e = esleme.dropna(subset=["madde_kodu"])[["urun_id", "madde_kodu"]]
    sql = f"""
        SELECT tarih, zincir, urun_id, birim_fiyat,
               regexp_extract(birim_fiyat_metin, '/\\s*(\\w+)', 1) AS birim
        FROM read_parquet('{ham_desen}', union_by_name=true)
        WHERE fiyat > 0 AND birim_fiyat > 0
    """
    d = duckdb.sql(sql).df().merge(e, on="urun_id")
    if d.empty:
        return pd.DataFrame(columns=["tarih", "madde_kodu", "madde_adi", "zincir", "birim",
                                     "ortanca_birim_fiyat", "urun_sayisi", "gozlem"])
    d = d[d["birim"].fillna("") != ""]
    birim = d.groupby(["madde_kodu", "birim"]).size().rename("n").reset_index()
    birim = birim.sort_values(["madde_kodu", "n"], ascending=[True, False]).drop_duplicates("madde_kodu")
    d = d.merge(birim[["madde_kodu", "birim"]], on=["madde_kodu", "birim"])

    def ozet(g, anahtarlar):
        return g.groupby(anahtarlar).agg(ortanca_birim_fiyat=("birim_fiyat", "median"),
                                         urun_sayisi=("urun_id", "nunique"),
                                         gozlem=("urun_id", "size")).reset_index()

    tum = ozet(d, ["tarih", "madde_kodu", "birim"]).assign(zincir="tum")
    gunler = sorted(d["tarih"].unique())[-zincir_gun:]
    zin = ozet(d[d["tarih"].isin(gunler)], ["tarih", "madde_kodu", "birim", "zincir"])
    s = pd.concat([tum, zin], ignore_index=True)
    s["tarih"] = pd.to_datetime(s["tarih"]).dt.strftime("%Y-%m-%d")
    s["madde_adi"] = s["madde_kodu"].map(adlar)
    s["ortanca_birim_fiyat"] = s["ortanca_birim_fiyat"].round(2)
    s["_s"] = (s["zincir"] != "tum").astype(int)
    s = s.sort_values(["madde_kodu", "_s", "zincir", "tarih"]).drop(columns="_s")
    return s[["tarih", "madde_kodu", "madde_adi", "zincir", "birim", "ortanca_birim_fiyat", "urun_sayisi", "gozlem"]]
