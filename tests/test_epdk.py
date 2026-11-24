"""EPDK akaryakıt toplayıcısı: yanıt çözümleme, il toplama ve 8 firma bülteni doldurma."""

from datetime import date
from html import escape

import pandas as pd
import pytest

import webtufe.toplayicilar.epdk as e


def _soap(ic: str) -> str:
    return ('<?xml version="1.0" encoding="UTF-8"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">'
            '<S:Body><ns2:genelSorguResponse xmlns:ns2="http://genel.service.ws.epvys.g222.tubitak.gov.tr/">'
            f'<return>{escape(ic, quote=False)}</return></ns2:genelSorguResponse></S:Body></S:Envelope>')


IL_IC = """<PetrolPiyasasiIllereGoreAkaryakitFiyatlariResult>
  <PetrolPiyasasiIllereGoreAkaryakitFiyatlari><Tarih>2026-11-20 00:00:00.0</Tarih><YakitTipi>Motorin</YakitTipi>
    <Il>ANKARA</Il><FirmaMarkasi>OPET</FirmaMarkasi><Fiyat>88.81</Fiyat></PetrolPiyasasiIllereGoreAkaryakitFiyatlari>
  <PetrolPiyasasiIllereGoreAkaryakitFiyatlari><Tarih>2026-11-23 00:00:00.0</Tarih><YakitTipi>Kurşunsuz Benzin 95 Oktan</YakitTipi>
    <Il>ANKARA</Il><FirmaMarkasi>SHELL &amp; TURCAS</FirmaMarkasi><Fiyat>68.4</Fiyat></PetrolPiyasasiIllereGoreAkaryakitFiyatlari>
  <PetrolPiyasasiIllereGoreAkaryakitFiyatlari><Tarih>2016-06-10 00:00:00.0</Tarih><YakitTipi>Motorin</YakitTipi>
    <Il>ANKARA</Il><FirmaMarkasi>KAPANMIŞ FİRMA</FirmaMarkasi><Fiyat>3.82</Fiyat></PetrolPiyasasiIllereGoreAkaryakitFiyatlari>
</PetrolPiyasasiIllereGoreAkaryakitFiyatlariResult>"""

SEKIZ_IC = """<PetrolPiyasasiEnYuksekHacimliSekizFirmaninAkaryakitFiyatlariResult>
  <PetrolPiyasasiEnYuksekHacimliSekizFirmaninAkaryakitFiyatlari><YakitTipi>Motorin</YakitTipi><Birim>Litre</Birim>
    <Fiyat>88.82875</Fiyat></PetrolPiyasasiEnYuksekHacimliSekizFirmaninAkaryakitFiyatlari>
</PetrolPiyasasiEnYuksekHacimliSekizFirmaninAkaryakitFiyatlariResult>"""

LPG_IC = """<Results><Metadata><Column><number>1</number><name>yakitTuru</name><type>STRING</type></Column>
<Column><number>2</number><name>lisansUnvani</name><type>STRING</type></Column>
<Column><number>3</number><name>fiyat</name><type>DOUBLE</type></Column></Metadata>
<Table><Row><c1>Otogaz</c1><c2>AYGAZ ANONİM ŞİRKETİ</c2><c3>53.59</c3></Row>
<Row><c1>Tüplü LPG 12 KG</c1><c2>İPRAGAZ ANONİM ŞİRKETİ</c2><c3>1900.0</c3></Row></Table></Results>"""


def test_cozumleme():
    il = e.il_akaryakit_coz(e.zarf_ici(_soap(IL_IC)))
    assert il[0] == {"gecerlilik_tarihi": "2026-11-20", "yakit_tipi": "Motorin", "il": "ANKARA", "firma": "OPET",
                     "fiyat": 88.81}
    assert il[1]["firma"] == "SHELL & TURCAS"
    assert e.sekiz_firma_coz(e.zarf_ici(_soap(SEKIZ_IC))) == [{"yakit_tipi": "Motorin", "birim": "Litre", "fiyat": 88.82875}]
    lpg = e.lpg_coz(e.zarf_ici(_soap(LPG_IC)))
    assert lpg == [{"urun": "Otogaz", "firma": "AYGAZ ANONİM ŞİRKETİ", "fiyat": 53.59},
                   {"urun": "Tüplü LPG 12 KG", "firma": "İPRAGAZ ANONİM ŞİRKETİ", "fiyat": 1900.0}]
    assert e.il_akaryakit_coz("") == [] and e.lpg_coz("") == []


def test_soap_hatasi():
    hata = ('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>'
            '<soapenv:Fault><faultcode>Client</faultcode><faultstring>EPR bulunamadı</faultstring></soapenv:Fault>'
            '</soapenv:Body></soapenv:Envelope>')
    with pytest.raises(ValueError, match="EPR"):
        e.zarf_ici(hata)


class SahteIstemci:
    def __init__(self, bos_iller=(), hatali_iller=()):
        self.cagrilar = []
        self.bos, self.hatali = set(bos_iller), set(hatali_iller)

    def il_akaryakit(self, il):
        self.cagrilar.append(("akaryakit", il))
        if il in self.hatali:
            raise ValueError("bozuk yanıt")
        return [] if il in self.bos else e.il_akaryakit_coz(IL_IC)

    def il_lpg(self, gun, il):
        self.cagrilar.append(("lpg", il))
        return e.lpg_coz(LPG_IC)

    def sekiz_firma(self, gun):
        self.cagrilar.append(("sekiz", gun))
        return [{"yakit_tipi": "Motorin", "birim": "Litre", "fiyat": 80.0 + gun.day}]


def test_il_topla(tmp_path, monkeypatch):
    monkeypatch.setattr(e, "DIZIN", tmp_path)
    monkeypatch.setattr(e, "HAM", tmp_path)
    ist = SahteIstemci(bos_iller=[81], hatali_iller=[35])
    yol, basarisiz = e.il_topla(ist, date(2026, 11, 24), [6, 35, 81, 341], "akaryakit")
    assert basarisiz == [35]
    df = pd.read_parquet(yol)
    assert sorted(df["il_kodu"].unique()) == [6, 341]
    assert set(df["il_adi"]) == {"Ankara", "İstanbul (Anadolu)"} and (df["tarih"] == "2026-11-24").all()
    assert "KAPANMIŞ FİRMA" not in set(df["firma"]) and len(df) == 4   # 2016 tarihli eski fiyat kaydedilmez
    # aynı gün ikinci çalışma atlanır
    assert e.il_topla(ist, date(2026, 11, 24), [6], "akaryakit") == (None, [])


def test_sekiz_firma_doldur(tmp_path):
    yol = tmp_path / "sekiz.csv"
    ayar = e.EpdkAyarlari(sekiz_firma_baslangic="2026-11-01", sekiz_firma_azami_gun=5)
    ist = SahteIstemci()
    # ilk çalışma: 10 eksik gün var, en yeni 5'i alınır
    assert e.sekiz_firma_doldur(ist, ayar, date(2026, 11, 10), yol) == 5
    d = pd.read_csv(yol)
    assert d["tarih"].tolist() == ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]
    # ikinci çalışma: eski 5 gün doldurulur, son 2 gün tazelenir (azami 7)
    ayar.sekiz_firma_azami_gun = 7
    ist.cagrilar.clear()
    assert e.sekiz_firma_doldur(ist, ayar, date(2026, 11, 10), yol) == 7
    alinan = [c[1].day for c in ist.cagrilar]
    assert alinan == [1, 2, 3, 4, 5, 9, 10]
    d = pd.read_csv(yol)
    assert len(d) == 10 and d["tarih"].is_unique and d["tarih"].is_monotonic_increasing
    assert d.loc[d["tarih"] == "2026-11-10", "fiyat"].item() == 90.0
