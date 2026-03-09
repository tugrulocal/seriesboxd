import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import Navbar from './Navbar'
import DiziDetay from './DiziDetay'
import WatchPage from './WatchPage'
import Top50 from './Top50'
import Login from './Login'
import Home from './Home'
import Profil from './Profil'
import Listelerim from './Listelerim'
import Dizilerim from './Dizilerim'
import Footer from './Footer'
import { AuthProvider } from './AuthContext'
import './App.css'

function AppIcerik() {
  const [kapanisAnimasyonu, setKapanisAnimasyonu] = useState(false);
  const navigate = useNavigate();
  const [seciliDizi, setSeciliDizi] = useState(null);
  const [diziler, setDiziler] = useState([]);
  const [hata, setHata] = useState(null);
  const [aramaAktif, setAramaAktif] = useState(false);
  const [genreBaslik, setGenreBaslik] = useState(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetch('http://127.0.0.1:8000/arama?siralama=rating_desc')
      .then(res => {
        if (!res.ok) throw new Error("Backend adresi bulunamadı (404)!");
        return res.json();
      })
      .then(data => { if (Array.isArray(data)) setDiziler(data); })
      .catch(err => setHata(err.message));
  }, []);

  // Genre / q query param handler
  useEffect(() => {
    const genre = searchParams.get('genre');
    const q = searchParams.get('q');
    if (location.pathname !== '/') return;
    if (genre) {
      setGenreBaslik(`${genre} Dizileri`);
      setAramaAktif(true);
      fetch(`http://127.0.0.1:8000/arama?tur=${encodeURIComponent(genre)}&siralama=rating_desc`)
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setDiziler(data); })
        .catch(() => { });
    } else if (q) {
      setGenreBaslik(null);
      setAramaAktif(true);
      fetch(`http://127.0.0.1:8000/arama?q=${encodeURIComponent(q)}&siralama=rating_desc`)
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setDiziler(data); })
        .catch(() => { });
    }
  }, [searchParams, location.pathname]);

  const handleSonuclar = useCallback((yeniDiziler, isSearchActive) => {
    if (Array.isArray(yeniDiziler)) setDiziler(yeniDiziler);
    setAramaAktif(!!isSearchActive);
  }, []);

  const anaSayfayaGit = useCallback(() => {
    setAramaAktif(false);
    setGenreBaslik(null);
    navigate('/');
    // İlk yükleme verisini tekrar çek
    fetch('http://127.0.0.1:8000/arama?siralama=rating_desc')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setDiziler(data); })
      .catch(() => { });
  }, [navigate]);

  const modalKapatVeGit = (rota = null) => {
    setKapanisAnimasyonu(true);
    setTimeout(() => {
      setKapanisAnimasyonu(false);
      setSeciliDizi(null);
      if (rota) navigate(rota);
    }, 300);
  };

  return (
    <div className="App">
      <Navbar onSonuclar={handleSonuclar} onAnaSayfaGit={anaSayfayaGit} />

      <Routes>
        <Route path="/" element={
          <>
            {hata && <div style={{ color: 'red', marginBottom: '20px' }}>⚠️ {hata}</div>}

            {aramaAktif ? (
              <div className="dizi-listesi">
                {genreBaslik && <h2 className="genre-sayfa-baslik">{genreBaslik}</h2>}
                {diziler.length > 0 ? (
                  diziler.map((dizi) => (
                    <div key={dizi.series_id} className="dizi-kart" onClick={() => setSeciliDizi(dizi)}>
                      {dizi.poster_path && (
                        <img
                          src={`https://image.tmdb.org/t/p/w500${dizi.poster_path}`}
                          alt={dizi.name}
                          className="dizi-poster"
                          loading="lazy"
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
            ) : (
              <Home tumDiziler={diziler} />
            )}

            {seciliDizi && (
              <div
                className={`modal-arkaplan ${kapanisAnimasyonu ? 'arkaplan-gizle' : ''}`}
                onClick={() => modalKapatVeGit()}
              >
                <div
                  className={`modal-icerik ${kapanisAnimasyonu ? 'modal-gizle' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
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

        <Route path="/login" element={<Login />} />
        <Route path="/dizi-detay" element={<h2 style={{ color: 'white', marginTop: '50px' }}>🎬 Detay Sayfası</h2>} />
        <Route path="/dizi/:id" element={<DiziDetay />} />
        <Route path="/watch/:id/:season/:episode" element={<WatchPage />} />
        <Route path="/top50" element={<Top50 />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/listelerim" element={<Listelerim />} />
        <Route path="/dizilerim" element={<Dizilerim />} />
      </Routes>
      <Footer />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppIcerik />
    </AuthProvider>
  );
}

export default App