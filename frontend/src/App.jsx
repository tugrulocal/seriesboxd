import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom' // useNavigate EKLENDİ
import Navbar from './Navbar' 
import DiziDetay from './DiziDetay' // YENİ SAYFAMIZ EKLENDİ
import Top50 from './Top50' // TOP 50 SAYFASI EKLENDİ
import './App.css'

function App() {
  const [kapanisAnimasyonu, setKapanisAnimasyonu] = useState(false);
  const navigate = useNavigate();
  const [seciliDizi, setSeciliDizi] = useState(null);
  const [diziler, setDiziler] = useState([])
  const [hata, setHata] = useState(null)
  const [aramaKelimesi, setAramaKelimesi] = useState("")

  useEffect(() => {
    fetch('http://127.0.0.1:8000/diziler')
      .then(res => {
        if (!res.ok) throw new Error("Backend adresi bulunamadı (404)!");
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setDiziler(data);
        } else {
          console.error("Beklenen liste gelmedi:", data);
        }
      })
      .catch(err => setHata(err.message));
  }, []);

  const filtrelenmisDiziler = diziler.filter(dizi => 
    dizi.name.toLowerCase().includes(aramaKelimesi.toLowerCase()));
  
  // Hem X butonunun hem de Detay butonunun kullanacağı ortak kapatıcı
  const modalKapatVeGit = (rota = null) => {
    setKapanisAnimasyonu(true); // 1. CSS kapanış animasyonunu tetikle
    
    setTimeout(() => {
      setKapanisAnimasyonu(false); // Sonraki açılışlar için state'i sıfırla
      setSeciliDizi(null); // 2. Modalı ekrandan sil
      
      if (rota) {
        navigate(rota); // 3. Eğer Detay'a basıldıysa yeni sayfaya geç
      }
    }, 300); // CSS animasyon süresi (0.3s) kadar bekle!
  };  


  return (
    <div className="App">
      {/* Sayfanın en üstünde sabit duracak menümüz */}
      <Navbar />

      {/* Sayfaların değişeceği ana alan */}
      <Routes>
        
        {/* ANA SAYFA ROTASI */}
        <Route path="/" element={
          <>
            <input 
              type="text" 
              placeholder="Dizi ara..." 
              className="arama-kutusu"
              value={aramaKelimesi}
              onChange={(e) => setAramaKelimesi(e.target.value)}
            />
            
            {hata && <div style={{color: 'red', marginBottom: '20px'}}>⚠️ {hata}</div>}

            <div className="dizi-listesi">
              {filtrelenmisDiziler.length > 0 ? (
                filtrelenmisDiziler.map((dizi) => (
                  <div key={dizi.series_id} className="dizi-kart" onClick={() => setSeciliDizi(dizi)}>
                    {dizi.poster_path && (
                      <img 
                        src={`https://image.tmdb.org/t/p/w500${dizi.poster_path}`} 
                        alt={dizi.name} 
                        className="dizi-poster" 
                      />
                    )}
                    <div className="dizi-bilgi">  
                      <h2>{dizi.name}</h2>
                      <p>⭐ {Number(dizi.rating).toFixed(1)}</p>
                    </div>
                  </div>  
                ))
              ) : (
                !hata && <p className="bulunamadi">Aradığınız dizi bulunamadı. 🍿</p>
              )}
            </div>

            {/* Modal Penceresi */}
            {seciliDizi && (
              <div 
                // YENİ: Kapanırken arkaplan da yavaşça solacak
                className={`modal-arkaplan ${kapanisAnimasyonu ? 'arkaplan-gizle' : ''}`} 
                onClick={() => modalKapatVeGit()}
              >
                <div 
                  // YENİ: Kapanırken pencere küçülerek kaybolacak
                  className={`modal-icerik ${kapanisAnimasyonu ? 'modal-gizle' : ''}`} 
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* YENİ: X butonu da zarif kapatma fonksiyonunu kullanır */}
                  <button className="kapat-butonu" onClick={() => modalKapatVeGit()}>✕</button>
                  <img 
                    src={`https://image.tmdb.org/t/p/w500${seciliDizi.poster_path}`} 
                    alt={seciliDizi.name} 
                    className="modal-poster"
                  />
                  <div className="modal-metin">
                    <h2>{seciliDizi.name}</h2>
                    
                    <div className="puan-ve-buton">
                      <span className="modal-puan">⭐ {Number(seciliDizi.rating).toFixed(1)}</span>
                      {/* YENİ: Detay butonu zarifçe kapanıp yeni rotaya uçurur */}
                      <button 
                        className="detay-butonu" 
                        onClick={() => modalKapatVeGit(`/dizi/${seciliDizi.series_id}`)}
                      >
                        Detay
                      </button>
                    </div>
                    
                    <div className="modal-ayirici"></div>
                    <p>{seciliDizi.overview}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        } />

        {/* DİĞER SAYFALAR */}
        <Route path="/login" element={<h2 style={{color: 'white', marginTop: '50px'}}>🔑 Giriş Yap Ekranı (Yapım Aşamasında)</h2>} />
        <Route path="/dizi-detay" element={<h2 style={{color: 'white', marginTop: '50px'}}>🎬 Detay Sayfası</h2>} />

        {/* DİĞER SAYFALAR */}
        <Route path="/dizi/:id" element={<DiziDetay />} /> {/* YENİ ROTAMIZ */}
        <Route path="/top50" element={<Top50 />} />

      </Routes>
    </div>
  )
}

export default App