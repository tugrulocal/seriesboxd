import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Eye, Heart, Bookmark, MessageSquare, Star, X, Plus, ChevronLeft, ChevronRight, Captions, Trash2 } from 'lucide-react';
import AdFreeGuide from './AdFreeGuide';
import SubtitleOverlay from './SubtitleOverlay';
import AuthRequiredModal from './AuthRequiredModal';
import useAuthGate from './useAuthGate';
import { useAuth } from './AuthContext';
import './App.css';
import API_BASE from './config';

const SOURCE_PREF_KEY = 'sb_watch_source_pref_v2';

function getSourceKey(source) {
    return ((source?.source || source?.name || '') + '').toLowerCase();
}

function isSourceMatch(source, keyword) {
    return getSourceKey(source).includes(keyword);
}

function isPreferredSource(source) {
    const key = getSourceKey(source);
    return key.includes('vidsrc') || key.includes('vidsrcme');
}

function findPreferredSourceIndex(results) {
    const preferredOrder = ['vidsrc', 'vidsrcme'];
    for (const keyword of preferredOrder) {
        const index = results.findIndex(result => isSourceMatch(result, keyword));
        if (index >= 0) return index;
    }
    return results.length > 0 ? 0 : -1;
}

function sourceNeedsFullscreenFallback(source) {
    const key = getSourceKey(source);
    return key.includes('vidsrc') || key.includes('superembed') || key.includes('multiembed') || key.includes('hnembed');
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMinutes < 60) {
        if (diffMinutes <= 0) return 'şimdi';
        return `${diffMinutes} dakika önce`;
    } else if (diffHours < 24) {
        return `${diffHours} saat önce`;
    } else {
        return date.toLocaleDateString('tr-TR');
    }
}

function WatchPage() {
    const { id, season, episode } = useParams();
    const navigate = useNavigate();
    const {
        isAuthModalOpen,
        authModalContext,
        ensureAuth,
        closeAuthModal
    } = useAuthGate();
    const { kullanici, isAdmin } = useAuth();

    // Data State
    const [dizi, setDizi] = useState(null);
    const [sezonlar, setSezonlar] = useState([]);
    const [bolumler, setBolumler] = useState([]);
    const [izlenenBolumler, setIzlenenBolumler] = useState({});
    const [yukleniyor, setYukleniyor] = useState(true);

    // UI State
    const [seciliSezonId, setSeciliSezonId] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [reviewText, setReviewText] = useState('');
    const [spoilerVar, setSpoilerVar] = useState(false);
    const [reviewGonderiliyor, setReviewGonderiliyor] = useState(false);
    const [reviewPanelAcik, setReviewPanelAcik] = useState(false);

    // Series Activity State
    const [diziIzlendi, setDiziIzlendi] = useState(false);
    const [diziLiked, setDiziLiked] = useState(false);
    const [diziWatchlist, setDiziWatchlist] = useState(false);

    // Rating State
    const [kullaniciPuani, setKullaniciPuani] = useState(null);
    const [hoverPuani, setHoverPuani] = useState(0);
    const [bolumPuanlari, setBolumPuanlari] = useState({});
    const [hoverBolumPuani, setHoverBolumPuani] = useState(0);
    const [bolumPuanAcik, setBolumPuanAcik] = useState(false);

    // Episode Activity Maps
    const [epWatchlistMap, setEpWatchlistMap] = useState({});
    const [epLikedMap, setEpLikedMap] = useState({});

    // Season Dropdown
    const [sezonDropdownAcik, setSezonDropdownAcik] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState({});

    // List State
    const [listeMenuAcik, setListeMenuAcik] = useState(false);
    const [kullaniciListeleri, setKullaniciListeleri] = useState([]);
    const [dizininListeleri, setDizininListeleri] = useState([]);
    const [yeniListeAdi, setYeniListeAdi] = useState('');

    // Player State
    const [magnetAramaDurumu, setMagnetAramaDurumu] = useState('searching');
    const [bulunanMagnetler, setBulunanMagnetler] = useState([]);
    const [seciliMagnetIndex, setSeciliMagnetIndex] = useState(null);
    const [seciliVideoUrl, setSeciliVideoUrl] = useState(null);

    // Episode Reviews State
    const [episodeReviews, setEpisodeReviews] = useState([]);
    const [revealedSpoilers, setRevealedSpoilers] = useState(new Set());

    // Subtitle State
    const [rawSubtitles, setRawSubtitles] = useState([]);
    const [activeSub, setActiveSub] = useState(null);
    const [subLangDropdown, setSubLangDropdown] = useState(null);
    const [subDownloading, setSubDownloading] = useState(false);
    const [syncOffset, setSyncOffset] = useState(0);
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);
    const [subCueCount, setSubCueCount] = useState(0);
    const [subFontSize, setSubFontSize] = useState(1);
    const [subBottomOffset, setSubBottomOffset] = useState(10);

    // Timer & Sync State
    const [timerRunning, setTimerRunning] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Subtitle menu state
    const [subMenuOpen, setSubMenuOpen] = useState(false);
    const [showManualSyncPanel, setShowManualSyncPanel] = useState(true);

    const wrapperRef = useRef(null);
    const sezonBtnRef = useRef(null);
    const dropdownRef = useRef(null);
    const srcDropdownBtnRef = useRef(null);
    const srcDropdownMenuRef = useRef(null);
    const [srcDropdownPos, setSrcDropdownPos] = useState(null);
    const timerStartRef = useRef(null);
    const elapsedAtPauseRef = useRef(0);
    const hasPostMessageRef = useRef(false);
    const fsFallbackEnabledRef = useRef(false);
    const iframeBlurAtRef = useRef(0);

    // 1. Initial Data Load
    useEffect(() => {
        fetch(`${API_BASE}/dizi/${id}`)
            .then(res => res.json())
            .then(data => {
                if (data.dizi) {
                    setDizi(data.dizi);
                    setSezonlar(data.sezonlar || []);
                    setBolumler(data.bolumler || []);
                    const targetSeason = (data.sezonlar || []).find(s => s.season_number === parseInt(season));
                    if (targetSeason) setSeciliSezonId(targetSeason.season_id);
                }
                setYukleniyor(false);
            })
            .catch(() => setYukleniyor(false));

        const token = localStorage.getItem('sb_token');
        if (token) {
            const h = { 'Authorization': `Bearer ${token}` };
            const jh = { ...h, 'Content-Type': 'application/json' };

            fetch(`${API_BASE}/activity/${id}`, { headers: h })
                .then(r => r.json())
                .then(data => {
                    const watched = {}, watchlist = {}, liked = {};
                    if (Array.isArray(data)) {
                        data.forEach(a => {
                            if (a.activity_type === 'watched') watched[a.episode_id] = true;
                            if (a.activity_type === 'watchlist') watchlist[a.episode_id] = true;
                            if (a.activity_type === 'liked') liked[a.episode_id] = true;
                        });
                    }
                    setIzlenenBolumler(watched);
                    setEpWatchlistMap(watchlist);
                    setEpLikedMap(liked);
                })
                .catch(() => { });

            fetch(`${API_BASE}/series-activity/${id}`, { headers: h })
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setDiziIzlendi(data.includes('watched'));
                        setDiziLiked(data.includes('liked'));
                        setDiziWatchlist(data.includes('watchlist'));
                    }
                })
                .catch(() => { });

            fetch(`${API_BASE}/rating/${id}`, { headers: h })
                .then(r => r.json())
                .then(d => setKullaniciPuani(d.score))
                .catch(() => { });

            fetch(`${API_BASE}/lists`, { headers: h })
                .then(r => r.json()).then(setKullaniciListeleri).catch(() => { });

            fetch(`${API_BASE}/lists/check/${id}`, { headers: h })
                .then(r => r.json()).then(setDizininListeleri).catch(() => { });

            fetch(`${API_BASE}/episode-ratings/${id}`, { headers: h })
                .then(r => r.json()).then(setBolumPuanlari).catch(() => { });
        }

        fetch(`${API_BASE}/reviews/${id}`)
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setReviews(d); })
            .catch(() => { });
    }, [id, season]);

    // Load episode reviews when episode/season changes
    useEffect(() => {
        const epData = bolumler.find(b => b.episode_number === parseInt(episode) && b.season_id === seciliSezonId);
        if (!epData) return;
        fetch(`${API_BASE}/episode-reviews/${epData.episode_id}`)
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setEpisodeReviews(d); })
            .catch(() => { });
    }, [episode, seciliSezonId, bolumler]);

    const deleteEpisodeReview = async (reviewId) => {
        const token = ensureAuth('Yorumu silmek');
        if (!token) return;
        if (!window.confirm('Bu yorumu silmek istiyor musun?')) return;

        try {
            const res = await fetch(`${API_BASE}/episode-reviews/${reviewId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || 'Yorum silinemedi');
            }
            setEpisodeReviews(prev => prev.filter(r => r.review_id !== reviewId));
        } catch (error) {
            alert(error.message || 'Yorum silinemedi');
        }
    };

    // 2. Load Episode Video Sources
    useEffect(() => {
        // Reset player state on route change
        setMagnetAramaDurumu('searching');
        setBulunanMagnetler([]);
        setSeciliMagnetIndex(null);
        setSeciliVideoUrl(null);
        setRawSubtitles([]);
        setActiveSub(null);
        setSubLangDropdown(null);
        setSyncOffset(0);
        setSubCueCount(0);
        setTimerRunning(false);
        setElapsedSeconds(0);
        elapsedAtPauseRef.current = 0;
        hasPostMessageRef.current = false;
        setShowSourceDropdown(false);
        setShowManualSyncPanel(true);
        setSrcDropdownPos(null);
        setEpisodeReviews([]);
        setRevealedSpoilers(new Set());

        // Fetch video sources
        fetch(`${API_BASE}/api/stream/resolve/${id}/${season}/${episode}`)
            .then(r => r.json())
            .then(d => {
                if (d.results && d.results.length > 0) {
                    setBulunanMagnetler(d.results);
                    setMagnetAramaDurumu('found');
                    const savedSource = localStorage.getItem(SOURCE_PREF_KEY);
                    const savedSourceIdx = savedSource
                        ? d.results.findIndex(r => getSourceKey(r) === savedSource)
                        : -1;
                    const defaultIdx = savedSourceIdx >= 0 ? savedSourceIdx : findPreferredSourceIndex(d.results);
                    if (defaultIdx >= 0) {
                        const picked = d.results[defaultIdx];
                        setSeciliMagnetIndex(defaultIdx);
                        setSeciliVideoUrl(picked.url);
                        if (!savedSource || getSourceKey(picked) !== savedSource) {
                            try {
                                localStorage.setItem(SOURCE_PREF_KEY, getSourceKey(picked));
                            } catch (_) { }
                        }
                        setTimerRunning(true);
                    }

                    // Fetch subtitles
                    if (d.imdb_id) {
                        fetch(`${API_BASE}/api/subtitles/search/${d.imdb_id}/${season}/${episode}`)
                            .then(r => r.json())
                            .then(subData => {
                                if (subData.subtitles && subData.subtitles.length > 0) {
                                    setRawSubtitles(subData.subtitles);
                                }
                            })
                            .catch(() => { });
                    }
                } else {
                    setMagnetAramaDurumu('error');
                }
            })
            .catch(() => setMagnetAramaDurumu('error'));
    }, [id, season, episode]);

    // 3. Player Methods
    const torrentBaslat = (url, index, sourceMeta) => {
        setSeciliMagnetIndex(index);
        setSeciliVideoUrl(url);
        setSyncOffset(0);
        setElapsedSeconds(0);
        elapsedAtPauseRef.current = 0;
        hasPostMessageRef.current = false;
        setTimerRunning(true);
        if (sourceMeta) {
            try {
                localStorage.setItem(SOURCE_PREF_KEY, getSourceKey(sourceMeta));
            } catch (_) { }
        }
    };

    const toggleWrapperFullscreen = () => {
        const el = wrapperRef.current;
        if (!el) return;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFs) {
            document.exitFullscreen?.();
            document.webkitExitFullscreen?.();
            return;
        }
        el.requestFullscreen?.();
        el.webkitRequestFullscreen?.();
    };

    // Series Activity
    const seriesActivityToggle = (type, aktif, setAktif) => {
        const token = ensureAuth('Dizi aktivitesi eklemek');
        if (!token) return;
        const h = { 'Authorization': `Bearer ${token}` };
        setAktif(!aktif);
        if (!aktif) fetch(`${API_BASE}/series-activity`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: parseInt(id), activity_type: type }) });
        else fetch(`${API_BASE}/series-activity/${id}/${type}`, { method: 'DELETE', headers: h });
    };

    // Series Rating
    const puanVer = (puan) => {
        const token = ensureAuth('Diziye puan vermek');
        if (!token) return;
        setKullaniciPuani(puan);
        fetch(`${API_BASE}/rating`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: parseInt(id), score: puan }) });
    };
    const puanSil = () => {
        const token = localStorage.getItem('sb_token');
        if (!token) return;
        setKullaniciPuani(null);
        fetch(`${API_BASE}/rating/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    };

    // Episode Activity Toggles
    const episodeWatchToggle = (epId) => {
        const token = ensureAuth('Bölümü izlendi olarak işaretlemek');
        if (!token) return;
        const h = { 'Authorization': `Bearer ${token}` };
        const isWatched = !!izlenenBolumler[epId];
        setIzlenenBolumler(prev => { if (isWatched) { const n = { ...prev }; delete n[epId]; return n; } return { ...prev, [epId]: true }; });
        if (!isWatched) fetch(`${API_BASE}/activity`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: parseInt(id), season_id: seciliSezonId, episode_id: epId, activity_type: 'watched' }) });
        else fetch(`${API_BASE}/activity/${epId}/watched`, { method: 'DELETE', headers: h });
    };
    const episodeLikeToggle = (epId) => {
        const token = ensureAuth('Bölümü beğenmek');
        if (!token) return;
        const h = { 'Authorization': `Bearer ${token}` };
        const isLiked = !!epLikedMap[epId];
        setEpLikedMap(prev => { if (isLiked) { const n = { ...prev }; delete n[epId]; return n; } return { ...prev, [epId]: true }; });
        if (!isLiked) fetch(`${API_BASE}/activity`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: parseInt(id), season_id: seciliSezonId, episode_id: epId, activity_type: 'liked' }) });
        else fetch(`${API_BASE}/activity/${epId}/liked`, { method: 'DELETE', headers: h });
    };
    const episodeWatchlistToggle = (epId) => {
        const token = ensureAuth('Bölümü izleyeceklerine eklemek');
        if (!token) return;
        const h = { 'Authorization': `Bearer ${token}` };
        const isWL = !!epWatchlistMap[epId];
        setEpWatchlistMap(prev => { if (isWL) { const n = { ...prev }; delete n[epId]; return n; } return { ...prev, [epId]: true }; });
        if (!isWL) fetch(`${API_BASE}/activity`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: parseInt(id), season_id: seciliSezonId, episode_id: epId, activity_type: 'watchlist' }) });
        else fetch(`${API_BASE}/activity/${epId}/watchlist`, { method: 'DELETE', headers: h });
    };
    const toggleSezonDropdown = () => {
        if (!sezonDropdownAcik && sezonBtnRef.current) {
            const rect = sezonBtnRef.current.getBoundingClientRect();
            setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
        setSezonDropdownAcik(p => !p);
    };

    // Episode Rating
    const currentBolumPuanVer = (episodeId, puan) => {
        const token = ensureAuth('Bölüme puan vermek');
        if (!token) return;
        const h = { 'Authorization': `Bearer ${token}` };
        if (bolumPuanlari[episodeId] === puan) {
            setBolumPuanlari(prev => { const s = { ...prev }; delete s[episodeId]; return s; });
            fetch(`${API_BASE}/episode-rating/${episodeId}`, { method: 'DELETE', headers: h });
        } else {
            setBolumPuanlari(prev => ({ ...prev, [episodeId]: puan }));
            fetch(`${API_BASE}/episode-rating`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ episode_id: episodeId, score: puan }) });
        }
    };

    // List Management
    const listeToggle = (listId) => {
        const token = ensureAuth('Diziyi listeye eklemek');
        if (!token) return;
        const h = { 'Authorization': `Bearer ${token}` };
        if (dizininListeleri.includes(listId)) {
            fetch(`${API_BASE}/lists/${listId}/items/${id}`, { method: 'DELETE', headers: h })
                .then(() => setDizininListeleri(prev => prev.filter(i => i !== listId)));
        } else {
            fetch(`${API_BASE}/lists/${listId}/items`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ series_id: parseInt(id) }) })
                .then(() => setDizininListeleri(prev => [...prev, listId]));
        }
    };
    const yeniListeOlustur = () => {
        const token = localStorage.getItem('sb_token');
        if (!token || !yeniListeAdi.trim()) return;
        const jh = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        fetch(`${API_BASE}/lists`, { method: 'POST', headers: jh, body: JSON.stringify({ name: yeniListeAdi }) })
            .then(r => r.json())
            .then(l => { setKullaniciListeleri(prev => [...prev, { list_id: l.list_id, name: l.name }]); setYeniListeAdi(''); });
    };

    const downloadSubtitle = async (sub) => {
        if (activeSub?.file_id === sub.file_id) {
            setActiveSub(null);
            setSubCueCount(0);
            setSubLangDropdown(null);
            return;
        }
        setSubDownloading(true);
        setSubLangDropdown(null);
        try {
            if (sub.url) {
                setActiveSub(sub);
                setSubCueCount(0);
                if (!timerRunning) {
                    setElapsedSeconds(0);
                    elapsedAtPauseRef.current = 0;
                    setTimerRunning(true);
                }
            }
        } catch (e) {
            console.warn('Subtitle assignment failed:', e);
        } finally {
            setSubDownloading(false);
        }
    };

    // 4. Timer Hooks
    useEffect(() => {
        if (timerRunning) {
            timerStartRef.current = Date.now() - elapsedAtPauseRef.current * 1000;
            const interval = setInterval(() => {
                // Always update timer for smooth subtitle sync, even when postMessage is available
                const e = (Date.now() - timerStartRef.current) / 1000;
                setElapsedSeconds(e);
            }, 50); // Increased frequency from 200ms to 50ms for better subtitle sync
            return () => clearInterval(interval);
        } else {
            elapsedAtPauseRef.current = elapsedSeconds;
        }
    }, [timerRunning]);

    useEffect(() => {
        const active = bulunanMagnetler[seciliMagnetIndex];
        fsFallbackEnabledRef.current = sourceNeedsFullscreenFallback(active);
    }, [bulunanMagnetler, seciliMagnetIndex]);

    useEffect(() => {
        const active = bulunanMagnetler[seciliMagnetIndex];
        if (!sourceNeedsFullscreenFallback(active)) return;

        const onKeyDown = (e) => {
            if ((e.key || '').toLowerCase() !== 'f') return;
            const tag = (e.target?.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            e.preventDefault();
            toggleWrapperFullscreen();
        };

        const onWindowBlur = () => {
            if (document.activeElement?.tagName !== 'IFRAME') return;
            const now = Date.now();
            if (now - iframeBlurAtRef.current < 420) {
                toggleWrapperFullscreen();
                iframeBlurAtRef.current = 0;
            } else {
                iframeBlurAtRef.current = now;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('blur', onWindowBlur);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('blur', onWindowBlur);
        };
    }, [bulunanMagnetler, seciliMagnetIndex]);

    useEffect(() => {
        const onMessage = (event) => {
            try {
                const d = (typeof event.data === 'string') ? JSON.parse(event.data) : event.data;
                if (!d || typeof d !== 'object') return;

                let t = null;
                if (d.type === 'PLAYER_EVENT' && d.data?.event === 'timeupdate' && d.data.currentTime != null)
                    t = d.data.currentTime;
                else if (d.type === 'timeupdate' && d.detail?.plyr?.currentTime != null)
                    t = d.detail.plyr.currentTime;
                else if (d.event === 'timeupdate' && d.currentTime != null)
                    t = d.currentTime;
                else if (d.type === 'time' && d.position != null)
                    t = d.position;
                else if (d.info?.currentTime != null)
                    t = d.info.currentTime;
                else if (d.currentTime != null)
                    t = d.currentTime;

                if (t === null) {
                    try {
                        const str = JSON.stringify(d);
                        const match = str.match(/(?:"currentTime"|"seconds"|"position")\s*:\s*([\d.]+)/);
                        if (match) t = parseFloat(match[1]);
                    } catch (e) { }
                }

                if (t !== null && isFinite(t) && t >= 0) {
                    setElapsedSeconds(t);
                    timerStartRef.current = Date.now() - t * 1000;
                    elapsedAtPauseRef.current = t;
                    hasPostMessageRef.current = true;
                    setTimerRunning(prev => prev ? prev : true);
                }

                const eventName = (d.event || d.type || '').toLowerCase();
                if (eventName === 'pause') {
                    setTimerRunning(false);
                } else if (eventName === 'play' || eventName === 'playing') {
                    setTimerRunning(true);
                } else if (eventName === 'keydown' && fsFallbackEnabledRef.current) {
                    const k = (d.key || d.data?.key || '').toLowerCase();
                    if (k === 'f') toggleWrapperFullscreen();
                }
            } catch (_) { }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            const insideBtn = sezonBtnRef.current?.contains(e.target);
            const insideMenu = dropdownRef.current?.contains(e.target);
            if (!insideBtn && !insideMenu) setSezonDropdownAcik(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [sezonDropdownAcik]);

    useEffect(() => {
        if (!showSourceDropdown) return;
        const close = (e) => {
            if (srcDropdownBtnRef.current?.contains(e.target)) return;
            if (srcDropdownMenuRef.current?.contains(e.target)) return;
            setShowSourceDropdown(false);
            setSrcDropdownPos(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showSourceDropdown]);

    if (yukleniyor) return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}>Yükleniyor...</div>;
    if (!dizi) return <div style={{ color: 'red', textAlign: 'center', marginTop: '100px' }}>Dizi bulunamadı.</div>;

    const arkaplanResmi = dizi.backdrop_path ? `https://image.tmdb.org/t/p/original${dizi.backdrop_path}` : `https://image.tmdb.org/t/p/original${dizi.poster_path}`;
    const posterResmi = dizi.poster_path ? `https://image.tmdb.org/t/p/w500${dizi.poster_path}` : arkaplanResmi;
    const displayBolumler = bolumler.filter(b => b.season_id === seciliSezonId);
    const activeSource = bulunanMagnetler[seciliMagnetIndex];
    const dropdownSources = bulunanMagnetler
        .map((mag, originalIndex) => ({ mag, originalIndex }))
        .filter(item => item.mag && item.mag.name);
    const is2Embed = activeSource?.source === 'streamsrcs.2embed.cc';
    const isVidSrc = activeSource?.name?.toLowerCase().includes('vidsrc') || activeSource?.source?.toLowerCase().includes('vidsrc');
    const isSuperembed = activeSource?.name?.toLowerCase().includes('superembed') || activeSource?.source?.toLowerCase().includes('superembed');
    const isHnembed = activeSource?.name?.toLowerCase().includes('hnembed') || activeSource?.source?.toLowerCase().includes('hnembed');
    const hideOverlays = isSuperembed || isHnembed;
    // Easy toggles: keep overlay code in place but hide it for now.
    const ENABLE_SUBTITLE_OVERLAYS = false;
    const showSubtitleOverlays = ENABLE_SUBTITLE_OVERLAYS && !hideOverlays;
    const currentEpisodeData = bolumler.find(b => b.episode_number === parseInt(episode) && b.season_id === seciliSezonId);
    const genres = dizi.genres ? dizi.genres.split(',').map(g => g.trim()).filter(Boolean) : [];
    const currentEpId = currentEpisodeData?.episode_id;
    const currentEpWatched = currentEpId ? !!izlenenBolumler[currentEpId] : false;
    const currentEpLiked = currentEpId ? !!epLikedMap[currentEpId] : false;
    const currentEpWatchlist = currentEpId ? !!epWatchlistMap[currentEpId] : false;

    // Prev / Next episode navigation
    const currentPlayingSeasonId = sezonlar.find(s => s.season_number === parseInt(season))?.season_id;
    const currentPlayingSezonIndex = sezonlar.findIndex(s => s.season_id === currentPlayingSeasonId);
    const playingSezonBolumler = bolumler.filter(b => b.season_id === currentPlayingSeasonId);
    const currentEpIndex = playingSezonBolumler.findIndex(b => b.episode_number === parseInt(episode));
    let prevNavTarget = null; // { bolum, seasonId }
    let nextNavTarget = null;
    if (currentEpIndex > 0) {
        prevNavTarget = { bolum: playingSezonBolumler[currentEpIndex - 1], seasonId: currentPlayingSeasonId };
    } else if (currentPlayingSezonIndex > 0) {
        const prevSezon = sezonlar[currentPlayingSezonIndex - 1];
        const prevSezonBolumler = bolumler.filter(b => b.season_id === prevSezon.season_id);
        if (prevSezonBolumler.length > 0)
            prevNavTarget = { bolum: prevSezonBolumler[prevSezonBolumler.length - 1], seasonId: prevSezon.season_id };
    }
    if (currentEpIndex < playingSezonBolumler.length - 1 && currentEpIndex >= 0) {
        nextNavTarget = { bolum: playingSezonBolumler[currentEpIndex + 1], seasonId: currentPlayingSeasonId };
    } else if (currentPlayingSezonIndex < sezonlar.length - 1) {
        const nextSezon = sezonlar[currentPlayingSezonIndex + 1];
        const nextSezonBolumler = bolumler.filter(b => b.season_id === nextSezon.season_id);
        if (nextSezonBolumler.length > 0)
            nextNavTarget = { bolum: nextSezonBolumler[0], seasonId: nextSezon.season_id };
    }
    const goToEpisode = (target) => {
        if (!target) return;
        const sm = sezonlar.find(s => s.season_id === target.seasonId);
        if (sm) navigate(`/watch/${id}/${sm.season_number}/${target.bolum.episode_number}`);
    };

    return (
        <>
            <div className="watch-page-container">
                {/* Background Layer */}
                <div className="watch-bg-layer" style={{ backgroundImage: `url(${arkaplanResmi})` }}></div>
                <div className="watch-overlay-gradient"></div>

                <div className="watch-content-grid">
                    {/* LEFT: Player */}
                    <div className="cinematic-player-wrapper">
                        {/* Source selector floating header */}
                        {magnetAramaDurumu === 'found' && (
                            <div className="player-source-bar">
                                <span className="player-ep-badge-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    S{season}·E{episode}{currentEpisodeData?.name ? ` ${currentEpisodeData.name}` : ''}
                                </span>
                                <div className="player-guide-source-row">
                                    <AdFreeGuide />
                                    <div className="source-dropdown-wrapper">
                                    <button ref={srcDropdownBtnRef} className="source-dropdown-btn watch-src-btn" onClick={() => {
                                        if (!showSourceDropdown && srcDropdownBtnRef.current) {
                                            const r = srcDropdownBtnRef.current.getBoundingClientRect();
                                            setSrcDropdownPos({ top: r.bottom + 6, left: r.left, minWidth: r.width });
                                        } else {
                                            setSrcDropdownPos(null);
                                        }
                                        setShowSourceDropdown(s => !s);
                                    }}>
                                        <span className="source-dropdown-active">
                                            {activeSource ? `📡 ${activeSource.name}` : 'Kaynak Seç'}
                                        </span>
                                        <span className="source-dropdown-caret">▾</span>
                                    </button>

                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="player-main-area watch-player-area">
                            {is2Embed && (
                                <div className="player-info-banner">
                                    💡 Daha iyi kalite için oynatıcı içindeki ayarlardan <strong>Boba</strong> veya <strong>Wink</strong> sunucusunu seçmeniz önerilir.
                                </div>
                            )}

                            <div
                                className="subtitle-overlay-wrapper"
                                ref={wrapperRef}
                                tabIndex={-1}
                                onClick={() => { setSubMenuOpen(false); setSubLangDropdown(null); }}
                                onDoubleClick={() => {
                                    if (sourceNeedsFullscreenFallback(activeSource)) toggleWrapperFullscreen();
                                }}
                            >
                                {magnetAramaDurumu === 'searching' && (
                                    <div className="stremio-loading">
                                        <div className="stremio-spinner"></div>
                                        <p>Sunucular aranıyor...</p>
                                    </div>
                                )}
                                {magnetAramaDurumu === 'error' && (
                                    <div className="stremio-error">
                                        <AlertTriangle size={32} color="#e11d48" />
                                        <p>Bu bölüm için sunucu bulunamadı veya bir hata oluştu.</p>
                                    </div>
                                )}
                                {magnetAramaDurumu === 'found' && seciliVideoUrl && (
                                    <iframe
                                        key={seciliVideoUrl}
                                        src={seciliVideoUrl}
                                        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                                        allowFullScreen
                                        scrolling={isVidSrc ? 'no' : 'auto'}
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        frameBorder="0"
                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', overflow: 'hidden' }}
                                    />
                                )}
                                {showSubtitleOverlays && activeSub?.url && (
                                    <SubtitleOverlay
                                        key={activeSub.url}
                                        subtitleUrl={activeSub.url}
                                        elapsedSeconds={elapsedSeconds}
                                        syncOffset={syncOffset}
                                        fontSize={subFontSize}
                                        bottomOffset={subBottomOffset}
                                        onReady={(count) => setSubCueCount(count)}
                                    />
                                )}

                                {/* MANUAL SUBTITLE CONTROLS - if iframe doesn't send time events */}
                                {showSubtitleOverlays && activeSub && !hasPostMessageRef.current && showManualSyncPanel && (
                                    <div className="manual-sub-controls" onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '2px' }}>
                                            <div className="manual-sub-badge">Altyazı Zamanlayıcı</div>
                                            <button
                                                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0 4px', fontSize: '1rem' }}
                                                onClick={() => setShowManualSyncPanel(false)}
                                                title="Gizle"
                                            >✕</button>
                                        </div>
                                        <div className="manual-sub-time-row">
                                            <input
                                                type="text"
                                                className="manual-sub-time-input"
                                                value={`${Math.floor(elapsedSeconds / 60)}:${String(Math.floor(elapsedSeconds % 60)).padStart(2, '0')}`}
                                                onChange={e => {
                                                    const parts = e.target.value.split(':');
                                                    if (parts.length === 2) {
                                                        const m = parseInt(parts[0]) || 0;
                                                        const s = parseInt(parts[1]) || 0;
                                                        const total = m * 60 + s;
                                                        setElapsedSeconds(total);
                                                        elapsedAtPauseRef.current = total;
                                                        if (timerRunning) {
                                                            timerStartRef.current = Date.now() - total * 1000;
                                                        }
                                                    }
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') e.target.blur();
                                                }}
                                            />
                                        </div>
                                        <div className="manual-sub-buttons">
                                            <button onClick={() => setTimerRunning(!timerRunning)}>
                                                {timerRunning ? '⏸ Durdur' : '▶️ Başlat'}
                                            </button>
                                            <button onClick={() => {
                                                setElapsedSeconds(e => Math.max(0, e - 5));
                                                elapsedAtPauseRef.current = Math.max(0, elapsedSeconds - 5);
                                                if (timerRunning) timerStartRef.current += 5000;
                                            }}>-5sn</button>
                                            <button onClick={() => {
                                                setElapsedSeconds(e => Math.max(0, e - 1));
                                                elapsedAtPauseRef.current = Math.max(0, elapsedSeconds - 1);
                                                if (timerRunning) timerStartRef.current += 1000;
                                            }}>-1sn</button>
                                            <button onClick={() => {
                                                setElapsedSeconds(e => e + 1);
                                                elapsedAtPauseRef.current = elapsedSeconds + 1;
                                                if (timerRunning) timerStartRef.current -= 1000;
                                            }}>+1sn</button>
                                            <button onClick={() => {
                                                setElapsedSeconds(e => e + 5);
                                                elapsedAtPauseRef.current = elapsedSeconds + 5;
                                                if (timerRunning) timerStartRef.current -= 5000;
                                            }}>+5sn</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── SUBTITLE ICON OVERLAY ── */}
                                {showSubtitleOverlays && rawSubtitles.length > 0 && (
                                    <div className="sub-icon-overlay" onClick={e => e.stopPropagation()}>
                                        <button
                                            className={`sub-icon-btn${activeSub ? ' sub-icon-on' : ''}${subMenuOpen ? ' sub-icon-open' : ''}`}
                                            onClick={() => setSubMenuOpen(o => !o)}
                                            title="Altyazı Ayarları"
                                        >
                                            <Captions size={28} />
                                        </button>
                                        {subMenuOpen && (
                                            <div className="sub-icon-dropdown">
                                                {/* Off */}
                                                <button
                                                    className={`sub-menu-item${!activeSub ? ' active' : ''}`}
                                                    onClick={() => { setActiveSub(null); setSubCueCount(0); setSubLangDropdown(null); }}
                                                >
                                                    Kapalı
                                                </button>
                                                {/* TR */}
                                                {rawSubtitles.some(s => s.lang === 'tr') && (
                                                    <>
                                                        <button
                                                            className={`sub-menu-item${subLangDropdown === 'tr' ? ' lang-open' : ''}${activeSub?.lang === 'tr' ? ' active-lang' : ''}`}
                                                            onClick={() => setSubLangDropdown(d => d === 'tr' ? null : 'tr')}
                                                        >
                                                            <img src="https://flagcdn.com/16x12/tr.png" width="16" height="12" alt="TR" style={{ marginRight: '5px', borderRadius: '2px', flexShrink: 0 }} />Türkçe <span className="sub-menu-arrow">{subLangDropdown === 'tr' ? '▾' : '›'}</span>
                                                        </button>
                                                        {subLangDropdown === 'tr' && (
                                                            <div className="sub-files-submenu">
                                                                {rawSubtitles.filter(s => s.lang === 'tr').map((s, i) => (
                                                                    <button key={s.file_id ?? i}
                                                                        className={`sub-file-item${activeSub?.file_id === s.file_id ? ' active' : ''}`}
                                                                        onClick={() => { downloadSubtitle(s); setSubMenuOpen(false); setSubLangDropdown(null); }}
                                                                    >
                                                                        <span className="sub-file-num">{i + 1}</span>
                                                                        <span className="sub-file-name" title={s.release}>{s.release}</span>
                                                                        <span className="sub-file-dl">↓{(s.download_count || 0).toLocaleString()}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                                {/* EN */}
                                                {rawSubtitles.some(s => s.lang === 'en') && (
                                                    <>
                                                        <button
                                                            className={`sub-menu-item${subLangDropdown === 'en' ? ' lang-open' : ''}${activeSub?.lang === 'en' ? ' active-lang' : ''}`}
                                                            onClick={() => setSubLangDropdown(d => d === 'en' ? null : 'en')}
                                                        >
                                                            <img src="https://flagcdn.com/16x12/gb.png" width="16" height="12" alt="EN" style={{ marginRight: '5px', borderRadius: '2px', flexShrink: 0 }} />İngilizce <span className="sub-menu-arrow">{subLangDropdown === 'en' ? '▾' : '›'}</span>
                                                        </button>
                                                        {subLangDropdown === 'en' && (
                                                            <div className="sub-files-submenu">
                                                                {rawSubtitles.filter(s => s.lang === 'en').map((s, i) => (
                                                                    <button key={s.file_id ?? i}
                                                                        className={`sub-file-item${activeSub?.file_id === s.file_id ? ' active' : ''}`}
                                                                        onClick={() => { downloadSubtitle(s); setSubMenuOpen(false); setSubLangDropdown(null); }}
                                                                    >
                                                                        <span className="sub-file-num">{i + 1}</span>
                                                                        <span className="sub-file-name" title={s.release}>{s.release}</span>
                                                                        <span className="sub-file-dl">↓{(s.download_count || 0).toLocaleString()}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                                {/* Sync — only when a subtitle is active */}
                                                {activeSub && subCueCount > 0 && (
                                                    <div className="sub-sync-row">
                                                        <span className="sub-sync-label">SYNC</span>
                                                        <button className="sub-sync-step" onClick={() => setSyncOffset(o => +(o - 1).toFixed(1))}>-1s</button>
                                                        <span className="sub-sync-val">{syncOffset >= 0 ? `+${syncOffset}` : syncOffset}s</span>
                                                        <button className="sub-sync-step" onClick={() => setSyncOffset(o => +(o + 1).toFixed(1))}>+1s</button>
                                                    </div>
                                                )}
                                                {activeSub && subCueCount > 0 && (
                                                    <div className="sub-settings-panel">
                                                        <div className="sub-setting-row">
                                                            <span className="sub-setting-label">Boyut:</span>
                                                            <input type="range" min="0.5" max="2" step="0.1" value={subFontSize} onChange={e => setSubFontSize(parseFloat(e.target.value))} />
                                                        </div>
                                                        <div className="sub-setting-row">
                                                            <span className="sub-setting-label">Konum:</span>
                                                            <input type="range" min="0" max="40" step="1" value={subBottomOffset} onChange={e => setSubBottomOffset(parseInt(e.target.value))} />
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Timer reopen — only for players without postMessage */}
                                                {activeSub && !hasPostMessageRef.current && !showManualSyncPanel && (
                                                    <button
                                                        className="sub-menu-item sub-timer-btn"
                                                        onClick={() => { setShowManualSyncPanel(true); setSubMenuOpen(false); }}
                                                    >
                                                        ⏱ Zamanlayıcı
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Info + Episode Panel */}
                    <div className="watch-info-panel">
                        {/* Backdrop with fade */}
                        <div className="wip-backdrop" style={{ backgroundImage: `url(${arkaplanResmi})` }}></div>
                        <div className="wip-backdrop-fade"></div>

                        <div className="wip-scroll">
                            {/* Poster + Title + Meta */}
                            <div className="wip-header">
                                <img className="wip-poster" src={posterResmi} alt={dizi.name} onClick={() => navigate(`/dizi/${id}`)} />
                                <div className="wip-meta">
                                    <h2 className="wip-title" onClick={() => navigate(`/dizi/${id}`)}>{dizi.name}</h2>
                                    <div className="wip-rating">
                                        <Star size={13} fill="#f59e0b" color="#f59e0b" />
                                        <span>{Number(dizi.rating || 0).toFixed(1)}</span>
                                        <span className="wip-votes">({(dizi.vote_count || 0).toLocaleString('tr-TR')})</span>
                                    </div>
                                    <div className="wip-genres">
                                        {genres.slice(0, 3).map(g => <span key={g} className="wip-genre-tag">{g}</span>)}
                                    </div>
                                </div>
                            </div>

                            {/* Current episode */}
                            <div className="wip-ep-label">
                                <span className="wip-ep-badge">S{season} · E{episode}</span>
                                {currentEpisodeData?.name && <span className="wip-ep-name">{currentEpisodeData.name}</span>}
                                {currentEpisodeData?.vote_average ? (
                                    <span style={{ color: '#38bdf8', marginLeft: '8px', fontWeight: 'bold' }}>
                                        ★ {Number(currentEpisodeData.vote_average).toFixed(1)}
                                    </span>
                                ) : null}
                            </div>

                            {/* Season + Episode Dropdown */}
                            <div className="wip-season-selector-container">
                                <button ref={sezonBtnRef} className="wip-season-btn" onClick={toggleSezonDropdown}>
                                    <span>{sezonlar.find(s => s.season_id === seciliSezonId)?.name || 'Sezon Seç'}</span>
                                    <span className="wip-season-caret">{sezonDropdownAcik ? '▴' : '▾'}</span>
                                </button>
                            </div>

                            {/* Overview */}
                            <p className="wip-overview">
                                {currentEpisodeData?.overview || dizi.overview || 'Özet bulunmuyor.'}
                            </p>

                            {/* Action Buttons - Episode Level */}
                            <div className="wip-action-row">
                                <button className={`wip-action-btn ${currentEpWatched ? 'wip-act-on wip-act-watch' : ''}`}
                                    onClick={() => currentEpId && episodeWatchToggle(currentEpId)}
                                    title={currentEpWatched ? 'İzlendi' : 'İzledim'}>
                                    <Eye size={17} strokeWidth={currentEpWatched ? 2.5 : 1.5} />
                                    <span>İZLEDİM</span>
                                </button>
                                <button className={`wip-action-btn ${currentEpLiked ? 'wip-act-on wip-act-like' : ''}`}
                                    onClick={() => currentEpId && episodeLikeToggle(currentEpId)}
                                    title={currentEpLiked ? 'Beğenildi' : 'Beğen'}>
                                    <Heart size={17} strokeWidth={currentEpLiked ? 2.5 : 1.5} fill={currentEpLiked ? 'currentColor' : 'none'} />
                                    <span>BEĞENDİM</span>
                                </button>
                                <button className={`wip-action-btn ${currentEpWatchlist ? 'wip-act-on wip-act-wl' : ''}`}
                                    onClick={() => currentEpId && episodeWatchlistToggle(currentEpId)}
                                    title={currentEpWatchlist ? 'Watchlist\'te' : 'Watchlist\'e ekle'}>
                                    <Bookmark size={17} strokeWidth={currentEpWatchlist ? 2.5 : 1.5} fill={currentEpWatchlist ? 'currentColor' : 'none'} />
                                    <span>İZLEYECEĞİM</span>
                                </button>
                                <button className={`wip-action-btn ${reviewPanelAcik ? 'wip-act-on' : ''}`}
                                    onClick={() => setReviewPanelAcik(p => !p)}>
                                    <MessageSquare size={17} />
                                    <span>Yorum</span>
                                </button>
                            </div>

                            {/* Inline Review Panel */}
                            {reviewPanelAcik && (
                                <div className="wip-review-panel">
                                    <textarea
                                        className="wip-review-textarea"
                                        placeholder="Bu bölüm hakkında ne düşünüyorsun?"
                                        value={reviewText}
                                        onChange={e => setReviewText(e.target.value)}
                                        rows={3}
                                    />
                                    <div className="wip-review-controls">
                                        <label className="spoiler-label">
                                            <input type="checkbox" checked={spoilerVar} onChange={e => setSpoilerVar(e.target.checked)} />
                                            <AlertTriangle size={12} /> Spoiler
                                        </label>
                                        <button className="wip-review-gonder-btn" disabled={!reviewText.trim() || reviewGonderiliyor}
                                            onClick={async () => {
                                                const token = ensureAuth('Bölüme yorum göndermek');
                                                if (!token) return;
                                                if (!currentEpId) return;
                                                setReviewGonderiliyor(true);
                                                try {
                                                    await fetch(`${API_BASE}/episode-reviews`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ episode_id: currentEpId, review_text: reviewText, contains_spoiler: spoilerVar }) });
                                                    const r = await fetch(`${API_BASE}/episode-reviews/${currentEpId}`);
                                                    const d = await r.json();
                                                    if (Array.isArray(d)) setEpisodeReviews(d);
                                                    setReviewText(''); setSpoilerVar(false);
                                                } catch (e) { console.error(e); }
                                                setReviewGonderiliyor(false);
                                            }}>
                                            {reviewGonderiliyor ? 'Gönderiliyor...' : 'Gönder'}
                                        </button>
                                    </div>
                                    {/* Episode Reviews */}
                                    {episodeReviews.length > 0 && (
                                        <div className="wip-ep-reviews">
                                            {episodeReviews.map(r => (
                                                <div key={r.review_id} className="wip-ep-review-item">
                                                    <div className="review-meta">
                                                        <div className="review-meta-main">
                                                            <span className="review-user">@{r.username || 'anonim'}</span>
                                                            <span className="review-tarih">{formatTimeAgo(r.created_at)}</span>
                                                        </div>
                                                        {kullanici && (kullanici.user_id === r.user_id || isAdmin) && (
                                                            <button
                                                                type="button"
                                                                className="review-delete-btn"
                                                                onClick={() => deleteEpisodeReview(r.review_id)}
                                                                title="Yorumu sil"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {r.contains_spoiler ? (
                                                        <div className={`spoiler-blur-wrapper${revealedSpoilers.has(r.review_id) ? ' revealed' : ''}`}
                                                            onClick={() => setRevealedSpoilers(prev => { const n = new Set(prev); n.has(r.review_id) ? n.delete(r.review_id) : n.add(r.review_id); return n; })}>
                                                            <p className="review-text spoiler-text">{r.review_text}</p>
                                                            {!revealedSpoilers.has(r.review_id) && (
                                                                <div className="spoiler-overlay">
                                                                    <AlertTriangle size={14} />
                                                                    Spoiler İçeriyor — Görmek İçin Tıkla
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="review-text">{r.review_text}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Episode Rating */}
                            {currentEpId && (
                                <div className="wip-rate-section">
                                    <span className="wip-section-label">BÖLÜMÜ PUANLA</span>
                                    <div className="wip-stars" onMouseLeave={() => setHoverBolumPuani(0)}>
                                        {[...Array(10)].map((_, i) => (
                                            <span key={i}
                                                className={`wip-star ${(i + 1) <= (hoverBolumPuani || bolumPuanlari[currentEpId]) ? 'dolu' : ''}`}
                                                onMouseEnter={() => setHoverBolumPuani(i + 1)}
                                                onClick={() => currentBolumPuanVer(currentEpId, i + 1)}>★</span>
                                        ))}
                                    </div>
                                    {bolumPuanlari[currentEpId] && (
                                        <div className="wip-puan-info">
                                            <span>{bolumPuanlari[currentEpId]}/10</span>
                                            <button className="wip-puan-sil" onClick={() => {
                                                setBolumPuanlari(prev => { const n = { ...prev }; delete n[currentEpId]; return n; });
                                                const token = localStorage.getItem('sb_token');
                                                if (token) fetch(`${API_BASE}/episode-rating/${currentEpId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                                            }}><X size={12} /> Geri Al</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Add to List */}
                            <div className="wip-liste-container">
                                <button className="wip-liste-btn" onClick={() => setListeMenuAcik(p => !p)}>
                                    <Plus size={14} /> Listeye Ekle
                                </button>
                                {listeMenuAcik && (
                                    <div className="liste-popup wip-liste-popup">
                                        {kullaniciListeleri.map(liste => (
                                            <div key={liste.list_id} className="liste-satir" onClick={() => listeToggle(liste.list_id)}>
                                                <input type="checkbox" className="liste-checkbox" checked={dizininListeleri.includes(liste.list_id)} readOnly />
                                                <span className="liste-adi">{liste.name}</span>
                                            </div>
                                        ))}
                                        <div className="yeni-liste-form">
                                            <input type="text" className="yeni-liste-input" placeholder="Yeni liste..." value={yeniListeAdi} onChange={e => setYeniListeAdi(e.target.value)} />
                                            <button className="liste-ekle-btn" onClick={yeniListeOlustur}>+</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Prev / Next episode glassmorphic navigation */}
                            <div className="ep-nav-below-panel">
                                <button
                                    className="ep-nav-glass-btn"
                                    disabled={!prevNavTarget}
                                    onClick={() => prevNavTarget && goToEpisode(prevNavTarget)}
                                >
                                    <ChevronLeft size={14} /> Önceki Bölüm
                                </button>
                                <button
                                    className="ep-nav-glass-btn"
                                    disabled={!nextNavTarget}
                                    onClick={() => nextNavTarget && goToEpisode(nextNavTarget)}
                                >
                                    Sonraki Bölüm <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Season + Episode dropdown — rendered here to escape backdrop-filter stacking context */}
            {sezonDropdownAcik && (
                <div className="wip-ep-dropdown" style={dropdownStyle} ref={dropdownRef}>
                    <div className="wip-ep-dropdown-seasons">
                        {sezonlar.map(s => (
                            <button key={s.season_id}
                                className={`wip-ep-season-btn ${s.season_id === seciliSezonId ? 'active' : ''}`}
                                onClick={() => setSeciliSezonId(s.season_id)}>
                                {s.name}
                            </button>
                        ))}
                    </div>
                    <div className="wip-ep-dropdown-list">
                        {displayBolumler.map(bolum => {
                            const isCurrent = parseInt(episode) === bolum.episode_number && seciliSezonId === currentPlayingSeasonId;
                            const isWatched = !!izlenenBolumler[bolum.episode_id];
                            return (
                                <div key={bolum.episode_id}
                                    className={`wip-dd-ep ${isCurrent ? 'current' : ''}`}
                                    onClick={() => {
                                        const seasonModel = sezonlar.find(s => s.season_id === seciliSezonId);
                                        if (seasonModel && !isCurrent) {
                                            navigate(`/watch/${id}/${seasonModel.season_number}/${bolum.episode_number}`);
                                            setSezonDropdownAcik(false);
                                        }
                                    }}>
                                    <span className="wip-dd-ep-num">{bolum.episode_number}</span>
                                    <span className="wip-dd-ep-title">{bolum.name || `Bölüm ${bolum.episode_number}`}</span>
                                    <div className="wip-dd-ep-status">
                                        {isWatched && !isCurrent && <Check size={12} className="ep-watched-icon" />}
                                        {isCurrent && <div className="now-playing-indicator"><div className="bar1" /><div className="bar2" /><div className="bar3" /></div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Source dropdown portal — outside cinematic-player-wrapper to clear overflow:hidden */}
            {showSourceDropdown && srcDropdownPos && (
                <div
                    ref={srcDropdownMenuRef}
                    className="source-dropdown-menu src-portal-menu"
                    style={{ position: 'fixed', top: srcDropdownPos.top, left: srcDropdownPos.left, minWidth: srcDropdownPos.minWidth, zIndex: 9999 }}
                    onClick={e => e.stopPropagation()}
                >
                    {dropdownSources.map(({ mag, originalIndex }) => (
                        <button
                            key={originalIndex}
                            className={`source-dropdown-item ${seciliMagnetIndex === originalIndex ? 'active' : ''}`}
                            onClick={() => { torrentBaslat(mag.url, originalIndex, mag); setShowSourceDropdown(false); setSrcDropdownPos(null); }}
                        >
                            <span className="source-dropdown-name">
                                {mag.type === 'primary' ? '⭐ ' : ''}{mag.name}
                            </span>
                            {mag.badge && mag.badge.split(',').map(b => {
                                const trimB = b.trim();
                                const badgeClass = trimB.toLowerCase() === '1080p' ? 'badge-hd' : 'badge-sd';
                                return (
                                    <span key={trimB} className={`source-quality-badge ${badgeClass}`}>
                                        {trimB}
                                    </span>
                                );
                            })}
                        </button>
                    ))}
                </div>
            )}

            <AuthRequiredModal
                isOpen={isAuthModalOpen}
                contextText={authModalContext}
                onClose={closeAuthModal}
            />
        </>
    );
}

export default WatchPage;
