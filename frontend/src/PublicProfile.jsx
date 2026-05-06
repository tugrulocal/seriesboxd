import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Profil.css';
import API_BASE from './config';
import { getRelativeTimeLabel, useRelativeTimeTicker } from './timeUtils';
import { getImageUrl } from './utils';

function PublicProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { kullanici, yukleniyor: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [recent, setRecent] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [watchedSeries, setWatchedSeries] = useState([]);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showWatchedModal, setShowWatchedModal] = useState(false);

  useRelativeTimeTicker();

  const token = localStorage.getItem('sb_token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  const isSelf = useMemo(() => {
    if (!kullanici || !profile) return false;
    return String(kullanici.username || '').toLowerCase() === String(profile.username || '').toLowerCase();
  }, [kullanici, profile]);

  useEffect(() => {
    if (!username) return;
    setLoading(true);

    const tok = localStorage.getItem('sb_token');
    const hdrs = tok ? { 'Authorization': `Bearer ${tok}` } : {};

    fetch(`${API_BASE}/u/${encodeURIComponent(username)}`, { headers: hdrs, credentials: 'include' })
      .then(res => {
        if (res.status === 404) throw new Error('not_found');
        if (!res.ok) throw new Error('error');
        return res.json();
      })
      .then(data => {
        setProfile(data.user || null);
        setFollowersCount(Number(data.followers_count || 0));
        setFollowingCount(Number(data.following_count || 0));
        setWatchedCount(Number(data.watched_series || 0));
        setIsFollowing(Boolean(data.is_following));
        setRecent(Array.isArray(data.recent_activity) ? data.recent_activity : []);
      })
      .catch((err) => {
        if (err.message === 'not_found') setProfile(null);
        else setProfile(null); // ağ hatası da null — "bulunamadı" göster
      })
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/watched-series/${encodeURIComponent(username)}`, { headers: hdrs, credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const series = Array.isArray(data) ? data : [];
        setWatchedSeries(series);
        // watched count backend /u/{username} response'undan geliyor, ama burada da güncelle
        if (series.length > 0) setWatchedCount(series.length);
      })
      .catch(() => { });
  }, [username]);

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

  const onToggleFollow = async () => {
    if (actionLoading) return;
    if (authLoading) return;
    if (!kullanici) {
      navigate('/login');
      return;
    }
    if (isSelf) return;

    setActionLoading(true);
    try {
      const method = isFollowing ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE}/follow/${encodeURIComponent(username)}`, {
        method,
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('follow');

      setIsFollowing(!isFollowing);
      setFollowersCount(prev => Math.max(0, prev + (isFollowing ? -1 : 1)));
    } catch {
      // noop
    } finally {
      setActionLoading(false);
    }
  };

  const openFollowersModal = () => {
    if (followersCount === 0) return;
    fetch(`${API_BASE}/followers/${encodeURIComponent(username)}`, { headers, credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setFollowers(Array.isArray(data) ? data : []);
        setShowFollowersModal(true);
      })
      .catch(() => { });
  };

  const openFollowingModal = () => {
    if (followingCount === 0) return;
    fetch(`${API_BASE}/following/${encodeURIComponent(username)}`, { headers, credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setFollowing(Array.isArray(data) ? data : []);
        setShowFollowingModal(true);
      })
      .catch(() => { });
  };

  const openWatchedModal = () => {
    if (watchedCount === 0) return;
    setShowWatchedModal(true);
  };

  if (loading) {
    return (
      <div className="profil-page">
        <div className="tab-loading">Yükleniyor...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profil-page">
        <p className="tab-empty" style={{ textAlign: 'left' }}>Kullanıcı bulunamadı.</p>
      </div>
    );
  }

  const joinDate = profile.created_at ? new Date(profile.created_at).toLocaleDateString('tr-TR') : null;

  return (
    <div className="profil-page">
      <div className="profil-hero">
        <div className="profil-hero-left">
          {profile.avatar ? (
            <img className="profil-avatar-large" src={profile.avatar} alt={profile.username} />
          ) : (
            <div className="profil-avatar-large">{String(profile.username || '?')[0]?.toUpperCase()}</div>
          )}

          <div className="profil-hero-info">
            <h1 className="profil-username">@{profile.username}</h1>
            {joinDate ? <div className="profil-join-date">Katılım: {joinDate}</div> : null}
            {profile.bio ? <p className="profil-bio">{profile.bio}</p> : null}

            {!isSelf ? (
              <div style={{ marginTop: 10 }}>
                <button
                  className="detail-modal-btn"
                  onClick={onToggleFollow}
                  disabled={actionLoading}
                >
                  {isFollowing ? 'Takibi Bırak' : 'Takip Et'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="profil-hero-stats">
          <div className="stat-item" onClick={openFollowersModal} style={{ cursor: followersCount > 0 ? 'pointer' : 'default', opacity: followersCount > 0 ? 1 : 0.6 }}>
            <div className="stat-value">{followersCount}</div>
            <div className="stat-label">Takipçi</div>
          </div>
          <div className="stat-item" onClick={openFollowingModal} style={{ cursor: followingCount > 0 ? 'pointer' : 'default', opacity: followingCount > 0 ? 1 : 0.6 }}>
            <div className="stat-value">{followingCount}</div>
            <div className="stat-label">Takip</div>
          </div>
          <div className="stat-item" onClick={openWatchedModal} style={{ cursor: watchedCount > 0 ? 'pointer' : 'default', opacity: watchedCount > 0 ? 1 : 0.6 }}>
            <div className="stat-value">{watchedCount}</div>
            <div className="stat-label">Dizi</div>
          </div>
        </div>
      </div>

      <div className="profil-section">
        <h3 className="section-title-lb">Son Hareketler</h3>
        {recent.length > 0 ? (
          <div className="activity-compact-list expanded">
            {recent.map((act, index) => (
              <div key={`${act.activity_type}-${act.activity_id}-${index}`} className="activity-compact-item">
                <span className="act-dot" />
                <div className="act-compact-text">
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
        ) : (
          <p className="tab-empty" style={{ textAlign: 'left' }}>Henüz aktivite yok.</p>
        )}
      </div>

      {showFollowersModal && (
        <div className="modal-overlay" onClick={() => setShowFollowersModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Takipçiler</h3>
              <button className="modal-close" onClick={() => setShowFollowersModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {followers.length > 0 ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {followers.map(user => (
                    <Link key={user.user_id} to={`/u/${user.username}`} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setShowFollowersModal(false)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {user.avatar ? <img src={user.avatar} alt={user.username} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String(user.username || '?')[0]?.toUpperCase()}</div>}
                        <div>
                          <div style={{ fontWeight: 600 }}>@{user.username}</div>
                          {user.bio ? <div style={{ fontSize: '0.9em', color: '#888', marginTop: '2px' }}>{user.bio.slice(0, 50)}{user.bio.length > 50 ? '…' : ''}</div> : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#888' }}>Takipçi yok</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showFollowingModal && (
        <div className="modal-overlay" onClick={() => setShowFollowingModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Takip Ediliyor</h3>
              <button className="modal-close" onClick={() => setShowFollowingModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {following.length > 0 ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {following.map(user => (
                    <Link key={user.user_id} to={`/u/${user.username}`} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setShowFollowingModal(false)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {user.avatar ? <img src={user.avatar} alt={user.username} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String(user.username || '?')[0]?.toUpperCase()}</div>}
                        <div>
                          <div style={{ fontWeight: 600 }}>@{user.username}</div>
                          {user.bio ? <div style={{ fontSize: '0.9em', color: '#888', marginTop: '2px' }}>{user.bio.slice(0, 50)}{user.bio.length > 50 ? '…' : ''}</div> : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#888' }}>Takip edilen yok</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showWatchedModal && (
        <div className="modal-overlay" onClick={() => setShowWatchedModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>İzlediği Diziler</h3>
              <button className="modal-close" onClick={() => setShowWatchedModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {watchedSeries.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '15px' }}>
                  {watchedSeries.map(series => (
                    <Link key={series.series_id} to={`/dizi/${series.series_id}`} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setShowWatchedModal(false)}>
                      <div style={{ borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s', textAlign: 'center' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                        {series.poster_path ? <img src={getImageUrl(series.poster_path, 'w185')} alt={series.name} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' }} /> : <div style={{ width: '100%', height: '150px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8em', textAlign: 'center', padding: '5px' }}>Poster Yok</div>}
                        <div style={{ marginTop: '8px', fontSize: '0.9em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{series.name}</div>
                        {series.rating ? <div style={{ fontSize: '0.8em', color: '#888', marginTop: '2px' }}>★{series.rating.toFixed(1)}</div> : null}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#888' }}>Henüz dizi izlenmedi</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PublicProfile;
