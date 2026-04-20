import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import PosterImage from './PosterImage';
import './Dizilerim.css';
import API_BASE from './config';

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

    // Infinite scroll — show posters in batches of 20
    const BATCH = 20;
    const [visibleCount, setVisibleCount] = useState(BATCH);
    const sentinelRef = useRef(null);

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
            fetch(`${API_BASE}/turler`).then(r => r.json()),
            fetch(`${API_BASE}/services`).then(r => r.json())
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

        fetch(`${API_BASE}/profile/watched-series?${params}`, { headers })
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setSeries(data); })
            .catch(() => setSeries([]))
            .finally(() => setLoading(false));
    }, [kullanici, decade, genre, service, sort]);

    // Reset visible count whenever the series dataset changes (filter/sort change)
    useEffect(() => {
        setVisibleCount(BATCH);
    }, [series]);

    // IntersectionObserver — load next batch when sentinel enters the viewport
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || visibleCount >= series.length) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisibleCount(prev => Math.min(prev + BATCH, series.length));
                }
            },
            { rootMargin: '300px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [series.length, visibleCount]);

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

            {/* Poster Grid — rendered in batches of 20 via infinite scroll */}
            {loading ? (
                <div className="dizilerim-loading">Yükleniyor...</div>
            ) : series.length > 0 ? (
                <>
                    <div className="dizilerim-grid">
                        {series.slice(0, visibleCount).map((s, index) => (
                            <Link to={`/dizi/${s.series_id}`} key={s.series_id} className="dizilerim-poster-card">
                                {/* First 6 posters are above-the-fold: load eagerly for LCP */}
                                <PosterImage
                                    path={s.poster_path}
                                    size="w185"
                                    alt={s.name}
                                    eager={index < 6}
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
                    {/* Sentinel element observed by IntersectionObserver to load the next batch */}
                    {visibleCount < series.length && (
                        <div ref={sentinelRef} className="dizilerim-sentinel" aria-hidden="true" />
                    )}
                </>
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
