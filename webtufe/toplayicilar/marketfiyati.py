"""marketfiyati.org.tr toplayıcısı.

Ticaret Bakanlığı / TÜBİTAK BİLGEM'in Market Fiyatı sitesi; A101, BİM,
CarrefourSA, Hakmar, Migros ve Tarım Kredi gibi zincirlerin şube fiyatlarını
yayımlar. v2/search, verilen konumun yarıçapındaki her zincirin en yakın
şubesindeki fiyatı döndürür (ürün başına bir veya birkaç şube).

KULLANIM İZNİ: robots.txt tüm yollara izin verse de sitenin kullanım koşulları
içeriğin TÜBİTAK BİLGEM'in yazılı izni olmadan kopyalanmasını, işlenmesini ve
kullanılmasını yasaklıyor. Sunucu da yoğun toplamada istemcimizi engelledi
(12.11.2026). Bu toplayıcı, config/ayarlar.yaml'da `izinler.marketfiyati: true`
yapılmadan çalışmaz; bu değer ancak yazılı izin alındıktan sonra açılmalı.

Ham gözlem satırı = (tarih, konum, ürün, şube). Eşleme ve endeks hesabı sonradan
yapılır; böylece eşleme kuralları değiştiğinde geçmiş veri yeniden işlenebilir.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from ..ayarlar import HAM, ToplamaAyarlari
from ..eslestirme import kurallari_yukle, sorgulari_cikar

log = logging.getLogger(__name__)

KAYNAK = "marketfiyati"
API = "https://api.marketfiyati.org.tr/api/v2/search"
# Arama, gövdedeki koordinatları değil `depots` listesini kullanır; liste verilmezse
# sunucu sabit bir bölgenin (İstanbul Üsküdar/Kadıköy) şubelerini döndürür. Site de
# önce en yakın şubeleri bu uç noktadan alıp aramaya ekliyor.
API_YAKIN = "https://api.marketfiyati.org.tr/api/v2/nearest"
SAYFA_BOYUTU = 25  # API sayfa boyutunu 25 ile sınırlıyor
TR = ZoneInfo("Europe/Istanbul")


def bugun() -> str:
    return datetime.now(TR).strftime("%Y-%m-%d")


class ToplamaDurduruldu(RuntimeError):
    """Sunucu art arda istekleri reddetti; toplama tümüyle durduruldu."""


class MarketFiyatiToplayici:
    def __init__(self, ayar: ToplamaAyarlari):
        self.ayar = ayar
        self.oturum = requests.Session()
        self.oturum.headers.update(
            {"Content-Type": "application/json", "User-Agent": "webtufe/0.1 (fiyat endeksi arastirmasi)"}
        )
        self._son_istek = 0.0

    def _post(self, govde: dict, url: str = API):
        for deneme in range(1, self.ayar.yeniden_deneme + 1):
            bekle = self.ayar.istek_arasi_saniye - (time.monotonic() - self._son_istek)
            if bekle > 0:
                time.sleep(bekle)
            self._son_istek = time.monotonic()
            try:
                r = self.oturum.post(url, json=govde, timeout=self.ayar.zaman_asimi_saniye)
                if r.status_code == 429 or r.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {r.status_code}")
                r.raise_for_status()
                return r.json()
            except (requests.RequestException, ValueError) as e:
                if deneme == self.ayar.yeniden_deneme:
                    raise
                uyku = 2 ** deneme
                log.warning("İstek hatası (%s), %ss sonra tekrar: %s", e, uyku, govde.get("keywords"))
                time.sleep(uyku)
        raise RuntimeError("ulaşılamaz")

    def yakin_subeler(self, konum: dict) -> list[dict]:
        """Konumun yarıçapındaki şubeler (zincir başına en yakın birkaçı)."""
        d = self._post({"latitude": konum["enlem"], "longitude": konum["boylam"],
                        "distance": self.ayar.yaricap_km}, url=API_YAKIN)
        if not isinstance(d, list) or not d:
            raise RuntimeError(f"[{konum['ad']}] yakın şube bulunamadı")
        return d

    def sorgu_topla(self, sorgu: str, konum: dict, subeler: list[str]) -> list[dict]:
        satirlar = []
        for sayfa in range(self.ayar.azami_sayfa):
            govde = {
                "keywords": sorgu,
                "pages": sayfa,
                "size": SAYFA_BOYUTU,
                "latitude": konum["enlem"],
                "longitude": konum["boylam"],
                "distance": self.ayar.yaricap_km,
                "depots": subeler,
            }
            d = self._post(govde)
            icerik = d.get("content") or []
            for u in icerik:
                for s in u.get("productDepotInfoList") or []:
                    satirlar.append(
                        {
                            "urun_id": u.get("id"),
                            "baslik": u.get("title"),
                            "marka": u.get("brand"),
                            "miktar": u.get("refinedVolumeOrWeight"),
                            "ana_kategori": u.get("main_category"),
                            "menu_kategori": u.get("menu_category"),
                            "kategoriler": "|".join(u.get("categories") or []),
                            "zincir": s.get("marketAdi"),
                            "sube_id": s.get("depotId"),
                            "sube_adi": s.get("depotName"),
                            "fiyat": s.get("price"),
                            "indirimsiz_fiyat": s.get("discountlessPrice"),
                            "indirim": s.get("discount"),
                            "birim_fiyat": s.get("unitPriceValue"),
                            "birim_fiyat_metin": s.get("unitPrice"),
                            "promosyon": s.get("promotionText"),
                            "indeks_zamani": s.get("indexTime"),
                            "sorgu": sorgu,
                        }
                    )
            toplam = d.get("numberOfFound") or 0
            if not icerik or (sayfa + 1) * SAYFA_BOYUTU >= toplam:
                break
        return satirlar

    def konum_topla(self, konum: dict, sorgular: list[str]) -> pd.DataFrame:
        subeler = self.yakin_subeler(konum)
        sube_idleri = [s["id"] for s in subeler]
        log.info("[%s] %d şube: %s", konum["ad"], len(subeler),
                 ", ".join(sorted({s.get("marketName", "?") for s in subeler})))
        hepsi = []
        ardisik_hata = 0
        for i, sorgu in enumerate(sorgular, 1):
            try:
                hepsi.extend(self.sorgu_topla(sorgu, konum, sube_idleri))
                ardisik_hata = 0
            except Exception as e:  # tek sorgu hatası tüm konumu düşürmesin
                ardisik_hata += 1
                log.error("[%s] '%s' sorgusu başarısız: %s", konum["ad"], sorgu, e)
                if ardisik_hata >= self.ayar.ardisik_hata_siniri:
                    raise ToplamaDurduruldu(
                        f"{ardisik_hata} sorgu üst üste başarısız; sunucu erişimi kesiyor olabilir. "
                        "Toplama durduruldu; istemci kimliğini değiştirerek tekrar denemeyin."
                    ) from e
            if i % 25 == 0:
                log.info("[%s] %d/%d sorgu, %d satır", konum["ad"], i, len(sorgular), len(hepsi))
        df = pd.DataFrame(hepsi)
        if df.empty:
            return df
        df = df.drop_duplicates(subset=["urun_id", "sube_id"]).reset_index(drop=True)
        # Konum dışından şube geldiyse (sunucu listeyi yok saydıysa) uyar
        yabanci = ~df["sube_id"].isin(sube_idleri)
        if yabanci.any():
            log.warning("[%s] %d gözlem istenen şubelerin dışından geldi", konum["ad"], int(yabanci.sum()))
        df["fiyat"] = pd.to_numeric(df["fiyat"], errors="coerce")
        df["indirimsiz_fiyat"] = pd.to_numeric(df["indirimsiz_fiyat"], errors="coerce")
        df["birim_fiyat"] = pd.to_numeric(df["birim_fiyat"], errors="coerce")
        df["indirim"] = df["indirim"].astype("boolean")
        return df


def topla(ayar: ToplamaAyarlari, tarih: str | None = None, konum_adlari: list[str] | None = None,
          yeniden: bool = False, sorgu_siniri: int | None = None) -> list:
    if not ayar.izinler.get(KAYNAK, False):
        raise SystemExit(
            "marketfiyati.org.tr kullanım koşulları, içeriğin TÜBİTAK BİLGEM'in yazılı izni olmadan "
            "kullanılmasını yasaklıyor. İzin alındıysa config/ayarlar.yaml'da "
            "toplama.izinler.marketfiyati: true yapın."
        )
    tarih = tarih or bugun()
    kurallar = kurallari_yukle(KAYNAK)
    sorgular = sorgulari_cikar(kurallar)
    if sorgu_siniri:
        sorgular = sorgular[:sorgu_siniri]
    konumlar = [k for k in ayar.konumlar if not konum_adlari or k["ad"] in konum_adlari]
    hedef_dizin = HAM / KAYNAK / f"tarih={tarih}"
    hedef_dizin.mkdir(parents=True, exist_ok=True)
    toplayici = MarketFiyatiToplayici(ayar)
    yazilan = []
    basarisiz = []
    log.info("%s: %d konum x %d sorgu", tarih, len(konumlar), len(sorgular))
    for konum in konumlar:
        yol = hedef_dizin / f"konum={konum['ad']}.parquet"
        if yol.exists() and not yeniden:
            log.info("[%s] zaten toplanmış, atlanıyor (%s)", konum["ad"], yol.name)
            continue
        bas = time.monotonic()
        try:
            df = toplayici.konum_topla(konum, sorgular)
        except ToplamaDurduruldu as e:
            log.error("[%s] %s", konum["ad"], e)
            basarisiz.extend(k["ad"] for k in konumlar[konumlar.index(konum):])
            break
        except Exception as e:
            log.error("[%s] toplanamadı: %s", konum["ad"], e)
            basarisiz.append(konum["ad"])
            continue
        if df.empty:
            log.error("[%s] hiç veri gelmedi", konum["ad"])
            basarisiz.append(konum["ad"])
            continue
        df.insert(0, "konum", konum["ad"])
        df.insert(0, "tarih", tarih)
        df["toplama_zamani"] = datetime.now(TR).isoformat(timespec="seconds")
        gecici = yol.with_suffix(".tmp")
        df.to_parquet(gecici, index=False)
        gecici.rename(yol)
        yazilan.append(yol)
        log.info("[%s] %d gözlem, %d ürün, %.0f sn -> %s", konum["ad"], len(df), df["urun_id"].nunique(),
                 time.monotonic() - bas, yol.name)
    return yazilan, basarisiz
