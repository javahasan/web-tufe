
  // ================================================================ manşet bandı ve veri durumu
  // Bant her kaynaktan son değeri alır; değeri olmayan manşet banda girmez. Liste değişmedikçe
  // yeniden kurulmaz (kayan şerit baştan başlamasın diye).
  const BANT = { imza: '' };
  function mansetler() {
    const l = [];
    const ekle = (kaynak, ad, deger, degisim, yon) => { if (deger != null && deger !== '—') l.push({ kaynak, ad, deger, degisim, yon }); };
    const yonOf = (v, artisKotu) => (yok(v) || Math.abs(v) < 1e-9 ? 'notr' : (v > 0) === artisKotu ? 'yukari' : 'asagi');
    // Web TÜFE
    const w = webVeri();
    if (w) {
      ekle('web', 'Web TÜFE genel endeks', B.sayi(w.son.endeks), B.isaretli(w.son.gunluk_degisim) + ' son toplama', yonOf(w.son.gunluk_degisim, true));
      ekle('web', 'Web TÜFE, ' + gunMetin(w.ilk.tarih, true) + '’dan bu yana', B.isaretli(w.son.endeks - 100), null);
      const sd = (dosya('son_degisimler') || []).filter((r) => r.duzey === 'madde' && !yok(r.gunluk)).sort((a, b) => b.gunluk - a.gunluk);
      if (sd.length) {
        ekle('web', 'Günün en çok artan maddesi: ' + sd[0].seri_adi, B.isaretli(sd[0].gunluk, 1), null, 'yukari');
        const d = sonEleman(sd);
        if (d.gunluk < 0) ekle('web', 'Günün en çok düşen maddesi: ' + d.seri_adi, B.isaretli(d.gunluk, 1), null, 'asagi');
      }
    }
    // Resmi
    const sonVe = (id) => { const s = evdsSatir(id); if (!s || !s.length) return null; return { son: sonEleman(s), once: s.length > 1 ? s[s.length - 2] : null }; };
    const t = sonVe('tufe_y');
    if (t) ekle('resmi', 'TÜFE yıllık · ' + ayMetin(t.son.tarih), B.yuzde(t.son.deger), t.once ? B.puan(t.son.deger - t.once.deger) : null, yonOf(t.once && t.son.deger - t.once.deger, true));
    const ta = sonVe('tufe_a');
    if (ta) ekle('resmi', 'TÜFE aylık', B.yuzde(ta.son.deger), null);
    const c = sonVe('c_y');
    if (c) ekle('resmi', 'Çekirdek C yıllık', B.yuzde(c.son.deger), c.once ? B.puan(c.son.deger - c.once.deger) : null, yonOf(c.once && c.son.deger - c.once.deger, true));
    const p = sonVe('pka_12');
    if (p) ekle('resmi', '12 ay sonrası enflasyon beklentisi', B.yuzde(p.son.deger), p.once ? B.puan(p.son.deger - p.once.deger) : null, yonOf(p.once && p.son.deger - p.once.deger, true));
    const pf = sonVe('politika');
    if (pf) ekle('resmi', 'Politika faizi', B.yuzde(pf.son.deger, 1), null);
    const u = sonVe('usd');
    if (u) ekle('resmi', 'ABD doları', B.sayi(u.son.deger, 4) + ' ₺', null);
    // Akaryakıt
    const y = yakitOzet();
    if (y && y.Benzin) ekle('yakit', 'Benzin ülke ortalaması', B.sayi(y.Benzin.fiyat) + ' TL/lt', y.Benzin.d30 != null ? B.isaretli(y.Benzin.d30, 1) + ' 30 gün' : null, yonOf(y.Benzin.d30, true));
    if (y && y.Motorin) ekle('yakit', 'Motorin ülke ortalaması', B.sayi(y.Motorin.fiyat) + ' TL/lt', y.Motorin.d30 != null ? B.isaretli(y.Motorin.d30, 1) + ' 30 gün' : null, yonOf(y.Motorin.d30, true));
    // Hareketlilik
    const h = dosya('mobilite_haftalik'), sa = dosya('mobilite_saatlik');
    const sonGun = sonEleman((sa || []).map((r) => r.tarih).filter(Boolean).sort());
    const hf = h && sonGun ? sonEleman(tamHaftalar(h, sonGun)) : null;
    if (hf && !yok(hf.istege_bagli_yillik_degisim)) ekle('trafik', 'İstanbul isteğe bağlı hareketlilik, yıllık', B.isaretli(hf.istege_bagli_yillik_degisim, 1), null, yonOf(hf.istege_bagli_yillik_degisim, false));
    // Matris
    const r = matrisSatirlari();
    if (r && r.length) ekle('notr', 'Canlılık matrisi', sonEleman(r).bolge, 'fiyat ' + B.sigma(sonEleman(r).fiyat) + ', talep ' + B.sigma(sonEleman(r).talep));
    // Gerçek fiyatlardan manşetler (araya serpiştirilir)
    const g = [];
    (dosya('mansetler_gercek') || []).forEach((m) => {
      if (m.anahtar === 'en_pahali') g.push({ kaynak: 'gercek', ad: 'Günün en pahalı ürünü: ' + m.urun + ' (' + m.zincir + ')', deger: B.tl(m.deger) });
      else if (m.anahtar === 'zincir_farki') g.push({ kaynak: 'gercek', ad: 'Aynı ürün, farklı fiyat: ' + m.urun + ', ' + m.zincir + ' ' + B.tl(m.deger2) + ', ' + m.zincir2, deger: B.tl(m.deger3), degisim: 'fark ' + B.yuzde(m.deger, 0) });
      else if (m.anahtar === 'en_cok_zamlanan') g.push({ kaynak: 'gercek', ad: 'En çok zamlanan: ' + m.urun + ' (' + m.zincir + ')', deger: B.tl(m.deger3), degisim: B.isaretli(m.deger, 1), yon: 'yukari' });
      else if (m.anahtar === 'en_cok_ucuzlayan') g.push({ kaynak: 'gercek', ad: 'En çok ucuzlayan: ' + m.urun + ' (' + m.zincir + ')', deger: B.tl(m.deger3), degisim: B.isaretli(m.deger, 1), yon: 'asagi' });
      else if (m.anahtar === 'birim_fiyat' && g.filter((x) => x.birim).length < 3) g.push({ kaynak: 'gercek', birim: true, ad: m.urun + ' ' + m.birim + ' ortanca', deger: B.tl(m.deger), degisim: 'en ucuz ' + B.tl(m.deger2) });
      else if (m.anahtar === 'gozlem') g.push({ kaynak: 'gercek', ad: 'Bugün toplanan fiyat', deger: F[0](m.deger), degisim: m.deger2 + ' zincir, ' + m.deger3 + ' şehir' });
    });
    const sonuc = [];
    for (let i = 0; i < Math.max(l.length, g.length * 2); i++) {
      if (l[i]) sonuc.push(l[i]);
      if (i % 2 === 1 && g[(i - 1) / 2]) sonuc.push(g[(i - 1) / 2]);
    }
    return sonuc;
  }
  const KAYNAK_KISA = { web: 'Web TÜFE', resmi: 'Resmi', yakit: 'EPDK', trafik: 'İBB', gercek: 'Raf', notr: 'Analiz' };
  function bantCiz() {
    const liste = mansetler();
    const imza = JSON.stringify(liste);
    if (imza === BANT.imza) return;
    BANT.imza = imza;
    const serit = $('#bant-serit');
    if (!liste.length) { serit.classList.remove('akiyor'); serit.replaceChildren(el('div', { class: 'bant-liste' }, el('span', { class: 'manset' }, el('span', { class: 'manset-ad', text: 'Manşetler veri geldikçe burada döner.' })))); return; }
    const kur = (kopya) => el('div', { class: 'bant-liste', 'aria-hidden': kopya ? 'true' : null }, liste.map((m) => el('span', { class: 'manset' },
      el('span', { class: 'manset-kaynak ' + (m.kaynak === 'notr' ? 'gercek' : m.kaynak), text: KAYNAK_KISA[m.kaynak] }),
      el('span', { class: 'manset-ad', text: m.ad }),
      el('span', { class: 'manset-deger', text: m.deger }),
      m.degisim ? el('span', { class: 'manset-degisim ' + (m.yon || 'notr'), text: m.degisim }) : null)));
    serit.replaceChildren(kur(false), kur(true));
    requestAnimationFrame(() => {
      const gen = serit.firstChild ? serit.firstChild.scrollWidth : 0;
      serit.style.setProperty('--bant-sure', Math.max(30, Math.round(gen / 55)) + 's');
      serit.classList.toggle('akiyor', gen > 0);
    });
  }
  $('#bant-dugme').addEventListener('click', (e) => {
    const durdu = $('#bant').classList.toggle('durdu');
    e.currentTarget.setAttribute('aria-pressed', String(durdu));
    e.currentTarget.textContent = durdu ? 'Sürdür' : 'Durdur';
  });

  function durumCiz() {
    const yaz = (id, sinif, metin) => { const c = $(id); c.className = 'durum ' + sinif; c.lastElementChild.textContent = metin; };
    const w = webVeri();
    if (w) yaz('#durum-web', 'acik', 'Web TÜFE · son toplama ' + gunMetin(w.son.tarih, true));
    else yaz('#durum-web', dosyaDurumu('gunluk') === 'hata' || (D.dbHazir && !D.cap.db) ? 'kapali' : '', D.dbHazir && !D.cap.db ? 'Web TÜFE okunamıyor' : 'Web TÜFE yükleniyor');
    const evdsHazir = Object.values(D.evds).some((k) => k.durum === 'hazir');
    yaz('#durum-evds', D.evdsBagli === false ? 'kapali' : evdsHazir ? 'acik' : '', D.evdsBagli === false ? 'EVDS bağlı değil' : evdsHazir ? 'EVDS bağlı' : 'EVDS bekleniyor');
    const sa = dosya('mobilite_saatlik'), ak = dosya('akaryakit_ulke');
    const sonSaat = sonEleman((sa || []).map((r) => r.zaman).filter(Boolean).sort());
    const sonYakit = sonEleman((ak || []).map((r) => r.tarih).filter(Boolean).sort());
    if (sa || ak) yaz('#durum-izleme', 'acik', [sonYakit ? 'Akaryakıt ' + gunMetin(sonYakit, true) : null, sonSaat ? 'trafik ' + gunMetin(sonSaat, true) + ' ' + sonSaat.slice(11, 16) : null].filter(Boolean).join(' · '));
    else yaz('#durum-izleme', '', 'Akaryakıt ve trafik yükleniyor');
  }
  // EVDS izin şeridi: bir seri izin bekliyorsa ya da 12 saniyede hiçbir resmi seri gelmediyse görünür
  function evdsIzinCiz() {
    const ev = Object.values(D.evds);
    const izin = ev.some((k) => k.durum === 'izin');
    const sessiz = !!D.cap.mcp && D.evdsBagli !== false && !ev.some((k) => k.durum === 'hazir') && ev.some((k) => k.durum === 'yukleniyor' || k.durum === 'hata') && D.mcpZaman && Date.now() - D.mcpZaman > 12000;
    $('#evds-izin').hidden = !(izin || sessiz);
  }
  $('#evds-izin-dugme').addEventListener('click', async (e) => {
    const b = e.currentTarget, m = $('#evds-izin-metin');
    b.disabled = true;
    m.textContent = 'EVDS’ye bağlanılıyor; izin penceresi açılırsa onaylayın…';
    const hata = await evdsIzinIste();
    b.disabled = false;
    m.textContent = hata ? 'Resmi seriler yüklenemedi (' + hata + '). Claude’da EVDS bağlayıcısının bağlı olduğunu kontrol edip yeniden deneyin.' : 'İzin verildi; resmi seriler yükleniyor…';
  });
  herDaim.push(bantCiz, durumCiz, evdsIzinCiz);
