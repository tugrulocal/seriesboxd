import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DracarysEffect from './DracarysEffect';
import HeisenbergEffect from './HeisenbergEffect';
import MatrixEffect from './MatrixEffect';
import API_BASE from './config';
import { getImageUrl } from './utils';

const SIRALAMA_SECENEKLERI = [
    { deger: 'rating_desc', etiket: '⭐ Azalan Puan ⬇' },
    { deger: 'rating_asc', etiket: '⭐ Artan Puan ⬆' },
    { deger: 'name_asc', etiket: '🔤 İsim (A→Z)' },
    { deger: 'name_desc', etiket: '🔤 İsim (Z→A)' },
];

function SearchBar({ onSonuclar, onOpenChange, onHeisenberg }) {
    const navigate = useNavigate();
    const location = useLocation();

    const [acik, setAcik] = useState(false);
    
    useEffect(() => {
        if (onOpenChange) {
            onOpenChange(acik);
        }
    }, [acik, onOpenChange]);

    const [panelAcik, setPanelAcik] = useState(false);
    const [aramaMetni, setAramaMetni] = useState('');
    const [minPuan, setMinPuan] = useState(0);
    const [maxPuan, setMaxPuan] = useState(10);
    const [seciliTurler, setSeciliTurler] = useState([]);
    const [siralama, setSiralama] = useState('rating_desc');
    const [tumTurler, setTumTurler] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [panelKullanildi, setPanelKullanildi] = useState(false);
    const [oneriler, setOneriler] = useState([]);
    const [oneriAcik, setOneriAcik] = useState(false);
    const [dracarysActive, setDracarysActive] = useState(false);
    const [heisenbergActive, setHeisenbergActive] = useState(false);
    const [matrixActive, setMatrixActive] = useState(false);

    const containerRef = useRef(null);
    const dracarysTriggered = useRef(false);
    const heisenbergTriggered = useRef(false);
    const matrixTriggered = useRef(false);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);
    const oneriDebounceRef = useRef(null);

    // Dracarys Easter Egg
    useEffect(() => {
        if (aramaMetni.toLowerCase() === 'dracarys' && !dracarysTriggered.current) {
            dracarysTriggered.current = true;
            setDracarysActive(true);
        }
    }, [aramaMetni]);

    // Heisenberg / Baby Blue Easter Egg
    useEffect(() => {
        const q = aramaMetni.toLowerCase().trim();
        if ((q === 'heisenberg' || q === 'baby blue') && !heisenbergTriggered.current) {
            heisenbergTriggered.current = true;
            setHeisenbergActive(true);
            if (onHeisenberg) onHeisenberg(true);
        }
    }, [aramaMetni, onHeisenberg]);

    // Matrix Easter Egg
    useEffect(() => {
        const q = aramaMetni.toLowerCase().trim();
        if ((q === 'matrix' || q === 'wake up neo') && !matrixTriggered.current) {
            matrixTriggered.current = true;
            setMatrixActive(true);
        }
    }, [aramaMetni]);

    // Türleri backend'den çek
    useEffect(() => {
        fetch(`${API_BASE}/turler`)
            .then(r => r.json())
            .then(setTumTurler)
            .catch(() => { });
    }, []);

    // Dışarı tıklayınca kapat
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setPanelAcik(false);
                setOneriAcik(false);
                if (!aramaMetni) setAcik(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [aramaMetni]);

    // Arama tetikleyici (sadece submit için - Enter ya da buton tıklaması)
    const aramaYap = useCallback((q, mn, mx, turler, sir) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setYukleniyor(true);
            try {
                const params = new URLSearchParams();
                if (q) params.set('q', q);
                if (mn > 0) params.set('min_rating', mn);
                if (mx < 10) params.set('max_rating', mx);
                if (turler.length) params.set('tur', turler.join(','));
                params.set('siralama', sir);

                const res = await fetch(`${API_BASE}/arama?${params}`);
                const data = await res.json();

                const isSearchActive = panelKullanildi || !!q || mn > 0 || mx < 10 || turler.length > 0 || sir !== 'rating_desc';
                onSonuclar(data, isSearchActive);
            } catch (e) {
                console.error(e);
            } finally {
                setYukleniyor(false);
            }
        }, 0);
    }, [onSonuclar, panelKullanildi]);

    // Öneri getirici — yazan her harf için debounce 250ms, max 4 sonuç
    useEffect(() => {
        clearTimeout(oneriDebounceRef.current);
        if (!aramaMetni.trim()) {
            setOneriler([]);
            setOneriAcik(false);
            return;
        }
        oneriDebounceRef.current = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ q: aramaMetni, siralama: 'rating_desc' });
                const res = await fetch(`${API_BASE}/arama?${params}`);
                const data = await res.json();
                setOneriler(Array.isArray(data) ? data.slice(0, 4) : []);
                setOneriAcik(true);
            } catch {
                setOneriler([]);
            }
        }, 250);
        return () => clearTimeout(oneriDebounceRef.current);
    }, [aramaMetni]);

    // Filtre paneli değişince otomatik ara (filtreler için mevcut davranış korunuyor)
    useEffect(() => {
        if (!panelKullanildi) return;
        if (location.pathname !== '/') navigate('/');
        aramaYap(aramaMetni, minPuan, maxPuan, seciliTurler, siralama);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minPuan, maxPuan, seciliTurler, siralama]);

    // Arama gönder — Enter veya büyüteç butonuna basılınca
    const aramaGonder = useCallback(() => {
        if (!aramaMetni.trim()) return; // Don't search if empty

        if (inputRef.current) inputRef.current.blur();
        setOneriAcik(false);
        setAcik(false); // Make sure overlay logo comes back
        navigate(`/?q=${encodeURIComponent(aramaMetni)}`);
        if (location.pathname !== '/') {
            navigate('/');
            // navigate asenkron olduğu için küçük bir gecikme veriyoruz
            setTimeout(() => {
                aramaYap(aramaMetni, minPuan, maxPuan, seciliTurler, siralama);
            }, 80);
        } else {
            aramaYap(aramaMetni, minPuan, maxPuan, seciliTurler, siralama);
        }
    }, [aramaMetni, minPuan, maxPuan, seciliTurler, siralama, aramaYap, navigate, location.pathname]);

    const filtreAktifMi = minPuan > 0 || maxPuan < 10 || seciliTurler.length > 0 || siralama !== 'rating_desc';

    const temizle = () => {
        setAramaMetni('');
        setMinPuan(0);
        setMaxPuan(10);
        setSeciliTurler([]);
        setSiralama('rating_desc');
        setPanelKullanildi(false);
        setOneriler([]);
        setOneriAcik(false);
    };

    const oneriSec = (dizi) => {
        setOneriAcik(false); 
        navigate(`/dizi/${dizi.series_id}`); 
        setAramaMetni('');
        setAcik(false); // Close search bar on navigation
        return;
    };

    const turToggle = (tur) => {
        setPanelKullanildi(true);
        setSeciliTurler(prev =>
            prev.includes(tur) ? prev.filter(t => t !== tur) : [...prev, tur]
        );
    };

    const ikonAc = () => {
        setAcik(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    return (
        <>
            <div className="searchbar-container" ref={containerRef}>
                {/* Arama Satırı */}
                <div className={`searchbar-satir ${acik ? 'acik' : ''}`}>
                    <button
                        className="search-ikon-btn"
                        onClick={acik ? aramaGonder : ikonAc}
                        aria-label="Ara"
                    >
                        {yukleniyor
                            ? <span className="search-spinner" />
                            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        }
                    </button>

                    <input
                        ref={inputRef}
                        className="search-input"
                        type="text"
                        placeholder="Dizi ara..."
                        style={dracarysActive ? {
                            borderColor: '#ff6600',
                            borderWidth: '2px',
                            boxShadow: '0 0 30px #ff4500, 0 0 60px rgba(255,69,0,0.4), inset 0 0 12px rgba(255,60,0,0.15)',
                            animation: 'dracarysInputPulse 0.7s ease-in-out infinite',
                        } : heisenbergActive ? {
                            borderColor: '#38bdf8',
                            borderWidth: '2px',
                            boxShadow: '0 0 25px rgba(56,189,248,0.5), 0 0 50px rgba(59,130,246,0.3), inset 0 0 10px rgba(56,189,248,0.1)',
                        } : matrixActive ? {
                            borderColor: '#22c55e',
                            borderWidth: '2px',
                            boxShadow: '0 0 25px rgba(34,197,94,0.5), 0 0 50px rgba(34,197,94,0.3), inset 0 0 10px rgba(34,197,94,0.1)',
                            color: '#22c55e',
                        } : undefined}
                        value={aramaMetni}
                        onChange={e => setAramaMetni(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') aramaGonder();
                            if (e.key === 'Escape') { setOneriAcik(false); setPanelAcik(false); }
                        }}
                    />

                    {/* Filtre ikonu */}
                    {acik && (
                        <button
                            className={`filtre-ikon-btn ${filtreAktifMi ? 'aktif' : ''} ${panelAcik ? 'panel-acik' : ''}`}
                            onClick={() => setPanelAcik(p => !p)}
                            aria-label="Filtreler"
                            title="Filtreler ve Sıralama"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <line x1="4" y1="6" x2="20" y2="6" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                                <line x1="11" y1="18" x2="13" y2="18" />
                            </svg>
                            {filtreAktifMi && <span className="filtre-nokta" />}
                        </button>
                    )}

                    {acik && aramaMetni && (
                        <button className="temizle-x-btn" onClick={() => setAramaMetni('')} aria-label="Temizle">✕</button>
                    )}
                </div>

                {/* Öneri Dropdown */}
                {oneriAcik && oneriler.length > 0 && !panelAcik && (
                    <div className="oneri-dropdown">
                        {oneriler.map(dizi => (
                            <div
                                key={dizi.series_id}
                                className="oneri-item"
                                onMouseDown={e => { e.preventDefault(); oneriSec(dizi); }}
                            >
                                {dizi.poster_path
                                    ? <img
                                        className="oneri-poster"
                                        src={getImageUrl(dizi.poster_path, 'w92')}
                                        alt={dizi.name}
                                        loading="lazy"
                                    />
                                    : <div className="oneri-poster oneri-poster-placeholder" />
                                }
                                <div className="oneri-bilgi">
                                    <span className="oneri-isim">{dizi.name}</span>
                                    <span className="oneri-puan">⭐ {Number(dizi.rating).toFixed(1)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filtre Paneli */}
                {panelAcik && (
                    <div className="filtre-panel">
                        {/* Puan Aralığı */}
                        <div className="filtre-bolum">
                            <div className="filtre-baslik-satir">
                                <span className="filtre-baslik">⭐ Puan Aralığı</span>
                                <span className="filtre-deger-badge">{minPuan.toFixed(1)} – {maxPuan.toFixed(1)}</span>
                            </div>
                            <div className="range-wrapper">
                                <div className="range-track">
                                    <div
                                        className="range-fill"
                                        style={{
                                            left: `${(minPuan / 10) * 100}%`,
                                            width: `${((maxPuan - minPuan) / 10) * 100}%`
                                        }}
                                    />
                                </div>
                                <input
                                    type="range" min="0" max="10" step="0.5"
                                    value={minPuan}
                                    className="range-slider range-min"
                                    onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        if (v <= maxPuan) { setPanelKullanildi(true); setMinPuan(v); }
                                    }}
                                />
                                <input
                                    type="range" min="0" max="10" step="0.5"
                                    value={maxPuan}
                                    className="range-slider range-max"
                                    onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        if (v >= minPuan) { setPanelKullanildi(true); setMaxPuan(v); }
                                    }}
                                />
                            </div>
                            <div className="range-etiketler">
                                <span>0</span><span>5</span><span>10</span>
                            </div>
                        </div>

                        {/* Türler */}
                        {tumTurler.length > 0 && (
                            <div className="filtre-bolum">
                                <span className="filtre-baslik">🏷️ Tür</span>
                                <div className="tur-grid">
                                    {tumTurler.map(tur => (
                                        <button
                                            key={tur}
                                            className={`tur-badge ${seciliTurler.includes(tur) ? 'secili' : ''}`}
                                            onClick={() => turToggle(tur)}
                                        >
                                            {tur}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sıralama */}
                        <div className="filtre-bolum">
                            <span className="filtre-baslik">↕️ Sıralama</span>
                            <div className="siralama-grup">
                                {SIRALAMA_SECENEKLERI.map(s => (
                                    <button
                                        key={s.deger}
                                        className={`siralama-btn ${siralama === s.deger ? 'aktif' : ''}`}
                                        onClick={() => { setPanelKullanildi(true); setSiralama(s.deger); }}
                                    >
                                        {s.etiket}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Temizle */}
                        {filtreAktifMi && (
                            <button className="filtre-temizle-btn" onClick={temizle}>
                                ✕ Filtreleri Temizle
                            </button>
                        )}
                    </div>
                )}
            </div>

            {dracarysActive && (
                <DracarysEffect onDone={() => {
                    setDracarysActive(false);
                    dracarysTriggered.current = false;
                }} />
            )}

            {heisenbergActive && (
                <HeisenbergEffect onDone={() => {
                    setHeisenbergActive(false);
                    heisenbergTriggered.current = false;
                    if (onHeisenberg) onHeisenberg(false);
                }} />
            )}

            {matrixActive && (
                <MatrixEffect onDone={() => {
                    setMatrixActive(false);
                    matrixTriggered.current = false;
                }} />
            )}
        </>
    );
}

export default SearchBar;
