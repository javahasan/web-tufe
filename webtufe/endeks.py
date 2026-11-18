"""Endeks hesabı (Web TÜFE yöntemi).

1. Gözlem birimi: (kaynak, konum, zincir, ürün). Aynı gün aynı birimde birden fazla
   şube fiyatı varsa medyanı alınır.
2. Madde (elemanter) endeksi: her gün her birim için fiyat oranı p_t / p_önceki
   hesaplanır (önceki gözlem en fazla `eslesme_penceresi_gun` gün önce olmalı).
   Aykırı oranlar atılır. Madde içi günlük değişim, oranların GEOMETRİK
   ortalamasıdır (zincirleme Jevons). Madde endeksi bu değişimle günlük güncellenir.
3. Üst düzey: Laspeyres. Ağırlıklar TÜİK sepetinden gelir ve yıl içinde sabittir.
   Her Ocak'ta yeni ağırlıklara geçilir; bağlantı günü önceki yılın son günüdür
   (Web TÜFE: "Aralık ayının son günü önce yeni yılın ağırlıklarıyla hesaplanır").
   Kapsanmayan veya o gün verisi olmayan maddelerin ağırlığı, kapsanan maddelere
   orantılı dağıtılır (Web TÜFE: "ağırlıklar 100'e tamamlanmıştır"). Yıl içinde
   kapsama giren madde, girdiği güne kadar dahil olduğu serinin seyrini izlemiş
   sayılır; böylece seri kırılmaz.
4. Aylık endeks: ayın ilk 24 gününün geometrik ortalaması (Web TÜFE); ayın 24'ü
   geçince kesinleşir.
"""

from __future__ import annotations

import logging
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from .ayarlar import EndeksAyarlari
from .gostergeler import Seri

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# 1-2. Gözlemler ve madde endeksleri
# --------------------------------------------------------------------------- #

def ham_urunler(ham_desen: str) -> pd.DataFrame:
    """Ham verideki tekil ürünler (en son görülen ad ve kategoriyle)."""
    sql = f"""
        SELECT urun_id,
               arg_max(baslik, tarih) AS baslik,
               arg_max(ana_kategori, tarih) AS ana_kategori,
               arg_max(marka, tarih) AS marka,
               arg_max(miktar, tarih) AS miktar,
               count(DISTINCT tarih) AS gun_sayisi
        FROM read_parquet('{ham_desen}', union_by_name=true)
        GROUP BY urun_id
    """
    return duckdb.sql(sql).df()


def madde_gunluk_ozet(ham_desen: str, esleme: pd.DataFrame, ayar: EndeksAyarlari) -> pd.DataFrame:
    """Her (tarih, madde) için gözlem sayısı ve fiyat oranlarının ortalama logaritması."""
    con = duckdb.connect()
    con.register("esleme", esleme[["urun_id", "madde_kodu"]].dropna())
    sql = f"""
        WITH birim AS (
            SELECT CAST(tarih AS DATE) AS tarih, konum, zincir, urun_id, median(fiyat) AS fiyat
            FROM read_parquet('{ham_desen}', union_by_name=true)
            WHERE fiyat > 0
            GROUP BY ALL
        ),
        g AS (
            SELECT b.*, e.madde_kodu FROM birim b JOIN esleme e USING (urun_id)
        ),
        l AS (
            SELECT *,
                   lag(fiyat) OVER w AS onceki_fiyat,
                   lag(tarih) OVER w AS onceki_tarih
            FROM g
            WINDOW w AS (PARTITION BY konum, zincir, urun_id ORDER BY tarih)
        ),
        r AS (
            SELECT *,
                   ln(fiyat / onceki_fiyat) AS lr,
                   onceki_fiyat IS NOT NULL
                     AND date_diff('day', onceki_tarih, tarih) <= {int(ayar.eslesme_penceresi_gun)}
                     AND abs(ln(fiyat / onceki_fiyat)) <= ln({float(ayar.aykiri_oran_siniri)}) AS gecerli,
                   onceki_fiyat IS NOT NULL
                     AND date_diff('day', onceki_tarih, tarih) <= {int(ayar.eslesme_penceresi_gun)}
                     AND abs(ln(fiyat / onceki_fiyat)) > ln({float(ayar.aykiri_oran_siniri)}) AS aykiri
            FROM l
        )
        SELECT tarih, madde_kodu,
               count(*) AS n_birim,
               count(*) FILTER (WHERE gecerli) AS n_eslesen,
               count(*) FILTER (WHERE aykiri) AS n_aykiri,
               avg(lr) FILTER (WHERE gecerli) AS ort_log_oran
        FROM r
        GROUP BY ALL
        ORDER BY tarih, madde_kodu
    """
    return con.sql(sql).df()


def madde_endeksleri(ozet: pd.DataFrame, ayar: EndeksAyarlari):
    """Günlük madde endeksleri.

    Dönüş: (tarihler, maddeler, I, aktif)
      I[t, i]     madde endeksi (maddenin ilk günü = 100, öncesi NaN)
      aktif[t, i] madde o gün endekse girer mi (son `pencere` gün içinde gözlemi var)
    """
    ozet = ozet.copy()
    ozet["tarih"] = pd.to_datetime(ozet["tarih"])
    tarihler = pd.DatetimeIndex(sorted(ozet["tarih"].unique()))
    maddeler = sorted(ozet["madde_kodu"].unique())
    T, N = len(tarihler), len(maddeler)
    ti = {d: k for k, d in enumerate(tarihler)}
    mi = {m: k for k, m in enumerate(maddeler)}

    log_r = np.zeros((T, N))
    gozlem = np.zeros((T, N), dtype=bool)
    for tarih, madde, n, ne, lr in ozet[["tarih", "madde_kodu", "n_birim", "n_eslesen", "ort_log_oran"]].itertuples(index=False):
        t, i = ti[tarih], mi[madde]
        gozlem[t, i] = n > 0
        if ne > 0 and pd.notna(lr):
            log_r[t, i] = lr

    basladi = np.cumsum(gozlem, axis=0) > 0
    log_r[~basladi] = 0.0
    I = 100.0 * np.exp(np.cumsum(log_r, axis=0))
    I[~basladi] = np.nan

    # aktif: son `pencere` gün içinde (bugün dahil) gözlem var
    pencere = pd.Timedelta(days=ayar.eslesme_penceresi_gun)
    son_gozlem = np.full(N, np.datetime64("NaT", "ns"), dtype="datetime64[ns]")
    aktif = np.zeros((T, N), dtype=bool)
    for t, d in enumerate(tarihler.values):
        son_gozlem = np.where(gozlem[t], d, son_gozlem)
        aktif[t] = ~np.isnat(son_gozlem) & ((d - son_gozlem) <= pencere.to_timedelta64())
    return tarihler, maddeler, I, aktif


# --------------------------------------------------------------------------- #
# 3. Üst düzey toplulaştırma (yıllık zincirlenen Laspeyres)
# --------------------------------------------------------------------------- #

def _yil_agirliklari(sepetler: dict[int, pd.Series], yil: int, maddeler: list[str]) -> np.ndarray:
    yillar = sorted(sepetler)
    uygun = [y for y in yillar if y <= yil]
    secilen = uygun[-1] if uygun else yillar[0]
    if secilen != yil:
        log.debug("%d için %d sepeti kullanılıyor", yil, secilen)
    w = sepetler[secilen]
    return np.array([float(w.get(m, 0.0)) for m in maddeler])


def toplulastir(tarihler: pd.DatetimeIndex, maddeler: list[str], I: np.ndarray, aktif: np.ndarray,
                sepetler: dict[int, pd.Series], seriler: list[Seri], ayar: EndeksAyarlari):
    """Tüm seriler için günlük endeks ve kapsam oranı.

    Dönüş: (A, kapsam) — A[t, g] seri endeksi, kapsam[t, g] o gün endekse giren
    maddelerin seri ağırlığı içindeki payı (0-1).
    """
    T, N, G = len(tarihler), len(maddeler), len(seriler)
    mi = {m: k for k, m in enumerate(maddeler)}
    M = np.zeros((N, G), dtype=bool)
    for g, s in enumerate(seriler):
        for m in s.maddeler:
            if m in mi:
                M[mi[m], g] = True

    A = np.full((T, G), np.nan)
    kapsam = np.zeros((T, G))
    A[0] = ayar.baz_degeri
    basladi = ~np.isnan(I)

    baglanti = np.full((N, G), np.nan)   # maddenin seri içindeki bağlantı değeri
    A_bag = A[0].copy()                   # serinin bağlantı günündeki değeri
    yil_onceki = None
    w = None
    tum_agirlik = None
    for t in range(T):
        yil = tarihler[t].year
        if yil != yil_onceki:
            w = _yil_agirliklari(sepetler, yil, maddeler)
            # serinin o yılki toplam sepet ağırlığı (kapsanmayan maddeler dahil) kapsam oranı için
            tum_agirlik = np.array([sum(float(sepetler[_secilen_yil(sepetler, yil)].get(m, 0.0)) for m in s.maddeler)
                                    for s in seriler])
            if t > 0:
                # yeni yıl: önceki yılın son günü bağlantı günü olur
                baglanti = np.where(basladi[t - 1][:, None], I[t - 1][:, None], np.nan) * np.ones((1, G))
                A_bag = A[t - 1].copy()
            yil_onceki = yil
        if t == 0:
            baglanti = np.where(basladi[0][:, None], I[0][:, None], np.nan) * np.ones((1, G))
            kapsam[0] = _kapsam(w, aktif[0] & basladi[0], M, tum_agirlik)
            continue

        # yıl içinde kapsama yeni giren maddeler: girişe kadar serinin seyrini izlemiş say
        yeni = basladi[t - 1][:, None] & np.isnan(baglanti)
        if yeni.any():
            oran = A_bag / A[t - 1]                      # (G,)
            baglanti = np.where(yeni, I[t - 1][:, None] * oran[None, :], baglanti)

        kapsa = basladi[t - 1] & aktif[t] & (w > 0)
        R = np.where(kapsa, I[t] / np.where(basladi[t - 1], I[t - 1], 1.0), 1.0)
        pay = np.where(kapsa[:, None] & M & ~np.isnan(baglanti),
                       w[:, None] * I[t - 1][:, None] / baglanti, 0.0)
        pay = np.nan_to_num(pay)
        pay_toplam = pay.sum(axis=0)
        pay_R = (pay * R[:, None]).sum(axis=0)
        degisim = np.where(pay_toplam > 0, pay_R / np.where(pay_toplam > 0, pay_toplam, 1.0), 1.0)
        A[t] = A[t - 1] * degisim
        kapsam[t] = _kapsam(w, kapsa, M, tum_agirlik)

    # Seri hiç veri görmeden önceki günler NaN olsun
    ilk = np.argmax(kapsam > 0, axis=0)
    hic = ~(kapsam > 0).any(axis=0)
    for g in range(G):
        if hic[g]:
            A[:, g] = np.nan
        else:
            A[: ilk[g], g] = np.nan
            # seri sonradan başladıysa başlangıcını baz değerine çek
            if ilk[g] > 0:
                A[:, g] = A[:, g] / A[ilk[g], g] * ayar.baz_degeri

    if ayar.baz_tarihi:
        bt = pd.Timestamp(ayar.baz_tarihi)
        if bt in tarihler:
            k = tarihler.get_loc(bt)
            A = A / A[k][None, :] * ayar.baz_degeri
        else:
            log.warning("Baz tarihi %s veride yok; ilk gün baz alındı.", ayar.baz_tarihi)
    return A, kapsam


def _secilen_yil(sepetler: dict, yil: int) -> int:
    uygun = [y for y in sorted(sepetler) if y <= yil]
    return uygun[-1] if uygun else sorted(sepetler)[0]


def _kapsam(w: np.ndarray, kapsa: np.ndarray, M: np.ndarray, tum_agirlik: np.ndarray) -> np.ndarray:
    kapsanan = (w * kapsa) @ M
    return np.where(tum_agirlik > 0, kapsanan / np.where(tum_agirlik > 0, tum_agirlik, 1.0), 0.0)


# --------------------------------------------------------------------------- #
# 4. Aylık endeks
# --------------------------------------------------------------------------- #

def aylik(gunluk: pd.DataFrame, ayar: EndeksAyarlari) -> pd.DataFrame:
    """gunluk: [tarih, seri_kodu, endeks] uzun tablo."""
    g = gunluk.dropna(subset=["endeks"]).copy()
    g["tarih"] = pd.to_datetime(g["tarih"])
    son_veri = g["tarih"].max()
    g = g[g["tarih"].dt.day <= ayar.aylik_son_gun]
    g["ay"] = g["tarih"].dt.to_period("M")
    if ayar.aylik_ortalama == "geometrik":
        g["log"] = np.log(g["endeks"])
        a = g.groupby(["seri_kodu", "ay"]).agg(log=("log", "mean"), gun=("tarih", "nunique"),
                                               son_gun=("tarih", "max")).reset_index()
        a["endeks"] = np.exp(a["log"])
        a = a.drop(columns="log")
    else:
        a = g.groupby(["seri_kodu", "ay"]).agg(endeks=("endeks", "mean"), gun=("tarih", "nunique"),
                                               son_gun=("tarih", "max")).reset_index()
    a = a.sort_values(["seri_kodu", "ay"])
    a["aylik_degisim"] = a.groupby("seri_kodu")["endeks"].pct_change() * 100
    a["yillik_degisim"] = a.groupby("seri_kodu")["endeks"].pct_change(12) * 100
    # ay atlanmışsa pct_change yanlış komşuya bakar; ardışık olmayanları boşalt
    onceki_ay = a.groupby("seri_kodu")["ay"].shift(1)
    a.loc[onceki_ay != a["ay"] - 1, "aylik_degisim"] = np.nan
    onceki_yil = a.groupby("seri_kodu")["ay"].shift(12)
    a.loc[onceki_yil != a["ay"] - 12, "yillik_degisim"] = np.nan
    # Ay, son gün (24'ü) geçildiğinde kesinleşir
    kesinlesme = a["ay"].dt.start_time + pd.Timedelta(days=ayar.aylik_son_gun - 1)
    a["kesin"] = son_veri >= kesinlesme
    a["ay"] = a["ay"].astype(str)
    return a


# --------------------------------------------------------------------------- #
# Uçtan uca
# --------------------------------------------------------------------------- #

def hesapla(ham_desen: str, esleme: pd.DataFrame, sepetler: dict[int, pd.DataFrame],
            seriler: list[Seri], ayar: EndeksAyarlari) -> dict[str, pd.DataFrame]:
    ozet = madde_gunluk_ozet(ham_desen, esleme, ayar)
    if ozet.empty:
        raise ValueError("Eşleşen gözlem yok; önce `webtufe topla` çalıştırın.")
    tarihler, maddeler, I, aktif = madde_endeksleri(ozet, ayar)
    agirlik = {y: s.set_index("madde_kodu")["agirlik"] for y, s in sepetler.items()}
    A, kapsam = toplulastir(tarihler, maddeler, I, aktif, agirlik, seriler, ayar)

    gunluk = pd.DataFrame(A, index=tarihler, columns=[s.kod for s in seriler])
    gunluk.index.name = "tarih"
    gunluk = gunluk.reset_index().melt(id_vars="tarih", var_name="seri_kodu", value_name="endeks")
    kap = pd.DataFrame(kapsam, index=tarihler, columns=[s.kod for s in seriler])
    kap.index.name = "tarih"
    kap = kap.reset_index().melt(id_vars="tarih", var_name="seri_kodu", value_name="kapsam")
    gunluk = gunluk.merge(kap, on=["tarih", "seri_kodu"])
    meta = pd.DataFrame([{"seri_kodu": s.kod, "seri_adi": s.ad, "duzey": s.duzey} for s in seriler])
    gunluk = gunluk.merge(meta, on="seri_kodu")
    gunluk["gunluk_degisim"] = gunluk.sort_values("tarih").groupby("seri_kodu")["endeks"].pct_change() * 100

    ay = aylik(gunluk[["tarih", "seri_kodu", "endeks"]], ayar).merge(meta, on="seri_kodu")
    return {"gunluk": gunluk, "aylik": ay, "madde_ozet": ozet}


def kaydet(sonuc: dict[str, pd.DataFrame], dizin: Path) -> None:
    dizin.mkdir(parents=True, exist_ok=True)
    sonuc["gunluk"].to_parquet(dizin / "gunluk.parquet", index=False)
    sonuc["gunluk"][sonuc["gunluk"]["duzey"].isin(["genel", "ana_grup", "ozel"])].to_csv(
        dizin / "gunluk_ozet.csv", index=False)
    sonuc["aylik"].to_csv(dizin / "aylik.csv", index=False)
    sonuc["madde_ozet"].to_csv(dizin / "madde_gunluk_gozlem.csv", index=False)
