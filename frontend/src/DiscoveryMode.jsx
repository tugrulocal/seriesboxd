import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Eye, Heart, Bookmark, Info, ChevronLeft, ChevronRight, X } from 'lucide-react';
import API_BASE from './config';
import './DiscoveryMode.css';

function DiscoveryMode() {
    const { kullanici } = useAuth();
    const navigate = useNavigate();
    const [cards, setCards] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [sessionStats, setSessionStats] = useState({ liked: 0, passed: 0 });
    const [showSummary, setShowSummary] = useState(false);
    const [direction, setDirection] = useState(null);
    const [cardHistory, setCardHistory] = useState([]);
    const constraintsRef = useRef(null);

    // Modal state
    const [seciliDizi, setSeciliDizi] = useState(null);
    const [kapanisAnimasyonu, setKapanisAnimasyonu] = useState(false);

    // Card activity states
    const [cardActivities, setCardActivities] = useState({});

    // Fetch cards
    useEffect(() => {
        fetchCards();
    }, []);

    // Fetch user activities for current cards
    useEffect(() => {
        if (kullanici && cards.length > 0) {
            fetchCardActivities();
        }
    }, [cards, kullanici]);

    const fetchCards = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('sb_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            const res = await fetch(`${API_BASE}/api/discovery/next`, {
                headers,
                credentials: 'include'
            });

            if (res.ok) {
                const data = await res.json();
                setCards(data.series || []);
                setCurrentIndex(0);
                setCardHistory([]);
            }
        } catch (err) {
            console.error('Discovery fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCardActivities = async () => {
        const token = localStorage.getItem('sb_token');
        if (!token) return;

        const activities = {};
        for (const card of cards) {
            try {
                const res = await fetch(`${API_BASE}/series-activity/${card.series_id}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    credentials: 'include'
                });
                if (res.ok) {
                    const data = await res.json();
                    activities[card.series_id] = {
                        watched: data.includes('watched'),
                        liked: data.includes('liked')
                    };
                }
            } catch (err) {
                // Ignore errors for individual cards
            }
        }
        setCardActivities(activities);
    };

    const handleSwipe = async (swipeDirection, isPermanent = true) => {
        if (currentIndex >= cards.length) return;

        const currentCard = cards[currentIndex];
        setDirection(swipeDirection);

        // Save swipe to backend if logged in
        if (kullanici) {
            try {
                const token = localStorage.getItem('sb_token');
                await fetch(`${API_BASE}/api/discovery/swipe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        series_id: currentCard.series_id,
                        direction: swipeDirection,
                        is_permanent: isPermanent
                    })
                });
            } catch (err) {
                console.error('Swipe save error:', err);
            }
        }

        // Update session stats
        setSessionStats(prev => ({
            ...prev,
            liked: swipeDirection === 'right' ? prev.liked + 1 : prev.liked,
            passed: swipeDirection === 'left' ? prev.passed + 1 : prev.passed
        }));

        // Save to history for back navigation
        setCardHistory(prev => [...prev, { index: currentIndex, card: currentCard }]);

        // Move to next card
        setTimeout(() => {
            setDirection(null);
            const nextIndex = currentIndex + 1;

            if (nextIndex >= cards.length) {
                if (cards.length < 20) {
                    setShowSummary(true);
                } else {
                    fetchCards();
                }
            } else {
                setCurrentIndex(nextIndex);
            }
        }, 300);
    };

    const handleNext = () => {
        // Next button - not permanent skip, can show again
        handleSwipe('next', false);
    };

    const handlePrevious = () => {
        if (cardHistory.length === 0) return;

        const lastHistory = cardHistory[cardHistory.length - 1];
        setCardHistory(prev => prev.slice(0, -1));
        setCurrentIndex(lastHistory.index);

        // Update stats if needed
        setSessionStats(prev => ({
            ...prev,
            liked: prev.liked > 0 && direction === 'right' ? prev.liked - 1 : prev.liked,
            passed: prev.passed > 0 && direction === 'left' ? prev.passed - 1 : prev.passed
        }));
    };

    const toggleActivity = async (activityType) => {
        if (!kullanici) {
            alert('Bu özellik için giriş yapmalısınız.');
            return;
        }

        const currentCard = cards[currentIndex];
        const token = localStorage.getItem('sb_token');
        const currentActivity = cardActivities[currentCard.series_id]?.[activityType];

        try {
            if (currentActivity) {
                await fetch(`${API_BASE}/series-activity/${currentCard.series_id}/${activityType}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                    credentials: 'include'
                });
            } else {
                await fetch(`${API_BASE}/series-activity`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        series_id: currentCard.series_id,
                        activity_type: activityType
                    })
                });
            }

            setCardActivities(prev => ({
                ...prev,
                [currentCard.series_id]: {
                    ...prev[currentCard.series_id],
                    [activityType]: !currentActivity
                }
            }));
        } catch (err) {
            console.error('Activity toggle error:', err);
        }
    };

    const openModal = (card) => {
        setSeciliDizi(card);
    };

    const closeModal = (route = null) => {
        setKapanisAnimasyonu(true);
        setTimeout(() => {
            setKapanisAnimasyonu(false);
            setSeciliDizi(null);
            if (route) navigate(route);
        }, 300);
    };

    const resetDiscovery = async () => {
        if (!kullanici) return;

        try {
            const token = localStorage.getItem('sb_token');
            await fetch(`${API_BASE}/api/discovery/reset`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            setShowSummary(false);
            setSessionStats({ liked: 0, passed: 0 });
            fetchCards();
        } catch (err) {
            console.error('Reset error:', err);
        }
    };

    // Summary Screen
    if (showSummary) {
        return (
            <div className="discovery-container">
                <div className="discovery-summary">
                    <div className="summary-icon">
                        <span className="confetti">&#127881;</span>
                    </div>
                    <h1 className="summary-title">Harika!</h1>
                    <p className="summary-subtitle">
                        Listene <span className="highlight">{sessionStats.liked}</span> yeni dizi ekledin
                    </p>

                    <div className="summary-stats">
                        <div className="stat-item liked">
                            <span className="stat-number">{sessionStats.liked}</span>
                            <span className="stat-label">Beğendim</span>
                        </div>
                        <div className="stat-item passed">
                            <span className="stat-number">{sessionStats.passed}</span>
                            <span className="stat-label">Pas</span>
                        </div>
                    </div>

                    <div className="summary-actions">
                        <button className="btn-primary" onClick={() => navigate('/dizilerim?tab=watchlist')}>
                            İzleme Listesine Git
                        </button>
                        {kullanici && (
                            <button className="btn-secondary" onClick={resetDiscovery}>
                                Tekrar Keşfet
                            </button>
                        )}
                        <button className="btn-outline" onClick={() => navigate('/')}>
                            Ana Sayfaya Dön
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Loading State
    if (loading) {
        return (
            <div className="discovery-container">
                <div className="discovery-loading">
                    <div className="loading-spinner"></div>
                    <p>Diziler yükleniyor...</p>
                </div>
            </div>
        );
    }

    // No cards left
    if (cards.length === 0 || currentIndex >= cards.length) {
        return (
            <div className="discovery-container">
                <div className="discovery-empty">
                    <span className="empty-icon">&#128253;</span>
                    <h2>Tüm dizileri gördünüz!</h2>
                    <p>Koleksiyondaki tüm dizileri keşfettiniz.</p>
                    {kullanici && (
                        <button className="btn-primary" onClick={resetDiscovery}>
                            Sıfırla ve Tekrar Başlat
                        </button>
                    )}
                    <button className="btn-outline" onClick={() => navigate('/')}>
                        Ana Sayfaya Dön
                    </button>
                </div>
            </div>
        );
    }

    const currentCard = cards[currentIndex];
    const currentActivities = cardActivities[currentCard?.series_id] || {};

    return (
        <div className="discovery-container">
            <div className="discovery-header">
                <h1 className="discovery-title">Keşfet</h1>
                <p className="discovery-subtitle">Sağa kaydırarak watchlist'e ekle, sola kaydırarak geç</p>
            </div>

            <div className="card-stack-container" ref={constraintsRef}>
                {/* Background cards for stack effect */}
                {cards.slice(currentIndex + 1, currentIndex + 3).map((card, idx) => (
                    <div
                        key={card.series_id}
                        className="stack-card"
                        style={{
                            transform: `scale(${1 - (idx + 1) * 0.05}) translateY(${(idx + 1) * 10}px)`,
                            zIndex: 10 - idx
                        }}
                    >
                        <img
                            src={`https://image.tmdb.org/t/p/w500${card.poster_path}`}
                            srcSet={`https://image.tmdb.org/t/p/w342${card.poster_path} 342w, https://image.tmdb.org/t/p/w500${card.poster_path} 500w, https://image.tmdb.org/t/p/w780${card.poster_path} 780w`}
                            sizes="(max-width: 640px) 342px, (max-width: 1024px) 500px, 780px"
                            alt={card.name}
                            loading="lazy"
                            className="card-poster"
                        />
                    </div>
                ))}

                {/* Active card */}
                <SwipeCard
                    key={currentCard.series_id}
                    card={currentCard}
                    onSwipe={handleSwipe}
                    direction={direction}
                    onInfoClick={() => openModal(currentCard)}
                    onWatchedClick={() => toggleActivity('watched')}
                    onLikedClick={() => toggleActivity('liked')}
                    isWatched={currentActivities.watched}
                    isLiked={currentActivities.liked}
                />
            </div>

            {/* Action Buttons */}
            <div className="discovery-actions">
                <button
                    className="action-btn pass-btn"
                    onClick={() => handleSwipe('left')}
                    aria-label="Pas geç"
                >
                    <X strokeWidth={3} />
                </button>

                <button
                    className="action-btn like-btn"
                    onClick={() => handleSwipe('right')}
                    aria-label="İzleme listesine ekle"
                >
                    <Bookmark strokeWidth={2} />
                </button>
            </div>

            {/* Progress indicator with navigation */}
            <div className="discovery-progress">
                <button
                    className="progress-nav-btn"
                    onClick={handlePrevious}
                    disabled={cardHistory.length === 0}
                    aria-label="Önceki"
                >
                    <ChevronLeft />
                </button>
                <span className="progress-text">{currentIndex + 1} / {cards.length}</span>
                <button
                    className="progress-nav-btn"
                    onClick={handleNext}
                    disabled={currentIndex >= cards.length - 1}
                    aria-label="Sonraki"
                >
                    <ChevronRight />
                </button>
            </div>

            {/* Detail Modal */}
            {seciliDizi && (
                <div
                    className={`modal-arkaplan ${kapanisAnimasyonu ? 'arkaplan-gizle' : ''}`}
                    onClick={() => closeModal()}
                >
                    <div
                        className={`modal-icerik ${kapanisAnimasyonu ? 'modal-gizle' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className="kapat-butonu" onClick={() => closeModal()}>✕</button>
                        <img
                            src={`https://image.tmdb.org/t/p/w342${seciliDizi.poster_path}`}
                            srcSet={`https://image.tmdb.org/t/p/w185${seciliDizi.poster_path} 185w, https://image.tmdb.org/t/p/w342${seciliDizi.poster_path} 342w, https://image.tmdb.org/t/p/w500${seciliDizi.poster_path} 500w`}
                            sizes="(max-width: 640px) 185px, (max-width: 1024px) 342px, 500px"
                            alt={seciliDizi.name}
                            className="modal-poster"
                            decoding="async"
                        />
                        <div className="modal-metin">
                            <h2>{seciliDizi.name}</h2>
                            <div className="puan-ve-buton">
                                <span className="modal-puan">⭐ {Number(seciliDizi.rating).toFixed(1)}</span>
                                <button
                                    className="detay-butonu"
                                    onClick={() => closeModal(`/dizi/${seciliDizi.series_id}`)}
                                >
                                    Detay
                                </button>
                            </div>
                            <div className="modal-ayirici"></div>
                            <p>{seciliDizi.overview || 'Bu dizi için henüz bir açıklama bulunmuyor.'}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Swipe Card Component with framer-motion
function SwipeCard({ card, onSwipe, direction, onInfoClick, onWatchedClick, onLikedClick, isWatched, isLiked }) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-300, 0, 300], [-30, 0, 30]);
    const opacity = useTransform(x, [-300, -150, 0, 150, 300], [0.5, 1, 1, 1, 0.5]);

    // Swipe indicators opacity
    const likeOpacity = useTransform(x, [0, 100], [0, 1]);
    const passOpacity = useTransform(x, [-100, 0], [1, 0]);

    const handleDragEnd = (event, info) => {
        const threshold = 100;

        if (info.offset.x > threshold) {
            animate(x, 500, { duration: 0.3 });
            onSwipe('right');
        } else if (info.offset.x < -threshold) {
            animate(x, -500, { duration: 0.3 });
            onSwipe('left');
        } else {
            animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
        }
    };

    // Animate out when direction is set programmatically
    useEffect(() => {
        if (direction === 'right') {
            animate(x, 500, { duration: 0.3 });
        } else if (direction === 'left') {
            animate(x, -500, { duration: 0.3 });
        } else if (direction === 'next') {
            animate(x, 500, { duration: 0.3 });
        }
    }, [direction, x]);

    const year = card.first_air_date ? new Date(card.first_air_date).getFullYear() : '';

    return (
        <motion.div
            className="swipe-card"
            style={{ x, rotate, opacity }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={handleDragEnd}
        >
            {/* Like indicator */}
            <motion.div className="swipe-indicator like" style={{ opacity: likeOpacity }}>
                LİSTEYE EKLE
            </motion.div>

            {/* Pass indicator */}
            <motion.div className="swipe-indicator pass" style={{ opacity: passOpacity }}>
                PAS
            </motion.div>

            <div className="card-image-container">
                <img
                    src={`https://image.tmdb.org/t/p/w500${card.poster_path}`}
                    srcSet={`https://image.tmdb.org/t/p/w342${card.poster_path} 342w, https://image.tmdb.org/t/p/w500${card.poster_path} 500w, https://image.tmdb.org/t/p/w780${card.poster_path} 780w`}
                    sizes="(max-width: 640px) 342px, (max-width: 1024px) 500px, 780px"
                    alt={card.name}
                    loading="lazy"
                    className="card-poster"
                />
                <div className="card-gradient"></div>
            </div>

            {/* Card side action buttons */}
            <div className="card-side-actions">
                <button
                    className={`card-action-btn ${isLiked ? 'active-liked' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onLikedClick(); }}
                    aria-label="Beğendim"
                >
                    <Heart fill={isLiked ? 'currentColor' : 'none'} />
                </button>
                <button
                    className={`card-action-btn ${isWatched ? 'active-watched' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onWatchedClick(); }}
                    aria-label="İzledim"
                >
                    <Eye />
                </button>
            </div>

            <div className="card-info" onClick={onInfoClick}>
                <h2 className="card-title">{card.name}</h2>
                <div className="card-meta">
                    {card.rating && (
                        <span className="card-rating">
                            <span className="star">&#9733;</span> {Number(card.rating).toFixed(1)}
                        </span>
                    )}
                    <button
                        className="card-info-btn"
                        onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
                        aria-label="Detay"
                    >
                        <Info />
                    </button>
                    {year && <span className="card-year">{year}</span>}
                </div>
                {card.genres && (
                    <div className="card-genres">
                        {card.genres.split(',').slice(0, 3).map((genre, idx) => (
                            <span key={idx} className="genre-tag">{genre.trim()}</span>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export default DiscoveryMode;
