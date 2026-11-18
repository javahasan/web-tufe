"""Ham ürünleri TÜİK maddelerine eşler (config/eslestirme_<kaynak>.yaml)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import yaml

from .ayarlar import CONFIG
from .metin import katla


@dataclass
class Kural:
    no: int
    madde: str
    sorgu: list[str]
    kategori: set[str] | None
    dahil: list[re.Pattern]
    haric: re.Pattern | None

    def uyar(self, baslik: str, kategori: str) -> bool:
        if self.kategori is not None and kategori not in self.kategori:
            return False
        if not all(p.search(baslik) for p in self.dahil):
            return False
        if self.haric is not None and self.haric.search(baslik):
            return False
        return True


def kurallari_yukle(kaynak: str, yol: Path | None = None) -> list[Kural]:
    yol = yol or CONFIG / f"eslestirme_{kaynak}.yaml"
    ham = yaml.safe_load(yol.read_text(encoding="utf-8"))
    kurallar = []
    for i, k in enumerate(ham["kurallar"]):
        dahil = k.get("dahil", ".")
        dahil = dahil if isinstance(dahil, list) else [dahil]
        haric = k.get("haric")
        kat = k.get("kategori")
        kurallar.append(
            Kural(
                no=i,
                madde=str(k["madde"]),
                sorgu=list(k.get("sorgu") or []),
                kategori={katla(c) for c in kat} if kat else None,
                dahil=[re.compile(katla(p)) for p in dahil],
                haric=re.compile(katla(haric)) if haric else None,
            )
        )
    return kurallar


def sorgulari_cikar(kurallar: list[Kural]) -> list[str]:
    """Toplayıcının çalıştıracağı tekil sorgu listesi (sıra korunur)."""
    goruldu, sonuc = set(), []
    for k in kurallar:
        for s in k.sorgu:
            anahtar = katla(s)
            if anahtar not in goruldu:
                goruldu.add(anahtar)
                sonuc.append(s)
    return sonuc


def esle(urunler: pd.DataFrame, kurallar: list[Kural]) -> pd.DataFrame:
    """urunler: [urun_id, baslik, ana_kategori] tekil ürün tablosu.

    Dönüş: aynı tablo + [madde_kodu, kural_no]; eşleşmeyenlerde madde_kodu boş.
    """
    maddeler, nolar = [], []
    for baslik, kat in zip(urunler["baslik"], urunler["ana_kategori"]):
        b, c = katla(baslik), katla(kat)
        bulunan = next((k for k in kurallar if k.uyar(b, c)), None)
        maddeler.append(bulunan.madde if bulunan else None)
        nolar.append(bulunan.no if bulunan else None)
    sonuc = urunler.copy()
    sonuc["madde_kodu"] = maddeler
    sonuc["kural_no"] = pd.array(nolar, dtype="Int64")
    return sonuc
