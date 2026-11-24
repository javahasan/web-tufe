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


# ------------------------------------------------------------------ izleme bölümleri (hareketlilik, akaryakıt)

MOBILITE_SAATLIK_GUN = 21
MOBILITE_GUNLUK_GUN = 120
MOBILITE_SUTUNLAR = {
    "mobilite_saatlik.csv": ["zaman", "tarih", "saat", "indeks", "normal"],
    "mobilite_gunluk.csv": ["tarih", "gun_tipi", "pencere", "tur", "deger", "yillik_degisim", "kisa_sapma", "temiz",
                            "okul_tatili", "resmi_tatil"],
}
# Analiz Masası için günlük pencerelerin tamamı (panodaki mobilite_gunluk yalnızca son 120 gün)
MOBILITE_SUTUNLAR["mobilite_pencereler.csv"] = MOBILITE_SUTUNLAR["mobilite_gunluk.csv"]
AKARYAKIT_SUTUNLAR = {
    "akaryakit_ulke.csv": ["tarih", "yakit", "fiyat"],
    "akaryakit_il.csv": ["tarih", "il_kodu", "il_adi", "yakit", "ortanca", "en_dusuk", "en_yuksek", "firma",
                         "once_tarih", "once_ortanca", "degisim"],
}
# Panoda gösterilen yakıtlar: EPDK adı -> kısa ad
YAKITLAR = {"Kurşunsuz Benzin 95 Oktan": "Benzin", "Motorin": "Motorin"}
# İl ortancasına yalnızca son bu kadar gün içinde güncellenmiş firma fiyatları girer
GUNCEL_FIYAT_GUN = 45


def _bos_yaz(yol: Path, sutunlar: list[str]) -> Path:
    pd.DataFrame(columns=sutunlar).to_csv(yol, index=False)
    return yol


def mobilite_pano_yaz(pano: Path, saatlik_yol: Path, mobilite_dizin: Path) -> list[Path]:
    """Hareketlilik izleme dosyaları. Kaynak yoksa yalnızca başlıklar yazılır (pano 'bekleniyor' der)."""
    pano.mkdir(parents=True, exist_ok=True)
    yazilan = []
    yol = pano / "mobilite_saatlik.csv"
    if saatlik_yol.exists():
        s = pd.read_csv(saatlik_yol, dtype={"zaman": str})
        z = pd.to_datetime(s["zaman"])
        s = s.assign(t=z, tarih=z.dt.strftime("%Y-%m-%d"), saat=z.dt.hour, gun=z.dt.day_of_week)
        son = z.max().normalize()
        # "normal": aynı haftanın günü ve saatinin önceki 8 haftadaki ortancası
        tablo = s.set_index("t")["indeks"]
        normal = []
        pencere = s[s["t"] >= son - pd.Timedelta(days=MOBILITE_SAATLIK_GUN - 1)]
        for t in pencere["t"]:
            once = [t - pd.Timedelta(weeks=k) for k in range(1, 9)]
            v = tablo.reindex(once).dropna()
            normal.append(round(float(v.median()), 1) if len(v) >= 4 else None)
        pencere = pencere.assign(normal=normal)
        pencere[MOBILITE_SUTUNLAR["mobilite_saatlik.csv"]].to_csv(yol, index=False)
    else:
        _bos_yaz(yol, MOBILITE_SUTUNLAR["mobilite_saatlik.csv"])
    yazilan.append(yol)

    yol = pano / "mobilite_gunluk.csv"
    tum_yol = pano / "mobilite_pencereler.csv"
    kaynak = mobilite_dizin / "pencereler.csv"
    if kaynak.exists():
        p = pd.read_csv(kaynak, dtype={"tarih": str})
        sinir = (pd.Timestamp(p["tarih"].max()) - pd.Timedelta(days=MOBILITE_GUNLUK_GUN)).strftime("%Y-%m-%d")
        p[p["tarih"] > sinir][MOBILITE_SUTUNLAR["mobilite_gunluk.csv"]].to_csv(yol, index=False)
        p[MOBILITE_SUTUNLAR["mobilite_pencereler.csv"]].to_csv(tum_yol, index=False)
    else:
        _bos_yaz(yol, MOBILITE_SUTUNLAR["mobilite_gunluk.csv"])
        _bos_yaz(tum_yol, MOBILITE_SUTUNLAR["mobilite_pencereler.csv"])
    yazilan += [yol, tum_yol]

    yol = pano / "mobilite_haftalik.csv"
    kaynak = mobilite_dizin / "haftalik.csv"
    if kaynak.exists() and kaynak.stat().st_size > 0:
        pd.read_csv(kaynak).to_csv(yol, index=False)
    else:
        _bos_yaz(yol, ["hafta", "hafta_basi", "temiz_gun"])
    yazilan.append(yol)
    return yazilan


def _son_parquet(dizin: Path) -> tuple[str, Path] | None:
    gunler = sorted(p for p in dizin.glob("tarih=*/iller.parquet"))
    return (gunler[-1].parent.name.split("=", 1)[1], gunler[-1]) if gunler else None


def _il_ortancalari(akaryakit: pd.DataFrame | None, lpg: pd.DataFrame | None, tarih: str) -> pd.DataFrame:
    parcalar = []
    if akaryakit is not None and not akaryakit.empty:
        a = akaryakit[akaryakit["yakit_tipi"].isin(YAKITLAR)]
        sinir = (pd.Timestamp(tarih) - pd.Timedelta(days=GUNCEL_FIYAT_GUN)).strftime("%Y-%m-%d")
        a = a[a["gecerlilik_tarihi"].isna() | (a["gecerlilik_tarihi"] >= sinir)]
        parcalar.append(a.assign(yakit=a["yakit_tipi"].map(YAKITLAR))[["il_kodu", "il_adi", "yakit", "firma", "fiyat"]])
    if lpg is not None and not lpg.empty:
        o = lpg[lpg["urun"] == "Otogaz"]
        parcalar.append(o.assign(yakit="Otogaz")[["il_kodu", "il_adi", "yakit", "firma", "fiyat"]])
    if not parcalar:
        return pd.DataFrame(columns=["il_kodu", "il_adi", "yakit", "ortanca", "en_dusuk", "en_yuksek", "firma"])
    d = pd.concat(parcalar).dropna(subset=["fiyat"])
    return d.groupby(["il_kodu", "il_adi", "yakit"]).agg(
        ortanca=("fiyat", "median"), en_dusuk=("fiyat", "min"), en_yuksek=("fiyat", "max"),
        firma=("firma", "nunique")).reset_index()


def akaryakit_pano_yaz(pano: Path, epdk_dizin: Path) -> list[Path]:
    """Akaryakıt izleme dosyaları: 8 firma ülke ortalaması ve son günün il ortancaları (30 gün önceyle)."""
    pano.mkdir(parents=True, exist_ok=True)
    yazilan = []
    yol = pano / "akaryakit_ulke.csv"
    kaynak = epdk_dizin / "sekiz_firma.csv"
    if kaynak.exists():
        s = pd.read_csv(kaynak, dtype={"tarih": str})
        s = s[s["yakit_tipi"].isin(YAKITLAR)].assign(yakit=lambda x: x["yakit_tipi"].map(YAKITLAR))
        s.assign(fiyat=s["fiyat"].round(3))[["tarih", "yakit", "fiyat"]].sort_values(["yakit", "tarih"]).to_csv(yol, index=False)
    else:
        _bos_yaz(yol, AKARYAKIT_SUTUNLAR["akaryakit_ulke.csv"])
    yazilan.append(yol)

    yol = pano / "akaryakit_il.csv"
    son_a, son_l = _son_parquet(epdk_dizin / "akaryakit_il"), _son_parquet(epdk_dizin / "lpg_il")
    if not son_a and not son_l:
        _bos_yaz(yol, AKARYAKIT_SUTUNLAR["akaryakit_il.csv"])
        yazilan.append(yol)
        return yazilan
    tarih = max(x[0] for x in (son_a, son_l) if x)
    oku = lambda x: pd.read_parquet(x[1]) if x and x[0] == tarih else None   # noqa: E731
    simdi = _il_ortancalari(oku(son_a), oku(son_l), tarih)
    # Karşılaştırma: 30 gün önceki ya da ondan önceki en yakın toplama günü
    hedef = (pd.Timestamp(tarih) - pd.Timedelta(days=30)).strftime("%Y-%m-%d")
    def once_gun(dizin):
        g = sorted(p for p in dizin.glob("tarih=*/iller.parquet") if p.parent.name.split("=", 1)[1] <= hedef)
        return (g[-1].parent.name.split("=", 1)[1], g[-1]) if g else None
    oa, ol = once_gun(epdk_dizin / "akaryakit_il"), once_gun(epdk_dizin / "lpg_il")
    once = _il_ortancalari(pd.read_parquet(oa[1]) if oa else None, pd.read_parquet(ol[1]) if ol else None,
                           max(x[0] for x in (oa, ol) if x) if (oa or ol) else tarih) if (oa or ol) else None
    simdi["tarih"] = tarih
    if once is not None and not once.empty:
        once_tarih = max(x[0] for x in (oa, ol) if x)
        simdi = simdi.merge(once[["il_kodu", "yakit", "ortanca"]].rename(columns={"ortanca": "once_ortanca"}),
                            on=["il_kodu", "yakit"], how="left")
        simdi["once_tarih"] = once_tarih
        simdi["degisim"] = ((simdi["ortanca"] / simdi["once_ortanca"] - 1) * 100).round(2)
    else:
        simdi = simdi.assign(once_tarih=None, once_ortanca=None, degisim=None)
    for c in ["ortanca", "en_dusuk", "en_yuksek", "once_ortanca"]:
        simdi[c] = pd.to_numeric(simdi[c], errors="coerce").round(2)
    simdi[AKARYAKIT_SUTUNLAR["akaryakit_il.csv"]].sort_values(["yakit", "il_kodu"]).to_csv(yol, index=False)
    yazilan.append(yol)
    return yazilan
