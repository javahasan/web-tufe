
  // ================================================================ akaryakıt ve mobilite
  const I = { aralik: 365, sira: 'benzin', ara: '' };
  const ortanca = (a) => { const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
  const izlemeBekliyor = (ad, ne) => (dosyaDurumu(ad) === 'hata' ? ne + ' dosyası okunamadı.' : D.guncel && !(D.guncel.dosyalar || {})[ad] ? ne + ' verisi henüz yüklenmedi.' : ne + ' verisi yükleniyor…');

  function yakitOzet() {
    const ulke = dosya('akaryakit_ulke'), il = dosya('akaryakit_il');
    if (!ulke && !il) return null;
    const o = {};
    ['Benzin', 'Motorin'].forEach((y) => {
      const s = (ulke || []).filter((r) => r.yakit === y && !yok(r.fiyat)).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
      const son = sonEleman(s);
      if (!son) return;
      const once = s.filter((r) => r.tarih <= gunEkle(son.tarih, -30)).pop();
      const yil = s.filter((r) => r.tarih <= gunEkle(son.tarih, -365)).pop();
      o[y] = { fiyat: son.fiyat, tarih: son.tarih, d30: once ? (son.fiyat / once.fiyat - 1) * 100 : null, d365: yil ? (son.fiyat / yil.fiyat - 1) * 100 : null, seri: s };
    });
    const oto = (il || []).filter((r) => r.yakit === 'Otogaz' && !yok(r.ortanca)).map((r) => r.ortanca);
    const benzin = (il || []).filter((r) => r.yakit === 'Benzin' && !yok(r.ortanca)).sort((a, b) => a.ortanca - b.ortanca);
    o.otogaz = oto.length ? ortanca(oto) : null;
    o.otogazIl = oto.length;
    o.ilTarih = (il || []).map((r) => r.tarih).filter(Boolean).sort().pop() || null;
    if (benzin.length > 1) { o.pahali = sonEleman(benzin); o.ucuz = benzin[0]; }
    return o;
  }

  function yakitCiz() {
    const o = yakitOzet();
    const kap = $('#yakit-kpi');
    if (!o) { kap.replaceChildren(...['Benzin', 'Motorin', 'Otogaz', 'Benzinde il farkı'].map((e) => kpi({ kaynak: 'yakit', etiket: e, bekliyor: true, altBekliyor: izlemeBekliyor('akaryakit_ulke', 'Akaryakıt') }))); }
    else {
      const yk = (ad) => {
        const x = o[ad];
        if (!x) return kpi({ kaynak: 'yakit', etiket: ad + ', ülke ortalaması', deger: '—', alt: 'Veri yok' });
        return kpi({ kaynak: 'yakit', etiket: ad + ', ülke ortalaması', deger: B.sayi(x.fiyat), birim: 'TL/lt', degisim: x.d30 != null ? B.isaretli(x.d30) + ' 30 günde' : null, sinif: yonSinif(x.d30, false),
          alt: [gunMetin(x.tarih), x.d365 != null ? 'yıllık ' + B.isaretli(x.d365, 1) : null], spark: x.seri.slice(-90).map((r) => r.fiyat) });
      };
      kap.replaceChildren(yk('Benzin'), yk('Motorin'),
        kpi({ kaynak: 'yakit', etiket: 'Otogaz, il ortancası', deger: B.sayi(o.otogaz), birim: 'TL/lt', alt: o.otogazIl ? o.otogazIl + ' il · ' + gunMetin(o.ilTarih) : 'Veri yok' }),
        kpi({ kaynak: 'yakit', etiket: 'Benzinde il farkı', deger: o.pahali ? B.sayi(o.pahali.ortanca - o.ucuz.ortanca) : '—', birim: 'TL/lt',
          alt: o.pahali ? 'En pahalı ' + o.pahali.il_adi + ' (' + B.sayi(o.pahali.ortanca) + '), en ucuz ' + o.ucuz.il_adi + ' (' + B.sayi(o.ucuz.ortanca) + ')' : 'Veri yok' }));
    }
    // seyir
    $$('#yakit-aralik button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.deger) === I.aralik)));
    const g = $('#yakit-grafik');
    if (!o || !o.Benzin) bosYaz(g, izlemeBekliyor('akaryakit_ulke', 'Akaryakıt'));
    else {
      const sinir = I.aralik ? gunEkle(o.Benzin.tarih, -I.aralik) : '0000';
      const seri = (ad, renk, kalin) => ({ ad, renk, kalin, noktalar: (o[ad] ? o[ad].seri : []).filter((r) => r.tarih >= sinir).map((r) => ({ x: tarih(r.tarih), y: r.fiyat })) });
      cizgiGrafik(g, { etiket: 'Benzin ve motorin ülke ortalaması, TL/litre', ipBicim: (v) => B.sayi(v) + ' TL', yBicim: (v) => B.sayi(v, 0), ipTolerans: 12,
        seriler: [seri('Motorin', 'var(--s1)', 1.8), seri('Benzin', 'var(--yakit)', 2.4)] });
    }
    // il tablosu
    const t = $('#yakit-il-tablo');
    const il = dosya('akaryakit_il');
    if (!il || !il.length) { bosYaz(t, izlemeBekliyor('akaryakit_il', 'İl fiyatları')); return; }
    const m = new Map();
    il.forEach((r) => {
      const k = String(r.il_kodu);
      if (!m.has(k)) m.set(k, { il: r.il_adi, benzin: null, motorin: null, otogaz: null, degisim: null, firma: 0 });
      const x = m.get(k), y = kucuk(r.yakit);
      if (y in x) x[y] = r.ortanca;
      if (y === 'benzin') x.degisim = r.degisim;
      x.firma = Math.max(x.firma, r.firma || 0);
    });
    let satirlar = [...m.values()];
    const ara = kucuk(I.ara).trim();
    if (ara) satirlar = satirlar.filter((r) => kucuk(r.il).includes(ara));
    if (I.sira === 'il') satirlar.sort((a, b) => a.il.localeCompare(b.il, 'tr'));
    else satirlar.sort((a, b) => (b[I.sira] ?? -1) - (a[I.sira] ?? -1));
    const ref = I.sira === 'il' ? 'benzin' : I.sira;
    const deg = [...m.values()].map((r) => r[ref]).filter((v) => !yok(v));
    const [alt, ust] = [Math.min(...deg), Math.max(...deg)];
    $('#yakit-il-not').textContent = 'Firma ortancası, TL/litre · ' + gunMetin(o && o.ilTarih);
    t.replaceChildren(el('table', { class: 'veri' },
      el('thead', {}, el('tr', {}, el('th', { text: 'İl' }), el('th', { class: 'say', text: 'Benzin' }), el('th', { class: 'say', text: 'Motorin' }), el('th', { class: 'say', text: 'Otogaz' }), el('th', { class: 'say', text: 'Firma' }))),
      el('tbody', {}, satirlar.length ? satirlar.map((r) => el('tr', {},
        el('td', { text: r.il }),
        ...['benzin', 'motorin', 'otogaz'].map((y) => {
          const v = r[y];
          const td = el('td', { class: 'say' });
          if (y === ref && !yok(v) && ust > alt) { const c = el('span', { class: 'cubukcuk' }); c.style.setProperty('--kaynak', 'var(--yakit)'); c.append(el('i', { style: { width: Math.max(4, Math.round((v - alt) / (ust - alt) * 100)) + '%' } })); td.append(c); }
          td.append(B.sayi(v));
          return td;
        }),
        el('td', { class: 'say', text: r.firma ? F[0](r.firma) : '—' }))) : el('tr', {}, el('td', { colspan: '5', class: 'bos-durum', text: 'Bu adla il bulunamadı.' })))));
  }
  $$('#yakit-aralik button').forEach((b) => b.addEventListener('click', () => { I.aralik = Number(b.dataset.deger); yakitCiz(); }));
  $('#yakit-il-sira').addEventListener('change', (e) => { I.sira = e.target.value; yakitCiz(); });
  $('#yakit-il-ara').addEventListener('input', (e) => { I.ara = e.target.value; yakitCiz(); });

  // ---------------------------------------------------------------- hareketlilik
  const MOB_ASGARI_TEMIZ = 4;
  function tamHaftalar(rows, sonGun) {
    const sinir = sonGun || bugunTR();
    return (rows || []).filter((x) => x.hafta_basi && x.temiz_gun >= MOB_ASGARI_TEMIZ && gunEkle(x.hafta_basi, 6) < sinir).sort((a, b) => (a.hafta_basi < b.hafta_basi ? -1 : 1));
  }
  const MOB_PENCERELER = [
    ['hafta_sonu_gunduz', 'Hafta sonu 11–19'], ['hafta_sonu_gece', 'Hafta sonu 20–23'], ['is_gunu_gece', 'İş günü 20–23'],
    ['is_gunu_ogle', 'İş günü 10–15'], ['karma_aksam', 'İş günü 16–19 (karma)'], ['zorunlu_sabah', 'İş günü 06–09 (zorunlu)'],
  ];
  function mobiliteCiz() {
    const saatlik = dosya('mobilite_saatlik'), haftalik = dosya('mobilite_haftalik');
    const s = (saatlik || []).filter((r) => !yok(r.indeks)).sort((a, b) => (a.zaman < b.zaman ? -1 : 1));
    const son = sonEleman(s);
    const hafta = haftalik && son ? sonEleman(tamHaftalar(haftalik, son.tarih)) : null;
    const kap = $('#mobilite-kpi');
    if (!haftalik || !son) kap.replaceChildren(...['İsteğe bağlı', 'Zorunlu', 'Hafta sonu gündüz', 'Son ölçüm'].map((e) => kpi({ kaynak: 'trafik', etiket: e, bekliyor: true, altBekliyor: izlemeBekliyor('mobilite_haftalik', 'Trafik') })));
    else {
      const tamlar = tamHaftalar(haftalik, son.tarih);
      const aralik = (h) => gunMetin(h.hafta_basi, true) + '–' + gunMetin(gunEkle(h.hafta_basi, 6));
      // Bir göstergenin son tam haftada karşılaştırması yoksa (geçen yılın aynı haftası tatil) bir önceki haftası gösterilir
      const hk = (alan, etiket) => {
        const h = tamlar.filter((r) => !yok(r[alan])).pop();
        return kpi({ kaynak: 'trafik', etiket: etiket + ', yıllık', deger: h ? B.isaretli(h[alan]) : '—', sinif: h ? yonSinif(h[alan], true) : 'notr',
          alt: h ? (h === hafta ? 'Son tam hafta ' : 'Hafta ') + aralik(h) : 'Karşılaştırma yok', spark: tamlar.slice(-26).map((r) => r[alan]) });
      };
      const fark = !yok(son.normal) && son.normal ? (son.indeks / son.normal - 1) * 100 : null;
      kap.replaceChildren(hk('istege_bagli_yillik_degisim', 'İsteğe bağlı hareketlilik'), hk('zorunlu_yillik_degisim', 'Zorunlu hareketlilik'), hk('hafta_sonu_gunduz_yillik_degisim', 'Hafta sonu gündüz'),
        kpi({ kaynak: 'trafik', etiket: 'Son ölçüm, trafik indeksi', deger: '%' + F[0](son.indeks), degisim: fark != null ? 'normal %' + F[0](son.normal) : null, sinif: 'notr', alt: gunMetin(son.tarih) + ' ' + String(son.saat).padStart(2, '0') + ':00' }));
    }
    const sg = $('#mobilite-saatlik-grafik');
    if (!s.length) bosYaz(sg, izlemeBekliyor('mobilite_saatlik', 'Trafik'));
    else {
      cizgiGrafik(sg, { etiket: 'İstanbul trafik indeksi, son 21 gün, saatlik', sifir: true, ipTolerans: 6, yBicim: (v) => '%' + F[0](v), ipBicim: (v) => '%' + F[0](v), sonEtiket: false,
        ipBaslik: (d) => d.getUTCDate() + ' ' + AY[d.getUTCMonth()] + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':00',
        seriler: [{ ad: 'Normal (önceki 8 hafta)', renk: 'var(--faint)', kalin: 1.2, noktalar: s.map((r) => ({ x: tarih(r.zaman), y: r.normal })) },
          { ad: 'Trafik indeksi', renk: 'var(--trafik)', kalin: 1.6, noktalar: s.map((r) => ({ x: tarih(r.zaman), y: r.indeks })) }] });
    }
    const hg = $('#mobilite-haftalik-grafik');
    const tamlar = haftalik && son ? tamHaftalar(haftalik, son.tarih).filter((x) => !yok(x.istege_bagli_yillik_degisim)) : [];
    if (!tamlar.length) bosYaz(hg, haftalik ? 'Yıllık karşılaştırma için en az bir yıllık veri gerekiyor.' : izlemeBekliyor('mobilite_haftalik', 'Trafik'));
    else {
      const n = (alan) => tamlar.map((x) => ({ x: tarih(x.hafta_basi), y: x[alan] }));
      cizgiGrafik(hg, { yuzde: true, etiket: 'Haftalık hareketliliğin yıllık değişimi', ipBicim: (v) => B.isaretli(v, 1), ipBaslik: (d) => gunMetin(d) + ' haftası', ipTolerans: 10, referanslar: [{ y: 0 }],
        seriler: [{ ad: 'Zorunlu (iş günü 06–09)', renk: 'var(--faint)', kalin: 1.3, noktalar: n('zorunlu_yillik_degisim') },
          { ad: 'Hafta sonu gündüz', renk: 'var(--s1)', kalin: 1.5, noktalar: n('hafta_sonu_gunduz_yillik_degisim') },
          { ad: 'İsteğe bağlı (bileşik)', renk: 'var(--trafik)', kalin: 2.4, noktalar: n('istege_bagli_yillik_degisim') }] });
    }
    const ik = $('#mobilite-isi');
    const hs = haftalik && son ? tamHaftalar(haftalik, son.tarih).filter((x) => MOB_PENCERELER.some(([p]) => !yok(x[p + '_yillik_degisim']))).slice(-10) : [];
    if (!hs.length) { bosYaz(ik, haftalik ? 'Yıllık karşılaştırma için en az bir yıllık veri gerekiyor.' : izlemeBekliyor('mobilite_haftalik', 'Trafik')); return; }
    ik.replaceChildren(el('table', { class: 'isi-tablo', 'aria-label': 'Saat pencerelerine göre haftalık yıllık değişim' },
      el('thead', {}, el('tr', {}, el('th', { class: 'ad' }), hs.map((h) => el('th', { text: gunMetin(h.hafta_basi, true) })))),
      el('tbody', {}, MOB_PENCERELER.map(([p, ad]) => el('tr', {}, el('th', { class: 'ad', text: ad }), hs.map((h) => {
        const v = h[p + '_yillik_degisim'];
        if (yok(v)) return el('td', { text: '·', title: 'Karşılaştırma yok' });
        const yog = Math.round(Math.min(1, Math.abs(v) / 20) * 62) + 8;
        return el('td', { text: isaret(v, 0) + F[0](Math.abs(v)), title: ad + ', ' + gunMetin(h.hafta_basi) + ' haftası: ' + B.isaretli(v),
          style: { background: 'color-mix(in srgb, ' + (v >= 0 ? 'var(--ok)' : 'var(--bad)') + ' ' + yog + '%, transparent)' } });
      }))))));
  }

  cizimler['akaryakit-mobilite'] = () => { yakitCiz(); mobiliteCiz(); };
