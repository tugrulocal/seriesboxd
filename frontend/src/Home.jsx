import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
    Eye, Heart, Bookmark, ChevronLeft, ChevronRight,
    Drama, Search, Laugh, Rocket, Sword, Crosshair,
    Star, TrendingUp, Sparkles
} from 'lucide-react';
import './Home.css';
import API_BASE from './config';

// Helper: Detect if path is full URL or TMDB path
const getImageUrl = (path, size = 'w185') => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
};

/* ========== Genres to exclude from HeroBanner ========== */
const EXCLUDED_GENRES = [
    'belgesel', 'documentary', 'talk show', 'reality', 'biyografi', 'biography', 'game show'
];

function isExcluded(genres = '') {
    const lower = genres.toLowerCase();
    return EXCLUDED_GENRES.some(ex => lower.includes(ex));
}

/* ========== Loop-scroll Row Bileşeni ========== */
const ITEM_W = 160; // item width (150px) + gap (10px)

function Row({ title, icon, series, onPosterClick }) {
    const scrollRef = useRef(null);

    // displayItems copies the series block 5 times:
    // This allows infinite scrolling left or right since we reset to center on edges
    const numCopies = 5;
    const realIndexStart = Math.floor(numCopies / 2); // 7 
    
    const displayItems = series.length > 0
        ? Array(numCopies).fill(series).flat()
        : series;

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || series.length === 0) return;
        requestAnimationFrame(() => {
            // Start at the middle block 
            const blockWidth = series.length * ITEM_W;
            el.scrollLeft = realIndexStart * blockWidth;
        });
    }, [series, realIndexStart]);

    const scroll = (direction) => {
        const el = scrollRef.current;
        if (!el) return;
        
        const blockWidth = series.length * ITEM_W;
        const jumpAmount = el.clientWidth * 0.75;
        
        // Target scroll position
        let newScrollLeft = direction === 'right' 
            ? el.scrollLeft + jumpAmount 
            : el.scrollLeft - jumpAmount;

        // Smoothly scroll to the new location
        el.scrollTo({ left: newScrollLeft, behavior: 'smooth' });

        // Wait for smooth scroll, then silently snap to center zone if near edges
        setTimeout(() => {
            if (!scrollRef.current) return;
            const currentEl = scrollRef.current;
            const centerLeft = realIndexStart * blockWidth;
            const safeMin = centerLeft - blockWidth;
            const safeMax = centerLeft + blockWidth * 2;
            
            if (currentEl.scrollLeft < safeMin || currentEl.scrollLeft > safeMax) {
                const relativeOffset = currentEl.scrollLeft % blockWidth;
                currentEl.style.scrollBehavior = 'auto'; // Disable animation
                currentEl.scrollLeft = centerLeft + relativeOffset;
                // Re-enable native scroll mapping behavior if any
                setTimeout(() => { currentEl.style.scrollBehavior = 'smooth'; }, 50); 
            }
        }, 450);
    };

    if (!series || series.length === 0) return null;

    return (
        <div className="home-row">
            <h2 className="row-title">{icon}{title}</h2>
            <div className="row-wrapper">
                <button className="row-arrow row-arrow-left" onClick={() => scroll('left')}>
                    <ChevronLeft size={28} />
                </button>
                <div className="row-posters" ref={scrollRef}>
                    {displayItems.map((s, i) => (
                        <div key={`${title}-${i}`} className="row-item" onClick={() => onPosterClick(s)}>
                            <img
                                src={s.poster_path ? getImageUrl(s.poster_path, 'w342') : 'https://via.placeholder.com/342x513?text=No+Poster'}
                                srcSet={s.poster_path ? `${getImageUrl(s.poster_path, 'w185')} 185w, ${getImageUrl(s.poster_path, 'w342')} 342w, ${getImageUrl(s.poster_path, 'w500')} 500w` : undefined}
                                sizes="(max-width: 640px) 185px, (max-width: 1024px) 342px, 500px"
                                alt={s.name}
                                loading="lazy"
                                decoding="async"
                            />
                            <div className="row-item-overlay">
                                <span className="row-item-name">{s.name}</span>
                                <span className="row-item-rating"><Star size={12} fill="#fbbf24" color="#fbbf24" /> {Number(s.rating).toFixed(1)}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="row-arrow row-arrow-right" onClick={() => scroll('right')}>
                    <ChevronRight size={28} />
                </button>
            </div>
        </div>
    );
}

/* ========== Ana Home Bileşeni ========== */
function Home({ tumDiziler }) {
    const navigate = useNavigate();
    const { kullanici } = useAuth();

    // Hero Carousel state
    const [heroList, setHeroList] = useState([]);
    const [heroIndex, setHeroIndex] = useState(0);
    const [heroLoading, setHeroLoading] = useState(true);
    const [diziIzlendi, setDiziIzlendi] = useState(false);
    const [diziLiked, setDiziLiked] = useState(false);
    const [diziWatchlist, setDiziWatchlist] = useState(false);

    // Pointer swipe tracking ref
    const swipeStartX = useRef(null);

    // Fetch guard to prevent multiple fetches
    const fetchTriggered = useRef(false);

    // Build hero list: fetch from admin API, fallback to random selection
    useEffect(() => {
        // Zaten dolu veya fetch başladıysa çık
        if (heroList.length > 0) return;
        if (fetchTriggered.current) return;

        // tumDiziler hazır değilse bekle (fallback için gerekli)
        if (tumDiziler.length === 0) return;

        fetchTriggered.current = true;

        fetch(`${API_BASE}/hero-series`)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setHeroList(data);
                } else {
                    // Fallback: random selection from top 100
                    const filtered = tumDiziler
                        .slice(0, 100)
                        .filter(d => d.backdrop_path && !isExcluded(d.genres || ''));
                    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
                    setHeroList(shuffled.slice(0, 15));
                }
            })
            .catch(() => {
                // On error, use fallback
                const filtered = tumDiziler
                    .slice(0, 100)
                    .filter(d => d.backdrop_path && !isExcluded(d.genres || ''));
                const shuffled = [...filtered].sort(() => Math.random() - 0.5);
                setHeroList(shuffled.slice(0, 15));
            })
            .finally(() => setHeroLoading(false));
    }, [tumDiziler, heroList.length]);

    const featured = heroList[heroIndex] || null;

    // Hero dizisi değiştiğinde aktivite durumunu çek
    const fetchActivity = useCallback(() => {
        const token = localStorage.getItem('sb_token');
        if (featured && token) {
            fetch(`${API_BASE}/series-activity/${featured.series_id}`, {
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
    const heroNext = useCallback(() => {
        if (heroList.length > 0) setHeroIndex(prev => (prev + 1) % heroList.length);
    }, [heroList.length]);

    const heroPrev = useCallback(() => {
        if (heroList.length > 0) setHeroIndex(prev => (prev - 1 + heroList.length) % heroList.length);
    }, [heroList.length]);

    // Auto-rotation: 20s, resets on manual navigation
    useEffect(() => {
        if (heroList.length <= 1) return;
        const timer = setInterval(heroNext, 20000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heroList.length, heroIndex]);

    // Pointer swipe handlers
    const handlePointerDown = (e) => { swipeStartX.current = e.clientX; };
    const handlePointerUp = (e) => {
        if (swipeStartX.current === null) return;
        const delta = e.clientX - swipeStartX.current;
        if (delta > 50) heroPrev();
        else if (delta < -50) heroNext();
        swipeStartX.current = null;
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
                const res = await fetch(`${API_BASE}/series-activity/${featured.series_id}/${activityType}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) setStateFunc(currentState);
            } else {
                // Ekle: POST /series-activity
                const res = await fetch(`${API_BASE}/series-activity`, {
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

    if (!featured) return null;

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
            {/* HERO BANNER - Only show when loaded */}
            {!heroLoading && featured && (
            <div
                className="home-hero"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                style={{ touchAction: 'pan-y', userSelect: 'none' }}
            >
                {/* Animated backdrop — key forces CSS animation restart on every index change */}
                <div
                    key={heroIndex}
                    className="hero-backdrop"
                    style={{ backgroundImage: `url(${getImageUrl(featured.backdrop_path || featured.poster_path, 'original')})` }}
                />

                <div className="hero-gradient-left" />
                <div className="hero-gradient-bottom" />

                {heroList.length > 1 && (
                    <>
                        <button className="hero-nav hero-nav-left" onClick={heroPrev}><ChevronLeft size={36} /></button>
                        <button className="hero-nav hero-nav-right" onClick={heroNext}><ChevronRight size={36} /></button>
                        <div className="hero-dots">
                            {heroList.map((_, i) => (
                                <span
                                    key={i}
                                    className={`hero-dot ${i === heroIndex ? 'active' : ''}`}
                                    onClick={() => setHeroIndex(i)}
                                />
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
            )}

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
