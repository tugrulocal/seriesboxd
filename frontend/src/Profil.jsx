import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Clock, Tv, Bookmark, Star, Calendar, Activity, Heart, ArrowRight, Quote, Eye } from 'lucide-react';
import './Profil.css';

function Profil() {
    const { kullanici } = useAuth();
    const navigate = useNavigate();

    const [stats, setStats] = useState(null);
    const [recent, setRecent] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [watchlistPreview, setWatchlistPreview] = useState([]);
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
            fetch('http://127.0.0.1:8000/profile/favorites', { headers }).then(res => res.json()),
            fetch('http://127.0.0.1:8000/profile/watchlist_preview', { headers }).then(res => res.json())
        ])
            .then(([st, rec, favs, wlist]) => {
                setStats(st);
                if (Array.isArray(rec)) setRecent(rec);
                if (Array.isArray(favs)) setFavorites(favs);
                if (Array.isArray(wlist)) setWatchlistPreview(wlist);
            })
            .catch(err => console.error("Profil verisi çekilemedi:", err))
            .finally(() => setLoading(false));

    }, [kullanici, navigate]);

    if (loading) return null;
    if (!kullanici) return null;

    const basharf = kullanici.username?.[0]?.toUpperCase() || '?';
    const kayitTarihi = new Date(kullanici.created_at || Date.now()).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });

    // Grafik için en yüksek değeri bulma (oranlama için)
    const maxMonthCount = stats?.monthly_activity?.length > 0
        ? Math.max(...stats.monthly_activity.map(m => m.count))
        : 1;

    // Ay isimlerini Türkçeleştirme
    const formatMonth = (yyyyMM) => {
        if (!yyyyMM) return '?';
        const [year, month] = yyyMM.split('-');
        const date = new Date(year, parseInt(month) - 1);
        return date.toLocaleDateString('tr-TR', { month: 'short' }).toUpperCase();
    };

    return (
        <div className="profil-page">

            {/* HERO BÖLÜMÜ (LETTERBOXD STYLE) */}
            <div className="profil-hero">
                {kullanici.avatar ? (
                    <img src={kullanici.avatar} alt="Avatar" className="profil-avatar-large" />
                ) : (
                    <div className="profil-avatar-large">{basharf}</div>
                )}
                <div className="profil-hero-info">
                    <div className="profil-header-top">
                        <h1 className="profil-username">{kullanici.username}</h1>
                        <div className="profil-join-date">
                            Seriesboxd üyesi (Katılım: {kayitTarihi})
                        </div>
                    </div>
                    {kullanici.bio && <p className="profil-bio">{kullanici.bio}</p>}

                    <div className="profil-stats-row">
                        <div className="stat-item">
                            <span className="stat-value">{stats?.watched_series || 0}</span>
                            <span className="stat-label">Dizi</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-value">{stats?.episodes_watched || 0}</span>
                            <span className="stat-label">Bölüm</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-value">{stats?.watchlist_count || 0}</span>
                            <span className="stat-label">Watchlist</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-value">{stats?.total_hours || 0}</span>
                            <span className="stat-label">Saat İzlenen</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="profil-main-content">

                {/* SOL: SON HAREKETLER (DIARY) */}
                <div className="profil-diary">
                    <h3 className="section-title"><Clock size={20} /> Son Hareketler</h3>

                    <div className="activity-list">
                        {recent.length > 0 ? recent.map((act, index) => {
                            // Activity parser
                            let icon = <Eye size={14} />;
                            let text = 'İzlendi';
                            let cssClass = 'act-watched';
                            if (act.activity_type === 'watchlist') { icon = <Bookmark size={14} />; text = 'Listeye Eklendi'; cssClass = 'act-watchlist'; }
                            if (act.activity_type === 'liked') { icon = <Heart size={14} fill="currentColor" />; text = 'Beğenildi'; cssClass = 'act-liked'; }
                            if (act.activity_type === 'series_rated' || act.activity_type === 'episode_rated') { icon = <Star size={14} fill="currentColor" />; text = 'Puanlandı'; cssClass = 'act-rated'; }
                            if (act.activity_type === 'series_reviewed') { icon = <Quote size={14} />; text = 'İnceleme Yazıldı'; cssClass = 'act-reviewed'; }

                            // Make sure mapping keys are totally unique since activity_ids might collide across 5 tables
                            return (
                                <div key={`${act.activity_type}-${act.activity_id}-${index}`} className="activity-item">
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
                                            {act.season_id !== null ? `${act.season_id}. Sezon ${act.episode_number}. Bölüm (${act.episode_name})` : ''}
                                        </div>
                                        {act.activity_type === 'series_reviewed' && <div className="act-review-text">"{act.review_text}"</div>}
                                        <div className="act-meta">
                                            <span className={`act-bag ${cssClass}`}>
                                                {icon} {text} {act.score ? `${act.score}/10` : ''}
                                            </span>
                                            <span>{new Date(act.created_at).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
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
                                            <div className="fav-rating"><Star size={12} fill="currentColor" /> {Number(fav.rating || 0).toFixed(1)}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Henüz beğendiğiniz dizi yok.</p>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <h3 className="section-title"><Bookmark size={20} /> İzlenecek Diziler</h3>
                        {watchlistPreview.length > 0 ? (
                            <div className="favorite-series-grid">
                                {watchlistPreview.map(w => (
                                    <Link to={`/dizi/${w.series_id}`} key={w.series_id} className="fav-card">
                                        <img
                                            src={`https://image.tmdb.org/t/p/w200${w.poster_path}`}
                                            alt={w.name}
                                            className="fav-poster"
                                        />
                                        <div className="fav-overlay">
                                            <div className="fav-rating"><Star size={12} fill="currentColor" /> {Number(w.rating || 0).toFixed(1)}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>İzleme listeniz boş.</p>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <h3 className="section-title"><Star size={20} /> En Çok İzlenen Türler</h3>
                        {stats?.top_genres && stats.top_genres.length > 0 ? (
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
                        {stats?.monthly_activity && stats.monthly_activity.length > 0 ? (
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
