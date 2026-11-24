
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
