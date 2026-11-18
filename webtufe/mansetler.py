"""Gerçek market fiyatlarından günün manşetleri.

Son toplama gününün ham verisinden (ve varsa bir önceki günden) kısa olgular çıkarır:
  gozlem         bugün kaç şehir, zincir ve fiyat
  en_pahali      endeks sepetindeki en pahalı ürün (paket fiyatı). Birim fiyatı kendi maddesinin
                 ortancasının 5 katını aşan ve başka şubede teyit edilmeyen fiyatlar atlanır.
  zincir_farki   aynı ürün için zincirler arası en büyük fiyat farkı
  birim_fiyat    temel gıdaların kilo/litre/adet fiyatı (ortanca)
  en_cok_zamlanan, en_cok_ucuzlayan   önceki toplama gününe göre (iki gün veri gerekir). Liste
                 (indirimsiz) fiyatlar karşılaştırılır; değişim en az iki farklı zincirde aynı
                 yönde görülmelidir (bir zincirin şehirleri tek teyit sayılır).

Çıktı: data/cikti/mansetler_gercek.csv. Pano bu dosyayı "gercek_mansetler" kaynağı olarak okur.
"""

from __future__ import annotations

import logging
import re

import duckdb
import numpy as np
import pandas as pd

from .ayarlar import CIKTI, HAM

log = logging.getLogger(__name__)

ZINCIR = {"a101": "A101", "bim": "BİM", "carrefour": "CarrefourSA", "hakmar": "Hakmar",
          "migros": "Migros", "tarim_kredi": "Tarım Kredi", "sok": "ŞOK"}
ZINCIR_DE = {"a101": "A101'de", "bim": "BİM'de", "carrefour": "CarrefourSA'da", "hakmar": "Hakmar'da",
             "migros": "Migros'ta", "tarim_kredi": "Tarım Kredi'de", "sok": "ŞOK'ta"}
KONUM = {"istanbul_anadolu": "İstanbul Anadolu", "istanbul_avrupa": "İstanbul Avrupa", "ankara": "Ankara",
         "izmir": "İzmir", "bursa": "Bursa", "antalya": "Antalya", "adana": "Adana", "gaziantep": "Gaziantep",
         "konya": "Konya", "kayseri": "Kayseri", "samsun": "Samsun", "trabzon": "Trabzon",
         "diyarbakir": "Diyarbakır", "erzurum": "Erzurum"}
# Temel gıdalar: madde kodu -> (ad, tamlayan biçimi, beklenen birim)
TEMEL = {
    "0117241": ("Domates", "Domatesin", "Kg"), "0117511": ("Patates", "Patatesin", "Kg"),
    "0117431": ("Kuru soğan", "Kuru soğanın", "Kg"), "0112214": ("Dana eti", "Dana etinin", "Kg"),
    "0112246": ("Tavuk eti", "Tavuk etinin", "Kg"), "0114501": ("Beyaz peynir", "Beyaz peynirin", "Kg"),
    "0114111": ("Süt", "Sütün", "Lt"), "0115112": ("Ayçiçek yağı", "Ayçiçek yağının", "Lt"),
    "0114811": ("Yumurta", "Yumurtanın", "Adet"),
}
# Aynı ürün için bundan büyük zincir farkı çoğunlukla kaynakta farklı paketlerin
# aynı ürüne bağlanmasından gelir; manşete alınmaz.
AZAMI_ZINCIR_FARKI = 100.0
BIRIM_METIN = {"Kg": "kilosu", "Lt": "litresi", "Adet": "tanesi"}

# En pahalı ürün denetimi: kilo/litre/adet fiyatı kendi maddesindeki ürünlerin ortancasının
# bu katını aşan fiyat kaynakta hatalı olabilir. Böyle bir fiyat ancak aynı ürün başka bir
# şubede ya da şehirde de (±%25) görülüyorsa manşete alınır.
AZAMI_BIRIM_ORANI = 5.0
ASGARI_KARSILASTIRMA = 5      # madde ortancası en az bu kadar ürünle hesaplanır
TEYIT_TOLERANSI = 0.25
# Zam/ucuzlama manşeti: değişim en az bu kadar farklı zincirde aynı yönde görülmeli.
# Ulusal zincirler her şehirde aynı fiyatı uyguladığından bir zincirin şehirleri tek karar
# sayılır; tek zincirdeki değişim çoğunlukla işaretlenmemiş kampanyadır.
ASGARI_AYNI_YON = 2


def _gun_verisi(tarih: str) -> pd.DataFrame:
    desen = str(HAM / "marketfiyati" / f"tarih={tarih}" / "*.parquet")
    return duckdb.sql(f"SELECT * FROM read_parquet('{desen}', union_by_name=true) WHERE fiyat > 0").df()


def _toplama_gunleri() -> list[str]:
    return sorted(p.name.split("=", 1)[1] for p in (HAM / "marketfiyati").glob("tarih=*") if any(p.glob("*.parquet")))


def _birim(df: pd.DataFrame) -> pd.Series:
    """'8.886,67 ₺/Kg' -> 'Kg'."""
    metin = df["birim_fiyat_metin"] if "birim_fiyat_metin" in df else pd.Series("", index=df.index)
    return metin.fillna("").astype(str).str.extract(r"/\s*(\w+)")[0]


def _liste_fiyati(df: pd.DataFrame) -> pd.Series:
    """Kampanyasız (raf etiketindeki normal) fiyat. Zincir indirimi işaretlemişse indirimsiz
    fiyat, yoksa satış fiyatı. A101, ŞOK, Hakmar ve Tarım Kredi indirimi işaretlemiyor."""
    if "indirim" not in df or "indirimsiz_fiyat" not in df:
        return df["fiyat"]
    indirimli = df["indirim"].fillna(False).astype(bool) & (df["indirimsiz_fiyat"] > df["fiyat"])
    return df["fiyat"].where(~indirimli, df["indirimsiz_fiyat"])


def _en_pahali(eslesen: pd.DataFrame, aday_sayisi: int = 500) -> pd.Series | None:
    """Fiyatı makul ya da başka bir birimde teyit edilen en pahalı ürün satırı."""
    e = eslesen.assign(_birim=_birim(eslesen))
    urun = e.dropna(subset=["birim_fiyat"]).groupby(["madde_kodu", "_birim", "urun_id"])["birim_fiyat"].median()
    ortanca = urun.groupby(["madde_kodu", "_birim"]).agg(["median", "size"])
    for _, r in e.sort_values("fiyat", ascending=False).head(aday_sayisi).iterrows():
        ayni = e[(e["urun_id"] == r["urun_id"]) & ((e["fiyat"] - r["fiyat"]).abs() <= TEYIT_TOLERANSI * r["fiyat"])]
        if len(ayni[["zincir", "konum"]].drop_duplicates()) >= 2:
            return r
        anahtar = (r["madde_kodu"], r["_birim"])
        if pd.notna(r.get("birim_fiyat")) and anahtar in ortanca.index:
            m = ortanca.loc[anahtar]
            if m["size"] >= ASGARI_KARSILASTIRMA and r["birim_fiyat"] <= AZAMI_BIRIM_ORANI * m["median"]:
                return r
        log.info("En pahalı ürün adayı elendi (teyitsiz, birim fiyatı madde ortancasının çok üstünde): %s %.2f",
                 r["baslik"], r["fiyat"])
    return None


def _zincir_duzeyi(d: pd.DataFrame) -> pd.DataFrame:
    """Şehir satırlarından (ürün × zincir × şehir) zincir başına bir temsilci satır: değişimi
    zincirin şehirlerdeki ortancasına en yakın şehir (eşitlikte daha küçük değişim). 'yer'
    sütunu, fiyat her şehirde aynıysa "3 şehirde", değilse temsilci şehrin adıdır."""
    d = d.assign(_uzak=(d["r"] - d.groupby(["urun_id", "zincir"])["r"].transform("median")).abs(),
                 _buyukluk=d["r"].abs())
    temsil = d.sort_values(["_uzak", "_buyukluk", "konum"]).groupby(["urun_id", "zincir"]).head(1)
    ozet = d.groupby(["urun_id", "zincir"]).agg(_sehir=("konum", "nunique"), _eski=("eski", "nunique"),
                                                 _yeni=("yeni", "nunique")).reset_index()
    temsil = temsil.merge(ozet, on=["urun_id", "zincir"])
    tek_fiyat = (temsil["_sehir"] > 1) & (temsil["_eski"] == 1) & (temsil["_yeni"] == 1)
    temsil["yer"] = np.where(tek_fiyat, temsil["_sehir"].astype(str) + " şehirde",
                             temsil["konum"].map(lambda k: KONUM.get(k, k)))
    return temsil.drop(columns=["_uzak", "_buyukluk", "_sehir", "_eski", "_yeni"])


def _teyitli_uc(d: pd.DataFrame, artan: bool) -> pd.Series | None:
    """En az ASGARI_AYNI_YON zincirde aynı yönde değişen ürünlerden en büyük değişimi gösteren.
    d zincir düzeyindedir (_zincir_duzeyi). Ölçüt, ürünün ASGARI_AYNI_YON'uncu en güçlü zincir
    değişimidir (en az iki zincirde görülen artış); manşette o zincirin fiyatları yazılır."""
    s = d[d["r"] > 0] if artan else d[d["r"] < 0]
    s = s.sort_values("r", ascending=not artan)
    s = s.assign(_sira=s.groupby("urun_id").cumcount())
    aday = s[s["_sira"] == ASGARI_AYNI_YON - 1]
    if aday.empty:
        return None
    return aday.sort_values("r", ascending=not artan).iloc[0]


def mansetleri_uret(esleme: pd.DataFrame, tarih: str | None = None) -> pd.DataFrame:
    gunler = _toplama_gunleri()
    if not gunler:
        raise ValueError("Ham veri yok.")
    tarih = tarih or gunler[-1]
    onceki = max((g for g in gunler if g < tarih), default=None)
    bugun = _gun_verisi(tarih).merge(esleme[["urun_id", "madde_kodu"]], on="urun_id", how="left")
    eslesen = bugun.dropna(subset=["madde_kodu"])
    satirlar = []

    def ekle(anahtar, **alan):
        satirlar.append({"anahtar": anahtar, "tarih": tarih, **alan})

    ekle("gozlem", deger=len(bugun), deger2=bugun["zincir"].nunique(), deger3=bugun["konum"].nunique(),
         urun=f"{bugun['urun_id'].nunique()} ürün")

    if not eslesen.empty:
        r = _en_pahali(eslesen)
        if r is not None:
            ekle("en_pahali", urun=r["baslik"], deger=float(r["fiyat"]), zincir=ZINCIR.get(r["zincir"], r["zincir"]),
                 konum=KONUM.get(r["konum"], r["konum"]))

        # Aynı ürün, zincirler arası fark (şehirler arası ortanca)
        z = eslesen.groupby(["urun_id", "baslik", "zincir"])["fiyat"].median().reset_index()
        cok = z.groupby("urun_id").filter(lambda g: g["zincir"].nunique() >= 3)
        if not cok.empty:
            ozet = cok.groupby(["urun_id", "baslik"]).agg(en_dusuk=("fiyat", "min"), en_yuksek=("fiyat", "max")).reset_index()
            ozet = ozet[ozet["en_dusuk"] >= 30]
            ozet["fark"] = (ozet["en_yuksek"] / ozet["en_dusuk"] - 1) * 100
            ozet = ozet[ozet["fark"] <= AZAMI_ZINCIR_FARKI]
            if not ozet.empty:
                r = ozet.sort_values("fark", ascending=False).iloc[0]
                urunun = cok[cok["urun_id"] == r["urun_id"]]
                ucuz = urunun.sort_values("fiyat").iloc[0]["zincir"]
                pahali = urunun.sort_values("fiyat").iloc[-1]["zincir"]
                ekle("zincir_farki", urun=r["baslik"], deger=round(float(r["fark"]), 2),
                     deger2=float(r["en_dusuk"]), deger3=float(r["en_yuksek"]),
                     zincir=ZINCIR_DE.get(ucuz, ucuz), zincir2=ZINCIR_DE.get(pahali, pahali))

        # Temel gıdaların birim fiyatı: her ürün bir kez (zincir ve şehirler arası ortancası)
        birim = eslesen["birim_fiyat_metin"].fillna("").str.extract(r"/\s*(\w+)")[0]
        for kod, (ad, tamlayan, beklenen) in TEMEL.items():
            s = eslesen[(eslesen["madde_kodu"] == kod) & (birim == beklenen)].dropna(subset=["birim_fiyat"])
            urun_basina = s.groupby("urun_id")["birim_fiyat"].median()
            if len(urun_basina) >= 3:
                ekle("birim_fiyat", urun=tamlayan, deger=round(float(urun_basina.median()), 2),
                     deger2=round(float(urun_basina.min()), 2), deger3=int(len(urun_basina)),
                     birim=BIRIM_METIN[beklenen])

    # Önceki toplamaya göre en çok zamlanan / ucuzlayan. Kampanya başlangıcı ya da bitişi zam
    # sayılmasın diye liste (indirimsiz) fiyatları karşılaştırılır ve değişimin en az
    # ASGARI_AYNI_YON farklı zincirde aynı yönde görülmesi istenir.
    if onceki:
        dun = _gun_verisi(onceki)
        a = (eslesen.assign(liste=_liste_fiyati(eslesen))
             .groupby(["urun_id", "baslik", "zincir", "konum"])["liste"].median().rename("yeni").reset_index())
        b = dun.assign(liste=_liste_fiyati(dun)).groupby(["urun_id", "zincir", "konum"])["liste"].median().rename("eski").reset_index()
        d = a.merge(b, on=["urun_id", "zincir", "konum"])
        d = d[(d["eski"] >= 10) & (d["yeni"] >= 10)]
        d["r"] = np.log(d["yeni"] / d["eski"])
        d = d[np.abs(d["r"]) <= np.log(2.5)]
        z = _zincir_duzeyi(d) if not d.empty else d
        for anahtar, artan in [("en_cok_zamlanan", True), ("en_cok_ucuzlayan", False)]:
            r = _teyitli_uc(z, artan) if not z.empty else None
            if r is not None:
                ekle(anahtar, urun=r["baslik"], deger=round(float(np.expm1(r["r"]) * 100), 2), deger2=float(r["eski"]),
                     deger3=float(r["yeni"]), zincir=ZINCIR_DE.get(r["zincir"], r["zincir"]),
                     konum=r["yer"], onceki_tarih=onceki)

    sutunlar = ["anahtar", "tarih", "urun", "deger", "deger2", "deger3", "birim", "zincir", "zincir2", "konum", "onceki_tarih"]
    df = pd.DataFrame(satirlar)
    for s in sutunlar:
        if s not in df.columns:
            df[s] = None
    return df[sutunlar]


def kaydet(df: pd.DataFrame) -> str:
    CIKTI.mkdir(parents=True, exist_ok=True)
    yol = CIKTI / "mansetler_gercek.csv"
    df.to_csv(yol, index=False)
    return str(yol)
