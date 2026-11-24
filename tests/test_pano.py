"""Pano dosyaları: madde fiyatları ve sayfa CSV'leri."""

import pandas as pd
import pytest

from webtufe.pano import madde_endeksleri_yaz, madde_fiyatlari, pano_yaz


def _ham(kok, tarih, satirlar):
    d = kok / f"tarih={tarih}"
    d.mkdir(parents=True)
    pd.DataFrame(satirlar).to_parquet(d / "konum=hepsi.parquet", index=False)


def _s(uid, zincir, fiyat, birim="Kg", bf=None):
    bf = fiyat if bf is None else bf
    return {"urun_id": uid, "zincir": zincir, "fiyat": fiyat, "birim_fiyat": bf,
            "birim_fiyat_metin": f"{bf} ₺/{birim}"}


def test_madde_fiyatlari_baskin_birim_ve_zincir(tmp_path):
    _ham(tmp_path, "2026-11-17", [_s("a", "migros", 100), _s("b", "bim", 120), _s("c", "bim", 140),
                                  _s("d", "bim", 30, "Adet"), _s("x", "bim", 5)])
    _ham(tmp_path, "2026-11-18", [_s("a", "migros", 110), _s("b", "bim", 130)])
    esleme = pd.DataFrame({"urun_id": ["a", "b", "c", "d", "x"],
                           "madde_kodu": ["0111121", "0111121", "0111121", "0111121", None]})
    adlar = pd.Series({"0111121": "Pirinç"})
    f = madde_fiyatlari(str(tmp_path / "tarih=*" / "*.parquet"), esleme, adlar, zincir_gun=1)

    tum = f[f["zincir"] == "tum"].set_index("tarih")
    assert (tum["birim"] == "Kg").all()                 # Adet fiyatı (d) karışmaz
    assert tum.loc["2026-11-17", "ortanca_birim_fiyat"] == 120
    assert tum.loc["2026-11-17", "urun_sayisi"] == 3
    assert tum.loc["2026-11-18", "ortanca_birim_fiyat"] == 120
    assert "x" not in f.to_string()                     # eşleşmeyen ürün yok
    zin = f[f["zincir"] != "tum"]
    assert set(zin["tarih"]) == {"2026-11-18"}           # zincir kırılımı yalnızca son gün
    assert zin.set_index("zincir").loc["bim", "ortanca_birim_fiyat"] == 130
    assert (f["madde_adi"] == "Pirinç").all()


@pytest.fixture
def sonuc():
    gunler = ["2026-11-17", "2026-11-18"]
    satir = []
    for t, e in zip(gunler, [100.0, 101.0]):
        satir += [{"tarih": t, "seri_kodu": "TUFE", "seri_adi": "Genel endeks", "duzey": "genel", "endeks": e,
                   "kapsam": 0.277, "gunluk_degisim": None},
                  {"tarih": t, "seri_kodu": "011", "seri_adi": "Gıda", "duzey": "grup", "endeks": e,
                   "kapsam": 1.0, "gunluk_degisim": 1.0},
                  {"tarih": t, "seri_kodu": "0111121", "seri_adi": "Pirinç", "duzey": "madde", "endeks": e + 1,
                   "kapsam": 1.0, "gunluk_degisim": 0.5}]
    aylik = pd.DataFrame([{"ay": "2026-11", "seri_kodu": k, "seri_adi": a, "duzey": d, "endeks": 100.5,
                           "aylik_degisim": None, "yillik_degisim": None, "kesin": False, "gun": 2}
                          for k, a, d in [("TUFE", "Genel endeks", "genel"), ("011", "Gıda", "grup"),
                                          ("0111121", "Pirinç", "madde")]])
    ozet = pd.DataFrame({"tarih": gunler, "madde_kodu": "0111121", "n_birim": [10, 12],
                         "n_eslesen": [0, 9], "n_aykiri": [0, 1]})
    return {"gunluk": pd.DataFrame(satir), "aylik": aylik, "madde_ozet": ozet}


def test_pano_yaz(tmp_path, sonuc):
    sepet = pd.DataFrame([{"madde_kodu": "0111121", "madde_adi": "Pirinç", "alt_sinif_kodu": "01111",
                           "alt_sinif_agirlik": 0.5, "grup_kodu": "011", "grup_adi": "Gıda",
                           "ana_grup_kodu": "01", "ana_grup_adi": "Gıda ve alkolsüz içecekler", "agirlik": 0.25}])
    yazilan = pano_yaz(sonuc, sepet, tmp_path, {"0111121"})
    assert {y.name for y in yazilan} == {"gunluk.csv", "aylik.csv", "son_degisimler.csv", "gozlem.csv",
                                         "agirliklar.csv"}
    g = pd.read_csv(tmp_path / "gunluk.csv", dtype={"seri_kodu": str})
    assert g["seri_kodu"].tolist() == ["TUFE", "TUFE"] and g["kapsam"].iloc[0] == pytest.approx(27.7)
    assert pd.read_csv(tmp_path / "aylik.csv")["kesin"].eq("geçici").all()
    sd = pd.read_csv(tmp_path / "son_degisimler.csv", dtype={"seri_kodu": str}).set_index("seri_kodu")
    assert sd.loc["0111121", "gunluk"] == 0.5 and sd.loc["0111121", "tarih"] == "2026-11-18"
    assert pd.read_csv(tmp_path / "gozlem.csv")["aykiri"].tolist() == [0, 1]
    assert pd.read_csv(tmp_path / "agirliklar.csv")["market_kurali"].tolist() == ["evet"]
    m = pd.read_csv(madde_endeksleri_yaz(sonuc["gunluk"], tmp_path), dtype={"seri_kodu": str})
    assert m["seri_kodu"].unique().tolist() == ["0111121"] and m["endeks"].tolist() == [101.0, 102.0]
