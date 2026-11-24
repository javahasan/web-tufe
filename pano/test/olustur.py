"""Panoyu tarayıcıda denemek için tek dosyalık test sayfası üretir.

  .venv/bin/python pano/test/olustur.py            # gerçek veri (data/cikti/pano)
  .venv/bin/python pano/test/olustur.py sentetik   # sentetik veri (data/sentetik/pano)

Çıktı: pano/test/gercek_test.html ya da sentetik_test.html. Sayfa, panonun çalışma ortamını
(dash.data, dash.calc, dash.draw) basitçe taklit eder; hatalar window.HATALAR'da toplanır.
"""
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
tur = sys.argv[1] if len(sys.argv) > 1 else "gercek"
# İsteğe bağlı 2. argüman: EVDS yanıt örnekleri (JSON: veri seti kimliği -> markdown yanıt)
evds = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")) if len(sys.argv) > 2 else {}
kaynak = KOK / ("data/sentetik/pano" if tur == "sentetik" else "data/cikti/pano")
veri = {p.stem: p.read_text(encoding="utf-8") for p in sorted(kaynak.glob("*.csv"))}
veri["gercek_mansetler"] = (KOK / "data/cikti/mansetler_gercek.csv").read_text(encoding="utf-8")

sablon = (KOK / "pano/test/site_test.html").read_text(encoding="utf-8")
i = sablon.index("const VERI = ")
j = sablon.index("\n", i)
k = sablon.index('<div id="dash-root">')
yama = """
<script>
// EVDS yükleyicileri: dash.loader ile tanımlanan dönüştürücüler örnek yanıtlara uygulanır
const EVDS_TEST = %s, YUK = {};
dash.loader = (id, o) => { YUK[id] = o; };
const eskiVeri = dash.data;
dash.data = (id) => {
  if (YUK[id] && EVDS_TEST[id] !== undefined) {
    try { const r = YUK[id].fn({ answer: EVDS_TEST[id] }); return { status: 'ok', data: r.rows || r }; }
    catch (e) { HATALAR.push('loader ' + id + ': ' + e.message); return { status: 'error', data: [] }; }
  }
  if (id.startsWith('resmi_') && !id.startsWith('resmi_ozet')) return { status: 'loading', data: [] };
  return eskiVeri(id);
};
</script>
""" % json.dumps(evds, ensure_ascii=False)
bas = sablon[:i] + "const VERI = " + json.dumps(veri, ensure_ascii=False) + ";" + sablon[j:k] + yama
sayfa = (KOK / "pano/site/index.html").read_text(encoding="utf-8")
cikti = KOK / f"pano/test/{tur}_test.html"
cikti.write_text(bas + '<div id="dash-root">\n' + sayfa + "</div><script>hepsiniCiz();</script>", encoding="utf-8")
print(cikti, f"{cikti.stat().st_size / 1024:.0f} KB")
