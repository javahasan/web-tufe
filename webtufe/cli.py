"""Komut satırı: webtufe <komut>

  sepet     TÜİK sepetini ve ağırlıklarını indir (data/referans/sepet_<yıl>.csv)
  topla     Bugünün fiyatlarını topla (data/ham/marketfiyati/tarih=.../)
  esle      Ham ürünleri TÜİK maddelerine eşle, eşleşme raporu yaz
  hesapla   Günlük ve aylık endeksleri hesapla (data/cikti/)
  rapor     Son durumu özetle
  mansetler Gerçek fiyatlardan günün manşetleri
  pano      Pano ve Analiz Masası dosyaları (data/cikti/pano/)
  haftalik  Analiz Masası'nın haftalık görünümü için Web TÜFE verisi (JSON)
"""

from __future__ import annotations

import argparse
from pathlib import Path
import logging
import sys

import pandas as pd

from .ayarlar import CIKTI, HAM, REFERANS, ayarlari_yukle

KAYNAK = "marketfiyati"


def _ham_desen() -> str:
    return str(HAM / KAYNAK / "tarih=*" / "*.parquet")


def _sepetler() -> dict[int, pd.DataFrame]:
    sepetler = {}
    for yol in sorted(REFERANS.glob("sepet_*.csv")):
        yil = int(yol.stem.split("_")[1])
        sepetler[yil] = pd.read_csv(yol, dtype={c: str for c in
                                                ["madde_kodu", "alt_sinif_kodu", "sinif_kodu", "grup_kodu", "ana_grup_kodu"]})
    if not sepetler:
        raise SystemExit("Sepet bulunamadı. Önce: webtufe sepet --yil 2026")
    return sepetler


def _esleme():
    from .eslestirme import esle, kurallari_yukle
    from .endeks import ham_urunler

    if not list(HAM.glob(f"{KAYNAK}/tarih=*/*.parquet")):
        raise SystemExit("Ham veri yok. Önce: webtufe topla")
    urunler = ham_urunler(_ham_desen())
    return esle(urunler, kurallari_yukle(KAYNAK))


def komut_sepet(a):
    from .tuik import sepeti_kaydet
    s = sepeti_kaydet(a.yil)
    print(f"{a.yil} sepeti: {len(s)} madde, {s['alt_sinif_kodu'].nunique()} alt sınıf -> {REFERANS / f'sepet_{a.yil}.csv'}")


def komut_topla(a):
    from .toplayicilar.marketfiyati import topla
    _, ayar = ayarlari_yukle()
    yazilan, basarisiz = topla(ayar, tarih=a.tarih, konum_adlari=a.konum, yeniden=a.yeniden,
                               sorgu_siniri=a.sorgu_siniri)
    print(f"{len(yazilan)} konum dosyası yazıldı.")
    if basarisiz:
        raise SystemExit(f"Toplanamayan konumlar: {', '.join(basarisiz)}")


def komut_esle(a):
    esleme = _esleme()
    sepet = pd.concat(_sepetler().values()).drop_duplicates("madde_kodu", keep="last")
    adlar = sepet.set_index("madde_kodu")["madde_adi"]
    CIKTI.mkdir(parents=True, exist_ok=True)
    esleme["madde_adi"] = esleme["madde_kodu"].map(adlar)
    esleme.sort_values(["madde_kodu", "baslik"]).to_csv(CIKTI / f"eslesme_{KAYNAK}.csv", index=False)
    eslesmeyen = esleme[esleme["madde_kodu"].isna()]
    eslesmeyen.groupby("ana_kategori").size().sort_values(ascending=False).to_csv(
        CIKTI / f"eslesmeyen_kategoriler_{KAYNAK}.csv", header=["urun_sayisi"])
    ozet = esleme.dropna(subset=["madde_kodu"]).groupby(["madde_kodu", "madde_adi"]).size().rename("urun_sayisi")
    print(f"{len(esleme)} tekil ürün, {esleme['madde_kodu'].notna().sum()} eşleşti, "
          f"{esleme['madde_kodu'].nunique()} madde kapsandı.")
    print(f"Eşleşme listesi: {CIKTI / f'eslesme_{KAYNAK}.csv'}")
    if a.ayrinti:
        print(ozet.to_string())


def komut_hesapla(a):
    from .endeks import hesapla, kaydet
    from .gostergeler import serileri_olustur

    endeks_ayar, _ = ayarlari_yukle()
    sepetler = _sepetler()
    esleme = _esleme()
    seriler = serileri_olustur(pd.concat(sepetler.values()))
    sonuc = hesapla(_ham_desen(), esleme, sepetler, seriler, endeks_ayar)
    kaydet(sonuc, CIKTI)
    g = sonuc["gunluk"]
    print(f"{g['tarih'].nunique()} gün, {g['seri_kodu'].nunique()} seri -> {CIKTI}")
    komut_rapor(a)


def komut_mansetler(a):
    from .mansetler import kaydet, mansetleri_uret
    df = mansetleri_uret(_esleme(), tarih=a.tarih)
    yol = kaydet(df)
    print(f"{len(df)} manşet -> {yol}")
    for _, r in df.iterrows():
        print(f"  {r['anahtar']:<18} {r['urun'] if pd.notna(r['urun']) else '':<60} {r['deger']}")


def komut_pano(a):
    from .eslestirme import kurallari_yukle
    from .pano import madde_endeksleri_yaz, madde_fiyatlari, pano_yaz

    if not (CIKTI / "gunluk.parquet").exists():
        raise SystemExit("Önce: webtufe hesapla")
    sonuc = {
        "gunluk": pd.read_parquet(CIKTI / "gunluk.parquet"),
        "aylik": pd.read_csv(CIKTI / "aylik.csv", dtype={"seri_kodu": str}),
        "madde_ozet": pd.read_csv(CIKTI / "madde_gunluk_gozlem.csv", dtype={"madde_kodu": str}),
    }
    sepetler = _sepetler()
    sepet = sepetler[max(sepetler)]
    kurallar = {k.madde for k in kurallari_yukle(KAYNAK)}
    import os
    import shutil
    import tempfile

    pano = CIKTI / "pano"
    pano.mkdir(parents=True, exist_ok=True)
    # Dosyalar önce geçici klasöre yazılıp tek tek yerine taşınır: aynı anda çalışan bir görev
    # (ör. yükleme) yarım yazılmış bir dosya okumaz.
    gecici = Path(tempfile.mkdtemp(prefix=".pano-", dir=CIKTI))
    try:
        yazilan = pano_yaz(sonuc, sepet, gecici, kurallar)
        yazilan.append(madde_endeksleri_yaz(sonuc["gunluk"], gecici))
        adlar = pd.concat(sepetler.values()).drop_duplicates("madde_kodu", keep="last").set_index("madde_kodu")["madde_adi"]
        madde_fiyatlari(_ham_desen(), _esleme(), adlar).to_csv(gecici / "madde_fiyatlari.csv", index=False)
        yazilan.append(gecici / "madde_fiyatlari.csv")
        for y in yazilan:
            os.replace(y, pano / y.name)
            print(f"  {y.name:<22}{(pano / y.name).stat().st_size / 1024:>8.0f} KB")
    finally:
        shutil.rmtree(gecici, ignore_errors=True)


def komut_haftalik(a):
    import json
    from .haftalik import haftalik_veri
    paket = haftalik_veri()
    with open(a.cikti, "w", encoding="utf-8") as f:
        json.dump(paket, f, ensure_ascii=False, indent=1)
    i = paket["istatistik"]
    print(f"{paket['hafta']}: {paket['baslangic']} – {paket['bitis']}, {len(paket['veriler'])} veri, "
          f"genel endeks {i['genel_endeks_son']} (haftalık {i['genel_haftalik_degisim_yuzde']}%) -> {a.cikti}")


def komut_rapor(a):
    yol = CIKTI / "gunluk.parquet"
    if not yol.exists():
        raise SystemExit("Önce: webtufe hesapla")
    g = pd.read_parquet(yol)
    ay = pd.read_csv(CIKTI / "aylik.csv", dtype={"seri_kodu": str})
    son = g["tarih"].max()
    print(f"\n=== Web TÜFE · son veri günü {pd.Timestamp(son).date()} · {g['tarih'].nunique()} gün ===")
    s = g[(g["tarih"] == son) & g["duzey"].isin(["genel", "ana_grup", "ozel"])].copy()
    s["sira"] = s["duzey"].map({"genel": 0, "ana_grup": 1, "ozel": 2})
    s = s.sort_values(["sira", "seri_kodu"])
    print(f"\n{'Seri':<52}{'Endeks':>9}{'Günlük %':>10}{'Kapsam %':>10}")
    for _, r in s.iterrows():
        endeks = "" if pd.isna(r["endeks"]) else f"{r['endeks']:.2f}"
        gd = "" if pd.isna(r["gunluk_degisim"]) else f"{r['gunluk_degisim']:+.2f}"
        print(f"{(r['seri_kodu'] + ' ' + r['seri_adi'])[:51]:<52}{endeks:>9}{gd:>10}{r['kapsam'] * 100:>10.1f}")

    son_ay = ay["ay"].max()
    t = ay[(ay["ay"] == son_ay) & (ay["seri_kodu"] == "TUFE")]
    if not t.empty:
        r = t.iloc[0]
        durum = "kesin" if r["kesin"] else "geçici"
        aylik = "henüz yok (önceki ay verisi gerekli)" if pd.isna(r["aylik_degisim"]) else f"%{r['aylik_degisim']:.2f}"
        print(f"\n{son_ay} aylık değişim ({durum}, {int(r['gun'])} gün): {aylik}")

    m = g[(g["duzey"] == "madde")].sort_values("tarih")
    ilk = m.groupby("seri_kodu").first()
    sonm = m.groupby("seri_kodu").last()
    d = ((sonm["endeks"] / ilk["endeks"] - 1) * 100).dropna()
    if len(d) and g["tarih"].nunique() > 1:
        ad = sonm["seri_adi"]
        print(f"\nBaşlangıçtan bu yana en çok artan maddeler:")
        for k, v in d.sort_values(ascending=False).head(10).items():
            print(f"  {ad[k][:45]:<46}{v:+7.2f}%")
        print(f"En çok düşen maddeler:")
        for k, v in d.sort_values().head(10).items():
            print(f"  {ad[k][:45]:<46}{v:+7.2f}%")


def main(argv=None):
    p = argparse.ArgumentParser(prog="webtufe", description="Web'den toplanan fiyatlarla günlük TÜFE")
    p.add_argument("-v", "--ayrintili-log", action="store_true")
    alt = p.add_subparsers(dest="komut", required=True)

    s = alt.add_parser("sepet", help="TÜİK sepetini indir")
    s.add_argument("--yil", type=int, default=2026)
    s.set_defaults(f=komut_sepet)

    s = alt.add_parser("topla", help="fiyatları topla")
    s.add_argument("--tarih", help="YYYY-AA-GG (varsayılan bugün)")
    s.add_argument("--konum", nargs="*", help="yalnızca bu konumlar")
    s.add_argument("--yeniden", action="store_true", help="var olan konum dosyalarının üzerine yaz")
    s.add_argument("--sorgu-siniri", type=int, help="test için ilk N sorgu")
    s.set_defaults(f=komut_topla)

    s = alt.add_parser("esle", help="ürün-madde eşlemesi")
    s.add_argument("--ayrinti", action="store_true")
    s.set_defaults(f=komut_esle)

    s = alt.add_parser("hesapla", help="endeksleri hesapla")
    s.set_defaults(f=komut_hesapla)

    s = alt.add_parser("rapor", help="son durumu yazdır")
    s.set_defaults(f=komut_rapor)

    s = alt.add_parser("mansetler", help="gerçek fiyatlardan günün manşetleri")
    s.add_argument("--tarih", help="YYYY-AA-GG (varsayılan son toplama günü)")
    s.set_defaults(f=komut_mansetler)

    s = alt.add_parser("pano", help="pano ve Analiz Masası dosyaları")
    s.set_defaults(f=komut_pano)

    s = alt.add_parser("haftalik", help="haftalık görünüm verisi")
    s.add_argument("--cikti", required=True, help="yazılacak JSON dosyası")
    s.set_defaults(f=komut_haftalik)

    a = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.ayrintili_log else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", stream=sys.stderr)
    a.f(a)


if __name__ == "__main__":
    main()
