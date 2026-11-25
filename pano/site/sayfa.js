
(function () {
  const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const yerel = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ' ₺'] });
  const f2 = yerel.format(',.2f');
  const f1 = yerel.format(',.1f');
  const f0 = yerel.format(',.0f');
  const tarihOku = d3.utcParse('%Y-%m-%d');
  const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const ayTarih = (ay) => { const [y, m] = ay.split('-'); return new Date(Date.UTC(Number(y), Number(m) - 1, 1)); };

  const wt = (window.wt = window.wt || {});
  wt.aralik = wt.aralik ?? '0';
  wt.gorunum = wt.gorunum ?? 'endeks';
  wt.karsilastir = wt.karsilastir ?? 'TUFE_C';
  wt.madde = wt.madde ?? '0117241';
  wt.hgFiltre = wt.hgFiltre ?? '';
  wt.isiDuzey = wt.isiDuzey ?? 'ana_grup';
  wt.hDonem = wt.hDonem ?? 'aylik';
  wt.hDuzey = wt.hDuzey ?? 'madde';
  wt.kisisel = wt.kisisel || null;
  wt.yuzde = (v) => (v == null || isNaN(v) ? '—' : (v < 0 ? '−%' + f2(-v) : '%' + f2(v)));
  wt.yuzde1 = (v) => (v == null || isNaN(v) ? '—' : (v < 0 ? '−%' + f1(-v) : '%' + f1(v)));
  wt.isaretli = (v) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+%' : v < 0 ? '−%' : '%') + f2(Math.abs(v)));
  wt.puan = (v) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + f2(Math.abs(v)));
  wt.ayAdi = (ay) => { if (!ay) return '—'; const [y, m] = ay.split('-'); return AY[Number(m) - 1] + ' ' + y; };
  wt.ayKisa = (ay) => { const [y, m] = ay.split('-'); return AYK[Number(m) - 1] + ' ' + y.slice(2); };
  wt.tarihMetin = (s) => { const d = tarihOku(s); return d ? d.getUTCDate() + ' ' + AYK[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : '—'; };

  // ---------------------------------------------------------------- hesaplar
  dash.calc('ozet', {
    inputs: ['aylik', 'gunluk'],
    title: 'Özet: genel endeks',
    description: 'Genel endeksin son ay ve son gün değerleri; yıllık değişimin önceki aya göre farkı; baz gününden (= 100) bu yana değişim.',
    fn: (aylik, gunluk) => {
      const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const genel = aylik.filter((r) => r.seri_kodu === 'TUFE').sort((a, b) => (a.ay < b.ay ? -1 : 1));
      const g = gunluk.filter((r) => r.seri_kodu === 'TUFE').sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
      if (!genel.length || !g.length) return [];
      const son = genel[genel.length - 1];
      // Veri yeni başladığında önceki ay yoktur
      const onceki = genel.length > 1 ? genel[genel.length - 2] : {};
      const sg = g[g.length - 1];
      const fark = sayi(son.yillik_degisim) == null || sayi(onceki.yillik_degisim) == null ? null
        : Math.round((sayi(son.yillik_degisim) - sayi(onceki.yillik_degisim)) * 100) / 100;
      return [{
        ay: son.ay, durum: son.kesin, gun: sayi(son.gun),
        aylik_degisim: sayi(son.aylik_degisim), yillik_degisim: sayi(son.yillik_degisim), yillik_fark: fark,
        onceki_ay: onceki.ay ?? null, onceki_aylik_degisim: sayi(onceki.aylik_degisim), onceki_durum: onceki.kesin ?? null,
        son_gun: sg.tarih, endeks: sayi(sg.endeks), gunluk_degisim: sayi(sg.gunluk_degisim),
        // Baz günü (ilk toplama günü) = 100; yıllık veri birikene kadar açılışta bu gösterilir
        baz_tarihi: g[0].tarih, aylik_endeks: sayi(son.endeks),
        baslangictan: sayi(sg.endeks) == null ? null : Math.round((sayi(sg.endeks) - 100) * 100) / 100,
      }];
    },
  });

  dash.calc('gunluk_yillik', {
    inputs: ['gunluk'],
    title: 'Günlük yıllık değişim: yıl içi aralık',
    description: 'Genel endeksin günlük yıllık değişiminin son veri yılı içindeki en düşük, en yüksek ve son değeri.',
    fn: (gunluk) => {
      const g = gunluk.filter((r) => r.seri_kodu === 'TUFE' && r.yillik_degisim !== null && r.yillik_degisim !== '')
        .map((r) => ({ tarih: r.tarih, v: Number(r.yillik_degisim) })).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
      if (!g.length) return [];
      const yil = g[g.length - 1].tarih.slice(0, 4);
      const bu = g.filter((r) => r.tarih.slice(0, 4) === yil);
      const enDusuk = bu.reduce((m, r) => (r.v < m.v ? r : m), bu[0]);
      const enYuksek = bu.reduce((m, r) => (r.v > m.v ? r : m), bu[0]);
      return [{
        yil, en_dusuk: enDusuk.v, en_dusuk_tarih: enDusuk.tarih, en_yuksek: enYuksek.v, en_yuksek_tarih: enYuksek.tarih,
        son: g[g.length - 1].v, son_tarih: g[g.length - 1].tarih,
      }];
    },
  });

  dash.calc('ana_grup_tablosu', {
    inputs: ['aylik', 'agirliklar'],
    title: 'Ana gruplar: son ay',
    description: 'Her ana harcama grubunun son aydaki aylık ve yıllık değişimi, TÜİK 2026 sepetindeki ağırlığı ve genel endeksin yıllık değişimi.',
    fn: (aylik, agirliklar) => {
      const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const sonAy = aylik.reduce((m, r) => (r.ay > m ? r.ay : m), '');
      const agirlik = {};
      agirliklar.forEach((r) => { agirlik[r.ana_grup_kodu] = (agirlik[r.ana_grup_kodu] || 0) + Number(r.agirlik); });
      const genel = aylik.find((r) => r.seri_kodu === 'TUFE' && r.ay === sonAy);
      return aylik.filter((r) => r.duzey === 'ana_grup' && r.ay === sonAy)
        .sort((a, b) => (a.seri_kodu < b.seri_kodu ? -1 : 1))
        .map((r) => ({
          kod: r.seri_kodu, ad: r.seri_adi, ay: r.ay,
          agirlik: Math.round((agirlik[r.seri_kodu] || 0) * 100) / 100,
          aylik_degisim: sayi(r.aylik_degisim), yillik_degisim: sayi(r.yillik_degisim),
          genel_yillik: genel ? sayi(genel.yillik_degisim) : null,
          genel_aylik: genel ? sayi(genel.aylik_degisim) : null,
        }));
    },
  });

  dash.calc('harcama_gruplari', {
    inputs: ['aylik', 'agirliklar'],
    title: 'Harcama grupları: son ay',
    description: 'COICOP 2018 harcama gruplarının son aydaki aylık ve yıllık değişimi ile TÜİK 2026 ağırlığı.',
    fn: (aylik, agirliklar) => {
      const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const sonAy = aylik.reduce((m, r) => (r.ay > m ? r.ay : m), '');
      const agirlik = {};
      agirliklar.forEach((r) => { agirlik[r.grup_kodu] = (agirlik[r.grup_kodu] || 0) + Number(r.agirlik); });
      return aylik.filter((r) => r.duzey === 'grup' && r.ay === sonAy)
        .sort((a, b) => (a.seri_kodu < b.seri_kodu ? -1 : 1))
        .map((r) => ({
          kod: r.seri_kodu, ad: r.seri_adi, ana_grup_kodu: r.seri_kodu.slice(0, 2),
          agirlik: Math.round((agirlik[r.seri_kodu] || 0) * 100) / 100,
          aylik_degisim: sayi(r.aylik_degisim), yillik_degisim: sayi(r.yillik_degisim),
        }));
    },
  });

  dash.calc('ozel_tablo', {
    inputs: ['aylik'],
    title: 'Özel göstergeler: son ay',
    description: 'Genel endeks ve özel kapsamlı göstergelerin son aydaki aylık ve yıllık değişimi; yıllık değişimin önceki aya göre farkı.',
    fn: (aylik) => {
      const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const aylar = [...new Set(aylik.map((r) => r.ay))].sort();
      const sonAy = aylar[aylar.length - 1];
      const oncekiAy = aylar[aylar.length - 2];
      const onceki = {};
      aylik.forEach((r) => { if (r.ay === oncekiAy) onceki[r.seri_kodu] = sayi(r.yillik_degisim); });
      const sira = ['TUFE', 'TUFE_B', 'TUFE_C', 'TUFE_D', 'TUFE_E', 'MALLAR', 'HIZMET', 'TEMEL_MALLAR', 'ENERJI', 'GIDA', 'ISLENMIS_GIDA', 'ISLENMEMIS_GIDA', 'TAZE_MS', 'MEVSIMLIK_HARIC'];
      return aylik.filter((r) => (r.duzey === 'ozel' || r.duzey === 'genel') && r.ay === sonAy)
        .sort((a, b) => sira.indexOf(a.seri_kodu) - sira.indexOf(b.seri_kodu))
        .map((r) => {
          const y = sayi(r.yillik_degisim);
          const o = onceki[r.seri_kodu];
          return {
            kod: r.seri_kodu, ad: r.seri_adi, aylik_degisim: sayi(r.aylik_degisim), yillik_degisim: y,
            yillik_fark: y == null || o == null ? null : Math.round((y - o) * 100) / 100,
          };
        });
    },
  });

  dash.calc('ana_egilim', {
    inputs: ['aylik', 'agirliklar'],
    title: 'Ana eğilim ölçüleri',
    description: 'Her ay genel endeks, TÜFE B ve C ile maddelerin aylık değişimlerinin ağırlıklı medyanı ve alt-üst %10 budanmış ağırlıklı ortalaması.',
    fn: (aylik, agirliklar) => {
      const w = {};
      agirliklar.forEach((r) => { w[r.madde_kodu] = Number(r.agirlik); });
      const aylar = {};
      aylik.forEach((r) => {
        if (r.aylik_degisim === null || r.aylik_degisim === '') return;
        const a = (aylar[r.ay] = aylar[r.ay] || { maddeler: [] });
        const v = Number(r.aylik_degisim);
        if (r.duzey === 'madde' && w[r.seri_kodu]) a.maddeler.push({ v, w: w[r.seri_kodu] });
        if (r.seri_kodu === 'TUFE') a.genel = v;
        if (r.seri_kodu === 'TUFE_B') a.b = v;
        if (r.seri_kodu === 'TUFE_C') a.c = v;
      });
      return Object.keys(aylar).sort().filter((ay) => aylar[ay].maddeler.length).map((ay) => {
        const m = aylar[ay].maddeler.sort((x, y) => x.v - y.v);
        const toplam = m.reduce((s, x) => s + x.w, 0);
        let birikim = 0;
        let medyan = null;
        let pay = 0;
        let agirlik = 0;
        m.forEach((x) => {
          const orta = (birikim + x.w / 2) / toplam;
          if (medyan === null && birikim + x.w >= toplam / 2) medyan = x.v;
          if (orta >= 0.10 && orta <= 0.90) { pay += x.v * x.w; agirlik += x.w; }
          birikim += x.w;
        });
        const yuvarla = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
        return {
          ay, genel: yuvarla(aylar[ay].genel), b: yuvarla(aylar[ay].b), c: yuvarla(aylar[ay].c),
          medyan: yuvarla(medyan), budanmis: yuvarla(agirlik ? pay / agirlik : null),
        };
      });
    },
  });

  dash.calc('yayginlik', {
    inputs: ['aylik', 'agirliklar'],
    title: 'Fiyat artış yaygınlığı',
    description: 'Her ay aylık değişimi sıfırdan büyük ve küçük olan maddelerin oranı ile fiyatı artan maddelerin sepet ağırlığındaki payı.',
    fn: (aylik, agirliklar) => {
      const w = {};
      agirliklar.forEach((r) => { w[r.madde_kodu] = Number(r.agirlik); });
      const aylar = {};
      aylik.forEach((r) => {
        if (r.duzey !== 'madde' || r.aylik_degisim === null || r.aylik_degisim === '') return;
        const a = (aylar[r.ay] = aylar[r.ay] || { n: 0, artan: 0, dusen: 0, w: 0, wArtan: 0, kesin: r.kesin });
        const v = Number(r.aylik_degisim);
        a.n += 1; a.w += w[r.seri_kodu] || 0;
        if (v > 0) { a.artan += 1; a.wArtan += w[r.seri_kodu] || 0; }
        if (v < 0) a.dusen += 1;
      });
      return Object.keys(aylar).sort().map((ay) => {
        const a = aylar[ay];
        return {
          ay, kesin: a.kesin, madde: a.n,
          artan_oran: Math.round((a.artan / a.n) * 1000) / 10,
          dusen_oran: Math.round((a.dusen / a.n) * 1000) / 10,
          agirlikli_artan: Math.round((a.wArtan / a.w) * 1000) / 10,
        };
      });
    },
  });

  dash.calc('agirlik_ozet', {
    inputs: ['agirliklar'],
    title: 'Ana grup ağırlıkları ve gerçek veri kapsamı',
    description: 'TÜİK 2026 sepetinde ana grupların ağırlığı, madde sayısı ve market eşleme kuralı yazılmış maddelerin ağırlığı.',
    fn: (agirliklar) => {
      const g = {};
      agirliklar.forEach((r) => {
        const x = (g[r.ana_grup_kodu] = g[r.ana_grup_kodu] || { kod: r.ana_grup_kodu, ad: r.ana_grup_adi, madde: 0, agirlik: 0, kapsanan_agirlik: 0 });
        x.madde += 1;
        x.agirlik += Number(r.agirlik);
        if (r.market_kurali === 'evet') x.kapsanan_agirlik += Number(r.agirlik);
      });
      return Object.values(g).sort((a, b) => (a.kod < b.kod ? -1 : 1)).map((x) => ({
        ...x, agirlik: Math.round(x.agirlik * 100) / 100, kapsanan_agirlik: Math.round(x.kapsanan_agirlik * 100) / 100,
      }));
    },
  });

  dash.calc('gozlem_ozet', {
    inputs: ['gozlem'],
    title: 'Gözlem özeti',
    description: 'Gün sayısı, günlük ortalama gözlem, ayıklanan hatalı fiyatlar ve toplama yapılmayan günler.',
    fn: (gozlem) => {
      if (!gozlem.length) return [];
      const gunler = gozlem.map((r) => r.tarih).sort();
      const eksik = [];
      for (let i = 1; i < gunler.length; i++) {
        const a = Date.parse(gunler[i - 1] + 'T00:00:00Z');
        const b = Date.parse(gunler[i] + 'T00:00:00Z');
        for (let t = a + 864e5; t < b; t += 864e5) eksik.push(new Date(t).toISOString().slice(0, 10));
      }
      const toplam = gozlem.reduce((s, r) => s + Number(r.gozlem), 0);
      return [{
        gun: gozlem.length,
        ortalama_gozlem: Math.round(toplam / gozlem.length),
        toplam_aykiri: gozlem.reduce((s, r) => s + Number(r.aykiri), 0),
        eksik_gun: eksik.length,
        eksik_gunler: eksik.join(', '),
      }];
    },
  });

  dash.calc('kapsam', {
    inputs: ['agirliklar'],
    title: 'Sepet ve gerçek veri kapsamı',
    description: 'TÜİK 2026 sepetindeki madde ve alt sınıf sayısı; market eşleme kuralı yazılmış maddelerin sayısı ve sepet ağırlığındaki payı.',
    fn: (agirliklar) => {
      const kurali = agirliklar.filter((r) => r.market_kurali === 'evet');
      return [{
        toplam_madde: agirliklar.length,
        alt_sinif: new Set(agirliklar.map((r) => r.alt_sinif_kodu)).size,
        madde: kurali.length,
        agirlik: Math.round(kurali.reduce((s, r) => s + Number(r.agirlik), 0) * 100) / 100,
      }];
    },
  });

  // ---------------------------------------------------------------- yardımcılar
  function yaziGenisligi(svg, metinler) {
    const g = svg.append('g').attr('class', 'wt-eksen');
    let en = 0;
    metinler.forEach((m) => { const t = g.append('text').text(m); en = Math.max(en, t.node().getComputedTextLength()); });
    g.remove();
    return en;
  }

  function ipucuKur(el) {
    const ip = d3.select(el).append('div').attr('class', 'wt-ipucu').attr('hidden', '');
    return {
      goster(x, y, bas, satirlar, W) {
        ip.attr('hidden', null);
        ip.selectAll('*').remove();
        ip.append('div').attr('class', 'wt-ip-bas').text(bas);
        satirlar.forEach((s) => {
          const r = ip.append('div').attr('class', 'wt-ip-satir');
          const a = r.append('span');
          if (s.renk) a.append('i').style('display', 'inline-block').style('width', '8px').style('height', '8px').style('border-radius', '50%').style('margin-right', '6px').style('background', s.renk);
          a.append('span').text(s.ad);
          r.append('span').text(s.deger);
        });
        const w = ip.node().offsetWidth;
        const h = ip.node().offsetHeight;
        const sol = x + 14 + w > W ? Math.max(0, x - 14 - w) : x + 14;
        ip.style('left', sol + 'px').style('top', Math.max(0, y - h / 2) + 'px');
      },
      gizle() { ip.attr('hidden', ''); },
    };
  }

  function bosYaz(el, durum, mesaj) {
    el.replaceChildren();
    if (mesaj && durum === 'ok') {
      const p = document.createElement('p');
      p.className = 'wt-bos';
      p.textContent = mesaj;
      el.append(p);
      return;
    }
    el.textContent = durum === 'error' ? 'Yüklenemedi' : '—';
  }

  wt.cizgi = function (el, seriler, o) {
    el.replaceChildren();
    const W = Math.max(260, Math.floor(el.clientWidth || 600));
    const H = o.yukseklik || 260;
    const tum = seriler.flatMap((s) => s.noktalar).filter((d) => d.v != null && !isNaN(d.v));
    const svg = d3.select(el).append('svg').attr('class', 'wt-svg').attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%').attr('height', H).attr('role', 'img').attr('aria-label', o.etiket);
    if (!tum.length) { d3.select(el).append('p').attr('class', 'wt-bos').text('Bu aralıkta veri yok.'); return; }
    const x = d3.scaleUtc().domain(d3.extent(tum, (d) => d.t));
    const [a, b] = d3.extent(tum, (d) => d.v);
    const pay = (b - a) * 0.06 || 1;
    const y = d3.scaleLinear().domain([o.sifirdan ? Math.min(0, a) : a - pay, b + pay]).nice(5);
    const yT = y.ticks(5);
    const m = { ust: 10, sag: 14, alt: 26, sol: yaziGenisligi(svg, yT.map(o.yBicim)) + 12 };
    x.range([m.sol, W - m.sag]);
    y.range([H - m.alt, m.ust]);
    svg.append('g').selectAll('line').data(yT).join('line').attr('class', (d) => (d === 0 && o.sifirCizgisi ? 'wt-sifir' : 'wt-izgara'))
      .attr('x1', m.sol).attr('x2', W - m.sag).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(yT).join('text')
      .attr('x', m.sol - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(o.yBicim);
    const gunAraligi = (x.domain()[1] - x.domain()[0]) / 864e5;
    const kisa = gunAraligi <= 120;
    const xT = kisa ? x.ticks(Math.max(2, Math.min(6, Math.floor((W - m.sol - m.sag) / 80))))
      : x.ticks(d3.utcMonth.every(Math.max(1, Math.ceil(gunAraligi / 30 / Math.max(2, Math.floor((W - m.sol - m.sag) / 70))))));
    const xBicim = kisa ? (d) => d.getUTCDate() + ' ' + AYK[d.getUTCMonth()]
      : (d) => AYK[d.getUTCMonth()] + (d.getUTCMonth() === 0 || xT.indexOf(d) === 0 ? ' ' + String(d.getUTCFullYear()).slice(2) : '');
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(xT).join('text')
      .attr('x', (d) => x(d)).attr('y', H - 6)
      .attr('text-anchor', (d) => (x(d) - m.sol < 24 ? 'start' : W - m.sag - x(d) < 24 ? 'end' : 'middle'))
      .text(xBicim);
    const cizgi = d3.line().x((d) => x(d.t)).y((d) => y(d.v)).defined((d) => d.v != null && !isNaN(d.v));
    seriler.forEach((s) => {
      svg.append('path').attr('fill', 'none').style('stroke', s.renk).attr('stroke-width', s.kalin || 1.75)
        .attr('stroke-linejoin', 'round').attr('d', cizgi(s.noktalar));
      const son = [...s.noktalar].reverse().find((d) => d.v != null && !isNaN(d.v));
      if (son) svg.append('circle').attr('cx', x(son.t)).attr('cy', y(son.v)).attr('r', 3.5).style('fill', s.renk);
    });
    const kural = svg.append('line').attr('class', 'wt-kural').attr('y1', m.ust).attr('y2', H - m.alt).style('opacity', 0);
    const isaret = seriler.map((s) => svg.append('circle').attr('r', 4).style('fill', s.renk).style('opacity', 0));
    const ip = ipucuKur(el);
    const ref = seriler[0].noktalar.filter((d) => d.v != null && !isNaN(d.v));
    const bis = d3.bisector((d) => d.t).center;
    const haritalar = seriler.map((s) => new Map(s.noktalar.map((d) => [+d.t, d.v])));
    svg.append('rect').attr('x', m.sol).attr('y', m.ust).attr('width', W - m.sol - m.sag).attr('height', H - m.ust - m.alt)
      .attr('fill', 'transparent').style('cursor', 'crosshair')
      .on('pointermove', (ev) => {
        if (!ref.length) return;
        const [px] = d3.pointer(ev);
        const d = ref[bis(ref, x.invert(px))];
        if (!d) return;
        const cx = x(d.t);
        kural.attr('x1', cx).attr('x2', cx).style('opacity', 1);
        const satir = [];
        seriler.forEach((s, i) => {
          const v = haritalar[i].get(+d.t);
          if (v == null || isNaN(v)) { isaret[i].style('opacity', 0); return; }
          isaret[i].attr('cx', cx).attr('cy', y(v)).style('opacity', 1);
          satir.push({ ad: s.ad, deger: o.ipBicim(v), renk: s.renk });
        });
        ip.goster(cx, y(d.v), o.ipBaslik(d.t), satir, W);
      })
      .on('pointerleave', () => { kural.style('opacity', 0); isaret.forEach((c) => c.style('opacity', 0)); ip.gizle(); });
  };

  wt.cubuk = function (el, satirlar, o) {
    el.replaceChildren();
    const W = Math.max(260, Math.floor(el.clientWidth || 600));
    const H = o.yukseklik || 220;
    const svg = d3.select(el).append('svg').attr('class', 'wt-svg').attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%').attr('height', H).attr('role', 'img').attr('aria-label', o.etiket);
    const veri = satirlar.filter((r) => r.v != null && !isNaN(r.v));
    if (!veri.length) { d3.select(el).append('p').attr('class', 'wt-bos').text('Gösterilecek değişim yok.'); return; }
    const yBicim = o.yBicim || wt.yuzde;
    const yMin = Math.min(0, d3.min(veri, (r) => r.v));
    const yMax = Math.max(0, o.yUst ?? d3.max(veri, (r) => r.v));
    const y = d3.scaleLinear().domain([yMin, yMax]).nice(4);
    const yT = y.ticks(4);
    const m = { ust: 18, sag: 8, alt: 26, sol: yaziGenisligi(svg, yT.map(yBicim)) + 12 };
    const x = d3.scaleBand().domain(veri.map((r) => r.anahtar)).range([m.sol, W - m.sag]).padding(0.22);
    y.range([H - m.alt, m.ust]);
    svg.append('g').selectAll('line').data(yT).join('line').attr('class', (d) => (d === 0 ? 'wt-sifir' : 'wt-izgara'))
      .attr('x1', m.sol).attr('x2', W - m.sag).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.append('g').attr('class', 'wt-eksen').selectAll('text').data(yT).join('text')
      .attr('x', m.sol - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(yBicim);
    if (o.referans != null) {
      svg.append('line').attr('class', 'wt-kural').attr('x1', m.sol).attr('x2', W - m.sag).attr('y1', y(o.referans)).attr('y2', y(o.referans));
    }
    const renk = dash.colors[0];
    svg.append('g').selectAll('rect').data(veri).join('rect')
      .attr('x', (r) => x(r.anahtar)).attr('width', x.bandwidth())
      .attr('y', (r) => y(Math.max(0, r.v))).attr('height', (r) => Math.max(1, Math.abs(y(r.v) - y(0))))
      .attr('rx', 2).style('fill', renk).style('opacity', (r) => (r.soluk ? 0.4 : 1));
    const adim = Math.max(1, Math.ceil(46 / x.step()));
    svg.append('g').attr('class', 'wt-eksen').selectAll('text')
      .data(veri.filter((r, i) => (veri.length - 1 - i) % adim === 0)).join('text')
      .attr('x', (r) => x(r.anahtar) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((r) => r.kisa);
    if (x.bandwidth() >= 30) {
      svg.append('g').selectAll('text').data(veri).join('text').attr('class', 'wt-deger-etiket')
        .attr('x', (r) => x(r.anahtar) + x.bandwidth() / 2)
        .attr('y', (r) => (r.v >= 0 ? y(r.v) - 4 : y(r.v) + 12)).attr('text-anchor', 'middle').text((r) => f1(r.v));
    }
    const ip = ipucuKur(el);
    svg.append('g').selectAll('rect').data(veri).join('rect')
      .attr('x', (r) => x(r.anahtar) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
      .attr('y', m.ust).attr('height', H - m.ust - m.alt).attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev, r) => ip.goster(x(r.anahtar) + x.bandwidth() / 2, y(r.v), r.etiket, r.ipucu, W))
      .on('pointerleave', () => ip.gizle());
  };

  function aylikSatirlar(rows) {
    return rows.map((r) => ({
      anahtar: r.ay, kisa: wt.ayKisa(r.ay), v: sayi(r.aylik_degisim), soluk: r.kesin !== 'kesin', etiket: wt.ayAdi(r.ay),
      ipucu: [
        { ad: 'Aylık', deger: wt.yuzde(sayi(r.aylik_degisim)) },
        { ad: 'Yıllık', deger: wt.yuzde(sayi(r.yillik_degisim)) },
        { ad: 'Durum', deger: r.kesin === 'kesin' ? 'kesin' : 'geçici · ' + r.gun + ' gün' },
      ],
    }));
  }

  // ---------------------------------------------------------------- düğmeler ve girdiler
  function dugmeGrubu(kimlik, nitelik, durum, cizimler) {
    document.querySelectorAll('#' + kimlik + ' button').forEach((d) => {
      d.addEventListener('click', () => {
        wt[durum] = d.getAttribute(nitelik);
        document.querySelectorAll('#' + kimlik + ' button').forEach((x) => x.classList.toggle('wt-secili', x === d));
        cizimler.forEach((c) => dash.draw(c));
      });
    });
  }
  dugmeGrubu('aralik', 'data-aralik', 'aralik', ['gunluk-grafik']);
  dugmeGrubu('gorunum', 'data-gorunum', 'gorunum', ['gunluk-grafik']);
  dugmeGrubu('isi-duzey', 'data-duzey', 'isiDuzey', ['isi-haritasi']);
  dugmeGrubu('hareket-duzey', 'data-duzey', 'hDuzey', ['hareket-grafik']);
  document.querySelectorAll('#hareket-donem button').forEach((d) => {
    d.addEventListener('click', () => {
      wt.hDonem = d.getAttribute('data-donem');
      document.querySelectorAll('#hareket-donem button').forEach((x) => x.classList.toggle('wt-secili', x === d));
      dash.draw('hareket-grafik');
    });
  });
  document.querySelectorAll('#hesap-tutar').forEach((g) => g.addEventListener('input', () => dash.draw('hesap-sonuc')));
  document.querySelectorAll('#kisisel-sifirla').forEach((d) => d.addEventListener('click', () => {
    wt.kisisel = null;
    dash.draw('kisisel-satirlar');
    dash.draw('kisisel-sonuc');
  }));

  // ---------------------------------------------------------------- küçük çizimler
  const BICIM = {
    yuzde: (v) => wt.yuzde(sayi(v)),
    'yuzde-1': (v) => wt.yuzde1(sayi(v)),
    'isaretli-yuzde': (v) => wt.isaretli(sayi(v)),
    puan: (v) => wt.puan(sayi(v)),
    'puan-mutlak': (v) => (sayi(v) == null ? '—' : f2(Math.abs(sayi(v)))),
    ay: (v) => wt.ayAdi(v),
    tarih: (v) => wt.tarihMetin(v),
    duz: (v) => (v == null ? '—' : String(v)),
    endeks: (v) => (sayi(v) == null ? '—' : f2(sayi(v))),
    sayi: (v) => (sayi(v) == null ? '—' : f0(sayi(v))),
    gun: (v) => (sayi(v) == null ? '—' : sayi(v) + ' gün'),
    'durum-metin': (v) => (v === 'kesin' ? 'kesinleşti' : v ? 'geçici (ay 24\'ünde kesinleşir)' : '—'),
    'tarih-listesi': (v) => (v ? String(v).split(', ').map(wt.tarihMetin).join(', ') : 'yok'),
  };

  function satirOku(el) {
    const d = dash.data(el.getAttribute('data-source'));
    return d.status === 'ok' && Array.isArray(d.data) ? d.data[Number(el.getAttribute('data-row') || 0)] : null;
  }

  dash.draw('alan', (el) => {
    const satir = satirOku(el);
    if (!satir) { el.textContent = '—'; return; }
    const v = satir[el.getAttribute('data-field')];
    el.textContent = (BICIM[el.getAttribute('data-bicim')] || String)(v);
    if (el.getAttribute('data-renk') === 'dusuk-iyi') {
      const n = sayi(v);
      el.classList.toggle('wt-iyi', n != null && n < 0);
      el.classList.toggle('wt-kotu', n != null && n > 0);
    }
  });

  dash.draw('yon', (el) => {
    const satir = satirOku(el);
    const n = satir ? sayi(satir[el.getAttribute('data-field')]) : null;
    el.textContent = n == null ? '—' : n > 0 ? el.getAttribute('data-artan') : n < 0 ? el.getAttribute('data-azalan') : el.getAttribute('data-sabit');
  });

  dash.draw('rozet', (el) => {
    const satir = satirOku(el);
    const v = satir ? satir[el.getAttribute('data-field')] : null;
    el.textContent = v ? (v === 'kesin' ? 'kesin' : 'geçici') : '—';
    el.classList.add('wt-rozet');
    el.classList.toggle('wt-kesin', v === 'kesin');
    el.classList.toggle('wt-gecici', !!v && v !== 'kesin');
  });

  // Son satırı gösteren alanlar (ana eğilim, yaygınlık): satır numarası veriden gelir
  function sonSatirAlani(el, bicim) {
    const d = dash.data(el.getAttribute('data-source'));
    el.replaceChildren();
    if (d.status !== 'ok' || !Array.isArray(d.data) || !d.data.length) { el.textContent = '—'; return; }
    const i = d.data.length - 1;
    const alan = el.getAttribute('data-field');
    const span = document.createElement('span');
    span.setAttribute('data-source', el.getAttribute('data-source'));
    span.setAttribute('data-field', alan);
    span.setAttribute('data-row', String(i));
    span.textContent = bicim(d.data[i][alan]);
    el.append(span);
  }
  dash.draw('egilim-son', (el) => sonSatirAlani(el, (v) => wt.yuzde(sayi(v))));
  dash.draw('yayginlik-son', (el) => sonSatirAlani(el, BICIM[el.getAttribute('data-bicim')] || String));
  dash.draw('egilim-ay', (el) => sonSatirAlani(el, (v) => wt.ayAdi(v)));

  // ---------------------------------------------------------------- günlük seyir
  function seriNoktalari(rows, kod, alan) {
    return rows.filter((r) => r.seri_kodu === kod).map((r) => ({ t: tarihOku(r.tarih), v: sayi(r[alan || 'endeks']) }))
      .sort((a, b) => a.t - b.t);
  }

  dash.draw('karsilastir', (sel) => {
    const g = dash.data('gunluk');
    const secenek = new Map();
    if (g.status === 'ok') g.data.forEach((r) => { if (r.seri_kodu !== 'TUFE' && !secenek.has(r.seri_kodu)) secenek.set(r.seri_kodu, r); });
    const grup = (ad, filtre) => {
      const og = document.createElement('optgroup');
      og.label = ad;
      [...secenek.values()].filter(filtre).sort((a, b) => (a.seri_kodu < b.seri_kodu ? -1 : 1))
        .forEach((r) => og.append(new Option(r.duzey === 'ana_grup' ? r.seri_kodu + ' ' + r.seri_adi : r.seri_adi, r.seri_kodu)));
      return og;
    };
    sel.replaceChildren(new Option('Yok', ''), grup('Özel göstergeler', (r) => r.duzey === 'ozel'), grup('Ana gruplar', (r) => r.duzey === 'ana_grup'));
    sel.value = secenek.has(wt.karsilastir) ? wt.karsilastir : '';
    sel.onchange = () => { wt.karsilastir = sel.value; ['gunluk-grafik', 'gunluk-lejant', 'gunluk-yillik-grafik'].forEach((c) => dash.draw(c)); };
  });

  function gunlukSeriler(alan) {
    const g = dash.data('gunluk');
    if (g.status !== 'ok') return null;
    const renkler = dash.colors;
    const s = [{ kod: 'TUFE', ad: 'Genel endeks', renk: renkler[0], kalin: 2.25, noktalar: seriNoktalari(g.data, 'TUFE', alan) }];
    if (wt.karsilastir) {
      const r = g.data.find((x) => x.seri_kodu === wt.karsilastir);
      if (r) s.push({ kod: r.seri_kodu, ad: r.seri_adi.split(':')[0], renk: renkler[1], noktalar: seriNoktalari(g.data, r.seri_kodu, alan) });
    }
    return s;
  }

  dash.draw('gunluk-lejant', (el) => {
    const s = gunlukSeriler();
    el.replaceChildren();
    if (!s) { el.textContent = '—'; return; }
    s.forEach((x) => {
      const span = document.createElement('span');
      const i = document.createElement('i');
      i.style.background = x.renk;
      span.append(i, document.createTextNode(x.ad));
      el.append(span);
    });
  });

  const gunBaslik = (t) => t.getUTCDate() + ' ' + AY[t.getUTCMonth()] + ' ' + t.getUTCFullYear();

  dash.draw('gunluk-grafik', (el) => {
    const s = gunlukSeriler();
    if (!s) { bosYaz(el, dash.data('gunluk').status); return; }
    const son = d3.max(s[0].noktalar, (d) => d.t);
    let bas = null;
    if (wt.aralik === 'yb') bas = new Date(Date.UTC(son.getUTCFullYear() - 1, 11, 31));
    else if (Number(wt.aralik) > 0) bas = new Date(+son - Number(wt.aralik) * 864e5);
    if (bas) s.forEach((x) => { x.noktalar = x.noktalar.filter((d) => d.t >= bas); });
    const kumulatif = wt.gorunum === 'kumulatif';
    if (kumulatif) {
      s.forEach((x) => {
        const ilk = x.noktalar.find((d) => d.v != null);
        x.noktalar = x.noktalar.map((d) => ({ t: d.t, v: ilk && d.v != null ? (d.v / ilk.v - 1) * 100 : null }));
      });
    }
    wt.cizgi(el, s, {
      yukseklik: 280,
      etiket: kumulatif ? 'Seçili aralığın başından bu yana kümülatif değişim, yüzde' : 'Genel endeksin günlük seyri, 31.12.2024 = 100',
      yBicim: kumulatif ? (v) => (v < 0 ? '−%' : '%') + f0(Math.abs(v)) : (v) => f0(v),
      ipBicim: kumulatif ? (v) => wt.yuzde(v) : (v) => f2(v),
      ipBaslik: gunBaslik,
      sifirdan: kumulatif,
      sifirCizgisi: kumulatif,
    });
  });

  dash.draw('gunluk-yillik-grafik', (el) => {
    const s = gunlukSeriler('yillik_degisim');
    if (!s) { bosYaz(el, dash.data('gunluk').status); return; }
    s.forEach((x) => { x.noktalar = x.noktalar.filter((d) => d.v != null); });
    if (!s.some((x) => x.noktalar.length)) { bosYaz(el, 'ok', 'Günlük yıllık değişim için en az bir yıllık veri gerekiyor; ilk değerler Kasım 2027’de.'); return; }
    wt.cizgi(el, s, {
      yukseklik: 240,
      etiket: 'Genel endeksin günlük yıllık değişimi, yüzde',
      yBicim: (v) => '%' + f0(v),
      ipBicim: (v) => wt.yuzde(v),
      ipBaslik: gunBaslik,
    });
  });

  dash.draw('aylik-grafik', (el) => {
    const a = dash.data('aylik');
    if (a.status !== 'ok') { bosYaz(el, a.status); return; }
    const rows = a.data.filter((r) => r.seri_kodu === 'TUFE').sort((x, y) => (x.ay < y.ay ? -1 : 1));
    if (!rows.some((r) => r.aylik_degisim !== null && r.aylik_degisim !== '')) { bosYaz(el, 'ok', 'Aylık değişim ilk tam aydan sonra görünür: Aralık 2026 verisiyle (geçici), 24 Aralık’ta kesinleşir.'); return; }
    wt.cubuk(el, aylikSatirlar(rows), { yukseklik: 230, etiket: 'Genel endeksin aylık değişimi, yüzde' });
  });

  // ---------------------------------------------------------------- tablolar
  function hucre(tr, metin, sinif) {
    const c = document.createElement('td');
    if (sinif) c.className = sinif;
    c.textContent = metin;
    tr.append(c);
    return c;
  }

  dash.draw('ana-grup-satirlar', (tb) => {
    const d = dash.data('ana_grup_tablosu');
    tb.replaceChildren();
    if (d.status !== 'ok' || !d.data) return;
    const enBuyuk = d3.max(d.data, (r) => Math.max(r.yillik_degisim || 0, r.genel_yillik || 0)) || 1;
    d.data.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.kod);
      hucre(tr, r.kod, 'wt-kod');
      hucre(tr, r.ad);
      hucre(tr, f2(r.agirlik), 'wt-say');
      hucre(tr, wt.yuzde(r.aylik_degisim), 'wt-say');
      hucre(tr, wt.yuzde(r.yillik_degisim), 'wt-say');
      const c = hucre(tr, '', 'wt-cubuk-hucre');
      const iz = document.createElement('div');
      iz.className = 'wt-cubuk-iz';
      const dolgu = document.createElement('div');
      dolgu.className = 'wt-cubuk-dolgu';
      dolgu.style.width = Math.max(0, (r.yillik_degisim || 0) / enBuyuk * 100) + '%';
      dolgu.style.background = dash.colors[0];
      const ref = document.createElement('div');
      ref.className = 'wt-cubuk-ref';
      ref.style.left = ((r.genel_yillik || 0) / enBuyuk * 100) + '%';
      iz.append(dolgu, ref);
      c.append(iz);
      tb.append(tr);
    });
  });

  dash.draw('hg-filtre', (sel) => {
    const a = dash.data('aylik');
    const gruplar = new Map();
    if (a.status === 'ok') a.data.forEach((r) => { if (r.duzey === 'ana_grup') gruplar.set(r.seri_kodu, r.seri_adi); });
    sel.replaceChildren(new Option('Tümü', ''), ...[...gruplar.keys()].sort().map((k) => new Option(k + ' ' + gruplar.get(k), k)));
    sel.value = gruplar.has(wt.hgFiltre) ? wt.hgFiltre : '';
    sel.onchange = () => { wt.hgFiltre = sel.value; dash.draw('hg-satirlar'); };
  });

  dash.draw('hg-satirlar', (tb) => {
    const d = dash.data('harcama_gruplari');
    tb.replaceChildren();
    if (d.status !== 'ok' || !d.data) return;
    d.data.filter((r) => !wt.hgFiltre || r.ana_grup_kodu === wt.hgFiltre).forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.kod);
      hucre(tr, r.kod, 'wt-kod');
      hucre(tr, r.ad);
      hucre(tr, f2(r.agirlik), 'wt-say');
      hucre(tr, wt.yuzde(r.aylik_degisim), 'wt-say');
      hucre(tr, wt.yuzde(r.yillik_degisim), 'wt-say');
      tb.append(tr);
    });
  });

  dash.draw('isi-haritasi', (el) => {
    const a = dash.data('aylik');
    el.replaceChildren();
    if (a.status !== 'ok') { el.textContent = a.status === 'error' ? 'Yüklenemedi' : '—'; return; }
    const satirlar = new Map();
    const aylar = new Set();
    a.data.forEach((r) => {
      if (r.duzey !== wt.isiDuzey || r.aylik_degisim === null || r.aylik_degisim === '') return;
      if (!satirlar.has(r.seri_kodu)) satirlar.set(r.seri_kodu, { ad: r.seri_adi, d: new Map() });
      satirlar.get(r.seri_kodu).d.set(r.ay, Number(r.aylik_degisim));
      aylar.add(r.ay);
    });
    const ayL = [...aylar].sort();
    let enBuyuk = 0;
    satirlar.forEach((s) => s.d.forEach((v) => { enBuyuk = Math.max(enBuyuk, Math.abs(v)); }));
    enBuyuk = Math.min(enBuyuk, 10) || 1;
    const tablo = document.createElement('table');
    tablo.className = 'wt-isi';
    tablo.setAttribute('aria-label', 'Aylık değişim ısı haritası');
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    const bos = document.createElement('th');
    bos.className = 'wt-isi-ad';
    htr.append(bos);
    ayL.forEach((ay) => { const th = document.createElement('th'); th.textContent = wt.ayKisa(ay); htr.append(th); });
    thead.append(htr);
    const tbody = document.createElement('tbody');
    [...satirlar.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).forEach(([kod, s]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'wt-isi-ad';
      th.textContent = (wt.isiDuzey === 'ozel' ? '' : kod + ' ') + s.ad.split(':')[0];
      th.title = s.ad;
      tr.append(th);
      ayL.forEach((ay) => {
        const td = document.createElement('td');
        const v = s.d.get(ay);
        if (v != null) {
          const yogunluk = Math.round(Math.min(1, Math.abs(v) / enBuyuk) * 70) + 6;
          td.style.background = `color-mix(in srgb, ${v >= 0 ? 'var(--color-bad)' : 'var(--color-ok)'} ${yogunluk}%, transparent)`;
          td.textContent = f1(v);
          td.title = s.ad + ' · ' + wt.ayAdi(ay) + ': ' + wt.yuzde(v);
        }
        tr.append(td);
      });
      tbody.append(tr);
    });
    tablo.append(thead, tbody);
    const olcek = document.createElement('div');
    olcek.className = 'wt-isi-olcek';
    const kutu = (renk, oran, metin) => {
      const s = document.createElement('span');
      s.style.display = 'inline-flex'; s.style.alignItems = 'center'; s.style.gap = '4px';
      const i = document.createElement('i');
      i.style.background = `color-mix(in srgb, var(${renk}) ${oran}%, transparent)`;
      s.append(i, document.createTextNode(metin));
      return s;
    };
    olcek.append(kutu('--color-ok', 76, '−%' + f0(enBuyuk) + ' ve altı'), kutu('--color-ok', 20, 'hafif düşüş'),
      kutu('--color-bad', 20, 'hafif artış'), kutu('--color-bad', 76, '%' + f0(enBuyuk) + ' ve üstü'));
    el.append(tablo, olcek);
  });

  dash.draw('ozel-satirlar', (tb) => {
    const d = dash.data('ozel_tablo');
    const a = dash.data('aylik');
    tb.replaceChildren();
    if (d.status !== 'ok' || !d.data) return;
    const gecmis = new Map();
    if (a.status === 'ok') {
      const aylar = [...new Set(a.data.map((r) => r.ay))].sort().slice(-12);
      const kume = new Set(aylar);
      a.data.forEach((r) => {
        if (!kume.has(r.ay) || (r.duzey !== 'ozel' && r.duzey !== 'genel')) return;
        if (!gecmis.has(r.seri_kodu)) gecmis.set(r.seri_kodu, []);
        gecmis.get(r.seri_kodu).push({ ay: r.ay, v: sayi(r.yillik_degisim) });
      });
    }
    d.data.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.kod);
      const ad = hucre(tr, r.ad);
      if (r.kod === 'TUFE') ad.style.fontWeight = 'var(--cds-font-weight-medium)';
      hucre(tr, wt.yuzde(r.aylik_degisim), 'wt-say');
      hucre(tr, wt.yuzde(r.yillik_degisim), 'wt-say');
      const f = hucre(tr, wt.puan(r.yillik_fark), 'wt-say');
      if (r.yillik_fark != null) f.classList.add(r.yillik_fark < 0 ? 'wt-iyi' : r.yillik_fark > 0 ? 'wt-kotu' : 'wt-not');
      const c = hucre(tr, '');
      const noktalar = (gecmis.get(r.kod) || []).filter((p) => p.v != null).sort((x, y) => (x.ay < y.ay ? -1 : 1));
      if (noktalar.length > 1) {
        const w = 96, h = 24;
        const x = d3.scaleLinear().domain([0, noktalar.length - 1]).range([2, w - 4]);
        const y = d3.scaleLinear().domain(d3.extent(noktalar, (p) => p.v)).range([h - 3, 3]);
        const kap = document.createElement('span');
        kap.setAttribute('data-source', 'aylik');
        const svg = d3.select(kap).append('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`)
          .attr('role', 'img').attr('aria-label', r.ad + ': son 12 ayın yıllık değişimi');
        svg.append('path').attr('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.5)
          .attr('d', d3.line().x((p, i) => x(i)).y((p) => y(p.v))(noktalar));
        const son = noktalar[noktalar.length - 1];
        svg.append('circle').attr('cx', x(noktalar.length - 1)).attr('cy', y(son.v)).attr('r', 2.5).style('fill', dash.colors[0]);
        c.append(kap);
      }
      tb.append(tr);
    });
  });

  // ---------------------------------------------------------------- ana eğilim, yaygınlık
  const EGILIM = [['genel', 'Genel'], ['b', 'TÜFE B'], ['c', 'TÜFE C'], ['medyan', 'Medyan'], ['budanmis', 'Budanmış ortalama']];

  dash.draw('egilim-lejant', (el) => {
    el.replaceChildren();
    if (dash.data('ana_egilim').status !== 'ok') { el.textContent = '—'; return; }
    EGILIM.forEach(([, ad], i) => {
      const span = document.createElement('span');
      const k = document.createElement('i');
      k.style.background = dash.colors[i % dash.colors.length];
      span.append(k, document.createTextNode(ad));
      el.append(span);
    });
  });

  dash.draw('ana-egilim-grafik', (el) => {
    const d = dash.data('ana_egilim');
    if (d.status !== 'ok' || !d.data) { bosYaz(el, d.status); return; }
    const seriler = EGILIM.map(([alan, ad], i) => ({
      ad, renk: dash.colors[i % dash.colors.length], kalin: alan === 'genel' ? 2.25 : 1.5,
      noktalar: d.data.map((r) => ({ t: ayTarih(r.ay), v: r[alan] })),
    }));
    wt.cizgi(el, seriler, {
      yukseklik: 260,
      etiket: 'Ana eğilim ölçülerinin aylık değişimi, yüzde',
      yBicim: (v) => '%' + f1(v),
      ipBicim: (v) => wt.yuzde(v),
      ipBaslik: (t) => AY[t.getUTCMonth()] + ' ' + t.getUTCFullYear(),
      sifirdan: true,
      sifirCizgisi: true,
    });
  });

  dash.draw('yayginlik-grafik', (el) => {
    const d = dash.data('yayginlik');
    if (d.status !== 'ok' || !d.data) { bosYaz(el, d.status); return; }
    const rows = d.data.map((r) => ({
      anahtar: r.ay, kisa: wt.ayKisa(r.ay), v: r.artan_oran, soluk: r.kesin !== 'kesin', etiket: wt.ayAdi(r.ay),
      ipucu: [
        { ad: 'Fiyatı artan', deger: wt.yuzde1(r.artan_oran) },
        { ad: 'Fiyatı düşen', deger: wt.yuzde1(r.dusen_oran) },
        { ad: 'Ağırlıklı artan', deger: wt.yuzde1(r.agirlikli_artan) },
      ],
    }));
    wt.cubuk(el, rows, { yukseklik: 220, etiket: 'Fiyatı artan maddelerin payı, yüzde', yBicim: (v) => '%' + f0(v), yUst: 100, referans: 50 });
  });

  // ---------------------------------------------------------------- fiyat hareketleri
  function hareketTablosu(tb, yon) {
    const d = dash.data('son_degisimler');
    tb.replaceChildren();
    if (d.status !== 'ok' || !d.data) return;
    const alan = wt.hDonem;
    const liste = d.data.filter((r) => r.duzey === wt.hDuzey && r[alan] !== null && r[alan] !== '')
      .sort((a, b) => Number(b[alan]) - Number(a[alan]));
    const secilen = yon === 'artan' ? liste.slice(0, 10) : liste.slice(-10).reverse();
    secilen.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.seri_kodu);
      hucre(tr, r.seri_adi);
      ['gunluk', 'aylik', 'yillik'].forEach((s) => {
        const v = sayi(r[s]);
        const c = hucre(tr, wt.isaretli(v), 'wt-say');
        if (s === alan) {
          c.classList.add('wt-secili-sutun');
          if (v != null) c.classList.add(v > 0 ? 'wt-kotu' : v < 0 ? 'wt-iyi' : 'wt-not');
        }
      });
      tb.append(tr);
    });
  }
  dash.draw('artan-satirlar', (tb) => hareketTablosu(tb, 'artan'));
  dash.draw('dusen-satirlar', (tb) => hareketTablosu(tb, 'dusen'));

  // ---------------------------------------------------------------- madde gezgini
  dash.draw('madde-sec', (sel) => {
    const a = dash.data('aylik');
    if (a.status !== 'ok') { sel.replaceChildren(); return; }
    const gruplar = new Map();
    const maddeler = new Map();
    a.data.forEach((r) => {
      if (r.duzey === 'ana_grup') gruplar.set(r.seri_kodu, r.seri_adi);
      if (r.duzey === 'madde' && !maddeler.has(r.seri_kodu)) maddeler.set(r.seri_kodu, r.seri_adi);
    });
    const ogs = [...gruplar.keys()].sort().map((g) => {
      const og = document.createElement('optgroup');
      og.label = g + ' ' + gruplar.get(g);
      [...maddeler.entries()].filter(([k]) => k.startsWith(g)).sort((x, y) => (x[0] < y[0] ? -1 : 1))
        .forEach(([k, ad]) => og.append(new Option(ad, k)));
      return og;
    });
    sel.replaceChildren(...ogs);
    if (!maddeler.has(wt.madde)) wt.madde = maddeler.keys().next().value;
    sel.value = wt.madde;
    sel.onchange = () => { wt.madde = sel.value; dash.draw('madde-grafik'); dash.draw('madde-ozet'); };
  });

  function isaretliB(kaynak, alan, nerede, metin) {
    const b = document.createElement('b');
    b.setAttribute('data-source', kaynak);
    b.setAttribute('data-field', alan);
    b.setAttribute('data-where', nerede);
    b.textContent = metin;
    return b;
  }

  dash.draw('madde-ozet', (el) => {
    const a = dash.data('aylik');
    el.replaceChildren();
    if (a.status !== 'ok') { el.textContent = '—'; return; }
    const rows = a.data.filter((r) => r.seri_kodu === wt.madde).sort((x, y) => (x.ay < y.ay ? -1 : 1));
    const son = rows[rows.length - 1];
    if (!son) { el.textContent = '—'; return; }
    const nerede = 'ay=' + encodeURIComponent(son.ay) + '&seri_kodu=' + encodeURIComponent(son.seri_kodu);
    el.append(
      document.createTextNode(son.seri_adi + ' · ' + wt.ayAdi(son.ay) + ': aylık '),
      isaretliB('aylik', 'aylik_degisim', nerede, wt.yuzde(sayi(son.aylik_degisim))),
      document.createTextNode(', yıllık '),
      isaretliB('aylik', 'yillik_degisim', nerede, wt.yuzde(sayi(son.yillik_degisim))),
      document.createTextNode('.'),
    );
  });

  dash.draw('madde-grafik', (el) => {
    const a = dash.data('aylik');
    if (a.status !== 'ok') { bosYaz(el, a.status); return; }
    const rows = a.data.filter((r) => r.seri_kodu === wt.madde).sort((x, y) => (x.ay < y.ay ? -1 : 1));
    const ad = rows.length ? rows[0].seri_adi : '';
    wt.cubuk(el, aylikSatirlar(rows), { yukseklik: 220, etiket: ad + ': aylık değişim, yüzde' });
  });

  // ---------------------------------------------------------------- ağırlıklar
  dash.draw('agirlik-satirlar', (tb) => {
    const d = dash.data('agirlik_ozet');
    tb.replaceChildren();
    if (d.status !== 'ok' || !d.data) return;
    const enBuyuk = d3.max(d.data, (r) => r.agirlik) || 1;
    d.data.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.kod);
      hucre(tr, r.kod + ' ' + r.ad);
      hucre(tr, f0(r.madde), 'wt-say');
      hucre(tr, f2(r.agirlik), 'wt-say');
      hucre(tr, f2(r.kapsanan_agirlik), 'wt-say');
      const c = hucre(tr, '', 'wt-cubuk-hucre');
      const iz = document.createElement('div');
      iz.className = 'wt-cubuk-iz';
      const dolgu = document.createElement('div');
      dolgu.className = 'wt-cubuk-dolgu';
      dolgu.style.width = (r.agirlik / enBuyuk * 100) + '%';
      dolgu.style.background = dash.colors[0];
      const ic = document.createElement('div');
      ic.className = 'wt-cubuk-ic';
      ic.style.width = (r.kapsanan_agirlik / enBuyuk * 100) + '%';
      iz.append(dolgu, ic);
      c.append(iz);
      tb.append(tr);
    });
  });

  // ---------------------------------------------------------------- hesaplayıcı
  function genelAylar() {
    const a = dash.data('aylik');
    if (a.status !== 'ok') return null;
    return a.data.filter((r) => r.seri_kodu === 'TUFE').sort((x, y) => (x.ay < y.ay ? -1 : 1));
  }

  function aySecimi(sel, durum, varsayilan) {
    const rows = genelAylar();
    if (!rows) { sel.replaceChildren(); return; }
    sel.replaceChildren(...rows.map((r) => new Option(wt.ayAdi(r.ay) + (r.kesin === 'kesin' ? '' : ' (geçici)'), r.ay)));
    if (!rows.some((r) => r.ay === wt[durum])) wt[durum] = varsayilan(rows);
    sel.value = wt[durum];
    sel.onchange = () => { wt[durum] = sel.value; dash.draw('hesap-sonuc'); };
  }
  dash.draw('hesap-bas', (sel) => aySecimi(sel, 'hesapBas', (rows) => rows[0].ay));
  dash.draw('hesap-son', (sel) => aySecimi(sel, 'hesapSon', (rows) => rows[rows.length - 1].ay));

  dash.draw('hesap-sonuc', (el) => {
    const rows = genelAylar();
    el.replaceChildren();
    if (!rows) { el.textContent = '—'; return; }
    const girdi = document.getElementById('hesap-tutar');
    const tutar = girdi ? Number(String(girdi.value).replace(',', '.')) : 1000;
    const bas = rows.find((r) => r.ay === wt.hesapBas);
    const son = rows.find((r) => r.ay === wt.hesapSon);
    if (!bas || !son || !(tutar >= 0)) { el.textContent = 'Geçerli bir tutar ve iki ay seçin.'; return; }
    const oran = Number(son.endeks) / Number(bas.endeks);
    const nerede = (r) => 'ay=' + encodeURIComponent(r.ay) + '&seri_kodu=TUFE';
    el.append(
      document.createTextNode(wt.ayAdi(bas.ay) + ' → ' + wt.ayAdi(son.ay) + ': ' + f2(tutar) + ' ₺ tutarındaki sepet '),
      (() => { const b = document.createElement('b'); b.textContent = f2(tutar * oran) + ' ₺'; return b; })(),
      document.createTextNode(' tutuyor (değişim ' + wt.isaretli((oran - 1) * 100) + '). Kullanılan aylık endeksler: '),
      isaretliB('aylik', 'endeks', nerede(bas), f2(Number(bas.endeks))),
      document.createTextNode(' ve '),
      isaretliB('aylik', 'endeks', nerede(son), f2(Number(son.endeks))),
      document.createTextNode('.'),
    );
  });

  // ---------------------------------------------------------------- kişisel sepet
  function kisiselAgirliklar(rows) {
    if (!wt.kisisel) wt.kisisel = Object.fromEntries(rows.map((r) => [r.kod, r.agirlik]));
    return wt.kisisel;
  }

  dash.draw('kisisel-satirlar', (tb) => {
    const d = dash.data('ana_grup_tablosu');
    tb.replaceChildren();
    if (d.status !== 'ok' || !d.data) return;
    const w = kisiselAgirliklar(d.data);
    d.data.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.kod);
      hucre(tr, r.kod + ' ' + r.ad);
      hucre(tr, f2(r.agirlik), 'wt-say');
      const c = hucre(tr, '', 'wt-say');
      const g = document.createElement('input');
      g.type = 'number'; g.min = '0'; g.step = 'any'; g.className = 'wt-girdi wt-dar';
      g.id = 'kisisel-' + r.kod;
      g.setAttribute('aria-label', r.ad + ' için ağırlığınız');
      g.value = String(Math.round(w[r.kod] * 100) / 100);
      g.addEventListener('input', () => { wt.kisisel[r.kod] = Math.max(0, Number(String(g.value).replace(',', '.')) || 0); dash.draw('kisisel-sonuc'); });
      c.append(g);
      hucre(tr, wt.yuzde(r.yillik_degisim), 'wt-say');
      tb.append(tr);
    });
  });

  dash.draw('kisisel-sonuc', (el) => {
    const d = dash.data('ana_grup_tablosu');
    el.replaceChildren();
    if (d.status !== 'ok' || !d.data || !d.data.length) { el.textContent = '—'; return; }
    const w = kisiselAgirliklar(d.data);
    let top = 0, yil = 0, ay = 0;
    d.data.forEach((r) => {
      const a = w[r.kod] || 0;
      top += a;
      yil += a * (r.yillik_degisim || 0);
      ay += a * (r.aylik_degisim || 0);
    });
    if (top <= 0) { el.textContent = 'En az bir gruba sıfırdan büyük ağırlık verin.'; return; }
    const kisiYil = yil / top;
    const kisiAy = ay / top;
    const genel = d.data[0];
    const b = (metin) => { const x = document.createElement('b'); x.textContent = metin; return x; };
    const fark = kisiYil - (genel.genel_yillik || 0);
    el.append(
      document.createTextNode(wt.ayAdi(genel.ay) + ' için kişisel yıllık enflasyonunuz '),
      b(wt.yuzde(kisiYil)),
      document.createTextNode(', aylık '),
      b(wt.yuzde(kisiAy)),
      document.createTextNode('. Genel endeksin yıllık değişimi '),
      isaretliB('ana_grup_tablosu', 'genel_yillik', 'kod=' + encodeURIComponent(genel.kod), wt.yuzde(genel.genel_yillik)),
      document.createTextNode('; sizinki ' + f2(Math.abs(fark)) + ' puan ' + (fark > 0 ? 'yüksek' : fark < 0 ? 'düşük' : 'fark yok') + '.'),
    );
  });

  // ---------------------------------------------------------------- veri hattı
  dash.draw('gozlem-grafik', (el) => {
    const g = dash.data('gozlem');
    if (g.status !== 'ok') { bosYaz(el, g.status); return; }
    const rows = g.data.map((r) => ({ t: tarihOku(r.tarih), v: sayi(r.gozlem), k: sayi(r.aykiri) })).sort((a, b) => a.t - b.t);
    const harita = new Map(rows.map((r) => [+r.t, r]));
    wt.cizgi(el, [{ ad: 'Gözlem', renk: dash.colors[0], noktalar: rows }], {
      yukseklik: 220,
      etiket: 'Günlük fiyat gözlemi sayısı',
      yBicim: (v) => f0(v),
      ipBicim: (v) => f0(v),
      ipBaslik: (t) => {
        const r = harita.get(+t);
        return gunBaslik(t) + (r ? ' · ayıklanan: ' + f0(r.k) : '');
      },
    });
  });

  // ---------------------------------------------------------------- takvim
  dash.draw('takvim', (ul) => {
    const d = dash.data('ozet');
    ul.replaceChildren();
    if (d.status !== 'ok' || !d.data || !d.data.length) return;
    const [y, m] = d.data[0].ay.split('-').map(Number);
    const li = (metin) => { const x = document.createElement('li'); x.textContent = metin; ul.append(x); };
    const tarihYaz = (t) => t.getUTCDate() + ' ' + AY[t.getUTCMonth()] + ' ' + t.getUTCFullYear();
    const tuik = (yil, ay0) => { // ay0: açıklama ayı (0 tabanlı); ayın 3'ü, hafta sonuysa pazartesi
      const t = new Date(Date.UTC(yil, ay0, 3));
      const g = t.getUTCDay();
      if (g === 6) t.setUTCDate(5);
      if (g === 0) t.setUTCDate(4);
      return t;
    };
    const sonrakiYil = m === 12 ? y + 1 : y;
    const sonrakiAy0 = m === 12 ? 0 : m;
    li(wt.ayAdi(d.data[0].ay) + ' verisinin kesinleşme günü: ' + tarihYaz(new Date(Date.UTC(y, m - 1, 24))) + '.');
    li(wt.ayAdi(`${sonrakiYil}-${String(sonrakiAy0 + 1).padStart(2, '0')}`) + ' verisinin kesinleşme günü: ' + tarihYaz(new Date(Date.UTC(sonrakiYil, sonrakiAy0, 24))) + '.');
    li('TÜİK ' + wt.ayAdi(d.data[0].ay) + ' TÜFE açıklaması (tahmini): ' + tarihYaz(tuik(sonrakiYil, sonrakiAy0)) + '.');
    li('Gerçek veride fiyatlar her gün 09:00\'da toplanır; endeks, toplama bitince güncellenir.');
  });

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

  // ================================================================ site: menü ve bölüm geçişleri
  const SAYFALAR = ['genel-bakis', 'gruplar', 'cekirdek', 'maddeler', 'araclar', 'veri', 'resmi', 'hareketlilik', 'akaryakit', 'matris'];
  const hareketAzalt = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.querySelectorAll('.wt-site').forEach((k) => k.style.setProperty('--wt-vurgu', dash.colors[0]));

  function cizgiyiTasi() {
    document.querySelectorAll('.wt-menu').forEach((nav) => {
      const aktif = nav.querySelector('button.wt-secili');
      const cizgi = nav.querySelector('.wt-menu-cizgi');
      if (!aktif || !cizgi) return;
      cizgi.style.width = aktif.offsetWidth + 'px';
      cizgi.style.transform = 'translateX(' + aktif.offsetLeft + 'px)';
    });
  }

  function sayfaAc(id, secenek) {
    secenek = secenek || {};
    if (!SAYFALAR.includes(id)) id = 'genel-bakis';
    const animasyon = !secenek.ilk && !hareketAzalt();
    document.querySelectorAll('.wt-sayfa').forEach((s) => {
      const acik = s.id === id;
      s.hidden = !acik;
      s.classList.toggle('wt-giris', acik && animasyon);
    });
    document.querySelectorAll('.wt-menu button[data-sayfa]').forEach((b) => {
      const acik = b.getAttribute('data-sayfa') === id;
      b.classList.toggle('wt-secili', acik);
      b.setAttribute('aria-current', acik ? 'page' : 'false');
    });
    cizgiyiTasi();
    if (!secenek.ilk) {
      const menu = document.getElementById('ana-menu');
      const aktif = menu && menu.querySelector('button.wt-secili');
      if (menu && aktif) menu.scrollTo({ left: Math.max(0, aktif.offsetLeft - (menu.clientWidth - aktif.offsetWidth) / 2), behavior: animasyon ? 'smooth' : 'auto' });
      const ust = document.getElementById('ust-bar');
      if (ust) ust.scrollIntoView({ block: 'start', behavior: animasyon ? 'smooth' : 'auto' });
    }
    if (secenek.linkle) dash.setLink(id);
  }

  document.querySelectorAll('.wt-menu button[data-sayfa]').forEach((b) => {
    b.addEventListener('click', () => sayfaAc(b.getAttribute('data-sayfa'), { linkle: true }));
  });
  document.querySelectorAll('[data-git]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); sayfaAc(a.getAttribute('data-git'), { linkle: true }); });
  });
  document.querySelectorAll('.wt-bu-sayfada a').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hedef = document.getElementById((a.getAttribute('href') || '').slice(1));
      if (!hedef) return;
      e.preventDefault();
      hedef.scrollIntoView({ block: 'start', behavior: hareketAzalt() ? 'auto' : 'smooth' });
    });
  });
  window.addEventListener('resize', cizgiyiTasi);

  (function () {
    const h = (location.hash || '').slice(1);
    let hedef = 'genel-bakis';
    if (SAYFALAR.includes(h)) hedef = h;
    else if (h) {
      const el = document.getElementById(h);
      const s = el && el.closest('.wt-sayfa');
      if (s) hedef = s.id;
    }
    sayfaAc(hedef, { ilk: true });
    requestAnimationFrame(cizgiyiTasi);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(cizgiyiTasi);
  })();

  // ================================================================ manşet bandı
  dash.calc('mansetler', {
    inputs: ['gercek_mansetler', 'ozet', 'son_degisimler', 'ana_grup_tablosu', 'yayginlik'],
    title: 'Günün manşetleri',
    description: 'Manşet bandındaki cümleler: gerçek market fiyatlarından (en pahalı ürün, zincir farkı, temel gıdalar, günlük değişim) ve Web TÜFE endeksinden (genel endeks, aylık ve yıllık değişim, en çok artan ve düşen kalemler, gruplar, yaygınlık) seçilen değerler. Hesaplanamayan değerler (ör. bir yıllık veri olmadan yıllık değişim) banda girmez.',
    fn: (gercek, ozet, son_degisimler, ana_gruplar, yayginlik) => {
      const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const gun = (t) => (t ? Number(t.slice(8, 10)) + ' ' + AYK[Number(t.slice(5, 7)) - 1] : '');
      const gercekler = [];
      const sentetikler = [];
      (gercek || []).forEach((r) => {
        const k = 'Gerçek · ' + gun(r.tarih);
        if (r.anahtar === 'en_pahali') {
          gercekler.push({ kaynak: k, on: 'Bugünkü taramada en pahalı ürün: ' + r.urun + ', ', deger: sayi(r.deger), bicim: 'tl', ara1: ' (' + r.zincir + ', ' + r.konum + ')' });
        } else if (r.anahtar === 'zincir_farki') {
          gercekler.push({ kaynak: k, on: 'Aynı ürün, farklı fiyat: ' + r.urun + ' ' + r.zincir + ' ', deger: sayi(r.deger2), bicim: 'tl', ara1: ', ' + r.zincir2 + ' ', deger2: sayi(r.deger3), bicim2: 'tl', ara2: ' (fark ', deger3: sayi(r.deger), bicim3: 'yuzde1', son: ')' });
        } else if (r.anahtar === 'en_cok_zamlanan' || r.anahtar === 'en_cok_ucuzlayan') {
          // Önceki toplama dün değilse (ör. aradaki günlerde toplama yapılmadıysa) karşılaştırma tarihini söyle
          const ara = r.onceki_tarih ? Math.round((Date.parse(r.tarih + 'T00:00:00Z') - Date.parse(r.onceki_tarih + 'T00:00:00Z')) / 864e5) : 1;
          const fiil = r.anahtar === 'en_cok_zamlanan' ? 'zamlanan' : 'ucuzlayan';
          const bas = ara === 1 ? 'Günün en çok ' + fiil + ' ürünü: ' : 'Önceki toplamaya (' + gun(r.onceki_tarih) + ') göre en çok ' + fiil + ' ürün: ';
          gercekler.push({ kaynak: k, on: bas + r.urun + ' ' + r.zincir + ' ', deger: sayi(r.deger2), bicim: 'tl', ara1: ' → ', deger2: sayi(r.deger3), bicim2: 'tl', ara2: ' (', deger3: sayi(r.deger), bicim3: 'isaretli', son: ', ' + r.konum + ')' });
        } else if (r.anahtar === 'birim_fiyat') {
          gercekler.push({ kaynak: k, on: r.urun + ' ' + r.birim + ' en ucuz ', deger: sayi(r.deger2), bicim: 'tl', ara1: ', ortanca ', deger2: sayi(r.deger), bicim2: 'tl' });
        } else if (r.anahtar === 'gozlem') {
          gercekler.push({ kaynak: k, on: 'Bugün ', deger: sayi(r.deger3), bicim: 'sayi', ara1: ' şehirde ', deger2: sayi(r.deger2), bicim2: 'sayi', ara2: ' zincirden ', deger3: sayi(r.deger), bicim3: 'sayi', son: ' fiyat toplandı' });
        }
      });
      const o = (ozet || [])[0];
      const K = 'Web TÜFE';
      if (o) {
        if (o.yillik_degisim != null) {
          sentetikler.push(o.yillik_fark != null
            ? { kaynak: K, on: 'Yıllık enflasyon ', deger: o.yillik_degisim, bicim: 'yuzde', ara1: '; önceki aya göre ', deger2: o.yillik_fark, bicim2: 'puan', ara2: ' puan' }
            : { kaynak: K, on: 'Yıllık enflasyon ', deger: o.yillik_degisim, bicim: 'yuzde' });
        }
        if (o.aylik_degisim != null) {
          sentetikler.push({ kaynak: K, on: 'Aylık değişim ', deger: o.aylik_degisim, bicim: 'yuzde', ara1: o.durum === 'kesin' ? ' (kesin)' : ' (geçici)' });
        }
        if (o.endeks != null) {
          sentetikler.push({ kaynak: K, on: 'Genel endeks (12 Kas 2026 = 100) ', deger: o.endeks, bicim: 'endeks', ara1: o.gunluk_degisim != null ? '; önceki toplamaya göre ' : '', deger2: o.gunluk_degisim, bicim2: 'isaretli' });
        }
      }
      const maddeler = (son_degisimler || []).filter((r) => r.duzey === 'madde');
      const uc = (alan, buyuk) => {
        const l = maddeler.filter((r) => r[alan] !== null && r[alan] !== '').sort((a, b) => Number(a[alan]) - Number(b[alan]));
        return l.length ? (buyuk ? l[l.length - 1] : l[0]) : null;
      };
      [['gunluk', true, 'Günün en çok artan maddesi: '], ['aylik', true, 'Ayın en çok artan maddesi: '],
        ['aylik', false, 'Ayın en çok düşen maddesi: '], ['yillik', true, 'Yılın en çok artan maddesi: ']].forEach(([alan, buyuk, metin]) => {
        const r = uc(alan, buyuk);
        if (r) sentetikler.push({ kaynak: K, on: metin + r.seri_adi + ' ', deger: sayi(r[alan]), bicim: 'isaretli' });
      });
      const g = (ana_gruplar || []).filter((r) => r.yillik_degisim != null).sort((a, b) => a.yillik_degisim - b.yillik_degisim);
      if (g.length) {
        sentetikler.push({ kaynak: K, on: 'En yüksek yıllık enflasyon: ' + g[g.length - 1].ad + ' ', deger: g[g.length - 1].yillik_degisim, bicim: 'yuzde' });
        sentetikler.push({ kaynak: K, on: 'En düşük yıllık enflasyon: ' + g[0].ad + ' ', deger: g[0].yillik_degisim, bicim: 'yuzde' });
      }
      const y = (yayginlik || [])[(yayginlik || []).length - 1];
      if (y && y.artan_oran != null) sentetikler.push({ kaynak: K, on: 'Fiyatı artan maddelerin payı ', deger: y.artan_oran, bicim: 'yuzde1' });
      const sonuc = [];
      for (let i = 0; i < Math.max(gercekler.length, sentetikler.length); i++) {
        if (sentetikler[i]) sonuc.push(sentetikler[i]);
        if (gercekler[i]) sonuc.push(gercekler[i]);
      }
      return sonuc.map((r, i) => ({ sira: i + 1, ...r }));
    },
  });

  const BANT_BICIM = {
    tl: (v) => (v == null ? '—' : f2(v) + ' ₺'),
    yuzde: (v) => wt.yuzde(v),
    yuzde1: (v) => wt.yuzde1(v),
    isaretli: (v) => wt.isaretli(v),
    puan: (v) => wt.puan(v),
    sayi: (v) => (v == null ? '—' : f0(v)),
    endeks: (v) => (v == null ? '—' : f2(v)),
  };

  dash.draw('manset-bandi', (el) => {
    const d = dash.data('mansetler');
    el.replaceChildren();
    if (d.status !== 'ok' || !Array.isArray(d.data) || !d.data.length) {
      el.textContent = d.status === 'error' ? 'Manşetler yüklenemedi' : '—';
      return;
    }
    const liste = (kopya) => {
      const ul = document.createElement('div');
      ul.className = 'wt-bant-liste';
      if (kopya) ul.setAttribute('aria-hidden', 'true');
      d.data.forEach((r, i) => {
        const m = document.createElement('span');
        m.className = 'wt-manset';
        const tur = document.createElement('span');
        tur.className = 'wt-manset-tur' + (r.kaynak.startsWith('Gerçek') ? ' wt-gercek' : '');
        tur.textContent = r.kaynak;
        m.append(tur);
        const metin = document.createElement('span');
        const deger = (alan, bicim) => {
          const b = document.createElement('b');
          if (!kopya) {
            b.setAttribute('data-source', 'mansetler');
            b.setAttribute('data-field', alan);
            b.setAttribute('data-row', String(i));
          }
          b.textContent = (BANT_BICIM[bicim] || String)(r[alan]);
          return b;
        };
        if (r.on) metin.append(document.createTextNode(r.on));
        if (r.deger != null) metin.append(deger('deger', r.bicim));
        if (r.ara1) metin.append(document.createTextNode(r.ara1));
        if (r.deger2 != null) metin.append(deger('deger2', r.bicim2));
        if (r.ara2) metin.append(document.createTextNode(r.ara2));
        if (r.deger3 != null) metin.append(deger('deger3', r.bicim3));
        if (r.son) metin.append(document.createTextNode(r.son));
        m.append(metin);
        ul.append(m);
      });
      return ul;
    };
    el.append(liste(false), liste(true));
    // Hız: saniyede yaklaşık 60 piksel
    const yarim = el.scrollWidth / 2;
    if (yarim > 0) el.style.setProperty('--wt-bant-sure', Math.max(30, Math.round(yarim / 60)) + 's');
  });

  document.querySelectorAll('#bant-dugme').forEach((d) => {
    d.addEventListener('click', () => {
      const bant = document.getElementById('manset-bandi');
      const durdu = !(bant && bant.classList.contains('wt-durdu'));
      if (bant) bant.classList.toggle('wt-durdu', durdu);
      d.setAttribute('aria-pressed', durdu ? 'true' : 'false');
      d.querySelectorAll('.wt-bant-durdur').forEach((x) => { x.hidden = durdu; });
      d.querySelectorAll('.wt-bant-oynat').forEach((x) => { x.hidden = !durdu; });
    });
  });

  // ================================================================ veri yeniyken açılış
  // Toplama 12.11.2026'da başladı. Yıllık ve aylık değişim olmadan açılış bölümü
  // "başlangıçtan bu yana" görünümüne geçer; veri olmayan özet kutuları gizlenir.
  dash.onData(() => {
    const o = dash.data('ozet');
    const r = o.status === 'ok' && Array.isArray(o.data) ? o.data[0] : null;
    if (!r) return;
    const gy = dash.data('gunluk_yillik');
    const gizle = (sec, gizli) => document.querySelectorAll(sec).forEach((x) => { x.hidden = gizli; });
    const yillikVar = r.yillik_degisim != null;
    gizle('#hero-yillik', !yillikVar);
    gizle('#hero-baslangic', yillikVar);
    gizle('#istat-aylik', r.aylik_degisim == null);
    gizle('#istat-ay-ortalama', r.aylik_degisim != null);
    gizle('#istat-onceki', r.onceki_ay == null);
    gizle('#istat-aralik', !(gy.status === 'ok' && Array.isArray(gy.data) && gy.data.length));
  });

  // ================================================================ resmi göstergeler (TCMB EVDS, canlı)
  // Bu bölümün verileri EVDS bağlayıcısından gelir ve Web TÜFE verileriyle hiçbir hesapta
  // birleştirilmez. get_series_data yanıtı markdown tablodur; yükleyici {tarih, deger} satırlarına çevirir.
  const RESMI_KAYNAKLAR = ['resmi_tufe_yillik', 'resmi_gida_yillik', 'resmi_tufe_aylik', 'resmi_gida_aylik',
    'resmi_usd', 'resmi_aofm', 'resmi_beklenti'];
  // Canlılık matrisinin resmi bileşenleri (haftalık kartlı harcama ve 2022'den resmi TÜFE)
  const MATRIS_RESMI = ['resmi_kart_yillik', 'resmi_tufe_yillik_uzun'];
  RESMI_KAYNAKLAR.concat(MATRIS_RESMI).forEach((id) => dash.loader(id, {
    description: 'EVDS yanıtındaki markdown tablosunu {tarih, deger} satırlarına çevirir: günlük ve haftalık tarih GG-AA-YYYY → YYYY-AA-GG, aylık tarih YYYY-A → YYYY-AA. Değer son sütundur (haftalık serilerde araya YEARWEEK sütunu girer; varsa hafta alanına yazılır). Değeri boş satırlar (tatil, yayımlanmamış dönem) atlanır.',
    fn: ({ answer }) => {
      const metin = typeof answer === 'string' ? answer : (answer && typeof answer.result === 'string' ? answer.result : '');
      const satirlar = metin.split('\n').filter((s) => s.trim().startsWith('|'));
      if (satirlar.length < 3) throw new Error(metin.trim().slice(0, 300) || 'EVDS tablo döndürmedi.');
      const hucre = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const tarih = (s) => {
        let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        m = /^(\d{4})-(\d{1,2})$/.exec(s);
        if (m) return m[1] + '-' + m[2].padStart(2, '0');
        return s;
      };
      const bas = hucre(satirlar[0]);
      const hi = bas.findIndex((b) => /^yearweek$/i.test(b));
      const di = bas.length - 1;
      const rows = satirlar.slice(2).map(hucre).filter((h) => h[di] !== undefined && h[di] !== '')
        .map((h) => ({ tarih: tarih(h[0]), ...(hi > 0 ? { hafta: h[hi] } : {}), deger: Number(h[di]) })).filter((r) => Number.isFinite(r.deger));
      return { columns: hi > 0 ? ['tarih', 'hafta', 'deger'] : ['tarih', 'deger'], rows };
    },
  }));

  dash.calc('resmi_ozet', {
    inputs: RESMI_KAYNAKLAR,
    title: 'Resmi göstergeler: son değerler',
    description: 'Her EVDS serisinin son yayımlanan değeri ve dönemi; ABD doları için son değerin 30 gün önceki (ya da ondan önceki son iş günü) kura göre yüzde değişimi.',
    fn: (tufeYillik, gidaYillik, tufeAylik, gidaAylik, usd, aofm, beklenti) => {
      const sirala = (l) => (Array.isArray(l) ? l.filter((r) => r && r.deger != null).slice().sort((a, b) => (a.tarih < b.tarih ? -1 : 1)) : []);
      const son = (l) => { const s = sirala(l); return s.length ? s[s.length - 1] : null; };
      const u = sirala(usd);
      const uSon = u.length ? u[u.length - 1] : null;
      let usd30 = null;
      if (uSon) {
        const sinir = new Date(Date.parse(uSon.tarih + 'T00:00:00Z') - 30 * 864e5).toISOString().slice(0, 10);
        const once = u.filter((r) => r.tarih <= sinir);
        if (once.length) usd30 = Math.round((uSon.deger / once[once.length - 1].deger - 1) * 10000) / 100;
      }
      const ty = son(tufeYillik), gy = son(gidaYillik), ta = son(tufeAylik), ga = son(gidaAylik), a = son(aofm), b = son(beklenti);
      return [{
        tufe_ay: ty ? ty.tarih : null, tufe_yillik: ty ? ty.deger : null, tufe_aylik: ta ? ta.deger : null,
        gida_ay: gy ? gy.tarih : null, gida_yillik: gy ? gy.deger : null, gida_aylik: ga ? ga.deger : null,
        usd: uSon ? uSon.deger : null, usd_tarih: uSon ? uSon.tarih : null, usd_30g: usd30,
        aofm: a ? a.deger : null, aofm_tarih: a ? a.tarih : null,
        beklenti: b ? b.deger : null, beklenti_ay: b ? b.tarih : null,
      }];
    },
  });

  BICIM.kur = (v) => (sayi(v) == null ? '—' : f2(sayi(v)) + ' TL');

  const resmiTarih = (s) => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || ''));
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1)) : null;
  };
  const resmiNoktalar = (id) => {
    const d = dash.data(id);
    if (d.status !== 'ok' || !Array.isArray(d.data) || !d.data.length) return null;
    return d.data.map((r) => ({ t: resmiTarih(r.tarih), v: Number(r.deger) }))
      .filter((p) => p.t && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  };
  const ayBaslik = (t) => AY[t.getUTCMonth()] + ' ' + t.getUTCFullYear();
  function resmiLejant(el, seriler) {
    const l = document.createElement('div');
    l.className = 'wt-lejant';
    seriler.forEach((s) => {
      const o = document.createElement('span');
      const i = document.createElement('i');
      i.style.cssText = 'display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:' + s.renk;
      o.append(i, document.createTextNode(s.ad));
      l.append(o);
    });
    el.append(l);
  }
  function resmiCiz(el, kaynaklar, secenek) {
    const seriler = kaynaklar.map(([id, ad, renk, kalin]) => ({ id, ad, renk, kalin, noktalar: resmiNoktalar(id) })).filter((s) => s.noktalar);
    if (!seriler.length) {
      const durum = dash.data(kaynaklar[0][0]).status;
      bosYaz(el, durum);
      return;
    }
    wt.cizgi(el, seriler, secenek);
    if (seriler.length > 1) resmiLejant(el, seriler);
  }

  dash.draw('resmi-tufe-grafik', (el) => resmiCiz(el, [
    ['resmi_tufe_yillik', 'TÜFE genel', dash.colors[0], 2.25],
    ['resmi_gida_yillik', 'Gıda ve alkolsüz içecekler', dash.colors[2]],
  ], {
    yukseklik: 260, etiket: 'TÜİK TÜFE yıllık değişim, genel ve gıda, yüzde; kaynak TCMB EVDS',
    yBicim: (v) => '%' + f0(v), ipBicim: (v) => wt.yuzde(v), ipBaslik: ayBaslik,
  }));
  dash.draw('resmi-usd-grafik', (el) => resmiCiz(el, [['resmi_usd', 'ABD doları', dash.colors[0]]], {
    yukseklik: 240, etiket: 'TCMB ABD doları döviz alış kuru, TL; kaynak TCMB EVDS',
    yBicim: (v) => f2(v), ipBicim: (v) => f2(v) + ' TL', ipBaslik: gunBaslik,
  }));
  dash.draw('resmi-aofm-grafik', (el) => resmiCiz(el, [['resmi_aofm', 'Fonlama maliyeti', dash.colors[1]]], {
    yukseklik: 240, etiket: 'TCMB ağırlıklı ortalama fonlama maliyeti, yüzde; kaynak TCMB EVDS',
    yBicim: (v) => '%' + f0(v), ipBicim: (v) => wt.yuzde(v), ipBaslik: gunBaslik,
  }));
  dash.draw('resmi-beklenti-grafik', (el) => resmiCiz(el, [['resmi_beklenti', '12 ay sonrası TÜFE beklentisi', dash.colors[0]]], {
    yukseklik: 240, etiket: 'Piyasa Katılımcıları Anketi, 12 ay sonrası yıllık TÜFE beklentisi, yüzde; kaynak TCMB EVDS',
    yBicim: (v) => '%' + f0(v), ipBicim: (v) => wt.yuzde(v), ipBaslik: ayBaslik,
  }));

  // ================================================================ izleme: ortak parçalar
  // Hareketlilik (İBB trafik indeksi) ve akaryakıt (EPDK) bölümleri. Veri dosyaları boşken
  // her çizim "bekleniyor" der; veri gelince aynı sayfa kendiliğinden dolar.
  BICIM.zaman = (v) => {
    if (!v) return '—';
    const s = String(v);
    return Number(s.slice(8, 10)) + ' ' + AYK[Number(s.slice(5, 7)) - 1] + ' ' + s.slice(0, 4) + (s.length > 10 ? ' ' + s.slice(11, 16) : '');
  };

  // Pozitif değişim yeşil, negatif kırmızı (daha fazla hareketlilik = daha fazla etkinlik)
  dash.draw('alan-renkli', (el) => {
    const satir = satirOku(el);
    const n = satir ? sayi(satir[el.getAttribute('data-field')]) : null;
    el.textContent = wt.isaretli(n);
    el.classList.toggle('wt-iyi', n != null && n > 0);
    el.classList.toggle('wt-kotu', n != null && n < 0);
  });

  // Canlılık noktası: son kaydın yaşı eşikten küçükse yeşil (nabız), büyükse turuncu, veri yoksa gri
  dash.draw('izleme-nabiz', (el) => {
    const d = dash.data(el.getAttribute('data-source'));
    const alan = el.getAttribute('data-alan');
    const esik = Number(el.getAttribute('data-esik-saat') || 30);
    const degerler = d.status === 'ok' && Array.isArray(d.data) ? d.data.map((r) => r[alan]).filter(Boolean).sort() : [];
    const son = degerler[degerler.length - 1];
    let yas = null;
    if (son) {
      const s = String(son);
      const t = Date.parse(s.length > 10 ? s.replace(' ', 'T') + ':00+03:00' : s + 'T23:59:00+03:00');
      if (!isNaN(t)) yas = (Date.now() - t) / 36e5;
    }
    el.classList.toggle('wt-canli-acik', yas != null && yas <= esik);
    el.classList.toggle('wt-canli-eski', yas != null && yas > esik);
    el.title = yas == null ? 'Veri bekleniyor' : yas <= esik ? 'Güncel' : 'Son veri ' + Math.round(yas) + ' saat önce';
  });

  const izlemeLejant = (el, seriler) => {
    const l = document.createElement('div');
    l.className = 'wt-lejant';
    seriler.forEach((s) => {
      const o = document.createElement('span');
      const i = document.createElement('i');
      i.style.cssText = 'display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:' + s.renk;
      o.append(i, document.createTextNode(s.ad));
      l.append(o);
    });
    el.append(l);
  };
  const gunTarih = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  // Haftalık seride yalnızca bitmiş ve en az 4 temiz günü olan haftalar (bayram haftaları ve
  // içinde bulunulan yarım hafta yanıltıcı sıçramalar yapar)
  const MOB_ASGARI_TEMIZ_GUN = 4;
  const tamHaftalar = (rows) => {
    const bugun = new Date().toISOString().slice(0, 10);
    return rows.filter((x) => x.hafta_basi && sayi(x.temiz_gun) >= MOB_ASGARI_TEMIZ_GUN
      && new Date(Date.parse(x.hafta_basi + 'T00:00:00Z') + 6 * 864e5).toISOString().slice(0, 10) < bugun)
      .sort((a, b) => (a.hafta_basi < b.hafta_basi ? -1 : 1));
  };

  // ================================================================ izleme: hareketlilik
  dash.calc('mobilite_ozet', {
    inputs: ['mobilite_haftalik', 'mobilite_saatlik'],
    title: 'Hareketlilik: son tam hafta ve son ölçüm',
    description: 'Son ölçüm gününden önce biten ve en az 4 temiz günü olan son haftanın isteğe bağlı, zorunlu ve hafta sonu gündüz hareketliliğinin geçen yılın aynı haftasına göre yüzde değişimi; son saatlik trafik indeksi ve aynı gün ve saatin önceki 8 haftadaki ortancası.',
    fn: (haftalik, saatlik) => {
      const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const ekle = (t, g) => new Date(Date.parse(t + 'T00:00:00Z') + g * 864e5).toISOString().slice(0, 10);
      const s = (saatlik || []).filter((r) => r.indeks !== null && r.indeks !== '').sort((a, b) => (a.zaman < b.zaman ? -1 : 1));
      const son = s[s.length - 1];
      if (!son) return [];
      const h = (haftalik || []).filter((r) => r.hafta_basi && ekle(r.hafta_basi, 6) < son.tarih && n(r.temiz_gun) >= 4)
        .sort((a, b) => (a.hafta_basi < b.hafta_basi ? -1 : 1)).pop() || {};
      return [{
        hafta: h.hafta ?? null, hafta_basi: h.hafta_basi ?? null, hafta_sonu: h.hafta_basi ? ekle(h.hafta_basi, 6) : null,
        istege_bagli: n(h.istege_bagli_yillik_degisim), zorunlu: n(h.zorunlu_yillik_degisim), karma: n(h.karma_yillik_degisim),
        hafta_sonu_gunduz: n(h.hafta_sonu_gunduz_yillik_degisim), temiz_gun: n(h.temiz_gun),
        son_zaman: son.zaman, son_indeks: n(son.indeks), son_normal: n(son.normal),
      }];
    },
  });

  dash.draw('mobilite-saatlik-grafik', (el) => {
    const d = dash.data('mobilite_saatlik');
    if (d.status !== 'ok') { bosYaz(el, d.status); return; }
    const r = d.data.filter((x) => x.indeks !== null && x.indeks !== '').sort((a, b) => (a.zaman < b.zaman ? -1 : 1));
    if (!r.length) { bosYaz(el, 'ok', 'Trafik verisi bekleniyor. Toplama başladığında son 21 günün saatlik indeksi burada görünür.'); return; }
    const t = (z) => new Date(Date.UTC(+z.slice(0, 4), +z.slice(5, 7) - 1, +z.slice(8, 10), +z.slice(11, 13)));
    const seriler = [
      { ad: 'Normal: aynı gün ve saat, önceki 8 hafta', renk: 'var(--cds-chart-reference)', kalin: 1.25, noktalar: r.map((x) => ({ t: t(x.zaman), v: sayi(x.normal) })) },
      { ad: 'Trafik indeksi', renk: dash.colors[0], kalin: 1.75, noktalar: r.map((x) => ({ t: t(x.zaman), v: sayi(x.indeks) })) },
    ];
    wt.cizgi(el, seriler, {
      yukseklik: 260, etiket: 'İstanbul trafik indeksi, son 21 gün, saatlik; ve aynı gün ve saatin önceki 8 haftalık ortancası',
      yBicim: (v) => f0(v), ipBicim: (v) => f0(v), sifirdan: true,
      ipBaslik: (x) => x.getUTCDate() + ' ' + AY[x.getUTCMonth()] + ', ' + String(x.getUTCHours()).padStart(2, '0') + ':00',
    });
    izlemeLejant(el, seriler.slice().reverse());
  });

  dash.draw('mobilite-haftalik-grafik', (el) => {
    const d = dash.data('mobilite_haftalik');
    if (d.status !== 'ok') { bosYaz(el, d.status); return; }
    const r = tamHaftalar(d.data).filter((x) => x.istege_bagli_yillik_degisim != null || x.zorunlu_yillik_degisim != null);
    if (!r.length) { bosYaz(el, 'ok', 'Yıllık karşılaştırma için en az bir yıllık veri gerekiyor.'); return; }
    const seriler = [
      { ad: 'Zorunlu (iş günü 06–09)', renk: 'var(--cds-chart-reference)', kalin: 1.25, noktalar: r.map((x) => ({ t: gunTarih(x.hafta_basi), v: sayi(x.zorunlu_yillik_degisim) })) },
      { ad: 'Hafta sonu gündüz (11–19)', renk: dash.colors[2], kalin: 1.5, noktalar: r.map((x) => ({ t: gunTarih(x.hafta_basi), v: sayi(x.hafta_sonu_gunduz_yillik_degisim) })) },
      { ad: 'İsteğe bağlı (bileşik)', renk: dash.colors[0], kalin: 2.25, noktalar: r.map((x) => ({ t: gunTarih(x.hafta_basi), v: sayi(x.istege_bagli_yillik_degisim) })) },
    ];
    wt.cizgi(el, seriler, {
      yukseklik: 260, etiket: 'Haftalık hareketliliğin geçen yılın aynı haftasına göre yüzde değişimi: isteğe bağlı, hafta sonu gündüz ve zorunlu',
      yBicim: (v) => (v < 0 ? '−%' : '%') + f0(Math.abs(v)), ipBicim: (v) => wt.isaretli(v),
      ipBaslik: (x) => x.getUTCDate() + ' ' + AY[x.getUTCMonth()] + ' ' + x.getUTCFullYear() + ' haftası', sifirdan: true, sifirCizgisi: true,
    });
    izlemeLejant(el, seriler.slice().reverse());
  });

  const MOB_PENCERELER = [
    ['hafta_sonu_gunduz', 'Hafta sonu 11–19'], ['hafta_sonu_gece', 'Hafta sonu 20–23'], ['is_gunu_gece', 'İş günü 20–23'],
    ['is_gunu_ogle', 'İş günü 10–15'], ['karma_aksam', 'İş günü 16–19 (karma)'], ['zorunlu_sabah', 'İş günü 06–09 (zorunlu)'],
  ];
  dash.draw('mobilite-isi', (el) => {
    const d = dash.data('mobilite_haftalik');
    el.replaceChildren();
    if (d.status !== 'ok') { bosYaz(el, d.status); return; }
    const haftalar = tamHaftalar(d.data).filter((x) => MOB_PENCERELER.some(([p]) => x[p + '_yillik_degisim'] != null)).slice(-10);
    if (!haftalar.length) { bosYaz(el, 'ok', 'Yıllık karşılaştırma için en az bir yıllık veri gerekiyor.'); return; }
    const tablo = document.createElement('table');
    tablo.className = 'wt-isi';
    tablo.setAttribute('aria-label', 'Saat pencerelerine göre haftalık yıllık değişim');
    const htr = document.createElement('tr');
    const bos = document.createElement('th');
    bos.className = 'wt-isi-ad';
    htr.append(bos);
    haftalar.forEach((h) => {
      const th = document.createElement('th');
      const g = gunTarih(h.hafta_basi);
      th.textContent = g.getUTCDate() + ' ' + AYK[g.getUTCMonth()];
      htr.append(th);
    });
    const thead = document.createElement('thead');
    thead.append(htr);
    const tbody = document.createElement('tbody');
    MOB_PENCERELER.forEach(([p, ad]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'wt-isi-ad';
      th.textContent = ad;
      tr.append(th);
      haftalar.forEach((h) => {
        const td = document.createElement('td');
        const v = sayi(h[p + '_yillik_degisim']);
        if (v != null) {
          const yogunluk = Math.round(Math.min(1, Math.abs(v) / 20) * 70) + 6;
          td.style.background = `color-mix(in srgb, ${v >= 0 ? 'var(--color-ok)' : 'var(--color-bad)'} ${yogunluk}%, transparent)`;
          td.textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + f0(Math.abs(v));
          td.title = ad + ', ' + BICIM.zaman(h.hafta_basi) + ' haftası: ' + wt.isaretli(v);
        } else {
          td.textContent = '·';
          td.title = 'Karşılaştırma yok (tatil ya da geçen yıl karşılığı yok)';
        }
        tr.append(td);
      });
      tbody.append(tr);
    });
    tablo.append(thead, tbody);
    el.append(tablo);
  });

  // ================================================================ izleme: akaryakıt
  dash.calc('akaryakit_ozet', {
    inputs: ['akaryakit_ulke', 'akaryakit_il'],
    title: 'Akaryakıt: son fiyatlar',
    description: 'Benzin ve motorinde 8 firma ülke ortalamasının son değeri ve 30 gün önceki (ya da ondan önceki son) değere göre yüzde değişimi; otogazda il ortancalarının ortancası; benzinde en pahalı ve en ucuz il ile aradaki fark.',
    fn: (ulke, il) => {
      const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const ortanca = (a) => { const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
      const satir = {};
      let tarihUlke = null;
      ['Benzin', 'Motorin'].forEach((y) => {
        const s = (ulke || []).filter((r) => r.yakit === y && n(r.fiyat) != null).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
        const son = s[s.length - 1];
        const anahtar = y.toLocaleLowerCase('tr');
        if (!son) { satir[anahtar] = null; satir[anahtar + '_30g'] = null; return; }
        tarihUlke = son.tarih;
        const sinir = new Date(Date.parse(son.tarih + 'T00:00:00Z') - 30 * 864e5).toISOString().slice(0, 10);
        const once = s.filter((r) => r.tarih <= sinir).pop();
        satir[anahtar] = n(son.fiyat);
        satir[anahtar + '_30g'] = once ? Math.round((n(son.fiyat) / n(once.fiyat) - 1) * 10000) / 100 : null;
      });
      const oto = (il || []).filter((r) => r.yakit === 'Otogaz' && n(r.ortanca) != null).map((r) => n(r.ortanca));
      const benzin = (il || []).filter((r) => r.yakit === 'Benzin' && n(r.ortanca) != null).sort((a, b) => n(a.ortanca) - n(b.ortanca));
      const ilTarih = (il || []).map((r) => r.tarih).filter(Boolean).sort().pop() || null;
      if (!tarihUlke && !ilTarih) return [];
      return [{
        tarih_ulke: tarihUlke, ...satir, il_tarih: ilTarih,
        otogaz: oto.length ? Math.round(ortanca(oto) * 100) / 100 : null, otogaz_il: oto.length || null,
        pahali_il: benzin.length ? benzin[benzin.length - 1].il_adi : null, ucuz_il: benzin.length ? benzin[0].il_adi : null,
        benzin_fark: benzin.length > 1 ? Math.round((n(benzin[benzin.length - 1].ortanca) - n(benzin[0].ortanca)) * 100) / 100 : null,
      }];
    },
  });

  dash.calc('akaryakit_il_tablo', {
    inputs: ['akaryakit_il'],
    title: 'Akaryakıt: illere göre son fiyatlar',
    description: 'Her il için benzin, motorin ve otogazın firma ortancası (son 45 günde fiyat bildiren firmalar), benzinde 30 gün önceye göre değişim ve en çok firma sayısı.',
    fn: (il) => {
      const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const m = new Map();
      (il || []).forEach((r) => {
        const k = String(r.il_kodu);
        if (!m.has(k)) m.set(k, { il_kodu: k, il_adi: r.il_adi, benzin: null, motorin: null, otogaz: null, benzin_degisim: null, firma: 0 });
        const o = m.get(k);
        const y = String(r.yakit || '').toLocaleLowerCase('tr');
        if (y in o) o[y] = n(r.ortanca);
        if (y === 'benzin') o.benzin_degisim = n(r.degisim);
        o.firma = Math.max(o.firma, n(r.firma) || 0);
      });
      return [...m.values()];
    },
  });

  dash.draw('akaryakit-seyir-grafik', (el) => {
    const d = dash.data('akaryakit_ulke');
    if (d.status !== 'ok') { bosYaz(el, d.status); return; }
    const seri = (y, renk, kalin) => ({ ad: y, renk, kalin, noktalar: d.data.filter((r) => r.yakit === y && r.fiyat !== null && r.fiyat !== '')
      .sort((a, b) => (a.tarih < b.tarih ? -1 : 1)).map((r) => ({ t: gunTarih(r.tarih), v: sayi(r.fiyat) })) });
    const seriler = [seri('Motorin', dash.colors[2], 1.75), seri('Benzin', dash.colors[0], 2)].filter((s) => s.noktalar.length);
    if (!seriler.length) { bosYaz(el, 'ok', 'Ülke ortalaması bekleniyor. GitHub\'daki toplama 2023 başından bugüne eksik günleri dolduracak; veri gelince burada görünür.'); return; }
    wt.cizgi(el, seriler, {
      yukseklik: 260, etiket: 'Benzin ve motorinde en yüksek hacimli 8 firmanın ülke ortalaması bayi satış fiyatı, TL/litre',
      yBicim: (v) => f0(v), ipBicim: (v) => f2(v) + ' TL', ipBaslik: gunBaslik,
    });
    izlemeLejant(el, seriler.slice().reverse());
  });

  wt.akaryakitSira = 'benzin';
  document.querySelectorAll('#akaryakit-sira').forEach((s) => s.addEventListener('change', () => {
    wt.akaryakitSira = s.value;
    dash.draw('akaryakit-il-satirlar');
  }));
  dash.draw('akaryakit-il-satirlar', (el) => {
    const d = dash.data('akaryakit_il_tablo');
    el.replaceChildren();
    const mesaj = (metin) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'wt-bos-durum';
      td.textContent = metin;
      tr.append(td);
      el.append(tr);
    };
    if (d.status !== 'ok') { mesaj(d.status === 'error' ? 'Yüklenemedi' : '—'); return; }
    const satirlar = (d.data || []).slice();
    if (!satirlar.length) { mesaj('İl fiyatları bekleniyor. 81 ilin ilk toplaması GitHub\'daki günlük işte yapılacak; veri gelince bu tablo dolar.'); return; }
    const alan = wt.akaryakitSira;
    if (alan === 'il') satirlar.sort((a, b) => String(a.il_adi).localeCompare(String(b.il_adi), 'tr'));
    else satirlar.sort((a, b) => (sayi(b[alan]) ?? -1) - (sayi(a[alan]) ?? -1));
    const ref = alan === 'il' ? 'benzin' : alan;
    const deg = satirlar.map((r) => sayi(r[ref])).filter((v) => v != null);
    const [alt, ust] = [Math.min(...deg), Math.max(...deg)];
    satirlar.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-key', r.il_kodu);
      const td = (metin, sinif) => { const c = document.createElement('td'); if (sinif) c.className = sinif; c.textContent = metin; return c; };
      tr.append(td(r.il_adi));
      ['benzin', 'motorin', 'otogaz'].forEach((y) => {
        const c = td('', 'wt-say');
        const v = sayi(r[y]);
        if (y === ref && v != null && ust > alt) {
          const cubuk = document.createElement('span');
          cubuk.className = 'wt-il-cubuk';
          const i = document.createElement('i');
          i.style.width = Math.max(4, Math.round((v - alt) / (ust - alt) * 100)) + '%';
          cubuk.append(i);
          c.append(cubuk);
        }
        c.append(document.createTextNode(v == null ? '—' : f2(v)));
        tr.append(c);
      });
      const dg = sayi(r.benzin_degisim);
      const c = td(wt.isaretli(dg), 'wt-say');
      if (dg != null) c.classList.add(dg > 0 ? 'wt-kotu' : dg < 0 ? 'wt-iyi' : 'wt-not');
      tr.append(c, td(r.firma ? f0(sayi(r.firma)) : '—', 'wt-say'));
      el.append(tr);
    });
  });

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
})();
