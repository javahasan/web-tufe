
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
