
  // ================================================================ manşet bandı
  dash.calc('mansetler', {
    inputs: ['gercek_mansetler', 'ozet', 'son_degisimler', 'ana_grup_tablosu', 'yayginlik'],
    title: 'Günün manşetleri',
    description: 'Manşet bandındaki cümleler: gerçek market fiyatlarından (en pahalı ürün, zincir farkı, temel gıdalar, günlük değişim) ve sentetik endeksten (yıllık enflasyon, en çok artan ve düşen kalemler, gruplar, yaygınlık) seçilen değerler.',
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
      if (o) {
        sentetikler.push({ kaynak: 'Sentetik', on: 'Yıllık enflasyon ', deger: o.yillik_degisim, bicim: 'yuzde', ara1: '; önceki aya göre ', deger2: o.yillik_fark, bicim2: 'puan', ara2: ' puan' });
        sentetikler.push({ kaynak: 'Sentetik', on: o.ay ? 'Aylık değişim ' : '', deger: o.aylik_degisim, bicim: 'yuzde', ara1: o.durum === 'kesin' ? ' (kesin)' : ' (geçici)' });
      }
      const maddeler = (son_degisimler || []).filter((r) => r.duzey === 'madde');
      const uc = (alan, buyuk) => {
        const l = maddeler.filter((r) => r[alan] !== null && r[alan] !== '').sort((a, b) => Number(a[alan]) - Number(b[alan]));
        return l.length ? (buyuk ? l[l.length - 1] : l[0]) : null;
      };
      [['gunluk', true, 'Günün en çok artan maddesi: '], ['aylik', true, 'Ayın en çok artan maddesi: '],
        ['aylik', false, 'Ayın en çok düşen maddesi: '], ['yillik', true, 'Yılın en çok artan maddesi: ']].forEach(([alan, buyuk, metin]) => {
        const r = uc(alan, buyuk);
        if (r) sentetikler.push({ kaynak: 'Sentetik', on: metin + r.seri_adi + ' ', deger: sayi(r[alan]), bicim: 'isaretli' });
      });
      const g = (ana_gruplar || []).filter((r) => r.yillik_degisim != null).sort((a, b) => a.yillik_degisim - b.yillik_degisim);
      if (g.length) {
        sentetikler.push({ kaynak: 'Sentetik', on: 'En yüksek yıllık enflasyon: ' + g[g.length - 1].ad + ' ', deger: g[g.length - 1].yillik_degisim, bicim: 'yuzde' });
        sentetikler.push({ kaynak: 'Sentetik', on: 'En düşük yıllık enflasyon: ' + g[0].ad + ' ', deger: g[0].yillik_degisim, bicim: 'yuzde' });
      }
      const y = (yayginlik || [])[(yayginlik || []).length - 1];
      if (y) sentetikler.push({ kaynak: 'Sentetik', on: 'Fiyatı artan maddelerin payı ', deger: y.artan_oran, bicim: 'yuzde1' });
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
