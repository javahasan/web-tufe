"""İstanbul trafik indeksinden zorunlu ve isteğe bağlı hareketlilik göstergeleri.

Amaç: tüketimle ilişkili hareketliliği, işe ve okula gidiş gibi zorunlu hareketlilikten ayırmak.
Saatlik İBB trafik indeksi gün tipine ve saat penceresine göre ayrılır:

  zorunlu_sabah      iş günü 06-09   işe ve okula gidiş (okul döneminde yaz tatiline göre ~15 puan yüksek)
  karma_aksam        iş günü 16-19   eve dönüş ile akşam alışverişi karışık; indeks bu saatte tavana yakın
  is_gunu_ogle       iş günü 10-15   iş seyahati ve gün içi alışveriş (zayıf isteğe bağlı)
  is_gunu_gece       iş günü 20-23   yeme-içme, eğlence, akşam alışverişi (isteğe bağlı)
  hafta_sonu_gunduz  Cmt-Paz 11-19   alışveriş ve gezi; zorunlu yolculuk çok az (en temiz isteğe bağlı sinyal)
  hafta_sonu_gece    Cmt-Paz 20-23   eğlence (isteğe bağlı)
  tatil_gunduz       resmi tatil 11-19 (yalnızca bilgi; baz hesaplanmaz)

Her pencerenin günlük değeri, penceredeki saatlik indekslerin ortalamasıdır. İki karşılaştırma:
  yillik:   aynı pencerenin 52 hafta önceki aynı haftanın günü ve ±1 haftası (3 gün) ortancası
  kisa:     aynı pencerenin son 8 haftadaki aynı haftanın günlerinin ortancası (en az 4 gün)
Baz günleri "temiz" olmalı (resmi tatil, arife, bayram çevresi değil) ve okul durumu karşılaştırılan
günle aynı olmalı (okul dönemi okul dönemiyle, tatil tatille). Böylece okul takvimi, bayram ve
mevsim etkisi düşer; geriye kalan değişim daha çok isteğe bağlı hareketliliktir.

Sınırlar: indeks tıkanıklıktır, araç sayısı değil; zirve saatlerde tavana yaklaşır. Yağmur ve kar
tıkanıklığı artırıp isteğe bağlı yolculuğu azaltır; hava düzeltmesi henüz yok. Yalnızca İstanbul.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import yaml

from .ayarlar import CIKTI, CONFIG, HAM

SAATLIK = HAM / "ibb_trafik" / "saatlik.csv"
CIKIS = CIKTI / "mobilite"

# ad -> (gün tipleri, ilk saat, son saat (dahil), tür, açıklama)
PENCERELER = {
    "zorunlu_sabah": ({"is_gunu"}, 6, 9, "zorunlu", "İş günü 06-09: işe ve okula gidiş"),
    "karma_aksam": ({"is_gunu"}, 16, 19, "karma", "İş günü 16-19: eve dönüş ve akşam alışverişi"),
    "is_gunu_ogle": ({"is_gunu"}, 10, 15, "istege_bagli_zayif", "İş günü 10-15: iş seyahati ve gün içi alışveriş"),
    "is_gunu_gece": ({"is_gunu"}, 20, 23, "istege_bagli", "İş günü 20-23: yeme-içme, eğlence"),
    "hafta_sonu_gunduz": ({"cumartesi", "pazar"}, 11, 19, "istege_bagli", "Hafta sonu 11-19: alışveriş ve gezi"),
    "hafta_sonu_gece": ({"cumartesi", "pazar"}, 20, 23, "istege_bagli", "Hafta sonu 20-23: eğlence"),
    "tatil_gunduz": ({"tatil"}, 11, 19, "tatil", "Resmi tatil 11-19 (bilgi)"),
}
BAYRAM_CEVRESI_GUN = 3     # çok günlü bayramın bu kadar gün öncesi ve sonrası baz dışı
YILLIK_ASGARI, KISA_ASGARI = 2, 4


@dataclass
class Takvim:
    resmi_tatil: set[date]
    yarim_gun: set[date]
    okul_tatili: list[tuple[date, date]]
    ilk_gun: date
    son_gun: date

    def okul_tatili_mi(self, g: date) -> bool | None:
        if g < self.ilk_gun or g > self.son_gun:
            return None
        return any(a <= g <= b for a, b in self.okul_tatili)

    def bayram_cevresi_mi(self, g: date) -> bool:
        """Art arda en az 3 günlük resmi tatilin (bayram) çevresindeki günler: çoğu kişi izinde."""
        for t in self.resmi_tatil:
            uzun = all((t + timedelta(days=k)) in self.resmi_tatil for k in range(3))
            if uzun:
                son = t
                while son + timedelta(days=1) in self.resmi_tatil:
                    son += timedelta(days=1)
                if t - timedelta(days=BAYRAM_CEVRESI_GUN) <= g <= son + timedelta(days=BAYRAM_CEVRESI_GUN):
                    return True
        return False


def takvim_yukle(yol: Path | None = None) -> Takvim:
    h = yaml.safe_load((yol or CONFIG / "takvim.yaml").read_text(encoding="utf-8"))
    g = lambda x: x if isinstance(x, date) else date.fromisoformat(str(x))   # noqa: E731
    okul = [(g(a), g(b)) for a, b in h.get("okul_tatili", [])]
    return Takvim(resmi_tatil={g(x) for x in h.get("resmi_tatil", [])}, yarim_gun={g(x) for x in h.get("yarim_gun", [])},
                  okul_tatili=okul, ilk_gun=g(h.get("takvim_ilk_gun", "2024-09-09")), son_gun=g(h["takvim_son_gun"]))


def gun_bilgisi(gunler: list[date], takvim: Takvim) -> pd.DataFrame:
    satir = []
    for g in gunler:
        tatil = g in takvim.resmi_tatil
        tip = "tatil" if tatil else ("cumartesi" if g.weekday() == 5 else "pazar" if g.weekday() == 6 else "is_gunu")
        okul = takvim.okul_tatili_mi(g)
        cevre = takvim.bayram_cevresi_mi(g)
        temiz = not tatil and g not in takvim.yarim_gun and not cevre and okul is not None
        satir.append({"tarih": g, "gun_tipi": tip, "haftanin_gunu": g.weekday(), "resmi_tatil": tatil,
                      "yarim_gun": g in takvim.yarim_gun, "bayram_cevresi": cevre, "okul_tatili": okul, "temiz": temiz})
    return pd.DataFrame(satir).set_index("tarih")


def pencere_degerleri(saatlik: pd.DataFrame, gunler: pd.DataFrame) -> pd.DataFrame:
    """saatlik: zaman (YYYY-AA-GG SS:00), indeks. Yalnızca bütün saatleri olan pencereler döner."""
    s = saatlik.copy()
    z = pd.to_datetime(s["zaman"])
    s["tarih"], s["saat"] = z.dt.date, z.dt.hour
    satir = []
    for (g, grup) in s.groupby("tarih"):
        if g not in gunler.index:
            continue
        tip = gunler.at[g, "gun_tipi"]
        for ad, (tipler, bas, son, tur, _) in PENCERELER.items():
            if tip not in tipler:
                continue
            p = grup[(grup["saat"] >= bas) & (grup["saat"] <= son)]
            if p["saat"].nunique() < son - bas + 1:
                continue
            satir.append({"tarih": g, "pencere": ad, "tur": tur, "deger": round(float(p["indeks"].mean()), 3)})
    return pd.DataFrame(satir, columns=["tarih", "pencere", "tur", "deger"])


def bazlari_ekle(p: pd.DataFrame, gunler: pd.DataFrame) -> pd.DataFrame:
    deger = {(r.tarih, r.pencere): r.deger for r in p.itertuples()}

    def baz(g: date, pencere: str, adaylar: list[date], asgari: int) -> tuple[float | None, int]:
        okul = gunler.at[g, "okul_tatili"] if g in gunler.index else None
        v = [deger[(a, pencere)] for a in adaylar
             if (a, pencere) in deger and a in gunler.index and gunler.at[a, "temiz"]
             and okul is not None and gunler.at[a, "okul_tatili"] == okul]
        return (float(pd.Series(v).median()), len(v)) if len(v) >= asgari else (None, len(v))

    yb, yn, kb, kn = [], [], [], []
    for r in p.itertuples():
        if r.tur == "tatil":
            yb.append(None); yn.append(0); kb.append(None); kn.append(0)   # noqa: E702
            continue
        y = baz(r.tarih, r.pencere, [r.tarih - timedelta(days=364 + k) for k in (-7, 0, 7)], YILLIK_ASGARI)
        k = baz(r.tarih, r.pencere, [r.tarih - timedelta(days=7 * i) for i in range(1, 9)], KISA_ASGARI)
        yb.append(y[0]); yn.append(y[1]); kb.append(k[0]); kn.append(k[1])   # noqa: E702
    p = p.assign(yillik_baz=yb, yillik_baz_gun=yn, kisa_baz=kb, kisa_baz_gun=kn)
    p["yillik_degisim"] = ((p["deger"] / p["yillik_baz"] - 1) * 100).round(2)
    p["kisa_sapma"] = ((p["deger"] / p["kisa_baz"] - 1) * 100).round(2)
    return p


def haftalik_ozet(p: pd.DataFrame, gunler: pd.DataFrame) -> pd.DataFrame:
    """Haftalık ortalama: önce her pencerenin hafta içindeki temiz günlerinin ortalaması, sonra
    aynı türdeki pencerelerin eşit ağırlıklı ortalaması (iş günü penceresi 5 gün, hafta sonu 2 gün
    olduğu için gün sayısıyla ağırlıklandırılmaz)."""
    d = p.merge(gunler[["temiz"]], left_on="tarih", right_index=True)
    d = d[d["temiz"] & d["tur"].isin(["zorunlu", "karma", "istege_bagli", "istege_bagli_zayif"])].copy()
    if d.empty:
        return pd.DataFrame()
    t = pd.to_datetime(d["tarih"])
    iso = t.dt.isocalendar()
    d["hafta"] = iso["year"].astype(str) + "-W" + iso["week"].astype(str).str.zfill(2)
    d["hafta_basi"] = (t - pd.to_timedelta(t.dt.day_of_week, unit="D")).dt.strftime("%Y-%m-%d")
    anahtar = ["hafta", "hafta_basi"]
    pen = d.groupby(anahtar + ["pencere", "tur"])[["yillik_degisim", "kisa_sapma"]].mean().reset_index()
    tur = pen.groupby(anahtar + ["tur"])[["yillik_degisim", "kisa_sapma"]].mean().unstack("tur")
    tur.columns = [f"{tr}_{olcu}" for olcu, tr in tur.columns]
    ayrinti = pen.pivot_table(index=anahtar, columns="pencere", values="yillik_degisim")
    ayrinti.columns = [f"{c}_yillik_degisim" for c in ayrinti.columns]
    o = tur.join(ayrinti)
    o["temiz_gun"] = d.groupby(anahtar)["tarih"].nunique()
    return o.round(2).reset_index()


def hesapla(saatlik_yol: Path | None = None, cikis: Path | None = None, takvim: Takvim | None = None) -> dict:
    saatlik = pd.read_csv(saatlik_yol or SAATLIK, dtype={"zaman": str})
    takvim = takvim or takvim_yukle()
    gunler_list = sorted(pd.to_datetime(saatlik["zaman"]).dt.date.unique())
    gunler = gun_bilgisi(gunler_list, takvim)
    p = bazlari_ekle(pencere_degerleri(saatlik, gunler), gunler)
    h = haftalik_ozet(p, gunler)
    p = p.merge(gunler.drop(columns=["haftanin_gunu"]), left_on="tarih", right_index=True).sort_values(["tarih", "pencere"])
    cikis = cikis or CIKIS
    cikis.mkdir(parents=True, exist_ok=True)
    p["tarih"] = p["tarih"].astype(str)
    p.to_csv(cikis / "pencereler.csv", index=False)
    h.to_csv(cikis / "haftalik.csv", index=False)
    return {"gun": len(gunler), "pencere_satiri": len(p), "hafta": len(h),
            "son_gun": p["tarih"].max() if len(p) else None}
