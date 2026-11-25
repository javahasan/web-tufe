
  // ================================================================ soru penceresi (analiz asistanı)
  // Claude soruyu sayfanın araçlarıyla veri okuyarak yanıtlar; yanıt grafikli bir rapordur ve
  // izleyicinin kendi kayıtlarına (data/users/<kimlik>) yazılır. Kaynaklar hiçbir zaman birleştirilmez.
  const AZAMI_DONEN = 260, AZAMI_KAYIT = 1500;
  const ZINCIR = { a101: 'A101', bim: 'BİM', carrefour: 'CarrefourSA', hakmar: 'Hakmar', migros: 'Migros', sok: 'ŞOK', tarim_kredi: 'Tarım Kredi', tum: 'Tüm zincirler' };
  const EVDS_BILINEN = [
    ['TP.TUKFIY2025.GENEL', 'TÜİK TÜFE genel endeks (2025=100), aylık'], ['TP.TUKFIY2025.01', 'TÜİK TÜFE gıda ve alkolsüz içecekler, aylık'],
    ['TP.FE25.OKTG03', 'Özel kapsamlı TÜFE göstergesi B (2025=100), aylık'], ['TP.FE25.OKTG04', 'Özel kapsamlı TÜFE göstergesi C (çekirdek), aylık'],
    ['TP.DK.USD.A.YTL', 'ABD doları döviz alış kuru, günlük, TL'], ['TP.APIFON4', 'TCMB ağırlıklı ortalama fonlama maliyeti, günlük, %'],
    ['TP.BISPOLFAIZ.TUR', 'TCMB politika faizi (BIS), aylık, %'], ['TP.PKAUO.S01.E.U', 'Piyasa Katılımcıları Anketi: 12 ay sonrası yıllık TÜFE beklentisi, %'],
    ['TP.PKAUO.S01.D.U', 'PKA: cari yıl sonu yıllık TÜFE beklentisi, %'], ['TP.ENFBEK.HBA12ENF', 'Hanehalkının 12 ay sonrası enflasyon beklentisi, %'],
    ['TP.ENFBEK.IYA12ENF', 'Reel sektörün 12 ay sonrası enflasyon beklentisi, %'], ['TP.TG2.Y01', 'Tüketici güven endeksi, aylık'],
    ['TP.GY1.N2.MA', 'Reel kesim güven endeksi (mevsimsellikten arındırılmış), aylık'], ['TP.KKO.MA', 'İmalat sanayi kapasite kullanım oranı (MA), aylık, %'],
    ['TP.KKHARTUT.KT1', 'Kartlı harcama tutarı, haftalık'], ['TP.HPBITABLO3.1', 'Toplam TL mevduat, haftalık, bin TL (Haziran 2024’ten)'],
    ['TP.HPBITABLO4.1', 'Toplam yabancı para mevduat, haftalık, milyon ABD doları'], ['TP.KM.F35', 'Mevduat bankaları toplam mevduat, aylık, bin TL'],
  ];
  const EVDS_FORMUL = { 0: 'düzey', 1: 'dönemsel % değişim', 2: 'fark', 3: 'yıllık % değişim', 4: 'yıllık fark', 5: 'yıl sonuna göre %', 6: 'yıl sonuna göre fark', 7: 'hareketli ortalama', 8: 'hareketli toplam' };
  const TRAFIK_AD = {
    istege_bagli: 'İsteğe bağlı (iş günü akşamı, hafta sonu gündüz ve akşam)', istege_bagli_zayif: 'Zayıf isteğe bağlı (iş günü 10-15)',
    karma: 'Karma (iş günü 16-19)', zorunlu: 'Zorunlu (iş günü 06-09, işe ve okula gidiş)', hafta_sonu_gunduz: 'Hafta sonu gündüz (11-19)',
    hafta_sonu_gece: 'Hafta sonu akşam (20-23)', is_gunu_gece: 'İş günü akşam (20-23)', is_gunu_ogle: 'İş günü öğle (10-15)',
    karma_aksam: 'İş günü akşam zirvesi (16-19)', zorunlu_sabah: 'İş günü sabah zirvesi (06-09)',
  };
  const TRAFIK_TURLERI = ['istege_bagli', 'istege_bagli_zayif', 'karma', 'zorunlu'];
  const TRAFIK_PENCERELERI = ['hafta_sonu_gunduz', 'hafta_sonu_gece', 'is_gunu_gece', 'is_gunu_ogle', 'karma_aksam', 'zorunlu_sabah'];
  const TRAFIK_OLCU = { yillik_degisim: 'yıllık değişim, %', kisa_sapma: 'son 8 haftanın aynı günlerine göre sapma, %', duzey: 'trafik indeksi, %' };
  const K = { mod: 'kisa', calisiyor: null, gecmis: [], raporlar: [], kayit: new Map(), sayac: 0, adimlar: null };

  const T = (ad) => dosya(ad) || [];
  function kaydaEkle(kaynak, baslik, sutunlar, satirlar, sorgu, aciklama) {
    const id = 'v' + (++K.sayac);
    K.kayit.set(id, { id, kaynak, baslik, sutunlar, satirlar, sorgu, aciklama: aciklama || '' });
    return id;
  }
  function seyrelt(satirlar, azami) {
    if (satirlar.length <= azami) return { satirlar, seyreltildi: false };
    const adim = Math.ceil(satirlar.length / azami);
    const s = satirlar.filter((_, i) => i % adim === 0);
    if (s[s.length - 1] !== satirlar[satirlar.length - 1]) s.push(satirlar[satirlar.length - 1]);
    return { satirlar: s, seyreltildi: true };
  }
  function seriOzeti(satirlar, anahtar, x, y) {
    return [...d3.group(satirlar.filter((r) => r[y] != null), (r) => r[anahtar])].map(([k, l]) => {
      const s = l.slice().sort((a, b) => (a[x] < b[x] ? -1 : 1)), ilk = s[0], son = s[s.length - 1];
      return { [anahtar]: k, ad: son.ad || son.seri_adi || null, ilk_tarih: ilk[x], ilk: ilk[y], son_tarih: son[x], son: son[y],
        degisim_yuzde: ilk[y] ? Math.round((son[y] / ilk[y] - 1) * 10000) / 100 : null, en_dusuk: d3.min(s, (r) => r[y]), en_yuksek: d3.max(s, (r) => r[y]), gozlem: s.length };
    });
  }
  const tarihAraligi = (satirlar, bas, son, alan = 'tarih') => satirlar.filter((r) => (!bas || String(r[alan]) >= String(bas)) && (!son || String(r[alan]) <= String(son)));
  const kodListesi = (v) => (Array.isArray(v) ? v : (v == null ? [] : String(v).split(','))).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  function adim(metin, kaynak) { if (K.adimlar) K.adimlar.append(el('li', { class: kaynak || '', text: metin })); sohbetKaydir(); }
  const webGunleri = () => { const w = webVeri(); return w ? w.gunler : []; };
  const trafikVar = () => T('mobilite_haftalik').length > 0;
  const trafikSonGun = () => T('mobilite_pencereler').reduce((m, r) => (r.tarih > m ? r.tarih : m), '') || sonEleman(T('mobilite_saatlik').map((r) => r.tarih).filter(Boolean).sort()) || null;
  const yakitVar = () => T('akaryakit_ulke').length > 0;

  function webAraclari() {
    const seriAdlari = () => {
      const m = new Map();
      T('gunluk').forEach((r) => m.set(r.seri_kodu, { kod: r.seri_kodu, ad: r.seri_adi, duzey: r.duzey }));
      T('madde_endeksleri').forEach((r) => m.set(r.seri_kodu, { kod: r.seri_kodu, ad: r.seri_adi, duzey: 'madde' }));
      return m;
    };
    return [
      { name: 'web_tufe_katalog', description: 'Web TÜFE’deki serileri (genel, ana grup, özel göstergeler, maddeler) ve veri kapsamını listeler. "arama" verilirse ada ya da koda göre süzer. Kodları bulmak için analizin başında kullan.',
        inputSchema: { type: 'object', properties: { arama: { type: 'string', description: 'Ör. "süt", "sebze". Boşsa genel, ana grup ve özel göstergeler döner.' } } },
        execute: ({ arama }) => {
          adim('Web TÜFE kataloğu okundu' + (arama ? ' (“' + String(arama) + '”)' : ''), 'web');
          const m = [...seriAdlari().values()], q = kucuk(arama), gun = webGunleri();
          const secilen = q ? m.filter((s) => kucuk(s.ad).includes(q) || String(s.kod).startsWith(q)) : m.filter((s) => s.duzey !== 'madde');
          const g = T('gunluk').filter((r) => r.seri_kodu === 'TUFE');
          return { kaynak: 'Web TÜFE (bu projenin market fiyatlarından günlük endeksi; resmi TÜFE değildir)',
            kapsam: { baz: gun[0] + ' = 100', ilk_gun: gun[0], son_gun: sonEleman(gun), toplama_gunu_sayisi: gun.length, toplama_gunleri: gun.slice(-40), sepet_agirligindaki_pay_yuzde: g.length ? sonEleman(g).kapsam : null, sehirler: 'İstanbul (Anadolu), Ankara, İzmir', kaynak_site: 'marketfiyati.org.tr' },
            seriler: secilen.slice(0, 60), not: secilen.length > 60 ? (secilen.length - 60) + ' seri daha var; aramayı daralt.' : undefined };
        } },
      { name: 'web_tufe_endeks', description: 'Web TÜFE seri ya da madde kodlarının günlük endeksini (ilk toplama günü = 100) ve önceki toplamaya göre değişimini döndürür. Sonuçtaki veri_kimligi grafikte kullanılır.',
        inputSchema: { type: 'object', properties: { kodlar: { type: 'array', items: { type: 'string' }, description: 'Ör. ["TUFE","01"]; en çok 12' }, baslangic: { type: 'string' }, bitis: { type: 'string' } }, required: ['kodlar'] },
        execute: ({ kodlar, baslangic, bitis }) => {
          const k = new Set(kodListesi(kodlar));
          if (!k.size) throw new Error('En az bir kod ver.');
          const satirlar = tarihAraligi([...T('gunluk'), ...T('madde_endeksleri')].filter((r) => k.has(r.seri_kodu)), baslangic, bitis)
            .map((r) => ({ tarih: r.tarih, kod: r.seri_kodu, ad: r.seri_adi, endeks: r.endeks, gunluk_degisim: r.gunluk_degisim }))
            .sort((a, b) => (a.kod === b.kod ? (a.tarih < b.tarih ? -1 : 1) : (a.kod < b.kod ? -1 : 1)));
          if (!satirlar.length) throw new Error('Bu kodlar için veri yok. web_tufe_katalog ile kodları kontrol et.');
          const id = kaydaEkle('web', 'Web TÜFE günlük endeks', ['tarih', 'kod', 'ad', 'endeks', 'gunluk_degisim'], satirlar, { arac: 'web_tufe_endeks', kodlar: [...k], baslangic, bitis }, 'İlk toplama günü = 100');
          adim('Web TÜFE endeksi okundu: ' + [...new Set(satirlar.map((r) => r.ad))].slice(0, 4).join(', '), 'web');
          const s = seyrelt(satirlar, AZAMI_DONEN);
          return { veri_kimligi: id, sutunlar: ['tarih', 'kod', 'ad', 'endeks', 'gunluk_degisim'], ozet: seriOzeti(satirlar, 'kod', 'tarih', 'endeks'), satirlar: s.satirlar, seyreltildi: s.seyreltildi || undefined };
        } },
      { name: 'web_tufe_aylik', description: 'Web TÜFE aylık endeksini (ayın ilk 24 gününün geometrik ortalaması), aylık ve yıllık değişimi ve ayın kesin ya da geçici olduğunu döndürür. Aylık değişim için iki ay, yıllık için on üç ay veri gerekir.',
        inputSchema: { type: 'object', properties: { kodlar: { type: 'array', items: { type: 'string' } } }, required: ['kodlar'] },
        execute: ({ kodlar }) => {
          const k = new Set(kodListesi(kodlar));
          const satirlar = T('aylik').filter((r) => k.has(r.seri_kodu)).map((r) => ({ ay: r.ay, kod: r.seri_kodu, ad: r.seri_adi, endeks: r.endeks, aylik_degisim: r.aylik_degisim, yillik_degisim: r.yillik_degisim, durum: r.kesin, gun: r.gun }));
          if (!satirlar.length) throw new Error('Bu kodlar için aylık veri yok.');
          const id = kaydaEkle('web', 'Web TÜFE aylık endeks', Object.keys(satirlar[0]), satirlar, { arac: 'web_tufe_aylik', kodlar: [...k] });
          adim('Web TÜFE aylık endeksi okundu', 'web');
          return { veri_kimligi: id, satirlar: seyrelt(satirlar, AZAMI_DONEN).satirlar };
        } },
      { name: 'web_tufe_fiyat', description: 'Madde kodları için her toplama gününde raf fiyatlarının ortanca birim fiyatını (TL/Kg, TL/Lt ya da TL/Adet) döndürür. zincir_kirilimi=true ise zincir zincir verir. Ortanca ürün karmasıyla değişir; enflasyon için endeksi kullan.',
        inputSchema: { type: 'object', properties: { madde_kodlari: { type: 'array', items: { type: 'string' } }, zincir_kirilimi: { type: 'boolean' }, baslangic: { type: 'string' }, bitis: { type: 'string' } }, required: ['madde_kodlari'] },
        execute: async ({ madde_kodlari, zincir_kirilimi, baslangic, bitis }) => {
          await dosyaBekle('madde_fiyatlari');
          const k = new Set(kodListesi(madde_kodlari)), zk = zincir_kirilimi === true || zincir_kirilimi === 'true';
          const satirlar = tarihAraligi(T('madde_fiyatlari').filter((r) => k.has(r.madde_kodu) && (zk ? r.zincir !== 'tum' : r.zincir === 'tum')), baslangic, bitis)
            .map((r) => ({ tarih: r.tarih, kod: r.madde_kodu, ad: r.madde_adi, zincir: ZINCIR[r.zincir] || r.zincir, birim: r.birim, fiyat: r.ortanca_birim_fiyat, urun_sayisi: r.urun_sayisi }));
          if (!satirlar.length) throw new Error('Bu maddeler için fiyat yok.');
          const id = kaydaEkle('web', 'Web TÜFE ortanca birim fiyat' + (zk ? ' (zincir bazında)' : ''), Object.keys(satirlar[0]), satirlar, { arac: 'web_tufe_fiyat', madde_kodlari: [...k], zincir_kirilimi: zk, baslangic, bitis }, 'Raf fiyatı, TL/birim');
          adim('Market fiyatları okundu' + (zk ? ' (zincir bazında)' : ''), 'web');
          return { veri_kimligi: id, satirlar: seyrelt(satirlar, AZAMI_DONEN).satirlar };
        } },
      { name: 'web_tufe_hareketler', description: 'En çok artan ya da düşen Web TÜFE kalemlerini sıralar. olcu: "baslangictan" (ilk toplama gününden bu yana), "son_gun" (önceki toplamaya göre), "aylik". duzey: "madde" ya da "grup".',
        inputSchema: { type: 'object', properties: { olcu: { type: 'string', enum: ['baslangictan', 'son_gun', 'aylik'] }, yon: { type: 'string', enum: ['artan', 'dusen'] }, duzey: { type: 'string', enum: ['madde', 'grup'] }, n: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['olcu', 'yon'] },
        execute: ({ olcu, yon, duzey, n }) => {
          const adet = Math.max(1, Math.min(25, Number(n) || 10)), dz = duzey === 'grup' ? 'grup' : 'madde';
          let satirlar;
          if (olcu === 'baslangictan') {
            if (dz !== 'madde') throw new Error('baslangictan yalnızca madde düzeyinde.');
            satirlar = seriOzeti(T('madde_endeksleri').map((r) => ({ ...r, ad: r.seri_adi })), 'seri_kodu', 'tarih', 'endeks').filter((r) => r.degisim_yuzde != null && r.ilk_tarih !== r.son_tarih)
              .map((r) => ({ kod: r.seri_kodu, ad: r.ad, deger: r.degisim_yuzde, ilk_tarih: r.ilk_tarih, son_tarih: r.son_tarih }));
          } else {
            const alan = olcu === 'aylik' ? 'aylik' : 'gunluk';
            satirlar = T('son_degisimler').filter((r) => r.duzey === dz && r[alan] != null).map((r) => ({ kod: r.seri_kodu, ad: r.seri_adi, deger: r[alan], tarih: r.tarih }));
          }
          satirlar.sort((a, b) => (yon === 'dusen' ? a.deger - b.deger : b.deger - a.deger));
          satirlar = satirlar.slice(0, adet);
          if (!satirlar.length) throw new Error('Bu ölçü için henüz yeterli veri yok.');
          const id = kaydaEkle('web', 'Web TÜFE: en çok ' + (yon === 'dusen' ? 'düşen' : 'artan') + ' kalemler (' + olcu + ')', Object.keys(satirlar[0]), satirlar, { arac: 'web_tufe_hareketler', olcu, yon, duzey: dz, n: adet }, 'deger: yüzde değişim');
          adim('Web TÜFE hareketleri sıralandı', 'web');
          return { veri_kimligi: id, satirlar };
        } },
    ];
  }

  async function evdsCagir(arac, girdi, signal) {
    try {
      const yanit = await D.cap.mcp.callTool(EVDS_SUNUCU, arac, girdi, { signal, cache: { staleTime: 3600e3, gcTime: 3600e3 } });
      return evdsMetni(yanit);
    } catch (e) {
      const kod = e && e.code;
      if (YETKI_HATASI.has(kod) && kod !== 'not_in_manifest') D.evdsBagli = false;
      throw new Error('EVDS çağrısı başarısız (' + (kod || 'hata') + ')' + (e && e.message ? ': ' + e.message : ''));
    }
  }
  const kisalt = (s, n) => (s.length > n ? s.slice(0, n) + '\n…(kısaltıldı)' : s);
  function evdsAraclari() {
    if (D.evdsBagli === false || !D.cap.mcp) return [];
    return [
      { name: 'evds_kesfet', description: 'TCMB EVDS’de resmi seri arar. adim="kategoriler" kategori ağacını; adim="veri_gruplari" bir kategorinin veri gruplarını (kategori_id, anahtar_kelimeler); adim="seriler" bir veri grubunun serilerini (veri_grubu, anahtar_kelimeler) döndürür. Sık kullanılan kodlar istemde verildi; yetiyorsa bu aracı kullanma.',
        inputSchema: { type: 'object', properties: { adim: { type: 'string', enum: ['kategoriler', 'veri_gruplari', 'seriler'] }, kategori_id: { type: 'integer' }, veri_grubu: { type: 'string' }, anahtar_kelimeler: { type: 'string' } }, required: ['adim'] },
        execute: async ({ adim: a, kategori_id, veri_grubu, anahtar_kelimeler }, baglam) => {
          let metin;
          if (a === 'kategoriler') metin = await evdsCagir('list_categories', {}, baglam && baglam.signal);
          else if (a === 'veri_gruplari') metin = await evdsCagir('list_datagroups', { category_id: Number(kategori_id), keywords: String(anahtar_kelimeler || '') }, baglam && baglam.signal);
          else if (a === 'seriler') metin = await evdsCagir('list_series', { datagroup_code: String(veri_grubu || ''), keywords: String(anahtar_kelimeler || '') }, baglam && baglam.signal);
          else throw new Error('adim kategoriler, veri_gruplari ya da seriler olmalı.');
          adim('EVDS’de seri arandı (' + a + (anahtar_kelimeler ? ': ' + anahtar_kelimeler : '') + ')', 'resmi');
          return kisalt(metin, 14000);
        } },
      { name: 'evds_seri_verisi', description: 'Bir TCMB EVDS serisinin verisini okur (resmi kaynak). Satırlar {tarih, kod, ad, deger}; haftalık serilerde ISO "hafta" da vardır. formul: "1" dönemsel % değişim, "3" yıllık % değişim; boşsa düzey. frekans: "5" aylık, "3" haftalık (toplulastirma "avg" ya da "last"). İstek başına en çok 1000 gözlem.',
        inputSchema: { type: 'object', properties: { seri_kodu: { type: 'string' }, ad: { type: 'string' }, baslangic: { type: 'string', description: 'YYYY-AA-GG' }, bitis: { type: 'string', description: 'YYYY-AA-GG' },
          formul: { type: 'string', enum: ['', '0', '1', '2', '3', '4', '5', '6', '7', '8'] }, frekans: { type: 'string', enum: ['', '1', '2', '3', '4', '5', '6', '7', '8'] }, toplulastirma: { type: 'string', enum: ['', 'avg', 'min', 'max', 'first', 'last', 'sum'] } }, required: ['seri_kodu', 'baslangic', 'bitis'] },
        execute: async ({ seri_kodu, ad, baslangic, bitis, formul, frekans, toplulastirma }, baglam) => {
          const kod = String(seri_kodu || '').trim();
          if (!/^[A-Za-z0-9_.-]{1,256}$/.test(kod)) throw new Error('Geçersiz seri kodu.');
          const girdi = { series_code: kod, start_date: String(baslangic), end_date: String(bitis), full_data: true };
          if (formul) girdi.formulas = String(formul);
          if (frekans) girdi.frequency = String(frekans);
          if (toplulastirma) girdi.aggregation = String(toplulastirma);
          const metin = await evdsCagir('get_series_data', girdi, baglam && baglam.signal);
          const bilinen = EVDS_BILINEN.find(([k]) => k === kod);
          const kisaAd = String(ad || (bilinen ? bilinen[1].split(',')[0] : kod));
          const satirlar = evdsCoz(metin, kod).map((r) => ({ tarih: r.tarih, ...(r.hafta ? { hafta: r.hafta } : {}), kod, ad: kisaAd, deger: r.deger }));
          if (!satirlar.length) throw new Error('Bu aralıkta değer yok.');
          const ek = formul && formul !== '0' ? ' (' + EVDS_FORMUL[formul] + ')' : '';
          const id = kaydaEkle('resmi', 'TCMB EVDS: ' + kisaAd + ek, Object.keys(satirlar[0]), satirlar, { arac: 'get_series_data', seri: kod, baslangic, bitis, formul: formul || undefined, frekans: frekans || undefined, toplulastirma: toplulastirma || undefined }, 'Kaynak: TCMB EVDS');
          adim('EVDS verisi okundu: ' + kisaAd + ek, 'resmi');
          const s = seyrelt(satirlar, AZAMI_DONEN);
          return { veri_kimligi: id, kaynak: 'Resmi (TCMB EVDS)', seri: kod, ozet: seriOzeti(satirlar, 'kod', 'tarih', 'deger'), satirlar: s.satirlar, seyreltildi: s.seyreltildi || undefined };
        } },
    ];
  }

  function trafikAraclari() {
    if (!trafikVar()) return [];
    return [{ name: 'istanbul_hareketlilik',
      description: 'İstanbul trafik hareketliliği (İBB trafik indeksinden bu projenin hesapladığı göstergeler; Web TÜFE ya da EVDS değildir). duzey="haftalik": ISO haftası başına gösterge değerleri; olcu "yillik_degisim" (varsayılan) ya da "kisa_sapma". Bitmemiş hafta ve temiz günü 4’ten az olan bayram haftaları çıkarılır (tatil_haftalari=true ile gelir). duzey="gunluk": gün ve saat penceresi başına; olcu "duzey" (varsayılan), "yillik_degisim" ya da "kisa_sapma"; tarih verilmezse son 120 gün. gostergeler: türler ' + TRAFIK_TURLERI.join(', ') + ' ya da pencereler ' + TRAFIK_PENCERELERI.join(', ') + '. Tüketimle ilişkili hareketlilik için istege_bagli ve hafta_sonu_gunduz kullan.',
      inputSchema: { type: 'object', properties: { duzey: { type: 'string', enum: ['haftalik', 'gunluk'] }, olcu: { type: 'string', enum: ['yillik_degisim', 'kisa_sapma', 'duzey'] },
        gostergeler: { type: 'array', items: { type: 'string', enum: [...TRAFIK_TURLERI, ...TRAFIK_PENCERELERI] } }, baslangic: { type: 'string' }, bitis: { type: 'string' }, tatil_haftalari: { type: 'boolean' } }, required: ['duzey'] },
      execute: async ({ duzey, olcu, gostergeler, baslangic, bitis, tatil_haftalari }) => {
        const secilen = (kodListesi(gostergeler).filter((x) => TRAFIK_AD[x]).length ? kodListesi(gostergeler).filter((x) => TRAFIK_AD[x]) : ['istege_bagli', 'zorunlu']);
        let satirlar, sutunlar, x, baslik, not;
        if (duzey === 'gunluk') {
          await dosyaBekle('mobilite_pencereler');
          const sonGun = trafikSonGun();
          const o = olcu === 'yillik_degisim' || olcu === 'kisa_sapma' ? olcu : 'duzey';
          satirlar = tarihAraligi(T('mobilite_pencereler').filter((r) => secilen.includes(r.pencere) || secilen.includes(r.tur)), baslangic || (sonGun ? gunEkle(sonGun, -119) : null), bitis)
            .map((r) => ({ tarih: r.tarih, gosterge: r.pencere, ad: TRAFIK_AD[r.pencere] || r.pencere, tur: r.tur, deger: o === 'duzey' ? r.deger : r[o], gun_tipi: r.gun_tipi, temiz: r.temiz === 'True' }))
            .filter((r) => !yok(r.deger)).sort((a, b) => (a.gosterge === b.gosterge ? (a.tarih < b.tarih ? -1 : 1) : (a.gosterge < b.gosterge ? -1 : 1)));
          sutunlar = ['tarih', 'gosterge', 'ad', 'tur', 'deger', 'gun_tipi', 'temiz']; x = 'tarih'; olcu = o;
          baslik = 'İstanbul hareketliliği: günlük (' + TRAFIK_OLCU[o] + ')'; not = 'temiz=false: resmi tatil, arife, bayram çevresi ya da okul durumu farklı gün.';
        } else {
          const o = olcu === 'kisa_sapma' ? 'kisa_sapma' : 'yillik_degisim';
          const sonGun = trafikSonGun();
          satirlar = [];
          T('mobilite_haftalik').forEach((r) => {
            if (!r.hafta_basi || (sonGun && gunEkle(r.hafta_basi, 6) > sonGun)) return;
            if (!(tatil_haftalari === true || tatil_haftalari === 'true') && !(r.temiz_gun >= 4)) return;
            secilen.forEach((k) => { const v = r[k + '_' + o]; if (!yok(v)) satirlar.push({ hafta_basi: r.hafta_basi, hafta: r.hafta, gosterge: k, ad: TRAFIK_AD[k], deger: v, temiz_gun: r.temiz_gun }); });
          });
          satirlar = tarihAraligi(satirlar, baslangic, bitis, 'hafta_basi').sort((a, b) => (a.gosterge === b.gosterge ? (a.hafta_basi < b.hafta_basi ? -1 : 1) : (a.gosterge < b.gosterge ? -1 : 1)));
          sutunlar = ['hafta_basi', 'hafta', 'gosterge', 'ad', 'deger', 'temiz_gun']; x = 'hafta_basi'; olcu = o;
          baslik = 'İstanbul hareketliliği: haftalık (' + TRAFIK_OLCU[o] + ')';
        }
        if (!satirlar.length) throw new Error('Bu gösterge ve dönem için hareketlilik verisi yok (yıllık değişim Eylül 2025’ten başlar).');
        const id = kaydaEkle('trafik', baslik, sutunlar, satirlar, { arac: 'istanbul_hareketlilik', duzey: duzey === 'gunluk' ? 'gunluk' : 'haftalik', olcu, gostergeler: secilen, baslangic, bitis }, 'Kaynak: İBB trafik indeksi');
        adim('İstanbul hareketliliği okundu: ' + secilen.map((k) => TRAFIK_AD[k].split(' (')[0]).join(', '), 'trafik');
        const s = seyrelt(satirlar, AZAMI_DONEN);
        return { veri_kimligi: id, kaynak: 'İstanbul trafik hareketliliği (İBB trafik indeksi, bu proje)', x, son_veri_gunu: trafikSonGun(), olcu: TRAFIK_OLCU[olcu], satirlar: s.satirlar, seyreltildi: s.seyreltildi || undefined, not };
      } }];
  }

  function yakitAraclari() {
    if (!yakitVar()) return [];
    return [{ name: 'akaryakit_fiyat',
      description: 'EPDK akaryakıt fiyatları (bu projenin EPDK web servislerinden derlemesi; Web TÜFE ya da EVDS değildir). duzey="ulke": benzin ve motorinde en yüksek hacimli 8 firmanın ülke ortalaması, günlük TL/litre, 2023’ten; yakitlar ["Benzin","Motorin"], tarih aralığı verilebilir. duzey="il": 81 ilin son fiyatları (Benzin, Motorin, Otogaz firma ortancası, en düşük, en yüksek, firma sayısı); iller verilebilir (ör. ["İstanbul","Ankara"]).',
      inputSchema: { type: 'object', properties: { duzey: { type: 'string', enum: ['ulke', 'il'] }, yakitlar: { type: 'array', items: { type: 'string', enum: ['Benzin', 'Motorin', 'Otogaz'] } }, iller: { type: 'array', items: { type: 'string' } }, baslangic: { type: 'string' }, bitis: { type: 'string' } }, required: ['duzey'] },
      execute: ({ duzey, yakitlar, iller, baslangic, bitis }) => {
        const y = new Set(kodListesi(yakitlar).length ? kodListesi(yakitlar) : ['Benzin', 'Motorin', 'Otogaz']);
        let satirlar, baslik;
        if (duzey === 'il') {
          const il = new Set(kodListesi(iller).map(kucuk));
          satirlar = T('akaryakit_il').filter((r) => y.has(r.yakit) && (!il.size || il.has(kucuk(r.il_adi))))
            .map((r) => ({ tarih: r.tarih, il: r.il_adi, yakit: r.yakit, fiyat: r.ortanca, en_dusuk: r.en_dusuk, en_yuksek: r.en_yuksek, firma: r.firma }));
          baslik = 'EPDK: illere göre son akaryakıt fiyatları (TL/lt)';
        } else {
          satirlar = tarihAraligi(T('akaryakit_ulke').filter((r) => y.has(r.yakit)), baslangic, bitis).map((r) => ({ tarih: r.tarih, yakit: r.yakit, fiyat: r.fiyat }));
          baslik = 'EPDK: benzin ve motorin ülke ortalaması (TL/lt)';
        }
        if (!satirlar.length) throw new Error('Bu seçim için akaryakıt verisi yok.');
        const id = kaydaEkle('yakit', baslik, Object.keys(satirlar[0]), satirlar, { arac: 'akaryakit_fiyat', duzey, yakitlar: [...y], iller, baslangic, bitis }, 'Kaynak: EPDK');
        adim('Akaryakıt fiyatları okundu (' + (duzey === 'il' ? 'iller' : 'ülke ortalaması') + ')', 'yakit');
        const s = seyrelt(satirlar, AZAMI_DONEN);
        return { veri_kimligi: id, kaynak: 'EPDK akaryakıt fiyatları (bu proje)', ozet: duzey === 'il' ? undefined : seriOzeti(satirlar, 'yakit', 'tarih', 'fiyat'), satirlar: s.satirlar, seyreltildi: s.seyreltildi || undefined };
      } }];
  }

  const SEKME_ADI = { enflasyon: 'Enflasyon Takibi', kisisel: 'Kişisel Enflasyon', makro: 'Makro Göstergeler', 'akaryakit-mobilite': 'Akaryakıt ve Mobilite', analiz: 'Ekonomik Analiz' };
  function istem(soru, mod) {
    const bugun = bugunTR(), gun = webGunleri(), kisa = mod !== 'whitepaper', evdsAcik = D.evdsBagli !== false && !!D.cap.mcp;
    const onceki = K.gecmis.slice(-2).map((g) => '- Soru: ' + g.soru + ' → Yanıt: ' + g.baslik + '. ' + g.ozet).join('\n');
    return [
      'Bir Türk bankasının ekonomi ekibi için çalışan bir analistsin. Aşağıdaki soruyu araçlarla veri okuyarak yanıtla. Bugün ' + bugun + '. Türkçe yaz. Kullanıcı şu an platformun "' + (SEKME_ADI[D.sekme] || '') + '" sekmesinde.',
      '',
      'VERİ KAYNAKLARI — BİRBİRİNE ASLA KARIŞTIRILMAZ:',
      '1) Web TÜFE: bu projenin marketfiyati.org.tr’den İstanbul (Anadolu), Ankara ve İzmir’de her gün topladığı market fiyatlarından hesapladığı günlük endeks. Baz: ilk toplama günü (' + (gun[0] || '2026-11-12') + ') = 100. Toplama günü sayısı: ' + gun.length + '. Kapsam TÜİK sepetinin market ürünleri (çoğu gıda). Resmi TÜFE değildir; her zaman "Web TÜFE" diye an.',
      '2) Resmi seriler: TCMB EVDS (TÜİK TÜFE ve çekirdek göstergeler, beklenti anketleri, güven endeksleri, kur, faiz, kartlı harcama, mevduat). ' + (evdsAcik
        ? 'EVDS araçları açık. Sık kullanılan kodlar: ' + EVDS_BILINEN.map(([k, a]) => k + ' = ' + a).join('; ') + '. Aylık TÜFE için yıllık değişim formul "3", aylık değişim formul "1". Başka seri gerekirse evds_kesfet ile ara.'
        : 'Bu oturumda EVDS bağlı değil; resmi veri kullanma, gerekirse bunu sınır olarak belirt.'),
      '3) İstanbul trafik hareketliliği (İBB): ' + (trafikVar() ? 'İBB trafik indeksinden (saatlik yol tıkanıklığı, %) bu projenin hesapladığı göstergeler; istanbul_hareketlilik aracıyla okunur. İsteğe bağlı hareketlilik tüketimle ilişkili hareketliliğin en temiz ölçüsüdür. Yıllık değişim 52 hafta önceki aynı gün tipine göredir; veri Eylül 2024’te, yıllık değişim Eylül 2025’te başlar. Son veri günü: ' + trafikSonGun() + '. Yalnızca İstanbul; tıkanıklık ölçüsüdür, araç sayısı ya da harcama değildir. Hava ve Ramazan kayması için düzeltme yoktur. Her zaman "İstanbul trafik hareketliliği (İBB)" diye an.' : 'Bu oturumda yüklenmedi; kullanma.'),
      '4) Akaryakıt (EPDK): ' + (yakitVar() ? 'EPDK web servislerinden bu projenin derlediği bayi satış fiyatları; akaryakit_fiyat aracıyla okunur. Ülke ortalaması 8 firmanın ortalamasıdır (2023’ten), il fiyatları firma ortancasıdır. Web TÜFE’ye dahil değildir.' : 'Bu oturumda yüklenmedi; kullanma.'),
      'Haftalık karşılaştırmada EVDS haftalık serilerindeki "hafta" alanını hareketlilikteki "hafta" alanıyla eşleştir (ikisi de ISO haftası). İlişki sorularında iki serinin aynı dönemlerdeki yönünü ve büyüklüğünü yan yana anlat; birlikte hareketi nedensellik gibi sunma, ortak etkenleri sınır olarak belirt.',
      'Verimli çalış: birbirinden bağımsız araç çağrılarını aynı turda birlikte yap; tur sayısı sınırlıdır.',
      'Kurallar: Kaynakları tek seride birleştirme, zincirleme, ortalama ya da birbirinin yerine kullanma. Karşılaştırma yalnızca yan yana ve kaynak adıyla yapılır. Yalnızca araçlardan gelen sayıları kullan; tahmin ettiğin bir sayıyı veri gibi sunma. Veri kısaysa bunu açıkça söyle. Ortanca fiyatlar ürün karmasıyla değişir; fiyat değişimi için endeksi kullan. Yatırım tavsiyesi verme.',
      onceki ? '\nÖNCEKİ KONUŞMA (bağlam için; sayıları yeniden araçlardan oku):\n' + onceki : '',
      '',
      kisa ? 'BİÇİM: Kısa yanıt. 1-2 bölüm, toplam 120-250 kelime, en çok 1 grafik.'
        : 'BİÇİM: Ayrıntılı rapor. 4-6 bölüm (ör. Yönetici özeti, Veri ve yöntem, Bulgular, Riskler ve sınırlar, Sonuç ve izlenecekler), toplam 600-1100 kelime, 2-4 grafik.',
      '',
      'Son mesajın YALNIZCA şu biçimde tek bir JSON nesnesi olsun:',
      '{"baslik": "kısa başlık", "ozet": "2-3 cümle", "bulgular": ["3-5 madde"], "bolumler": [{"baslik": "...", "metin": "paragraflar; paragraf arası boş satır; madde için satır başında \'- \'", "grafik": null}], "sinirlar": ["veri ve yöntem sınırları"], "izlenecekler": ["takip edilecek göstergeler (isteğe bağlı)"]}',
      'Grafik: {"tur": "cizgi" ya da "cubuk", "baslik": "...", "birim": "endeks" | "%" | "TL" | başka, "seriler": [{"veri_kimligi": "v1", "x": "tarih", "y": "endeks", "filtre": {"kod": "TUFE"}, "ad": "Web TÜFE genel"}]}. veri_kimligi bir araç sonucundan gelmeli; x ve y o sonucun sütun adları olmalı. Çubuk grafikte x kategori sütunudur (ör. "ad"), y değer sütunudur.',
      '',
      'SORU: ' + soru,
    ].join('\n');
  }

  // ---------------------------------------------------------------- arayüz
  const ORNEKLER = [
    { metin: 'Toplamaya başladığımızdan bu yana en çok pahalanan ve ucuzlayan 10 gıda kalemi hangileri?' },
    { metin: 'Son yıllık TÜFE, çekirdek C ve 12 ay sonrası beklentiler ne söylüyor?', evds: true },
    { metin: 'Benzin fiyatları son üç ayda nasıl değişti, en pahalı ve en ucuz iller hangileri?', yakit: true },
    { metin: 'İstanbul’da hafta sonu hareketliliği geçen yıla göre nasıl değişti? Zorunlu hareketlilikle karşılaştır.', trafik: true },
    { metin: 'Temel gıdalarda (süt, yumurta, ekmek, domates) zincirler arasındaki fiyat farkı ne durumda?' },
  ];
  function sohbetKaydir() { const g = $('#sohbet-govde'); requestAnimationFrame(() => { g.scrollTop = g.scrollHeight; }); }
  function hosgeldinCiz() {
    const g = $('#sohbet-govde');
    if (g.childElementCount) return;
    g.append(el('div', { class: 'hosgeldin', id: 'sohbet-hosgeldin' },
      el('h3', { text: 'Verilere soru sorun' }),
      el('p', { style: { margin: 0 }, text: 'Web TÜFE, resmi seriler (EVDS), akaryakıt ve İstanbul hareketliliğinden veri okuyarak grafikli yanıt hazırlar. Yanıtlar yalnızca size görünür ve kayıtlı yanıtlarda saklanır.' }),
      el('div', { class: 'ornekler' }, ORNEKLER.map((o) => el('button', { type: 'button', class: 'ornek', text: o.metin,
        disabled: (o.evds && D.evdsBagli === false) || (o.trafik && !trafikVar()) || (o.yakit && !yakitVar()),
        onclick: () => { $('#sohbet-soru').value = o.metin; $('#sohbet-soru').focus(); } })))));
  }
  function sohbetAc() {
    $('#sohbet').hidden = false;
    $('#sohbet-ac').setAttribute('aria-expanded', 'true');
    TEMBEL_DOSYA.forEach((ad) => dosyaYukle(ad));
    hosgeldinCiz();
    setTimeout(() => $('#sohbet-soru').focus(), 30);
  }
  function sohbetKapat() {
    $('#sohbet').hidden = true;
    $('#sohbet-ac').setAttribute('aria-expanded', 'false');
    $('#sohbet-ac').focus();
  }
  function gecmisGoster(acik) {
    $('#sohbet-gecmis').setAttribute('aria-pressed', String(acik));
    $('#sohbet-gecmis-liste').hidden = !acik;
    $('#sohbet-govde').hidden = acik;
    $('#sohbet-form').hidden = acik;
    if (acik) gecmisCiz();
  }
  function gecmisCiz() {
    const kap = $('#sohbet-gecmis-liste');
    if (!D.cap.db || !D.uid) { kap.replaceChildren(el('p', { class: 'bos-durum', text: 'Kayıtlı yanıtlar yalnızca Claude’da oturum açıkken görünür.' })); return; }
    if (!K.raporlar.length) { kap.replaceChildren(el('p', { class: 'bos-durum', text: 'Henüz kayıtlı yanıt yok. Sorduğunuz sorular ve yanıtları burada saklanır.' })); return; }
    kap.replaceChildren(el('div', { class: 'gecmis' }, K.raporlar.map((r) => el('div', { class: 'gecmis-oge' },
      el('button', { type: 'button', class: 'ac', text: (r.rapor && r.rapor.baslik) || r.soru, onclick: () => { gecmisGoster(false); kayitliAc(r); } }),
      el('span', { text: zamanMetin(r.olusturma) })))));
  }
  function kayitliAc(r) {
    const hg = $('#sohbet-hosgeldin');
    if (hg) hg.remove();
    const m = el('div', { class: 'mesaj asistan' });
    $('#sohbet-govde').append(el('div', { class: 'mesaj kullanici', text: r.soru || '' }), m);
    const sil = el('button', { type: 'button', text: 'Sil' });
    sil.addEventListener('click', () => {
      if (sil.dataset.onay !== '1') { sil.dataset.onay = '1'; sil.textContent = 'Silinsin mi? Tekrar bas'; return; }
      D.cap.db.doc('data/users/' + D.uid + '/' + r.id).delete().then(() => { m.previousSibling && m.previousSibling.remove(); m.remove(); }).catch(() => { sil.textContent = 'Silinemedi'; });
    });
    yanitCiz(m, { ...r, rapor: raporuDuzelt(r.rapor), veriler: r.veriler || {} }, [sil]);
    sohbetKaydir();
  }
  function yanitCiz(m, paket, ekDugmeler) {
    const araclar = el('div', { class: 'mesaj-araclar' });
    m.replaceChildren();
    const govde = raporCiz(m, paket, {});
    m.append(araclar);
    if (D.cap.downloads) araclar.append(el('button', { type: 'button', text: 'HTML olarak indir', onclick: () => raporuIndir(govde, paket) }));
    (ekDugmeler || []).forEach((d) => araclar.append(d));
  }
  function raporlariDinle() {
    if (!D.cap.db || !D.uid) return;
    D.cap.db.collection('data/users/' + D.uid).orderBy('olusturma', 'desc').limit(50).onSnapshot((snap) => {
      K.raporlar = snap.docs.filter((d) => d.exists && (d.data() || {}).tur === 'rapor').map((d) => ({ id: d.id, ...d.data() }));
      if (!$('#sohbet-gecmis-liste').hidden) gecmisCiz();
    }, (e) => console.warn(e));
  }
  function dosyaBekle(ad, ms = 15000) {
    dosyaYukle(ad);
    return new Promise((coz) => {
      const bas = Date.now();
      const bak = () => { const d = dosyaDurumu(ad); if (d === 'hazir' || d === 'hata' || d === 'yok' || Date.now() - bas > ms) coz(); else setTimeout(bak, 200); };
      bak();
    });
  }
  function hataMetni(kod, e) {
    const m = {
      not_granted: 'Claude’a erişim izni verilmedi. İzin vermek için sayfayı yenileyip yeniden sorun.', sampling_disabled: 'Bu hesapta Claude kullanılamıyor.',
      rate_limited: 'Kısa sürede çok soru soruldu ya da kullanım sınırına ulaşıldı. Biraz sonra yeniden deneyin.', invalid_json: 'Yanıt rapor biçiminde gelmedi. Soruyu biraz daraltıp yeniden deneyin.',
      prompt_too_large: 'Sorgu çok büyüdü. Daha dar bir dönem ya da daha az kalemle deneyin.', tools_unavailable: 'Bu görünüm veri araçlarını çalıştıramıyor (ör. eski uygulama sürümü).',
    };
    return m[kod] || ('Yanıt hazırlanamadı' + (e && e.message ? ': ' + e.message : '.'));
  }
  function raporuPaketle(rapor, soru, mod) {
    const veriler = {}, kullanilan = new Set();
    const grafikSeriler = rapor.bolumler.flatMap((b) => (b.grafik ? b.grafik.seriler : []));
    grafikSeriler.forEach((s) => kullanilan.add(s.veri_kimligi));
    for (const [id, k] of K.kayit) {
      let satirlar = [];
      if (kullanilan.has(id)) {
        const f = grafikSeriler.filter((s) => s.veri_kimligi === id);
        satirlar = seyrelt(k.satirlar.filter((r) => f.some((s) => !s.filtre || Object.entries(s.filtre).every(([a, v]) => String(r[a]) === v))), AZAMI_KAYIT).satirlar;
      }
      veriler[id] = { kaynak: k.kaynak, baslik: k.baslik, aciklama: k.aciklama, sorgu: k.sorgu, satir_sayisi: k.satirlar.length, satirlar };
    }
    const w = webVeri();
    return { soru, mod, olusturma: Date.now(), web_son_gun: w ? w.son.tarih : null, rapor, veriler };
  }
  async function soruSor(e) {
    e.preventDefault();
    const alan = $('#sohbet-soru'), hata = $('#sohbet-hata');
    const soru = alan.value.trim();
    hata.hidden = true;
    if (!soru || K.calisiyor) return;
    if (!D.cap.sample) { hata.textContent = D.capHazir ? 'Bu görünümde Claude’a soru sorulamıyor.' : 'Sayfa hazırlanıyor, birkaç saniye sonra yeniden deneyin.'; hata.hidden = false; return; }
    const hg = $('#sohbet-hosgeldin');
    if (hg) hg.remove();
    alan.value = '';
    const govde = $('#sohbet-govde');
    govde.append(el('div', { class: 'mesaj kullanici', text: soru }));
    const m = el('div', { class: 'mesaj asistan' });
    const durumYazi = el('span', { text: 'Veriler okunuyor…' });
    K.adimlar = el('ol');
    m.append(el('div', { class: 'ilerleme' }, durumYazi, K.adimlar));
    govde.append(m);
    sohbetKaydir();
    K.kayit = new Map(); K.sayac = 0;
    const ctl = new AbortController();
    K.calisiyor = ctl;
    $('#sohbet-gonder').disabled = true; $('#sohbet-dur').hidden = false;
    const bas = Date.now();
    const sayac = setInterval(() => { durumYazi.textContent = 'Çalışıyor… ' + Math.round((Date.now() - bas) / 1000) + ' sn'; }, 1000);
    try {
      await Promise.all(['gunluk', 'son_degisimler', 'madde_endeksleri', 'aylik'].map((a) => dosyaBekle(a, 8000)));
      const sonuc = await D.cap.sample.json(istem(soru, K.mod), {
        tools: [...webAraclari(), ...evdsAraclari(), ...trafikAraclari(), ...yakitAraclari()],
        modelTier: K.mod === 'whitepaper' ? 'complex' : 'default', signal: ctl.signal, cache: false,
      });
      const rapor = raporuDuzelt(sonuc);
      const paket = raporuPaketle(rapor, soru, K.mod);
      K.gecmis.push({ soru, baslik: rapor.baslik, ozet: rapor.ozet });
      yanitCiz(m, paket);
      if (D.cap.db && D.uid) { try { await D.cap.db.collection('data/users/' + D.uid).doc('r' + paket.olusturma).set({ tur: 'rapor', ...paket }); } catch (er) { console.warn('Yanıt kaydedilemedi', er); } }
    } catch (er) {
      const kod = er && er.code;
      m.replaceChildren(el('p', { class: 'sohbet-hata', text: kod === 'cancelled' ? 'Durduruldu.' : hataMetni(kod, er) }));
    } finally {
      clearInterval(sayac);
      K.calisiyor = null; K.adimlar = null;
      $('#sohbet-gonder').disabled = false; $('#sohbet-dur').hidden = true;
      // Yanıt baştan okunsun diye pencere yanıtın başına kaydırılır
      requestAnimationFrame(() => { govde.scrollTop = Math.max(0, m.offsetTop - govde.offsetTop - 8); });
    }
  }
  $('#sohbet-ac').addEventListener('click', sohbetAc);
  $('#sohbet-kapat').addEventListener('click', sohbetKapat);
  $('#sohbet-genislet').addEventListener('click', (e) => { const g = $('#sohbet').classList.toggle('genis'); e.currentTarget.setAttribute('aria-pressed', String(g)); e.currentTarget.setAttribute('aria-label', g ? 'Pencereyi küçült' : 'Pencereyi büyüt'); });
  $('#sohbet-gecmis').addEventListener('click', (e) => gecmisGoster(e.currentTarget.getAttribute('aria-pressed') !== 'true'));
  $('#sohbet-form').addEventListener('submit', soruSor);
  $('#sohbet-dur').addEventListener('click', () => K.calisiyor && K.calisiyor.abort());
  $('#sohbet-soru').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#sohbet-form').requestSubmit(); } });
  $$('#sohbet-mod button').forEach((b) => b.addEventListener('click', () => { K.mod = b.dataset.deger; $$('#sohbet-mod button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sohbet').hidden) sohbetKapat(); });
