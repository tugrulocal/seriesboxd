import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import Navbar from './Navbar'
import DiziDetay from './DiziDetay'
import WatchPage from './WatchPage'
import Top50 from './Top50'
import Login from './Login'
import Home from './Home'
import Profil from './Profil'
import Feed from './Feed'
import PublicProfile from './PublicProfile'
import Listelerim from './Listelerim'
import ListeDetay from './ListeDetay'
import Dizilerim from './Dizilerim'
import AdminDashboard from './AdminDashboard'
import Footer from './Footer'
import DiscoveryMode from './DiscoveryMode'
import { AuthProvider } from './AuthContext'
import { Star, CalendarDays, ArrowRight, PlayCircle, X } from 'lucide-react'
import './App.css'
import API_BASE from './config';
import { getImageUrl } from './utils';

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
    fetch(`${API_BASE}/arama?siralama=rating_desc`)
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
      fetch(`${API_BASE}/arama?tur=${encodeURIComponent(genre)}&siralama=rating_desc`)
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setDiziler(data); })
        .catch(() => { });
    } else if (q) {
      setGenreBaslik(null);
      setAramaAktif(true);
      fetch(`${API_BASE}/arama?q=${encodeURIComponent(q)}&siralama=rating_desc`)
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
    fetch(`${API_BASE}/arama?siralama=rating_desc`)
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

  const seciliDiziYil = seciliDizi?.first_air_date ? new Date(seciliDizi.first_air_date).getFullYear() : '';
  const seciliDiziTurler = seciliDizi?.genres ? seciliDizi.genres.split(',').map(g => g.trim()).slice(0, 4) : [];

  return (
    <div className="App">
      <Navbar onSonuclar={handleSonuclar} onAnaSayfaGit={anaSayfayaGit} />

      <main className="app-content">
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
                            src={getImageUrl(dizi.poster_path, 'w342')}
                            srcSet={`${getImageUrl(dizi.poster_path, 'w185')} 185w, ${getImageUrl(dizi.poster_path, 'w342')} 342w, ${getImageUrl(dizi.poster_path, 'w500')} 500w`}
                            sizes="(max-width: 640px) 185px, (max-width: 1024px) 342px, 500px"
                            alt={dizi.name}
                            className="dizi-poster"
                            loading="lazy"
                            decoding="async"
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
                  className={`detail-modal-overlay ${kapanisAnimasyonu ? 'is-closing' : ''}`}
                  onClick={() => modalKapatVeGit()}
                >
                  <div
                    className={`detail-modal ${kapanisAnimasyonu ? 'is-closing' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button className="detail-modal-close" onClick={() => modalKapatVeGit()} aria-label="Kapat">
                      <X size={22} strokeWidth={2.5} />
                    </button>

                    <div className="detail-modal-media">
                      <img
                        src={getImageUrl(seciliDizi.poster_path, 'w342')}
                        srcSet={`${getImageUrl(seciliDizi.poster_path, 'w185')} 185w, ${getImageUrl(seciliDizi.poster_path, 'w342')} 342w, ${getImageUrl(seciliDizi.poster_path, 'w500')} 500w`}
                        sizes="(max-width: 640px) 185px, (max-width: 1024px) 342px, 500px"
                        alt={seciliDizi.name}
                        className="detail-modal-poster"
                        decoding="async"
                      />
                      <div className="detail-modal-media-glow" />
                    </div>

                    <div className="detail-modal-content">
                      <div className="detail-modal-badge-row">
                        {seciliDiziYil && (
                          <span className="detail-modal-year-chip">
                            <CalendarDays size={14} />
                            {seciliDiziYil}
                          </span>
                        )}
                      </div>

                      <h2 className="detail-modal-title">{seciliDizi.name}</h2>

                      <div className="detail-modal-meta">
                        <span className="detail-modal-rating">
                          <Star size={18} fill="currentColor" strokeWidth={1.8} />
                          {Number(seciliDizi.rating).toFixed(1)}
                        </span>
                        {seciliDiziYil && <span className="detail-modal-year-text">{seciliDiziYil}</span>}
                      </div>

                      {seciliDiziTurler.length > 0 && (
                        <div className="detail-modal-genres">
                          {seciliDiziTurler.map((genre) => (
                            <span key={genre} className="detail-modal-genre-tag">{genre}</span>
                          ))}
                        </div>
                      )}

                      <p className="detail-modal-overview">{seciliDizi.overview || 'Bu dizi için henüz bir açıklama bulunmuyor.'}</p>

                      <div className="detail-modal-actions">
                        <button
                          className="detail-modal-btn detail-modal-btn-secondary"
                          onClick={() => modalKapatVeGit(`/dizi/${seciliDizi.series_id}`)}
                        >
                          <span>İncele</span>
                          <ArrowRight size={18} strokeWidth={2.25} />
                        </button>
                        <button
                          className="detail-modal-btn detail-modal-btn-primary"
                          onClick={() => modalKapatVeGit(`/watch/${seciliDizi.series_id}/1/1`)}
                        >
                          <PlayCircle size={18} strokeWidth={2.1} />
                          <span>İzle</span>
                        </button>
                      </div>
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
          <Route path="/feed" element={<Feed />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/u/:username" element={<PublicProfile />} />
          <Route path="/listelerim" element={<Listelerim />} />
          <Route path="/liste/:list_id" element={<ListeDetay isWatchlist={false} />} />
          <Route path="/watchlist" element={<ListeDetay isWatchlist={true} />} />
          <Route path="/dizilerim" element={<Dizilerim />} />
          <Route path="/discovery" element={<DiscoveryMode />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
        </Routes>
      </main>
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