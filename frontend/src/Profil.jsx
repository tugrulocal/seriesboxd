import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Clock, Tv, Bookmark, Star, Calendar, Activity, Heart, ArrowRight } from 'lucide-react';
import './Profil.css';

function Profil() {
    const { kullanici } = useAuth();
    const navigate = useNavigate();

    const [stats, setStats] = useState(null);
    const [recent, setRecent] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!kullanici) {
            navigate('/login');
            return;
        }

        const token = localStorage.getItem('sb_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        Promise.all([
            fetch('http://127.0.0.1:8000/profile/stats', { headers }).then(res => res.json()),
            fetch('http://127.0.0.1:8000/profile/recent-activity', { headers }).then(res => res.json()),
            fetch('http://127.0.0.1:8000/profile/favorites', { headers }).then(res => res.json())
        ])
            .then(([st, rec, favs]) => {
                setStats(st);
                if (Array.isArray(rec)) setRecent(rec);
                if (Array.isArray(favs)) setFavorites(favs);
            })
            .catch(err => console.error("Profil verisi çekilemedi:", err))
            .finally(() => setLoading(false));

    }, [kullanici, navigate]);

    if (loading) return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}>Yükleniyor...</div>;
    if (!kullanici) return null;

    const basharf = kullanici.username?.[0]?.toUpperCase() || '?';
    const kayitTarihi = new Date(kullanici.created_at || Date.now()).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });

    // Grafik için en yüksek değeri bulma (oranlama için)
    const maxMonthCount = stats?.monthly_activity?.length > 0
        ? Math.max(...stats.monthly_activity.map(m => m.count))
        : 1;

    // Ay isimlerini Türkçeleştirme
    const formatMonth = (yyyyMM) => {
        const [year, month] = yyyMM.split('-');
        const date = new Date(year, parseInt(month) - 1);
        return date.toLocaleDateString('tr-TR', { month: 'short' }).toUpperCase();
    };

    return (
        <div className="profil-page">

            {/* HERO BÖLÜMÜ */}
            <div className="profil-hero">
                {kullanici.avatar ? (
                    <img src={kullanici.avatar} alt="Avatar" className="profil-avatar-large" />
                ) : (
                    <div className="profil-avatar-large">{basharf}</div>
                )}
                <div className="profil-hero-info">
                    <h1 className="profil-username">{kullanici.username}</h1>
                    <div className="profil-join-date">
                        <Calendar size={14} /> Seriesboxd üyesi (Katılım: {kayitTarihi})
                    </div>
                    {kullanici.bio && <p className="profil-bio">{kullanici.bio}</p>}
                </div>
            </div>

            {/* STAT CARDS */}
            <div className="profil-stats-grid">
                <div className="stat-card">
                    <Clock size={32} className="stat-icon" />
                    <div className="stat-value">{stats?.total_hours || 0}</div>
                    <div className="stat-label">Saat İzlenen ({stats?.total_days || 0} Gün)</div>
                </div>
                <div className="stat-card">
                    <Tv size={32} className="stat-icon" />
                    <div className="stat-value">{stats?.watched_series || 0}</div>
                    <div className="stat-label">İzlenen Dizi</div>
                </div>
                <div className="stat-card">
                    <Bookmark size={32} className="stat-icon" />
                    <div className="stat-value">{stats?.watchlist_count || 0}</div>
                    <div className="stat-label">Watchlist</div>
                </div>
                <div className="stat-card">
                    <Activity size={32} className="stat-icon" />
                    <div className="stat-value">{stats?.episodes_watched || 0}</div>
                    <div className="stat-label">İzlenen Bölüm</div>
                </div>
            </div>

            <div className="profil-main-content">

                {/* SOL: SON HAREKETLER (DIARY) */}
                <div className="profil-diary">
                    <h3 className="section-title"><Clock size={20} /> Son Hareketler</h3>

                    <div className="activity-list">
                        {recent.length > 0 ? recent.map((act) => (
                            <div key={act.activity_id} className="activity-item">
                                <Link to={`/dizi/${act.series_id}`}>
                                    <img
                                        src={act.poster_path ? `https://image.tmdb.org/t/p/w200${act.poster_path}` : 'https://via.placeholder.com/60x90?text=Afi%C5%9F'}
                                        alt={act.series_name}
                                        className="act-poster"
                                    />
                                </Link>
                                <div className="act-details">
                                    <Link to={`/dizi/${act.series_id}`} style={{ textDecoration: 'none' }}>
                                        <h4 className="act-series-name">{act.series_name}</h4>
                                    </Link>
                                    <div className="act-ep-info">
                                        {act.season_id !== null ? `${act.season_id}. Sezon ${act.episode_number}. Bölüm` : 'Dizi'}
                                    </div>
                                    <div className="act-meta">
                                        <span className={`act-bag ${act.activity_type}`}>
                                            {act.activity_type === 'watched' ? <Star size={12} fill="currentColor" /> : <Bookmark size={12} fill="currentColor" />}
                                            {act.activity_type === 'watched' ? 'İzlendi' : 'Listeye Eklendi'}
                                        </span>
                                        <span>{new Date(act.created_at).toLocaleDateString('tr-TR')}</span>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <p style={{ color: '#94a3b8' }}>Henüz bir hareket yok.</p>
                        )}
                    </div>
                </div>

                {/* SAĞ: FAVORİLER & İSTATİSTİK */}
                <div className="profil-sidebar">

                    <div className="sidebar-section">
                        <h3 className="section-title"><Heart size={20} /> Favori Diziler</h3>
                        {favorites.length > 0 ? (
                            <div className="favorite-series-grid">
                                {favorites.map(fav => (
                                    <Link to={`/dizi/${fav.series_id}`} key={fav.series_id} className="fav-card">
                                        <img
                                            src={`https://image.tmdb.org/t/p/w200${fav.poster_path}`}
                                            alt={fav.name}
                                            className="fav-poster"
                                        />
                                        <div className="fav-overlay">
                                            <div className="fav-rating"><Star size={12} fill="currentColor" /> {Number(fav.rating).toFixed(1)}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Henüz beğendiğiniz dizi yok.</p>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <h3 className="section-title"><Star size={20} /> En Çok İzlenen Türler</h3>
                        {stats?.top_genres?.length > 0 ? (
                            <div className="favorite-genres">
                                {stats.top_genres.map((g, i) => (
                                    <span key={i} className="genre-pill">{g}</span>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Veri yok.</p>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <h3 className="section-title"><Activity size={20} /> Aylık Aktivite</h3>
                        {stats?.monthly_activity?.length > 0 ? (
                            <div className="chart-container">
                                {stats.monthly_activity.map((m, i) => {
                                    const heightPct = Math.max((m.count / maxMonthCount) * 100, 5);
                                    return (
                                        <div key={i} className="chart-bar-group">
                                            <div className="chart-tooltip">{m.count} bölüm</div>
                                            <div className="chart-bar" style={{ height: `${heightPct}%` }}></div>
                                            <div className="chart-label">{formatMonth(m.month)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Aktivite verisi yok.</p>
                        )}
                    </div>

                </div>

            </div>
        </div>
    );
}

export default Profil;
