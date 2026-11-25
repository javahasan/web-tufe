"""Site görünümlü pano sayfasını parçalarından birleştirir: pano/site/index.html.

Parçalar: pano/index.html (temel stil ve hesaplar), pano/taslak/ek.css ve ek.js
(yeni çizimler), pano/site/site.css, govde.html, menu.js, bant.css/bant.js (manşet bandı)
gercek.js (veri yeniyken açılış), resmi.js (TCMB EVDS bölümü), izleme.js
(hareketlilik ve akaryakıt izleme bölümleri) ve matris.js (canlılık matrisi).
"""
import json, re, sys
from datetime import datetime, timezone

mevcut = open("pano/index.html", encoding="utf-8").read()
css = re.search(r"<style>(.*?)</style>", mevcut, re.S).group(1)
js = re.search(r"<script>(.*)</script>", mevcut, re.S).group(1)
govde = open("pano/site/govde.html", encoding="utf-8").read()
ek_css = open("pano/taslak/ek.css", encoding="utf-8").read()
site_css = open("pano/site/site.css", encoding="utf-8").read()
ek_js = open("pano/taslak/ek.js", encoding="utf-8").read()
menu_js = open("pano/site/menu.js", encoding="utf-8").read()
bant_css = open("pano/site/bant.css", encoding="utf-8").read()
bant_js = open("pano/site/bant.js", encoding="utf-8").read()
gercek_js = open("pano/site/gercek.js", encoding="utf-8").read()
resmi_js = open("pano/site/resmi.js", encoding="utf-8").read()
izleme_js = open("pano/site/izleme.js", encoding="utf-8").read()
matris_js = open("pano/site/matris.js", encoding="utf-8").read()

bas = ek_js.index("// ================================================================ taslak: sekmeler")
son = ek_js.index("// ================================================================ taslak: özet kartlarında")
ek_js = ek_js[:bas] + ek_js[son:]
for eski, yeni in [
    ("dugmeGrubu('hareket-duzey', 'data-duzey', 'hDuzey', ['artan-satirlar', 'dusen-satirlar']);",
     "dugmeGrubu('hareket-duzey', 'data-duzey', 'hDuzey', ['hareket-grafik']);"),
    ("""      document.querySelectorAll('#fiyat-hareketleri th[data-sutun]').forEach((th) => th.classList.toggle('wt-secili-sutun', th.getAttribute('data-sutun') === wt.hDonem));
      dash.draw('artan-satirlar');
      dash.draw('dusen-satirlar');""", "      dash.draw('hareket-grafik');"),
]:
    assert js.count(eski) == 1, eski[:60]
    js = js.replace(eski, yeni)
s = js.rstrip()
assert s.endswith("})();")
js = s[: -len("})();")] + ek_js + menu_js + bant_js + gercek_js + resmi_js + izleme_js + matris_js + "})();\n"
html = '<meta name="dash-one-writer">\n<style>' + css + ek_css + site_css + bant_css + '</style>\n\n' + govde + '\n<script>' + js + '</script>\n'
open("pano/site/index.html", "w", encoding="utf-8").write(html)
open("pano/site/sayfa.js", "w", encoding="utf-8").write(js)
simdi = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump({"text": html, "edit": {"via": "claude", "at": simdi}}, open("pano/site/index.json", "w", encoding="utf-8"), ensure_ascii=False)
print(len(html.encode()), "bayt;", simdi)
