"""Panodaki gerçek manşet dosyasının günlük güncellemesi için yardımcı.

Zamanlanmış Claude görevi ("webtufe-pano-mansetleri") bunu kullanır:

  .venv/bin/python scripts/pano_manset.py durum
      Yüklemeye hazır mı? JSON yazar: hazir, neden, dosya, tarih, eski_varlik ...
  .venv/bin/python scripts/pano_manset.py kaydet <yeni_varlik_id> <tarih>
      Panoya yüklenen dosyanın kimliğini ve tarihini kaydeder.

Dosya ancak şu durumda hazırdır: data/cikti/mansetler_gercek.csv bugünün (İstanbul
saati) toplamasından üretilmiş ve bu tarih panoya daha önce yüklenmemiş.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

KOK = Path(__file__).resolve().parent.parent
DOSYA = KOK / "data" / "cikti" / "mansetler_gercek.csv"
DURUM = KOK / "data" / "cikti" / "pano_durum.json"
HAM = KOK / "data" / "ham" / "marketfiyati"
PANO = "https://claude.ai/artifact/EBnsgW9YWx84vQTiunF39Z"


def _durum_oku() -> dict:
    if DURUM.exists():
        return json.loads(DURUM.read_text(encoding="utf-8"))
    return {}


def durum() -> dict:
    bugun = datetime.now(ZoneInfo("Europe/Istanbul")).strftime("%Y-%m-%d")
    kayit = _durum_oku()
    sonuc = {"hazir": False, "bugun": bugun, "pano": PANO, "veri_kaynagi": "gercek_mansetler",
             "dosya": str(DOSYA), "eski_varlik": kayit.get("varlik_id"), "eski_tarih": kayit.get("tarih")}
    gunler = sorted(p.name.split("=", 1)[1] for p in HAM.glob("tarih=*") if any(p.glob("*.parquet")))
    sonuc["son_toplama"] = gunler[-1] if gunler else None
    if not DOSYA.exists():
        sonuc["neden"] = "Manşet dosyası yok."
        return sonuc
    df = pd.read_csv(DOSYA)
    tarih = str(df["tarih"].iloc[0]) if len(df) else None
    sonuc.update(tarih=tarih, satir=int(len(df)), anahtarlar=sorted(df["anahtar"].unique().tolist()))
    if tarih != bugun:
        sonuc["neden"] = f"Manşet dosyası {tarih} tarihli; bugünün ({bugun}) toplaması henüz bitmemiş ya da yapılmamış."
    elif tarih == kayit.get("tarih"):
        sonuc["neden"] = f"{tarih} manşetleri panoya zaten yüklenmiş."
    elif len(df) < 3:
        sonuc["neden"] = f"Dosyada yalnızca {len(df)} satır var; toplama eksik olabilir."
    else:
        sonuc["hazir"] = True
        sonuc["neden"] = "Bugünün manşetleri yüklemeye hazır."
    return sonuc


def kaydet(varlik_id: str, tarih: str) -> dict:
    kayit = _durum_oku()
    kayit.update(varlik_id=varlik_id, tarih=tarih, pano=PANO,
                 yuklenme=datetime.now(ZoneInfo("Europe/Istanbul")).isoformat(timespec="seconds"))
    DURUM.parent.mkdir(parents=True, exist_ok=True)
    DURUM.write_text(json.dumps(kayit, ensure_ascii=False, indent=2), encoding="utf-8")
    return kayit


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "durum":
        print(json.dumps(durum(), ensure_ascii=False, indent=2))
    elif len(sys.argv) == 4 and sys.argv[1] == "kaydet":
        print(json.dumps(kaydet(sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=2))
    else:
        sys.exit("Kullanım: pano_manset.py durum | kaydet <varlik_id> <tarih>")
