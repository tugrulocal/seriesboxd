import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Bookmark, Star, Heart, Eye, ChevronDown, ChevronUp, Plus, X, Search, Film, List, MessageSquare } from 'lucide-react';
import './Profil.css';
import API_BASE from './config';

function Profil() {
    const { kullanici, yukleniyor: authLoading } = useAuth();
    const navigate = useNavigate();

    const [stats, setStats] = useState(null);
    const [recent, setRecent] = useState([]);
    const [recentExpanded, setRecentExpanded] = useState(false);
    const [recentFull, setRecentFull] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [watchlistPreview, setWatchlistPreview] = useState([]);
    const [ratingsDistribution, setRatingsDistribution] = useState(null);
    const [loading, setLoading] = useState(true);

    // Tabs
    const [activeTab, setActiveTab] = useState(null);
    const [tabData, setTabData] = useState(null);
    const [tabLoading, setTabLoading] = useState(false);

    // Diziler tab filters
    const [filterGenre, setFilterGenre] = useState('');
    const [filterSort, setFilterSort] = useState('recent');
    const [genres, setGenres] = useState([]);

    // Favori arama modal state
    const [favModalOpen, setFavModalOpen] = useState(false);
    const [favModalSlot, setFavModalSlot] = useState(null);
    const [favSearchQuery, setFavSearchQuery] = useState('');
    const [favSearchResults, setFavSearchResults] = useState([]);
    const [favSearching, setFavSearching] = useState(false);
    const favSearchTimeout = useRef(null);

    const token = localStorage.getItem('sb_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    useEffect(() => {
        if (authLoading) return;
        if (!kullanici) {
            navigate('/login');
            return;
        }

        Promise.all([
            fetch(`${API_BASE}/profile/stats`, { headers }).then(res => res.json()),
            fetch(`${API_BASE}/profile/recent-activity?limit=3`, { headers }).then(res => res.json()),
            fetch(`${API_BASE}/profile/favorites`, { headers }).then(res => res.json()),
            fetch(`${API_BASE}/profile/watchlist_preview`, { headers }).then(res => res.json()),
            fetch(`${API_BASE}/profile/ratings-distribution`, { headers }).then(res => res.json()),
            fetch(`${API_BASE}/turler`).then(res => res.json())
        ])
            .then(([st, rec, favs, wlist, rdist, genreList]) => {
                setStats(st);
                if (Array.isArray(rec)) setRecent(rec);
                if (Array.isArray(favs)) setFavorites(favs);
                if (Array.isArray(wlist)) setWatchlistPreview(wlist);
                if (rdist && rdist.distribution) setRatingsDistribution(rdist);
                if (Array.isArray(genreList)) setGenres(genreList);
            })
            .catch(err => console.error("Profil verisi çekilemedi:", err))
            .finally(() => setLoading(false));
    }, [kullanici, authLoading, navigate]);

    // Tab data fetch
    const fetchTabData = (tab, genre = '', sort = 'recent') => {
        setTabLoading(true);
        let url = '';
        if (tab === 'diziler') {
            const params = new URLSearchParams();
            if (genre) params.append('genre', genre);
            params.append('sort', sort);
            url = `${API_BASE}/profile/watched-series?${params}`;
        } else if (tab === 'incelemeler') {
            url = `${API_BASE}/profile/user-reviews`;
        } else if (tab === 'listeler') {
            url = `${API_BASE}/profile/lists-detail`;
        } else if (tab === 'begeniler') {
            url = `${API_BASE}/profile/liked-series`;
        }
        fetch(url, { headers })
            .then(res => res.json())
            .then(data => setTabData(data))
            .catch(() => setTabData([]))
            .finally(() => setTabLoading(false));
    };

    const handleTabClick = (tab) => {
        if (activeTab === tab) {
            setActiveTab(null);
            setTabData(null);
            return;
        }
        setActiveTab(tab);
        fetchTabData(tab, filterGenre, filterSort);
    };

    const handleFilterChange = (newGenre, newSort) => {
        setFilterGenre(newGenre);
        setFilterSort(newSort);
        fetchTabData('diziler', newGenre, newSort);
    };

    // Favori arama
    const handleFavSearch = (query) => {
        setFavSearchQuery(query);
        if (favSearchTimeout.current) clearTimeout(favSearchTimeout.current);
        if (!query.trim()) { setFavSearchResults([]); return; }
        setFavSearching(true);
        favSearchTimeout.current = setTimeout(() => {
            fetch(`${API_BASE}/arama?q=${encodeURIComponent(query.trim())}`)
                .then(res => res.json())
                .then(data => { if (Array.isArray(data)) setFavSearchResults(data.slice(0, 8)); })
                .catch(() => { })
                .finally(() => setFavSearching(false));
        }, 300);
    };

    const handleFavSelect = (series) => {
        fetch(`${API_BASE}/profile/favorites`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ series_id: series.series_id, slot: favModalSlot })
        })
            .then(res => res.json())
            .then(() => {
                setFavorites(prev => {
                    const updated = prev.filter(f => f.slot !== favModalSlot && f.series_id !== series.series_id);
                    updated.push({ slot: favModalSlot, series_id: series.series_id, name: series.name, poster_path: series.poster_path, rating: series.rating });
                    updated.sort((a, b) => a.slot - b.slot);
                    return updated;
                });
                setFavModalOpen(false);
                setFavSearchQuery('');
                setFavSearchResults([]);
            })
            .catch(() => { });
    };

    const handleFavRemove = (slot, e) => {
        e.stopPropagation();
        e.preventDefault();
        fetch(`${API_BASE}/profile/favorites/${slot}`, { method: 'DELETE', headers })
            .then(() => setFavorites(prev => prev.filter(f => f.slot !== slot)))
            .catch(() => { });
    };

    const openFavModal = (slot) => {
        setFavModalSlot(slot);
        setFavModalOpen(true);
        setFavSearchQuery('');
        setFavSearchResults([]);
    };

    const handleExpandActivity = () => {
        if (!recentExpanded && recentFull.length === 0) {
            fetch(`${API_BASE}/profile/recent-activity?limit=50&days=30`, { headers })
                .then(res => res.json())
                .then(data => { if (Array.isArray(data)) setRecentFull(data); })
                .catch(() => { });
        }
        setRecentExpanded(!recentExpanded);
    };

    if (loading) return null;
    if (!kullanici) return null;

    const basharf = kullanici.username?.[0]?.toUpperCase() || '?';
    const kayitTarihi = new Date(kullanici.created_at || Date.now()).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });

    const activityItems = recentExpanded ? recentFull : recent;

    const getActivityText = (act) => {
        if (act.activity_type === 'watched') return 'izledi';
        if (act.activity_type === 'liked') return 'beğendi';
        if (act.activity_type === 'watchlist') return 'listesine ekledi';
        if (act.activity_type === 'series_rated') return `puanladı ★${act.score}`;
        if (act.activity_type === 'episode_rated') return `puanladı ★${act.score}`;
        if (act.activity_type === 'series_reviewed') return 'inceleme yazdı';
        return '';
    };

    const getTimeAgo = (dateStr) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'şimdi';
        if (diffMins < 60) return `${diffMins}dk`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}sa`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return `${diffDays}g`;
        return `${Math.floor(diffDays / 30)}ay`;
    };

    const maxRating = ratingsDistribution
        ? Math.max(...Object.values(ratingsDistribution.distribution), 1)
        : 1;

    const getFavBySlot = (slot) => favorites.find(f => f.slot === slot);

    // --- TAB RENDERERS ---

    const renderDizilerTab = () => {
        const items = Array.isArray(tabData) ? tabData : [];
        return (
            <div className="tab-content-inner">
                <div className="tab-filters">
                    <select value={filterGenre} onChange={e => handleFilterChange(e.target.value, filterSort)}>
                        <option value="">Tüm Türler</option>
                        {genres.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select value={filterSort} onChange={e => handleFilterChange(filterGenre, e.target.value)}>
                        <option value="recent">Son Eklenen</option>
                        <option value="rating_desc">Puan (Yüksek → Düşük)</option>
                        <option value="rating_asc">Puan (Düşük → Yüksek)</option>
                        <option value="name_asc">İsim (A → Z)</option>
                        <option value="name_desc">İsim (Z → A)</option>
                    </select>
                </div>
                {items.length > 0 ? (
                    <div className="tab-poster-grid">
                        {items.map(s => (
                            <Link to={`/dizi/${s.series_id}`} key={s.series_id} className="tab-poster-card">
                                <img src={`https://image.tmdb.org/t/p/w185${s.poster_path}`} alt={s.name} loading="lazy" decoding="async" />
                                <div className="tab-poster-overlay">
                                    <span className="tab-poster-name">{s.name}</span>
                                    {s.user_score && <span className="tab-poster-score">★ {s.user_score}</span>}
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="tab-empty">Henüz izlenen dizi yok.</p>
                )}
            </div>
        );
    };

    const renderIncelemelerTab = () => {
        const items = Array.isArray(tabData) ? tabData : [];
        return (
            <div className="tab-content-inner">
                {items.length > 0 ? (
                    <div className="tab-reviews-list">
                        {items.map(r => (
                            <div key={r.review_id} className="tab-review-card">
                                <Link to={`/dizi/${r.series_id}`} className="tab-review-poster-link">
                                    <img src={`https://image.tmdb.org/t/p/w185${r.poster_path}`} alt={r.name} className="tab-review-poster" loading="lazy" decoding="async" />
                                </Link>
                                <div className="tab-review-body">
                                    <div className="tab-review-header">
                                        <Link to={`/dizi/${r.series_id}`} className="tab-review-title">{r.name}</Link>
                                        {r.user_score && <span className="tab-review-score">★ {r.user_score}</span>}
                                    </div>
                                    <p className="tab-review-text">
                                        {r.contains_spoiler ? (
                                            <span className="spoiler-tag">⚠ Spoiler içerir</span>
                                        ) : null}
                                        {r.review_text}
                                    </p>
                                    <span className="tab-review-date">{new Date(r.created_at).toLocaleDateString('tr-TR')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="tab-empty">Henüz inceleme yazılmadı.</p>
                )}
            </div>
        );
    };

    const renderListelerTab = () => {
        const items = Array.isArray(tabData) ? tabData : [];
        return (
            <div className="tab-content-inner">
                {items.length > 0 ? (
                    <div className="tab-lists-grid">
                        {items.map(lst => (
                            <div key={lst.list_id} className="tab-list-card">
                                <div className="tab-list-posters">
                                    {lst.items && lst.items.length > 0 ? (
                                        lst.items.slice(0, 5).map(item => (
                                            <img key={item.series_id} src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt={item.name} className="tab-list-poster" loading="lazy" decoding="async" />
                                        ))
                                    ) : (
                                        <div className="tab-list-empty-poster">
                                            <List size={24} />
                                        </div>
                                    )}
                                </div>
                                <div className="tab-list-info">
                                    <h4 className="tab-list-name">{lst.list_name}</h4>
                                    <span className="tab-list-count">{lst.item_count} dizi</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="tab-empty">Henüz liste oluşturulmadı.</p>
                )}
            </div>
        );
    };

    const renderBegenilerTab = () => {
        const items = Array.isArray(tabData) ? tabData : [];
        return (
            <div className="tab-content-inner">
                {items.length > 0 ? (
                    <div className="tab-poster-grid">
                        {items.map(s => (
                            <Link to={`/dizi/${s.series_id}`} key={s.series_id} className="tab-poster-card">
                                <img src={`https://image.tmdb.org/t/p/w185${s.poster_path}`} alt={s.name} loading="lazy" decoding="async" />
                                <div className="tab-poster-overlay">
                                    <span className="tab-poster-name">{s.name}</span>
                                    {s.user_score && <span className="tab-poster-score">★ {s.user_score}</span>}
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="tab-empty">Henüz beğenilen dizi yok.</p>
                )}
            </div>
        );
    };

    const renderTabContent = () => {
        if (!activeTab) return null;
        if (tabLoading) return <div className="tab-content"><div className="tab-loading">Yükleniyor...</div></div>;
        return (
            <div className="tab-content">
                {activeTab === 'diziler' && renderDizilerTab()}
                {activeTab === 'incelemeler' && renderIncelemelerTab()}
                {activeTab === 'listeler' && renderListelerTab()}
                {activeTab === 'begeniler' && renderBegenilerTab()}
            </div>
        );
    };

    return (
        <div className="profil-page">

            {/* HERO */}
            <div className="profil-hero">
                <div className="profil-hero-left">
                    {kullanici.avatar ? (
                        <img src={kullanici.avatar} alt="Avatar" className="profil-avatar-large" />
                    ) : (
                        <div className="profil-avatar-large">{basharf}</div>
                    )}
                    <div className="profil-hero-info">
                        <h1 className="profil-username">{kullanici.username}</h1>
                        <div className="profil-join-date">
                            Katılım: {kayitTarihi}
                        </div>
                        {kullanici.bio && <p className="profil-bio">{kullanici.bio}</p>}
                    </div>
                </div>
                <div className="profil-hero-stats">
                    <div className="stat-item">
                        <span className="stat-value">{stats?.watched_series || 0}</span>
                        <span className="stat-label">Dizi</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats?.episodes_watched || 0}</span>
                        <span className="stat-label">Bölüm</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats?.total_hours || 0}</span>
                        <span className="stat-label">Saat</span>
                    </div>
                </div>
            </div>

            {/* PROFILE TABS */}
            <div className="profil-tabs">
                <Link to="/dizilerim" className="profil-tab">
                    <Film size={15} /> Diziler
                </Link>
                <button className={`profil-tab ${activeTab === 'incelemeler' ? 'active' : ''}`} onClick={() => handleTabClick('incelemeler')}>
                    <MessageSquare size={15} /> İncelemelerim
                </button>
                <button className={`profil-tab ${activeTab === 'listeler' ? 'active' : ''}`} onClick={() => handleTabClick('listeler')}>
                    <List size={15} /> Listelerim
                </button>
                <button className={`profil-tab ${activeTab === 'begeniler' ? 'active' : ''}`} onClick={() => handleTabClick('begeniler')}>
                    <Heart size={15} /> Beğendiklerim
                </button>
            </div>

            {/* TAB CONTENT */}
            {renderTabContent()}

            {/* İÇERİK: SOL + SAĞ */}
            <div className="profil-main-content">

                {/* SOL PANEL */}
                <div className="profil-left">

                    {/* FAVORİ DİZİLER */}
                    <div className="profil-section">
                        <h3 className="section-title-lb">FAVORİ DİZİLER</h3>
                        <div className="fav-row">
                            {[...Array(5)].map((_, i) => {
                                const fav = getFavBySlot(i);
                                return fav ? (
                                    <div key={`fav-${i}`} className="fav-slot filled" onClick={() => openFavModal(i)}>
                                        <Link to={`/dizi/${fav.series_id}`} onClick={e => e.stopPropagation()}>
                                            <img src={`https://image.tmdb.org/t/p/w185${fav.poster_path}`} alt={fav.name} loading="lazy" decoding="async" />
                                        </Link>
                                        <button className="fav-remove-btn" onClick={(e) => handleFavRemove(i, e)} title="Kaldır">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div key={`empty-${i}`} className="fav-slot empty" onClick={() => openFavModal(i)}>
                                        <Plus size={28} className="fav-plus-icon" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* EN ÇOK İZLENEN TÜRLER */}
                    {stats?.top_genres && stats.top_genres.length > 0 && (
                        <div className="profil-section">
                            <h3 className="section-title-lb">EN ÇOK İZLENEN TÜRLER</h3>
                            <div className="genre-pills">
                                {stats.top_genres.map((g, i) => (
                                    <span key={i} className="genre-pill">{g}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* SAĞ PANEL (SIDEBAR) */}
                <div className="profil-sidebar">

                    {/* WATCHLIST */}
                    <div className="sidebar-block">
                        <div className="sidebar-block-header">
                            <h4 className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                İZLEME LİSTESİ
                                {(stats?.watchlist_count || 0) > 4 && (
                                    <Link to="/watchlist" style={{ color: '#94a3b8', fontSize: '0.8rem', textDecoration: 'none' }}>Tümünü Gör</Link>
                                )}
                            </h4>
                            <span className="sidebar-count">{stats?.watchlist_count || 0}</span>
                        </div>
                        {watchlistPreview.length > 0 ? (
                            <div className="sidebar-poster-row">
                                {watchlistPreview.map(w => (
                                    <Link to={`/dizi/${w.series_id}`} key={w.series_id} className="sidebar-poster-link">
                                        <img src={`https://image.tmdb.org/t/p/w185${w.poster_path}`} alt={w.name} className="sidebar-poster" loading="lazy" decoding="async" />
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="sidebar-empty">İzleme listeniz boş.</p>
                        )}
                    </div>

                    {/* RATINGS */}
                    <div className="sidebar-block">
                        <div className="sidebar-block-header">
                            <h4 className="sidebar-title">RATINGS</h4>
                            <span className="sidebar-count">{ratingsDistribution?.total || 0}</span>
                        </div>
                        {ratingsDistribution && ratingsDistribution.total > 0 ? (
                            <div className="ratings-histogram">
                                <div className="histogram-bars">
                                    {Object.entries(ratingsDistribution.distribution).map(([score, count]) => (
                                        <div key={score} className="histogram-bar-group" title={`${score}/10: ${count} dizi`}>
                                            <div
                                                className="histogram-bar"
                                                style={{ height: `${Math.max((count / maxRating) * 100, 4)}%` }}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="histogram-labels">
                                    <span className="histogram-star">★</span>
                                    <span className="histogram-stars">★★★★★</span>
                                </div>
                            </div>
                        ) : (
                            <p className="sidebar-empty">Henüz puan verilmedi.</p>
                        )}
                    </div>

                    {/* SON HAREKETLER */}
                    <div className="sidebar-block">
                        <div className="sidebar-block-header clickable" onClick={handleExpandActivity}>
                            <h4 className="sidebar-title">SON HAREKETLER</h4>
                            {recentExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                        <div className={`activity-compact-list ${recentExpanded ? 'expanded' : ''}`}>
                            {activityItems.length > 0 ? activityItems.map((act, index) => (
                                <div key={`${act.activity_type}-${act.activity_id}-${index}`} className="activity-compact-item">
                                    <span className="act-dot" />
                                    <span className="act-compact-text">
                                        <Link to={`/dizi/${act.series_id}`} className="act-link">{act.series_name}</Link>
                                        {' '}{getActivityText(act)}
                                    </span>
                                    <span className="act-time">{getTimeAgo(act.created_at)}</span>
                                </div>
                            )) : (
                                <p className="sidebar-empty">Henüz bir hareket yok.</p>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* FAVORİ DİZİ ARAMA MODALI */}
            {favModalOpen && (
                <div className="fav-modal-overlay" onClick={() => setFavModalOpen(false)}>
                    <div className="fav-modal" onClick={e => e.stopPropagation()}>
                        <div className="fav-modal-header">
                            <h3>Favori Dizi Seç</h3>
                            <button className="fav-modal-close" onClick={() => setFavModalOpen(false)}><X size={18} /></button>
                        </div>
                        <div className="fav-modal-search">
                            <Search size={16} className="fav-search-icon" />
                            <input
                                type="text"
                                placeholder="Dizi adı yazın..."
                                value={favSearchQuery}
                                onChange={e => handleFavSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="fav-modal-results">
                            {favSearching && <p className="fav-modal-info">Aranıyor...</p>}
                            {!favSearching && favSearchQuery && favSearchResults.length === 0 && (
                                <p className="fav-modal-info">Sonuç bulunamadı.</p>
                            )}
                            {favSearchResults.map(s => (
                                <div key={s.series_id} className="fav-modal-result" onClick={() => handleFavSelect(s)}>
                                    <img
                                        src={s.poster_path ? `https://image.tmdb.org/t/p/w92${s.poster_path}` : 'https://via.placeholder.com/46x69?text=?'}
                                        alt={s.name}
                                        className="fav-modal-poster"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <div className="fav-modal-result-info">
                                        <span className="fav-modal-name">{s.name}</span>
                                        {s.rating && <span className="fav-modal-rating">★ {Number(s.rating).toFixed(1)}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Profil;
