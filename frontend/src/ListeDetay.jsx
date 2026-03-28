import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ArrowLeft, Search, Filter } from 'lucide-react';
import API_BASE from './config';
import { getImageUrl } from './utils';
import './Top50.css'; // We can reuse Top50 table/card styles if they exist, or just inline layout

function ListeDetay({ isWatchlist }) {
    const { list_id } = useParams();
    const navigate = useNavigate();
    const { kullanici } = useAuth();
    
    const [listData, setListData] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hata, setHata] = useState('');
    
    // Search/Sort/Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [sortMethod, setSortMethod] = useState('recent'); // 'recent', 'rating_desc', 'rating_asc', 'name_asc', 'name_desc'
    const [filterGenre, setFilterGenre] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    
    // Unique genres in this list
    const availableGenres = useMemo(() => {
        const genres = new Set();
        items.forEach(item => {
            if (item.genres) {
                item.genres.split(',').forEach(g => genres.add(g.trim()));
            }
        });
        return Array.from(genres).sort();
    }, [items]);

    useEffect(() => {
        if (!kullanici) {
            navigate('/login');
            return;
        }

        const token = localStorage.getItem('sb_token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const url = isWatchlist ? `${API_BASE}/profile/watchlist` : `${API_BASE}/profile/list/${list_id}`;
        
        fetch(url, { headers })
            .then(async res => {
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error("API error response:", res.status, errorText);
                    throw new Error(`Liste bulunamadı. (${res.status})`);
                }
                return res.json();
            })
            .then(data => {
                console.log("Liste verisi alındı:", data);
                if (isWatchlist) {
                    setListData({ list_name: 'İzleme Listesi' });
                    setItems(data);
                } else {
                    setListData(data);
                    setItems(data.items || []);
                }
            })
            .catch(err => {
                console.error("Fetch Hatası:", err);
                setHata(err.message);
            })
            .finally(() => setLoading(false));
    }, [isWatchlist, list_id, kullanici, navigate]);

    // Apply Filter & Sort
    const displayedItems = useMemo(() => {
        let filtered = [...items];
        
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(item => item.name.toLowerCase().includes(lowerSearch));
        }
        
        if (filterGenre) {
            filtered = filtered.filter(item => item.genres && item.genres.includes(filterGenre));
        }
        
        filtered.sort((a, b) => {
            const dateA = a.added_at ? new Date(a.added_at) : new Date(0);
            const dateB = b.added_at ? new Date(b.added_at) : new Date(0);
            const nameA = a.name || "";
            const nameB = b.name || "";
            
            if (sortMethod === 'recent') {
                return dateB - dateA;
            } else if (sortMethod === 'rating_desc') {
                return (b.rating || 0) - (a.rating || 0);
            } else if (sortMethod === 'rating_asc') {
                return (a.rating || 0) - (b.rating || 0);
            } else if (sortMethod === 'name_asc') {
                return nameA.localeCompare(nameB);
            } else if (sortMethod === 'name_desc') {
                return nameB.localeCompare(nameA);
            }
            return 0;
        });
        
        return filtered;
    }, [items, searchTerm, sortMethod, filterGenre]);

    if (loading) {
        return (
            <div style={{ paddingTop: '100px', textAlign: 'center', color: '#f8fafc' }}>
                <p>Yükleniyor...</p>
            </div>
        );
    }
    
    if (hata || !listData) {
        return (
            <div style={{ paddingTop: '100px', textAlign: 'center', color: '#f8fafc' }}>
                <Link to="/listelerim" style={{ color: '#38bdf8', textDecoration: 'none' }}>&larr; Listelerime Dön</Link>
                <h2>{hata || "Bir hata oluştu"}</h2>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: '100px', maxWidth: '1200px', margin: '0 auto', paddingBottom: '50px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 20px', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <Link to="/listelerim" style={{ color: '#cbd5e1', cursor: 'pointer' }} title="Geri">
                        <ArrowLeft size={28} />
                    </Link>
                    <h1 style={{ fontSize: '2.2rem', margin: 0, color: '#f8fafc' }}>{listData.list_name}</h1>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="search-box" style={{ 
                        display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.1)', 
                        padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                        <Search size={18} color="#94a3b8" />
                        <input 
                            type="text" 
                            placeholder="Listede ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                background: 'transparent', border: 'none', color: '#fff', 
                                outline: 'none', marginLeft: '8px', width: '150px' 
                            }} 
                        />
                    </div>
                    
                    <button 
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', 
                            background: isFilterOpen ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff',
                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease'
                        }}
                    >
                        <Filter size={18} /> Filtre/Sırala
                    </button>
                </div>
            </div>
            
            {/* Filter Panel */}
            {isFilterOpen && (
                <div style={{ 
                    background: 'rgba(30, 41, 59, 0.8)', padding: '20px', borderRadius: '12px', 
                    margin: '0 20px 20px 20px', border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex', gap: '20px', flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Sıralama</label>
                        <select 
                            value={sortMethod} 
                            onChange={(e) => setSortMethod(e.target.value)}
                            style={{ background: '#0f172a', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155' }}
                        >
                            <option value="recent">Son Eklenen</option>
                            <option value="rating_desc">Puan (Yüksek → Düşük)</option>
                            <option value="rating_asc">Puan (Düşük → Yüksek)</option>
                            <option value="name_asc">İsim (A → Z)</option>
                            <option value="name_desc">İsim (Z → A)</option>
                        </select>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Tür</label>
                        <select 
                            value={filterGenre} 
                            onChange={(e) => setFilterGenre(e.target.value)}
                            style={{ background: '#0f172a', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155' }}
                        >
                            <option value="">Tümü</option>
                            {availableGenres.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>
            )}
            
            <div style={{ padding: '0 20px' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '20px', display: 'block' }}>
                    {displayedItems.length} dizi gösteriliyor
                </span>
                
                {displayedItems.length > 0 ? (
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                        gap: '20px' 
                    }}>
                        {displayedItems.map(item => (
                            <Link to={`/dizi/${item.series_id}`} key={item.series_id} style={{ textDecoration: 'none' }}>
                                <div style={{
                                    position: 'relative', borderRadius: '12px', overflow: 'hidden',
                                    aspectRatio: '2/3', background: '#1e293b',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)', transition: 'transform 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <img
                                        src={getImageUrl(item.poster_path, 'w185')}
                                        alt={item.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0, 
                                        background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                                        padding: '40px 10px 15px 10px', display: 'flex', flexDirection: 'column'
                                    }}>
                                        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {item.name}
                                        </span>
                                        {item.rating && <span style={{ color: '#fbbf24', fontSize: '0.8rem', marginTop: '4px' }}>★ {Number(item.rating).toFixed(1)}</span>}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8' }}>
                        Dizi bulunamadı.
                    </div>
                )}
            </div>
        </div>
    );
}

export default ListeDetay;
