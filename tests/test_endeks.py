"""Endeks matematiği testleri (sentetik veri)."""

import math

import numpy as np
import pandas as pd
import pytest

from webtufe.ayarlar import EndeksAyarlari
from webtufe.endeks import aylik, madde_endeksleri, madde_gunluk_ozet, toplulastir
from webtufe.gostergeler import Seri


def _ham_yaz(tmp_path, satirlar):
    df = pd.DataFrame(satirlar, columns=["tarih", "konum", "zincir", "urun_id", "fiyat"])
    df["baslik"] = df["urun_id"]
    df["ana_kategori"] = "x"
    df["marka"] = ""
    df["miktar"] = ""
    for t, g in df.groupby("tarih"):
        d = tmp_path / f"tarih={t}"
        d.mkdir(parents=True, exist_ok=True)
        g.to_parquet(d / "konum=a.parquet", index=False)
    return str(tmp_path / "*" / "*.parquet")


def test_jevons_madde_ici_geometrik_ortalama(tmp_path):
    ayar = EndeksAyarlari()
    desen = _ham_yaz(tmp_path, [
        ("2026-01-01", "a", "z1", "u1", 10.0),
        ("2026-01-01", "a", "z1", "u2", 20.0),
        ("2026-01-02", "a", "z1", "u1", 11.0),   # +%10
        ("2026-01-02", "a", "z1", "u2", 24.2),   # +%21
    ])
    esleme = pd.DataFrame({"urun_id": ["u1", "u2"], "madde_kodu": ["m1", "m1"]})
    ozet = madde_gunluk_ozet(desen, esleme, ayar)
    tarihler, maddeler, I, aktif = madde_endeksleri(ozet, ayar)
    beklenen = 100 * math.sqrt(1.10 * 1.21)
    assert I[1, 0] == pytest.approx(beklenen)
    assert aktif.all()


def test_aykiri_oran_atilir(tmp_path):
    ayar = EndeksAyarlari(aykiri_oran_siniri=2.5)
    desen = _ham_yaz(tmp_path, [
        ("2026-01-01", "a", "z1", "u1", 10.0),
        ("2026-01-01", "a", "z1", "u2", 10.0),
        ("2026-01-02", "a", "z1", "u1", 11.0),
        ("2026-01-02", "a", "z1", "u2", 100.0),  # x10: hatalı fiyat
    ])
    esleme = pd.DataFrame({"urun_id": ["u1", "u2"], "madde_kodu": ["m1", "m1"]})
    ozet = madde_gunluk_ozet(desen, esleme, ayar)
    _, _, I, _ = madde_endeksleri(ozet, ayar)
    assert I[1, 0] == pytest.approx(110.0)
    assert ozet.loc[ozet["tarih"] == pd.Timestamp("2026-01-02"), "n_aykiri"].item() == 1


def test_eksik_gun_son_fiyatla_eslesir(tmp_path):
    ayar = EndeksAyarlari(eslesme_penceresi_gun=7)
    desen = _ham_yaz(tmp_path, [
        ("2026-01-01", "a", "z1", "u1", 10.0),
        ("2026-01-01", "a", "z1", "u2", 10.0),
        ("2026-01-02", "a", "z1", "u2", 10.0),
        ("2026-01-03", "a", "z1", "u1", 12.0),   # 2 gün sonra döndü: +%20 bugüne yazılır
        ("2026-01-03", "a", "z1", "u2", 10.0),
    ])
    esleme = pd.DataFrame({"urun_id": ["u1", "u2"], "madde_kodu": ["m1", "m1"]})
    ozet = madde_gunluk_ozet(desen, esleme, ayar)
    _, _, I, _ = madde_endeksleri(ozet, ayar)
    assert I[1, 0] == pytest.approx(100.0)
    assert I[2, 0] == pytest.approx(100 * math.sqrt(1.2))


def _seri(kod, maddeler):
    return Seri(kod, kod, "test", frozenset(maddeler))


def test_laspeyres_sabit_agirlik():
    ayar = EndeksAyarlari()
    tarihler = pd.DatetimeIndex(["2026-01-01", "2026-01-02", "2026-01-03"])
    I = np.array([[100.0, 100.0], [110.0, 100.0], [121.0, 90.0]])
    aktif = np.ones_like(I, dtype=bool)
    sepet = {2026: pd.Series({"a": 75.0, "b": 25.0})}
    A, kapsam = toplulastir(tarihler, ["a", "b"], I, aktif, sepet, [_seri("T", ["a", "b"])], ayar)
    # Laspeyres: sum w * I_i,t / I_i,0 / sum w
    assert A[1, 0] == pytest.approx(0.75 * 110 + 0.25 * 100)
    assert A[2, 0] == pytest.approx(0.75 * 121 + 0.25 * 90)
    assert kapsam[2, 0] == pytest.approx(1.0)


def test_kapsanmayan_madde_agirligi_dagitilir_ve_kapsam_raporlanir():
    ayar = EndeksAyarlari()
    tarihler = pd.DatetimeIndex(["2026-01-01", "2026-01-02"])
    I = np.array([[100.0], [110.0]])
    aktif = np.ones_like(I, dtype=bool)
    sepet = {2026: pd.Series({"a": 40.0, "c": 60.0})}   # c için hiç veri yok
    A, kapsam = toplulastir(tarihler, ["a"], I, aktif, sepet, [_seri("T", ["a", "c"])], ayar)
    assert A[1, 0] == pytest.approx(110.0)
    assert kapsam[1, 0] == pytest.approx(0.4)


def test_yil_icinde_giren_madde_seriyi_kirmaz():
    ayar = EndeksAyarlari()
    tarihler = pd.DatetimeIndex(["2026-03-01", "2026-03-02", "2026-03-03"])
    # b maddesi 2. gün kapsama giriyor; o gün kendi bazı 100
    I = np.array([[100.0, np.nan], [110.0, 100.0], [110.0, 120.0]])
    aktif = ~np.isnan(I)
    sepet = {2026: pd.Series({"a": 50.0, "b": 50.0})}
    A, _ = toplulastir(tarihler, ["a", "b"], I, aktif, sepet, [_seri("T", ["a", "b"])], ayar)
    assert A[1, 0] == pytest.approx(110.0)           # giriş günü sıçrama yok
    # 3. gün: a sabit, b +%20; b'nin payı a ile eşit (girişte seriyi izlemiş sayılır)
    assert A[2, 0] == pytest.approx(110.0 * (0.5 * 1.0 + 0.5 * 1.2))


def test_yil_degisiminde_yeni_agirliklarla_zincirleme():
    ayar = EndeksAyarlari()
    tarihler = pd.DatetimeIndex(["2025-12-30", "2025-12-31", "2026-01-01"])
    I = np.array([[100.0, 100.0], [120.0, 100.0], [120.0, 110.0]])
    aktif = np.ones_like(I, dtype=bool)
    sepet = {2025: pd.Series({"a": 50.0, "b": 50.0}), 2026: pd.Series({"a": 20.0, "b": 80.0})}
    A, _ = toplulastir(tarihler, ["a", "b"], I, aktif, sepet, [_seri("T", ["a", "b"])], ayar)
    assert A[1, 0] == pytest.approx(110.0)
    # 1 Ocak: 31 Aralık'a göre değişim yeni ağırlıklarla (a sabit, b +%10)
    assert A[2, 0] == pytest.approx(110.0 * (0.2 * 1.0 + 0.8 * 1.1))


def test_aylik_ilk_24_gun_geometrik_ortalama():
    ayar = EndeksAyarlari()
    gunler = pd.date_range("2026-01-01", "2026-02-28", freq="D")
    deger = np.where(gunler.month == 1, 100.0, 110.0)
    deger[(gunler.month == 1) & (gunler.day > 24)] = 999.0   # 24'ünden sonrası dikkate alınmaz
    g = pd.DataFrame({"tarih": gunler, "seri_kodu": "T", "endeks": deger})
    a = aylik(g, ayar)
    oca, sub = a.iloc[0], a.iloc[1]
    assert oca["endeks"] == pytest.approx(100.0)
    assert sub["aylik_degisim"] == pytest.approx(10.0)
    assert bool(oca["kesin"]) and bool(sub["kesin"])
