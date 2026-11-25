
  // ================================================================ canlılık matrisi
  // Yatay eksen fiyat baskısı (akaryakıt; Web TÜFE yeterli geçmişe ulaşınca raf fiyatı), dikey
  // eksen talep ve canlılık (İstanbul isteğe bağlı hareketlilik, reel kartlı harcama). Her bileşen
  // kendi geçmişine göre standartlaştırılır (z-skoru, son 156 hafta): 0 o bileşen için olağan
  // düzeydir. Kaynakların kendisi birleştirilmez; yalnızca kendi normallerinden sapmaları aynı
  // ölçeğe getirilip ortalanır. Resmi TÜFE yalnızca kartlı harcamayı reelleştirmek için kullanılır.
  const MATRIS_BOLGE = {
    'Canlı': { renk: 'var(--color-ok)', aciklama: 'talep olağandan güçlü, fiyat baskısı olağandan düşük' },
    'Isınma': { renk: 'var(--color-warn)', aciklama: 'talep güçlü, fiyat baskısı da yüksek' },
    'Sıkışma': { renk: 'var(--color-bad)', aciklama: 'fiyat baskısı yüksek, talep zayıf' },
    'Durgunluk': { renk: 'var(--cds-chart-reference)', aciklama: 'talep zayıf, fiyat baskısı düşük' },
  };
  const MATRIS_IZ_HAFTA = 26;
  wt.senaryo = wt.senaryo || { akaryakit: 0, raf: 0, mobilite: 0, kart: 0 };

  dash.calc('canlilik_matrisi', {
    inputs: ['akaryakit_ulke', 'gunluk', 'mobilite_haftalik', 'resmi_kart_yillik', 'resmi_tufe_yillik_uzun'],
    title: 'Canlılık matrisi: haftalık konum',
    description: 'Her hafta için fiyat baskısı ve talep eksenindeki konum (standart sapma, σ). Bileşenler: akaryakıt (EPDK 8 firma ortalaması, benzin ve motorinin haftalık ortalamasının 52 hafta öncesine göre yüzde değişimi); raf fiyatı (Web TÜFE genel endeksinin 4 haftalık değişiminin yıllığa çevrilmişi; en az 90 günlük veriden sonra eksene girer); İstanbul isteğe bağlı hareketlilik (İBB trafik indeksi, yıllık değişim; bayram haftaları ve bitmemiş hafta hariç); reel kartlı harcama (TCMB haftalık kartlı harcama tutarının yıllık değişimi, aynı ayın resmi TÜFE yıllık değişimiyle reelleştirilir; TÜFE henüz yayımlanmamışsa son yayımlanan ay kullanılır). Her bileşen 4 haftalık ortalamayla yumuşatılır (raf hariç) ve o haftaya kadarki son 156 haftanın ortalaması ve standart sapmasıyla z-skoruna çevrilir (en az 20 hafta; raf için 8). Bir bileşenin bu haftası yoksa en çok 2 hafta önceki değeri kullanılır. Eksen değeri bileşen z-skorlarının eşit ağırlıklı ortalamasıdır. Bölgeler: Canlı (talep > 0, fiyat ≤ 0), Isınma (talep > 0, fiyat > 0), Sıkışma (talep ≤ 0, fiyat > 0), Durgunluk (talep ≤ 0, fiyat ≤ 0); merkeze uzaklık 0,35σ altındaysa merkez_yakin.',
    fn: (akaryakit, gunluk, mobilite, kart, tufe) => {
      const P = { pencere: 156, asgari: 20, rafAsgari: 8, rafGun: 90, tasima: 2 };
      const G = 864e5;
      const n = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
      const ms = (t) => Date.parse(String(t).slice(0, 10) + 'T00:00:00Z');
      const tarih = (m) => new Date(m).toISOString().slice(0, 10);
      const pzt = (t) => { const m = ms(t); return tarih(m - ((new Date(m).getUTCDay() + 6) % 7) * G); };
      const kay = (h, g) => tarih(ms(h) + g * G);
      const isoEtiket = (h) => {
        const per = new Date(ms(h) + 3 * G);
        const y = per.getUTCFullYear();
        return y + '-W' + String(Math.floor((per - Date.UTC(y, 0, 1)) / (7 * G)) + 1).padStart(2, '0');
      };
      const ort = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
      const yuv = (v, b) => (v == null ? null : Math.round(v * 10 ** b) / 10 ** b);
      const bugun = tarih(Date.now() + 3 * 36e5);

      // 1) Ham haftalık değerler (anahtar: haftanın pazartesisi)
      const yakitHafta = {};
      (akaryakit || []).forEach((r) => {
        const f = n(r.fiyat);
        if (f == null || !r.tarih || !r.yakit) return;
        const h = pzt(r.tarih);
        ((yakitHafta[r.yakit] = yakitHafta[r.yakit] || {})[h] = yakitHafta[r.yakit][h] || []).push(f);
      });
      const enerjiHam = {};
      const enerjiHaftalar = new Set();
      Object.values(yakitHafta).forEach((m) => Object.keys(m).forEach((h) => enerjiHaftalar.add(h)));
      enerjiHaftalar.forEach((h) => {
        const d = Object.values(yakitHafta).map((m) => {
          const s = m[h], o = m[kay(h, -364)];
          return s && o ? (ort(s) / ort(o) - 1) * 100 : null;
        }).filter((v) => v != null);
        if (d.length) enerjiHam[h] = ort(d);
      });

      const tufeSeri = (gunluk || []).filter((r) => r.seri_kodu === 'TUFE' && n(r.endeks) != null).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
      const rafGun = tufeSeri.length ? Math.round((ms(tufeSeri[tufeSeri.length - 1].tarih) - ms(tufeSeri[0].tarih)) / G) : 0;
      const rafSon = {};
      tufeSeri.forEach((r) => { rafSon[pzt(r.tarih)] = n(r.endeks); });
      const rafHam = {};
      Object.keys(rafSon).forEach((h) => {
        const o = rafSon[kay(h, -28)];
        if (o) rafHam[h] = (Math.pow(rafSon[h] / o, 13) - 1) * 100;
      });

      const mobHam = {};
      (mobilite || []).forEach((r) => {
        const v = n(r.istege_bagli_yillik_degisim);
        if (v == null || !r.hafta_basi || !(n(r.temiz_gun) >= 4) || kay(r.hafta_basi, 6) >= bugun) return;
        mobHam[r.hafta_basi] = v;
      });

      const tufeAy = {};
      (tufe || []).forEach((r) => { const v = n(r.deger); if (v != null && r.tarih) tufeAy[String(r.tarih).slice(0, 7)] = v; });
      const tufeAylar = Object.keys(tufeAy).sort();
      const kartHam = {}, kartEk = {};
      (kart || []).forEach((r) => {
        const v = n(r.deger);
        if (v == null || !r.tarih) return;
        const ay = String(r.tarih).slice(0, 7);
        const kullanilan = tufeAy[ay] != null ? ay : tufeAylar.filter((a) => a <= ay).pop();
        if (!kullanilan) return;
        const h = pzt(r.tarih);
        kartHam[h] = ((1 + v / 100) / (1 + tufeAy[kullanilan] / 100) - 1) * 100;
        kartEk[h] = { nominal: v, tufe: tufeAy[kullanilan], tufe_ay: kullanilan, tahmini: kullanilan !== ay };
      });

      // 2) Yumuşatma ve z-skoru (o haftaya kadarki son 156 hafta)
      const bilesen = (ham, yumusat, asgari) => {
        const anahtarlar = Object.keys(ham).sort();
        const s = {};
        anahtarlar.forEach((h) => {
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
      const B = {
        enerji: bilesen(enerjiHam, true, P.asgari),
        raf: bilesen(rafHam, false, P.rafAsgari),
        mobilite: bilesen(mobHam, true, P.asgari),
        kart: bilesen(kartHam, true, P.asgari),
      };
      const rafDahil = rafGun >= P.rafGun;
      const al = (ad, h) => {
        for (let g = 0; g <= P.tasima; g++) { const k = kay(h, -7 * g); if (B[ad][k]) return { ...B[ad][k], hafta: k }; }
        return null;
      };

      // 3) Haftalık konumlar: son bitmiş haftaya kadar
      const sonHafta = kay(pzt(bugun), -7);
      const ilkler = ['enerji', 'mobilite', 'kart'].map((a) => Object.keys(B[a]).sort()[0]).filter(Boolean);
      if (ilkler.length < 3) return [];
      const satirlar = [];
      for (let h = ilkler.sort()[2]; h <= sonHafta; h = kay(h, 7)) {
        const e = al('enerji', h), m = al('mobilite', h), k = al('kart', h), r = al('raf', h);
        if (!e || !m || !k) continue;
        const fz = [e.z].concat(rafDahil && r ? [r.z] : []);
        const fiyat = ort(fz), talep = (m.z + k.z) / 2;
        const bolge = fiyat > 0 ? (talep > 0 ? 'Isınma' : 'Sıkışma') : (talep > 0 ? 'Canlı' : 'Durgunluk');
        const ek = kartEk[k.hafta] || {};
        const b = (x, ad) => ({
          [ad]: yuv(x && x.deger, 2), [ad + '_z']: yuv(x && x.z, 3), [ad + '_ort']: yuv(x && x.ort, 3),
          [ad + '_ss']: yuv(x && x.ss, 3), [ad + '_hafta']: x ? x.hafta : null,
        });
        satirlar.push({
          hafta: isoEtiket(h), hafta_basi: h, fiyat: yuv(fiyat, 3), talep: yuv(talep, 3), bolge,
          merkez_yakin: Math.hypot(fiyat, talep) < 0.35,
          ...b(e, 'enerji'), ...b(r, 'raf'), raf_dahil: !!(rafDahil && r), raf_gun: rafGun,
          ...b(m, 'mobilite'), ...b(k, 'kart'),
          kart_nominal: yuv(ek.nominal, 2), kart_tufe: yuv(ek.tufe, 2), kart_tufe_ay: ek.tufe_ay || null, kart_tufe_tahmini: !!ek.tahmini,
        });
      }
      return satirlar;
    },
  });

  // ---------------------------------------------------------------- matris: yardımcılar
  const matrisSatirlari = () => {
    const d = dash.data('canlilik_matrisi');
    return d.status === 'ok' && Array.isArray(d.data) ? d.data : [];
  };
  const sigma = (v) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v)) + 'σ');
  const haftaAraligi = (h) => {
    if (!h) return '—';
    const b = gunTarih(h), s = new Date(+b + 6 * 864e5);
    return b.getUTCDate() + (b.getUTCMonth() !== s.getUTCMonth() ? ' ' + AYK[b.getUTCMonth()] : '') + '–' + s.getUTCDate() + ' ' + AYK[s.getUTCMonth()] + ' ' + s.getUTCFullYear();
  };
  const bolgeOf = (f, t) => (f > 0 ? (t > 0 ? 'Isınma' : 'Sıkışma') : (t > 0 ? 'Canlı' : 'Durgunluk'));
  const zOf = (x, o, s) => (x == null || o == null || !s ? null : (x - o) / s);

  // Senaryo: son haftanın bileşen değerleri sürgülerle değiştirilir, aynı ortalama ve standart
  // sapmayla yeniden z-skoruna çevrilir. Bileşenler arasında etki varsayılmaz (nedensel model değil).
  function senaryoKonumu(son) {
    const s = wt.senaryo;
    const enerji = son.enerji == null ? null : ((1 + son.enerji / 100) * (1 + s.akaryakit / 100) - 1) * 100;
    const raf = son.raf == null ? null : ((1 + son.raf / 100) * Math.pow(1 + s.raf / 100, 13) - 1) * 100;
    const fz = [zOf(enerji, son.enerji_ort, son.enerji_ss)].concat(son.raf_dahil ? [zOf(raf, son.raf_ort, son.raf_ss)] : []).filter((v) => v != null);
    const tz = [zOf(son.mobilite + s.mobilite, son.mobilite_ort, son.mobilite_ss), zOf(son.kart + s.kart, son.kart_ort, son.kart_ss)].filter((v) => v != null);
    if (!fz.length || tz.length < 2) return null;
    const fiyat = fz.reduce((a, b) => a + b, 0) / fz.length, talep = (tz[0] + tz[1]) / 2;
    return { fiyat, talep, bolge: bolgeOf(fiyat, talep), degisti: Object.values(s).some((v) => v !== 0) };
  }

  function matrisBekliyor(el) {
    const eksik = [
      ['akaryakit_ulke', 'akaryakıt (EPDK)'], ['mobilite_haftalik', 'İstanbul hareketliliği'],
      ['resmi_kart_yillik', 'kartlı harcama (EVDS)'], ['resmi_tufe_yillik_uzun', 'resmi TÜFE (EVDS)'],
    ].filter(([id]) => { const d = dash.data(id); return d.status !== 'ok' || !Array.isArray(d.data) || !d.data.length; }).map(([, ad]) => ad);
    bosYaz(el, 'ok', eksik.length
      ? 'Matris için veri bekleniyor: ' + eksik.join(', ') + '. Veri geldiğinde konum kendiliğinden çizilir.'
      : 'Bileşenlerin ortak geçmişi henüz z-skoru için yeterli değil (en az 20 hafta).');
  }

  // ---------------------------------------------------------------- matris: kartlar
  dash.draw('matris-kartlar', (el) => {
    const r = matrisSatirlari();
    el.replaceChildren();
    if (!r.length) { matrisBekliyor(el); return; }
    const son = r[r.length - 1];
    const kart = (ad, deger, alt, ozellik) => {
      const k = document.createElement('div');
      k.className = 'wt-kart' + (ozellik && ozellik.vurgu ? ' wt-kart-vurgu' : '');
      const a = document.createElement('span'); a.className = 'wt-kart-ad'; a.textContent = ad;
      const d = document.createElement('span'); d.className = 'wt-kart-deger' + (ozellik && ozellik.orta ? ' wt-orta' : ''); d.textContent = deger;
      if (ozellik && ozellik.renk) d.style.color = ozellik.renk;
      const l = document.createElement('span'); l.className = 'wt-kart-alt'; l.textContent = alt;
      k.append(a, d, l);
      return k;
    };
    const B = MATRIS_BOLGE[son.bolge];
    el.append(
      kart('Bölge · ' + haftaAraligi(son.hafta_basi), son.bolge + (son.merkez_yakin ? ' (merkeze yakın)' : ''), B.aciklama, { vurgu: true, orta: true, renk: B.renk }),
      kart('Fiyat baskısı', sigma(son.fiyat), 'akaryakıt yıllık ' + wt.isaretli(son.enerji) + (son.raf_dahil ? ' · raf ' + wt.isaretli(son.raf) : ' · raf fiyatı henüz eksende değil')),
      kart('Talep ve canlılık', sigma(son.talep), 'hareketlilik ' + wt.isaretli(son.mobilite) + ' · reel kart ' + wt.isaretli(son.kart)),
      kart('Web TÜFE olgunluğu', Math.min(son.raf_gun, 90) + '/90 gün', son.raf_dahil ? 'raf fiyatı fiyat eksenine dahil' : 'yeterli geçmiş birikince fiyat eksenine girer', { orta: true }),
    );
  });

  // ---------------------------------------------------------------- matris: grafik
  dash.draw('matris-grafik', (el) => {
    const r = matrisSatirlari();
    el.replaceChildren();
    if (!r.length) { matrisBekliyor(el); return; }
    const iz = r.slice(-MATRIS_IZ_HAFTA);
    const son = iz[iz.length - 1];
    const sen = senaryoKonumu(son);
    const W = Math.max(280, Math.floor(el.clientWidth || 560));
    const H = Math.round(Math.min(W * 0.82, 480));
    const m = { l: 40, r: 14, u: 14, a: 40 };
    const enBuyuk = Math.max(2, ...iz.flatMap((p) => [Math.abs(p.fiyat), Math.abs(p.talep)]), sen ? Math.abs(sen.fiyat) : 0, sen ? Math.abs(sen.talep) : 0);
    const D = Math.min(4, Math.ceil((enBuyuk + 0.3) * 2) / 2);
    const x = d3.scaleLinear().domain([-D, D]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([-D, D]).range([H - m.a, m.u]);
    const kirp = (v) => Math.max(-D + 0.08, Math.min(D - 0.08, v));
    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'wt-matris-svg').attr('role', 'img')
      .attr('aria-label', 'Canlılık matrisi: son hafta ' + son.bolge + ' bölgesinde; fiyat baskısı ' + sigma(son.fiyat) + ', talep ' + sigma(son.talep));
    // bölgeler
    [['Canlı', -D, 0, 0, D], ['Isınma', 0, D, 0, D], ['Sıkışma', 0, D, -D, 0], ['Durgunluk', -D, 0, -D, 0]].forEach(([ad, x0, x1, y0, y1]) => {
      svg.append('rect').attr('x', x(x0)).attr('y', y(y1)).attr('width', x(x1) - x(x0)).attr('height', y(y0) - y(y1))
        .attr('fill', `color-mix(in srgb, ${MATRIS_BOLGE[ad].renk} ${son.bolge === ad ? 13 : 6}%, transparent)`);
      const sag = x0 >= 0, ust = y1 > 0;
      svg.append('text').attr('x', sag ? x(D) - 8 : x(-D) + 8).attr('y', ust ? y(D) + 18 : y(-D) - 10)
        .attr('text-anchor', sag ? 'end' : 'start').attr('class', 'wt-matris-bolge').style('fill', MATRIS_BOLGE[ad].renk).text(ad);
    });
    // ızgara ve eksenler
    const tik = d3.range(-Math.floor(D), Math.floor(D) + 1);
    const g = svg.append('g').attr('class', 'wt-matris-izgara');
    tik.forEach((t) => {
      g.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', y(-D)).attr('y2', y(D)).attr('class', t === 0 ? 'wt-sifir' : null);
      g.append('line').attr('y1', y(t)).attr('y2', y(t)).attr('x1', x(-D)).attr('x2', x(D)).attr('class', t === 0 ? 'wt-sifir' : null);
      svg.append('text').attr('x', x(t)).attr('y', H - m.a + 16).attr('text-anchor', 'middle').attr('class', 'wt-matris-tik').text(sigma(t).replace('σ', ''));
      svg.append('text').attr('x', m.l - 6).attr('y', y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('class', 'wt-matris-tik').text(sigma(t).replace('σ', ''));
    });
    svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', 'wt-matris-eksen').text('Fiyat baskısı (σ) →');
    svg.append('text').attr('transform', `translate(11,${(m.u + H - m.a) / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('class', 'wt-matris-eksen').text('Talep ve canlılık (σ) →');
    // iz
    const nok = iz.map((p) => ({ ...p, px: x(kirp(p.fiyat)), py: y(kirp(p.talep)) }));
    svg.append('path').attr('d', d3.line().x((p) => p.px).y((p) => p.py).curve(d3.curveCatmullRom.alpha(0.5))(nok)).attr('class', 'wt-matris-iz');
    nok.slice(0, -1).forEach((p, i) => {
      svg.append('circle').attr('cx', p.px).attr('cy', p.py).attr('r', 3).attr('class', 'wt-matris-nokta')
        .style('opacity', 0.25 + 0.6 * (i / Math.max(1, nok.length - 1)))
        .append('title').text(haftaAraligi(p.hafta_basi) + ': ' + p.bolge + ' · fiyat ' + sigma(p.fiyat) + ' · talep ' + sigma(p.talep));
    });
    if (nok.length > 1 && W >= 480) {
      const ilk = nok[0];
      svg.append('text').attr('x', ilk.px + 6).attr('y', ilk.py - 6).attr('class', 'wt-matris-not').text(haftaAraligi(ilk.hafta_basi).split(' ').slice(-2).join(' '));
    }
    // senaryo
    const s = nok[nok.length - 1];
    // Etiketler noktaların üstüne ya da altına ortalanır; senaryo noktası yukarıdaysa yerleri değişir
    const etiket = (px, py, yukari, metin) => svg.append('text').attr('x', Math.max(m.l + 30, Math.min(W - m.r - 30, px)))
      .attr('y', yukari ? py - 15 : py + 24).attr('text-anchor', 'middle').attr('class', 'wt-matris-etiket').text(metin);
    let sonYukari = true;
    if (sen && sen.degisti) {
      const sx = x(kirp(sen.fiyat)), sy = y(kirp(sen.talep));
      const defs = svg.append('defs');
      defs.append('marker').attr('id', 'matris-ok').attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5).attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0,0 L10,5 L0,10 z').style('fill', 'var(--color-fg)');
      const boy = Math.hypot(sx - s.px, sy - s.py);
      if (boy > 14) {
        const k = (boy - 10) / boy;
        svg.append('line').attr('x1', s.px).attr('y1', s.py).attr('x2', s.px + (sx - s.px) * k).attr('y2', s.py + (sy - s.py) * k).attr('class', 'wt-matris-ok').attr('marker-end', 'url(#matris-ok)');
      }
      svg.append('circle').attr('cx', sx).attr('cy', sy).attr('r', 8).attr('class', 'wt-matris-senaryo').style('stroke', MATRIS_BOLGE[sen.bolge].renk)
        .append('title').text('Senaryo: ' + sen.bolge + ' · fiyat ' + sigma(sen.fiyat) + ' · talep ' + sigma(sen.talep));
      sonYukari = sy >= s.py;
      etiket(sx, sy, !sonYukari, 'Senaryo');
    }
    // son hafta
    svg.append('circle').attr('cx', s.px).attr('cy', s.py).attr('r', 11).attr('class', 'wt-matris-halka').style('stroke', MATRIS_BOLGE[s.bolge].renk);
    svg.append('circle').attr('cx', s.px).attr('cy', s.py).attr('r', 6.5).attr('class', 'wt-matris-son').style('fill', MATRIS_BOLGE[s.bolge].renk)
      .append('title').text('Son hafta (' + haftaAraligi(s.hafta_basi) + '): ' + s.bolge + ' · fiyat ' + sigma(s.fiyat) + ' · talep ' + sigma(s.talep));
    etiket(s.px, s.py, sonYukari, 'Son hafta');
    el.append(svg.node());
    const not = document.createElement('p');
    not.className = 'wt-not';
    not.textContent = 'Çizgi son ' + iz.length + ' haftanın izidir (soluk noktalar eski haftalar). Merkez her bileşenin son 156 haftalık olağan düzeyidir; ±1σ olağan oynaklık aralığıdır.';
    el.append(not);
  });

  // ---------------------------------------------------------------- matris: senaryo sürgüleri
  const SURGULER = [
    ['akaryakit', (v) => (v > 0 ? '+%' : v < 0 ? '−%' : '%') + Math.abs(v)],
    ['raf', (v) => (v > 0 ? '+%' : v < 0 ? '−%' : '%') + Math.abs(v)],
    ['mobilite', (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' puan'],
    ['kart', (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' puan'],
  ];
  const senaryoCiz = () => { dash.draw('matris-grafik'); dash.draw('matris-senaryo-sonuc'); };
  dash.draw('matris-kontroller', (el) => {
    const r = matrisSatirlari();
    const son = r.length ? r[r.length - 1] : null;
    SURGULER.forEach(([ad, bicim]) => {
      const g = el.querySelector('#senaryo-' + ad), o = el.querySelector('#senaryo-' + ad + '-deger');
      if (!g) return;
      const kapali = !son || (ad === 'raf' && !son.raf_dahil);
      if (kapali && wt.senaryo[ad] !== 0) wt.senaryo[ad] = 0;
      g.disabled = kapali;
      g.closest('.wt-surgu').classList.toggle('wt-kapali', kapali);
      g.value = String(wt.senaryo[ad]);
      if (o) o.textContent = bicim(wt.senaryo[ad]);
      g.oninput = () => { wt.senaryo[ad] = Number(g.value); if (o) o.textContent = bicim(wt.senaryo[ad]); senaryoCiz(); };
    });
    const sifirla = el.querySelector('#senaryo-sifirla');
    if (sifirla) sifirla.onclick = () => { Object.keys(wt.senaryo).forEach((k) => { wt.senaryo[k] = 0; }); dash.draw('matris-kontroller'); senaryoCiz(); };
  });

  dash.draw('matris-senaryo-sonuc', (el) => {
    const r = matrisSatirlari();
    el.replaceChildren();
    if (!r.length) { el.textContent = 'Veri geldiğinde senaryo burada hesaplanır.'; return; }
    const son = r[r.length - 1];
    const sen = senaryoKonumu(son);
    if (!sen || !sen.degisti) { el.textContent = 'Sürgüleri oynatın: nokta, bileşenler o kadar farklı olsaydı matrisin neresinde olacağını gösterir.'; return; }
    const b = document.createElement('b');
    b.textContent = sen.bolge;
    b.style.color = MATRIS_BOLGE[sen.bolge].renk;
    el.append('Senaryoda konum: ', b, ' (fiyat ' + sigma(sen.fiyat) + ', talep ' + sigma(sen.talep) + ')' +
      (sen.bolge !== son.bolge ? '; son haftada ' + son.bolge + ' bölgesindeydi.' : '; bölge değişmiyor.'));
  });

  // ---------------------------------------------------------------- matris: bileşen tablosu
  dash.draw('matris-bilesenler', (tb) => {
    const r = matrisSatirlari();
    tb.replaceChildren();
    if (!r.length) return;
    const son = r[r.length - 1];
    const satirlar = [
      ['Akaryakıt (benzin, motorin)', 'Fiyat', 'EPDK, 8 firma ortalaması', son.enerji, son.enerji_z, son.enerji_hafta, 'dahil'],
      ['Raf fiyatı (Web TÜFE, 4 haftalık, yıllığa çevrilmiş)', 'Fiyat', 'Bu proje', son.raf, son.raf_z, son.raf_hafta, son.raf_dahil ? 'dahil' : 'olgunlaşıyor (' + Math.min(son.raf_gun, 90) + '/90 gün)'],
      ['İsteğe bağlı hareketlilik, İstanbul', 'Talep', 'İBB trafik indeksi', son.mobilite, son.mobilite_z, son.mobilite_hafta, 'dahil'],
      ['Reel kartlı harcama', 'Talep', 'TCMB (EVDS), resmi TÜFE ile reel', son.kart, son.kart_z, son.kart_hafta,
        'dahil' + (son.kart_tufe_tahmini ? ' · TÜFE ' + wt.ayAdi(son.kart_tufe_ay) + ' ile' : '')],
    ];
    satirlar.forEach(([ad, eksen, kaynak, deger, z, hafta, durum]) => {
      const tr = document.createElement('tr');
      [ad, eksen, kaynak, wt.isaretli(deger), sigma(z), hafta ? haftaAraligi(hafta) : '—', durum].forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (i === 3 || i === 4) td.className = 'wt-say';
        tr.append(td);
      });
      tb.append(tr);
    });
  });
