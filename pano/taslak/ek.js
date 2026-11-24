
  // ================================================================ taslak: sekmeler
  const SEKMELER = ['genel-bakis', 'gruplar', 'cekirdek', 'maddeler', 'araclar', 'veri'];
  function sekmeAc(id, linkle) {
    if (!SEKMELER.includes(id)) id = 'genel-bakis';
    document.querySelectorAll('.wt-sekme-bolum').forEach((s) => { s.hidden = s.id !== id; });
    document.querySelectorAll('.wt-sekmeler button').forEach((b) => {
      const acik = b.getAttribute('data-sekme') === id;
      b.classList.toggle('wt-secili', acik);
      b.setAttribute('aria-selected', acik ? 'true' : 'false');
    });
    if (linkle) dash.setLink(id);
  }
  document.querySelectorAll('.wt-sekmeler button').forEach((b) => b.addEventListener('click', () => sekmeAc(b.getAttribute('data-sekme'), true)));
  const ilkSekme = (location.hash || '').slice(1);
  if (ilkSekme && SEKMELER.includes(ilkSekme)) sekmeAc(ilkSekme, false);

  // ================================================================ taslak: özet kartlarında 12 aylık iz
  dash.draw('kpi-iz', (el) => {
    const a = dash.data('aylik');
    el.replaceChildren();
    if (a.status !== 'ok') return;
    const alan = el.getAttribute('data-alan');
    const rows = a.data.filter((r) => r.seri_kodu === 'TUFE' && r[alan] !== null && r[alan] !== '')
      .sort((x, y) => (x.ay < y.ay ? -1 : 1)).slice(-12);
    if (rows.length < 2) return;
    const W = Math.max(120, Math.floor(el.clientWidth || 160));
    const H = 34;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)
      .attr('role', 'img').attr('aria-label', 'Genel endeks, son 12 ayın ' + (alan === 'yillik_degisim' ? 'yıllık' : 'aylık') + ' değişimi');
    const v = rows.map((r) => Number(r[alan]));
    if (el.getAttribute('data-tur') === 'cubuk') {
      const x = d3.scaleBand().domain(rows.map((r) => r.ay)).range([0, W]).padding(0.25);
      const y = d3.scaleLinear().domain([Math.min(0, d3.min(v)), Math.max(0, d3.max(v))]).range([H - 2, 2]);
      svg.selectAll('rect').data(rows).join('rect')
        .attr('x', (r) => x(r.ay)).attr('width', x.bandwidth())
        .attr('y', (r) => y(Math.max(0, Number(r[alan])))).attr('height', (r) => Math.max(1, Math.abs(y(Number(r[alan])) - y(0))))
        .attr('rx', 1.5).style('fill', dash.colors[0]).style('opacity', (r) => (r.kesin === 'kesin' ? 0.85 : 0.35));
    } else {
      const x = d3.scaleLinear().domain([0, v.length - 1]).range([3, W - 4]);
      const y = d3.scaleLinear().domain(d3.extent(v)).range([H - 4, 4]);
      svg.append('path').attr('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.75)
        .attr('stroke-linejoin', 'round').attr('d', d3.line().x((d, i) => x(i)).y((d) => y(d))(v));
      svg.append('circle').attr('cx', x(v.length - 1)).attr('cy', y(v[v.length - 1])).attr('r', 2.75).style('fill', dash.colors[0]);
    }
  });

  // ================================================================ taslak: yatay çubuk yardımcıları
  const kisalt = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

  dash.draw('ana-grup-grafik', (el) => {
    const d = dash.data('ana_grup_tablosu');
    if (d.status !== 'ok' || !d.data || !d.data.length) { bosYaz(el, d.status); return; }
    el.replaceChildren();
    const rows = d.data.filter((r) => r.yillik_degisim != null).sort((a, b) => b.yillik_degisim - a.yillik_degisim);
    if (!rows.length) { bosYaz(el, 'ok', 'Yıllık değişim için en az bir yıllık veri gerekiyor; ilk değerler Kasım 2027’de.'); return; }
    const W = Math.max(280, Math.floor(el.clientWidth || 600));
    const satir = 26;
    const m = { ust: 20, alt: 24, sag: 58 };
    const H = m.ust + m.alt + rows.length * satir;
    const svg = d3.select(el).append('svg').attr('class', 'wt-svg').attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%').attr('height', H).attr('role', 'img')
      .attr('aria-label', 'Ana harcama gruplarının yıllık değişimi, yüksekten düşüğe');
    const azami = W < 520 ? 20 : 38;
    const etiket = (r) => kisalt(r.ad, azami);
    m.sol = Math.min(W * 0.48, yaziGenisligi(svg, rows.map(etiket)) + 12);
    const genel = rows[0].genel_yillik;
    const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r.yillik_degisim, genel || 0))]).nice(4).range([m.sol, W - m.sag]);
    const y = d3.scaleBand().domain(rows.map((r) => r.kod)).range([m.ust, H - m.alt]).padding(0.28);
    const xT = x.ticks(4);
    svg.append('g').selectAll('line').data(xT).join('line').attr('class', (t) => (t === 0 ? 'wt-sifir' : 'wt-izgara'))
      .attr('x1', (t) => x(t)).attr('x2', (t) => x(t)).attr('y1', m.ust).attr('y2', H - m.alt);
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(xT).join('text')
      .attr('x', (t) => x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text((t) => '%' + f0(t));
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(rows).join('text')
      .attr('x', m.sol - 8).attr('y', (r) => y(r.kod) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .text(etiket);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', x(0)).attr('y', (r) => y(r.kod)).attr('height', y.bandwidth())
      .attr('width', (r) => Math.max(1, x(r.yillik_degisim) - x(0))).attr('rx', 2).style('fill', dash.colors[0]);
    svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'wt-deger-etiket')
      .attr('x', (r) => x(r.yillik_degisim) + 6).attr('y', (r) => y(r.kod) + y.bandwidth() / 2).attr('dy', '0.32em')
      .text((r) => wt.yuzde1(r.yillik_degisim));
    if (genel != null) {
      svg.append('line').attr('class', 'wt-kural').attr('x1', x(genel)).attr('x2', x(genel)).attr('y1', m.ust - 4).attr('y2', H - m.alt);
      svg.append('text').attr('class', 'wt-eksen').attr('x', x(genel)).attr('y', m.ust - 8)
        .attr('text-anchor', x(genel) > W - 90 ? 'end' : 'middle').text('Genel ' + wt.yuzde1(genel));
    }
    const ip = ipucuKur(el);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', 0).attr('width', W).attr('y', (r) => y(r.kod) - (y.step() - y.bandwidth()) / 2).attr('height', y.step())
      .attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev, r) => ip.goster(x(r.yillik_degisim), y(r.kod), r.kod + ' ' + r.ad, [
        { ad: 'Yıllık', deger: wt.yuzde(r.yillik_degisim) },
        { ad: 'Aylık', deger: wt.yuzde(r.aylik_degisim) },
        { ad: 'Ağırlık', deger: f2(r.agirlik) },
      ], W))
      .on('pointerleave', () => ip.gizle());
  });

  // ================================================================ taslak: iki yönlü fiyat hareketleri
  dash.draw('hareket-grafik', (el) => {
    const d = dash.data('son_degisimler');
    if (d.status !== 'ok' || !d.data) { bosYaz(el, d.status); return; }
    el.replaceChildren();
    const alan = wt.hDonem;
    const liste = d.data.filter((r) => r.duzey === wt.hDuzey && r[alan] !== null && r[alan] !== '')
      .map((r) => ({ kod: r.seri_kodu, ad: r.seri_adi, v: Number(r[alan]), g: sayi(r.gunluk), a: sayi(r.aylik), y: sayi(r.yillik) }))
      .sort((a, b) => b.v - a.v);
    if (!liste.length) { el.textContent = 'Gösterilecek değişim yok.'; return; }
    const ust = liste.slice(0, 10);
    const alt = liste.slice(-10).filter((r) => !ust.includes(r));
    const rows = [...ust, ...alt];
    const W = Math.max(280, Math.floor(el.clientWidth || 600));
    const satir = 24;
    const ara = alt.length ? 14 : 0;
    const m = { ust: 6, alt: 24, sag: 70 };
    const H = m.ust + m.alt + rows.length * satir + ara;
    const svg = d3.select(el).append('svg').attr('class', 'wt-svg').attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%').attr('height', H).attr('role', 'img')
      .attr('aria-label', 'En çok artan ve düşen 10 kalem, ' + ({ gunluk: 'günlük', aylik: 'aylık', yillik: 'yıllık' })[alan] + ' değişim');
    const azami = W < 520 ? 20 : 34;
    const etiket = (r) => kisalt(r.ad, azami);
    m.sol = Math.min(W * 0.46, yaziGenisligi(svg, rows.map(etiket)) + 12);
    const x = d3.scaleLinear().domain([Math.min(0, d3.min(rows, (r) => r.v)), Math.max(0, d3.max(rows, (r) => r.v))]).nice(4)
      .range([m.sol, W - m.sag]);
    const yKonum = (i) => m.ust + i * satir + (i >= ust.length ? ara : 0);
    const bant = satir * 0.68;
    const xT = x.ticks(4);
    svg.append('g').selectAll('line').data(xT).join('line').attr('class', (t) => (t === 0 ? 'wt-sifir' : 'wt-izgara'))
      .attr('x1', (t) => x(t)).attr('x2', (t) => x(t)).attr('y1', m.ust).attr('y2', H - m.alt);
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(xT).join('text')
      .attr('x', (t) => x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text((t) => (t < 0 ? '−%' : '%') + f0(Math.abs(t)));
    if (ara) {
      const yA = yKonum(ust.length) - ara / 2 - (satir - bant) / 2;
      svg.append('line').attr('class', 'wt-ayirac').attr('x1', 0).attr('x2', W).attr('y1', yA).attr('y2', yA);
    }
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(rows).join('text')
      .attr('x', m.sol - 8).attr('y', (r, i) => yKonum(i) + bant / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(etiket);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (r) => x(Math.min(0, r.v))).attr('y', (r, i) => yKonum(i)).attr('height', bant)
      .attr('width', (r) => Math.max(1, Math.abs(x(r.v) - x(0)))).attr('rx', 2)
      .style('fill', (r) => (r.v > 0 ? 'var(--color-bad)' : 'var(--color-ok)'));
    svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'wt-deger-etiket')
      .attr('x', W - 4).attr('y', (r, i) => yKonum(i) + bant / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .text((r) => wt.isaretli(r.v));
    const ip = ipucuKur(el);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', 0).attr('width', W).attr('y', (r, i) => yKonum(i) - (satir - bant) / 2).attr('height', satir).attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev, r) => {
        const i = rows.indexOf(r);
        ip.goster(Math.max(x(r.v), x(0)), yKonum(i) + bant / 2, r.ad, [
          { ad: 'Günlük', deger: wt.isaretli(r.g) },
          { ad: 'Aylık', deger: wt.isaretli(r.a) },
          { ad: 'Yıllık', deger: wt.isaretli(r.y) },
        ], W);
      })
      .on('pointerleave', () => ip.gizle());
  });

  // ================================================================ taslak: gösterge kartları
  dash.draw('ozel-kartlar', (el) => {
    const d = dash.data('ozel_tablo');
    const a = dash.data('aylik');
    el.replaceChildren();
    if (d.status !== 'ok' || !d.data) { el.textContent = d.status === 'error' ? 'Yüklenemedi' : '—'; return; }
    const gecmis = new Map();
    if (a.status === 'ok') {
      const kume = new Set([...new Set(a.data.map((r) => r.ay))].sort().slice(-12));
      a.data.forEach((r) => {
        if (!kume.has(r.ay) || (r.duzey !== 'ozel' && r.duzey !== 'genel') || r.yillik_degisim === null || r.yillik_degisim === '') return;
        if (!gecmis.has(r.seri_kodu)) gecmis.set(r.seri_kodu, []);
        gecmis.get(r.seri_kodu).push({ ay: r.ay, v: Number(r.yillik_degisim) });
      });
    }
    const isaretli = (alan, kod, metin, sinif) => {
      const s = document.createElement('span');
      s.setAttribute('data-source', 'ozel_tablo');
      s.setAttribute('data-field', alan);
      s.setAttribute('data-where', 'kod=' + encodeURIComponent(kod));
      if (sinif) s.className = sinif;
      s.textContent = metin;
      return s;
    };
    d.data.forEach((r) => {
      const kart = document.createElement('div');
      kart.className = 'wt-gosterge' + (r.kod === 'TUFE' ? ' wt-vurgu' : '');
      kart.id = 'gosterge-' + r.kod.toLowerCase();
      const parca = r.ad.split(':');
      const bas = document.createElement('span');
      bas.className = 'wt-gosterge-bas';
      bas.textContent = parca.length > 1 ? 'TÜFE ' + parca[0].trim() : r.ad;
      const ad = document.createElement('span');
      ad.className = 'wt-gosterge-ad';
      ad.textContent = parca.length > 1 ? parca.slice(1).join(':').trim() : (r.kod === 'TUFE' ? 'Tüm sepet' : '');
      const deger = isaretli('yillik_degisim', r.kod, wt.yuzde(r.yillik_degisim), 'wt-gosterge-deger');
      const alt = document.createElement('span');
      alt.className = 'wt-gosterge-alt';
      const aylik = document.createElement('span');
      aylik.append(document.createTextNode('aylık '), isaretli('aylik_degisim', r.kod, wt.yuzde(r.aylik_degisim)));
      const fark = document.createElement('span');
      const sinif = r.yillik_fark == null ? '' : r.yillik_fark < 0 ? 'wt-iyi' : r.yillik_fark > 0 ? 'wt-kotu' : '';
      fark.append(isaretli('yillik_fark', r.kod, wt.puan(r.yillik_fark), sinif), document.createTextNode(' puan'));
      alt.append(aylik, fark);
      kart.append(bas, ad, deger, alt);
      const noktalar = (gecmis.get(r.kod) || []).sort((x, y) => (x.ay < y.ay ? -1 : 1));
      if (noktalar.length > 1) {
        const kap = document.createElement('span');
        kap.setAttribute('data-source', 'aylik');
        const w = 180, h = 30;
        const x = d3.scaleLinear().domain([0, noktalar.length - 1]).range([2, w - 4]);
        const y = d3.scaleLinear().domain(d3.extent(noktalar, (p) => p.v)).range([h - 3, 3]);
        const svg = d3.select(kap).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%').attr('height', h)
          .attr('preserveAspectRatio', 'none').attr('role', 'img').attr('aria-label', bas.textContent + ': son 12 ayın yıllık değişimi');
        svg.append('path').attr('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.5)
          .attr('vector-effect', 'non-scaling-stroke')
          .attr('d', d3.line().x((p, i) => x(i)).y((p) => y(p.v))(noktalar));
        kart.append(kap);
      }
      el.append(kart);
    });
  });
