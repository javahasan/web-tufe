"""Ham veriden aylık endekse kadar tüm hat (sentetik veri, gerçek TÜİK sepeti)."""

import numpy as np
import pandas as pd
import pytest

from webtufe.ayarlar import EndeksAyarlari
from webtufe.endeks import ham_urunler, hesapla, kaydet
from webtufe.eslestirme import esle, kurallari_yukle
from webtufe.gostergeler import serileri_olustur

URUNLER = [  # (urun_id, baslik, ana_kategori, ilk fiyat, günlük artış)
    ("d1", "Domates 1 Kg", "Sebze", 40.0, 0.010),
    ("p1", "Patates 2 Kg", "Sebze", 50.0, 0.000),
    ("s1", "Pınar Süt 1 L", "Süt", 35.0, 0.002),
    ("t1", "Solo Tuvalet Kağıdı 32'li", "Tuvalet Kağıtları", 300.0, -0.001),
    ("x1", "Çakmak 5'li", "Ev & Yaşam", 20.0, 0.050),   # eşleşmez, endekse girmez
]


@pytest.fixture
def ham(tmp_path):
    gunler = pd.date_range("2026-11-12", "2026-12-26", freq="D")
    for k, gun in enumerate(gunler):
        satir = []
        for konum in ["ankara", "izmir"]:
            for zincir in ["migros", "a101"]:
                for uid, baslik, kat, f0, artis in URUNLER:
                    if uid == "p1" and gun < pd.Timestamp("2026-11-20"):
                        continue   # patates sonradan kapsama giriyor
                    satir.append({"tarih": gun.strftime("%Y-%m-%d"), "konum": konum, "zincir": zincir,
                                  "urun_id": uid, "baslik": baslik, "ana_kategori": kat, "marka": "", "miktar": "",
                                  "sube_id": f"{zincir}-{konum}", "fiyat": round(f0 * (1 + artis) ** k, 2)})
        d = tmp_path / f"tarih={gun.date()}"
        d.mkdir()
        pd.DataFrame(satir).to_parquet(d / "konum=hepsi.parquet", index=False)
    return str(tmp_path / "tarih=*" / "*.parquet")


def test_uctan_uca(ham, tmp_path):
    ayar = EndeksAyarlari()
    sepet = pd.read_csv("data/referans/sepet_2026.csv", dtype={c: str for c in
                        ["madde_kodu", "alt_sinif_kodu", "sinif_kodu", "grup_kodu", "ana_grup_kodu"]})
    esleme = esle(ham_urunler(ham), kurallari_yukle("marketfiyati"))
    assert esleme.set_index("urun_id")["madde_kodu"].fillna("-").to_dict() == {
        "d1": "0117241", "p1": "0117511", "s1": "0114111", "t1": "1312026", "x1": "-"}

    sonuc = hesapla(ham, esleme, {2026: sepet}, serileri_olustur(sepet), ayar)
    g = sonuc["gunluk"].set_index(["tarih", "seri_kodu"])["endeks"]

    # Domates maddesi her gün %1 artar
    son = pd.Timestamp("2026-12-26")
    assert g[(son, "0117241")] == pytest.approx(100 * 1.01 ** 44, rel=1e-3)
    # Patates sonradan girdi ve sabit fiyatlı: kendi endeksi 100
    assert g[(son, "0117511")] == pytest.approx(100.0, rel=1e-6)
    # Genel endeks ilk gün 100, gıda artışıyla yükselir
    assert g[(pd.Timestamp("2026-11-12"), "TUFE")] == pytest.approx(100.0)
    assert g[(son, "TUFE")] > 100
    # Giyim grubunda hiç veri yok
    assert np.isnan(g[(son, "03")])

    ay = sonuc["aylik"].set_index(["ay", "seri_kodu"])
    assert bool(ay.loc[("2026-11", "TUFE"), "kesin"])
    assert not np.isnan(ay.loc[("2026-12", "0117241"), "aylik_degisim"])

    kaydet(sonuc, tmp_path / "cikti")
    assert (tmp_path / "cikti" / "aylik.csv").exists()
