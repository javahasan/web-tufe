
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
  const SAYFALAR = ['genel-bakis', 'gruplar', 'cekirdek', 'maddeler', 'araclar', 'veri', 'resmi'];
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
  RESMI_KAYNAKLAR.forEach((id) => dash.loader(id, {
    description: 'EVDS yanıtındaki markdown tablosunu {tarih, deger} satırlarına çevirir: günlük tarih GG-AA-YYYY → YYYY-AA-GG, aylık tarih YYYY-A → YYYY-AA. Değeri boş satırlar (tatil, yayımlanmamış dönem) atlanır.',
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
      const rows = satirlar.slice(2).map(hucre).filter((h) => h[1] !== undefined && h[1] !== '')
        .map((h) => ({ tarih: tarih(h[0]), deger: Number(h[1]) })).filter((r) => Number.isFinite(r.deger));
      return { columns: ['tarih', 'deger'], rows };
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
})();
