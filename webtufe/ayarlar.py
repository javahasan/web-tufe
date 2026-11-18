"""Proje genelindeki yollar ve ayarlar."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

KOK = Path(__file__).resolve().parent.parent
CONFIG = KOK / "config"
VERI = KOK / "data"
HAM = VERI / "ham"            # kaynaklardan gelen ham fiyat gözlemleri (değiştirilmez)
REFERANS = VERI / "referans"  # TÜİK sepeti, ağırlıklar, resmi endeksler
CIKTI = VERI / "cikti"        # hesaplanan endeksler


@dataclass
class EndeksAyarlari:
    # Web TÜFE: "31 Aralık 2024=100". Biz toplamaya başladığımız günü baz alıyoruz.
    baz_tarihi: str | None = None          # None ise ilk veri günü
    baz_degeri: float = 100.0
    # Ürün fiyat oranı aykırı değer sınırı: |ln(p_t / p_önceki)| > ln(sinir) ise atılır
    aykiri_oran_siniri: float = 2.5
    # Bir ürün kaç gün görünmezse son fiyatıyla eşleştirme bırakılır
    eslesme_penceresi_gun: int = 7
    # Aylık endeks: Web TÜFE ayın ilk 24 gününün geometrik ortalamasını kullanır
    aylik_son_gun: int = 24
    aylik_ortalama: str = "geometrik"     # "geometrik" | "aritmetik"


@dataclass
class ToplamaAyarlari:
    istek_arasi_saniye: float = 2.0
    zaman_asimi_saniye: float = 30.0
    yeniden_deneme: int = 3
    # Art arda bu kadar sorgu başarısız olursa toplama tamamen durur (sunucuyu zorlamayız)
    ardisik_hata_siniri: int = 3
    azami_sayfa: int = 40
    yaricap_km: float = 5.0
    konumlar: list[dict] = field(default_factory=list)
    # Kaynak bazında kullanım izni. Kullanım koşulları izin gerektiren kaynak,
    # izin alınıp burada true yapılmadan çalışmaz.
    izinler: dict = field(default_factory=dict)


def ayarlari_yukle() -> tuple[EndeksAyarlari, ToplamaAyarlari]:
    yol = CONFIG / "ayarlar.yaml"
    ham = yaml.safe_load(yol.read_text(encoding="utf-8")) if yol.exists() else {}
    endeks = EndeksAyarlari(**(ham.get("endeks") or {}))
    toplama = ToplamaAyarlari(**(ham.get("toplama") or {}))
    return endeks, toplama
