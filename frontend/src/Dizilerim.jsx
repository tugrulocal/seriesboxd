import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import './Dizilerim.css';

function Dizilerim() {
    const { kullanici } = useAuth();
    const navigate = useNavigate();

    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [genres, setGenres] = useState([]);
    const [services, setServices] = useState([]);

    // Filters
    const [decade, setDecade] = useState('');
    const [genre, setGenre] = useState('');
    const [service, setService] = useState('');
    const [sort, setSort] = useState('recent');

    // Dropdown open states
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownRef = useRef(null);

    const token = localStorage.getItem('sb_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const decades = ['2020s', '2010s', '2000s', '1990s', '1980s'];

    const sortOptions = [
        { value: 'recent', label: 'Son Eklenen' },
        { value: 'rating_desc', label: 'Puan (Yüksek)' },
        { value: 'rating_asc', label: 'Puan (Düşük)' },
        { value: 'name_asc', label: 'İsim (A → Z)' },
        { value: 'name_desc', label: 'İsim (Z → A)' },
        { value: 'user_score_desc', label: 'Benim Puanım' },
    ];

    useEffect(() => {
        if (!kullanici) {
            navigate('/login');
            return;
        }
        // Fetch genres and services for filter dropdowns
        Promise.all([
            fetch('http://127.0.0.1:8000/turler').then(r => r.json()),
            fetch('http://127.0.0.1:8000/services').then(r => r.json())
        ])
            .then(([g, s]) => {
                if (Array.isArray(g)) setGenres(g);
                if (Array.isArray(s)) setServices(s);
            })
            .catch(() => {});
    }, [kullanici, navigate]);

    // Fetch watched series with filters
    useEffect(() => {
        if (!kullanici) return;
        setLoading(true);
        const params = new URLSearchParams();
        if (decade) params.append('decade', decade);
        if (genre) params.append('genre', genre);
        if (service) params.append('service', service);
        params.append('sort', sort);

        fetch(`http://127.0.0.1:8000/profile/watched-series?${params}`, { headers })
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setSeries(data); })
            .catch(() => setSeries([]))
            .finally(() => setLoading(false));
    }, [kullanici, decade, genre, service, sort]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const toggleDropdown = (name) => {
        setOpenDropdown(prev => prev === name ? null : name);
    };

    const selectFilter = (type, value) => {
        if (type === 'decade') setDecade(prev => prev === value ? '' : value);
        if (type === 'genre') setGenre(prev => prev === value ? '' : value);
        if (type === 'service') setService(prev => prev === value ? '' : value);
        if (type === 'sort') setSort(value);
        setOpenDropdown(null);
    };

    const activeFilters = [decade, genre, service].filter(Boolean).length;

    const clearFilters = () => {
        setDecade('');
        setGenre('');
        setService('');
        setSort('recent');
    };

    if (!kullanici) return null;

    return (
        <div className="dizilerim-page">
            {/* Header */}
            <div className="dizilerim-header">
                <div className="dizilerim-header-left">
                    <Link to="/profil" className="dizilerim-back">
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 className="dizilerim-title">
                        <span className="dizilerim-username">{kullanici.username}</span>'ın Dizileri
                    </h1>
                    <span className="dizilerim-count">{series.length}</span>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="dizilerim-filter-bar" ref={dropdownRef}>
                {/* Decade */}
                <div className="filter-dropdown-wrapper">
                    <button
                        className={`filter-btn ${decade ? 'active' : ''}`}
                        onClick={() => toggleDropdown('decade')}
                    >
                        {decade || 'Decade'} <ChevronDown size={14} />
                    </button>
                    {openDropdown === 'decade' && (
                        <div className="filter-dropdown-menu">
                            <div
                                className={`filter-dropdown-item ${decade === '' ? 'selected' : ''}`}
                                onClick={() => selectFilter('decade', '')}
                            >
                                Tümü
                            </div>
                            {decades.map(d => (
                                <div
                                    key={d}
                                    className={`filter-dropdown-item ${decade === d ? 'selected' : ''}`}
                                    onClick={() => selectFilter('decade', d)}
                                >
                                    {d}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Genre */}
                <div className="filter-dropdown-wrapper">
                    <button
                        className={`filter-btn ${genre ? 'active' : ''}`}
                        onClick={() => toggleDropdown('genre')}
                    >
                        {genre || 'Genre'} <ChevronDown size={14} />
                    </button>
                    {openDropdown === 'genre' && (
                        <div className="filter-dropdown-menu scrollable">
                            <div
                                className={`filter-dropdown-item ${genre === '' ? 'selected' : ''}`}
                                onClick={() => selectFilter('genre', '')}
                            >
                                Tümü
                            </div>
                            {genres.map(g => (
                                <div
                                    key={g}
                                    className={`filter-dropdown-item ${genre === g ? 'selected' : ''}`}
                                    onClick={() => selectFilter('genre', g)}
                                >
                                    {g}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Service */}
                <div className="filter-dropdown-wrapper">
                    <button
                        className={`filter-btn ${service ? 'active' : ''}`}
                        onClick={() => toggleDropdown('service')}
                    >
                        {service || 'Service'} <ChevronDown size={14} />
                    </button>
                    {openDropdown === 'service' && (
                        <div className="filter-dropdown-menu scrollable">
                            <div
                                className={`filter-dropdown-item ${service === '' ? 'selected' : ''}`}
                                onClick={() => selectFilter('service', '')}
                            >
                                Tümü
                            </div>
                            {services.map(s => (
                                <div
                                    key={s}
                                    className={`filter-dropdown-item ${service === s ? 'selected' : ''}`}
                                    onClick={() => selectFilter('service', s)}
                                >
                                    {s}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sort */}
                <div className="filter-dropdown-wrapper">
                    <button
                        className={`filter-btn ${sort !== 'recent' ? 'active' : ''}`}
                        onClick={() => toggleDropdown('sort')}
                    >
                        {sortOptions.find(o => o.value === sort)?.label || 'Sort by'} <ChevronDown size={14} />
                    </button>
                    {openDropdown === 'sort' && (
                        <div className="filter-dropdown-menu">
                            {sortOptions.map(o => (
                                <div
                                    key={o.value}
                                    className={`filter-dropdown-item ${sort === o.value ? 'selected' : ''}`}
                                    onClick={() => selectFilter('sort', o.value)}
                                >
                                    {o.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {activeFilters > 0 && (
                    <button className="filter-clear-btn" onClick={clearFilters}>
                        Filtreleri Temizle
                    </button>
                )}
            </div>

            {/* Poster Grid */}
            {loading ? (
                <div className="dizilerim-loading">Yükleniyor...</div>
            ) : series.length > 0 ? (
                <div className="dizilerim-grid">
                    {series.map(s => (
                        <Link to={`/dizi/${s.series_id}`} key={s.series_id} className="dizilerim-poster-card">
                            <img
                                src={s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : ''}
                                alt={s.name}
                                loading="lazy"
                            />
                            <div className="dizilerim-poster-overlay">
                                {s.user_score ? (
                                    <span className="dizilerim-user-score">★ {s.user_score}</span>
                                ) : (
                                    <span className="dizilerim-no-score">—</span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="dizilerim-empty">
                    <p>Henüz izlenen dizi yok.</p>
                    <span>Dizileri izlendi olarak işaretlediğinde burada gözükecek.</span>
                </div>
            )}
        </div>
    );
}

export default Dizilerim;
