  'use strict';
  // ================================================================ temel: biçim, durum, veri katmanı
  const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const yerel = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ' ₺'] });
  const F = [0, 1, 2, 3, 4].map((b) => yerel.format(',.' + b + 'f'));
  const yok = (v) => v == null || (typeof v === 'number' && !isFinite(v));
  // İşaret, gösterilen basamağa yuvarlanmış değerden alınır ("−0,00" yazılmasın)
  const yuv = (v, b) => Math.round(v * 10 ** b) / 10 ** b;
  const isaret = (v, b = 2) => { const r = yuv(v, b); return r > 0 ? '+' : r < 0 ? '−' : ''; };
  const B = {
    sayi: (v, b = 2) => (yok(v) ? '—' : (yuv(v, b) < 0 ? '−' : '') + F[b](Math.abs(v))),
    yuzde: (v, b = 2) => (yok(v) ? '—' : (yuv(v, b) < 0 ? '−%' : '%') + F[b](Math.abs(v))),
    isaretli: (v, b = 2) => (yok(v) ? '—' : isaret(v, b) + '%' + F[b](Math.abs(v))),
    puan: (v, b = 2) => (yok(v) ? '—' : (isaret(v, b) || '±') + F[b](Math.abs(v)) + ' puan'),
    fark: (v, b = 2) => (yok(v) ? '—' : isaret(v, b) + F[b](Math.abs(v))),
    tl: (v, b = 2) => (yok(v) ? '—' : F[b](v) + ' ₺'),
    sigma: (v) => (yok(v) ? '—' : isaret(v, 1) + F[1](Math.abs(v)) + 'σ'),
  };
  // Tarihler: "YYYY-AA-GG" günlük, "YYYY-AA" aylık; hepsi UTC gece yarısı
  const tarih = (s) => {
    if (s instanceof Date) return s;
    const t = String(s || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), t.length >= 13 ? +t.slice(11, 13) : 0));
    if (/^\d{4}-\d{2}$/.test(t)) return new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, 1));
    const h = /^(\d{4})-W(\d{2})$/.exec(t);
    if (h) { const j = new Date(Date.UTC(+h[1], 0, 4)); return new Date(+j - ((j.getUTCDay() + 6) % 7) * 864e5 + (+h[2] - 1) * 7 * 864e5); }
    return null;
  };
  const gunMetin = (s, yilsiz) => { const d = tarih(s); return d ? d.getUTCDate() + ' ' + AYK[d.getUTCMonth()] + (yilsiz ? '' : ' ' + d.getUTCFullYear()) : '—'; };
  const ayMetin = (s) => { const d = tarih(s); return d ? AY[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : '—'; };
  const ayKisa = (s) => { const d = tarih(s); return d ? AYK[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2) : '—'; };
  const gunEkle = (t, n) => new Date(Date.parse(String(t).slice(0, 10) + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const ayEkle = (ay, n) => { const d = new Date(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const bugunTR = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const zamanMetin = (ms) => { try { return new Date(ms).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  const kucuk = (s) => String(s || '').toLocaleLowerCase('tr');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Güvenli öğe kurucu: metinler her zaman textContent ile yazılır.
  function el(tag, ozellik, ...cocuklar) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of cocuklar.flat(Infinity)) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }
  const bosYaz = (kap, metin, hata) => { kap.replaceChildren(el('p', { class: 'bos-durum' + (hata ? ' hata' : ''), text: metin })); };

  // ---------------------------------------------------------------- durum
  const D = {
    // Her yetenek kendi hazır bayrağıyla gelir; biri diğerini beklemez (veriler EVDS'yi beklemesin)
    cap: { db: null, user: null, sample: null, downloads: null, mcp: null }, dbHazir: false, mcpHazir: false, sampleHazir: false, uid: null,
    guncel: null, dosya: {}, evds: {}, evdsBagli: null, sekme: 'enflasyon', surum: 0,
  };
  let cizimBekliyor = false;
  const cizimler = {};          // sekme -> çizim işlevi
  const herDaim = [];            // her yenilemede çalışan çizimler (bant, durum çipleri)
  function yenidenCiz() {
    D.surum++;
    if (cizimBekliyor) return;
    cizimBekliyor = true;
    // Kare çizimi beklenir; sayfa arka plandaysa (kare gelmiyorsa) kısa bir süre sonra yine çizilir
    let yapildi = false;
    const ciz = () => {
      if (yapildi) return;
      yapildi = true;
      cizimBekliyor = false;
      const fn = cizimler[D.sekme];
      try { if (fn) fn(); } catch (e) { console.error(e); tani('cizim-hata', D.sekme + ' ' + e.message); }
      herDaim.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    };
    requestAnimationFrame(ciz);
    setTimeout(ciz, 120);
  }

  // ---------------------------------------------------------------- dosyalar (veri/guncel belgesindeki CSV'ler)
  // Sayısal olmayan sütunlar: kodlar ve tarihler metin kalır ("01" gibi kodlar sayıya dönmesin).
  const METIN_SUTUN = new Set(['seri_kodu', 'madde_kodu', 'alt_sinif_kodu', 'grup_kodu', 'ana_grup_kodu', 'il_kodu', 'kod', 'tarih', 'ay', 'hafta', 'hafta_basi', 'zaman', 'onceki_tarih', 'once_tarih', 'urun', 'konum']);
  const SAYI_DESEN = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i;
  function csvOku(metin) {
    return d3.csvParse(metin, (r) => {
      const o = {};
      for (const k in r) {
        const v = r[k];
        o[k] = v === '' || v == null ? null : (!METIN_SUTUN.has(k) && SAYI_DESEN.test(v) ? Number(v) : v);
      }
      return o;
    });
  }
  // Açılışta okunanlar; diğerleri (madde fiyatları, günlük saat pencereleri) soru penceresi açılınca
  const TEMBEL_DOSYA = new Set(['madde_fiyatlari', 'mobilite_pencereler']);
  function dosyaYukle(ad) {
    const url = D.guncel && D.guncel.dosyalar && D.guncel.dosyalar[ad];
    const k = D.dosya[ad] || (D.dosya[ad] = { durum: 'yok', satirlar: null, url: null });
    if (!url) { if (D.guncel) k.durum = 'yok'; return k; }
    if (k.url === url && (k.durum === 'hazir' || k.durum === 'yukleniyor')) return k;
    k.url = url; k.durum = k.satirlar ? 'hazir' : 'yukleniyor';
    fetch(String(url)).then((y) => { if (!y.ok) throw new Error(ad + ' okunamadı (' + y.status + ')'); return y.text(); })
      .then((metin) => { if (k.url !== url) return; k.satirlar = csvOku(metin); k.durum = 'hazir'; tani('dosya', ad + ' ' + k.satirlar.length); yenidenCiz(); })
      .catch((e) => { console.warn(e); tani('dosya-hata', ad + ' ' + (e && e.message)); if (k.url === url) { k.durum = 'hata'; yenidenCiz(); } });
    return k;
  }
  // Satırları döndürür; dosya hazır değilse null
  const dosya = (ad) => { const k = D.dosya[ad] || dosyaYukle(ad); return k.durum === 'hazir' || (k.satirlar && k.durum === 'yukleniyor') ? k.satirlar : null; };
  const dosyaDurumu = (ad) => (D.dosya[ad] ? D.dosya[ad].durum : (D.guncel ? 'yok' : 'yukleniyor'));

  function guncelDinle() {
    if (!D.cap.db) { yenidenCiz(); return; }
    let sure = setTimeout(() => { if (!D.guncel) { tani('guncel-sessiz'); D.guncel = { dosyalar: {} }; yenidenCiz(); } }, 10000);
    D.cap.db.doc('veri/guncel').onSnapshot((snap) => {
      clearTimeout(sure);
      tani('guncel', snap.exists ? 'var' : 'yok');
      // Veritabanından gelen nesneler salt okunurdur; değiştirmek yerine kopyası alınır
      const v = snap.exists ? (snap.data() || {}) : {};
      D.guncel = { ...v, dosyalar: { ...(v.dosyalar || {}) } };
      Object.keys(D.guncel.dosyalar).forEach((ad) => { if (!TEMBEL_DOSYA.has(ad) || D.dosya[ad]) dosyaYukle(ad); });
      yenidenCiz();
    }, (e) => { clearTimeout(sure); console.warn(e); tani('guncel-hata', (e && e.code) + ' ' + (e && e.message)); D.guncel = { dosyalar: {} }; yenidenCiz(); });
  }

  // Bir serinin satırlarını tarihe göre gruplar: Map(kod -> satırlar)
  function seriGrupla(satirlar, kodAlan, tarihAlan) {
    const m = new Map();
    (satirlar || []).forEach((r) => { const k = r[kodAlan]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    m.forEach((l) => l.sort((a, b) => (a[tarihAlan] < b[tarihAlan] ? -1 : 1)));
    return m;
  }
  const sonEleman = (l) => (l && l.length ? l[l.length - 1] : null);

  // ---------------------------------------------------------------- EVDS (izleyicinin kendi bağlayıcısıyla)
  const EVDS_SUNUCU = 'EVDS';
  const BITIS = (new Date().getFullYear() + 1) + '-12-31';
  const GECEN_YIL = (new Date().getFullYear() - 1) + '-01-01';
  const EVDS = {
    tufe_y: { kod: 'TP.TUKFIY2025.GENEL', formul: '3', bas: '2021-01-01', ad: 'TÜFE, yıllık %' },
    tufe_a: { kod: 'TP.TUKFIY2025.GENEL', formul: '1', bas: '2023-01-01', ad: 'TÜFE, aylık %' },
    tufe_d: { kod: 'TP.TUKFIY2025.GENEL', bas: '2005-01-01', ad: 'TÜFE genel endeks (2025=100)' },
    b_y: { kod: 'TP.FE25.OKTG03', formul: '3', bas: '2021-01-01', ad: 'B göstergesi, yıllık %' },
    c_y: { kod: 'TP.FE25.OKTG04', formul: '3', bas: '2021-01-01', ad: 'C göstergesi, yıllık %' },
    c_a: { kod: 'TP.FE25.OKTG04', formul: '1', bas: '2024-01-01', ad: 'C göstergesi, aylık %' },
    pka_12: { kod: 'TP.PKAUO.S01.E.U', bas: '2022-01-01', ad: 'PKA 12 ay sonrası yıllık TÜFE beklentisi' },
    pka_ys: { kod: 'TP.PKAUO.S01.D.U', bas: '2022-01-01', ad: 'PKA cari yıl sonu TÜFE beklentisi' },
    pka_24: { kod: 'TP.PKAUO.S01.F.U', bas: '2022-01-01', ad: 'PKA 24 ay sonrası yıllık TÜFE beklentisi' },
    piyasa_12: { kod: 'TP.ENFBEK.PKA12ENF', bas: '2022-01-01', ad: 'Piyasa katılımcıları, 12 ay sonrası' },
    reel_12: { kod: 'TP.ENFBEK.IYA12ENF', bas: '2022-01-01', ad: 'Reel kesim, 12 ay sonrası' },
    hane_12: { kod: 'TP.ENFBEK.HBA12ENF', bas: '2022-01-01', ad: 'Hanehalkı, 12 ay sonrası' },
    politika: { kod: 'TP.BISPOLFAIZ.TUR', bas: '2022-01-01', ad: 'Politika faizi' },
    aofm: { kod: 'TP.APIFON4', bas: GECEN_YIL, ad: 'Ağırlıklı ortalama fonlama maliyeti' },
    pka_faiz_ys: { kod: 'TP.PKAUO.S04.H.U', bas: '2025-06-01', ad: 'PKA yıl sonu politika faizi beklentisi' },
    pka_faiz_12: { kod: 'TP.PKAUO.S04.D.U', bas: '2023-01-01', ad: 'PKA 12 ay sonrası politika faizi beklentisi' },
    usd: { kod: 'TP.DK.USD.A.YTL', bas: GECEN_YIL, ad: 'ABD doları döviz alış kuru' },
    pka_kur_ys: { kod: 'TP.PKAUO.S05.B.U', bas: '2024-01-01', ad: 'PKA yıl sonu dolar kuru beklentisi' },
    tg: { kod: 'TP.TG2.Y01', bas: '2021-01-01', ad: 'Tüketici güven endeksi' },
    rkge: { kod: 'TP.GY1.N2.MA', bas: '2021-01-01', ad: 'Reel kesim güven endeksi (MA)' },
    kko: { kod: 'TP.KKO.MA', bas: '2021-01-01', ad: 'İmalat sanayi kapasite kullanım oranı (MA)' },
    buyume: { kod: 'TP.PKAUO.S07.A.U', bas: '2024-01-01', ad: 'PKA cari yıl GSYH büyüme beklentisi' },
    buyume_gy: { kod: 'TP.PKAUO.S07.B.U', bas: '2024-01-01', ad: 'PKA gelecek yıl GSYH büyüme beklentisi' },
    kart: { kod: 'TP.KKHARTUT.KT1', formul: '3', bas: '2022-01-01', ad: 'Kartlı harcama tutarı, yıllık % (haftalık)' },
  };
  const GRUP_ADLARI = {
    '01': 'Gıda ve alkolsüz içecekler', '02': 'Alkollü içecekler ve tütün', '03': 'Giyim ve ayakkabı',
    '04': 'Konut, su, elektrik, gaz ve yakıtlar', '05': 'Mobilya, ev eşyası ve ev bakımı', '06': 'Sağlık', '07': 'Ulaştırma',
    '08': 'Bilgi ve iletişim', '09': 'Eğlence, dinlence, spor ve kültür', '10': 'Eğitim hizmetleri',
    '11': 'Lokantalar ve konaklama', '12': 'Sigorta ve finansal hizmetler', '13': 'Kişisel bakım ve çeşitli mal ve hizmetler',
  };
  const GRUP_KODLARI = Object.keys(GRUP_ADLARI);
  GRUP_KODLARI.forEach((k) => { EVDS['g' + k] = { kod: 'TP.TUKFIY2025.' + k, bas: '2019-12-01', ad: 'TÜFE ' + GRUP_ADLARI[k] + ' endeksi' }; });

  function evdsMetni(yanit) {
    const p = yanit && (yanit.payload !== undefined ? yanit.payload : yanit.structuredContent);
    if (typeof p === 'string') return p;
    if (p && typeof p.result === 'string') return p.result;
    if (yanit && Array.isArray(yanit.content)) return yanit.content.map((c) => c.text || '').join('\n');
    return JSON.stringify(p ?? yanit ?? '');
  }
  function mdTablo(metin) {
    const satirlar = String(metin).split('\n').filter((s) => s.trim().startsWith('|'));
    if (satirlar.length < 3) return [];
    const hucre = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim().replace(/\\_/g, '_'));
    const bas = hucre(satirlar[0]);
    return satirlar.slice(2).map((s) => { const h = hucre(s); const o = {}; bas.forEach((b, i) => { o[b] = h[i] ?? ''; }); return o; });
  }
  function evdsTarih(s) {
    let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    m = /^(\d{4})-(\d{1,2})$/.exec(s);
    if (m) return m[1] + '-' + m[2].padStart(2, '0');
    return s;
  }
  const evdsHafta = (s) => { const m = /^(\d{4})-(\d{1,2})$/.exec(String(s || '').trim()); return m ? m[1] + '-W' + m[2].padStart(2, '0') : (s || null); };
  // Sütunlar seriye göre değişir: "Tarih | TP_X", haftalıkta "Tarih | YEARWEEK | TP_X", formüllüde "TP_X-3".
  function evdsSutunlari(tablo, kod) {
    const sutunlar = Object.keys(tablo[0]);
    const tarihSut = sutunlar.find((s) => /^tarih$/i.test(s)) || sutunlar.find((s) => /tarih/i.test(s)) || sutunlar[0];
    const haftaSut = sutunlar.find((s) => /^yearweek$/i.test(s)) || null;
    const kodSut = kod.replace(/\./g, '_').toUpperCase();
    const sayisal = (s) => tablo.some((r) => r[s] !== '' && r[s] != null && isFinite(Number(r[s])));
    const degerSut = sutunlar.find((s) => s.toUpperCase() === kodSut || s.toUpperCase().startsWith(kodSut + '-'))
      || sutunlar.filter((s) => s !== tarihSut && s !== haftaSut && !/^(yearweek|unixtime)$/i.test(s)).reverse().find(sayisal);
    if (!degerSut) throw new Error('EVDS yanıtında değer sütunu yok (' + sutunlar.join(', ') + ')');
    return { tarihSut, haftaSut, degerSut };
  }
  function evdsCoz(metin, kod) {
    const tablo = mdTablo(metin);
    if (!tablo.length) throw new Error('EVDS tablo döndürmedi');
    const { tarihSut, haftaSut, degerSut } = evdsSutunlari(tablo, kod);
    return tablo.map((r) => ({
      tarih: evdsTarih(r[tarihSut]), ...(haftaSut ? { hafta: evdsHafta(r[haftaSut]) } : {}),
      deger: r[degerSut] === '' || r[degerSut] == null ? null : Number(r[degerSut]),
    })).filter((r) => r.deger != null && isFinite(r.deger)).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
  }
  // EVDS'nin bu sayfaya hiç bağlı olmadığını gösteren kodlar; izin isteği ise ayrı ele alınır
  const YETKI_HATASI = new Set(['server_not_connected', 'needs_reauth', 'not_granted', 'not_in_manifest', 'unavailable', 'capability_disabled', 'capability_removed', 'blocked_by_policy', 'server_not_found']);
  const IZIN_KODU = new Set(['approval_required', 'consent_required', 'selection_required']);
  // EVDS istekleri sıraya girer ve aynı anda en çok EVDS_ES_ZAMANLI tanesi çalışır: açık sekmenin
  // özet kutucukları önce istenir, önce gelir; bağlayıcıya yirmiden fazla istek bir anda yığılmaz.
  // Önbellekteki (6 saatten taze) bir yanıt hemen döner ve sıradaki yeri hemen boşaltır.
  const EVDS_ES_ZAMANLI = 5;
  const evdsKuyruk = [];
  let evdsCalisan = 0, evdsNesil = 0;
  function evdsIlerlet() {
    while (evdsCalisan < EVDS_ES_ZAMANLI && evdsKuyruk.length) {
      const id = evdsKuyruk.shift();
      evdsCalisan++;
      const nesil = evdsNesil;
      let bitti = false;
      evdsIzle(id, () => { if (bitti || nesil !== evdsNesil) return; bitti = true; evdsCalisan--; evdsIlerlet(); });
    }
  }
  const evdsGirdi = (id) => { const t = EVDS[id]; const g = { series_code: t.kod, start_date: t.bas, end_date: BITIS, full_data: true }; if (t.formul) g.formulas = t.formul; return g; };
  const EVDS_ONBELLEK = { staleTime: 6 * 3600e3, gcTime: 7 * 24 * 3600e3 };
  function evdsBaslat(id) {
    const k = D.evds[id];
    if (!D.mcpHazir) return;                                     // EVDS yeteneği gelince yeniden denenir
    if (!D.cap.mcp || D.evdsBagli === false) { k.durum = 'yok'; return; }
    k.durum = 'yukleniyor';
    evdsKuyruk.push(id);
    evdsIlerlet();
  }
  function evdsVeri(id, sonuc) {
    const k = D.evds[id];
    try {
      k.satirlar = evdsCoz(evdsMetni(sonuc), EVDS[id].kod);
      k.durum = 'hazir'; k.hata = null;
      k.zaman = (sonuc && sonuc.cache && sonuc.cache.storedAt) || Date.now();
      if (D.evdsBagli !== true) D.evdsBagli = true;
      tani('evds-veri', id + (sonuc && sonuc.cache ? ' önbellek' : ''));
    } catch (e) { k.durum = 'hata'; k.hata = e.message; tani('evds-cozum', id + ' ' + e.message); }
  }
  function evdsIzle(id, bitti) {
    const k = D.evds[id];
    if (D.evdsBagli === false) { k.durum = 'yok'; bitti(); yenidenCiz(); return; }
    const girdi = k.girdi = evdsGirdi(id);
    const sure = setTimeout(() => { tani('evds-sessiz', id); bitti(); yenidenCiz(); }, 20000);   // yanıtsız istek sırayı tıkamasın
    try {
      k.birak = D.cap.mcp.watchTool(EVDS_SUNUCU, 'get_series_data', girdi, (ev) => {
        clearTimeout(sure);
        bitti();
        if (ev.type === 'data') evdsVeri(id, ev.result);
        else {
          const h = ev.error || {}, kod = h.code;
          tani('evds-hata', id + ' ' + kod + ' ' + (h.message || ''));
          if (IZIN_KODU.has(kod)) { if (!(k.satirlar && k.satirlar.length)) k.durum = 'izin'; }
          else if (YETKI_HATASI.has(kod)) { k.durum = 'yok'; k.satirlar = []; k.hata = kod; if (kod !== 'not_in_manifest') D.evdsBagli = false; }
          else {
            // Geçici hata (ör. bağlayıcı o an izin soramadı): bir kez, önerilen süre sonra yeniden dene
            if (h.retryable && !k.yenidenDenendi) {
              k.yenidenDenendi = true;
              setTimeout(() => { try { D.cap.mcp.invalidate(EVDS_SUNUCU, 'get_series_data', girdi).catch(() => {}); } catch (e) { /* eski kabuk */ } }, Math.min(60000, h.retryAfterMs || 3000));
            }
            if (!(k.satirlar && k.satirlar.length)) { k.durum = 'hata'; k.hata = h.message || kod || 'hata'; }
          }
        }
        yenidenCiz();
      }, { cache: EVDS_ONBELLEK });
    } catch (e) { clearTimeout(sure); bitti(); k.durum = 'hata'; k.hata = e.message; tani('evds-kayit', id + ' ' + e.message); }
  }
  // İzin isteyen düğme: izleme çağrıları izin penceresi açamaz; kullanıcının basmasıyla yapılan tek
  // bir çağrı pencereyi açar. İzin verilince bekleyen bütün seriler sıraya yeniden girer.
  async function evdsIzinIste() {
    const bekleyen = Object.keys(D.evds).find((id) => D.evds[id].durum !== 'hazir') || 'tufe_y';
    tani('evds-izin-dugmesi', bekleyen);
    try {
      const sonuc = await D.cap.mcp.callTool(EVDS_SUNUCU, 'get_series_data', evdsGirdi(bekleyen), { cache: EVDS_ONBELLEK });
      if (!D.evds[bekleyen]) D.evds[bekleyen] = { durum: 'bekliyor', satirlar: [] };
      evdsVeri(bekleyen, sonuc);
      D.evdsBagli = true;
      evdsYenidenBaslat();
      return null;
    } catch (e) {
      tani('evds-izin-hata', (e && e.code) + ' ' + (e && e.message));
      return (e && e.code) || 'hata';
    } finally { yenidenCiz(); }
  }
  function evdsYenidenBaslat() {
    evdsNesil++; evdsCalisan = 0; evdsKuyruk.length = 0;
    Object.keys(D.evds).forEach((id) => {
      const k = D.evds[id];
      if (k.durum === 'hazir') return;
      try { if (k.birak) k.birak(); } catch (e) { /* zaten kapalı */ }
      k.birak = null; k.durum = 'bekliyor'; k.yenidenDenendi = false;
      evdsBaslat(id);
    });
  }
  // { durum: 'bekliyor'|'yukleniyor'|'hazir'|'izin'|'hata'|'yok', satirlar: [{tarih, deger}] }
  function evds(id) {
    let k = D.evds[id];
    if (!k) { k = D.evds[id] = { durum: 'bekliyor', satirlar: [] }; evdsBaslat(id); }
    return k;
  }
  const evdsSatir = (id) => { const k = evds(id); return k.durum === 'hazir' ? k.satirlar : null; };
  function evdsYetenekHazir() { Object.keys(D.evds).forEach((id) => { if (D.evds[id].durum === 'bekliyor') evdsBaslat(id); }); }
  // EVDS kutusunun boş durum metni
  function evdsBosMetin(id) {
    const k = evds(id);
    if (k.durum === 'yok') return D.cap.mcp ? 'EVDS bağlantısı yok. Claude’da TCMB’nin EVDS bağlayıcısını bağlayıp bu sayfaya izin verin.' : 'Resmi seriler yalnızca Claude içinde açıldığında okunur.';
    if (k.durum === 'izin') return 'EVDS izni bekleniyor: sayfanın üstündeki “Resmi serileri yükle” düğmesine basın.';
    if (k.durum === 'hata') return 'EVDS’den okunamadı: ' + (k.hata || 'bilinmeyen hata');
    return 'EVDS’den okunuyor…';
  }

  // ---------------------------------------------------------------- tanı kaydı
  // Açılıştaki adımların zamanı ve hata kodları, yalnızca izleyicinin kendi kayıt alanına
  // (data/users/<kimlik>/tani) yazılır; yükleme sorunlarını uzaktan görmek içindir.
  const TANI = { t0: Date.now(), olay: [] };
  function tani(ad, ek) { if (TANI.olay.length < 250) TANI.olay.push([Date.now() - TANI.t0, ad, ek == null ? null : String(ek).slice(0, 240)]); }
  window.addEventListener('error', (e) => tani('js-hata', (e.message || '') + ' @' + (e.lineno || '') + ':' + (e.colno || '')));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason || {}; tani('soz-hata', (r.code || '') + ' ' + (r.message || String(r))); });
  function taniKaydet(neden) {
    if (!D.cap.db || !D.uid) return;
    const durumlar = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.durum + (v.hata ? ':' + String(v.hata).slice(0, 80) : '')]));
    const belge = { tur: 'tani', neden, surum: 'platform-7', zaman: Date.now(), sure_ms: Date.now() - TANI.t0, sekme: D.sekme, gorunur: document.visibilityState,
      dbHazir: D.dbHazir, mcpHazir: D.mcpHazir, mcpVar: !!D.cap.mcp, sampleVar: !!D.cap.sample, evdsBagli: D.evdsBagli, guncel: D.guncel ? Object.keys(D.guncel.dosyalar || {}).length : null,
      dosyalar: durumlar(D.dosya), evds: durumlar(D.evds), olay: TANI.olay };
    try { D.cap.db.doc('data/users/' + D.uid + '/tani').set(belge).catch(() => {}); } catch (e) { /* kayıt isteğe bağlı */ }
  }
  [10000, 40000].forEach((ms) => setTimeout(() => taniKaydet(ms / 1000 + ' sn'), ms));
