"""TÜİK veri portalından TÜFE sepeti, ağırlıklar ve resmi endeksleri çeker.

Kaynak: databrowser2.tuik.gov.tr (TÜİK Dağıtım Yönetim Sistemi). Veri JSON-stat
biçiminde gelir; Türkçe etiketler için `UserLang: tr` başlığı gerekir.

Kullanılan veri setleri:
  DF_TUFE_SDMX_TT04  TÜFE mal ve hizmet sepeti ve ağırlıklar (COICOP 2018)
  DF_TUFE_SDMX_TT02  COICOP 2018 alt sınıflarına göre aylık/yıllık değişim
  DF_TUFE_SDMX_TT10  TÜFE ve değişim oranları
"""

from __future__ import annotations

import logging

import pandas as pd
import requests

from .ayarlar import REFERANS

log = logging.getLogger(__name__)

API = "https://databrowser2.tuik.gov.tr/api/core/nodes/1/datasets/{akis}/data"
BASLIK = {"Content-Type": "application/json", "UserLang": "tr", "User-Agent": "webtufe/0.1"}


def jsonstat_cek(akis: str, zaman_asimi: float = 120) -> tuple[pd.DataFrame, dict]:
    """Bir TÜİK veri akışını düz tabloya çevirir.

    Dönüş: (tablo, etiketler). Tabloda her boyut için bir sütun ve `deger`
    sütunu bulunur. Boş hücreler (TÜİK'in yayımlamadığı değerler) NaN olur;
    satır yine de döner, çünkü sepet üyeliği bu boş hücrelerden anlaşılır.
    """
    url = API.format(akis=akis)
    r = requests.post(url, json=[], headers=BASLIK, timeout=zaman_asimi)
    r.raise_for_status()
    d = r.json()
    ids, boyut = d["id"], d["size"]
    dim = d["dimension"]

    def anahtarlar(k):
        idx = dim[k]["category"]["index"]
        return idx if isinstance(idx, list) else sorted(idx, key=idx.get)

    K = {k: anahtarlar(k) for k in ids}
    etiket = {k: dim[k]["category"].get("label", {}) for k in ids}
    cocuk = {k: dim[k]["category"].get("child", {}) for k in ids}

    adim = []
    acc = 1
    for s in reversed(boyut):
        adim.insert(0, acc)
        acc *= s

    satirlar = []
    for duz, v in d["value"].items():
        duz = int(duz)
        kayit = {}
        for k, st, s in zip(ids, adim, boyut):
            kayit[k] = K[k][(duz // st) % s]
        kayit["deger"] = float(v) if v not in ("", None) else float("nan")
        satirlar.append(kayit)
    return pd.DataFrame(satirlar), {"etiket": etiket, "cocuk": cocuk}


def sepet_cek(yil: int) -> pd.DataFrame:
    """Verilen yılın TÜFE sepetini madde düzeyinde döndürür.

    TÜİK 2026'dan itibaren ağırlıkları alt sınıf (5'li) düzeyinde yayımlıyor,
    madde (7'li) ağırlığı yayımlamıyor. Web TÜFE madde içi dağılım için eski
    madde ağırlıklarını kullanmış; biz varsayılan olarak alt sınıf ağırlığını
    alt sınıftaki maddelere eşit dağıtıyoruz. `config/madde_agirliklari.csv`
    varsa oradaki madde payları kullanılır (bkz. agirliklari_uygula).
    """
    tablo, meta = jsonstat_cek("TR,DF_TUFE_SDMX_TT04,1.0")
    etiket = meta["etiket"]["COICOP_2018"]
    yil_s = str(yil)
    t = tablo[tablo["TIME_PERIOD"] == yil_s]
    if t.empty:
        raise ValueError(f"TÜİK {yil} sepetini henüz yayımlamamış.")

    maddeler = t[t["SINIFLAMA_DUZEYI"] == "7"]["COICOP_2018"].unique()
    alt_sinif_agirlik = (
        t[t["SINIFLAMA_DUZEYI"] == "5"].set_index("COICOP_2018")["deger"].to_dict()
    )
    satir = []
    for m in sorted(maddeler):
        alt = m[:5]
        satir.append(
            {
                "yil": yil,
                "madde_kodu": m,
                "madde_adi": etiket.get(m, ""),
                "alt_sinif_kodu": alt,
                "alt_sinif_adi": etiket.get(alt, ""),
                "sinif_kodu": m[:4],
                "sinif_adi": etiket.get(m[:4], ""),
                "grup_kodu": m[:3],
                "grup_adi": etiket.get(m[:3], ""),
                "ana_grup_kodu": m[:2],
                "ana_grup_adi": etiket.get(m[:2], ""),
                "alt_sinif_agirlik": alt_sinif_agirlik.get(alt, float("nan")),
            }
        )
    sepet = pd.DataFrame(satir)
    eksik = sepet[sepet["alt_sinif_agirlik"].isna()]
    if not eksik.empty:
        log.warning("Ağırlığı olmayan alt sınıflar: %s", sorted(eksik["alt_sinif_kodu"].unique()))
    return sepet


def agirliklari_uygula(sepet: pd.DataFrame, madde_paylari: pd.DataFrame | None = None) -> pd.DataFrame:
    """Alt sınıf ağırlığını maddelere dağıtır; `agirlik` sütunu toplamı 100 olur.

    madde_paylari: [madde_kodu, pay] tablosu (alt sınıf içi göreli pay). Verilmeyen
    maddeler alt sınıf içinde eşit pay alır.
    """
    s = sepet.copy()
    s["pay"] = 1.0
    if madde_paylari is not None and not madde_paylari.empty:
        p = madde_paylari.set_index("madde_kodu")["pay"]
        s.loc[s["madde_kodu"].isin(p.index), "pay"] = s["madde_kodu"].map(p)
    s["pay"] = s["pay"] / s.groupby("alt_sinif_kodu")["pay"].transform("sum")
    s["agirlik"] = s["alt_sinif_agirlik"] * s["pay"]
    s["agirlik"] = s["agirlik"] / s["agirlik"].sum() * 100
    return s.drop(columns="pay")


def sepeti_kaydet(yil: int) -> pd.DataFrame:
    from .ayarlar import CONFIG

    sepet = sepet_cek(yil)
    paylar_yolu = CONFIG / "madde_agirliklari.csv"
    paylar = pd.read_csv(paylar_yolu, dtype={"madde_kodu": str}) if paylar_yolu.exists() else None
    sepet = agirliklari_uygula(sepet, paylar)
    REFERANS.mkdir(parents=True, exist_ok=True)
    yol = REFERANS / f"sepet_{yil}.csv"
    sepet.to_csv(yol, index=False)
    log.info("%s: %d madde, %d alt sınıf -> %s", yil, len(sepet), sepet["alt_sinif_kodu"].nunique(), yol)
    return sepet


def alt_sinif_degisimleri_cek() -> pd.DataFrame:
    """TÜİK alt sınıf aylık/yıllık değişim oranları (karşılaştırma için)."""
    tablo, meta = jsonstat_cek("TR,DF_TUFE_SDMX_TT02,1.0")
    tablo["ad"] = tablo["COICOP_2018"].map(meta["etiket"]["COICOP_2018"])
    return tablo


def resmi_tufe_cek() -> pd.DataFrame:
    """TÜİK TÜFE endeks ve değişim oranları (karşılaştırma için)."""
    tablo, meta = jsonstat_cek("TR,DF_TUFE_SDMX_TT10,1.0")
    for k, lab in meta["etiket"].items():
        if k in tablo.columns and k not in ("TIME_PERIOD",):
            tablo[k + "_ad"] = tablo[k].map(lab)
    return tablo
