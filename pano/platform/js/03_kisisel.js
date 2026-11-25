
  // ================================================================ kişisel enflasyon
  // İki ayrı hesap: TÜİK TÜFE ana grupları (resmi, aylık) ve Web TÜFE ana grupları (bu proje, günlük).
  // Kişisel oran, grup değişimlerinin kullanıcının ağırlıklarıyla ağırlıklı ortalamasıdır; iki kaynak
  // hiçbir zaman aynı hesapta kullanılmaz.
  const S = {
    kaynak: 'resmi', agirlik: { resmi: null, web: null }, imza: '', hesapImza: '',
    hesap: { resmi: { tutar: 1000, bas: null, son: null, endeks: 'genel' }, web: { tutar: 1000, bas: null, son: null, endeks: 'genel' } },
  };
  const WEB_GRUPLAR = ['01', '05', '09', '13'];

  function varsayilanAgirlik(kaynak) {
    const ag = dosya('agirliklar');
    if (!ag) return null;
    const t = {};
    ag.forEach((r) => {
      if (kaynak === 'web' && r.market_kurali !== 'evet') return;
      t[r.ana_grup_kodu] = (t[r.ana_grup_kodu] || 0) + (r.agirlik || 0);
    });
    const kodlar = kaynak === 'web' ? webSepetGruplari() : GRUP_KODLARI;
    const o = {};
    kodlar.forEach((k) => { o[k] = Math.round((t[k] || 0) * 100) / 100; });
    return o;
  }
  function webSepetGruplari() {
    const w = webVeri();
    return w ? WEB_GRUPLAR.filter((k) => (w.seriler.get(k) || []).length) : [];
  }
  const agirliklar = (kaynak) => {
    const v = varsayilanAgirlik(kaynak);
    if (!v) return null;
    const kayitli = S.agirlik[kaynak] || {};
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = yok(kayitli[k]) ? v[k] : kayitli[k]; });
    return o;
  };

  // ---------------------------------------------------------------- saklama (kişiye özel, db; yoksa tarayıcı)
  let kayitZamanlayici = null;
  function sepetKaydet() {
    clearTimeout(kayitZamanlayici);
    kayitZamanlayici = setTimeout(async () => {
      const veri = { tur: 'sepet', kaynak: S.kaynak, resmi: S.agirlik.resmi || {}, web: S.agirlik.web || {}, guncelleme: Date.now() };
      const durumEl = $('#sepet-kayit-durum');
      if (D.cap.db && D.uid) {
        try { await D.cap.db.doc('data/users/' + D.uid + '/sepet').set(veri); if (durumEl) durumEl.textContent = 'Sepetiniz kaydedildi; yalnızca size görünür.'; return; }
        catch (e) { console.warn(e); }
      }
      try { localStorage.setItem('wt-sepet', JSON.stringify(veri)); if (durumEl) durumEl.textContent = 'Sepetiniz bu tarayıcıda saklandı.'; } catch (e) { if (durumEl) durumEl.textContent = ''; }
    }, 700);
  }
  async function sepetYukle() {
    let v = null;
    if (D.cap.db && D.uid) { try { const s = await D.cap.db.doc('data/users/' + D.uid + '/sepet').get(); if (s.exists) v = s.data(); } catch (e) { console.warn(e); } }
    if (!v) { try { v = JSON.parse(localStorage.getItem('wt-sepet') || 'null'); } catch (e) { v = null; } }
    if (v) {
      S.agirlik.resmi = v.resmi && Object.keys(v.resmi).length ? v.resmi : null;
      S.agirlik.web = v.web && Object.keys(v.web).length ? v.web : null;
      if (v.kaynak === 'web' || v.kaynak === 'resmi') S.kaynak = v.kaynak;
      S.imza = '';
      yenidenCiz();
    }
  }

  // ---------------------------------------------------------------- ağırlık satırları
  function agirlikSatirlariCiz() {
    const kap = $('#sepet-satirlar');
    const v = varsayilanAgirlik(S.kaynak), a = agirliklar(S.kaynak);
    const imza = S.kaynak + '|' + (v ? Object.keys(v).join(',') : '-') + '|' + JSON.stringify(S.agirlik[S.kaynak] || {});
    if (imza === S.imza && kap.childElementCount) return;
    S.imza = imza;
    if (!v) { bosYaz(kap, 'Sepet ağırlıkları yükleniyor…'); return; }
    if (!Object.keys(v).length) { bosYaz(kap, 'Web TÜFE’de henüz ana grup endeksi yok.'); return; }
    const ad = (k) => (S.kaynak === 'web' ? WEB_ADLAR[k] || GRUP_ADLARI[k] : GRUP_ADLARI[k]);
    kap.replaceChildren(
      el('div', { class: 'agirlik-bas' }, el('span', { text: 'Grup' }), el('span', { text: S.kaynak === 'web' ? 'İzlenen' : 'TÜİK' }), el('span', { text: 'Sizin %' })),
      ...(S.kaynak === 'web' ? webSepetGruplari() : GRUP_KODLARI).filter((k) => k in v).map((k) => {
        const g = el('input', { class: 'girdi', type: 'number', min: '0', max: '100', step: '0.1', inputmode: 'decimal', id: 'agirlik-' + S.kaynak + '-' + k, 'aria-label': ad(k) + ' için ağırlığınız' });
        g.value = String(Math.round(a[k] * 10) / 10);
        g.addEventListener('input', () => {
          const n = g.value === '' ? 0 : Number(g.value.replace(',', '.'));
          if (!isFinite(n) || n < 0) return;
          S.agirlik[S.kaynak] = { ...(agirliklar(S.kaynak) || {}), [k]: n };
          S.imza = S.kaynak + '|' + Object.keys(v).join(',') + '|' + JSON.stringify(S.agirlik[S.kaynak]);
          sepetSonucCiz();
          sepetKaydet();
        });
        return el('label', { class: 'agirlik-satir', for: g.id }, el('span', { class: 'ad' }, ad(k), el('small', { text: (S.kaynak === 'web' ? 'Web TÜFE ' : 'TÜFE ') + k })), el('span', { class: 'resmi-agirlik', text: F[2](v[k]) }), g);
      }),
    );
    $('#sepet-agirlik-not').textContent = S.kaynak === 'web'
      ? 'Web TÜFE yalnızca market ürünlerini izler (TÜİK sepet ağırlığının yaklaşık %28’i). Başlangıç değerleri izlenen maddelerin TÜİK 2026 ağırlıklarıdır. Toplamın 100 olması gerekmez.'
      : 'Başlangıç değerleri TÜİK 2026 sepet ağırlıklarıdır. Her gruba harcamanızın yüzde kaçını ayırdığınızı yazın; toplamın 100 olması gerekmez, oranlar kendiliğinden ölçeklenir.';
    $('#sepet-sifirla').textContent = S.kaynak === 'web' ? 'Başlangıç ağırlıklarına dön' : 'TÜİK ağırlıklarına dön';
  }

  // ---------------------------------------------------------------- hesaplar
  function resmiKisisel() {
    const g = grupDuzeyleri(), a = agirliklar('resmi'), v = varsayilanAgirlik('resmi');
    if (!g || !a) return null;
    const kodlar = GRUP_KODLARI.filter((k) => a[k] > 0);
    const aylar = [...g['01'].keys()].sort().filter((ay) => GRUP_KODLARI.every((k) => !yok(yillikDegisim(g[k], ay))));
    if (!aylar.length || !kodlar.length) return { aylar: [], kodlar };
    const top = kodlar.reduce((s, k) => s + a[k], 0);
    const vTop = GRUP_KODLARI.reduce((s, k) => s + (v[k] || 0), 0);
    const seri = aylar.map((ay) => ({ ay, kisisel: kodlar.reduce((s, k) => s + a[k] * yillikDegisim(g[k], ay), 0) / top, tuik: GRUP_KODLARI.reduce((s, k) => s + (v[k] || 0) * yillikDegisim(g[k], ay), 0) / vTop }));
    const ay = aylar[aylar.length - 1];
    const katki = kodlar.map((k) => ({ k, ad: GRUP_ADLARI[k], deger: a[k] * yillikDegisim(g[k], ay) / top, degisim: yillikDegisim(g[k], ay) }));
    return { g, a, kodlar, top, aylar, seri, ay, son: sonEleman(seri), katki };
  }
  function webKisisel() {
    const w = webVeri(), a = agirliklar('web');
    if (!w || !a) return null;
    const kodlar = Object.keys(a).filter((k) => a[k] > 0);
    if (!kodlar.length) return { kodlar, seri: [] };
    const harita = {};
    kodlar.forEach((k) => { harita[k] = new Map((w.seriler.get(k) || []).map((r) => [r.tarih, r.endeks])); });
    const genel = new Map(w.genel.map((r) => [r.tarih, r.endeks]));
    const top = kodlar.reduce((s, k) => s + a[k], 0);
    const seri = w.gunler.filter((t) => kodlar.every((k) => !yok(harita[k].get(t)))).map((t) => ({ tarih: t, kisisel: kodlar.reduce((s, k) => s + a[k] * harita[k].get(t), 0) / top, genel: genel.get(t) }));
    const son = sonEleman(seri);
    const katki = son ? kodlar.map((k) => ({ k, ad: WEB_ADLAR[k], deger: a[k] * (harita[k].get(son.tarih) - 100) / top, degisim: harita[k].get(son.tarih) - 100 })) : [];
    return { w, a, kodlar, top, harita, seri, son, katki };
  }

  function sepetSonucCiz() {
    const kap = $('#sepet-sonuc-icerik');
    const baslik = $('#sepet-sonuc-baslik'), alt = $('#sepet-sonuc-alt');
    if (S.kaynak === 'resmi') {
      baslik.textContent = 'Kişisel yıllık enflasyonunuz';
      const r = resmiKisisel();
      if (!r) { alt.textContent = ''; bosYaz(kap, evds('g01').durum === 'hazir' ? 'Sepet ağırlıkları yükleniyor…' : evdsBosMetin('g01')); return; }
      if (!r.son) { bosYaz(kap, r.kodlar.length ? 'Yıllık değişim için yeterli geçmiş yok.' : 'En az bir gruba ağırlık verin.'); return; }
      const resmi = (evdsSatir('tufe_y') || []).find((x) => x.tarih === r.ay);
      alt.textContent = ayMetin(r.ay) + ', bir önceki yılın aynı ayına göre · TÜİK TÜFE ana grupları';
      const fark = resmi ? r.son.kisisel - resmi.deger : null;
      const katkiKap = el('div', { class: 'grafik', style: { minHeight: '60px' } });
      kap.replaceChildren(
        el('div', { class: 'sonuc-buyuk', style: { color: 'var(--resmi)' }, text: B.yuzde(r.son.kisisel) }),
        el('div', { class: 'sonuc-karsi' },
          resmi ? el('span', {}, 'Resmi TÜFE ', el('b', { text: B.yuzde(resmi.deger) })) : null,
          fark != null ? el('span', {}, 'Fark ', el('b', { class: 'degisim ' + yonSinif(fark, false), text: B.puan(fark) })) : null,
          el('span', {}, 'TÜİK ağırlıklarıyla aynı hesap ', el('b', { text: B.yuzde(r.son.tuik) }))),
        el('p', { class: 'kart-bas', style: { margin: '16px 0 4px' } }, el('span', { style: { fontSize: '12.5px', color: 'var(--muted)' }, text: 'Gruplara göre katkı (yüzde puan)' })),
        katkiKap,
        el('p', { class: 'uyari-not', text: 'Hesap, ana grupların yıllık değişimlerinin ağırlıklı ortalamasıdır. TÜİK ağırlıklarıyla bile resmi orandan küçük bir fark çıkabilir; bu fark yöntemden kaynaklanır.' }),
      );
      cubukGrafik(katkiKap, { satirlar: r.katki.sort((x, y) => y.deger - x.deger), renk: 'var(--resmi)', negatifRenk: 'var(--ok)', bicim: (v) => B.fark(v, 2), satirYukseklik: 23, etiket: 'Kişisel enflasyona grup katkıları' });
    } else {
      baslik.textContent = 'Kişisel Web TÜFE değişiminiz';
      const r = webKisisel();
      if (!r) { alt.textContent = ''; bosYaz(kap, webBekliyorMetin()); return; }
      if (!r.son) { bosYaz(kap, r.kodlar.length ? 'Henüz karşılaştırılacak toplama yok.' : 'En az bir gruba ağırlık verin.'); return; }
      const ilk = r.seri[0];
      alt.textContent = gunMetin(ilk.tarih) + '’dan ' + gunMetin(r.son.tarih) + '’a · Web TÜFE ana grupları (yalnızca market ürünleri)';
      const kis = r.son.kisisel - 100, gen = r.son.genel - 100;
      const katkiKap = el('div', { class: 'grafik', style: { minHeight: '60px' } });
      kap.replaceChildren(
        el('div', { class: 'sonuc-buyuk', style: { color: 'var(--web)' }, text: B.isaretli(kis) }),
        el('div', { class: 'sonuc-karsi' },
          el('span', {}, 'Web TÜFE genel ', el('b', { text: B.isaretli(gen) })),
          el('span', {}, 'Fark ', el('b', { class: 'degisim ' + yonSinif(kis - gen, false), text: B.puan(kis - gen) })),
          el('span', {}, el('b', { text: String(r.seri.length) }), ' toplama günü')),
        el('p', { class: 'kart-bas', style: { margin: '16px 0 4px' } }, el('span', { style: { fontSize: '12.5px', color: 'var(--muted)' }, text: 'Gruplara göre katkı (yüzde puan)' })),
        katkiKap,
        el('p', { class: 'uyari-not' }, el('b', { text: 'Kısa veri. ' }), 'Web TÜFE 12 Kasım 2026’da başladı; yıllık oran bir yıl sonra hesaplanabilir. Bu değişim yalnızca market ürünlerini kapsar ve resmi TÜFE ile karşılaştırılmaz.'),
      );
      cubukGrafik(katkiKap, { satirlar: r.katki.sort((x, y) => y.deger - x.deger), renk: 'var(--web)', negatifRenk: 'var(--ok)', bicim: (v) => B.fark(v, 2), satirYukseklik: 23, etiket: 'Kişisel Web TÜFE değişimine grup katkıları' });
    }
    sepetSeyirCiz();
    hesapCiz();
  }

  function sepetSeyirCiz() {
    const kap = $('#sepet-seyir-grafik');
    if (S.kaynak === 'resmi') {
      $('#sepet-seyir-baslik').textContent = 'Kişisel yıllık enflasyonunuz ve resmi TÜFE';
      $('#sepet-seyir-alt').textContent = 'Bugünkü ağırlıklarınızla geriye dönük hesap, son 36 ay';
      $('#sepet-seyir-ayak').textContent = 'Kaynak: TÜİK, TCMB EVDS. Kişisel oran ana grup endekslerinden bu sayfada hesaplanır.';
      const r = resmiKisisel();
      if (!r || !r.seri || !r.seri.length) { bosYaz(kap, r ? 'Veri yok.' : evdsBosMetin('g01')); return; }
      const t = new Map((evdsSatir('tufe_y') || []).map((x) => [x.tarih, x.deger]));
      const seri = r.seri.slice(-36);
      cizgiGrafik(kap, { yuzde: true, ipBaslik: (d) => ayMetin(d), ipTolerans: 20, etiket: 'Kişisel yıllık enflasyon ve resmi TÜFE',
        seriler: [{ ad: 'Kişisel', renk: 'var(--accent)', kalin: 2.6, noktalar: seri.map((x) => ({ x: tarih(x.ay), y: x.kisisel })) },
          { ad: 'Resmi TÜFE', renk: 'var(--resmi)', kalin: 1.8, kesik: true, noktalar: seri.map((x) => ({ x: tarih(x.ay), y: t.get(x.ay) })) }] });
    } else {
      $('#sepet-seyir-baslik').textContent = 'Kişisel Web TÜFE endeksiniz ve genel endeks';
      $('#sepet-seyir-alt').textContent = 'İlk toplama günü = 100';
      $('#sepet-seyir-ayak').textContent = 'Kaynak: marketfiyati.org.tr fiyatlarından bu projenin hesabı.';
      const r = webKisisel();
      if (!r || !r.seri.length) { bosYaz(kap, r ? 'Veri yok.' : webBekliyorMetin()); return; }
      cizgiGrafik(kap, { etiket: 'Kişisel Web TÜFE endeksi ve genel endeks', ipBicim: (v) => B.sayi(v, 2), referanslar: [{ y: 100 }],
        seriler: [{ ad: 'Kişisel', renk: 'var(--accent)', kalin: 2.6, noktalar: r.seri.map((x) => ({ x: tarih(x.tarih), y: x.kisisel })) },
          { ad: 'Web TÜFE genel', renk: 'var(--web)', kalin: 1.8, kesik: true, noktalar: r.seri.map((x) => ({ x: tarih(x.tarih), y: x.genel })) }] });
    }
  }

  // ---------------------------------------------------------------- tutar hesaplayıcı
  function hesapSecenekleri() {
    if (S.kaynak === 'resmi') {
      const d = evdsSatir('tufe_d');
      if (!d) return null;
      const r = resmiKisisel();
      const kisiselAylar = r && r.g ? [...r.g['01'].keys()].sort().filter((ay) => GRUP_KODLARI.every((k) => !yok(r.g[k].get(ay)))) : [];
      return { donemler: d.map((x) => x.tarih.slice(0, 7)), kisiselDonemler: kisiselAylar, metin: ayMetin, endeksler: [['genel', 'Genel TÜFE'], ['kisisel', 'Kişisel sepetim (2020’den)']] };
    }
    const w = webVeri();
    if (!w) return null;
    return { donemler: w.gunler, kisiselDonemler: (webKisisel() || { seri: [] }).seri.map((x) => x.tarih), metin: gunMetin, endeksler: [['genel', 'Web TÜFE genel'], ['kisisel', 'Kişisel sepetim']] };
  }
  function hesapOran(h, bas, son) {
    if (S.kaynak === 'resmi') {
      if (h.endeks === 'genel') { const m = new Map((evdsSatir('tufe_d') || []).map((x) => [x.tarih.slice(0, 7), x.deger])); return m.get(bas) && m.get(son) ? m.get(son) / m.get(bas) : null; }
      const r = resmiKisisel();
      if (!r || !r.kodlar.length) return null;
      return r.kodlar.reduce((s, k) => s + r.a[k] * (r.g[k].get(son) / r.g[k].get(bas)), 0) / r.top;
    }
    const r = webKisisel();
    if (!r) return null;
    if (h.endeks === 'genel') { const m = new Map(r.w.genel.map((x) => [x.tarih, x.endeks])); return m.get(bas) && m.get(son) ? m.get(son) / m.get(bas) : null; }
    if (!r.kodlar.length) return null;
    return r.kodlar.reduce((s, k) => s + r.a[k] * (r.harita[k].get(son) / r.harita[k].get(bas)), 0) / r.top;
  }
  function hesapCiz() {
    const h = S.hesap[S.kaynak];
    const sonuc = $('#hesap-sonuc');
    const o = hesapSecenekleri();
    $('#hesap-aciklama').textContent = S.kaynak === 'resmi' ? 'Bir tutarın iki ay arasında TÜFE’ye göre ne kadara karşılık geldiğini hesaplar (TÜİK, 2005’ten).' : 'Bir tutarın iki toplama günü arasında Web TÜFE’ye göre ne kadara karşılık geldiğini hesaplar.';
    if (!o) { ['#hesap-bas', '#hesap-son', '#hesap-endeks'].forEach((s) => $(s).replaceChildren()); sonuc.textContent = S.kaynak === 'resmi' ? evdsBosMetin('tufe_d') : webBekliyorMetin(); return; }
    const donemler = h.endeks === 'kisisel' ? o.kisiselDonemler : o.donemler;
    const imza = S.kaynak + '|' + h.endeks + '|' + donemler.join(',');
    if (imza !== S.hesapImza) {
      S.hesapImza = imza;
      const sec = (id, deger) => { const s = $(id); s.replaceChildren(...donemler.slice().reverse().map((d) => el('option', { value: d, text: o.metin(d) }))); s.value = deger; };
      if (!donemler.includes(h.son)) h.son = sonEleman(donemler);
      if (!donemler.includes(h.bas)) h.bas = S.kaynak === 'resmi' ? (donemler.includes(ayEkle(h.son || '2000-01', -12)) ? ayEkle(h.son, -12) : donemler[0]) : donemler[0];
      sec('#hesap-bas', h.bas); sec('#hesap-son', h.son);
      $('#hesap-endeks').replaceChildren(...o.endeksler.map(([v, ad]) => el('option', { value: v, text: ad })));
      $('#hesap-endeks').value = h.endeks;
      $('#hesap-tutar').value = String(h.tutar);
    }
    if (!donemler.length) { sonuc.textContent = 'Bu endeks için dönem yok.'; return; }
    const oran = hesapOran(h, h.bas, h.son);
    if (yok(oran) || !(h.tutar >= 0)) { sonuc.textContent = 'Bu dönemler için hesaplanamadı.'; return; }
    const kaynakAdi = S.kaynak === 'resmi' ? (h.endeks === 'genel' ? 'TÜFE’ye göre' : 'kişisel sepetinize (TÜİK grupları) göre') : (h.endeks === 'genel' ? 'Web TÜFE’ye göre' : 'kişisel Web TÜFE sepetinize göre');
    sonuc.replaceChildren(el('b', { text: B.tl(h.tutar) }), ' (' + o.metin(h.bas) + '), ' + kaynakAdi + ' ', el('b', { text: o.metin(h.son) }), ' itibarıyla ',
      el('b', { style: { fontSize: '19px' }, text: B.tl(h.tutar * oran) }), ' eder. Birikimli değişim ', el('b', { class: 'degisim ' + yonSinif(oran - 1, false), text: B.isaretli((oran - 1) * 100) }), '.');
  }
  const hesapDinle = (id, alan, sayi) => $(id).addEventListener(sayi ? 'input' : 'change', (e) => {
    const h = S.hesap[S.kaynak];
    h[alan] = sayi ? Number(String(e.target.value).replace(',', '.')) : e.target.value;
    if (alan === 'endeks') S.hesapImza = '';
    hesapCiz();
  });
  hesapDinle('#hesap-tutar', 'tutar', true);
  hesapDinle('#hesap-bas', 'bas');
  hesapDinle('#hesap-son', 'son');
  hesapDinle('#hesap-endeks', 'endeks');
  $$('#sepet-kaynak button').forEach((b) => b.addEventListener('click', () => {
    S.kaynak = b.dataset.deger; S.imza = ''; S.hesapImza = '';
    cizimler.kisisel();
    sepetKaydet();
  }));
  $('#sepet-sifirla').addEventListener('click', () => { S.agirlik[S.kaynak] = null; S.imza = ''; cizimler.kisisel(); sepetKaydet(); });

  cizimler.kisisel = () => {
    $$('#sepet-kaynak button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.deger === S.kaynak)));
    agirlikSatirlariCiz();
    sepetSonucCiz();
  };
