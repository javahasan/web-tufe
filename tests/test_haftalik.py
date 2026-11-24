"""Haftalık görünüm verisi."""

from datetime import date

import pandas as pd

from webtufe.haftalik import haftalik_veri


def test_haftalik_veri(tmp_path):
    gunler = ["2026-11-12", "2026-11-17", "2026-11-18", "2026-11-23"]
    pd.DataFrame([{"tarih": t, "seri_kodu": k, "seri_adi": a, "duzey": d, "endeks": e, "gunluk_degisim": None,
                   "yillik_degisim": None, "kapsam": 27.7}
                  for t, e in zip(gunler, [100, 100.4, 100.2, 101.0])
                  for k, a, d in [("TUFE", "Genel endeks", "genel"), ("01", "Gıda", "ana_grup"), ("B", "B", "ozel")]
                  ]).to_csv(tmp_path / "gunluk.csv", index=False)
    pd.DataFrame([{"tarih": t, "seri_kodu": k, "seri_adi": a, "endeks": e, "gunluk_degisim": None}
                  for t in gunler for k, a, e in [("0117241", "Domates", 100 if t < "2026-11-17" else 110),
                                                  ("0114111", "Süt", 100 if t < "2026-11-17" else 95)]
                  ]).to_csv(tmp_path / "madde_endeksleri.csv", index=False)
    pd.DataFrame([{"tarih": t, "madde_kodu": "0117241", "madde_adi": "Domates", "zincir": z, "birim": "Kg",
                   "ortanca_birim_fiyat": 50.0, "urun_sayisi": 3, "gozlem": 9} for t in gunler for z in ["tum", "bim"]]
                 ).to_csv(tmp_path / "madde_fiyatlari.csv", index=False)
    p = haftalik_veri(tmp_path, bugun=date(2026, 11, 23))
    assert p["hafta"] == "2026-W48" and p["bitis"] == "2026-11-23"
    assert p["baslangic"] == "2026-11-12"          # 7 gün önce (16 Kasım) toplama yok; öncesindeki son gün
    assert p["istatistik"]["genel_haftalik_degisim_yuzde"] == 1.0
    assert {r["kod"] for r in p["veriler"]["w1"]["satirlar"]} == {"TUFE", "01"}   # özel göstergeler yok
    assert p["veriler"]["w2"]["satirlar"][0] == {"kod": "0117241", "ad": "Domates", "deger": 10.0}
    assert p["veriler"]["w3"]["satirlar"][0]["deger"] == -5.0
    assert {r["tarih"] for r in p["veriler"]["w4"]["satirlar"]} == set(gunler)   # yalnızca "tum" satırları
    assert all(v["kaynak"] == "web" for v in p["veriler"].values()) and p["rapor"] is None
