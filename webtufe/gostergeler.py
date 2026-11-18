"""Endeks serilerinin (genel, COICOP düzeyleri, özel göstergeler) madde üyelikleri."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import yaml

from .ayarlar import CONFIG


@dataclass
class Seri:
    kod: str
    ad: str
    duzey: str          # genel | ana_grup | grup | sinif | alt_sinif | ozel | madde
    maddeler: frozenset


def _kumede(kod: str, onekler: list[str]) -> bool:
    """Önek listesine üyelik; "!" ile başlayan önekler kümeden çıkarır."""
    arti = [o for o in onekler if not o.startswith("!")]
    eksi = [o[1:] for o in onekler if o.startswith("!")]
    return any(kod.startswith(o) for o in arti) and not any(kod.startswith(o) for o in eksi)


def serileri_olustur(sepet: pd.DataFrame) -> list[Seri]:
    """sepet: tüm yılların sepetlerinin birleşimi [madde_kodu, madde_adi, ... ad sütunları]."""
    s = sepet.drop_duplicates("madde_kodu", keep="last")
    tum = frozenset(s["madde_kodu"])
    seriler = [Seri("TUFE", "Genel endeks", "genel", tum)]

    for duzey, kod_sut, ad_sut in [
        ("ana_grup", "ana_grup_kodu", "ana_grup_adi"),
        ("grup", "grup_kodu", "grup_adi"),
        ("sinif", "sinif_kodu", "sinif_adi"),
        ("alt_sinif", "alt_sinif_kodu", "alt_sinif_adi"),
    ]:
        for (kod, ad), g in s.groupby([kod_sut, ad_sut]):
            seriler.append(Seri(str(kod), str(ad), duzey, frozenset(g["madde_kodu"])))

    tanim = yaml.safe_load((CONFIG / "ozel_gostergeler.yaml").read_text(encoding="utf-8"))
    kumeler = tanim["kumeler"]
    for g in tanim["gostergeler"]:
        dahil = [kumeler[k] for k in g.get("dahil", [])]
        haric = [kumeler[k] for k in g.get("haric", [])]
        uyeler = frozenset(
            m for m in tum
            if (not dahil or any(_kumede(m, k) for k in dahil)) and not any(_kumede(m, k) for k in haric)
        )
        seriler.append(Seri(g["kod"], g["ad"], "ozel", uyeler))

    for _, r in s.iterrows():
        seriler.append(Seri(r["madde_kodu"], r["madde_adi"], "madde", frozenset([r["madde_kodu"]])))
    return seriler
