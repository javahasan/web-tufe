"""Analiz Masası'ndaki haftalık görünüm için Web TÜFE verisi.

Haftalık rapor her pazartesi zamanlanmış Claude göreviyle yazılır. Görev yorum metnini kendisi
yazar, ama rapordaki sayılar ve grafik verisi bu modülün ürettiği "veriler"den gelir. Böylece
grafikler modele yazdırılmış sayılardan değil, hesaplanmış veriden çizilir. Resmi seriler (TCMB
EVDS) görev tarafından ayrı veri kimlikleriyle ve "resmi" kaynak etiketiyle eklenir; Web TÜFE
ile aynı seride birleştirilmez.

Çıktı biçimi Analiz Masası'nın rapor paketidir:
  {hafta, baslangic, bitis, olusturma, istatistik, veriler: {w1: {kaynak, baslik, aciklama, sorgu,
   satir_sayisi, satirlar}, ...}, rapor: null}
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from .ayarlar import CIKTI

# Haftalık görünümde fiyatı izlenen temel gıdalar (madde kodu)
# (Ekmek yok: kaynakta paketli özel ekmekler baskın, ortanca kilo fiyatı fırın ekmeğini yansıtmıyor.)
TEMEL_GIDALAR = ["0117241", "0117511", "0117431", "0112214", "0112246", "0114501", "0114111", "0115112", "0114811"]


def _oku(pano: Path, ad: str) -> pd.DataFrame:
    yol = pano / f"{ad}.csv"
    if not yol.exists():
        raise SystemExit(f"{yol} yok. Önce: webtufe pano")
    return pd.read_csv(yol, dtype={"seri_kodu": str, "madde_kodu": str})


def _kayitlar(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", force_ascii=False))


def haftalik_veri(pano: Path | None = None, bugun: date | None = None, ust: int = 8) -> dict:
    pano = pano or CIKTI / "pano"
    bugun = bugun or date.today()
    gunluk = _oku(pano, "gunluk")
    madde = _oku(pano, "madde_endeksleri")
    fiyat = _oku(pano, "madde_fiyatlari")

    gunler = sorted(gunluk["tarih"].unique())
    bitis = gunler[-1]
    hedef = (pd.Timestamp(bitis) - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
    # Haftalık karşılaştırma günü: 7 gün önceki ya da ondan önceki son toplama günü; yoksa ilk gün
    once = [g for g in gunler if g <= hedef]
    baslangic = once[-1] if once else gunler[0]
    yil, hafta, _ = bugun.isocalendar()

    veriler: dict[str, dict] = {}

    def ekle(kimlik, baslik, df, sorgu, aciklama=""):
        veriler[kimlik] = {"kaynak": "web", "baslik": baslik, "aciklama": aciklama, "sorgu": sorgu,
                           "satir_sayisi": int(len(df)), "satirlar": _kayitlar(df)}

    g = gunluk[gunluk["duzey"].isin(["genel", "ana_grup"])].dropna(subset=["endeks"])
    g = g.rename(columns={"seri_kodu": "kod", "seri_adi": "ad"})[["tarih", "kod", "ad", "endeks", "gunluk_degisim"]]
    ekle("w1", "Web TÜFE günlük endeks: genel ve ana gruplar", g,
         {"kaynak": "gunluk.csv", "duzey": "genel, ana_grup"}, "İlk toplama günü = 100")

    m = madde.dropna(subset=["endeks"])
    bas = m[m["tarih"] == baslangic].set_index("seri_kodu")["endeks"]
    son = m[m["tarih"] == bitis].set_index(["seri_kodu"])
    d = son.join(bas.rename("endeks_bas"), how="inner")
    d["deger"] = ((d["endeks"] / d["endeks_bas"] - 1) * 100).round(2)
    d = d.reset_index().rename(columns={"seri_kodu": "kod", "seri_adi": "ad"})[["kod", "ad", "deger"]]
    ekle("w2", f"Web TÜFE: {baslangic} – {bitis} arasında en çok artan maddeler",
         d.sort_values("deger", ascending=False).head(ust), {"kaynak": "madde_endeksleri.csv", "baslangic": baslangic, "bitis": bitis},
         "deger: madde endeksindeki yüzde değişim")
    ekle("w3", f"Web TÜFE: {baslangic} – {bitis} arasında en çok düşen maddeler",
         d.sort_values("deger").head(ust), {"kaynak": "madde_endeksleri.csv", "baslangic": baslangic, "bitis": bitis},
         "deger: madde endeksindeki yüzde değişim")

    f = fiyat[(fiyat["zincir"] == "tum") & fiyat["madde_kodu"].isin(TEMEL_GIDALAR)]
    f = f.rename(columns={"madde_kodu": "kod", "madde_adi": "ad", "ortanca_birim_fiyat": "fiyat"})[
        ["tarih", "kod", "ad", "birim", "fiyat", "urun_sayisi"]]
    ekle("w4", "Temel gıdaların ortanca raf fiyatı (TL/birim, tüm zincirler)", f,
         {"kaynak": "madde_fiyatlari.csv", "maddeler": TEMEL_GIDALAR}, "Ortanca, o gün bulunan ürünlere göre değişir")

    genel = g[g["kod"] == "TUFE"].set_index("tarih")["endeks"]
    istatistik = {
        "toplama_gunu_sayisi": len(gunler), "ilk_gun": gunler[0], "son_gun": bitis,
        "karsilastirma_gunu": baslangic,
        "genel_endeks_son": round(float(genel.get(bitis)), 3) if bitis in genel else None,
        "genel_haftalik_degisim_yuzde": round(float(genel[bitis] / genel[baslangic] * 100 - 100), 3)
        if bitis in genel and baslangic in genel and baslangic != bitis else None,
        "artan_madde_sayisi": int((d["deger"] > 0).sum()), "dusen_madde_sayisi": int((d["deger"] < 0).sum()),
        "degismeyen_madde_sayisi": int((d["deger"] == 0).sum()),
    }
    return {"hafta": f"{yil}-W{hafta:02d}", "baslangic": baslangic, "bitis": bitis,
            "olusturma": int(datetime.now().timestamp() * 1000), "istatistik": istatistik,
            "veriler": veriler, "rapor": None}
