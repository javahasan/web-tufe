"""Panoya ve Analiz Masası'na günlük dosya yüklemesi için yardımcı.

Zamanlanmış Claude görevi ("webtufe-pano-mansetleri") bunu kullanır:

  .venv/bin/python scripts/pano_yukle.py durum
      Hangi dosyalar yüklenmeye hazır? JSON yazar: hazir, neden, dosyalar[...]
  .venv/bin/python scripts/pano_yukle.py kaydet <hedef> <yeni_varlik_id> <tarih>
      Yüklenen dosyanın kimliğini ve tarihini kaydeder (hedef ör. "pano:gunluk").
  .venv/bin/python scripts/pano_yukle.py analiz-belgesi <cikti.json>
      Analiz Masası'nın "veri/guncel" belgesini kayıtlı varlık kimliklerinden yazar.

Hedefler iki sayfadadır:
  pano:<veri seti>     Web Fiyat Endeksi panosu; dosya, aynı adlı veri setinin kaynağı olur.
  analiz:<dosya adı>   Analiz Masası; dosyaların adresleri "veri/guncel" belgesinde tutulur.

Bir dosya, verisi o hedefe en son yüklenen veriden daha yeniyse hazırdır. (GitHub zamanlanmış
toplamayı saatlerce geciktirebildiği ve Mac her gün açık olmadığı için "bugünün verisi" şartı
aranmaz; gecikmiş ya da birkaç günlük birikmiş veri de ilk fırsatta yüklenir.) Görev önce
`scripts/git_guncelle.sh` ve `webtufe pano` çalıştırır; yükleme kayıtları yalnızca bu bilgisayarda,
data/cikti/pano_durum.json dosyasında tutulur.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

KOK = Path(__file__).resolve().parent.parent
CIKTI = KOK / "data" / "cikti"
PANO_DIZIN = CIKTI / "pano"
DURUM = CIKTI / "pano_durum.json"
HAM = KOK / "data" / "ham" / "marketfiyati"
PANO = "https://claude.ai/artifact/EBnsgW9YWx84vQTiunF39Z"
ANALIZ = "https://claude.ai/artifact/M8R7pxhtN7ZyJqceRbzt8X"

# hedef -> (artifact, dosya)
HEDEFLER = {
    "pano:gercek_mansetler": (PANO, CIKTI / "mansetler_gercek.csv"),
    "pano:gunluk": (PANO, PANO_DIZIN / "gunluk.csv"),
    "pano:aylik": (PANO, PANO_DIZIN / "aylik.csv"),
    "pano:son_degisimler": (PANO, PANO_DIZIN / "son_degisimler.csv"),
    "pano:gozlem": (PANO, PANO_DIZIN / "gozlem.csv"),
    "pano:mobilite_saatlik": (PANO, PANO_DIZIN / "mobilite_saatlik.csv"),
    "pano:mobilite_gunluk": (PANO, PANO_DIZIN / "mobilite_gunluk.csv"),
    "pano:mobilite_haftalik": (PANO, PANO_DIZIN / "mobilite_haftalik.csv"),
    "pano:akaryakit_ulke": (PANO, PANO_DIZIN / "akaryakit_ulke.csv"),
    "pano:akaryakit_il": (PANO, PANO_DIZIN / "akaryakit_il.csv"),
    "analiz:gunluk": (ANALIZ, PANO_DIZIN / "gunluk.csv"),
    "analiz:aylik": (ANALIZ, PANO_DIZIN / "aylik.csv"),
    "analiz:son_degisimler": (ANALIZ, PANO_DIZIN / "son_degisimler.csv"),
    "analiz:madde_endeksleri": (ANALIZ, PANO_DIZIN / "madde_endeksleri.csv"),
    "analiz:madde_fiyatlari": (ANALIZ, PANO_DIZIN / "madde_fiyatlari.csv"),
    "analiz:agirliklar": (ANALIZ, PANO_DIZIN / "agirliklar.csv"),
}
# Bir dosyanın "sürümü" (yüklenenden yeni mi?) hangi dosyanın hangi sütununun en büyük değeri.
# Tarih sütunu olmayan dosyalar, birlikte üretildikleri dosyaya bakar. Trafik dosyaları saatlik
# güncellendiği için son ölçüm saatini kullanır; böylece 15:30'daki görev de yeni saatleri yükler.
SURUM = {
    "aylik.csv": ("gunluk.csv", "tarih"),
    "agirliklar.csv": ("gunluk.csv", "tarih"),
    "mobilite_saatlik.csv": ("mobilite_saatlik.csv", "zaman"),
    "mobilite_gunluk.csv": ("mobilite_saatlik.csv", "zaman"),
    "mobilite_haftalik.csv": ("mobilite_saatlik.csv", "zaman"),
}


def _bugun() -> str:
    return datetime.now(ZoneInfo("Europe/Istanbul")).strftime("%Y-%m-%d")


def _kayitlar() -> dict:
    if not DURUM.exists():
        return {"veri_setleri": {}}
    k = json.loads(DURUM.read_text(encoding="utf-8"))
    if "veri_setleri" not in k:          # en eski biçim: yalnızca manşet dosyası
        eski = {a: k[a] for a in ("varlik_id", "tarih", "yuklenme") if a in k}
        k = {"veri_setleri": {"gercek_mansetler": eski} if eski else {}}
    # önceki biçim: önek yoktu, hepsi panonundu
    k["veri_setleri"] = {(a if ":" in a else "pano:" + a): v for a, v in k["veri_setleri"].items()}
    return k


def _dosya_tarihi(yol: Path) -> str | None:
    ad, sutun = SURUM.get(yol.name, (yol.name, "tarih"))
    kaynak = yol.parent / ad
    if not yol.exists() or not kaynak.exists():
        return None
    df = pd.read_csv(kaynak, dtype=str)
    if df.empty or sutun not in df or df[sutun].dropna().empty:
        return None
    return str(df[sutun].dropna().max())


def durum() -> dict:
    bugun = _bugun()
    kayit = _kayitlar()["veri_setleri"]
    gunler = sorted(p.name.split("=", 1)[1] for p in HAM.glob("tarih=*") if any(p.glob("*.parquet")))
    sonuc = {"bugun": bugun, "son_toplama": gunler[-1] if gunler else None, "pano": PANO, "analiz": ANALIZ,
             "dosyalar": []}
    for hedef, (artifact, yol) in HEDEFLER.items():
        tarih = _dosya_tarihi(yol)
        eski = kayit.get(hedef, {})
        d = {"hedef": hedef, "sayfa": hedef.split(":")[0], "veri_seti": hedef.split(":", 1)[1], "artifact": artifact,
             "dosya": str(yol), "tarih": tarih, "eski_varlik": eski.get("varlik_id"), "eski_tarih": eski.get("tarih"),
             "yuklenecek": False}
        if tarih is None:
            d["neden"] = "Dosya yok ya da boş (webtufe pano çalıştırıldı mı?)."
        elif eski.get("tarih") and tarih <= eski["tarih"]:
            d["neden"] = f"{tarih} verisi zaten yüklenmiş; daha yeni toplama yok."
        else:
            d["yuklenecek"] = True
            d["neden"] = "Yüklemeye hazır."
        sonuc["dosyalar"].append(d)
    yuklenecek = [d["hedef"] for d in sonuc["dosyalar"] if d["yuklenecek"]]
    sonuc["hazir"] = bool(yuklenecek)
    sonuc["neden"] = (f"Yüklenecek: {', '.join(yuklenecek)}" if yuklenecek
                      else "Yüklenecek dosya yok (yüklenenden daha yeni veri yok).")
    return sonuc


def kaydet(hedef: str, varlik_id: str, tarih: str) -> dict:
    if ":" not in hedef:
        hedef = "pano:" + hedef
    if hedef not in HEDEFLER:
        raise SystemExit(f"Bilinmeyen hedef: {hedef}")
    k = _kayitlar()
    k["veri_setleri"][hedef] = {
        "varlik_id": varlik_id, "tarih": tarih,
        "yuklenme": datetime.now(ZoneInfo("Europe/Istanbul")).isoformat(timespec="seconds")}
    DURUM.parent.mkdir(parents=True, exist_ok=True)
    DURUM.write_text(json.dumps(k, ensure_ascii=False, indent=2), encoding="utf-8")
    return k["veri_setleri"][hedef]


def analiz_belgesi(cikti: str) -> dict:
    """Analiz Masası'nın veri/guncel belgesi: her dosyanın en son yüklenen varlığı."""
    kayit = _kayitlar()["veri_setleri"]
    dosyalar, tarihler = {}, []
    for hedef in HEDEFLER:
        if not hedef.startswith("analiz:") or hedef not in kayit:
            continue
        dosyalar[hedef.split(":", 1)[1]] = "/_blob/" + kayit[hedef]["varlik_id"]
        tarihler.append(kayit[hedef]["tarih"])
    belge = {"tarih": max(tarihler) if tarihler else None,
             "guncelleme": datetime.now(ZoneInfo("Europe/Istanbul")).isoformat(timespec="seconds"),
             "kaynak": "Web TÜFE (marketfiyati.org.tr fiyatları, bu proje)", "dosyalar": dosyalar}
    Path(cikti).write_text(json.dumps(belge, ensure_ascii=False, indent=2), encoding="utf-8")
    return belge


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "durum":
        print(json.dumps(durum(), ensure_ascii=False, indent=2))
    elif len(sys.argv) == 5 and sys.argv[1] == "kaydet":
        print(json.dumps(kaydet(sys.argv[2], sys.argv[3], sys.argv[4]), ensure_ascii=False, indent=2))
    elif len(sys.argv) == 3 and sys.argv[1] == "analiz-belgesi":
        print(json.dumps(analiz_belgesi(sys.argv[2]), ensure_ascii=False, indent=2))
    else:
        sys.exit("Kullanım: pano_yukle.py durum | kaydet <hedef> <varlik_id> <tarih> | analiz-belgesi <cikti.json>")
