import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import './App.css';

function DiziDetay() {
  const { id } = useParams();
  const [dizi, setDizi] = useState(null);
  const [sezonlar, setSezonlar] = useState([]);
  const [bolumler, setBolumler] = useState([]); // Tüm bölümleri tutar
  const [oyuncular, setOyuncular] = useState([]); // YENİ: Oyuncu listesi
  const [ekip, setEkip] = useState([]); // YENİ: Crew listesi
  const [aktifSekme, setAktifSekme] = useState('seasons');
  const [acikSezonlar, setAcikSezonlar] = useState({}); // Hangi sezonun accordion'u açık?
  const [izlenenSezonlar, setIzlenenSezonlar] = useState({});
  const [izlenecekSezonlar, setIzlenecekSezonlar] = useState({}); // YENİ: Sezon Watchlist
  const [izlenenBolumler, setIzlenenBolumler] = useState({});
  const [izlenecekBolumler, setIzlenecekBolumler] = useState({});
  const [yukleniyor, setYukleniyor] = useState(true);
  
  const [kullaniciPuani, setKullaniciPuani] = useState(null); // Backend'den gelen puan
  const [hoverPuani, setHoverPuani] = useState(0); // Mouse ile üzerine gelinen puan
  const [kullaniciListeleri, setKullaniciListeleri] = useState([]); // Tüm listeler
  const [dizininListeleri, setDizininListeleri] = useState([]); // Bu dizinin olduğu listeler
  const [listeMenuAcik, setListeMenuAcik] = useState(false);
  const [yeniListeAdi, setYeniListeAdi] = useState("");

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/dizi/${id}`)
      .then(res => {
        if (!res.ok) throw new Error("Veri çekilemedi");
        return res.json();
      })
      .then(data => {
        if (data.dizi) {
          setDizi(data.dizi);
          setSezonlar(data.sezonlar || []);
          setBolumler(data.bolumler || []);
          setOyuncular(data.cast || []);
          setEkip(data.crew || []);
        }
        setYukleniyor(false);
      })
      .catch(err => {
        console.error("Hata:", err);
        setYukleniyor(false); // Hata olsa bile yükleme ekranını kapat
      });

    // Listeleri Çek
    fetch('http://127.0.0.1:8000/lists')
      .then(res => res.json())
      .then(data => setKullaniciListeleri(data));

    fetch(`http://127.0.0.1:8000/lists/check/${id}`)
      .then(res => res.json())
      .then(data => setDizininListeleri(data));

    // Kullanıcı Puanını Çek
    fetch(`http://127.0.0.1:8000/rating/${id}`)
      .then(res => res.json())
      .then(data => setKullaniciPuani(data.score));
  }, [id]);

  // SEZON İZLEME MANTIĞI (TOPLU İŞLEM)
  const sezonIzleToggle = (seasonId) => {
    const yeniDurum = !izlenenSezonlar[seasonId];
    
    // 1. Sezonun kendi tikini güncelle
    setIzlenenSezonlar(prev => ({ ...prev, [seasonId]: yeniDurum }));

    // 2. O sezona ait TÜM bölümleri bul ve durumlarını güncelle
    const buSezonunBolumleri = bolumler.filter(b => b.season_id === seasonId);
    const yeniBolumDurumlari = {};
    
    buSezonunBolumleri.forEach(bolum => {
      yeniBolumDurumlari[bolum.episode_id] = yeniDurum;
    });

    setIzlenenBolumler(prev => ({ ...prev, ...yeniBolumDurumlari }));
  };

  // SEZON İZLEYECEĞİM (WATCHLIST) TOGGLE
  const sezonIzlenecekToggle = (seasonId) => {
    const yeniDurum = !izlenecekSezonlar[seasonId];
    
    // 1. Sezonun durumunu güncelle
    setIzlenecekSezonlar(prev => ({ ...prev, [seasonId]: yeniDurum }));

    // 2. O sezona ait TÜM bölümleri bul ve durumlarını güncelle
    const buSezonunBolumleri = bolumler.filter(b => b.season_id === seasonId);
    const yeniBolumDurumlari = {};
    buSezonunBolumleri.forEach(bolum => {
      yeniBolumDurumlari[bolum.episode_id] = yeniDurum;
    });
    setIzlenecekBolumler(prev => ({ ...prev, ...yeniBolumDurumlari }));
  };

  // Accordion Aç/Kapa
  const sezonAccordionToggle = (seasonId) => {
    setAcikSezonlar(prev => ({
      ...prev,
      [seasonId]: !prev[seasonId]
    }));
  };

  // BÖLÜM İZLEME MANTIĞI (CASCADE + PARENT CHECK)
  const bolumIzleToggle = (bolum) => {
    const yeniDurum = !izlenenBolumler[bolum.episode_id];
    let guncellenecekBolumler = { [bolum.episode_id]: yeniDurum };

    // 1. Eğer "İzledim" olarak işaretleniyorsa, ÖNCEKİ bölümleri de işaretle
    if (yeniDurum === true) {
      const oncekiBolumler = bolumler.filter(b => 
        b.season_id === bolum.season_id && 
        b.episode_number < bolum.episode_number
      );
      oncekiBolumler.forEach(b => {
        guncellenecekBolumler[b.episode_id] = true;
      });
    }

    // State'i güncelle (Önceki state ile birleştir)
    const yeniIzlenenBolumlerState = { ...izlenenBolumler, ...guncellenecekBolumler };
    setIzlenenBolumler(yeniIzlenenBolumlerState);

    // 2. Sezon Kontrolü: O sezonun TÜM bölümleri izlendi mi?
    const buSezonunBolumleri = bolumler.filter(b => b.season_id === bolum.season_id);
    // Yeni state üzerinden kontrol etmeliyiz
    const hepsiIzlendiMi = buSezonunBolumleri.every(b => yeniIzlenenBolumlerState[b.episode_id]);

    setIzlenenSezonlar(prev => ({
      ...prev,
      [bolum.season_id]: hepsiIzlendiMi
    }));
  };

  // Bölüm İzleyeceğim (Watchlist) Toggle
  const bolumIzlenecekToggle = (episodeId) => {
    setIzlenecekBolumler(prev => ({
      ...prev,
      [episodeId]: !prev[episodeId]
    }));
  };

  // LİSTEYE EKLE / ÇIKAR
  const listeToggle = (listId) => {
    const listedeVar = dizininListeleri.includes(listId);
    
    if (listedeVar) {
      // Çıkar
      fetch(`http://127.0.0.1:8000/lists/${listId}/items/${dizi.series_id}`, { method: 'DELETE' })
        .then(() => {
          setDizininListeleri(prev => prev.filter(id => id !== listId));
        });
    } else {
      // Ekle
      fetch(`http://127.0.0.1:8000/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: dizi.series_id })
      }).then(() => {
        setDizininListeleri(prev => [...prev, listId]);
      });
    }
  };

  // YENİ LİSTE OLUŞTUR
  const yeniListeOlustur = () => {
    if (!yeniListeAdi.trim()) return;
    
    fetch('http://127.0.0.1:8000/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: yeniListeAdi })
    }).then(res => res.json())
    .then(yeniListe => {
      setKullaniciListeleri(prev => [...prev, { list_id: yeniListe.list_id, name: yeniListe.name }]);
      setYeniListeAdi("");
    });
  };

  // PUAN VERME İŞLEMİ
  const puanVer = (puan) => {
    setKullaniciPuani(puan);
    fetch('http://127.0.0.1:8000/rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series_id: dizi.series_id, score: puan })
    });
  };

  if (yukleniyor) return <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>🎬 Kaset Sarılıyor...</div>;
  if (!dizi) return <div style={{ color: 'red', textAlign: 'center', marginTop: '50px' }}>Dizi bulunamadı!</div>;

  // 1. DÜZELTME: Doğru arka planı seçiyoruz (backdrop_path). Yoksa afişi kullanır.
  const arkaplanResmi = dizi.backdrop_path 
    ? `https://image.tmdb.org/t/p/original${dizi.backdrop_path}`
    : `https://image.tmdb.org/t/p/original${dizi.poster_path}`;

  // 2. DÜZELTME: Yıl bilgisini akıllıca çekiyoruz
  const yil = dizi.first_air_date ? dizi.first_air_date.substring(0, 4) : 
              (dizi.release_date ? dizi.release_date.substring(0, 4) : '');

  // Dizi tarihini bulamazsa ilk sezonun tarihini kullan (Yedek plan)
  const gosterimTarihi = dizi.first_air_date || (sezonlar.length > 0 ? sezonlar[0].air_date : 'Bilinmiyor');
  const durum = dizi.status === 'Ended' ? 'Sona Erdi' : (dizi.status === 'Returning Series' ? 'Devam Ediyor' : dizi.status);

  // Crew verisini departmanlara göre gruplama fonksiyonu
  const gruplanmisEkip = ekip.reduce((acc, kisi) => {
    const dept = kisi.department || 'Other';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(kisi);
    return acc;
  }, {});

  return (
    <div className="detay-sayfasi">
      
      {/* DEvasa Arka Plan */}
      <div 
        className="detay-backdrop" 
        style={{ backgroundImage: `url(${arkaplanResmi})` }} 
      ></div>

      <div className="detay-icerik">
        
        {/* SOL SÜTUN: Afiş ve İstatistik */}
        <div className="detay-sol">
          <img 
            src={`https://image.tmdb.org/t/p/w500${dizi.poster_path}`} 
            alt={dizi.name} 
            className="detay-poster" 
          />
          <div className="poster-alti-ikonlar">
            <span>👁️ 33K</span>
            <span>📝 8.1K</span>
            <span>♥ 3.8K</span>
          </div>
        </div>
        
        {/* ORTA SÜTUN: Ana Bilgiler */}
        <div className="detay-orta">
          {/* 3. DÜZELTME: CSS ezecek şekilde özel class */}
          <h1 className="detay-baslik">
            {dizi.name} <span className="detay-yil">{yil}</span>
          </h1>
          
          <div className="detay-yonetmen">
            YAYIN <span>{gosterimTarihi}</span> • <span style={{color: '#38bdf8'}}>{durum}</span>
          </div>

          <p className="detay-ozet">{dizi.overview}</p>

          <div className="detay-sekmeler">
            <span className={aktifSekme === 'cast' ? 'aktif-sekme' : ''} onClick={() => setAktifSekme('cast')}>CAST</span>
            <span className={aktifSekme === 'crew' ? 'aktif-sekme' : ''} onClick={() => setAktifSekme('crew')}>CREW</span>
            <span className={aktifSekme === 'genres' ? 'aktif-sekme' : ''} onClick={() => setAktifSekme('genres')}>GENRES</span>
            <span className={aktifSekme === 'seasons' ? 'aktif-sekme' : ''} onClick={() => setAktifSekme('seasons')}>SEASONS</span>
          </div>
          <div className="sekme-cizgisi"></div>

          <div className="sekme-icerik-alani">
            {aktifSekme === 'seasons' && (
              <div className="sezon-listesi">
                {sezonlar.length > 0 ? sezonlar.map((sezon) => {
                  // İlerleme Çubuğu Hesaplaması
                  const buSezonunBolumleri = bolumler.filter(b => b.season_id === sezon.season_id);
                  const toplamBolum = buSezonunBolumleri.length;
                  const izlenenSayisi = buSezonunBolumleri.filter(b => izlenenBolumler[b.episode_id]).length;
                  const yuzde = toplamBolum > 0 ? (izlenenSayisi / toplamBolum) * 100 : 0;

                  return (
                    <div key={sezon.season_id}>
                      {/* SEZON BAŞLIĞI (TIKLANABİLİR) */}
                      <div className="sezon-satir" onClick={() => sezonAccordionToggle(sezon.season_id)}>
                        <img 
                          src={sezon.poster_path ? `https://image.tmdb.org/t/p/w200${sezon.poster_path}` : `https://image.tmdb.org/t/p/w200${dizi.poster_path}`} 
                          alt={sezon.name} 
                          className="sezon-poster-kucuk"
                        />
                        <div className="sezon-bilgi">
                          <div className="sezon-baslik">{sezon.name}</div>
                          <div className="sezon-detay">
                            {sezon.air_date ? sezon.air_date.split('-')[0] : ''} • {sezon.season_number}. Sezon
                            {acikSezonlar[sezon.season_id] ? ' 🔼' : ' 🔽'}
                          </div>
                          
                          {/* İLERLEME ÇUBUĞU */}
                          {toplamBolum > 0 && (
                            <div style={{width: '100%', maxWidth: '200px'}}>
                              <div className="progress-container">
                                <div className="progress-fill" style={{width: `${yuzde}%`}}></div>
                              </div>
                              <div className="progress-text">{izlenenSayisi} / {toplamBolum} izlendi</div>
                            </div>
                          )}
                        </div>
                        
                        {/* SAĞ TARAF: İKONLAR */}
                        <div className="sezon-sag">
                          {/* Sezonu Komple İzledim Kutusu */}
                          <div 
                            className={`izlendi-kutusu ${izlenenSezonlar[sezon.season_id] ? 'secili' : ''}`}
                            onClick={(e) => { e.stopPropagation(); sezonIzleToggle(sezon.season_id); }}
                            title="Tüm sezonu izledim olarak işaretle"
                          >
                            ✓
                          </div>
                          {/* Sezonu İzleyeceğim (Watchlist) Kutusu */}
                          <div 
                            className={`izlendi-kutusu ${izlenecekSezonlar[sezon.season_id] ? 'secili' : ''}`}
                            style={{ 
                              borderColor: izlenecekSezonlar[sezon.season_id] ? '#38bdf8' : '#475569', 
                              backgroundColor: izlenecekSezonlar[sezon.season_id] ? '#38bdf8' : 'transparent', 
                              color: izlenecekSezonlar[sezon.season_id] ? '#0f172a' : '#475569' 
                            }}
                            onClick={(e) => { e.stopPropagation(); sezonIzlenecekToggle(sezon.season_id); }}
                            title="Bu sezonu izleme listeme ekle"
                          >
                            ➕
                          </div>
                        </div>
                      </div>

                      {/* BÖLÜMLER LİSTESİ (ACCORDION) */}
                      {acikSezonlar[sezon.season_id] && (
                        <div className="bolum-listesi-container">
                          {buSezonunBolumleri.map(bolum => (
                            <div key={bolum.episode_id} className="bolum-satir">
                              <div className="bolum-sol">
                                <span className="bolum-no">{bolum.episode_number}</span>
                                <div className="bolum-bilgi-container">
                                  <span className="bolum-adi">{bolum.name}</span>
                                  <span className="bolum-meta">{bolum.air_date} • {bolum.runtime ? `${bolum.runtime} dk` : ''}</span>
                                </div>
                              </div>
                              
                              <div className="bolum-aksiyonlar">
                                {/* İzledim Butonu */}
                                <div 
                                  className={`bolum-ikon ${izlenenBolumler[bolum.episode_id] ? 'izlendi-aktif' : ''}`}
                                  onClick={() => bolumIzleToggle(bolum)}
                                  title="İzledim"
                                >
                                  ✓
                                </div>
                                
                                {/* İzleyeceğim Butonu */}
                                <div 
                                  className={`bolum-ikon ${izlenecekBolumler[bolum.episode_id] ? 'izlenecek-aktif' : ''}`}
                                  onClick={() => bolumIzlenecekToggle(bolum.episode_id)}
                                  title="İzleyeceğim"
                                >
                                  ➕
                                </div>
                              </div>
                            </div>
                          ))}
                          {buSezonunBolumleri.length === 0 && 
                            <div style={{padding: '10px', color: '#64748b', fontSize: '0.9rem'}}>Bölüm bilgisi yok.</div>
                          }
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <p style={{marginTop: '20px'}}>Sezon bilgisi bulunamadı.</p>
                )}
              </div>
            )}
            
            {aktifSekme === 'cast' && (
              <div className="oyuncu-listesi">
                {oyuncular.length > 0 ? oyuncular.map((oyuncu) => (
                  <div key={oyuncu.cast_id} className="oyuncu-kart">
                    <img 
                      src={oyuncu.profile_path ? `https://image.tmdb.org/t/p/w200${oyuncu.profile_path}` : 'https://via.placeholder.com/200x300?text=No+Image'} 
                      alt={oyuncu.name} 
                      className="oyuncu-foto"
                    />
                    <div className="oyuncu-bilgi">
                      <div className="oyuncu-isim">{oyuncu.name}</div>
                      <div className="oyuncu-karakter">{oyuncu.character}</div>
                    </div>
                  </div>
                )) : <p>Oyuncu bilgisi bulunamadı.</p>}
              </div>
            )}

            {aktifSekme === 'crew' && (
              <div className="crew-container">
                {Object.keys(gruplanmisEkip).length > 0 ? Object.keys(gruplanmisEkip).map(dept => (
                  <div key={dept} className="crew-group">
                    <div className="crew-dept-title">{dept}</div>
                    <div className="crew-list">
                      {gruplanmisEkip[dept].map((kisi, index) => (
                        <div key={`${kisi.crew_id}-${index}`} className="crew-item">
                          <span className="crew-name">{kisi.name}</span>
                          <span className="crew-job">{kisi.job}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : <p>Ekip bilgisi bulunamadı.</p>}
              </div>
            )}

            {aktifSekme === 'genres' && (
              <div className="genre-container">
                {dizi.genres ? dizi.genres.split(', ').map((genre, index) => (
                  <span key={index} className="genre-tag">{genre}</span>
                )) : <p style={{marginTop: '20px', fontStyle: 'italic'}}>Tür bilgisi bulunamadı.</p>}
              </div>
            )}
          </div>
        </div>

        {/* SAĞ SÜTUN: Efsanevi Aksiyon Paneli */}
        <div className="detay-sag-panel">
          
          <div className="aksiyon-ikonlari">
            <div className="ikon-kutusu"><span className="ikon">👁️</span><span className="ikon-metin">Watch</span></div>
            <div className="ikon-kutusu"><span className="ikon">♥</span><span className="ikon-metin">Like</span></div>
            <div className="ikon-kutusu"><span className="ikon">⏱️</span><span className="ikon-metin">Watchlist</span></div>
          </div>

          <div className="puanlama-alani">
            <span className="puan-baslik">Rate</span>
            <div className="puanlama-yildizlari" onMouseLeave={() => setHoverPuani(0)}>
              {[...Array(10)].map((_, index) => {
                const puanDegeri = index + 1;
                return (
                  <span 
                    key={index} 
                    className={`tek-yildiz ${puanDegeri <= (hoverPuani || kullaniciPuani) ? 'dolu' : ''}`}
                    onMouseEnter={() => setHoverPuani(puanDegeri)}
                    onClick={() => puanVer(puanDegeri)}
                  >★</span>
                );
              })}
            </div>
          </div>

          <div className="panel-buton">Review or log...</div> {/* Burası şimdilik boş */}
          
          {/* LİSTELEME MENÜSÜ */}
          <div className="liste-menu-container">
            <div className="panel-buton" onClick={() => setListeMenuAcik(!listeMenuAcik)}>
              Add to lists...
            </div>
            
            {listeMenuAcik && (
              <div className="liste-popup">
                {kullaniciListeleri.map(liste => (
                  <div key={liste.list_id} className="liste-satir" onClick={() => listeToggle(liste.list_id)}>
                    <input 
                      type="checkbox" 
                      className="liste-checkbox"
                      checked={dizininListeleri.includes(liste.list_id)}
                      readOnly 
                    />
                    <span className="liste-adi">{liste.name}</span>
                  </div>
                ))}
                
                <div className="yeni-liste-form">
                  <input 
                    type="text" 
                    className="yeni-liste-input" 
                    placeholder="New list..." 
                    value={yeniListeAdi}
                    onChange={(e) => setYeniListeAdi(e.target.value)}
                  />
                  <button className="liste-ekle-btn" onClick={yeniListeOlustur}>+</button>
                </div>
              </div>
            )}
          </div>

          <div className="ortalama-puan-kutusu">
            <div>
              <span className="rating-yazisi">RATINGS</span>
              <div className="puan-grubu">
                <span className="dev-puan" style={{color: '#10b981'}}>★ {Number(dizi.rating).toFixed(1)}</span>
                {kullaniciPuani && (
                  <span className="kullanici-puan-gostergesi">
                    Senin puanın: <span style={{color: '#38bdf8'}}>★ {kullaniciPuani}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default DiziDetay;