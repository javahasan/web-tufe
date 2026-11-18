"""Eşleme kuralları testleri (gerçek ürün adı örnekleriyle)."""

import pandas as pd
import pytest

from webtufe.eslestirme import esle, kurallari_yukle
from webtufe.metin import katla


@pytest.fixture(scope="module")
def kurallar():
    return kurallari_yukle("marketfiyati")


@pytest.mark.parametrize("baslik,kategori,beklenen", [
    ("Domates 1 Kg", "Sebze", "0117241"),
    ("Tat Domates Salçası 830 Gr", "Salça", "0117995"),
    ("Pınar Süt 1 L", "Süt", "0114111"),
    ("Pınar Yarım Yağlı Süt 1 L", "Süt", "0114201"),
    ("Pınar Kakaolu Süt 200 Ml", "Süt", "0114703"),
    ("Banvit Bütün Piliç Kg", "Beyaz Et", "0112246"),
    ("Banvit Piliç Nugget 450 Gr", "Beyaz Et", "0112590"),
    ("Pınar Hindi Salam 100 Gr", "Şarküteri", "0112392"),
    ("Pınar Dana Salam 100 Gr", "Şarküteri", "0112312"),
    ("Eti Burçak 131 Gr", "Bisküvi ve Kraker", "0111393"),
    ("Eti Crax Çubuk Kraker 123 Gr", "Bisküvi ve Kraker", "0111394"),
    ("Filiz Şehriye 500 Gr", "Mantı Makarna ve Erişte", "0111502"),
    ("Filiz Spagetti 500 Gr", "Mantı Makarna ve Erişte", "0111501"),
    ("Torku Küp Şeker 1 Kg", "Şeker ve Tatlandırıcılar", "0118122"),
    ("Torku Toz Şeker 5 Kg", "Şeker ve Tatlandırıcılar", "0118121"),
    ("Balparmak Süzme Çiçek Balı 850 Gr", "Bal ve Reçel", "0118313"),
    ("Nescafe Gold 100 Gr", "Kahve", "0122012"),
    ("Kurukahveci Mehmet Efendi Türk Kahvesi 100 Gr", "Kahve", "0122011"),
    ("Coca-Cola 1 L", "Gazlı İçecekler", "0126003"),
    ("Uludağ Gazoz 1 L", "Gazlı İçecekler", "0126002"),
    ("Kabak Çekirdeği 200 Gr", "Kuruyemiş ve Kuru Meyve", "0116891"),
    ("Tadım Ay Çekirdeği 180 Gr", "Kuruyemiş ve Kuru Meyve", "0116898"),
    ("Antep Fıstığı 150 Gr", "Kuruyemiş ve Kuru Meyve", "0116854"),
    ("Maydanoz Adet", "Sebze", "0119401"),
    ("Taze Soğan Demet", "Sebze", "0119401"),
    ("Kuru Soğan Kg", "Sebze", "0117431"),
    ("Dr. Oetker Puding Çikolatalı 115 Gr", "Pasta Malzemeleri", "0119904"),
    ("Sütaş Sütlaç 4x100 Gr", "Tatlılar", "0114701"),
    ("Dove Deodorant Sprey 150 Ml", "Parfüm ve Deodorant", "1312020"),
    ("Hacı Şakir Limon Kolonyası 400 Ml", "Parfüm ve Deodorant", "1312021"),
    ("Solo Tuvalet Kağıdı 32'li", "Tuvalet Kağıtları", "1312026"),
    ("Selpak Kağıt Peçete 100'lü", "Kağıt Peçete ve Mendiller", "0561903"),
    ("Selpak Cep Mendil 10'lu", "Kağıt Peçete ve Mendiller", "1312027"),
    ("Prima Bebek Bezi 4 Numara 50'li", "Bebek Gereçleri", "1329129"),
    # 12.11.2026 gerçek veride görülen ürün adları
    ("Uno %100 Tam Buğday Tava Ekmeği 450 Gr", "Ekmek ve Unlu Mamüller", "0111311"),
    ("Untad Premium Gurme Büyük Hamburger Ekmeği 480 Gr", "Ekmek ve Unlu Mamüller", "0111311"),
    ("Pınar Kasap Sucuğu 250 Gr", "Şarküteri", "0112311"),
    ("Tadım Yer Fıstığı 180 Gr", "Kuruyemiş ve Kuru Meyve", "0116886"),
    ("Sakız Kabağı Kg", "Sebze", "0117253"),
    ("Bebelac Gold 3 Devam Sütü 800 Gr", "Bebek Mamaları", "0119212"),
    ("Pakmaya Instant Maya 3x10 Gr", "Pasta Malzemeleri", "0119902"),
    ("Energy Ballı Kuş Krakeri 3 Adet 80 Gr", "Pet Shop", "0932201"),
])
def test_ornek_urunler(kurallar, baslik, kategori, beklenen):
    df = esle(pd.DataFrame({"urun_id": ["x"], "baslik": [baslik], "ana_kategori": [kategori]}), kurallar)
    assert df["madde_kodu"].iloc[0] == beklenen


@pytest.mark.parametrize("baslik,kategori", [
    # 12.11.2026 gerçek veride yanlış eşleşen ürünler: hiçbir maddeye gitmemeli
    ("Bagetta Yufka 500 Gr", "Ekmek ve Unlu Mamüller"),
    ("Wasa Lifli Gevrek Ekmek 230 Gr", "Ekmek ve Unlu Mamüller"),
    ("Arı Sütlü Pirinç Unu 500 Gr", "Bebek Mamaları"),
    ("Hero Goodies Süt Mısır Aromalı Kraker 30 Gr", "Bebek Mamaları"),
    ("Migros Karamelize Bisküvi Kreması 350 Gr", "Sürülebilir Ürünler ve Kahvaltılık Soslar"),
    ("Pakmaya Bitter Kurabiye Çikolatası 90 Gr", "Pasta Malzemeleri"),
    ("Sütaş Büyümix Süt Bisküvi 6x40 Gr", "Yoğurt"),
    ("Tada Hindili Bulgur Pilavı 200 Gr", "Konserve"),
])
def test_yanlis_eslesmeler_engellenir(kurallar, baslik, kategori):
    df = esle(pd.DataFrame({"urun_id": ["x"], "baslik": [baslik], "ana_kategori": [kategori]}), kurallar)
    assert pd.isna(df["madde_kodu"].iloc[0])


def test_eslesmeyen_bos_kalir(kurallar):
    df = esle(pd.DataFrame({"urun_id": ["x"], "baslik": ["Çakmak 5'li"], "ana_kategori": ["Ev & Yaşam"]}), kurallar)
    assert df["madde_kodu"].iloc[0] is None


def test_kurallardaki_maddeler_sepette_var(kurallar):
    sepet = pd.read_csv("data/referans/sepet_2026.csv", dtype={"madde_kodu": str})
    eksik = {k.madde for k in kurallar} - set(sepet["madde_kodu"])
    assert not eksik, f"Sepette olmayan madde kodları: {eksik}"


def test_turkce_katlama():
    assert katla("ÇİLEK Iğdır Şeker") == "cilek igdir seker"
