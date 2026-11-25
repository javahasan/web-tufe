"""Web TÜFE Platformu için yerel test sayfası: pano/test/platform_test.html.

Gerçek Claude ortamı yerine küçük bir taklit `window.claude` kullanır: veri dosyaları
data/cikti/pano/ altından kopyalanır, EVDS yanıtları ve haftalık raporlar verilen JSON
dosyalarından okunur, "soru sor" araçları çalıştırıp sabit bir rapor döndürür.

Kullanım: python pano/test/platform_olustur.py <evds_fixture.json> <haftalik_dizini>
(evds_fixture.json: {"<seri>|<formül>|<başlangıç>": "<EVDS markdown yanıtı>"};
 haftalik_dizini: Analiz Masası'nın haftalik belgelerinin JSON dışa aktarımı)
"""
import json, shutil, sys
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
TEST = KOK / "pano" / "test"
VERI = TEST / "platform_veri"
VERI.mkdir(exist_ok=True)
for p in (KOK / "data" / "cikti" / "pano").glob("*.csv"):
    shutil.copy(p, VERI / p.name)
shutil.copy(KOK / "data" / "cikti" / "mansetler_gercek.csv", VERI / "mansetler_gercek.csv")
shutil.copy(sys.argv[1], VERI / "evds.json")
haftalar = []
for p in sorted(Path(sys.argv[2]).glob("*.json")):
    d = json.loads(p.read_text(encoding="utf-8"))
    haftalar.append(d.get("data", d))
(VERI / "haftalik.json").write_text(json.dumps(sorted(haftalar, key=lambda h: h.get("hafta", ""), reverse=True), ensure_ascii=False), encoding="utf-8")
dosyalar = sorted(p.stem for p in VERI.glob("*.csv"))

TAKLIT = """<script>
window.claude = (() => {
  const dosyalar = __DOSYALAR__;
  const guncel = { tarih: 'test', dosyalar: Object.fromEntries(dosyalar.map((a) => [a, 'platform_veri/' + a + '.csv'])) };
  const evdsP = fetch('platform_veri/evds.json').then((r) => r.json());
  const haftalikP = fetch('platform_veri/haftalik.json').then((r) => r.json());
  const dondur = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(dondur); Object.freeze(o); } return o; };
  const snap = (id, data) => ({ id, exists: !!data, data: () => dondur(data ? JSON.parse(JSON.stringify(data)) : data) });
  const db = {
    doc(path) { return {
      onSnapshot(cb) { if (path === 'veri/guncel') setTimeout(() => cb(snap('guncel', guncel)), 60); return () => {}; },
      async get() { let v = null; try { v = localStorage.getItem('test:' + path); } catch (e) {} return snap(path, v ? JSON.parse(v) : null); },
      async set(d) { try { localStorage.setItem('test:' + path, JSON.stringify(d)); } catch (e) {} },
      async delete() { try { localStorage.removeItem('test:' + path); } catch (e) {} },
    }; },
    collection(path) {
      const q = { orderBy() { return q; }, limit() { return q; }, doc(id) { return db.doc(path + '/' + id); },
        onSnapshot(cb) { if (path === 'haftalik') haftalikP.then((l) => cb({ docs: l.map((h) => snap(h.hafta, h)) })); else setTimeout(() => cb({ docs: [] }), 30); return () => {}; } };
      return q;
    },
  };
  const anahtar = (g) => g.series_code + '|' + (g.formulas || '') + '|' + g.start_date;
  // ?izin=1: izleme çağrıları önce "approval_required" döner; bir callTool'dan sonra çalışır
  const izinModu = /izin=1/.test(location.search);
  let izinVerildi = false;
  const mcp = {
    async listTools() { return { servers: [{ server: 'EVDS', tools: [{ name: 'get_series_data' }] }] }; },
    async invalidate() {},
    watchTool(server, tool, input, handler) {
      if (izinModu && !izinVerildi) { setTimeout(() => handler({ type: 'error', error: { code: 'approval_required', message: 'izin gerekli' } }), 200); return () => {}; }
      evdsP.then((f) => setTimeout(() => {
        const t = f[anahtar(input)];
        if (t) handler({ type: 'data', result: { payload: { result: t }, cache: { storedAt: Date.now(), revalidating: false } } });
        else handler({ type: 'error', error: { code: 'tool_error', message: 'test verisi yok: ' + anahtar(input) } });
      }, 150 + Math.random() * 600));
      return () => {};
    },
    async callTool(server, tool, input) { izinVerildi = true; const f = await evdsP; return { payload: { result: f[anahtar(input)] || '' } }; },
  };
  const sample = { async json(istem, o) {
    const a = Object.fromEntries(o.tools.map((t) => [t.name, t]));
    const r1 = await a.web_tufe_hareketler.execute({ olcu: 'baslangictan', yon: 'artan', n: 8 });
    const r2 = a.evds_seri_verisi ? await a.evds_seri_verisi.execute({ seri_kodu: 'TP.TUKFIY2025.GENEL', baslangic: '2021-01-01', bitis: '2027-12-31', formul: '3', ad: 'TÜFE yıllık' }, {}) : null;
    const r3 = a.akaryakit_fiyat ? a.akaryakit_fiyat.execute({ duzey: 'ulke', baslangic: '2026-06-01' }) : null;
    await new Promise((c) => setTimeout(c, 600));
    return { baslik: 'Test yanıtı: fiyat hareketleri', ozet: 'Bu yanıt yerel test için sabit üretilmiştir; araçlar gerçek veriyle çalıştı.',
      bulgular: ['Birinci bulgu', 'İkinci bulgu'], sinirlar: ['Test verisi'], izlenecekler: ['Gelecek hafta'],
      bolumler: [{ baslik: 'Web TÜFE', metin: 'Birinci paragraf.\\n\\n- madde bir\\n- madde iki', grafik: { tur: 'cubuk', baslik: 'En çok artan maddeler', birim: '%', seriler: [{ veri_kimligi: r1.veri_kimligi, x: 'ad', y: 'deger' }] } },
        r2 ? { baslik: 'Resmi', metin: 'Resmi seri.', grafik: { tur: 'cizgi', baslik: 'TÜFE yıllık', birim: '%', seriler: [{ veri_kimligi: r2.veri_kimligi, x: 'tarih', y: 'deger', ad: 'TÜFE' }] } } : null,
        r3 ? { baslik: 'Akaryakıt', metin: 'Akaryakıt.', grafik: { tur: 'cizgi', baslik: 'Benzin ve motorin', birim: 'TL', seriler: [{ veri_kimligi: r3.veri_kimligi, x: 'tarih', y: 'fiyat', filtre: { yakit: 'Benzin' }, ad: 'Benzin' }, { veri_kimligi: r3.veri_kimligi, x: 'tarih', y: 'fiyat', filtre: { yakit: 'Motorin' }, ad: 'Motorin' }] } } : null].filter(Boolean) };
  } };
  const user = { async id() { return 'test-kullanici'; } };
  const yet = { db, mcp, sample, user, downloads: null };
  return { use: async (ad) => yet[ad] || null };
})();
</script>
""".replace("__DOSYALAR__", json.dumps(dosyalar))

html = (KOK / "pano" / "platform" / "index.html").read_text(encoding="utf-8")
d3 = '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>\n'
assert html.count(d3) == 1
html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}</style></head><body>\n' + html.replace(d3, d3 + TAKLIT) + '</body></html>\n'
(TEST / "platform_test.html").write_text(html, encoding="utf-8")
print("yazıldı:", TEST / "platform_test.html", "·", len(dosyalar), "dosya,", len(haftalar), "hafta")
