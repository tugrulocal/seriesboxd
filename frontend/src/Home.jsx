import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Eye, Heart, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import './Home.css';

/* ========== Swipeable Row Bileşeni ========== */
function Row({ title, series, onPosterClick }) {
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
            <h2 className="row-title">{title}</h2>
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
                                src={s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : 'https://via.placeholder.com/300x450?text=Afiş+Yok'}
                                alt={s.name}
                                loading="lazy"
                            />
                            <div className="row-item-overlay">
                                <span className="row-item-name">{s.name}</span>
                                <span className="row-item-rating">⭐ {Number(s.rating).toFixed(1)}</span>
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
function Home({ tumDiziler, seciliDiziAyarla }) {
    const navigate = useNavigate();
    const { kullanici } = useAuth();

    const [featured, setFeatured] = useState(null);
    const [diziIzlendi, setDiziIzlendi] = useState(false);
    const [diziLiked, setDiziLiked] = useState(false);
    const [diziWatchlist, setDiziWatchlist] = useState(false);

    useEffect(() => {
        if (tumDiziler.length > 0 && !featured) {
            const efsaneler = tumDiziler.slice(0, 20);
            const rastgele = efsaneler[Math.floor(Math.random() * efsaneler.length)];
            setFeatured(rastgele);
        }
    }, [tumDiziler, featured]);

    useEffect(() => {
        if (kullanici && featured) {
            fetch(`http://127.0.0.1:8000/series-activity/${featured.series_id}`, {
                headers: { 'Authorization': `Bearer ${kullanici.token}` }
            })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setDiziIzlendi(data.watched);
                        setDiziLiked(data.liked);
                        setDiziWatchlist(data.watchlist);
                    } else {
                        setDiziIzlendi(false);
                        setDiziLiked(false);
                        setDiziWatchlist(false);
                    }
                })
                .catch(console.error);
        }
    }, [kullanici, featured]);

    const seriesActivityToggle = async (activityType, currentState, setStateFunc) => {
        if (!kullanici) {
            alert("Bu özellik için giriş yapmalısınız!");
            return;
        }
        setStateFunc(!currentState);
        try {
            const res = await fetch('http://127.0.0.1:8000/series-activity', {
                method: currentState ? 'DELETE' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${kullanici.token}`
                },
                body: JSON.stringify({ series_id: featured.series_id, activity_type: activityType })
            });
            if (!res.ok) setStateFunc(currentState);
        } catch (e) {
            console.error(e);
            setStateFunc(currentState);
        }
    };

    // Poster tıklanınca modal veya detay
    const handlePosterClick = (dizi) => {
        navigate(`/dizi/${dizi.series_id}`);
    };

    if (!featured) return <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>Yükleniyor...</div>;

    // === VERİ SETLERİ ===
    const topRated = tumDiziler.slice(0, 30);
    const popular = [...tumDiziler].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)).slice(0, 30);

    // Genre bazlı filtreleme (veritabanında genres sütununda virgülle ayrılmış türler var)
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

                <div className="hero-content">
                    <h1 className="hero-title">{featured.name}</h1>
                    <div className="hero-meta">
                        <span className="hero-rating">⭐ {Number(featured.rating).toFixed(1)}</span>
                        <span className="hero-votes">({(featured.vote_count || 0).toLocaleString('tr-TR')} oy)</span>
                        {featured.genres && <span className="hero-genres">{featured.genres.split(',').slice(0, 3).join(' · ')}</span>}
                    </div>
                    <p className="hero-overview">
                        {featured.overview
                            ? (featured.overview.length > 250 ? featured.overview.substring(0, 250) + '...' : featured.overview)
                            : "Bu dizi için henüz bir Türkçe özet bulunmuyor."}
                    </p>
                    <div className="hero-buttons">
                        <button className="hero-btn-primary" onClick={() => navigate(`/dizi/${featured.series_id}`)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            İncele
                        </button>
                        <div className="hero-actions">
                            <div
                                className={`hero-action-icon ${diziIzlendi ? 'active' : ''}`}
                                onClick={() => seriesActivityToggle('watched', diziIzlendi, setDiziIzlendi)}
                                title="İzledim"
                            >
                                <Eye size={22} strokeWidth={2} color={diziIzlendi ? '#10b981' : 'white'} />
                            </div>
                            <div
                                className={`hero-action-icon ${diziLiked ? 'active' : ''}`}
                                onClick={() => seriesActivityToggle('liked', diziLiked, setDiziLiked)}
                                title="Beğendim"
                            >
                                <Heart size={22} strokeWidth={2} color={diziLiked ? '#f43f5e' : 'white'} fill={diziLiked ? '#f43f5e' : 'none'} />
                            </div>
                            <div
                                className={`hero-action-icon ${diziWatchlist ? 'active' : ''}`}
                                onClick={() => seriesActivityToggle('watchlist', diziWatchlist, setDiziWatchlist)}
                                title="Listeme Ekle"
                            >
                                <Bookmark size={22} strokeWidth={2} color={diziWatchlist ? '#38bdf8' : 'white'} fill={diziWatchlist ? '#38bdf8' : 'none'} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* YATAY KATEGORİ SATIRLARI */}
            <div className="home-rows-container">
                <Row title="Tüm Zamanların En İyileri" series={topRated} onPosterClick={handlePosterClick} />
                <Row title="En Çok Oylananlar (Popüler)" series={popular} onPosterClick={handlePosterClick} />
                <Row title="🎭 Dram Dizileri" series={drama} onPosterClick={handlePosterClick} />
                <Row title="🔍 Gizem Dizileri" series={mystery} onPosterClick={handlePosterClick} />
                <Row title="😂 Komedi Dizileri" series={comedy} onPosterClick={handlePosterClick} />
                <Row title="🚀 Bilim Kurgu & Fantezi" series={scifi} onPosterClick={handlePosterClick} />
                <Row title="⚔️ Aksiyon & Macera" series={action} onPosterClick={handlePosterClick} />
                <Row title="🔫 Suç Dizileri" series={crime} onPosterClick={handlePosterClick} />
            </div>
        </div>
    );
}

export default Home;
