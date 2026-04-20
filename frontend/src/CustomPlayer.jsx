import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

const CustomPlayer = ({ sourceUrl, subtitles = [], imdbId, seasonNum, episodeNum }) => {
    const videoRef = useRef(null);
    const playerRef = useRef(null);
    const [isRawStream, setIsRawStream] = useState(false);
    const [subFontSize, setSubFontSize] = useState(() => parseInt(localStorage.getItem('sb_sub_fontsize') || '20'));
    const [subOpacity, setSubOpacity] = useState(() => parseInt(localStorage.getItem('sb_sub_opacity') || '80'));
    const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem('sb_sub_lang') || 'tr');
    const [showSubControls, setShowSubControls] = useState(false);

    // Save preferences
    useEffect(() => { localStorage.setItem('sb_sub_fontsize', subFontSize); }, [subFontSize]);
    useEffect(() => { localStorage.setItem('sb_sub_opacity', subOpacity); }, [subOpacity]);
    useEffect(() => { localStorage.setItem('sb_sub_lang', selectedLang); }, [selectedLang]);

    const isM3u8OrMp4 = sourceUrl?.includes('.m3u8') || sourceUrl?.includes('.mp4');

    useEffect(() => {
        setIsRawStream(isM3u8OrMp4);

        if (isM3u8OrMp4 && videoRef.current) {
            if (playerRef.current) {
                playerRef.current.src({ src: sourceUrl, type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4' });
                playerRef.current.play();
                return;
            }

            const videoElement = document.createElement('video-js');
            videoElement.classList.add('vjs-big-play-centered');
            videoRef.current.appendChild(videoElement);

            const player = playerRef.current = videojs(videoElement, {
                controls: true,
                autoplay: true,
                preload: 'auto',
                responsive: true,
                fluid: true,
                controlBar: {
                    children: ['playToggle', 'volumePanel', 'currentTimeDisplay', 'timeDivider', 'durationDisplay', 'progressControl', 'remainingTimeDisplay', 'subtitlesButton', 'fullscreenToggle']
                },
                sources: [{
                    src: sourceUrl,
                    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
                }]
            });

            // Add subtitle tracks
            subtitles.forEach(sub => {
                player.addRemoteTextTrack({
                    kind: 'subtitles',
                    src: sub.url,
                    srclang: sub.lang,
                    label: sub.label,
                    default: sub.lang === selectedLang
                }, false);
            });
        }
    }, [sourceUrl]);

    useEffect(() => {
        return () => {
            if (playerRef.current) {
                playerRef.current.dispose();
                playerRef.current = null;
            }
        };
    }, []);

    if (!sourceUrl) return null;

    // Filter subtitles to only show selected language
    const activeSubs = subtitles.filter(s => s.lang === selectedLang);
    const trSubs = subtitles.filter(s => s.lang === 'tr');
    const enSubs = subtitles.filter(s => s.lang === 'en');

    return (
        <div className="custom-player-wrapper">
            {/* Player Area */}
            <div className="custom-player-video">
                {isRawStream ? (
                    <div data-vjs-player style={{ width: '100%', height: '100%' }}>
                        <div ref={videoRef} />
                    </div>
                ) : (
                    <iframe
                        src={sourceUrl}
                        allowFullScreen
                        frameBorder="0"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                    />
                )}
            </div>

            {/* Bottom Controls Bar */}
            <div className="custom-player-controls">
                {/* Subtitle Language Toggle */}
                {subtitles.length > 0 && (
                    <div className="sub-lang-toggle">
                        {trSubs.length > 0 && (
                            <button className={`sub-lang-btn ${selectedLang === 'tr' ? 'active' : ''}`} onClick={() => setSelectedLang('tr')}>
                                TR
                            </button>
                        )}
                        {enSubs.length > 0 && (
                            <button className={`sub-lang-btn ${selectedLang === 'en' ? 'active' : ''}`} onClick={() => setSelectedLang('en')}>
                                EN
                            </button>
                        )}
                        <button className={`sub-lang-btn ${selectedLang === 'off' ? 'active' : ''}`} onClick={() => setSelectedLang('off')}>
                            Kapalı
                        </button>
                    </div>
                )}

                {/* Subtitle Settings */}
                {subtitles.length > 0 && (
                    <button className="sub-settings-btn" onClick={() => setShowSubControls(!showSubControls)} title="Altyazı Ayarları">
                        ⚙
                    </button>
                )}

                {/* Deep Links */}
                <div className="deep-links">
                    {sourceUrl && isRawStream && (
                        <>
                            <a href={`vlc://${sourceUrl}`} className="deep-link-btn vlc-btn" title="VLC ile Aç">
                                ▶ VLC
                            </a>
                            {imdbId && (
                                <a href={`stremio://detail/series/${imdbId}/${imdbId}:${seasonNum}:${episodeNum}`} className="deep-link-btn stremio-btn" title="Stremio'da İzle">
                                    🎬 Stremio
                                </a>
                            )}
                        </>
                    )}
                    {imdbId && !isRawStream && (
                        <a href={`stremio://detail/series/${imdbId}/${imdbId}:${seasonNum}:${episodeNum}`} className="deep-link-btn stremio-btn" title="Stremio'da İzle">
                            🎬 Stremio
                        </a>
                    )}
                </div>
            </div>

            {/* Subtitle Settings Panel */}
            {showSubControls && (
                <div className="sub-settings-panel">
                    <div className="sub-setting-row">
                        <label>Yazı Boyutu</label>
                        <input type="range" min="12" max="36" value={subFontSize} onChange={e => setSubFontSize(parseInt(e.target.value))} />
                        <span>{subFontSize}px</span>
                    </div>
                    <div className="sub-setting-row">
                        <label>Arkaplan</label>
                        <input type="range" min="0" max="100" value={subOpacity} onChange={e => setSubOpacity(parseInt(e.target.value))} />
                        <span>{subOpacity}%</span>
                    </div>
                </div>
            )}

            {/* Inline Subtitle Overlay (for iframe mode) */}
            {!isRawStream && selectedLang !== 'off' && activeSubs.length > 0 && (
                <SubtitleOverlay subtitleUrl={activeSubs[0].url} fontSize={subFontSize} opacity={subOpacity} />
            )}

            {/* Custom subtitle font style injection */}
            <style>{`
        .vjs-text-track-display .vjs-text-track-cue > div {
          font-size: ${subFontSize}px !important;
          background-color: rgba(0, 0, 0, ${subOpacity / 100}) !important;
          border-radius: 4px !important;
          padding: 2px 8px !important;
        }
      `}</style>
        </div>
    );
};

// Subtitle overlay for iframe mode — parses VTT and shows cues over the iframe
const SubtitleOverlay = ({ subtitleUrl, fontSize, opacity }) => {
    const [cues, setCues] = useState([]);
    const [currentCue, setCurrentCue] = useState('');
    const timerRef = useRef(null);
    const startRef = useRef(Date.now());

    useEffect(() => {
        if (!subtitleUrl) return;
        fetch(subtitleUrl)
            .then(r => r.text())
            .then(text => {
                const parsed = parseVTT(text);
                setCues(parsed);
                startRef.current = Date.now();
            })
            .catch(() => { });
    }, [subtitleUrl]);

    useEffect(() => {
        if (cues.length === 0) return;
        timerRef.current = setInterval(() => {
            const elapsed = (Date.now() - startRef.current) / 1000;
            const active = cues.find(c => elapsed >= c.start && elapsed <= c.end);
            setCurrentCue(active ? active.text : '');
        }, 200);
        return () => clearInterval(timerRef.current);
    }, [cues]);

    if (!currentCue) return null;
    return (
        <div className="subtitle-overlay" style={{ fontSize: `${fontSize}px`, backgroundColor: `rgba(0,0,0,${opacity / 100})` }}>
            {currentCue}
        </div>
    );
};

function parseVTT(text) {
    const lines = text.split('\n');
    const cues = [];
    let i = 0;
    while (i < lines.length) {
        if (lines[i].includes('-->')) {
            const [startStr, endStr] = lines[i].split('-->').map(s => s.trim());
            const start = timeToSec(startStr);
            const end = timeToSec(endStr);
            i++;
            let textLines = [];
            while (i < lines.length && lines[i].trim() !== '') {
                textLines.push(lines[i].trim());
                i++;
            }
            cues.push({ start, end, text: textLines.join(' ') });
        } else {
            i++;
        }
    }
    return cues;
}

function timeToSec(t) {
    const parts = t.split(':');
    if (parts.length === 3) {
        const [h, m, s] = parts;
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
    }
    if (parts.length === 2) {
        const [m, s] = parts;
        return parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
    }
    return 0;
}

export default CustomPlayer;
