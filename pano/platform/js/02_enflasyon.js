
  // ================================================================ enflasyon takibi
  const WEB_ADLAR = {
    TUFE: 'Genel endeks', TUFE_B: 'B göstergesi', TUFE_C: 'C göstergesi', TUFE_D: 'D göstergesi', TUFE_E: 'E göstergesi',
    '01': 'Gıda ve alkolsüz içecekler', '05': 'Mobilya, ev eşyası ve ev bakımı', '09': 'Eğlence, dinlence ve kültür', '13': 'Kişisel bakım ve çeşitli',
    GIDA: 'Gıda ve alkolsüz içecekler', ISLENMEMIS_GIDA: 'İşlenmemiş gıda', ISLENMIS_GIDA: 'İşlenmiş gıda', TAZE_MS: 'Taze meyve ve sebze',
    MALLAR: 'Mallar', TEMEL_MALLAR: 'Temel mallar', MEVSIMLIK_HARIC: 'Mevsimlik ürünler hariç', ENERJI: 'Enerji', HIZMET: 'Hizmet',
  };
  const WEB_SECENEK = ['TUFE', 'TUFE_B', 'TUFE_C', '01', 'ISLENMEMIS_GIDA', 'ISLENMIS_GIDA', 'TAZE_MS', '05', '13'];
  const WEB_TABLO = ['TUFE', '01', '05', '09', '13', 'TUFE_B', 'TUFE_C', 'TUFE_D', 'TUFE_E', 'MALLAR', 'TEMEL_MALLAR', 'ISLENMEMIS_GIDA', 'ISLENMIS_GIDA', 'TAZE_MS', 'MEVSIMLIK_HARIC'];
  const E = { secili: ['TUFE', 'TUFE_B', '01'], donem: 'gunluk', aralik: 48 };

  function webVeri() {
    const g = dosya('gunluk');
    if (!g) return null;
    const seriler = seriGrupla(g.filter((r) => !yok(r.endeks)), 'seri_kodu', 'tarih');
    const genel = seriler.get('TUFE') || [];
    if (!genel.length) return null;
    return { seriler, genel, son: sonEleman(genel), ilk: genel[0], gunler: genel.map((r) => r.tarih) };
  }
  const webBekliyorMetin = () => (dosyaDurumu('gunluk') === 'hata' ? 'Web TÜFE dosyası okunamadı.' : !D.cap.db && D.dbHazir ? 'Web TÜFE verisi yalnızca Claude içinde açıldığında okunur.' : 'Web TÜFE verisi yükleniyor…');

  function webKpiCiz(w) {
    const kap = $('#web-kpi');
    if (!w) { kap.replaceChildren(...['Genel endeks', 'Önceki toplamaya göre', 'B göstergesi', 'Kapsam'].map((e) => kpi({ kaynak: 'web', etiket: e, bekliyor: true, altBekliyor: webBekliyorMetin() }))); return; }
    const { son, genel, ilk } = w;
    const onceki = genel.length > 1 ? genel[genel.length - 2] : null;
    const bSeri = w.seriler.get('TUFE_B') || [];
    const bSon = sonEleman(bSeri);
    const maddeler = dosya('madde_endeksleri');
    const maddeSayisi = maddeler ? new Set(maddeler.filter((r) => r.tarih === son.tarih).map((r) => r.seri_kodu)).size : null;
    kap.replaceChildren(
      kpi({ kaynak: 'web', etiket: 'Genel endeks', deger: B.sayi(son.endeks), birim: gunMetin(ilk.tarih, true) + ' = 100', degisim: B.isaretli(son.endeks - 100) + ' başlangıçtan', sinif: yonSinif(son.endeks - 100, false),
        alt: genel.length + ' toplama günü · son ' + gunMetin(son.tarih, true), spark: genel.map((r) => r.endeks) }),
      kpi({ kaynak: 'web', etiket: 'Önceki toplamaya göre', deger: B.isaretli(son.gunluk_degisim), sinif: yonSinif(son.gunluk_degisim, false),
        alt: onceki ? gunMetin(onceki.tarih, true) + ' → ' + gunMetin(son.tarih, true) : 'İlk toplama günü', spark: genel.map((r) => r.gunluk_degisim).filter((v) => !yok(v)) }),
      kpi({ kaynak: 'web', etiket: 'B göstergesi, başlangıçtan', deger: bSon ? B.isaretli(bSon.endeks - 100) : '—', alt: bSon ? 'İşlenmemiş gıda, enerji, alkol, tütün ve altın hariç · kapsam %' + F[1](bSon.kapsam) : 'Veri yok', spark: bSeri.map((r) => r.endeks) }),
      kpi({ kaynak: 'web', etiket: 'Kapsam', deger: '%' + F[1](son.kapsam), alt: (maddeSayisi ? maddeSayisi + ' madde · ' : '') + 'TÜİK sepet ağırlığının fiyatı izlenen payı' }),
    );
  }

  function webSeyirCiz(w) {
    const secim = $('#web-seyir-secim'), kap = $('#web-seyir-grafik');
    if (!w) { secim.replaceChildren(); bosYaz(kap, webBekliyorMetin()); return; }
    const mevcut = WEB_SECENEK.filter((k) => (w.seriler.get(k) || []).length);
    E.secili = E.secili.filter((k) => mevcut.includes(k));
    if (!E.secili.length) E.secili = ['TUFE'];
    const renkOf = (k) => (k === 'TUFE' ? 'var(--web)' : seriRenk(E.secili.filter((x) => x !== 'TUFE').indexOf(k)));
    secim.replaceChildren(...mevcut.map((k) => {
      const acik = E.secili.includes(k);
      const b = el('button', { type: 'button', class: 'cip', 'aria-pressed': acik ? 'true' : 'false', disabled: !acik && E.secili.length >= 5 }, el('i'), WEB_ADLAR[k] || k);
      if (acik) b.style.setProperty('--renk', renkOf(k));
      b.addEventListener('click', () => {
        E.secili = acik ? E.secili.filter((x) => x !== k) : E.secili.concat(k);
        if (!E.secili.length) E.secili = ['TUFE'];
        webSeyirCiz(webVeri());
      });
      return b;
    }));
    cizgiGrafik(kap, {
      etiket: 'Web TÜFE günlük endeksleri, ilk toplama günü = 100',
      seriler: E.secili.map((k) => ({ ad: WEB_ADLAR[k] || k, renk: renkOf(k), kalin: k === 'TUFE' ? 2.6 : 1.8, alan: k === 'TUFE' && E.secili.length === 1,
        noktalar: (w.seriler.get(k) || []).map((r) => ({ x: tarih(r.tarih), y: r.endeks })) })),
      referanslar: [{ y: 100, ad: 'Baz = 100', sag: true }], ipBicim: (v) => B.sayi(v, 2), yBicim: (v) => B.sayi(v, 1),
    });
    const bosluk = [];
    for (let i = 1; i < w.gunler.length; i++) { const a = Date.parse(w.gunler[i - 1]), b = Date.parse(w.gunler[i]); if ((b - a) / 864e5 > 1) bosluk.push(gunMetin(gunEkle(w.gunler[i - 1], 1), true) + '–' + gunMetin(gunEkle(w.gunler[i], -1), true)); }
    $('#web-seyir-not').textContent = bosluk.length ? 'Toplama yapılmayan günler (' + bosluk.join(', ') + ') çizgiyle birleştirilir.' : '';
  }

  function webYayginlikCiz(w) {
    const kap = $('#web-yayginlik-icerik');
    const sd = dosya('son_degisimler'), mi = dosya('madde_endeksleri'), ag = dosya('agirliklar');
    if (!w || !sd) { bosYaz(kap, webBekliyorMetin()); return; }
    const maddeler = sd.filter((r) => r.duzey === 'madde' && !yok(r.gunluk));
    if (!maddeler.length) { bosYaz(kap, 'Karşılaştırma için en az iki toplama günü gerekiyor.'); return; }
    const agirlik = {};
    (ag || []).forEach((r) => { agirlik[r.madde_kodu] = r.agirlik || 0; });
    const artan = maddeler.filter((r) => r.gunluk > 0), dusen = maddeler.filter((r) => r.gunluk < 0), sabit = maddeler.length - artan.length - dusen.length;
    const top = (l) => l.reduce((s, r) => s + (agirlik[r.seri_kodu] || 0), 0);
    const wTop = top(maddeler), wArtan = wTop ? top(artan) / wTop * 100 : null;
    const pay = (n) => n / maddeler.length * 100;
    const serit = el('div', { style: { display: 'flex', height: '14px', borderRadius: '4px', overflow: 'hidden', margin: '10px 0 6px', background: 'var(--grid)' }, role: 'img',
      'aria-label': 'Artan %' + F[0](pay(artan.length)) + ', değişmeyen %' + F[0](pay(sabit)) + ', düşen %' + F[0](pay(dusen.length)) });
    [[artan.length, 'var(--bad)'], [sabit, 'var(--line-strong)'], [dusen.length, 'var(--ok)']].forEach(([n, r]) => { if (n) serit.append(el('span', { style: { width: pay(n) + '%', background: r } })); });
    const gun = sd.find((r) => r.duzey === 'madde' && r.tarih) || {};
    const lej = el('div', { class: 'lejant' },
      [['Artan', artan.length, 'var(--bad)'], ['Değişmeyen', sabit, 'var(--line-strong)'], ['Düşen', dusen.length, 'var(--ok)']].map(([ad, n, r]) => { const i = el('i'); i.style.background = r; i.style.height = '8px'; i.style.width = '8px'; return el('span', {}, i, ad + ' ' + n + ' (%' + F[0](pay(n)) + ')'); }));
    const cumle = el('p', { class: 'cumle' }, 'Son toplamada (' + gunMetin(gun.tarih) + ') ', el('b', { text: String(maddeler.length) }), ' madde izlendi: fiyatı artan ', el('b', { text: String(artan.length) }), ', düşen ', el('b', { text: String(dusen.length) }), '.',
      wArtan != null ? [' Sepet ağırlığıyla artanların payı ', el('b', { text: '%' + F[0](wArtan) }), '.'] : null);
    const trend = el('div', { class: 'grafik', style: { minHeight: '150px', marginTop: '8px' } });
    kap.replaceChildren(cumle, serit, lej, el('p', { class: 'kart-bas', style: { margin: '14px 0 0' } }, el('span', { style: { fontSize: '12.5px', color: 'var(--muted)' }, text: 'Fiyatı artan madde payı, toplama günlerine göre' })), trend);
    if (mi) {
      const gunler = d3.rollups(mi.filter((r) => !yok(r.gunluk_degisim)), (l) => ({ artan: l.filter((r) => r.gunluk_degisim > 0).length / l.length * 100, dusen: l.filter((r) => r.gunluk_degisim < 0).length / l.length * 100 }), (r) => r.tarih).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      cizgiGrafik(trend, { yukseklik: 150, yuzde: true, ipBicim: (v) => B.yuzde(v, 0), etiket: 'Fiyatı artan ve düşen madde payı',
        seriler: [{ ad: 'Artan', renk: 'var(--bad)', noktalar: gunler.map(([t, v]) => ({ x: tarih(t), y: v.artan })) }, { ad: 'Düşen', renk: 'var(--ok)', noktalar: gunler.map(([t, v]) => ({ x: tarih(t), y: v.dusen })) }] });
    }
  }

  function webGruplarCiz(w) {
    const kap = $('#web-gruplar-tablo');
    if (!w) { bosYaz(kap, webBekliyorMetin()); return; }
    const satirlar = WEB_TABLO.map((k) => ({ k, l: w.seriler.get(k) || [] })).filter((x) => x.l.length).map(({ k, l }) => {
      const s = sonEleman(l);
      return { k, ad: WEB_ADLAR[k] || s.seri_adi, uzun: s.seri_adi, tur: s.duzey, kapsam: s.kapsam, endeks: s.endeks, gunluk: s.gunluk_degisim, bas: s.endeks - 100 };
    });
    const enBuyuk = Math.max(0.01, ...satirlar.map((r) => Math.abs(r.bas)));
    const tablo = el('table', { class: 'veri' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Gösterge' }), el('th', { class: 'say', text: 'Kapsam' }), el('th', { class: 'say', text: 'Endeks' }), el('th', { class: 'say', text: 'Son toplama' }), el('th', { class: 'say', text: 'Başlangıçtan' }))),
      el('tbody', {}, satirlar.map((r) => {
        const c = el('span', { class: 'cubukcuk' });
        const i = el('i', { style: { width: Math.round(Math.abs(r.bas) / enBuyuk * 100) + '%', background: r.bas > 0 ? 'var(--bad)' : 'var(--ok)' } });
        c.append(i);
        const turAd = r.tur === 'genel' ? 'Tüm izlenen sepet' : r.tur === 'ana_grup' ? 'Ana grup' : (r.k.startsWith('TUFE_') ? r.uzun : 'Özel gösterge');
        return el('tr', { class: r.k === 'TUFE' ? 'vurgu' : null },
          el('td', { class: 'ad' }, r.ad, el('span', { class: 'alt-yazi', text: turAd })),
          el('td', { class: 'say', text: '%' + F[1](r.kapsam), style: r.kapsam < 15 ? { color: 'var(--warn)' } : null, title: r.kapsam < 15 ? 'Grubun sepet ağırlığının yalnızca küçük bir kısmı izleniyor' : null }),
          el('td', { class: 'say', text: B.sayi(r.endeks) }),
          el('td', { class: 'say' }, el('span', { class: 'degisim ' + yonSinif(r.gunluk, false), text: B.isaretli(r.gunluk) })),
          el('td', { class: 'say' }, c, el('span', { class: 'degisim ' + yonSinif(r.bas, false), text: B.isaretli(r.bas) })));
      })));
    kap.replaceChildren(tablo);
  }

  function webHareketCiz() {
    const kap = $('#web-hareket-grafik');
    $$('#web-hareket-donem button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.deger === E.donem ? 'true' : 'false'));
    let satirlar = [], aciklama;
    if (E.donem === 'gunluk') {
      const sd = dosya('son_degisimler');
      if (!sd) { bosYaz(kap, webBekliyorMetin()); return; }
      const l = sd.filter((r) => r.duzey === 'madde' && !yok(r.gunluk));
      satirlar = l.map((r) => ({ ad: r.seri_adi, deger: r.gunluk }));
      const t = (l[0] || {}).tarih;
      aciklama = 'Önceki toplamaya göre' + (t ? ' (' + gunMetin(t) + ')' : '') + ', madde endeksi % değişim';
    } else {
      const mi = dosya('madde_endeksleri');
      if (!mi) { bosYaz(kap, webBekliyorMetin()); return; }
      const m = seriGrupla(mi.filter((r) => !yok(r.endeks)), 'seri_kodu', 'tarih');
      satirlar = [...m.values()].filter((l) => l.length > 1).map((l) => ({ ad: sonEleman(l).seri_adi, deger: sonEleman(l).endeks - 100 }));
      aciklama = 'İlk toplama gününden bu yana madde endeksi % değişim';
    }
    $('#web-hareket-aciklama').textContent = aciklama;
    satirlar.sort((a, b) => b.deger - a.deger);
    const artan = satirlar.filter((r) => r.deger > 0).slice(0, 7);
    const dusen = satirlar.filter((r) => r.deger < 0).slice(-7);
    cubukGrafik(kap, { satirlar: [...artan, ...dusen], renk: 'var(--bad)', negatifRenk: 'var(--ok)', bicim: (v) => B.isaretli(v, 1), etiket: aciklama, bos: 'Henüz karşılaştırılacak toplama yok.' });
  }
  $$('#web-hareket-donem button').forEach((b) => b.addEventListener('click', () => { E.donem = b.dataset.deger; webHareketCiz(); }));

  // ---------------------------------------------------------------- TÜİK TÜFE (EVDS)
  // Ana grup yıllık değişimleri endeks düzeylerinden hesaplanır: (I_t / I_t-12 − 1) × 100
  // Önce bütün grup serileri istenir (yoksa ilk eksik serinin gelmesini bekleyip tek tek yüklenirdi)
  function grupDuzeyleri() {
    const satirlar = GRUP_KODLARI.map((k) => evdsSatir('g' + k));
    if (satirlar.some((s) => !s)) return null;
    const m = {};
    GRUP_KODLARI.forEach((k, i) => { m[k] = new Map(satirlar[i].map((r) => [r.tarih.slice(0, 7), r.deger])); });
    return m;
  }
  const yillikDegisim = (map, ay) => { const a = map.get(ay), b = map.get(ayEkle(ay, -12)); return yok(a) || yok(b) || !b ? null : (a / b - 1) * 100; };

  function resmiKpiCiz() {
    const kap = $('#resmi-kpi');
    const ozet = (id, etiket, opt) => {
      const k = evds(id);
      if (k.durum !== 'hazir') return kpi({ kaynak: 'resmi', etiket, bekliyor: k.durum === 'bekliyor' || k.durum === 'yukleniyor', deger: '—', alt: k.durum === 'yok' || k.durum === 'hata' ? evdsBosMetin(id) : null, altBekliyor: 'EVDS’den okunuyor…' });
      const s = k.satirlar, son = sonEleman(s), once = s.length > 1 ? s[s.length - 2] : null;
      const fark = once ? son.deger - once.deger : null;
      return kpi({ kaynak: 'resmi', etiket, deger: B.yuzde(son.deger), degisim: opt.farkYok ? null : B.puan(fark), sinif: yonSinif(fark, false),
        alt: [ayMetin(son.tarih), opt.alt ? opt.alt(son) : null], spark: s.slice(-24).map((r) => r.deger) });
    };
    const ca = evdsSatir('c_a');
    kap.replaceChildren(
      ozet('tufe_y', 'Yıllık TÜFE', {}),
      ozet('tufe_a', 'Aylık TÜFE', {}),
      ozet('b_y', 'B göstergesi, yıllık', {}),
      ozet('c_y', 'C göstergesi (çekirdek), yıllık', { alt: (son) => { const a = ca && ca.find((r) => r.tarih === son.tarih); return a ? 'aylık ' + B.yuzde(a.deger) : null; } }),
    );
  }

  function resmiYillikCiz() {
    const kap = $('#resmi-yillik-grafik');
    $$('#resmi-yillik-aralik button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.deger) === E.aralik)));
    const t = evdsSatir('tufe_y');
    if (!t) { bosYaz(kap, evdsBosMetin('tufe_y')); return; }
    const kes = (l) => (E.aralik ? l.slice(-E.aralik) : l);
    const seri = (id, ad, renk, kalin) => ({ ad, renk, kalin, noktalar: kes(evdsSatir(id) || []).map((r) => ({ x: tarih(r.tarih), y: r.deger })) });
    cizgiGrafik(kap, { yuzde: true, etiket: 'TÜİK TÜFE, B ve C göstergelerinin yıllık değişimi', ipBaslik: (d) => ayMetin(d), ipTolerans: 20,
      seriler: [seri('tufe_y', 'TÜFE', 'var(--resmi)', 2.6), seri('b_y', 'B göstergesi', 'var(--s1)', 1.8), seri('c_y', 'C göstergesi', 'var(--s4)', 1.8)] });
  }
  $$('#resmi-yillik-aralik button').forEach((b) => b.addEventListener('click', () => { E.aralik = Number(b.dataset.deger); resmiYillikCiz(); }));

  function resmiAylikCiz() {
    const kap = $('#resmi-aylik-grafik');
    const t = evdsSatir('tufe_a');
    if (!t) { bosYaz(kap, evdsBosMetin('tufe_a')); return; }
    sutunGrafik(kap, { noktalar: t.slice(-24).map((r) => ({ x: tarih(r.tarih), y: r.deger })), renk: 'var(--resmi)', negatifRenk: 'var(--ok)', yuzde: true, ad: 'Aylık TÜFE', etiket: 'Aylık TÜFE değişimi, son 24 ay' });
  }

  // 13 ana grup serisi, grafik ekrana yaklaşınca istenir (açılıştaki EVDS yükünü yarıya indirir)
  E.gruplarIste = !('IntersectionObserver' in window);
  if (!E.gruplarIste) new IntersectionObserver((g, o) => { if (g.some((x) => x.isIntersecting)) { E.gruplarIste = true; o.disconnect(); yenidenCiz(); } }, { rootMargin: '500px 0px' }).observe($('#resmi-gruplar'));
  function resmiGruplarCiz() {
    const kap = $('#resmi-gruplar-grafik');
    if (!E.gruplarIste) { bosYaz(kap, 'EVDS’den okunuyor…'); return; }
    const g = grupDuzeyleri();
    if (!g) { const bos = GRUP_KODLARI.map((k) => 'g' + k).find((id) => evds(id).durum !== 'hazir'); bosYaz(kap, evdsBosMetin(bos)); return; }
    const aylar = [...g['01'].keys()].sort();
    const ay = aylar.reverse().find((a) => GRUP_KODLARI.every((k) => !yok(yillikDegisim(g[k], a))));
    if (!ay) { bosYaz(kap, 'Yıllık değişim için yeterli geçmiş yok.'); return; }
    const genel = (evdsSatir('tufe_y') || []).find((r) => r.tarih === ay);
    $('#resmi-gruplar-not').textContent = ayMetin(ay) + ', bir önceki yılın aynı ayına göre %' + (genel ? ' · kesik çizgi genel TÜFE' : '');
    const satirlar = GRUP_KODLARI.map((k) => ({ ad: GRUP_ADLARI[k], deger: yillikDegisim(g[k], ay) })).sort((a, b) => b.deger - a.deger);
    cubukGrafik(kap, { satirlar, renk: 'var(--resmi)', negatifRenk: 'var(--ok)', bicim: (v) => B.yuzde(v, 1), satirYukseklik: 25,
      referans: genel ? { deger: genel.deger, ad: 'Genel ' + B.yuzde(genel.deger, 1) } : null, etiket: 'Ana harcama gruplarında yıllık TÜFE değişimi, ' + ayMetin(ay) });
  }

  cizimler.enflasyon = () => {
    const w = webVeri();
    webKpiCiz(w);
    webSeyirCiz(w);
    webYayginlikCiz(w);
    webGruplarCiz(w);
    webHareketCiz();
    resmiKpiCiz();
    resmiYillikCiz();
    resmiAylikCiz();
    resmiGruplarCiz();
  };
