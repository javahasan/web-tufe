"""Gerçek fiyat manşetlerinin süzgeçleri: kampanya, tek şubelik değişim, şüpheli pahalı ürün."""

import pandas as pd
import pytest

import webtufe.mansetler as m

MADDE = {"bal": "0118313", "firca": "1312002", "kahve": "0122011"}


def _satir(tarih, konum, zincir, uid, baslik, madde, fiyat, birim_fiyat=None, birim="Adet",
           indirim=False, indirimsiz=None):
    bf = fiyat if birim_fiyat is None else birim_fiyat
    return {"tarih": tarih, "konum": konum, "zincir": zincir, "urun_id": uid, "baslik": baslik,
            "_madde": madde, "fiyat": fiyat, "birim_fiyat": bf, "birim_fiyat_metin": f"{bf} ₺/{birim}",
            "indirim": indirim, "indirimsiz_fiyat": indirimsiz, "sube_id": f"{zincir}-{konum}"}


def _yaz(kok, satirlar):
    df = pd.DataFrame(satirlar)
    for tarih, g in df.groupby("tarih"):
        d = kok / "marketfiyati" / f"tarih={tarih}"
        d.mkdir(parents=True)
        g.drop(columns=["_madde", "tarih"]).to_parquet(d / "konum=hepsi.parquet", index=False)
    return df[["urun_id", "_madde"]].drop_duplicates().rename(columns={"_madde": "madde_kodu"})


@pytest.fixture
def veri(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "HAM", tmp_path)
    s = []
    for t in ["2026-11-12", "2026-11-17"]:
        yeni = t == "2026-11-17"
        # Karşılaştırma için sıradan kahveler (madde ortancası ~500 ₺/kg)
        for i in range(6):
            s.append(_satir(t, "ankara", "migros", f"k{i}", f"Kahve {i} 1 Kg", MADDE["kahve"], 450 + 20 * i, birim="Kg"))
        # A: 12 Kasım'da kampanyada (50 ₺, normali 124,95), 17 Kasım'da normal fiyat -> zam değil
        if yeni:
            s.append(_satir(t, "ankara", "carrefour", "A", "Kampanyası biten", MADDE["kahve"], 124.95, 250, "Kg"))
        else:
            s.append(_satir(t, "ankara", "carrefour", "A", "Kampanyası biten", MADDE["kahve"], 50, 100, "Kg",
                            indirim=True, indirimsiz=124.95))
        # B: tek zincirde, iki şehirde +%80 -> ulusal fiyat tek karar sayılır, manşete girmez
        for k in ["izmir", "ankara"]:
            s.append(_satir(t, k, "a101", "B", "Tek zincirde zamlanan", MADDE["kahve"], 180 if yeni else 100, birim="Kg"))
        # C: BİM'de +%20, Migros'ta iki şehirde +%15 -> manşet (ölçüt: ikinci güçlü zincir, %15)
        s.append(_satir(t, "ankara", "bim", "C", "İki zincirde zamlanan", MADDE["kahve"], 120 if yeni else 100, birim="Kg"))
        for k in ["izmir", "ankara"]:
            s.append(_satir(t, k, "migros", "C", "İki zincirde zamlanan", MADDE["kahve"], 115 if yeni else 100, birim="Kg"))
        # D: Migros -%30; A101 Ankara -%25, İzmir -%20 (eşitlikte küçük değişim temsil eder)
        s.append(_satir(t, "ankara", "migros", "D", "İki zincirde ucuzlayan", MADDE["kahve"], 70 if yeni else 100, birim="Kg"))
        s.append(_satir(t, "ankara", "a101", "D", "İki zincirde ucuzlayan", MADDE["kahve"], 75 if yeni else 100, birim="Kg"))
        s.append(_satir(t, "izmir", "a101", "D", "İki zincirde ucuzlayan", MADDE["kahve"], 80 if yeni else 100, birim="Kg"))
        # E: tek zincirde iki şehirde -%50 -> girmez
        for k in ["izmir", "ankara"]:
            s.append(_satir(t, k, "migros", "E", "Tek zincirde ucuzlayan", MADDE["kahve"], 50 if yeni else 100, birim="Kg"))
        # Pahalılar: H tek şubede ve birim fiyatı ortancanın ~18 katı -> atlanır;
        # F (şarjlı fırça) ortancanın çok üstünde ama iki şehirde aynı fiyat -> en pahalı
        s.append(_satir(t, "ankara", "carrefour", "H", "Şüpheli bal 450 Gr", MADDE["kahve"], 3999, 8886, "Kg"))
        for k in ["ankara", "izmir"]:
            s.append(_satir(t, k, "carrefour", "F", "Şarjlı diş fırçası", MADDE["firca"], 3649))
        for i in range(5):
            s.append(_satir(t, "ankara", "a101", f"f{i}", f"Diş fırçası {i}", MADDE["firca"], 100 + i))
    return _yaz(tmp_path, s)


def test_kampanya_ve_tek_zincir_zam_sayilmaz(veri):
    df = m.mansetleri_uret(veri, "2026-11-17").set_index("anahtar")
    zam = df.loc["en_cok_zamlanan"]
    assert zam["urun"] == "İki zincirde zamlanan"
    assert zam["deger"] == pytest.approx(15.0)
    assert (zam["deger2"], zam["deger3"]) == (100.0, 115.0)
    assert zam["zincir"] == "Migros'ta"
    assert zam["konum"] == "2 şehirde"          # fiyat iki şehirde aynı
    assert zam["onceki_tarih"] == "2026-11-12"


def test_ucuzlayan_iki_birimde_teyitli(veri):
    df = m.mansetleri_uret(veri, "2026-11-17").set_index("anahtar")
    u = df.loc["en_cok_ucuzlayan"]
    assert u["urun"] == "İki zincirde ucuzlayan"
    assert u["deger"] == pytest.approx(-20.0)
    assert (u["zincir"], u["konum"]) == ("A101'de", "İzmir")   # şehirlerde fiyat farklı


def test_supheli_pahali_urun_atlanir_teyitli_olan_kalir(veri):
    df = m.mansetleri_uret(veri, "2026-11-17").set_index("anahtar")
    assert df.loc["en_pahali", "urun"] == "Şarjlı diş fırçası"
    assert df.loc["en_pahali", "deger"] == 3649


def test_liste_fiyati():
    d = pd.DataFrame({"fiyat": [50.0, 80.0, 90.0], "indirim": [True, False, True],
                      "indirimsiz_fiyat": [124.95, None, None]})
    assert m._liste_fiyati(d).tolist() == [124.95, 80.0, 90.0]
