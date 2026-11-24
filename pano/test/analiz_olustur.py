"""Analiz Masası'nı tarayıcıda denemek için test sayfası: pano/test/analiz_test.html.

window.claude sahte: db (veri/guncel belgesi data: adresli CSV'lere bakar), user, downloads ve
araçları sırayla çağırıp hazır bir rapor döndüren bir sample. Gerçek Claude çağrısı yapılmaz.
"""
import base64
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
PANO = KOK / "data/cikti/pano"
dosyalar = {}
for ad in ["gunluk", "aylik", "son_degisimler", "madde_endeksleri", "madde_fiyatlari", "agirliklar"]:
    b = (PANO / f"{ad}.csv").read_bytes()
    dosyalar[ad] = "data:text/csv;base64," + base64.b64encode(b).decode()

# İsteğe bağlı: haftalık rapor paketi (JSON) verilirse "haftalik" koleksiyonuna konur
haftalik = {}
if len(sys.argv) > 1:
    paket = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    haftalik["haftalik/" + paket["hafta"]] = paket
sahte = """
<script>
window.TEST = { kayitlar: %s, indirilen: null, arac_sonuclari: [] };
const DOSYALAR = %s;
function sorgu(yol) {
  const q = { orderBy: () => q, limit: () => q, where: () => q,
    onSnapshot: (f) => { const docs = Object.entries(TEST.kayitlar).filter(([k]) => k.startsWith(yol + '/')).map(([k, v]) => ({ id: k.split('/').pop(), exists: true, data: () => v })); setTimeout(() => f({ docs }), 0); return () => {}; },
    get: async () => ({ docs: [] }),
    doc: (id) => ({ set: async (d) => { TEST.kayitlar[yol + '/' + id] = d; }, delete: async () => { delete TEST.kayitlar[yol + '/' + id]; } }) };
  return q;
}
const db = {
  doc: (yol) => ({ get: async () => (yol === 'veri/guncel' ? { exists: true, data: () => ({ dosyalar: DOSYALAR, tarih: '2026-11-18' }) } : { exists: false, data: () => undefined }) }),
  collection: sorgu,
};
const sample = async () => ({ text: 'x' });
sample.json = async (girdi, se) => {
  TEST.istem = girdi;
  const a = Object.fromEntries(se.tools.map((t) => [t.name, t]));
  const cagir = async (ad, g) => { const r = await a[ad].execute(g, { signal: se.signal }); TEST.arac_sonuclari.push([ad, JSON.stringify(r).length]); return r; };
  await cagir('web_tufe_katalog', { arama: 'yumurta' });
  const e = await cagir('web_tufe_endeks', { kodlar: ['TUFE', '01', 'C'] });
  const h = await cagir('web_tufe_hareketler', { olcu: 'baslangictan', yon: 'artan', n: 8 });
  const f = await cagir('web_tufe_fiyat', { madde_kodlari: ['0114811'], zincir_kirilimi: true });
  const r = a.evds_seri_verisi ? await cagir('evds_seri_verisi', { seri_kodu: 'TP.TUKFIY2025.01', baslangic: '2026-05-01', bitis: '2026-11-18', formul: '3' }) : null;
  return {
    baslik: 'Deneme raporu', ozet: 'Bu bir test özetidir.', bulgular: ['Birinci bulgu', 'İkinci bulgu'],
    bolumler: [
      { baslik: 'Genel seyir', metin: 'Paragraf bir.\\n\\n- madde a\\n- madde b', grafik: { tur: 'cizgi', baslik: 'Web TÜFE genel ve gıda', birim: 'endeks', seriler: [
        { veri_kimligi: e.veri_kimligi, x: 'tarih', y: 'endeks', filtre: { kod: 'TUFE' }, ad: 'Genel' },
        { veri_kimligi: e.veri_kimligi, x: 'tarih', y: 'endeks', filtre: { kod: '01' }, ad: 'Gıda' }] } },
      { baslik: 'En çok artanlar', metin: 'Paragraf iki.', grafik: { tur: 'cubuk', baslik: 'Başlangıçtan bu yana', birim: '%%', seriler: [{ veri_kimligi: h.veri_kimligi, x: 'ad', y: 'deger' }] } },
      r ? { baslik: 'Yan yana', metin: 'Web ve resmi.', grafik: { tur: 'cizgi', baslik: 'Web TÜFE gıda ve resmi gıda yıllık', seriler: [
        { veri_kimligi: e.veri_kimligi, x: 'tarih', y: 'endeks', filtre: { kod: '01' }, ad: 'Web TÜFE gıda' },
        { veri_kimligi: r.veri_kimligi, x: 'tarih', y: 'deger', ad: 'TÜİK gıda yıllık %%' }] } } : null,
      { baslik: 'Yumurta', metin: 'Zincir bazında.', grafik: { tur: 'cizgi', baslik: 'Yumurta ortanca fiyatı', birim: 'TL', seriler: [{ veri_kimligi: f.veri_kimligi, x: 'tarih', y: 'fiyat', filtre: { zincir: 'Migros' }, ad: 'Migros' }, { veri_kimligi: f.veri_kimligi, x: 'tarih', y: 'fiyat', filtre: { zincir: 'BİM' }, ad: 'BİM' }] } },
    ],
    sinirlar: ['Yalnızca birkaç günlük veri.'], izlenecekler: [],
  };
};
const EVDS_YANIT = '| Tarih | TP\\_TUKFIY2025\\_01-3 |\\n| --- | --- |\\n| 2026-5 | 34.85 |\\n| 2026-6 | 35.44 |\\n| 2026-7 | 37.53 |\\n| 2026-8 | 33.78 |\\n| 2026-9 | 27.62 |\\n| 2026-10 | 27.73 |';
const mcp = {
  listTools: async () => ({ servers: [{ server: 'EVDS', authStatus: 'ok', tools: [{ name: 'get_series_data' }, { name: 'list_series' }] }] }),
  callTool: async (s, arac, girdi) => { TEST.mcp_cagrilari = (TEST.mcp_cagrilari || []).concat([[s, arac, girdi]]); return { payload: { result: 'Bugünün tarihi: 18-11-2026\\n\\n' + EVDS_YANIT + '\\n\\n(6 satır.)' } }; },
};
const YETENEK = { db, sample, user: { id: async () => 'u_test' }, downloads: { save: async (r) => { TEST.indirilen = r.filename + ' ' + r.data.length; return { status: 'saved' }; } }, mcp };
window.claude = { use: async (ad) => YETENEK[ad] ?? null };
</script>
""" % (json.dumps(haftalik), json.dumps(dosyalar))

sayfa = (KOK / "pano/analiz/index.html").read_text(encoding="utf-8")
cikti = KOK / "pano/test/analiz_test.html"
cikti.write_text('<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + sahte + sayfa + "</body></html>", encoding="utf-8")
print(cikti, f"{cikti.stat().st_size / 1024:.0f} KB")
