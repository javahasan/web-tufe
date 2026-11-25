
  // ================================================================ sekmeler ve başlatma
  const SEKMELER = ['enflasyon', 'kisisel', 'makro', 'akaryakit-mobilite', 'analiz'];
  // Eski Analiz Masası bağlantıları: #haftalik, #sor, #raporlar
  const ESKI = { haftalik: ['analiz', 'haftalik'], matris: ['analiz', 'matris'], sor: ['enflasyon', null, 'sor'], raporlar: ['enflasyon', null, 'gecmis'] };
  function yonlendir() {
    let h = (location.hash || '').slice(1);
    let kaydir = null, sohbet = null;
    if (ESKI[h]) { [h, kaydir, sohbet] = ESKI[h]; }
    else if (!SEKMELER.includes(h)) {
      const hedef = h && document.getElementById(h);
      const s = hedef && hedef.closest('.sayfa');
      if (s) { kaydir = h; h = s.id; }
      else { try { h = localStorage.getItem('wt-sekme') || 'enflasyon'; } catch (e) { h = 'enflasyon'; } if (!SEKMELER.includes(h)) h = 'enflasyon'; }
    }
    D.sekme = h;
    SEKMELER.forEach((s) => { $('#' + s).hidden = s !== h; });
    $$('.sekmeler a').forEach((a) => { if (a.dataset.sekme === h) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const aktif = $('.sekmeler a[aria-current="page"]');
    if (aktif) aktif.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    try { localStorage.setItem('wt-sekme', h); } catch (e) { /* gizli pencere */ }
    yenidenCiz();
    if (kaydir) requestAnimationFrame(() => { const k = document.getElementById(kaydir); if (k) k.scrollIntoView({ block: 'start' }); });
    if (sohbet) { sohbetAc(); if (sohbet === 'gecmis') gecmisGoster(true); }
  }
  window.addEventListener('hashchange', yonlendir);
  $$('.sekmeler a').forEach((a) => a.addEventListener('click', () => {
    if (location.hash === '#' + a.dataset.sekme) return;
    requestAnimationFrame(() => { const c = $('.sekme-cubugu'); if (c && c.getBoundingClientRect().top <= 1) window.scrollTo({ top: c.offsetTop - 1 }); });
  }));

  // Genişlik değişince (yan panel açılması, telefon döndürme) grafikler yeniden çizilir
  (() => {
    let son = 0, zaman = null;
    const kap = $('main .ic');
    if (!('ResizeObserver' in window) || !kap) return;
    new ResizeObserver(() => {
      const w = kap.clientWidth;
      if (Math.abs(w - son) < 6) return;
      son = w;
      clearTimeout(zaman);
      zaman = setTimeout(yenidenCiz, 120);
    }).observe(kap);
  })();

  async function baslat() {
    yonlendir();
    const c = window.claude;
    if (!c || typeof c.use !== 'function') {
      D.capHazir = true; D.evdsBagli = false; D.guncel = { dosyalar: {} };
      const u = $('#yetenek-uyari');
      u.textContent = 'Bu sayfa Claude içinde açıldığında veri okur; burada veriler, resmi seriler ve soru penceresi kullanılamıyor.';
      u.hidden = false;
      yenidenCiz();
      return;
    }
    const al = (ad) => c.use(ad).catch(() => null);
    [D.cap.db, D.cap.user, D.cap.sample, D.cap.downloads, D.cap.mcp] = await Promise.all(['db', 'user', 'sample', 'downloads', 'mcp'].map(al));
    if (D.cap.user) { try { D.uid = await D.cap.user.id(); } catch (e) { D.uid = null; } }
    if (D.cap.mcp) {
      try {
        const lt = await D.cap.mcp.listTools(EVDS_SUNUCU);
        const s = (lt.servers || []).find((x) => x.server === EVDS_SUNUCU);
        D.evdsBagli = !!(s && (s.tools || []).some((a) => a.name === 'get_series_data')) ? null : false;
      } catch (e) { D.evdsBagli = false; }
    } else D.evdsBagli = false;
    D.capHazir = true;
    if (!D.cap.db) {
      const u = $('#yetenek-uyari');
      u.textContent = 'Veriler yalnızca Claude’da oturum açıkken okunur.';
      u.hidden = false;
    }
    evdsYetenekHazir();
    guncelDinle();
    haftalikDinle();
    raporlariDinle();
    sepetYukle();
    yenidenCiz();
  }
  baslat();
