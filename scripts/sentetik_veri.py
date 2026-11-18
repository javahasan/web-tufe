"""Sentetik ham fiyat verisi üretir ve endeks motorundan geçirir.

GERÇEK FİYAT DEĞİLDİR. Amaç, endeks motorunun (madde endeksi, zincirleme
Laspeyres, aylık hesap, özel göstergeler) gerçeğe benzer bir veriyle nasıl
çalıştığını göstermek.

Üretim:
  - TÜİK 2026 sepetindeki 428 maddenin her biri için 3 ürün x 2 zincir x 2 konum.
  - Madde düzeyinde "gerçek" fiyat süreci: yıllık ~%42'den ~%27'ye inen genel
    eğilim + madde türüne göre fark (hizmet, kira, eğitim Eylül zammı, enerji
    tarifeleri, akaryakıt, taze meyve-sebze mevsimselliği, giyimde sezon
    indirimleri, tütün vergi zamları, altın oynaklığı).
  - Ürün düzeyinde yapışkan fiyatlar (ürün fiyatı ara sıra güncellenir),
    geçici indirimler, eksik gözlemler, ürün çıkışı/yeni ürün girişi,
    seyrek hatalı fiyatlar (x10) ve iki tam gün toplama kesintisi.

Kullanım:  .venv/bin/python scripts/sentetik_veri.py
Çıktı:     data/sentetik/ham/…  (ham), data/sentetik/cikti/… (endeksler),
           data/sentetik/pano/*.csv (sayfa için)
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from webtufe.ayarlar import VERI, EndeksAyarlari
from webtufe.endeks import hesapla, kaydet
from webtufe.gostergeler import serileri_olustur

log = logging.getLogger("sentetik")

KOK = VERI / "sentetik"
BASLANGIC = pd.Timestamp("2024-12-31")   # Web TÜFE bazı: 31.12.2024 = 100
BITIS = pd.Timestamp("2026-11-11")
KESINTI_GUNLERI = {pd.Timestamp("2025-08-15"), pd.Timestamp("2026-03-02")}
KONUMLAR = ["konum_1", "konum_2"]
ZINCIRLER = ["zincir_a", "zincir_b"]
URUN_SAYISI = 3
TOHUM = 20261112


def _onek(kod: str, onekler) -> bool:
    return any(kod.startswith(o) for o in onekler)


HIZMET = ["0314", "0411", "0432", "0441", "0533", "0562", "062", "063", "064", "0723", "0724",
          "073", "074", "083", "0835", "0839", "0945", "0946", "0947", "096", "098",
          "10", "11", "12", "1313", "1330", "1390"]
TAZE = ["01161", "01162", "01163", "01164", "01165", "01171", "01172", "01173", "01174", "01175", "0119401"]


def madde_sureci(kod: str, gunler: pd.DatetimeIndex, rng: np.random.Generator) -> tuple[np.ndarray, float, float]:
    """Maddenin günlük log fiyat düzeyi (t=0'da 0), güncelleme olasılığı, indirim olasılığı."""
    T = len(gunler)
    t = np.arange(T) / (T - 1)
    yillik = 0.42 + (0.27 - 0.42) * t                      # genel eğilim
    mu = np.log1p(yillik) / 365.0
    carpan = rng.lognormal(0.0, 0.18)
    guncelleme, indirim = 0.05, 0.004
    ek = np.zeros(T)
    ay, gun = gunler.month.values, gunler.day.values
    yil_basi = (ay == 1) & (gun == 1)

    if _onek(kod, HIZMET):
        carpan *= 1.35
        guncelleme = 0.02
        ek += np.where(yil_basi, np.log(1 + rng.uniform(0.04, 0.10)), 0.0)
    if kod.startswith("0411"):                              # kira: her ayın 1'inde artış
        mu = mu * 0.0
        aylik = np.log1p(np.interp(t, [0, 1], [0.045, 0.028]))
        ek += np.where(gun == 1, aylik, 0.0)
        guncelleme = 0.9
    if kod.startswith("10"):                                # eğitim: Eylül zammı
        mu = mu * 0.15
        ek += np.where((ay == 9) & (gun == 1), np.log(1 + rng.uniform(0.25, 0.40)), 0.0)
    if _onek(kod, ["0451", "0452"]):                        # elektrik, doğalgaz: tarife değişimleri
        mu = mu * 0.0
        for tarih, oran in [("2025-04-01", 0.25), ("2025-07-01", 0.15), ("2026-01-01", 0.20), ("2026-07-01", 0.12)]:
            ek += np.where(gunler == pd.Timestamp(tarih), np.log1p(oran * rng.uniform(0.8, 1.2)), 0.0)
        guncelleme = 0.9
    if _onek(kod, ["07221", "07222", "07223", "04522"]):    # akaryakıt, LPG: sık ayar
        carpan *= 0.9
        sok = rng.normal(0, 0.012, T) * (rng.random(T) < 0.25)
        ek += sok
        guncelleme = 0.9
    if _onek(kod, TAZE):                                    # taze meyve-sebze: mevsimsellik
        faz = rng.uniform(0, 2 * np.pi)
        mevsim = rng.uniform(0.12, 0.30) * np.sin(2 * np.pi * gunler.day_of_year.values / 365.25 + faz)
        ek += np.diff(mevsim, prepend=mevsim[0]) + rng.normal(0, 0.012, T)
        guncelleme, indirim = 0.85, 0.0
    if kod.startswith("03"):                                # giyim: sezon indirimleri
        carpan *= 0.75
        sezon = -0.16 * (np.isin(ay, [1, 7]) & (gun >= 5)) - 0.08 * (np.isin(ay, [2, 8]) & (gun <= 20))
        ek += np.diff(sezon, prepend=sezon[0])
        guncelleme = 0.08
    if kod.startswith("023"):                               # tütün: Ocak ve Temmuz vergi zammı
        mu = mu * 0.2
        ek += np.where(((ay == 1) | (ay == 7)) & (gun == 2), np.log(1 + rng.uniform(0.07, 0.12)), 0.0)
        guncelleme = 0.9
    if kod == "1321101":                                    # altın
        carpan *= 1.3
        ek += rng.normal(0, 0.011, T)
        guncelleme = 0.95
    if _onek(kod, ["05", "0711", "0712", "081"]):           # dayanıklı mallar
        carpan *= 0.7
        guncelleme = 0.04

    log_duzey = np.cumsum(mu * carpan + ek)
    log_duzey -= log_duzey[0]
    return log_duzey, guncelleme, indirim


def ham_uret(sepet: pd.DataFrame, gunler: pd.DatetimeIndex) -> pd.DataFrame:
    rng = np.random.default_rng(TOHUM)
    T = len(gunler)
    parcalar = []
    for _, m in sepet.iterrows():
        kod = m["madde_kodu"]
        log_duzey, p_gunc, p_ind = madde_sureci(kod, gunler, rng)
        taban = float(np.exp(rng.uniform(np.log(15), np.log(4000))))
        for k in range(URUN_SAYISI):
            urun_taban = taban * rng.lognormal(0, 0.25)
            # ürün ömrü: bazıları sonradan girer, bazıları çıkar
            bas = 0 if rng.random() > 0.15 else int(rng.integers(30, T - 60))
            son = T if rng.random() > 0.10 else int(rng.integers(bas + 30, T))
            for zincir in ZINCIRLER:
                zincir_fark = rng.lognormal(0, 0.04)
                idio = np.cumsum(rng.normal(0, 0.002, T))
                hedef = urun_taban * zincir_fark * np.exp(log_duzey + idio)
                guncelle = rng.random(T) < p_gunc
                guncelle[0] = True
                son_guncelleme = np.maximum.accumulate(np.where(guncelle, np.arange(T), 0))
                fiyat = hedef[son_guncelleme]
                # geçici indirim: 7 gün %10-25
                if p_ind > 0:
                    for b in np.flatnonzero(rng.random(T) < p_ind):
                        fiyat[b:b + 7] *= 1 - rng.uniform(0.10, 0.25)
                fiyat = np.round(fiyat * 20) / 20
                for konum in KONUMLAR:
                    f = fiyat * (1.0 if konum == "konum_1" else rng.lognormal(0, 0.02))
                    var = np.zeros(T, dtype=bool)
                    var[bas:son] = True
                    var &= rng.random(T) > 0.03                      # %3 eksik gözlem
                    f = f.copy()
                    hata = var & (rng.random(T) < 0.0003)            # seyrek hatalı fiyat
                    f[hata] *= 10
                    idx = np.flatnonzero(var)
                    parcalar.append(pd.DataFrame({
                        "g": idx,
                        "konum": konum,
                        "zincir": zincir,
                        "urun_id": f"{kod}-{k}",
                        "fiyat": np.round(f[idx], 2),
                    }))
    ham = pd.concat(parcalar, ignore_index=True)
    ham["tarih"] = gunler[ham.pop("g").values].strftime("%Y-%m-%d")
    ham = ham[~pd.to_datetime(ham["tarih"]).isin(KESINTI_GUNLERI)]
    ham["sube_id"] = ham["zincir"] + "-" + ham["konum"]
    ham["baslik"] = ham["urun_id"]
    ham["ana_kategori"] = "sentetik"
    ham["marka"] = ""
    ham["miktar"] = ""
    return ham


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    sepet = pd.read_csv(VERI / "referans" / "sepet_2026.csv",
                        dtype={c: str for c in ["madde_kodu", "alt_sinif_kodu", "sinif_kodu", "grup_kodu", "ana_grup_kodu"]})
    gunler = pd.date_range(BASLANGIC, BITIS, freq="D")

    log.info("Ham veri üretiliyor: %d madde, %d gün", len(sepet), len(gunler))
    ham = ham_uret(sepet, gunler)
    ham_dizin = KOK / "ham"
    if ham_dizin.exists():
        shutil.rmtree(ham_dizin)
    for tarih, g in ham.groupby("tarih"):
        d = ham_dizin / f"tarih={tarih}"
        d.mkdir(parents=True)
        g.to_parquet(d / "konum=hepsi.parquet", index=False)
    log.info("%d gözlem yazıldı (%d ürün-zincir-konum birimi)", len(ham),
             ham[["konum", "zincir", "urun_id"]].drop_duplicates().shape[0])

    # Sentetik ürünler madde koduyla adlandırıldı; eşleme doğrudan yapılır.
    urunler = ham[["urun_id"]].drop_duplicates()
    esleme = urunler.assign(madde_kodu=urunler["urun_id"].str.split("-").str[0])

    ayar = EndeksAyarlari()
    seriler = serileri_olustur(sepet)
    # TÜİK COICOP 2018 sepeti yalnızca 2026 için var; 2025'te de 2026 ağırlıkları kullanılır.
    sonuc = hesapla(str(ham_dizin / "tarih=*" / "*.parquet"), esleme, {2026: sepet}, seriler, ayar)
    kaydet(sonuc, KOK / "cikti")
    pano_yaz(sonuc, sepet)


def pano_yaz(sonuc: dict, sepet: pd.DataFrame):
    pano = KOK / "pano"
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
        g[c] = g[c].round(3)
    g["kapsam"] = (g["kapsam"] * 100).round(1)
    g = g.sort_values(["seri_kodu", "tarih"])
    g[["tarih", "seri_kodu", "seri_adi", "duzey", "endeks", "gunluk_degisim", "yillik_degisim", "kapsam"]].to_csv(
        pano / "gunluk.csv", index=False)

    a = sonuc["aylik"]
    a = a[a["duzey"].isin(["genel", "ana_grup", "grup", "ozel", "madde"])].copy()
    for c in ["endeks", "aylik_degisim", "yillik_degisim"]:
        a[c] = a[c].round(3)
    a["kesin"] = np.where(a["kesin"], "kesin", "geçici")
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
        sd[c] = sd[c].round(3)
    sd.sort_values("seri_kodu")[["seri_kodu", "seri_adi", "duzey", "ana_grup_kodu", "tarih", "ay", "gunluk", "aylik", "yillik"]].to_csv(
        pano / "son_degisimler.csv", index=False)

    o = sonuc["madde_ozet"].groupby("tarih")[["n_birim", "n_eslesen", "n_aykiri"]].sum().reset_index()
    o["tarih"] = pd.to_datetime(o["tarih"]).dt.strftime("%Y-%m-%d")
    o.rename(columns={"n_birim": "gozlem", "n_eslesen": "eslesen", "n_aykiri": "aykiri"}).to_csv(
        pano / "gozlem.csv", index=False)

    from webtufe.eslestirme import kurallari_yukle
    kurallı = {k.madde for k in kurallari_yukle("marketfiyati")}
    s = sepet[["madde_kodu", "madde_adi", "alt_sinif_kodu", "alt_sinif_agirlik", "grup_kodu", "grup_adi",
               "ana_grup_kodu", "ana_grup_adi", "agirlik"]].copy()
    s["agirlik"] = s["agirlik"].round(5)
    s["market_kurali"] = np.where(s["madde_kodu"].isin(kurallı), "evet", "hayır")
    s.to_csv(pano / "agirliklar.csv", index=False)
    for f in sorted(pano.glob("*.csv")):
        log.info("%s: %.0f KB", f.name, f.stat().st_size / 1024)


if __name__ == "__main__":
    main()
