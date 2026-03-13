import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Eye, Heart, Bookmark, MessageSquare, AlertTriangle, Star, X, Check, Plus, Clock, PlayCircle } from 'lucide-react';
import Navbar from './Navbar';
import './App.css';
import API_BASE from './config';

function DiziDetay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dizi, setDizi] = useState(null);
  const [sezonlar, setSezonlar] = useState([]);
  const [bolumler, setBolumler] = useState([]);
  const [oyuncular, setOyuncular] = useState([]);
  const [ekip, setEkip] = useState([]);
  const [aktifSekme, setAktifSekme] = useState('seasons');
  const [acikSezonlar, setAcikSezonlar] = useState({});
  const [izlenenSezonlar, setIzlenenSezonlar] = useState({});
  const [izlenecekSezonlar, setIzlenecekSezonlar] = useState({});
  const [izlenenBolumler, setIzlenenBolumler] = useState({});
  const [izlenecekBolumler, setIzlenecekBolumler] = useState({});
  const [bolumPuanlari, setBolumPuanlari] = useState({});
  const [hoverBolumPuani, setHoverBolumPuani] = useState({ id: null, puan: 0 });
  const [acikPuanlama, setAcikPuanlama] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [kullaniciPuani, setKullaniciPuani] = useState(null);
  const [hoverPuani, setHoverPuani] = useState(0);
  const [kullaniciListeleri, setKullaniciListeleri] = useState([]);
  const [dizininListeleri, setDizininListeleri] = useState([]);
  const [listeMenuAcik, setListeMenuAcik] = useState(false);
  const [yeniListeAdi, setYeniListeAdi] = useState("");

  const [diziIzlendi, setDiziIzlendi] = useState(false);
  const [diziLiked, setDiziLiked] = useState(false);
  const [diziWatchlist, setDiziWatchlist] = useState(false);

  const [reviewModalAcik, setReviewModalAcik] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [spoilerVar, setSpoilerVar] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [revealedSpoilers, setRevealedSpoilers] = useState(new Set());
  const [watchProviders, setWatchProviders] = useState([]);
  const [reviewGonderiliyor, setReviewGonderiliyor] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/dizi/${id}`)
      .then(res => { if (!res.ok) throw new Error("Veri çekilemedi"); return res.json(); })
      .then(data => {
        if (data.dizi) { setDizi(data.dizi); setSezonlar(data.sezonlar || []); setBolumler(data.bolumler || []); setOyuncular(data.cast || []); setEkip(data.crew || []); }
        setYukleniyor(false);
      })
      .catch(() => setYukleniyor(false));

    const token = localStorage.getItem('sb_token');
    const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

    if (token) {
      fetch(`${API_BASE}/lists`, { headers: authHeaders }).then(r => r.json()).then(setKullaniciListeleri).catch(() => { });
      fetch(`${API_BASE}/lists/check/${id}`, { headers: authHeaders }).then(r => r.json()).then(setDizininListeleri).catch(() => { });
      fetch(`${API_BASE}/rating/${id}`, { headers: authHeaders }).then(r => r.json()).then(d => setKullaniciPuani(d.score)).catch(() => { });

      fetch(`${API_BASE}/activity/${id}`, { headers: authHeaders }).then(r => r.json()).then(data => {
        const watched = {}, watchlist = {};
        if (Array.isArray(data)) {
          data.forEach(a => { if (a.activity_type === 'watched') watched[a.episode_id] = true; if (a.activity_type === 'watchlist') watchlist[a.episode_id] = true; });
        }
        setIzlenenBolumler(watched); setIzlenecekBolumler(watchlist);
      }).catch(() => { });

      fetch(`${API_BASE}/series-activity/${id}`, { headers: authHeaders }).then(r => r.json()).then(data => {
        if (Array.isArray(data)) {
          setDiziIzlendi(data.includes('watched')); setDiziLiked(data.includes('liked')); setDiziWatchlist(data.includes('watchlist'));
        }
      }).catch(() => { });

      fetch(`${API_BASE}/episode-ratings/${id}`, { headers: authHeaders }).then(r => r.json()).then(setBolumPuanlari).catch(() => { });
    }

    fetch(`${API_BASE}/reviews/${id}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setReviews(d); }).catch(() => { });

    fetch(`${API_BASE}/watch-providers/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.providers) setWatchProviders(d.providers);
      })
      .catch(() => { });
  }, [id]);

  // --- SEZON / BÖLÜM İZLEME ---
  const sezonIzleToggle = (seasonId) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    const yeniDurum = !izlenenSezonlar[seasonId];
    setIzlenenSezonlar(prev => ({ ...prev, [seasonId]: yeniDurum }));
    const buSezonunBolumleri = bolumler.filter(b => b.season_id === seasonId);
    const yeni = {};
    buSezonunBolumleri.forEach(b => {
      yeni[b.episode_id] = yeniDurum;
      if (yeniDurum) fetch(`${API_BASE}/activity`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ series_id: dizi.series_id, season_id: seasonId, episode_id: b.episode_id, activity_type: 'watched' }) });
      else fetch(`${API_BASE}/activity/${b.episode_id}/watched`, { method: 'DELETE', headers: authHeaders });
    });
    setIzlenenBolumler(prev => ({ ...prev, ...yeni }));
  };

  const sezonIzlenecekToggle = (seasonId) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    const yeniDurum = !izlenecekSezonlar[seasonId];
    setIzlenecekSezonlar(prev => ({ ...prev, [seasonId]: yeniDurum }));
    const buSezonunBolumleri = bolumler.filter(b => b.season_id === seasonId);
    const yeni = {};
    buSezonunBolumleri.forEach(b => {
      yeni[b.episode_id] = yeniDurum;
      if (yeniDurum) fetch(`${API_BASE}/activity`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ series_id: dizi.series_id, season_id: seasonId, episode_id: b.episode_id, activity_type: 'watchlist' }) });
      else fetch(`${API_BASE}/activity/${b.episode_id}/watchlist`, { method: 'DELETE', headers: authHeaders });
    });
    setIzlenecekBolumler(prev => ({ ...prev, ...yeni }));
  };

  const sezonAccordionToggle = (seasonId) => setAcikSezonlar(prev => ({ ...prev, [seasonId]: !prev[seasonId] }));

  const bolumIzleToggle = (bolum) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    const yeniDurum = !izlenenBolumler[bolum.episode_id];
    let guncellenecek = { [bolum.episode_id]: yeniDurum };
    if (yeniDurum) {
      bolumler.filter(b => b.season_id === bolum.season_id && b.episode_number < bolum.episode_number).forEach(b => { guncellenecek[b.episode_id] = true; });
    }
    const yeniState = { ...izlenenBolumler, ...guncellenecek };
    setIzlenenBolumler(yeniState);
    Object.entries(guncellenecek).forEach(([epId, izlendi]) => {
      const ep = bolumler.find(b => b.episode_id === parseInt(epId));
      if (izlendi) fetch(`${API_BASE}/activity`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ series_id: dizi.series_id, season_id: ep ? ep.season_id : bolum.season_id, episode_id: parseInt(epId), activity_type: 'watched' }) });
      else fetch(`${API_BASE}/activity/${epId}/watched`, { method: 'DELETE', headers: authHeaders });
    });
    const hepsi = bolumler.filter(b => b.season_id === bolum.season_id).every(b => yeniState[b.episode_id]);
    setIzlenenSezonlar(prev => ({ ...prev, [bolum.season_id]: hepsi }));
  };

  const bolumIzlenecekToggle = (bolum) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    const yeniDurum = !izlenecekBolumler[bolum.episode_id];
    setIzlenecekBolumler(prev => ({ ...prev, [bolum.episode_id]: yeniDurum }));
    if (yeniDurum) fetch(`${API_BASE}/activity`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ series_id: dizi.series_id, season_id: bolum.season_id, episode_id: bolum.episode_id, activity_type: 'watchlist' }) });
    else fetch(`${API_BASE}/activity/${bolum.episode_id}/watchlist`, { method: 'DELETE', headers: authHeaders });
  };

  // --- ACTIVITY ---
  const seriesActivityToggle = (type, aktif, setAktif) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    setAktif(!aktif);
    if (!aktif) fetch(`${API_BASE}/series-activity`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ series_id: dizi.series_id, activity_type: type }) });
    else fetch(`${API_BASE}/series-activity/${dizi.series_id}/${type}`, { method: 'DELETE', headers: authHeaders });
  };

  // --- LİSTE ---
  const listeToggle = (listId) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    if (dizininListeleri.includes(listId)) {
      fetch(`${API_BASE}/lists/${listId}/items/${dizi.series_id}`, { method: 'DELETE', headers: authHeaders }).then(() => setDizininListeleri(prev => prev.filter(id => id !== listId)));
    } else {
      fetch(`${API_BASE}/lists/${listId}/items`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ series_id: dizi.series_id }) }).then(() => setDizininListeleri(prev => [...prev, listId]));
    }
  };
  const yeniListeOlustur = () => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const jsonHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (!yeniListeAdi.trim()) return;
    fetch(`${API_BASE}/lists`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name: yeniListeAdi }) })
      .then(r => r.json()).then(l => { setKullaniciListeleri(prev => [...prev, { list_id: l.list_id, name: l.name }]); setYeniListeAdi(""); });
  };

  // --- PUAN ---
  const tarihFormatla = (t) => {
    if (!t) return 'Bilinmiyor';
    const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const p = t.split('-');
    if (p.length !== 3) return t;
    return `${parseInt(p[2])} ${aylar[parseInt(p[1]) - 1]} ${p[0]}`;
  };

  const puanVer = (puan) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    setKullaniciPuani(puan);
    fetch(`${API_BASE}/rating`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: dizi.series_id, score: puan }) });
  };
  const puanSil = () => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    setKullaniciPuani(null);
    fetch(`${API_BASE}/rating/${dizi.series_id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
  };

  const bolumPuanVer = (episodeId, puan) => {
    const token = localStorage.getItem('sb_token');
    if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
    if (bolumPuanlari[episodeId] === puan) {
      setBolumPuanlari(prev => { const s = { ...prev }; delete s[episodeId]; return s; });
      fetch(`${API_BASE}/episode-rating/${episodeId}`, { method: 'DELETE', headers: authHeaders });
    } else {
      setBolumPuanlari(prev => ({ ...prev, [episodeId]: puan }));
      fetch(`${API_BASE}/episode-rating`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ episode_id: episodeId, score: puan }) });
    }
  };

  const stremioModalAc = (bolum) => {
    const seasonNum = bolum.season_id > 0 ? sezonlar.find(s => s.season_id === bolum.season_id)?.season_number : 1;
    navigate(`/watch/${id}/${seasonNum}/${bolum.episode_number}`);
  };

  const genelIzle = () => {
    if (!bolumler || bolumler.length === 0) {
      alert("Bu dizi için henüz bölüm bulunmuyor.");
      return;
    }
    const hedefBolum = bolumler.find(b => b.episode_number === 1 && b.season_id === sezonlar.find(s => s.season_number === 1)?.season_id) || bolumler[0];
    stremioModalAc(hedefBolum);
  };

  if (yukleniyor) return null;
  if (!dizi) return <div style={{ color: 'red', textAlign: 'center', marginTop: '80px' }}>Dizi bulunamadı!</div>;

  const arkaplanResmi = dizi.backdrop_path ? `https://image.tmdb.org/t/p/original${dizi.backdrop_path}` : `https://image.tmdb.org/t/p/original${dizi.poster_path}`;
  const yil = dizi.first_air_date ? dizi.first_air_date.substring(0, 4) : '';
  const gosterimTarihi = dizi.first_air_date || (sezonlar.length > 0 ? sezonlar[0].air_date : 'Bilinmiyor');
  const durum = dizi.status === 'Ended' ? 'Sona Erdi' : (dizi.status === 'Returning Series' ? 'Devam Ediyor' : dizi.status);
  const genres = dizi.genres ? dizi.genres.split(',').map(g => g.trim()).filter(Boolean) : [];

  const gruplanmisEkip = ekip.reduce((acc, kisi) => {
    const dept = kisi.department || 'Other';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(kisi);
    return acc;
  }, {});

  return (
    <div className="detay-v2">
      {/* ===== HERO BANNER ===== */}
      <div className="dv2-hero" style={{ backgroundImage: `url(${arkaplanResmi})` }}>
        <div className="dv2-hero-grad-left"></div>
        <div className="dv2-hero-grad-bottom"></div>

        <div className="dv2-hero-inner">
          {/* Sol: Poster */}
          <img src={`https://image.tmdb.org/t/p/w342${dizi.poster_path}`} alt={dizi.name} className="dv2-hero-poster" decoding="async" fetchpriority="high" />

          {/* Orta: Bilgiler */}
          <div className="dv2-hero-info">
            <h1 className="dv2-title">{dizi.name} <span className="dv2-yil">{yil}</span></h1>
            <div className="dv2-meta">
              <span className="dv2-rating"><Star size={15} fill="#f59e0b" color="#f59e0b" /> {Number(dizi.rating).toFixed(1)}</span>
              <span className="dv2-votes">({(dizi.vote_count || 0).toLocaleString('tr-TR')} oy)</span>
              <span className="dv2-durum">{durum}</span>
              <span className="dv2-tarih">{tarihFormatla(gosterimTarihi)}</span>
            </div>
            <div className="dv2-genres">
              {genres.map(g => (
                <span key={g} className="dv2-genre-tag" onClick={() => navigate(`/?genre=${encodeURIComponent(g)}`)}>{g}</span>
              ))}
              {watchProviders.map(p => (
                p.logo_path && (
                  <a key={p.provider_id} href={p.url || '#'} target="_blank" rel="noopener noreferrer" className="dv2-provider-logo-link" title={p.provider_name}>
                    <img src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} className="dv2-provider-logo" loading="lazy" decoding="async" />
                  </a>
                )
              ))}
            </div>
            <p className="dv2-overview">{dizi.overview || 'Bu dizi için henüz bir özet bulunmuyor.'}</p>
          </div>

          {/* Sağ: Aksiyonlar */}
          <div className="dv2-hero-actions">
            <div className="dv2-action-icons">
              <div className={`dv2-action ${diziIzlendi ? 'act-watch' : ''}`} onClick={() => seriesActivityToggle('watched', diziIzlendi, setDiziIzlendi)} title={diziIzlendi ? 'İzlendi' : 'İzledim'}>
                <Eye size={22} strokeWidth={diziIzlendi ? 2.5 : 1.5} />
                <span>İzledim</span>
              </div>
              <div className={`dv2-action ${diziLiked ? 'act-like' : ''}`} onClick={() => seriesActivityToggle('liked', diziLiked, setDiziLiked)} title={diziLiked ? 'Beğenildi' : 'Beğen'}>
                <Heart size={22} strokeWidth={diziLiked ? 2.5 : 1.5} fill={diziLiked ? 'currentColor' : 'none'} />
                <span>Beğendim</span>
              </div>
              <div className={`dv2-action ${diziWatchlist ? 'act-wl' : ''}`} onClick={() => seriesActivityToggle('watchlist', diziWatchlist, setDiziWatchlist)} title={diziWatchlist ? 'Listede' : 'Listeye ekle'}>
                <Bookmark size={22} strokeWidth={diziWatchlist ? 2.5 : 1.5} fill={diziWatchlist ? 'currentColor' : 'none'} />
                <span>İzleyeceğim</span>
              </div>
            </div>

            {/* Rate */}
            <div className="dv2-rate-box">
              <span className="dv2-rate-label">Puanla</span>
              <div className="dv2-stars" onMouseLeave={() => setHoverPuani(0)}>
                {[...Array(10)].map((_, i) => (
                  <span key={i} className={`dv2-star ${(i + 1) <= (hoverPuani || kullaniciPuani) ? 'dolu' : ''}`}
                    onMouseEnter={() => setHoverPuani(i + 1)} onClick={() => puanVer(i + 1)}>★</span>
                ))}
              </div>
              {kullaniciPuani && (
                <div className="dv2-puan-info">
                  <span>Puanın: <strong>{kullaniciPuani}/10</strong></span>
                  <button className="dv2-puan-sil" onClick={puanSil}><X size={14} /> Geri Al</button>
                </div>
              )}
            </div>

            {/* Review & List Buttons */}
            <button className="dv2-btn" onClick={() => setReviewModalAcik(true)}><MessageSquare size={15} /> Yorum Yaz</button>
            <div className="dv2-liste-container">
              <button className="dv2-btn" onClick={() => setListeMenuAcik(!listeMenuAcik)}><Bookmark size={15} /> Listeye Ekle</button>
              {listeMenuAcik && (
                <div className="liste-popup">
                  {kullaniciListeleri.map(liste => (
                    <div key={liste.list_id} className="liste-satir" onClick={() => listeToggle(liste.list_id)}>
                      <input type="checkbox" className="liste-checkbox" checked={dizininListeleri.includes(liste.list_id)} readOnly />
                      <span className="liste-adi">{liste.name}</span>
                    </div>
                  ))}
                  <div className="yeni-liste-form">
                    <input type="text" className="yeni-liste-input" placeholder="Yeni liste..." value={yeniListeAdi} onChange={e => setYeniListeAdi(e.target.value)} />
                    <button className="liste-ekle-btn" onClick={yeniListeOlustur}>+</button>
                  </div>
                </div>
              )}
            </div>

            <button className="dv2-btn dv2-btn-play" onClick={genelIzle}>
              <PlayCircle size={18} /> İZLE
            </button>
          </div>
        </div>
      </div>

      {/* ===== TABS + İÇERİK ===== */}
      <div className="dv2-content">
        <div className="dv2-tabs">
          <span className={aktifSekme === 'seasons' ? 'dv2-tab-active' : ''} onClick={() => setAktifSekme('seasons')}>Sezonlar</span>
          <span className={aktifSekme === 'cast' ? 'dv2-tab-active' : ''} onClick={() => setAktifSekme('cast')}>Oyuncular</span>
          <span className={aktifSekme === 'crew' ? 'dv2-tab-active' : ''} onClick={() => setAktifSekme('crew')}>Ekip</span>
        </div>

        <div className="dv2-tab-content">
          {aktifSekme === 'seasons' && (
            <div className="sezon-listesi">
              {sezonlar.length > 0 ? sezonlar.map(sezon => {
                const buBolumler = bolumler.filter(b => b.season_id === sezon.season_id);
                const toplam = buBolumler.length;
                const izlenen = buBolumler.filter(b => izlenenBolumler[b.episode_id]).length;
                const yuzde = toplam > 0 ? (izlenen / toplam) * 100 : 0;

                return (
                  <div key={sezon.season_id}>
                    <div className="sezon-satir" onClick={() => sezonAccordionToggle(sezon.season_id)}>
                      <img src={sezon.poster_path ? `https://image.tmdb.org/t/p/w185${sezon.poster_path}` : `https://image.tmdb.org/t/p/w185${dizi.poster_path}`} alt={sezon.name} className="sezon-poster-kucuk" loading="lazy" decoding="async" />
                      <div className="sezon-bilgi">
                        <div className="sezon-baslik">{sezon.name}</div>
                        <div className="sezon-detay">
                          {sezon.air_date && <span>{sezon.air_date.substring(0, 4)}</span>}
                          <span>• {sezon.season_number}. Sezon</span>
                          {sezon.vote_average > 0 && <span>⭐ {Number(sezon.vote_average).toFixed(1)}</span>}
                        </div>
                        <div className="sezon-progress-bar"><div className="sezon-progress-fill" style={{ width: `${yuzde}%` }} /></div>
                        <div className="sezon-izlenme-text">{izlenen} / {toplam} izlendi</div>
                      </div>
                      <div className="sezon-butonlar">
                        <button className={`sezon-izle-btn toplu-btn ${izlenenSezonlar[sezon.season_id] ? 'aktif-izle' : ''}`} onClick={e => { e.stopPropagation(); sezonIzleToggle(sezon.season_id); }}><Check size={16} /></button>
                        <button className={`sezon-izle-btn toplu-btn ${izlenecekSezonlar[sezon.season_id] ? 'aktif-izlenecek' : ''}`} onClick={e => { e.stopPropagation(); sezonIzlenecekToggle(sezon.season_id); }}><Plus size={16} /></button>
                      </div>
                    </div>

                    {acikSezonlar[sezon.season_id] && (
                      <div className="bolum-listesi-wrapper">
                        {buBolumler.map(bolum => (
                          <div key={bolum.episode_id} className="bolum-satir">
                            <div className="bolum-sol">
                              <span className="bolum-no">{bolum.episode_number}</span>
                              <div className="bolum-bilgi">
                                <span className="bolum-adi">{bolum.name || `Bölüm ${bolum.episode_number}`}</span>
                                {bolum.air_date && <span className="bolum-tarih">{tarihFormatla(bolum.air_date)}</span>}
                                {bolum.vote_average > 0 && <span className="bolum-rating">⭐ {Number(bolum.vote_average).toFixed(1)}</span>}
                              </div>
                            </div>
                            <div className="bolum-aksiyonlar">
                              <div className="bolum-puanlama-container">
                                <button className="bolum-puan-toggle" onClick={() => setAcikPuanlama(acikPuanlama === bolum.episode_id ? null : bolum.episode_id)}>
                                  {bolumPuanlari[bolum.episode_id] ? `★ ${bolumPuanlari[bolum.episode_id]}` : '☆'}
                                </button>
                                {acikPuanlama === bolum.episode_id && (
                                  <div className="bolum-yildizlar" onMouseLeave={() => setHoverBolumPuani({ id: null, puan: 0 })}>
                                    {[...Array(10)].map((_, i) => (
                                      <span key={i}
                                        className={`bolum-tek-yildiz ${(i + 1) <= (hoverBolumPuani.id === bolum.episode_id ? hoverBolumPuani.puan : (bolumPuanlari[bolum.episode_id] || 0)) ? 'dolu' : ''}`}
                                        onMouseEnter={() => setHoverBolumPuani({ id: bolum.episode_id, puan: i + 1 })}
                                        onClick={() => bolumPuanVer(bolum.episode_id, i + 1)}>★</span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <button className={`bolum-izle-btn ${izlenenBolumler[bolum.episode_id] ? 'izlendi' : ''}`} onClick={() => bolumIzleToggle(bolum)} title="İzleedim"><Eye size={16} /></button>
                              <button className={`bolum-izle-btn ${izlenecekBolumler[bolum.episode_id] ? 'izlenecek' : ''}`} onClick={() => bolumIzlenecekToggle(bolum)} title="İzleyeceğim"><Clock size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }) : <p style={{ color: '#64748b' }}>Sezon bilgisi bulunamadı.</p>}
            </div>
          )}

          {aktifSekme === 'cast' && (
            <div className="cast-grid">
              {oyuncular.length > 0 ? oyuncular.map((oyuncu, i) => (
                <div key={i} className="cast-kart">
                  {oyuncu.profile_path ? <img src={`https://image.tmdb.org/t/p/w185${oyuncu.profile_path}`} alt={oyuncu.name} className="cast-foto" loading="lazy" decoding="async" /> : <div className="cast-foto-yok">👤</div>}
                  <div className="cast-bilgi"><span className="cast-isim">{oyuncu.name}</span><span className="cast-rol">{oyuncu.character}</span></div>
                </div>
              )) : <p style={{ color: '#64748b' }}>Oyuncu bilgisi bulunamadı.</p>}
            </div>
          )}

          {aktifSekme === 'crew' && (
            <div className="crew-bolumler">
              {Object.keys(gruplanmisEkip).length > 0 ? Object.entries(gruplanmisEkip).map(([dept, kisiler]) => (
                <div key={dept} className="crew-departman">
                  <h3 className="crew-dept-baslik">{dept}</h3>
                  <div className="crew-grid">
                    {kisiler.map((kisi, i) => (
                      <div key={i} className="crew-kart">
                        {kisi.profile_path ? <img src={`https://image.tmdb.org/t/p/w185${kisi.profile_path}`} alt={kisi.name} className="cast-foto" loading="lazy" decoding="async" /> : <div className="cast-foto-yok">👤</div>}
                        <div className="cast-bilgi"><span className="cast-isim">{kisi.name}</span><span className="cast-rol">{kisi.job}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : <p style={{ color: '#64748b' }}>Ekip bilgisi bulunamadı.</p>}
            </div>
          )}
        </div>

        {/* Reviews Alt Kısım */}
        {reviews.length > 0 && (
          <div className="dv2-reviews-section">
            <h3>Yorumlar ({reviews.length})</h3>
            {reviews.map(r => (
              <div key={r.review_id} className="review-item">
                <div className="review-meta">
                  <span className="review-user">@{r.username || 'anonim'}</span>
                  <span className="review-tarih">{new Date(r.created_at).toLocaleDateString('tr-TR')}</span>
                </div>
                {r.contains_spoiler ? (
                  <div
                    className={`spoiler-blur-wrapper${revealedSpoilers.has(r.review_id) ? ' revealed' : ''}`}
                    onClick={() => setRevealedSpoilers(prev => { const n = new Set(prev); n.has(r.review_id) ? n.delete(r.review_id) : n.add(r.review_id); return n; })}
                  >
                    <p className="review-text spoiler-text">{r.review_text}</p>
                    {!revealedSpoilers.has(r.review_id) && (
                      <div className="spoiler-overlay">
                        <AlertTriangle size={14} />
                        Spoiler İçeriyor — Görmek İçin Tıkla
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="review-text">{r.review_text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REVIEW MODAL */}
      {reviewModalAcik && (
        <div className="review-modal-overlay" onClick={() => setReviewModalAcik(false)}>
          <div className="review-modal" onClick={e => e.stopPropagation()}>
            <div className="review-modal-header">
              <h3>Yorum Yaz — {dizi.name}</h3>
              <button className="review-modal-kapat" onClick={() => setReviewModalAcik(false)}>✕</button>
            </div>
            <textarea className="review-textarea" placeholder="Bu dizi hakkında ne düşünüyorsun?" value={reviewText} onChange={e => setReviewText(e.target.value)} rows={5} />
            <label className="spoiler-label">
              <input type="checkbox" checked={spoilerVar} onChange={e => setSpoilerVar(e.target.checked)} />
              <AlertTriangle size={14} /> Spoiler içeriyor
            </label>
            <button className="review-gonder-btn" disabled={!reviewText.trim() || reviewGonderiliyor}
              onClick={async () => {
                const token = localStorage.getItem('sb_token');
                if (!token) { alert("Bu eylemi gerçekleştirmek için giriş yapınız."); return; }
                setReviewGonderiliyor(true);
                try {
                  await fetch(`${API_BASE}/reviews`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: dizi.series_id, review_text: reviewText, contains_spoiler: spoilerVar }) });
                  const r = await fetch(`${API_BASE}/reviews/${dizi.series_id}`);
                  const d = await r.json();
                  if (Array.isArray(d)) setReviews(d);
                  setReviewText(''); setSpoilerVar(false); setReviewModalAcik(false);
                } catch (e) { console.error(e); }
                setReviewGonderiliyor(false);
              }}>
              {reviewGonderiliyor ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default DiziDetay;