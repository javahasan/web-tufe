"""Trafik indeksi toplayıcısı ve zorunlu / isteğe bağlı hareketlilik hesabı."""

from datetime import date, timedelta

import pandas as pd
import pytest

from webtufe import mobilite as m
from webtufe.toplayicilar import ibb_trafik as t


def test_seri_coz_ve_birlestir():
    k = [{"TrafficIndex": 62, "TrafficIndexDate": "2026-11-24T10:00:00"},
         {"TrafficIndex": 71, "TrafficIndexDate": "2026-11-24T09:00:00"},
         {"TrafficIndex": 70, "TrafficIndexDate": "2026-11-24T09:00:00"}]
    s = t.seri_coz(k, "H")
    assert s["zaman"].tolist() == ["2026-11-24 09:00", "2026-11-24 10:00"] and s["indeks"].tolist() == [71, 62]
    assert t.seri_coz([{"TrafficIndex": 5, "TrafficIndexDate": "2026-11-24T10:47:00"}], "5M")["zaman"][0] == "2026-11-24 10:47"
    eski = pd.DataFrame({"zaman": ["2026-11-24 08:00", "2026-11-24 09:00"], "indeks": [60, 65]})
    b = t.birlestir(eski, s)
    assert b["indeks"].tolist() == [60, 71, 62]           # 09:00 yeni değerle güncellendi


@pytest.fixture
def takvim():
    return m.Takvim(resmi_tatil={date(2026, 5, 27), date(2026, 5, 28), date(2026, 5, 29), date(2026, 5, 30),
                                 date(2026, 4, 23)},
                    yarim_gun={date(2026, 5, 26)}, okul_tatili=[(date(2026, 6, 27), date(2026, 9, 13))],
                    ilk_gun=date(2024, 9, 9), son_gun=date(2027, 6, 25))


def test_gun_bilgisi(takvim):
    g = m.gun_bilgisi([date(2026, 4, 23), date(2026, 4, 25), date(2026, 5, 24), date(2026, 5, 26), date(2026, 6, 2),
                       date(2026, 7, 1), date(2027, 7, 1)], takvim)
    assert g.at[date(2026, 4, 23), "gun_tipi"] == "tatil" and not g.at[date(2026, 4, 23), "temiz"]
    assert g.at[date(2026, 4, 25), "gun_tipi"] == "cumartesi" and g.at[date(2026, 4, 25), "temiz"]
    assert g.at[date(2026, 5, 24), "bayram_cevresi"]           # bayramdan 3 gün önce
    assert g.at[date(2026, 5, 26), "yarim_gun"] and not g.at[date(2026, 5, 26), "temiz"]
    assert g.at[date(2026, 6, 2), "bayram_cevresi"]            # bayramdan 3 gün sonra
    assert g.at[date(2026, 7, 1), "okul_tatili"] is True
    assert g.at[date(2027, 7, 1), "okul_tatili"] is None and not g.at[date(2027, 7, 1), "temiz"]


def _saatlik(gunler, deger):
    """deger(gün, saat) -> indeks"""
    return pd.DataFrame([{"zaman": f"{g} {h:02d}:00", "indeks": deger(g, h)} for g in gunler for h in range(24)])


def test_pencereler_ve_bazlar(takvim):
    bas = date(2025, 9, 15)                  # pazartesi, okul dönemi
    gunler = [bas + timedelta(days=i) for i in range(0, 430)]
    # Okul dönemi hafta içi sabah 60, hafta sonu gündüz 50; bir yıl sonra hafta sonu %10 yüksek
    def deger(g, h):
        artis = 1.10 if g >= date(2026, 9, 14) else 1.0
        if g.weekday() >= 5:
            return 50 * artis if 11 <= h <= 19 else 10
        return 60 if 6 <= h <= 9 else 30
    s = _saatlik(gunler, deger)
    gb = m.gun_bilgisi(gunler, takvim)
    p = m.bazlari_ekle(m.pencere_degerleri(s, gb), gb)
    hs = p[(p["pencere"] == "hafta_sonu_gunduz")].set_index("tarih")
    g = date(2026, 11, 7)                    # cumartesi, okul dönemi; 52 hafta öncesi de okul dönemi
    assert hs.at[g, "deger"] == pytest.approx(55.0)
    assert hs.at[g, "yillik_baz"] == pytest.approx(50.0) and hs.at[g, "yillik_degisim"] == pytest.approx(10.0)
    assert hs.at[g, "kisa_sapma"] == pytest.approx(0.0)     # son 8 hafta da 55
    zs = p[p["pencere"] == "zorunlu_sabah"].set_index("tarih")
    assert zs.at[date(2026, 11, 10), "yillik_degisim"] == pytest.approx(0.0)
    # Tatil günü yalnızca bilgi penceresi alır, baz hesaplanmaz
    assert set(p[p["tarih"] == date(2026, 4, 23)]["pencere"]) == {"tatil_gunduz"}
    assert p[p["tarih"] == date(2026, 4, 23)]["yillik_baz"].isna().all()
    # Yaz (okul tatili) günü, okul dönemi günüyle karşılaştırılmaz: 52 hafta öncesi okul dönemi değil
    yaz = date(2026, 7, 4)                   # cumartesi; 2025-07-05 veride yok, kısa baz yaz günlerinden
    assert pd.isna(hs.at[yaz, "yillik_baz"])
    h = m.haftalik_ozet(p, gb)
    w = h.set_index("hafta").loc["2026-W45"]
    assert w["hafta_sonu_gunduz_yillik_degisim"] == pytest.approx(10.0)
    # isteğe bağlı = 3 pencerenin eşit ağırlıklı ortalaması (hafta sonu gündüz +10, diğer ikisi 0)
    assert w["istege_bagli_yillik_degisim"] == pytest.approx(10 / 3, abs=0.01)
    assert w["zorunlu_yillik_degisim"] == pytest.approx(0.0) and w["temiz_gun"] == 7


def test_eksik_saatli_pencere_atlanir(takvim):
    g = date(2026, 11, 24)
    s = _saatlik([g], lambda *_: 40)
    s = s[s["zaman"] != f"{g} 07:00"]
    p = m.pencere_degerleri(s, m.gun_bilgisi([g], takvim))
    assert "zorunlu_sabah" not in set(p["pencere"]) and "is_gunu_ogle" in set(p["pencere"])
