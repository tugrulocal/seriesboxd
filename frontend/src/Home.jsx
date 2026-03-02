import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
    Eye, Heart, Bookmark, ChevronLeft, ChevronRight,
    Drama, Search, Laugh, Rocket, Sword, Crosshair,
    Star, TrendingUp, Sparkles
} from 'lucide-react';
import './Home.css';

/* ========== Swipeable Row Bileşeni ========== */
function Row({ title, icon, series, onPosterClick }) {
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 10);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        checkScroll();
        el.addEventListener('scroll', checkScroll, { passive: true });
        window.addEventListener('resize', checkScroll);
        return () => {
            el.removeEventListener('scroll', checkScroll);
            window.removeEventListener('resize', checkScroll);
        };
    }, [series]);

    const scroll = (direction) => {
        const el = scrollRef.current;
        if (!el) return;
        const amount = el.clientWidth * 0.75;
        el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    };

    if (!series || series.length === 0) return null;

    return (
        <div className="home-row">
            <h2 className="row-title">{icon}{title}</h2>
            <div className="row-wrapper">
                {canScrollLeft && (
                    <button className="row-arrow row-arrow-left" onClick={() => scroll('left')}>
                        <ChevronLeft size={28} />
                    </button>
                )}
                <div className="row-posters" ref={scrollRef}>
                    {series.map((s, i) => (
                        <div key={`${title}-${s.series_id}-${i}`} className="row-item" onClick={() => onPosterClick(s)}>
                            <img
                                src={s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : 'https://via.placeholder.com/300x450?text=No+Poster'}
                                alt={s.name}
                                loading="lazy"
                            />
                            <div className="row-item-overlay">
                                <span className="row-item-name">{s.name}</span>
                                <span className="row-item-rating"><Star size={12} fill="#fbbf24" color="#fbbf24" /> {Number(s.rating).toFixed(1)}</span>
                            </div>
                        </div>
                    ))}
                </div>
                {canScrollRight && (
                    <button className="row-arrow row-arrow-right" onClick={() => scroll('right')}>
                        <ChevronRight size={28} />
                    </button>
                )}
            </div>
        </div>
    );
}

/* ========== Ana Home Bileşeni ========== */
function Home({ tumDiziler }) {
    const navigate = useNavigate();
    const { kullanici } = useAuth();

    // Hero Carousel: Birden fazla dizi arasında geçiş
    const [heroList, setHeroList] = useState([]);
    const [heroIndex, setHeroIndex] = useState(0);
    const [diziIzlendi, setDiziIzlendi] = useState(false);
    const [diziLiked, setDiziLiked] = useState(false);
    const [diziWatchlist, setDiziWatchlist] = useState(false);

    // Hero listesini bir kere oluştur
    useEffect(() => {
        if (tumDiziler.length > 0 && heroList.length === 0) {
            // backdrop_path olan top 10 diziyi seç
            const withBackdrop = tumDiziler.filter(d => d.backdrop_path).slice(0, 10);
            // Rastgele sırala
            const shuffled = [...withBackdrop].sort(() => Math.random() - 0.5);
            setHeroList(shuffled);
        }
    }, [tumDiziler, heroList.length]);

    const featured = heroList[heroIndex] || null;

    // Hero dizisi değiştiğinde aktivite durumunu çek
    const fetchActivity = useCallback(() => {
        const token = localStorage.getItem('sb_token');
        if (featured && token) {
            fetch(`http://127.0.0.1:8000/series-activity/${featured.series_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => res.ok ? res.json() : [])
                .then(data => {
                    // Backend bir array döner: ['watched', 'liked', 'watchlist']
                    setDiziIzlendi(Array.isArray(data) && data.includes('watched'));
                    setDiziLiked(Array.isArray(data) && data.includes('liked'));
                    setDiziWatchlist(Array.isArray(data) && data.includes('watchlist'));
                })
                .catch(() => {
                    setDiziIzlendi(false);
                    setDiziLiked(false);
                    setDiziWatchlist(false);
                });
        }
    }, [featured]);

    useEffect(() => {
        fetchActivity();
    }, [fetchActivity]);

    // Hero carousel ileri/geri
    const heroNext = () => {
        if (heroList.length > 0) setHeroIndex((prev) => (prev + 1) % heroList.length);
    };
    const heroPrev = () => {
        if (heroList.length > 0) setHeroIndex((prev) => (prev - 1 + heroList.length) % heroList.length);
    };

    // Aktivite toggle (Watch / Like / Watchlist)
    const seriesActivityToggle = async (activityType, currentState, setStateFunc) => {
        if (!kullanici) {
            alert("Bu özellik için giriş yapmalısınız!");
            return;
        }
        // Optimistic update
        setStateFunc(!currentState);

        const token = localStorage.getItem('sb_token');
        try {
            if (currentState) {
                // Kaldır: DELETE /series-activity/{series_id}/{activity_type}
                const res = await fetch(`http://127.0.0.1:8000/series-activity/${featured.series_id}/${activityType}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) setStateFunc(currentState);
            } else {
                // Ekle: POST /series-activity
                const res = await fetch('http://127.0.0.1:8000/series-activity', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ series_id: featured.series_id, activity_type: activityType })
                });
                if (!res.ok) setStateFunc(currentState);
            }
        } catch (e) {
            console.error(e);
            setStateFunc(currentState);
        }
    };

    const handlePosterClick = (dizi) => navigate(`/dizi/${dizi.series_id}`);

    if (!featured) return <div style={{ color: 'white', textAlign: 'center', marginTop: '80px', fontSize: '1.2rem' }}>Yükleniyor...</div>;

    // === VERİ SETLERİ ===
    const topRated = tumDiziler.slice(0, 30);
    const popular = [...tumDiziler].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)).slice(0, 30);
    const getByGenre = (genre) => tumDiziler.filter(d => d.genres && d.genres.toLowerCase().includes(genre.toLowerCase())).slice(0, 30);

    const drama = getByGenre('Dram');
    const mystery = getByGenre('Gizem');
    const comedy = getByGenre('Komedi');
    const scifi = getByGenre('Bilim Kurgu');
    const action = getByGenre('Aksiyon');
    const crime = getByGenre('Suç');

    return (
        <div className="home-container">
            {/* HERO BANNER */}
            <div
                className="home-hero"
                style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/original${featured.backdrop_path || featured.poster_path})`
                }}
            >
                <div className="hero-gradient-left"></div>
                <div className="hero-gradient-bottom"></div>

                {/* Hero Carousel Okları */}
                {heroList.length > 1 && (
                    <>
                        <button className="hero-nav hero-nav-left" onClick={heroPrev}><ChevronLeft size={36} /></button>
                        <button className="hero-nav hero-nav-right" onClick={heroNext}><ChevronRight size={36} /></button>
                        <div className="hero-dots">
                            {heroList.map((_, i) => (
                                <span key={i} className={`hero-dot ${i === heroIndex ? 'active' : ''}`} onClick={() => setHeroIndex(i)} />
                            ))}
                        </div>
                    </>
                )}

                <div className="hero-content">
                    <h1 className="hero-title">{featured.name}</h1>
                    <div className="hero-meta">
                        <span className="hero-rating"><Star size={16} fill="#f59e0b" color="#f59e0b" /> {Number(featured.rating).toFixed(1)}</span>
                        <span className="hero-votes">({(featured.vote_count || 0).toLocaleString('tr-TR')} oy)</span>
                        {featured.genres && <span className="hero-genres">{featured.genres.split(',').slice(0, 3).map(g => g.trim()).join(' · ')}</span>}
                    </div>
                    <p className="hero-overview">
                        {featured.overview
                            ? (featured.overview.length > 280 ? featured.overview.substring(0, 280) + '...' : featured.overview)
                            : "Bu dizi için henüz bir özet bulunmuyor."}
                    </p>
                    <div className="hero-buttons">
                        <button className="hero-btn-primary" onClick={() => navigate(`/dizi/${featured.series_id}`)}>
                            İncele
                        </button>
                        <div className="hero-actions">
                            <div
                                className={`hero-action-icon ${diziIzlendi ? 'active-watch' : ''}`}
                                onClick={() => seriesActivityToggle('watched', diziIzlendi, setDiziIzlendi)}
                                title={diziIzlendi ? 'İzlendi olarak işaretli' : 'İzledim olarak işaretle'}
                            >
                                <Eye size={20} strokeWidth={2} />
                            </div>
                            <div
                                className={`hero-action-icon ${diziLiked ? 'active-like' : ''}`}
                                onClick={() => seriesActivityToggle('liked', diziLiked, setDiziLiked)}
                                title={diziLiked ? 'Beğenildi' : 'Beğen'}
                            >
                                <Heart size={20} strokeWidth={2} fill={diziLiked ? 'currentColor' : 'none'} />
                            </div>
                            <div
                                className={`hero-action-icon ${diziWatchlist ? 'active-watchlist' : ''}`}
                                onClick={() => seriesActivityToggle('watchlist', diziWatchlist, setDiziWatchlist)}
                                title={diziWatchlist ? 'İzleme listesinde' : 'İzleme listesine ekle'}
                            >
                                <Bookmark size={20} strokeWidth={2} fill={diziWatchlist ? 'currentColor' : 'none'} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* YATAY KATEGORİ SATIRLARI */}
            <div className="home-rows-container">
                <Row title="Tüm Zamanların En İyileri" icon={<Star size={18} color="#f59e0b" />} series={topRated} onPosterClick={handlePosterClick} />
                <Row title="En Çok Oylananlar" icon={<TrendingUp size={18} color="#38bdf8" />} series={popular} onPosterClick={handlePosterClick} />
                <Row title="Dram Dizileri" icon={<Drama size={18} color="#a78bfa" />} series={drama} onPosterClick={handlePosterClick} />
                <Row title="Gizem Dizileri" icon={<Search size={18} color="#fb923c" />} series={mystery} onPosterClick={handlePosterClick} />
                <Row title="Komedi Dizileri" icon={<Laugh size={18} color="#facc15" />} series={comedy} onPosterClick={handlePosterClick} />
                <Row title="Bilim Kurgu & Fantezi" icon={<Rocket size={18} color="#22d3ee" />} series={scifi} onPosterClick={handlePosterClick} />
                <Row title="Aksiyon & Macera" icon={<Sword size={18} color="#f87171" />} series={action} onPosterClick={handlePosterClick} />
                <Row title="Suç Dizileri" icon={<Crosshair size={18} color="#94a3b8" />} series={crime} onPosterClick={handlePosterClick} />
            </div>
        </div>
    );
}

export default Home;
