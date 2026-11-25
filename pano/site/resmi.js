
  // ================================================================ resmi göstergeler (TCMB EVDS, canlı)
  // Bu bölümün verileri EVDS bağlayıcısından gelir ve Web TÜFE verileriyle hiçbir hesapta
  // birleştirilmez. get_series_data yanıtı markdown tablodur; yükleyici {tarih, deger} satırlarına çevirir.
  const RESMI_KAYNAKLAR = ['resmi_tufe_yillik', 'resmi_gida_yillik', 'resmi_tufe_aylik', 'resmi_gida_aylik',
    'resmi_usd', 'resmi_aofm', 'resmi_beklenti'];
  // Canlılık matrisinin resmi bileşenleri (haftalık kartlı harcama ve 2022'den resmi TÜFE)
  const MATRIS_RESMI = ['resmi_kart_yillik', 'resmi_tufe_yillik_uzun'];
  RESMI_KAYNAKLAR.concat(MATRIS_RESMI).forEach((id) => dash.loader(id, {
    description: 'EVDS yanıtındaki markdown tablosunu {tarih, deger} satırlarına çevirir: günlük ve haftalık tarih GG-AA-YYYY → YYYY-AA-GG, aylık tarih YYYY-A → YYYY-AA. Değer son sütundur (haftalık serilerde araya YEARWEEK sütunu girer; varsa hafta alanına yazılır). Değeri boş satırlar (tatil, yayımlanmamış dönem) atlanır.',
    fn: ({ answer }) => {
      const metin = typeof answer === 'string' ? answer : (answer && typeof answer.result === 'string' ? answer.result : '');
      const satirlar = metin.split('\n').filter((s) => s.trim().startsWith('|'));
      if (satirlar.length < 3) throw new Error(metin.trim().slice(0, 300) || 'EVDS tablo döndürmedi.');
      const hucre = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const tarih = (s) => {
        let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        m = /^(\d{4})-(\d{1,2})$/.exec(s);
        if (m) return m[1] + '-' + m[2].padStart(2, '0');
        return s;
      };
      const bas = hucre(satirlar[0]);
      const hi = bas.findIndex((b) => /^yearweek$/i.test(b));
      const di = bas.length - 1;
      const rows = satirlar.slice(2).map(hucre).filter((h) => h[di] !== undefined && h[di] !== '')
        .map((h) => ({ tarih: tarih(h[0]), ...(hi > 0 ? { hafta: h[hi] } : {}), deger: Number(h[di]) })).filter((r) => Number.isFinite(r.deger));
      return { columns: hi > 0 ? ['tarih', 'hafta', 'deger'] : ['tarih', 'deger'], rows };
    },
  }));

  dash.calc('resmi_ozet', {
    inputs: RESMI_KAYNAKLAR,
    title: 'Resmi göstergeler: son değerler',
    description: 'Her EVDS serisinin son yayımlanan değeri ve dönemi; ABD doları için son değerin 30 gün önceki (ya da ondan önceki son iş günü) kura göre yüzde değişimi.',
    fn: (tufeYillik, gidaYillik, tufeAylik, gidaAylik, usd, aofm, beklenti) => {
      const sirala = (l) => (Array.isArray(l) ? l.filter((r) => r && r.deger != null).slice().sort((a, b) => (a.tarih < b.tarih ? -1 : 1)) : []);
      const son = (l) => { const s = sirala(l); return s.length ? s[s.length - 1] : null; };
      const u = sirala(usd);
      const uSon = u.length ? u[u.length - 1] : null;
      let usd30 = null;
      if (uSon) {
        const sinir = new Date(Date.parse(uSon.tarih + 'T00:00:00Z') - 30 * 864e5).toISOString().slice(0, 10);
        const once = u.filter((r) => r.tarih <= sinir);
        if (once.length) usd30 = Math.round((uSon.deger / once[once.length - 1].deger - 1) * 10000) / 100;
      }
      const ty = son(tufeYillik), gy = son(gidaYillik), ta = son(tufeAylik), ga = son(gidaAylik), a = son(aofm), b = son(beklenti);
      return [{
        tufe_ay: ty ? ty.tarih : null, tufe_yillik: ty ? ty.deger : null, tufe_aylik: ta ? ta.deger : null,
        gida_ay: gy ? gy.tarih : null, gida_yillik: gy ? gy.deger : null, gida_aylik: ga ? ga.deger : null,
        usd: uSon ? uSon.deger : null, usd_tarih: uSon ? uSon.tarih : null, usd_30g: usd30,
        aofm: a ? a.deger : null, aofm_tarih: a ? a.tarih : null,
        beklenti: b ? b.deger : null, beklenti_ay: b ? b.tarih : null,
      }];
    },
  });

  BICIM.kur = (v) => (sayi(v) == null ? '—' : f2(sayi(v)) + ' TL');

  const resmiTarih = (s) => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || ''));
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1)) : null;
  };
  const resmiNoktalar = (id) => {
    const d = dash.data(id);
    if (d.status !== 'ok' || !Array.isArray(d.data) || !d.data.length) return null;
    return d.data.map((r) => ({ t: resmiTarih(r.tarih), v: Number(r.deger) }))
      .filter((p) => p.t && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  };
  const ayBaslik = (t) => AY[t.getUTCMonth()] + ' ' + t.getUTCFullYear();
  function resmiLejant(el, seriler) {
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
  }
  function resmiCiz(el, kaynaklar, secenek) {
    const seriler = kaynaklar.map(([id, ad, renk, kalin]) => ({ id, ad, renk, kalin, noktalar: resmiNoktalar(id) })).filter((s) => s.noktalar);
    if (!seriler.length) {
      const durum = dash.data(kaynaklar[0][0]).status;
      bosYaz(el, durum);
      return;
    }
    wt.cizgi(el, seriler, secenek);
    if (seriler.length > 1) resmiLejant(el, seriler);
  }

  dash.draw('resmi-tufe-grafik', (el) => resmiCiz(el, [
    ['resmi_tufe_yillik', 'TÜFE genel', dash.colors[0], 2.25],
    ['resmi_gida_yillik', 'Gıda ve alkolsüz içecekler', dash.colors[2]],
  ], {
    yukseklik: 260, etiket: 'TÜİK TÜFE yıllık değişim, genel ve gıda, yüzde; kaynak TCMB EVDS',
    yBicim: (v) => '%' + f0(v), ipBicim: (v) => wt.yuzde(v), ipBaslik: ayBaslik,
  }));
  dash.draw('resmi-usd-grafik', (el) => resmiCiz(el, [['resmi_usd', 'ABD doları', dash.colors[0]]], {
    yukseklik: 240, etiket: 'TCMB ABD doları döviz alış kuru, TL; kaynak TCMB EVDS',
    yBicim: (v) => f2(v), ipBicim: (v) => f2(v) + ' TL', ipBaslik: gunBaslik,
  }));
  dash.draw('resmi-aofm-grafik', (el) => resmiCiz(el, [['resmi_aofm', 'Fonlama maliyeti', dash.colors[1]]], {
    yukseklik: 240, etiket: 'TCMB ağırlıklı ortalama fonlama maliyeti, yüzde; kaynak TCMB EVDS',
    yBicim: (v) => '%' + f0(v), ipBicim: (v) => wt.yuzde(v), ipBaslik: gunBaslik,
  }));
  dash.draw('resmi-beklenti-grafik', (el) => resmiCiz(el, [['resmi_beklenti', '12 ay sonrası TÜFE beklentisi', dash.colors[0]]], {
    yukseklik: 240, etiket: 'Piyasa Katılımcıları Anketi, 12 ay sonrası yıllık TÜFE beklentisi, yüzde; kaynak TCMB EVDS',
    yBicim: (v) => '%' + f0(v), ipBicim: (v) => wt.yuzde(v), ipBaslik: ayBaslik,
  }));
