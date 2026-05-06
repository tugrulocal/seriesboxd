import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Profil.css';
import API_BASE from './config';
import { getRelativeTimeLabel, useRelativeTimeTicker } from './timeUtils';
import { getImageUrl } from './utils';

function Feed() {
  const { kullanici, yukleniyor: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useRelativeTimeTicker();

  const token = localStorage.getItem('sb_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  useEffect(() => {
    if (authLoading) return;
    if (!kullanici) {
      navigate('/login');
      return;
    }

    setLoading(true);
    fetch(`${API_BASE}/feed?limit=60`, { headers })
      .then(res => res.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [kullanici, authLoading, navigate]);

  const getActivityText = (act) => {
    if (act.activity_type === 'watched') {
      const ep = act.episode_number ? ` S${act.season_number}B${act.episode_number}` : '';
      return `izledi${ep}`;
    }
    if (act.activity_type === 'season_watched') {
      return `Sezon ${act.season_number} izledi`;
    }
    if (act.activity_type === 'liked') return 'beğendi';
    if (act.activity_type === 'watchlist') return 'listesine ekledi';
    if (act.activity_type === 'series_rated') return `puanladı ★${act.score}`;
    if (act.activity_type === 'episode_rated') {
      const ep = act.episode_number ? ` S${act.season_number}B${act.episode_number}` : '';
      return `bölümü puanladı${ep} ★${act.score}`;
    }
    if (act.activity_type === 'series_reviewed') return 'inceleme yazdı';
    return '';
  };

  if (!kullanici) return null;

  return (
    <div className="profil-page">
      <div className="profil-hero">
        <div className="profil-hero-left">
          <div className="profil-hero-info">
            <h1 className="profil-username feed-title" style={{ fontFamily: 'Montserrat, sans-serif' }}>Akış</h1>
            <p className="profil-bio">Takip ettiklerinin son aktiviteleri</p>
          </div>
        </div>
      </div>

      <div className="profil-section">
        <h3 className="section-title-lb feed-title" style={{ fontFamily: 'Montserrat, sans-serif' }}>Son Hareketler</h3>
        {!loading && items.length > 0 ? (
          <div className="activity-compact-list feed-list">
            {items.map((act, index) => (
              <div key={`${act.activity_type}-${act.activity_id}-${index}`} className="activity-compact-item">
                {act.poster_path && (
                  <Link to={`/dizi/${act.series_id}`} className="feed-poster-link">
                    <img 
                      className="feed-poster-thumb" 
                      src={getImageUrl(act.poster_path, 'w92')} 
                      alt={act.series_name || 'Dizi'} 
                    />
                  </Link>
                )}
                <Link className="activity-avatar-link" to={act.actor_username ? `/u/${encodeURIComponent(act.actor_username)}` : '#'} onClick={e => { if (!act.actor_username) e.preventDefault(); }}>
                  {act.actor_avatar ? (
                    <img className="activity-avatar" src={act.actor_avatar} alt={act.actor_username || 'anonim'} />
                  ) : (
                    <div className="activity-avatar activity-avatar-fallback">{String(act.actor_username || '?')[0]?.toUpperCase()}</div>
                  )}
                </Link>
                <span className="act-dot" />
                <div className="act-compact-text">
                  <Link className="act-link" to={`/u/${encodeURIComponent(act.actor_username || '')}`}>@{act.actor_username || 'anonim'}</Link>{' '}
                  {getActivityText(act)}{' '}
                  <Link className="act-link" to={`/dizi/${act.series_id}`}>{act.series_name}</Link>
                  {act.activity_type === 'series_reviewed' && act.review_text ? (
                    <span style={{ marginLeft: 6, color: 'inherit' }}>— {String(act.review_text).slice(0, 90)}{String(act.review_text).length > 90 ? '…' : ''}</span>
                  ) : null}
                </div>
                <span className="act-time">{getRelativeTimeLabel(act.created_at)}</span>
              </div>
            ))}
          </div>
        ) : !loading ? (
          <p className="tab-empty" style={{ textAlign: 'left' }}>Henüz akış boş. Birkaç kullanıcı takip etmeyi dene.</p>
        ) : null}
      </div>
    </div>
  );
}

export default Feed;
