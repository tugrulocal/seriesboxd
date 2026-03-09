import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { List, ArrowLeft, Bookmark } from 'lucide-react';
import './Profil.css';

function Listelerim() {
    const { kullanici, yukleniyor: authLoading } = useAuth();
    const navigate = useNavigate();
    const [listeler, setListeler] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [loading, setLoading] = useState(true);

    const token = localStorage.getItem('sb_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    useEffect(() => {
        if (authLoading) return;
        if (!kullanici) {
            navigate('/login');
            return;
        }

        Promise.all([
            fetch('http://127.0.0.1:8000/profile/lists-detail', { headers }).then(r => r.json()),
            fetch('http://127.0.0.1:8000/profile/watchlist', { headers })
                .then(r => r.ok ? r.json() : fetch('http://127.0.0.1:8000/profile/watchlist_preview', { headers }).then(r => r.json()))
                .catch(() => [])
        ])
            .then(([listsData, watchlistData]) => {
                if (Array.isArray(listsData)) setListeler(listsData);
                if (Array.isArray(watchlistData)) setWatchlist(watchlistData);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));

    }, [kullanici, authLoading, navigate]);

    if (!kullanici) return null;

    return (
        <div className="profil-page" style={{ paddingTop: '100px', maxWidth: '1200px', margin: '0 auto' }}>
            <div className="dizilerim-header" style={{ marginBottom: '40px' }}>
                <div className="dizilerim-header-left">
                    <Link to="/profil" className="dizilerim-back" style={{ color: '#cbd5e1', marginRight: '16px' }}>
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 style={{ fontSize: '2.2rem', margin: 0, color: '#f8fafc' }}>Benim Listelerim</h1>
                </div>
            </div>

            {loading ? (
                <div className="tab-loading">Yükleniyor...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '50px' }}>
                    {/* Watchlist Section */}
                    <div className="profil-section">
                        <h3 className="section-title-lb" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', marginBottom: '20px' }}>
                            <Bookmark size={20} color="#38bdf8" /> WATCHLIST
                        </h3>
                        {watchlist.length > 0 ? (
                            <div className="tab-poster-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                                {watchlist.map(w => (
                                    <Link to={`/dizi/${w.series_id}`} key={w.series_id} className="tab-poster-card">
                                        <img src={`https://image.tmdb.org/t/p/w300${w.poster_path}`} alt={w.name} />
                                        <div className="tab-poster-overlay">
                                            <span className="tab-poster-name">{w.name}</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="tab-empty" style={{ textAlign: 'left', padding: '20px 0' }}>Watchlist listeniz boş.</p>
                        )}
                    </div>

                    {/* Custom Lists Section */}
                    <div className="profil-section">
                        <h3 className="section-title-lb" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', marginBottom: '20px' }}>
                            <List size={20} color="#a78bfa" /> LİSTELERİMİZ
                        </h3>
                        {listeler.length > 0 ? (
                            <div className="tab-lists-grid">
                                {listeler.map(lst => (
                                    <div key={lst.list_id} className="tab-list-card">
                                        <div className="tab-list-posters">
                                            {lst.items && lst.items.length > 0 ? (
                                                lst.items.slice(0, 5).map(item => (
                                                    <img key={item.series_id} src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.name} className="tab-list-poster" />
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
                            <p className="tab-empty" style={{ textAlign: 'left', padding: '20px 0' }}>Henüz liste oluşturmadınız.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Listelerim;
