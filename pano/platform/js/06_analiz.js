
  // ================================================================ ekonomik analiz: canlılık matrisi
  // Yatay eksen fiyat baskısı (akaryakıt; Web TÜFE 90 günlük geçmişe ulaşınca raf fiyatı), dikey eksen
  // talep ve canlılık (İstanbul isteğe bağlı hareketlilik, reel kartlı harcama). Her bileşen kendi
  // geçmişine göre standartlaştırılır (z-skoru, son 156 hafta). Kaynaklar birleştirilmez; yalnızca
  // kendi normallerinden sapmaları aynı ölçeğe getirilip ortalanır. Resmi TÜFE yalnızca kartlı
  // harcamayı reelleştirmek için kullanılır.
  const MATRIS_BOLGE = {
    'Canlı': { renk: 'var(--ok)', aciklama: 'Talep olağandan güçlü, fiyat baskısı olağandan düşük.' },
    'Isınma': { renk: 'var(--warn)', aciklama: 'Talep güçlü, fiyat baskısı da yüksek.' },
    'Sıkışma': { renk: 'var(--bad)', aciklama: 'Fiyat baskısı yüksek, talep zayıf.' },
    'Durgunluk': { renk: 'var(--s5)', aciklama: 'Talep zayıf, fiyat baskısı düşük.' },
  };
  const MATRIS_IZ = 26;
  const M = { senaryo: { akaryakit: 0, raf: 0, mobilite: 0, kart: 0 }, onbellek: { girdiler: null, sonuc: null } };

  function matrisFn(akaryakit, gunluk, mobilite, kart, tufe) {
    const P = { pencere: 156, asgari: 20, rafAsgari: 8, rafGun: 90, tasima: 2 };
    const G = 864e5;
    const n = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
    const ms = (t) => Date.parse(String(t).slice(0, 10) + 'T00:00:00Z');
    const gun = (m) => new Date(m).toISOString().slice(0, 10);
    const pzt = (t) => { const m = ms(t); return gun(m - ((new Date(m).getUTCDay() + 6) % 7) * G); };
    const kay = (h, g) => gun(ms(h) + g * G);
    const isoEtiket = (h) => { const per = new Date(ms(h) + 3 * G); const y = per.getUTCFullYear(); return y + '-W' + String(Math.floor((per - Date.UTC(y, 0, 1)) / (7 * G)) + 1).padStart(2, '0'); };
    const ort = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    const yuv = (v, b) => (v == null ? null : Math.round(v * 10 ** b) / 10 ** b);
    const bugun = bugunTR();
    const yakitHafta = {};
    akaryakit.forEach((r) => {
      const f = n(r.fiyat);
      if (f == null || !r.tarih || !r.yakit) return;
      const h = pzt(r.tarih);
      ((yakitHafta[r.yakit] = yakitHafta[r.yakit] || {})[h] = yakitHafta[r.yakit][h] || []).push(f);
    });
    const enerjiHam = {};
    const haftalar = new Set();
    Object.values(yakitHafta).forEach((m) => Object.keys(m).forEach((h) => haftalar.add(h)));
    haftalar.forEach((h) => {
      const d = Object.values(yakitHafta).map((m) => { const s = m[h], o = m[kay(h, -364)]; return s && o ? (ort(s) / ort(o) - 1) * 100 : null; }).filter((v) => v != null);
      if (d.length) enerjiHam[h] = ort(d);
    });
    const tufeSeri = gunluk.filter((r) => r.seri_kodu === 'TUFE' && n(r.endeks) != null).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
    const rafGun = tufeSeri.length ? Math.round((ms(tufeSeri[tufeSeri.length - 1].tarih) - ms(tufeSeri[0].tarih)) / G) : 0;
    const rafSon = {};
    tufeSeri.forEach((r) => { rafSon[pzt(r.tarih)] = n(r.endeks); });
    const rafHam = {};
    Object.keys(rafSon).forEach((h) => { const o = rafSon[kay(h, -28)]; if (o) rafHam[h] = (Math.pow(rafSon[h] / o, 13) - 1) * 100; });
    const mobHam = {};
    mobilite.forEach((r) => {
      const v = n(r.istege_bagli_yillik_degisim);
      if (v == null || !r.hafta_basi || !(n(r.temiz_gun) >= 4) || kay(r.hafta_basi, 6) >= bugun) return;
      mobHam[r.hafta_basi] = v;
    });
    const tufeAy = {};
    tufe.forEach((r) => { const v = n(r.deger); if (v != null && r.tarih) tufeAy[String(r.tarih).slice(0, 7)] = v; });
    const tufeAylar = Object.keys(tufeAy).sort();
    const kartHam = {}, kartEk = {};
    kart.forEach((r) => {
      const v = n(r.deger);
      if (v == null || !r.tarih) return;
      const ay = String(r.tarih).slice(0, 7);
      const kullanilan = tufeAy[ay] != null ? ay : tufeAylar.filter((a) => a <= ay).pop();
      if (!kullanilan) return;
      const h = pzt(r.tarih);
      kartHam[h] = ((1 + v / 100) / (1 + tufeAy[kullanilan] / 100) - 1) * 100;
      kartEk[h] = { nominal: v, tufe: tufeAy[kullanilan], tufe_ay: kullanilan, tahmini: kullanilan !== ay };
    });
    const bilesen = (ham, yumusat, asgari) => {
      const s = {};
      Object.keys(ham).sort().forEach((h) => {
        if (!yumusat) { s[h] = ham[h]; return; }
        const d = [0, -7, -14, -21].map((g) => ham[kay(h, g)]).filter((v) => v != null);
        if (d.length >= 2) s[h] = ort(d);
      });
      const z = {};
      const sk = Object.keys(s).sort();
      sk.forEach((h, i) => {
        const alt = kay(h, -7 * (P.pencere - 1));
        const pen = [];
        for (let j = i; j >= 0 && sk[j] >= alt; j--) pen.push(s[sk[j]]);
        if (pen.length < asgari) return;
        const m = ort(pen);
        const ss = Math.sqrt(pen.reduce((t, x) => t + (x - m) ** 2, 0) / (pen.length - 1));
        if (ss > 0) z[h] = { deger: s[h], z: (s[h] - m) / ss, ort: m, ss };
      });
      return z;
    };
    const Bl = { enerji: bilesen(enerjiHam, true, P.asgari), raf: bilesen(rafHam, false, P.rafAsgari), mobilite: bilesen(mobHam, true, P.asgari), kart: bilesen(kartHam, true, P.asgari) };
    const rafDahil = rafGun >= P.rafGun;
    const al = (ad, h) => { for (let g = 0; g <= P.tasima; g++) { const k = kay(h, -7 * g); if (Bl[ad][k]) return { ...Bl[ad][k], hafta: k }; } return null; };
    const sonHafta = kay(pzt(bugun), -7);
    const ilkler = ['enerji', 'mobilite', 'kart'].map((a) => Object.keys(Bl[a]).sort()[0]).filter(Boolean);
    if (ilkler.length < 3) return [];
    const satirlar = [];
    for (let h = ilkler.sort()[2]; h <= sonHafta; h = kay(h, 7)) {
      const e = al('enerji', h), m = al('mobilite', h), k = al('kart', h), r = al('raf', h);
      if (!e || !m || !k) continue;
      const fiyat = ort([e.z].concat(rafDahil && r ? [r.z] : [])), talep = (m.z + k.z) / 2;
      const bolge = fiyat > 0 ? (talep > 0 ? 'Isınma' : 'Sıkışma') : (talep > 0 ? 'Canlı' : 'Durgunluk');
      const ek = kartEk[k.hafta] || {};
      const b = (x, ad) => ({ [ad]: yuv(x && x.deger, 2), [ad + '_z']: yuv(x && x.z, 3), [ad + '_ort']: yuv(x && x.ort, 3), [ad + '_ss']: yuv(x && x.ss, 3), [ad + '_hafta']: x ? x.hafta : null });
      satirlar.push({ hafta: isoEtiket(h), hafta_basi: h, fiyat: yuv(fiyat, 3), talep: yuv(talep, 3), bolge, merkez_yakin: Math.hypot(fiyat, talep) < 0.35,
        ...b(e, 'enerji'), ...b(r, 'raf'), raf_dahil: !!(rafDahil && r), raf_gun: rafGun, ...b(m, 'mobilite'), ...b(k, 'kart'),
        kart_nominal: yuv(ek.nominal, 2), kart_tufe: yuv(ek.tufe, 2), kart_tufe_ay: ek.tufe_ay || null, kart_tufe_tahmini: !!ek.tahmini });
    }
    return satirlar;
  }
  function matrisSatirlari() {
    const girdiler = [dosya('akaryakit_ulke'), dosya('gunluk'), dosya('mobilite_haftalik'), evdsSatir('kart'), evdsSatir('tufe_y')];
    const o = M.onbellek;
    if (o.girdiler && girdiler.every((g, i) => g === o.girdiler[i])) return o.sonuc;
    let sonuc = null;
    if (girdiler[0] && girdiler[2] && girdiler[3] && girdiler[4]) { try { sonuc = matrisFn(girdiler[0], girdiler[1] || [], girdiler[2], girdiler[3], girdiler[4]); } catch (e) { console.error(e); sonuc = []; } }
    M.onbellek = { girdiler, sonuc };
    return sonuc;
  }
  function matrisBekliyorMetin() {
    const eksik = [];
    if (!dosya('akaryakit_ulke')) eksik.push('akaryakıt (EPDK)');
    if (!dosya('mobilite_haftalik')) eksik.push('İstanbul hareketliliği');
    if (!evdsSatir('kart')) eksik.push(evds('kart').durum === 'yok' ? 'kartlı harcama (EVDS bağlı değil)' : 'kartlı harcama (EVDS)');
    if (!evdsSatir('tufe_y')) eksik.push('resmi TÜFE (EVDS)');
    return eksik.length ? 'Matris için veri bekleniyor: ' + eksik.join(', ') + '.' : 'Bileşenlerin ortak geçmişi z-skoru için henüz yeterli değil (en az 20 hafta).';
  }
  const haftaAraligi = (h) => {
    if (!h) return '—';
    const b = tarih(h), s = new Date(+b + 6 * 864e5);
    return b.getUTCDate() + (b.getUTCMonth() !== s.getUTCMonth() ? ' ' + AYK[b.getUTCMonth()] : '') + '–' + s.getUTCDate() + ' ' + AYK[s.getUTCMonth()] + ' ' + s.getUTCFullYear();
  };
  const bolgeOf = (f, t) => (f > 0 ? (t > 0 ? 'Isınma' : 'Sıkışma') : (t > 0 ? 'Canlı' : 'Durgunluk'));
  const zOf = (x, o, s) => (x == null || o == null || !s ? null : (x - o) / s);
  function senaryoKonumu(son) {
    const s = M.senaryo;
    const enerji = son.enerji == null ? null : ((1 + son.enerji / 100) * (1 + s.akaryakit / 100) - 1) * 100;
    const raf = son.raf == null ? null : ((1 + son.raf / 100) * Math.pow(1 + s.raf / 100, 13) - 1) * 100;
    const fz = [zOf(enerji, son.enerji_ort, son.enerji_ss)].concat(son.raf_dahil ? [zOf(raf, son.raf_ort, son.raf_ss)] : []).filter((v) => v != null);
    const tz = [zOf(son.mobilite + s.mobilite, son.mobilite_ort, son.mobilite_ss), zOf(son.kart + s.kart, son.kart_ort, son.kart_ss)].filter((v) => v != null);
    if (!fz.length || tz.length < 2) return null;
    const fiyat = fz.reduce((a, b) => a + b, 0) / fz.length, talep = (tz[0] + tz[1]) / 2;
    return { fiyat, talep, bolge: bolgeOf(fiyat, talep), degisti: Object.values(s).some((v) => v !== 0) };
  }

  function matrisGrafikCiz(r) {
    const kap = $('#matris-grafik');
    kap.replaceChildren();
    if (!r || !r.length) { bosYaz(kap, matrisBekliyorMetin()); $('#matris-not').textContent = ''; return; }
    const iz = r.slice(-MATRIS_IZ), son = iz[iz.length - 1], sen = senaryoKonumu(son);
    const W = Math.max(280, Math.floor(kap.clientWidth || 560));
    const H = Math.round(Math.min(W * 0.8, 520));
    const m = { l: 60, r: 16, u: 14, a: 42 };
    const enBuyuk = Math.max(2, ...iz.flatMap((p) => [Math.abs(p.fiyat), Math.abs(p.talep)]), sen ? Math.abs(sen.fiyat) : 0, sen ? Math.abs(sen.talep) : 0);
    const Dm = Math.min(4, Math.ceil((enBuyuk + 0.3) * 2) / 2);
    const x = d3.scaleLinear().domain([-Dm, Dm]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([-Dm, Dm]).range([H - m.a, m.u]);
    const kirp = (v) => Math.max(-Dm + 0.08, Math.min(Dm - 0.08, v));
    const svg = yeniSvg(W, H, 'Canlılık matrisi: son hafta ' + son.bolge + ' bölgesinde; fiyat baskısı ' + B.sigma(son.fiyat) + ', talep ' + B.sigma(son.talep));
    [['Canlı', -Dm, 0, 0, Dm], ['Isınma', 0, Dm, 0, Dm], ['Sıkışma', 0, Dm, -Dm, 0], ['Durgunluk', -Dm, 0, -Dm, 0]].forEach(([ad, x0, x1, y0, y1]) => {
      svg.append('rect').attr('x', x(x0)).attr('y', y(y1)).attr('width', x(x1) - x(x0)).attr('height', y(y0) - y(y1))
        .style('fill', 'color-mix(in srgb, ' + MATRIS_BOLGE[ad].renk + ' ' + (son.bolge === ad ? 14 : 6) + '%, transparent)');
      const sag = x0 >= 0, ust = y1 > 0;
      svg.append('text').attr('x', sag ? x(Dm) - 10 : x(-Dm) + 10).attr('y', ust ? y(Dm) + 20 : y(-Dm) - 12).attr('text-anchor', sag ? 'end' : 'start')
        .style('fill', MATRIS_BOLGE[ad].renk).style('font-weight', 600).style('font-size', '13px').text(ad);
    });
    d3.range(-Math.floor(Dm), Math.floor(Dm) + 1).forEach((t) => {
      const sifir = t === 0;
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', y(-Dm)).attr('y2', y(Dm)).style('stroke', sifir ? 'var(--line-strong)' : 'var(--grid)').style('stroke-width', sifir ? 1.5 : 1);
      svg.append('line').attr('y1', y(t)).attr('y2', y(t)).attr('x1', x(-Dm)).attr('x2', x(Dm)).style('stroke', sifir ? 'var(--line-strong)' : 'var(--grid)').style('stroke-width', sifir ? 1.5 : 1);
      svg.append('text').attr('x', x(t)).attr('y', H - m.a + 16).attr('text-anchor', 'middle').text(B.sigma(t).replace('σ', ''));
      svg.append('text').attr('x', m.l - 8).attr('y', y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').text(B.sigma(t).replace('σ', ''));
    });
    svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 6).attr('text-anchor', 'middle').style('font-size', '12px').style('fill', 'var(--muted)').text('Fiyat baskısı (σ) →');
    svg.append('text').attr('transform', `translate(14,${(m.u + H - m.a) / 2}) rotate(-90)`).attr('text-anchor', 'middle').style('font-size', '12px').style('fill', 'var(--muted)').text('Talep ve canlılık (σ) →');
    const nok = iz.map((p) => ({ ...p, px: x(kirp(p.fiyat)), py: y(kirp(p.talep)) }));
    svg.append('path').attr('d', d3.line().x((p) => p.px).y((p) => p.py).curve(d3.curveCatmullRom.alpha(0.5))(nok)).style('fill', 'none').style('stroke', 'var(--muted)').style('stroke-width', 1.5).style('opacity', 0.55);
    const ip = ipucuKur(kap);
    const ipGoster = (p, baslik) => ip.goster(p.px * (kap.clientWidth / W), Math.max(0, p.py * (kap.clientWidth / W) - 70), baslik,
      [{ ad: 'Bölge', deger: p.bolge, renk: MATRIS_BOLGE[p.bolge].renk }, { ad: 'Fiyat baskısı', deger: B.sigma(p.fiyat), renk: 'var(--muted)' }, { ad: 'Talep', deger: B.sigma(p.talep), renk: 'var(--muted)' }]);
    nok.slice(0, -1).forEach((p, i) => {
      svg.append('circle').attr('cx', p.px).attr('cy', p.py).attr('r', 3.4).style('fill', 'var(--muted)').style('opacity', 0.25 + 0.6 * (i / Math.max(1, nok.length - 1)))
        .on('pointerenter', () => ipGoster(p, haftaAraligi(p.hafta_basi))).on('pointerleave', () => ip.gizle());
    });
    if (nok.length > 1 && W >= 480) svg.append('text').attr('x', nok[0].px + 6).attr('y', nok[0].py - 7).style('font-size', '10.5px').style('fill', 'var(--faint)').text(haftaAraligi(nok[0].hafta_basi).split(' ').slice(-2).join(' '));
    const s = nok[nok.length - 1];
    const etiket = (px, py, yukari, metin) => svg.append('text').attr('x', Math.max(m.l + 34, Math.min(W - m.r - 34, px))).attr('y', yukari ? py - 16 : py + 25)
      .attr('text-anchor', 'middle').style('font-size', '11.5px').style('font-weight', 600).style('fill', 'var(--ink)').text(metin);
    let sonYukari = true;
    if (sen && sen.degisti) {
      const sx = x(kirp(sen.fiyat)), sy = y(kirp(sen.talep));
      svg.append('defs').append('marker').attr('id', 'matris-ok').attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5).attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0,0 L10,5 L0,10 z').style('fill', 'var(--ink)');
      const boy = Math.hypot(sx - s.px, sy - s.py);
      if (boy > 14) { const k = (boy - 10) / boy; svg.append('line').attr('x1', s.px).attr('y1', s.py).attr('x2', s.px + (sx - s.px) * k).attr('y2', s.py + (sy - s.py) * k).style('stroke', 'var(--ink)').style('stroke-width', 1.5).attr('stroke-dasharray', '4 3').attr('marker-end', 'url(#matris-ok)'); }
      svg.append('circle').attr('cx', sx).attr('cy', sy).attr('r', 8).style('fill', 'var(--panel)').style('stroke', MATRIS_BOLGE[sen.bolge].renk).style('stroke-width', 2.5);
      sonYukari = sy >= s.py;
      etiket(sx, sy, !sonYukari, 'Senaryo');
    }
    svg.append('circle').attr('cx', s.px).attr('cy', s.py).attr('r', 12).style('fill', 'none').style('stroke', MATRIS_BOLGE[s.bolge].renk).style('stroke-width', 2).style('opacity', 0.5);
    svg.append('circle').attr('cx', s.px).attr('cy', s.py).attr('r', 7).style('fill', MATRIS_BOLGE[s.bolge].renk).style('stroke', 'var(--panel)').style('stroke-width', 1.5)
      .on('pointerenter', () => ipGoster(s, 'Son hafta · ' + haftaAraligi(s.hafta_basi))).on('pointerleave', () => ip.gizle());
    etiket(s.px, s.py, sonYukari, 'Son hafta');
    kap.prepend(svg.node());
    $('#matris-not').textContent = 'Çizgi son ' + iz.length + ' haftanın izidir; soluk noktalar eski haftalardır. Merkez her bileşenin son 156 haftalık olağan düzeyi, ±1σ olağan oynaklık aralığıdır.';
  }

  function matrisBolgeCiz(r) {
    const kap = $('#matris-bolge');
    if (!r || !r.length) { kap.replaceChildren(el('div', { class: 'kart-bas' }, el('div', {}, el('h4', { text: 'Son hafta' }))), el('p', { class: 'bos-durum', text: matrisBekliyorMetin() })); return; }
    const son = r[r.length - 1], Bo = MATRIS_BOLGE[son.bolge];
    const onceki = r.length > 4 ? r[r.length - 5] : null;
    kap.replaceChildren(
      el('div', { class: 'kart-bas' }, el('div', {}, el('h4', { text: 'Son hafta · ' + haftaAraligi(son.hafta_basi) }), el('p', { text: 'ISO hafta ' + son.hafta }))),
      el('div', { class: 'bolge-kart' },
        el('div', { class: 'bolge-ad', style: { color: Bo.renk }, text: son.bolge + (son.merkez_yakin ? ' (merkeze yakın)' : '') }),
        el('p', { style: { margin: '0 0 8px', color: 'var(--muted)', fontSize: '13.5px' }, text: Bo.aciklama + (onceki ? ' Dört hafta önce ' + onceki.bolge + ' bölgesindeydi.' : '') })),
      el('div', { class: 'kpi-izgara', style: { gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px' } },
        kpi({ etiket: 'Fiyat baskısı', deger: B.sigma(son.fiyat), alt: 'akaryakıt yıllık ' + B.isaretli(son.enerji, 1) + (son.raf_dahil ? ' · raf ' + B.isaretli(son.raf, 1) : '') }),
        kpi({ etiket: 'Talep ve canlılık', deger: B.sigma(son.talep), alt: 'hareketlilik ' + B.isaretli(son.mobilite, 1) + ' · reel kart ' + B.isaretli(son.kart, 1) })),
      el('p', { class: 'kart-ayak', text: 'Web TÜFE olgunluğu: ' + Math.min(son.raf_gun, 90) + '/90 gün · ' + (son.raf_dahil ? 'raf fiyatı fiyat eksenine dahil' : 'yeterli geçmiş birikince raf fiyatı fiyat eksenine girer') }),
    );
  }

  const SURGU_BICIM = {
    akaryakit: (v) => isaret(v) + '%' + Math.abs(v), raf: (v) => isaret(v) + '%' + F[1](Math.abs(v)),
    mobilite: (v) => isaret(v) + Math.abs(v) + ' puan', kart: (v) => isaret(v) + Math.abs(v) + ' puan',
  };
  function senaryoCiz(r) {
    const son = r && r.length ? r[r.length - 1] : null;
    Object.keys(SURGU_BICIM).forEach((ad) => {
      const kapali = !son || (ad === 'raf' && !son.raf_dahil);
      if (kapali) M.senaryo[ad] = 0;
      const g = $('#senaryo-' + ad);
      g.disabled = kapali;
      g.value = String(M.senaryo[ad]);
      $('#surgu-' + ad).classList.toggle('kapali', kapali);
      $('#senaryo-' + ad + '-deger').textContent = SURGU_BICIM[ad](M.senaryo[ad]);
    });
    const p = $('#senaryo-sonuc');
    if (!son) { p.textContent = 'Veri geldiğinde senaryo burada hesaplanır.'; return; }
    const sen = senaryoKonumu(son);
    if (!sen || !sen.degisti) { p.textContent = 'Sürgüleri oynatın: nokta, bileşenler o kadar farklı olsaydı matrisin neresinde olacağını gösterir.'; return; }
    p.replaceChildren('Senaryoda konum: ', el('b', { style: { color: MATRIS_BOLGE[sen.bolge].renk }, text: sen.bolge }),
      ' (fiyat ' + B.sigma(sen.fiyat) + ', talep ' + B.sigma(sen.talep) + ')' + (sen.bolge !== son.bolge ? '; son hafta ' + son.bolge + ' bölgesindeydi.' : '; bölge değişmiyor.'));
  }
  Object.keys(SURGU_BICIM).forEach((ad) => $('#senaryo-' + ad).addEventListener('input', (e) => {
    M.senaryo[ad] = Number(e.target.value);
    const r = matrisSatirlari();
    senaryoCiz(r);
    matrisGrafikCiz(r);
  }));
  $('#senaryo-sifirla').addEventListener('click', () => { Object.keys(M.senaryo).forEach((k) => { M.senaryo[k] = 0; }); const r = matrisSatirlari(); senaryoCiz(r); matrisGrafikCiz(r); });

  function matrisBilesenCiz(r) {
    const kap = $('#matris-bilesenler');
    if (!r || !r.length) { bosYaz(kap, matrisBekliyorMetin()); return; }
    const son = r[r.length - 1];
    const satirlar = [
      ['Akaryakıt (benzin, motorin)', 'Fiyat', 'EPDK, 8 firma ortalaması', son.enerji, son.enerji_z, son.enerji_hafta, 'dahil', 'yakit'],
      ['Raf fiyatı (Web TÜFE, 4 haftalık, yıllığa çevrilmiş)', 'Fiyat', 'Bu proje', son.raf, son.raf_z, son.raf_hafta, son.raf_dahil ? 'dahil' : 'olgunlaşıyor (' + Math.min(son.raf_gun, 90) + '/90 gün)', 'web'],
      ['İsteğe bağlı hareketlilik, İstanbul', 'Talep', 'İBB trafik indeksi', son.mobilite, son.mobilite_z, son.mobilite_hafta, 'dahil', 'trafik'],
      ['Reel kartlı harcama', 'Talep', 'TCMB (EVDS), resmi TÜFE ile reel', son.kart, son.kart_z, son.kart_hafta, 'dahil' + (son.kart_tufe_tahmini ? ' · TÜFE ' + ayMetin(son.kart_tufe_ay) + ' ile' : ''), 'resmi'],
    ];
    kap.replaceChildren(el('table', { class: 'veri' },
      el('thead', {}, el('tr', {}, ['Bileşen', 'Eksen', 'Kaynak', 'Yıllık değişim', 'Sapma', 'Hafta', 'Durum'].map((b, i) => el('th', { class: i === 3 || i === 4 ? 'say' : null, text: b })))),
      el('tbody', {}, satirlar.map(([ad, eksen, kaynak, deger, z, hafta, durum, tur]) => el('tr', {},
        el('td', { class: 'ad', text: ad }), el('td', { text: eksen }), el('td', {}, el('span', { class: 'rozet ' + tur, text: kaynak })),
        el('td', { class: 'say', text: B.isaretli(deger, 1) }), el('td', { class: 'say' }, el('b', { text: B.sigma(z) })),
        el('td', { text: hafta ? haftaAraligi(hafta) : '—' }), el('td', { text: durum }))))));
  }

  // ---------------------------------------------------------------- haftalık görünüm
  const HAFTA = { liste: [], secili: null, yuklendi: false };
  function haftalikDinle() {
    if (!D.cap.db) { HAFTA.yuklendi = true; yenidenCiz(); return; }
    D.cap.db.collection('haftalik').orderBy('hafta', 'desc').limit(26).onSnapshot((snap) => {
      HAFTA.liste = snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() }));
      HAFTA.yuklendi = true;
      HAFTA.imza = '';
      yenidenCiz();
    }, (e) => { console.warn(e); HAFTA.yuklendi = true; yenidenCiz(); });
  }
  function haftalikCiz() {
    const kap = $('#haftalik-icerik');
    if (!HAFTA.liste.length) {
      $('#hafta-secim').hidden = true;
      kap.replaceChildren(el('p', { class: 'bos-durum', text: HAFTA.yuklendi ? 'Haftalık görünüm henüz yayımlanmadı. Her pazartesi burada yayımlanır.' : 'Haftalık görünüm yükleniyor…' }));
      return;
    }
    const sec = $('#hafta-listesi');
    if (!HAFTA.secili || !HAFTA.liste.some((h) => h.id === HAFTA.secili)) HAFTA.secili = HAFTA.liste[0].id;
    const imza = HAFTA.liste.map((h) => h.id + ':' + (h.olusturma || '')).join(',') + '|' + HAFTA.secili;
    if (imza === HAFTA.imza) return;
    HAFTA.imza = imza;
    sec.replaceChildren(...HAFTA.liste.map((h) => el('option', { value: h.id, text: (h.hafta || h.id) + (h.rapor && h.rapor.baslik ? ' · ' + h.rapor.baslik : '') })));
    sec.value = HAFTA.secili;
    $('#hafta-secim').hidden = HAFTA.liste.length < 2;
    const h = HAFTA.liste.find((x) => x.id === HAFTA.secili);
    raporCiz(kap, { ...h, rapor: raporuDuzelt(h.rapor), veriler: h.veriler || {} }, { indir: true });
  }
  $('#hafta-listesi').addEventListener('change', (e) => { HAFTA.secili = e.target.value; HAFTA.imza = ''; haftalikCiz(); });

  cizimler.analiz = () => {
    const r = matrisSatirlari();
    matrisGrafikCiz(r);
    matrisBolgeCiz(r);
    senaryoCiz(r);
    matrisBilesenCiz(r);
    haftalikCiz();
  };

  // ================================================================ raporlar (haftalık görünüm ve soru yanıtları)
  function raporuDuzelt(r) {
    const metin = (v) => (v == null ? '' : String(v));
    const dizi = (v) => (Array.isArray(v) ? v.map(metin).filter(Boolean) : []);
    const o = r && typeof r === 'object' ? r : {};
    return {
      baslik: metin(o.baslik) || 'Analiz', ozet: metin(o.ozet), bulgular: dizi(o.bulgular),
      bolumler: (Array.isArray(o.bolumler) ? o.bolumler : []).map((b) => ({
        baslik: metin(b && b.baslik), metin: metin(b && b.metin),
        grafik: b && b.grafik && typeof b.grafik === 'object' ? {
          tur: b.grafik.tur === 'cubuk' ? 'cubuk' : 'cizgi', baslik: metin(b.grafik.baslik), birim: metin(b.grafik.birim),
          seriler: (Array.isArray(b.grafik.seriler) ? b.grafik.seriler : []).map((s) => ({
            veri_kimligi: metin(s && s.veri_kimligi), x: metin(s && s.x), y: metin(s && s.y), ad: metin(s && s.ad),
            filtre: s && s.filtre && typeof s.filtre === 'object' ? Object.fromEntries(Object.entries(s.filtre).map(([k, v]) => [String(k), metin(v)])) : null,
          })).filter((s) => s.veri_kimligi && s.x && s.y),
        } : null,
      })),
      sinirlar: dizi(o.sinirlar), izlenecekler: dizi(o.izlenecekler),
    };
  }
  function paragraflar(metin) {
    return String(metin || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
      const satirlar = b.split('\n');
      if (satirlar.every((s) => /^\s*[-•]\s+/.test(s))) return el('ul', {}, satirlar.map((s) => el('li', { text: s.replace(/^\s*[-•]\s+/, '') })));
      return el('p', { text: b.replace(/\n/g, ' ') });
    });
  }
  const KAYNAK_ETIKETI = { web: 'Web TÜFE', resmi: 'Resmi · EVDS', trafik: 'Trafik · İBB', yakit: 'Akaryakıt · EPDK' };
  const PANEL_ETIKETI = { web: 'Web TÜFE · bu proje', resmi: 'Resmi · TCMB EVDS', trafik: 'İstanbul trafik hareketliliği · İBB', yakit: 'Akaryakıt · EPDK' };
  const TONLAR = {
    web: ['var(--web)', 'var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s5)'], resmi: ['var(--resmi)', 'var(--s1)', 'var(--s4)', 'var(--s3)', 'var(--s5)'],
    trafik: ['var(--trafik)', 'var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s5)'], yakit: ['var(--yakit)', 'var(--s1)', 'var(--s3)', 'var(--s4)', 'var(--s5)'],
  };
  function sorguMetni(s) {
    if (!s) return '';
    return Object.entries(s).filter(([, v]) => v != null && v !== '').map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join(',') : (typeof v === 'object' ? JSON.stringify(v) : v))).join(' ');
  }
  function raporGrafigi(g, veriler) {
    const fig = el('figure', {}, el('figcaption', { text: g.baslik || '' }));
    const seriler = g.seriler.map((s) => {
      const v = veriler[s.veri_kimligi];
      if (!v) return null;
      const satirlar = (v.satirlar || []).filter((r) => !s.filtre || Object.entries(s.filtre).every(([a, b]) => String(r[a]) === b));
      const noktalar = satirlar.map((r) => ({ xh: r[s.x], y: Number(r[s.y]) })).filter((p) => p.xh != null && isFinite(p.y));
      return noktalar.length ? { ...s, kaynak: KAYNAK_ETIKETI[v.kaynak] ? v.kaynak : 'web', noktalar } : null;
    }).filter(Boolean);
    if (!seriler.length) { fig.append(el('p', { class: 'bos-durum', text: 'Bu grafiğin verisi bulunamadı.' })); return { fig, ciz: () => {} }; }
    const paneller = ['web', 'resmi', 'yakit', 'trafik'].map((k) => seriler.filter((s) => s.kaynak === k)).filter((l) => l.length);
    const kaplar = paneller.map((liste) => {
      const kap = el('div', { class: 'grafik' });
      fig.append(el('span', { class: 'panel-etiket ' + liste[0].kaynak, text: PANEL_ETIKETI[liste[0].kaynak] }), kap);
      return { kap, liste };
    });
    if (paneller.length > 1) fig.append(el('p', { class: 'kart-ayak', text: 'Farklı kaynaklar ayrı panellerde, kendi ölçekleriyle gösterilir; tek seride birleştirilmez.' }));
    const ipB = g.birim === '%' ? (v) => B.yuzde(v) : g.birim === 'TL' ? (v) => B.sayi(v) + ' TL' : (v) => B.sayi(v);
    const ciz = () => kaplar.forEach(({ kap, liste }) => {
      const ton = TONLAR[liste[0].kaynak];
      if (g.tur === 'cubuk') {
        const s = liste[0];
        cubukGrafik(kap, { satirlar: s.noktalar.slice(0, 25).map((p) => ({ ad: String(p.xh), deger: p.y })), renk: ton[0], negatifRenk: ton[1], bicim: ipB, etiket: g.baslik });
      } else {
        const tarihMi = liste.every((s) => s.noktalar.every((p) => tarih(p.xh)));
        cizgiGrafik(kap, { etiket: g.baslik, ipBicim: ipB, yuzde: g.birim === '%', ipTolerans: 24,
          seriler: liste.map((s, i) => ({ ad: s.ad || s.y, renk: ton[i % ton.length], kalin: i === 0 ? 2.4 : 1.8, kesik: liste[0].kaynak !== 'web' && i > 0,
            noktalar: s.noktalar.map((p) => ({ x: tarihMi ? tarih(p.xh) : String(p.xh), y: p.y })).sort((a, b) => (a.x < b.x ? -1 : 1)) })) });
      }
    });
    return { fig, ciz };
  }
  function raporCiz(kap, paket, secenek = {}) {
    const { rapor, veriler } = paket;
    const kaynakVar = (t) => Object.values(veriler || {}).some((v) => v.kaynak === t);
    const cizimListesi = [];
    const grafik = (g) => { const o = raporGrafigi(g, veriler || {}); cizimListesi.push(o.ciz); return o.fig; };
    const govde = el('article', { class: 'rapor' },
      el('p', { class: 'ust-etiket', text: (paket.hafta ? 'Haftalık görünüm · ' + paket.hafta : (paket.mod === 'whitepaper' ? 'Ayrıntılı rapor' : 'Kısa yanıt')) + (paket.olusturma ? ' · ' + zamanMetin(paket.olusturma) : '') }),
      el('h3', { class: 'rapor-baslik', text: rapor.baslik }),
      el('div', { class: 'metin' },
        rapor.ozet ? el('p', { class: 'ozet', text: rapor.ozet }) : null,
        rapor.bulgular.length ? [el('h4', { text: 'Ana bulgular' }), el('ul', {}, rapor.bulgular.map((b) => el('li', { text: b })))] : null),
      rapor.bolumler.map((b) => [b.baslik ? el('h4', { text: b.baslik }) : null, el('div', { class: 'metin' }, paragraflar(b.metin)), b.grafik && b.grafik.seriler.length ? grafik(b.grafik) : null]),
      rapor.sinirlar.length ? [el('h4', { text: 'Sınırlar' }), el('ul', { class: 'metin' }, rapor.sinirlar.map((s) => el('li', { text: s })))] : null,
      rapor.izlenecekler.length ? [el('h4', { text: 'İzlenecekler' }), el('ul', { class: 'metin' }, rapor.izlenecekler.map((s) => el('li', { text: s })))] : null,
      Object.keys(veriler || {}).length ? el('details', {}, el('summary', { text: 'Veri kaynakları (' + Object.keys(veriler).length + ')' }),
        el('div', { class: 'tablo-kap' }, el('table', { class: 'kaynak-tablo' },
          el('thead', {}, el('tr', {}, el('th', { text: 'Kimlik' }), el('th', { text: 'Kaynak' }), el('th', { text: 'Veri' }), el('th', { text: 'Sorgu' }))),
          el('tbody', {}, Object.entries(veriler).map(([id, v]) => el('tr', {}, el('td', { class: 'kod', text: id }),
            el('td', {}, el('span', { class: 'rozet ' + (KAYNAK_ETIKETI[v.kaynak] ? v.kaynak : 'web'), text: KAYNAK_ETIKETI[v.kaynak] || 'Web TÜFE' })),
            el('td', { text: (v.baslik || '') + (v.aciklama ? ' (' + v.aciklama + ')' : '') + (v.satir_sayisi ? ' · ' + v.satir_sayisi + ' satır' : '') }),
            el('td', { class: 'kod', text: sorguMetni(v.sorgu) }))))))) : null,
      el('div', { class: 'feragat' },
        el('p', { text: 'Bu metin yapay zekâ tarafından üretilmiştir; yorumlar yanıltıcı olabilir ve yatırım tavsiyesi değildir.' }),
        kaynakVar('web') || !Object.keys(veriler || {}).length ? el('p', { text: 'Web TÜFE, bu projenin marketfiyati.org.tr fiyatlarından hesapladığı deneysel bir endekstir; TÜİK’in resmi TÜFE’si değildir ve onunla birleştirilmez.' }) : null,
        kaynakVar('resmi') ? el('p', { text: 'Resmi seriler TCMB EVDS’den alınmıştır. TCMB yalnızca veri sağlayıcıdır; yorumlar TCMB’ye ait değildir.' }) : null,
        kaynakVar('trafik') ? el('p', { text: 'Hareketlilik göstergeleri İBB’nin İstanbul trafik indeksinden (İBB Açık Veri Lisansı) bu projede hesaplanmıştır; yalnızca İstanbul’u kapsar.' }) : null,
        kaynakVar('yakit') ? el('p', { text: 'Akaryakıt fiyatları EPDK’nın web servislerinden bu projede derlenmiştir.' }) : null),
    );
    const araclar = secenek.araclar || (secenek.indir && D.cap.downloads ? el('div', { class: 'mesaj-araclar', style: { justifyContent: 'flex-end', marginTop: '0', marginBottom: '8px' } },
      el('button', { type: 'button', text: 'HTML olarak indir', onclick: () => raporuIndir(govde, paket) })) : null);
    kap.replaceChildren(...[araclar, govde].filter(Boolean));
    const cizHepsi = () => cizimListesi.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    requestAnimationFrame(cizHepsi);
    if ('ResizeObserver' in window && cizimListesi.length) {
      let son = 0;
      new ResizeObserver(() => { const w = govde.clientWidth; if (w && Math.abs(w - son) > 12) { son = w; cizHepsi(); } }).observe(govde);
    }
    return govde;
  }
  async function raporuIndir(govde, paket) {
    if (!D.cap.downloads) return;
    const stil = [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules].map((r) => r.cssText); } catch (e) { return []; } }).join('\n');
    const baslik = paket.rapor.baslik.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
    const kac = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + kac(baslik) +
      '</title><style>' + stil + ' body{padding:24px;max-width:900px;margin:0 auto}</style></head><body>' + govde.outerHTML + '</body></html>';
    try { await D.cap.downloads.save({ filename: 'analiz-' + new Date(paket.olusturma || Date.now()).toISOString().slice(0, 10) + '-' + kucuk(baslik).replace(/\s+/g, '-').slice(0, 40) + '.html', data: html }); }
    catch (e) { /* izleyici vazgeçti */ }
  }
