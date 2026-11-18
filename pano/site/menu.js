
  // ================================================================ site: menü ve bölüm geçişleri
  const SAYFALAR = ['genel-bakis', 'gruplar', 'cekirdek', 'maddeler', 'araclar', 'veri'];
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
