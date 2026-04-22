import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Star, Eye, Heart, Bookmark, Award, FilterX, Trophy } from 'lucide-react';
import './Top50.css';
import API_BASE from './config';
import PosterImage from './PosterImage';

function Top50() {
  const [diziler, setDiziler] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterGenre, setFilterGenre] = useState('');
  const [filterDecade, setFilterDecade] = useState('');
  const [sortBy, setSortBy] = useState('rating'); // rating, popularity, newest
  const [showFilters, setShowFilters] = useState(false);

  // User Activity
  const { kullanici } = useAuth();
  const [userActivity, setUserActivity] = useState({ watched: {}, liked: {}, watchlist: {} });

  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/top50`).then(res => res.json()),
      fetch(`${API_BASE}/turler`).then(res => res.json())
    ])
      .then(([diziData, genreData]) => {
        if (Array.isArray(diziData)) setDiziler(diziData);
        if (Array.isArray(genreData)) setGenres(genreData);
      })
      .catch(err => console.error("Hata:", err))
      .finally(() => setLoading(false));
  }, []);

  // Load saved activity for the visible top list so refresh keeps the state.
  useEffect(() => {
    if (!kullanici) {
      setUserActivity({ watched: {}, liked: {}, watchlist: {} });
      return;
    }

    const token = localStorage.getItem('sb_token');
    if (!token || diziler.length === 0) return;

    let cancelled = false;

    Promise.allSettled(
      diziler.map(async (dizi) => {
        const res = await fetch(`${API_BASE}/series-activity/${dizi.series_id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          return { seriesId: dizi.series_id, activityTypes: [] };
        }

        const data = await res.json();
        return {
          seriesId: dizi.series_id,
          activityTypes: Array.isArray(data) ? data : []
        };
      })
    ).then((results) => {
      if (cancelled) return;

      const nextActivity = { watched: {}, liked: {}, watchlist: {} };

      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;

        const { seriesId, activityTypes } = result.value;
        if (activityTypes.includes('watched')) nextActivity.watched[seriesId] = true;
        if (activityTypes.includes('liked')) nextActivity.liked[seriesId] = true;
        if (activityTypes.includes('watchlist')) nextActivity.watchlist[seriesId] = true;
      });

      setUserActivity(nextActivity);
    }).catch(() => { });

    return () => {
      cancelled = true;
    };
  }, [kullanici, diziler]);

  const decades = ['2020s', '2010s', '2000s', '1990s', '1980s'];

  // Apply Filters & Sort
  const filteredAndSorted = useMemo(() => {
    let result = [...diziler];

    // Filter by Genre
    if (filterGenre) {
      result = result.filter(d =>
        d.genres && d.genres.split(',').map(g => g.trim()).includes(filterGenre)
      );
    }

    // Filter by Decade
    if (filterDecade) {
      const yearStart = parseInt(filterDecade.substring(0, 4));
      const yearEnd = yearStart + 9;
      result = result.filter(d => {
        if (!d.first_air_date) return false;
        const year = parseInt(d.first_air_date.substring(0, 4));
        return year >= yearStart && year <= yearEnd;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'rating') {
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      } else if (sortBy === 'popularity') {
        return (parseInt(b.vote_count) || 0) - (parseInt(a.vote_count) || 0);
      } else if (sortBy === 'newest') {
        const dateA = a.first_air_date ? new Date(a.first_air_date).getTime() : 0;
        const dateB = b.first_air_date ? new Date(b.first_air_date).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

    return result;
  }, [diziler, filterGenre, filterDecade, sortBy]);

  const clearFilters = () => {
    setFilterGenre('');
    setFilterDecade('');
    setSortBy('rating');
  };

  const handleSeriesClick = (id, e) => {
    // Prevent navigation if clicking action buttons
    if (e.target.closest('.top50-action-btn')) return;
    navigate(`/dizi/${id}`);
  }

  const toggleActivity = async (seriesId, type) => {
    if (!kullanici) {
      navigate('/login');
      return;
    }

    const token = localStorage.getItem('sb_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const isActive = !!userActivity[type]?.[seriesId];
    setUserActivity(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [seriesId]: !isActive
      }
    }));

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const requestOptions = isActive
        ? { method: 'DELETE', headers }
        : {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ series_id: seriesId, activity_type: type })
        };

      const endpoint = isActive
        ? `${API_BASE}/series-activity/${seriesId}/${type}`
        : `${API_BASE}/series-activity`;

      const res = await fetch(endpoint, requestOptions);
      if (!res.ok) throw new Error('Activity save failed');
    } catch (err) {
      console.error(err);
      setUserActivity(prev => ({
        ...prev,
        [type]: {
          ...prev[type],
          [seriesId]: isActive
        }
      }));
    }
  }

  return (
    <div className="top50-page">
      <div className="top50-header">
        <div className="top50-title-area">
          <h1>En Yüksek Puanlı 50 Dizi</h1>
          <p className="top50-subtitle">IMDb puanlarına göre tüm zamanların en iyi dizileri.</p>
        </div>
        <div className="top50-filter-toggle-container">
          <button
            className="top50-filter-toggle-btn"
            onClick={() => setShowFilters(!showFilters)}
            style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#fff', border: '1px solid #38bdf8', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontSize: '1.2em', marginRight: '4px' }}>⧩</span> {showFilters ? 'Filtreleri Gizle' : 'Filtrele & Sırala'}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="top50-filters-wrapper">
          <div className="top50-filter-group">
            <label className="top50-filter-label">Sırala</label>
            <select className="top50-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="rating">Puan (Yüksekten Düşüğe)</option>
              <option value="popularity">Popülerlik (Oy Sayısı)</option>
              <option value="newest">Yenilik (En Son Çıkanlar)</option>
            </select>
          </div>

          <div className="top50-filter-group">
            <label className="top50-filter-label">Tür</label>
            <select className="top50-select" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
              <option value="">Tüm Türler</option>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="top50-filter-group">
            <label className="top50-filter-label">Yıllar</label>
            <select className="top50-select" value={filterDecade} onChange={(e) => setFilterDecade(e.target.value)}>
              <option value="">Tüm Yıllar</option>
              {decades.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {(filterGenre || filterDecade || sortBy !== 'rating') && (
            <button className="top50-filter-clear" onClick={clearFilters}>
              <FilterX size={16} /> Temizle
            </button>
          )}
        </div>

      )}

      {loading ? (
        <div className="top50-loading">
          <div className="top50-spinner"></div>
          <p>Top listesi hazırlanıyor...</p>
        </div>
      ) : filteredAndSorted.length > 0 ? (
        <div className="top50-list">
          {filteredAndSorted.map((dizi, index) => {
            const year = dizi.first_air_date ? dizi.first_air_date.substring(0, 4) : '';
            const genreList = dizi.genres ? dizi.genres.split(',').map(g => g.trim()).slice(0, 3) : [];
            const isRank1 = sortBy === 'rating' && index === 0;

            return (
              <div
                key={dizi.series_id}
                className="top50-item"
                onClick={(e) => handleSeriesClick(dizi.series_id, e)}
              >
                {/* Rank */}
                <div className="top50-rank-container">
                  <span className="top50-rank">{index + 1}</span>
                </div>

                {/* Poster */}
                <div className="top50-poster-wrapper">
                  <PosterImage
                    path={dizi.poster_path}
                    size="w342"
                    alt={dizi.name}
                    className="top50-poster"
                    loading="lazy"
                  />
                </div>

                {/* Info */}
                <div className="top50-info">
                  <div className="top50-title-row">
                    <h2 className="top50-title">{dizi.name}</h2>
                    {year && <span className="top50-year">({year})</span>}
                  </div>

                  <div className="top50-meta">
                    <div className="top50-rating-box">
                      <Star size={14} className="top50-star" fill="currentColor" />
                      <span className="top50-rating-val">{Number(dizi.rating).toFixed(1)}</span>
                    </div>
                    <span className="top50-votes">{(parseInt(dizi.vote_count) || 0).toLocaleString('tr-TR')} Oy</span>

                    <div className="top50-genres">
                      {genreList.map(g => (
                        <span key={g} className="top50-genre-tag">{g}</span>
                      ))}
                    </div>
                  </div>

                  <p className="top50-overview">{dizi.overview}</p>
                </div>

                {/* Actions */}
                <div className="top50-actions">
                  <button
                    className={`top50-action-btn ${userActivity.watched[dizi.series_id] ? 'active watch' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleActivity(dizi.series_id, 'watched'); }}
                    title="İzlendi"
                  >
                    <Eye size={18} strokeWidth={userActivity.watched[dizi.series_id] ? 2.5 : 1.5} />
                  </button>
                  <button
                    className={`top50-action-btn ${userActivity.liked[dizi.series_id] ? 'active like' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleActivity(dizi.series_id, 'liked'); }}
                    title="Beğen"
                  >
                    <Heart size={18} strokeWidth={userActivity.liked[dizi.series_id] ? 2.5 : 1.5} fill={userActivity.liked[dizi.series_id] ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className={`top50-action-btn ${userActivity.watchlist[dizi.series_id] ? 'active wl' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleActivity(dizi.series_id, 'watchlist'); }}
                    title="Watchlist"
                  >
                    <Bookmark size={18} strokeWidth={userActivity.watchlist[dizi.series_id] ? 2.5 : 1.5} fill={userActivity.watchlist[dizi.series_id] ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="top50-empty">
          <Award size={48} className="top50-empty-icon" />
          <h3>Sonuç Bulunamadı</h3>
          <p>Seçtiğiniz filtrelere uygun dizi bulunmuyor.</p>
        </div>
      )}
    </div>
  );
}

export default Top50;