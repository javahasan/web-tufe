"""Web TÜFE Platformu sayfasını parçalarından birleştirir: pano/platform/index.html.

Sayfa, Analiz Masası adresinde yayımlanan düz bir artifact'tir (Claude'a soru sorma için
`sample`, veriler için `db`, resmi seriler için EVDS bağlayıcısı `mcp`). Parçalar:
stil.css (görsel dil), govde.html (iskelet) ve js/ altındaki betikler (sırayla tek bir
kapsamda birleştirilir).

Kullanım: python pano/platform/birlestir.py
"""
from pathlib import Path

KOK = Path(__file__).resolve().parent
stil = (KOK / "stil.css").read_text(encoding="utf-8")
govde = (KOK / "govde.html").read_text(encoding="utf-8")
betikler = sorted((KOK / "js").glob("*.js"))
js = "".join(p.read_text(encoding="utf-8") for p in betikler)

html = (
    "<title>Web TÜFE Platformu</title>\n"
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500'
    "&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400&display=swap\">\n"
    "<style>\n" + stil + "</style>\n"
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>\n\n'
    + govde
    + "\n<script>\n(() => {\n" + js + "})();\n</script>\n"
)
(KOK / "index.html").write_text(html, encoding="utf-8")
print(len(html.encode()), "bayt;", len(betikler), "betik")
