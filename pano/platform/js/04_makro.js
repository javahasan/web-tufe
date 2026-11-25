
  // ================================================================ makro göstergeler (TCMB EVDS)
  // o: {bicim, fark: 'puan'|'oran30'|null, artisIyi, alt(son, satirlar), ondalik}
  function evdsKpi(id, etiket, o = {}) {
    const k = evds(id);
    if (k.durum !== 'hazir' || !k.satirlar.length) {
      return kpi({ kaynak: 'resmi', etiket, bekliyor: k.durum === 'bekliyor' || k.durum === 'yukleniyor', deger: '—', alt: k.durum === 'yok' || k.durum === 'hata' ? evdsBosMetin(id) : 'Veri yok', altBekliyor: 'EVDS’den okunuyor…' });
    }
    const s = k.satirlar, son = sonEleman(s);
    const bic = o.bicim || ((v) => B.yuzde(v));
    let degisim = null, fark = null;
    if (o.fark === 'oran30') {
      const sinir = gunEkle(son.tarih, -30);
      const once = s.filter((r) => r.tarih <= sinir).pop();
      if (once) { fark = (son.deger / once.deger - 1) * 100; degisim = B.isaretli(fark) + ' 30 günde'; }
    } else if (o.fark !== null) {
      const once = s.length > 1 ? s[s.length - 2] : null;
      if (once) { fark = son.deger - once.deger; degisim = (o.fark === 'sayi' ? B.fark(fark, 1) : B.puan(fark)); }
    }
    const tarihYaz = son.tarih.length > 7 ? gunMetin(son.tarih) : ayMetin(son.tarih);
    return kpi({ kaynak: 'resmi', etiket, deger: bic(son.deger), degisim, sinif: o.artisIyi === undefined ? 'notr' : yonSinif(fark, o.artisIyi),
      alt: [tarihYaz, o.alt ? o.alt(son, s) : null], spark: s.slice(o.spark || -24).map((r) => r.deger) });
  }
  const evdsNoktalar = (id, bas) => (evdsSatir(id) || []).filter((r) => !bas || r.tarih >= bas).map((r) => ({ x: tarih(r.tarih), y: r.deger }));

  cizimler.makro = () => {
    // beklentiler
    $('#makro-beklenti-kpi').replaceChildren(
      evdsKpi('pka_12', 'Piyasa: 12 ay sonrası TÜFE', { artisIyi: false }),
      evdsKpi('pka_ys', 'Piyasa: yıl sonu TÜFE', { artisIyi: false }),
      evdsKpi('hane_12', 'Hanehalkı: 12 ay sonrası', { artisIyi: false }),
      evdsKpi('reel_12', 'Reel kesim: 12 ay sonrası', { artisIyi: false }),
    );
    const bk = $('#makro-beklenti-grafik');
    if (!evdsSatir('piyasa_12')) bosYaz(bk, evdsBosMetin('piyasa_12'));
    else {
      cizgiGrafik(bk, { yuzde: true, ipBaslik: (d) => ayMetin(d), ipTolerans: 20, etiket: '12 ay sonrası yıllık enflasyon beklentileri ve gerçekleşen TÜFE',
        seriler: [
          { ad: 'Hanehalkı', renk: 'var(--s4)', noktalar: evdsNoktalar('hane_12') },
          { ad: 'Reel kesim', renk: 'var(--s3)', noktalar: evdsNoktalar('reel_12') },
          { ad: 'Piyasa katılımcıları', renk: 'var(--s1)', kalin: 2.4, noktalar: evdsNoktalar('piyasa_12') },
          { ad: 'Gerçekleşen TÜFE', renk: 'var(--resmi)', kesik: true, kalin: 1.6, noktalar: evdsNoktalar('tufe_y', '2022-01') },
        ] });
    }
    const vk = $('#makro-vade-grafik');
    const ys = evdsSatir('pka_ys'), y12 = evdsSatir('pka_12'), y24 = evdsSatir('pka_24'), ty = evdsSatir('tufe_y');
    if (!ys || !y12) bosYaz(vk, evdsBosMetin('pka_ys'));
    else {
      const sonAy = sonEleman(y12).tarih;
      const al = (l) => { const r = (l || []).find((x) => x.tarih === sonAy); return r ? r.deger : null; };
      const t = sonEleman(ty || []);
      cubukGrafik(vk, { renk: 'var(--resmi)', bicim: (v) => B.yuzde(v, 1), satirYukseklik: 34, etiket: 'Piyasa katılımcılarının TÜFE beklentileri, ' + ayMetin(sonAy),
        referans: t ? { deger: t.deger, ad: 'Son TÜFE ' + B.yuzde(t.deger, 1) } : null,
        satirlar: [{ ad: 'Bu yıl sonu', deger: al(ys) }, { ad: '12 ay sonrası', deger: al(y12) }, { ad: '24 ay sonrası', deger: al(y24) }] });
      vk.append(el('p', { class: 'kart-ayak', style: { paddingTop: '4px' }, text: ayMetin(sonAy) + ' anketi' }));
    }

    // para politikası ve kur
    $('#makro-para-kpi').replaceChildren(
      evdsKpi('politika', 'Politika faizi', { spark: -36 }),
      evdsKpi('aofm', 'Ağırlıklı ort. fonlama maliyeti', { fark: null, spark: -90 }),
      evdsKpi('usd', 'ABD doları, TL', { bicim: (v) => B.sayi(v, 4), fark: 'oran30', spark: -120 }),
      evdsKpi('pka_faiz_ys', 'Yıl sonu politika faizi beklentisi', {}),
    );
    const fk = $('#makro-faiz-grafik');
    const pol = evdsSatir('politika');
    if (!pol) bosYaz(fk, evdsBosMetin('politika'));
    else {
      const bas = GECEN_YIL.slice(0, 7);
      const pn = pol.filter((r) => r.tarih >= ayEkle(bas, -1)).map((r) => ({ x: tarih(r.tarih), y: r.deger }));
      const beklenti = sonEleman(evdsSatir('pka_faiz_ys') || []);
      cizgiGrafik(fk, { yuzde: true, etiket: 'Politika faizi ve ağırlıklı ortalama fonlama maliyeti', ipTolerans: 40,
        referanslar: beklenti ? [{ y: beklenti.deger, ad: 'Yıl sonu beklentisi ' + B.yuzde(beklenti.deger, 1) }] : [],
        seriler: [{ ad: 'Fonlama maliyeti (günlük)', renk: 'var(--s1)', kalin: 1.4, noktalar: evdsNoktalar('aofm') },
          { ad: 'Politika faizi', renk: 'var(--resmi)', kalin: 2.4, adim: true, noktalar: pn }] });
    }
    const kk = $('#makro-kur-grafik');
    const usd = evdsSatir('usd');
    if (!usd) bosYaz(kk, evdsBosMetin('usd'));
    else {
      const b = sonEleman(evdsSatir('pka_kur_ys') || []);
      cizgiGrafik(kk, { etiket: 'ABD doları kuru', ipBicim: (v) => B.sayi(v, 4) + ' ₺', yBicim: (v) => B.sayi(v, 0),
        referanslar: b ? [{ y: b.deger, ad: 'Yıl sonu beklentisi ' + B.sayi(b.deger, 2) }] : [],
        seriler: [{ ad: 'USD/TL', renk: 'var(--resmi)', kalin: 2, alan: true, noktalar: usd.map((r) => ({ x: tarih(r.tarih), y: r.deger })) }] });
    }

    // güven ve faaliyet
    $('#makro-anket-kpi').replaceChildren(
      evdsKpi('tg', 'Tüketici güven endeksi', { bicim: (v) => B.sayi(v, 1), fark: 'sayi', artisIyi: true }),
      evdsKpi('rkge', 'Reel kesim güven endeksi', { bicim: (v) => B.sayi(v, 1), fark: 'sayi', artisIyi: true }),
      evdsKpi('kko', 'Kapasite kullanım oranı', { bicim: (v) => B.yuzde(v, 1), artisIyi: true }),
      evdsKpi('buyume', 'Büyüme beklentisi, bu yıl', { bicim: (v) => B.yuzde(v, 1), artisIyi: true, alt: () => { const g = sonEleman(evdsSatir('buyume_gy') || []); return g ? 'gelecek yıl ' + B.yuzde(g.deger, 1) : null; } }),
    );
    const gk = $('#makro-guven-grafik');
    if (!evdsSatir('tg')) bosYaz(gk, evdsBosMetin('tg'));
    else {
      cizgiGrafik(gk, { etiket: 'Tüketici ve reel kesim güven endeksleri', ipBicim: (v) => B.sayi(v, 1), ipBaslik: (d) => ayMetin(d), ipTolerans: 20,
        referanslar: [{ y: 100, ad: 'Eşik 100' }],
        seriler: [{ ad: 'Reel kesim güveni (MA)', renk: 'var(--s1)', noktalar: evdsNoktalar('rkge') }, { ad: 'Tüketici güveni', renk: 'var(--resmi)', kalin: 2.4, noktalar: evdsNoktalar('tg') }] });
    }
    const kko = $('#makro-kko-grafik');
    if (!evdsSatir('kko')) bosYaz(kko, evdsBosMetin('kko'));
    else {
      const ust = el('div', { class: 'grafik' }), alt = el('div', { class: 'grafik', style: { marginTop: '12px' } });
      kko.replaceChildren(ust, el('p', { style: { margin: '10px 0 0', fontSize: '12.5px', color: 'var(--muted)' }, text: 'Piyasa katılımcılarının GSYH büyüme beklentisi, %' }), alt);
      cizgiGrafik(ust, { yukseklik: 190, yuzde: true, ipBicim: (v) => B.yuzde(v, 1), ipBaslik: (d) => ayMetin(d), ipTolerans: 20, etiket: 'İmalat sanayii kapasite kullanım oranı',
        seriler: [{ ad: 'KKO (MA)', renk: 'var(--resmi)', kalin: 2.2, alan: true, noktalar: evdsNoktalar('kko') }] });
      cizgiGrafik(alt, { yukseklik: 150, yuzde: true, ipBicim: (v) => B.yuzde(v, 1), ipBaslik: (d) => ayMetin(d) + ' anketi', ipTolerans: 20, etiket: 'GSYH büyüme beklentileri',
        seriler: [{ ad: 'Bu yıl', renk: 'var(--s1)', noktalar: evdsNoktalar('buyume') }, { ad: 'Gelecek yıl', renk: 'var(--s4)', noktalar: evdsNoktalar('buyume_gy') }] });
    }
  };
