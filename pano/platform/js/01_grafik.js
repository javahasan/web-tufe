
  // ================================================================ grafikler
  // Tüm grafikler kabın o anki genişliğine göre çizilir; renkler CSS değişkeni olarak verilir
  // (var(--web) gibi), böylece açık ve koyu temada kendiliğinden doğru görünür.
  const olcTuval = document.createElement('canvas').getContext('2d');
  function olc(metin, px = 11, kalin = false) {
    olcTuval.font = (kalin ? '600 ' : '400 ') + px + 'px "IBM Plex Sans", system-ui, sans-serif';
    return olcTuval.measureText(String(metin)).width;
  }
  function sigdir(metin, azami, px = 12) {
    let s = String(metin);
    if (olc(s, px) <= azami) return s;
    while (s.length > 2 && olc(s + '…', px) > azami) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  const yeniSvg = (W, H, etiket) => d3.select(document.createElementNS(SVGNS, 'svg'))
    .attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', etiket || 'Grafik').style('touch-action', 'pan-y');

  function lejant(seriler) {
    return el('div', { class: 'lejant' }, seriler.map((s) => {
      const i = el('i', { class: s.kesik ? 'kesik' : null });
      i.style.background = s.renk;
      if (s.kesik) i.style.color = s.renk;
      return el('span', {}, i, s.ad);
    }));
  }

  function ipucuKur(kap) {
    const ip = el('div', { class: 'ipucu', hidden: true });
    kap.append(ip);
    return {
      goster(x, y, baslik, satirlar) {
        ip.replaceChildren(el('div', { class: 'ipucu-baslik', text: baslik }),
          satirlar.map((r) => { const i = el('i'); i.style.background = r.renk; return el('div', { class: 'ipucu-satir' }, el('span', {}, i, r.ad), el('b', { text: r.deger })); }));
        ip.hidden = false;
        const gw = kap.clientWidth, iw = ip.offsetWidth;
        ip.style.left = Math.max(0, Math.min(gw - iw, x + 14 + iw > gw ? x - iw - 14 : x + 14)) + 'px';
        ip.style.top = Math.max(0, y) + 'px';
      },
      gizle() { ip.hidden = true; },
    };
  }

  // ---------------------------------------------------------------- çizgi grafik
  // s: {seriler: [{ad, renk, noktalar: [{x: Date|metin, y}], kalin, kesik, adim, alan, etiketsiz}], yukseklik,
  //     yuzde, yBicim, ipBicim, ipBaslik, sifir, referanslar: [{y, ad}], xAralik, etiket, bos, lejantYok}
  function cizgiGrafik(kap, s) {
    kap.replaceChildren();
    const seriler = s.seriler.map((x) => ({ ...x, noktalar: (x.noktalar || []).filter((p) => p.x != null && !yok(p.y)) })).filter((x) => x.noktalar.length);
    if (!seriler.length) { bosYaz(kap, s.bos || 'Gösterilecek veri yok.'); return; }
    const W = Math.max(260, Math.floor(kap.clientWidth || 600));
    const H = s.yukseklik || (W < 480 ? 220 : 260);
    const tarihMi = seriler.every((x) => x.noktalar.every((p) => p.x instanceof Date));
    const tum = seriler.flatMap((x) => x.noktalar);
    const refler = (s.referanslar || []).filter((r) => !yok(r.y));
    let [y0, y1] = d3.extent([...tum.map((p) => p.y), ...refler.map((r) => r.y)]);
    if (s.sifir) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
    if (y0 === y1) { const p = Math.abs(y0) * 0.02 || 1; y0 -= p; y1 += p; }
    const y = d3.scaleLinear().domain([y0, y1]).nice(5);
    const yt = y.ticks(Math.max(3, Math.min(6, Math.floor(H / 48))));
    const adim = yt.length > 1 ? Math.abs(yt[1] - yt[0]) : 1;
    const ond = adim >= 1 ? 0 : adim >= 0.1 ? 1 : 2;
    const yEt = s.yBicim || ((v) => (s.yuzde ? B.yuzde(v, ond) : B.sayi(v, ond)));
    const ipB = s.ipBicim || ((v) => (s.yuzde ? B.yuzde(v) : B.sayi(v)));
    const sonlar = s.sonEtiket === false ? [] : seriler.filter((x) => !x.etiketsiz).map((x) => ({ x, p: x.noktalar[x.noktalar.length - 1] }));
    sonlar.forEach((o) => { o.metin = ipB(o.p.y); });
    const m = { u: 12, s: Math.max(...yt.map((t) => olc(yEt(t)))) + 12, r: sonlar.length ? Math.max(...sonlar.map((o) => olc(o.metin, 11.5, true))) + 14 : 14, a: 24 };
    y.range([H - m.a, m.u]);
    let x, X;
    if (tarihMi) {
      let ext = s.xAralik || d3.extent(tum, (p) => p.x);
      if (+ext[0] === +ext[1]) ext = [new Date(+ext[0] - 864e5), new Date(+ext[1] + 864e5)];
      x = d3.scaleUtc().domain(ext).range([m.s, W - m.r]);
      X = (p) => x(p.x);
    } else {
      const dom = [];
      seriler.forEach((sr) => sr.noktalar.forEach((p) => { const k = String(p.x); if (!dom.includes(k)) dom.push(k); }));
      x = d3.scalePoint().domain(dom).range([m.s + 6, W - m.r - 6]);
      X = (p) => x(String(p.x));
    }
    const svg = yeniSvg(W, H, s.etiket);
    // yatay ızgara ve y etiketleri
    const g = svg.append('g');
    yt.forEach((t) => {
      g.append('line').attr('class', 'izgara-cizgi').attr('x1', m.s).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t));
      g.append('text').attr('x', m.s - 8).attr('y', y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').text(yEt(t));
    });
    if (y.domain()[0] < 0 && y.domain()[1] > 0) g.append('line').attr('class', 'sifir-cizgi').attr('x1', m.s).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
    g.append('line').attr('class', 'eksen-cizgi').attr('x1', m.s).attr('x2', W - m.r).attr('y1', H - m.a).attr('y2', H - m.a);
    // x etiketleri
    if (tarihMi) {
      const [d0, d1] = x.domain();
      const gun = (d1 - d0) / 864e5;
      const xb = s.xBicim || (gun > 200 ? (d) => AYK[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2) : (d) => d.getUTCDate() + ' ' + AYK[d.getUTCMonth()]);
      let tiks = x.ticks(Math.max(2, Math.floor((W - m.s - m.r) / 84)));
      if (gun <= 200) tiks = tiks.filter((d) => d.getUTCHours() === 0);
      tiks.forEach((t) => {
        const metin = xb(t), w = olc(metin);
        if (x(t) - w / 2 < 2 || x(t) + w / 2 > W - 2) return;
        g.append('line').attr('class', 'eksen-cizgi').attr('x1', x(t)).attr('x2', x(t)).attr('y1', H - m.a).attr('y2', H - m.a + 4);
        g.append('text').attr('x', x(t)).attr('y', H - m.a + 16).attr('text-anchor', 'middle').text(metin);
      });
    } else {
      const dom = x.domain();
      const enGenis = Math.max(...dom.map((d) => olc(s.xBicim ? s.xBicim(d) : d))) + 12;
      const her = Math.max(1, Math.ceil(dom.length * enGenis / (W - m.s - m.r)));
      dom.forEach((d, i) => { if (i % her === 0) g.append('text').attr('x', x(d)).attr('y', H - m.a + 16).attr('text-anchor', 'middle').text(s.xBicim ? s.xBicim(d) : d); });
    }
    // referans çizgileri
    refler.forEach((r) => {
      svg.append('line').attr('class', 'referans').attr('x1', m.s).attr('x2', W - m.r).attr('y1', y(r.y)).attr('y2', y(r.y));
      if (r.ad) svg.append('text').attr('class', 'referans-yazi').attr('x', r.sag ? W - m.r - 4 : m.s + 4).attr('y', y(r.y) - 5).attr('text-anchor', r.sag ? 'end' : 'start').text(r.ad);
    });
    // seriler
    seriler.forEach((sr) => {
      const egri = sr.adim ? d3.curveStepAfter : d3.curveLinear;
      if (sr.alan) {
        svg.append('path').attr('d', d3.area().x(X).y0(y(Math.max(y.domain()[0], Math.min(0, y.domain()[1])))).y1((p) => y(p.y)).curve(egri)(sr.noktalar))
          .style('fill', sr.renk).style('fill-opacity', 0.08).style('stroke', 'none');
      }
      svg.append('path').attr('d', d3.line().x(X).y((p) => y(p.y)).curve(egri)(sr.noktalar))
        .style('fill', 'none').style('stroke', sr.renk).style('stroke-width', sr.kalin || 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round')
        .attr('stroke-dasharray', sr.kesik ? '5 4' : null);
      const p = sr.noktalar[sr.noktalar.length - 1];
      svg.append('circle').attr('cx', X(p)).attr('cy', y(p.y)).attr('r', sr.kesik ? 2.5 : 3.4).style('fill', sr.renk);
    });
    // son değer etiketleri (çakışmasın diye dikeyde aralanır)
    sonlar.forEach((o) => { o.yy = y(o.p.y); });
    sonlar.sort((a, b) => a.yy - b.yy).forEach((o, i, l) => { if (i && o.yy - l[i - 1].yy < 13) o.yy = l[i - 1].yy + 13; });
    sonlar.forEach((o) => svg.append('text').attr('class', 'son-etiket').attr('x', X(o.p) + 7).attr('y', o.yy).attr('dy', '0.35em').style('fill', o.x.renk).text(o.metin));
    // imleç ve ipucu
    const imlec = svg.append('line').attr('class', 'imlec').attr('y1', m.u).attr('y2', H - m.a).style('display', 'none');
    const imNokta = svg.append('g').style('display', 'none');
    const ip = ipucuKur(kap);
    const xler = tarihMi ? [...new Set(tum.map((p) => +p.x))].sort((a, b) => a - b) : x.domain();
    const bul = (sr, hedef) => {
      const l = sr.noktalar;
      if (!tarihMi) return l.find((p) => String(p.x) === hedef) || null;
      const t = l.map((p) => +p.x);
      let i;
      if (sr.adim) { i = d3.bisectRight(t, hedef) - 1; if (i < 0) return null; }
      else { i = d3.bisector((d) => d).center(t, hedef); if (Math.abs(x(t[i]) - x(hedef)) > (s.ipTolerans || 36)) return null; }
      return l[i];
    };
    svg.append('rect').attr('x', m.s).attr('y', m.u).attr('width', Math.max(1, W - m.s - m.r)).attr('height', Math.max(1, H - m.u - m.a))
      .style('fill', 'transparent').style('pointer-events', 'all')
      .on('pointermove', (e) => {
        const [mx] = d3.pointer(e);
        let hedef;
        if (tarihMi) { const t = +x.invert(mx); hedef = xler[d3.bisector((d) => d).center(xler, t)]; }
        else { const dom = x.domain(); hedef = dom[Math.max(0, Math.min(dom.length - 1, Math.round((mx - x.range()[0]) / (x.step() || 1))))]; }
        const hx = tarihMi ? x(hedef) : x(hedef);
        const satirlar = [];
        imNokta.selectAll('*').remove();
        seriler.forEach((sr) => {
          const p = bul(sr, hedef);
          if (!p) return;
          satirlar.push({ ad: sr.ad, deger: ipB(p.y), renk: sr.renk });
          imNokta.append('circle').attr('cx', X(p)).attr('cy', y(p.y)).attr('r', 4).style('fill', 'var(--panel)').style('stroke', sr.renk).style('stroke-width', 2);
        });
        if (!satirlar.length) return;
        imlec.attr('x1', hx).attr('x2', hx).style('display', null);
        imNokta.style('display', null);
        const baslik = s.ipBaslik ? s.ipBaslik(tarihMi ? new Date(hedef) : hedef) : (tarihMi ? gunMetin(new Date(hedef)) : hedef);
        ip.goster(hx * (kap.clientWidth / W), m.u, baslik, satirlar);
      })
      .on('pointerleave', () => { imlec.style('display', 'none'); imNokta.style('display', 'none'); ip.gizle(); });
    kap.prepend(svg.node());
    if (!s.lejantYok && seriler.length > 1) kap.append(lejant(seriler));
  }

  // ---------------------------------------------------------------- yatay çubuk grafik
  // s: {satirlar: [{ad, deger, renk, vurgu}], bicim, renk, negatifRenk, referans: {deger, ad}, etiket, bos}
  function cubukGrafik(kap, s) {
    kap.replaceChildren();
    const satirlar = (s.satirlar || []).filter((r) => !yok(r.deger));
    if (!satirlar.length) { bosYaz(kap, s.bos || 'Gösterilecek veri yok.'); return; }
    const W = Math.max(260, Math.floor(kap.clientWidth || 600));
    const satirH = s.satirYukseklik || 26;
    const bic = s.bicim || ((v) => B.isaretli(v));
    const ref = s.referans && !yok(s.referans.deger) ? s.referans : null;
    const adGen = Math.min(W * (W < 480 ? 0.46 : 0.4), Math.max(...satirlar.map((r) => olc(r.ad, 12))) + 16);
    const degGen = Math.max(...satirlar.map((r) => olc(bic(r.deger), 11.5, true))) + 8;
    const negatifVar = satirlar.some((r) => r.deger < 0);
    const ust = ref && ref.ad ? 18 : 6;
    const H = ust + satirlar.length * satirH + 6;
    const m = { s: adGen + (negatifVar ? degGen : 0), r: degGen + 4 };
    const deg = satirlar.map((r) => r.deger).concat(ref ? [ref.deger] : []);
    const x = d3.scaleLinear().domain([Math.min(0, d3.min(deg)), Math.max(0, d3.max(deg))]).range([m.s, W - m.r]);
    if (x.domain()[0] === x.domain()[1]) x.domain([0, 1]);
    const svg = yeniSvg(W, H, s.etiket);
    satirlar.forEach((r, i) => {
      const yy = ust + i * satirH;
      const renk = r.renk || (r.deger < 0 && s.negatifRenk ? s.negatifRenk : s.renk || 'var(--accent)');
      if (r.vurgu) svg.append('rect').attr('x', 0).attr('y', yy).attr('width', W).attr('height', satirH).style('fill', 'var(--panel-2)');
      svg.append('text').attr('class', 'cubuk-ad').attr('x', adGen - 10 + (negatifVar ? 0 : 0)).attr('y', yy + satirH / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
        .style('font-weight', r.vurgu ? 600 : null).text(sigdir(r.ad, adGen - 12, 12)).append('title').text(r.ad);
      const x0 = x(Math.min(0, r.deger)), w = Math.max(1.5, Math.abs(x(r.deger) - x(0)));
      svg.append('rect').attr('x', x0).attr('y', yy + satirH * 0.2).attr('width', w).attr('height', satirH * 0.6).attr('rx', 2).style('fill', renk);
      svg.append('text').attr('class', 'cubuk-deger').attr('x', r.deger < 0 ? x(r.deger) - 5 : x(r.deger) + 5).attr('y', yy + satirH / 2).attr('dy', '0.35em')
        .attr('text-anchor', r.deger < 0 ? 'end' : 'start').text(bic(r.deger));
    });
    if (x.domain()[0] < 0) svg.append('line').attr('class', 'sifir-cizgi').attr('x1', x(0)).attr('x2', x(0)).attr('y1', ust - 2).attr('y2', H - 4);
    if (ref) {
      svg.append('line').attr('class', 'referans').attr('x1', x(ref.deger)).attr('x2', x(ref.deger)).attr('y1', ust - 4).attr('y2', H - 2);
      if (ref.ad) svg.append('text').attr('class', 'referans-yazi').attr('x', x(ref.deger)).attr('y', 11).attr('text-anchor', x(ref.deger) > W * 0.75 ? 'end' : 'middle').text(ref.ad);
    }
    kap.append(svg.node());
  }

  // ---------------------------------------------------------------- dikey sütun grafik
  // s: {noktalar: [{x: Date, y}], renk, negatifRenk, yuzde, ipBaslik, yukseklik, etiket, xBicim}
  function sutunGrafik(kap, s) {
    kap.replaceChildren();
    const n = (s.noktalar || []).filter((p) => !yok(p.y));
    if (!n.length) { bosYaz(kap, s.bos || 'Gösterilecek veri yok.'); return; }
    const W = Math.max(260, Math.floor(kap.clientWidth || 600));
    const H = s.yukseklik || 230;
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(n, (p) => p.y)), Math.max(0, d3.max(n, (p) => p.y))]).nice(5);
    const yt = y.ticks(5);
    const adim = yt.length > 1 ? Math.abs(yt[1] - yt[0]) : 1;
    const ond = adim >= 1 ? 0 : adim >= 0.1 ? 1 : 2;
    const yEt = (v) => (s.yuzde ? B.yuzde(v, ond) : B.sayi(v, ond));
    const ipB = s.ipBicim || ((v) => (s.yuzde ? B.yuzde(v) : B.sayi(v)));
    const sonMetin = ipB(n[n.length - 1].y);
    const m = { u: 16, s: Math.max(...yt.map((t) => olc(yEt(t)))) + 12, r: 8, a: 24 };
    y.range([H - m.a, m.u]);
    const xb = s.xBicim || ((d) => ayKisa(d));
    const x = d3.scaleBand().domain(n.map((_, i) => i)).range([m.s, W - m.r]).padding(0.22);
    const svg = yeniSvg(W, H, s.etiket);
    yt.forEach((t) => {
      svg.append('line').attr('class', t === 0 ? 'sifir-cizgi' : 'izgara-cizgi').attr('x1', m.s).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t));
      svg.append('text').attr('x', m.s - 8).attr('y', y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').text(yEt(t));
    });
    const her = Math.max(1, Math.ceil(n.length * (olc(xb(n[0].x)) + 10) / (W - m.s - m.r)));
    const cubuklar = svg.append('g');
    n.forEach((p, i) => {
      cubuklar.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', y(Math.max(0, p.y))).attr('height', Math.max(1, Math.abs(y(p.y) - y(0)))).attr('rx', 1.5)
        .style('fill', p.y < 0 && s.negatifRenk ? s.negatifRenk : s.renk || 'var(--accent)').style('opacity', i === n.length - 1 ? 1 : 0.78);
      if ((n.length - 1 - i) % her === 0) svg.append('text').attr('x', x(i) + x.bandwidth() / 2).attr('y', H - m.a + 16).attr('text-anchor', 'middle').text(xb(p.x));
    });
    const son = n[n.length - 1];
    svg.append('text').attr('class', 'son-etiket').attr('x', Math.min(W - olc(sonMetin, 11.5, true) / 2 - 2, x(n.length - 1) + x.bandwidth() / 2)).attr('y', son.y >= 0 ? y(son.y) - 5 : y(son.y) + 13)
      .attr('text-anchor', 'middle').style('fill', 'var(--ink)').text(sonMetin);
    const ip = ipucuKur(kap);
    svg.append('rect').attr('x', m.s).attr('y', m.u).attr('width', W - m.s - m.r).attr('height', H - m.u - m.a).style('fill', 'transparent')
      .on('pointermove', (e) => {
        const [mx] = d3.pointer(e);
        const i = Math.max(0, Math.min(n.length - 1, Math.floor((mx - m.s) / x.step())));
        cubuklar.selectAll('rect').style('opacity', (_, j) => (j === i ? 1 : 0.45));
        ip.goster((x(i) + x.bandwidth() / 2) * (kap.clientWidth / W), m.u, s.ipBaslik ? s.ipBaslik(n[i].x) : ayMetin(n[i].x), [{ ad: s.ad || 'Değer', deger: ipB(n[i].y), renk: n[i].y < 0 && s.negatifRenk ? s.negatifRenk : s.renk || 'var(--accent)' }]);
      })
      .on('pointerleave', () => { cubuklar.selectAll('rect').style('opacity', (_, j) => (j === n.length - 1 ? 1 : 0.78)); ip.gizle(); });
    kap.prepend(svg.node());
  }

  // ---------------------------------------------------------------- kıvılcım (özet kutucuklarında)
  function kivilcim(kap, degerler, renk) {
    kap.replaceChildren();
    const v = (degerler || []).filter((d) => !yok(d));
    if (v.length < 2) return;
    const W = Math.max(80, Math.floor(kap.clientWidth || 160)), H = 30;
    const x = d3.scaleLinear().domain([0, v.length - 1]).range([2, W - 4]);
    const [a, b] = d3.extent(v);
    const y = d3.scaleLinear().domain(a === b ? [a - 1, b + 1] : [a, b]).range([H - 3, 3]);
    const svg = yeniSvg(W, H, 'Eğilim');
    svg.attr('aria-hidden', 'true');
    svg.append('path').attr('d', d3.area().x((_, i) => x(i)).y0(H).y1((d) => y(d))(v)).style('fill', renk).style('fill-opacity', 0.1);
    svg.append('path').attr('d', d3.line().x((_, i) => x(i)).y((d) => y(d))(v)).style('fill', 'none').style('stroke', renk).style('stroke-width', 1.6);
    svg.append('circle').attr('cx', x(v.length - 1)).attr('cy', y(v[v.length - 1])).attr('r', 2.6).style('fill', renk);
    kap.append(svg.node());
  }

  // ---------------------------------------------------------------- özet kutucuğu
  // o: {kaynak: 'web'|'resmi'|'yakit'|'trafik', etiket, deger, birim, alt: [metin|öğe], degisim, sinif: 'iyi'|'kotu'|'notr', spark: [sayı], bekliyor}
  function kpi(o) {
    const k = el('div', { class: 'kpi ' + (o.kaynak || '') + (o.bekliyor ? ' bekliyor' : ''), id: o.id || null });
    k.append(el('div', { class: 'kpi-etiket', text: o.etiket }));
    const d = el('div', { class: 'kpi-deger' });
    if (o.bekliyor) d.append(el('span', { class: 'iskelet', style: { width: '62%', height: '26px', marginTop: '3px' } }));
    else { d.append(o.deger == null ? '—' : String(o.deger)); if (o.birim) d.append(el('small', { text: o.birim })); }
    k.append(d);
    const alt = el('div', { class: 'kpi-alt' });
    if (!o.bekliyor) {
      if (o.degisim != null) alt.append(el('span', { class: 'degisim ' + (o.sinif || 'notr'), text: o.degisim }));
      (Array.isArray(o.alt) ? o.alt : [o.alt]).forEach((a) => { if (a != null && a !== '') alt.append(a instanceof Node ? a : el('span', { text: a })); });
    } else if (o.altBekliyor) alt.append(el('span', { text: o.altBekliyor }));
    k.append(alt);
    const sp = el('div', { class: 'kpi-spark' });
    k.append(sp);
    if (o.spark && o.spark.length > 1) requestAnimationFrame(() => kivilcim(sp, o.spark, o.sparkRenk || 'var(--' + (o.kaynak || 'accent') + ')'));
    return k;
  }
  // Artış iyi mi kötü mü: enflasyon, fiyat için artış kötü; güven, hareketlilik için iyi
  const yonSinif = (v, artisIyi) => (yok(v) || Math.abs(v) < 0.005 ? 'notr' : (v > 0) === !!artisIyi ? 'iyi' : 'kotu');
  const seriRenk = (i) => 'var(--s' + ((i % 5) + 1) + ')';
