import { useEffect, useState } from 'react';
import API_BASE from './config';

/**
 * Parses a WebVTT string into an array of { start, end, text } cues (in seconds).
 */
function parseVTT(vttText) {
    const cues = [];
    const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let i = 0;

    function timeToSeconds(ts) {
        const parts = ts.trim().split(':');
        if (parts.length === 3) {
            return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return 0;
    }

    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
            const [startStr, endStr] = line.split('-->');
            const start = timeToSeconds(startStr);
            // End part may have positioning tags after timestamp; take only first token
            const endClean = endStr.trim().split(/\s+/)[0];
            const end = timeToSeconds(endClean);

            const textLines = [];
            i++;
            while (i < lines.length && lines[i].trim() !== '') {
                // Strip VTT HTML tags like <b>, <i>, <c.colorname>, <00:00:00.000>
                textLines.push(lines[i].replace(/<[^>]+>/g, '').trim());
                i++;
            }
            if (textLines.length > 0 && end > start) {
                cues.push({ start, end, text: textLines.filter(Boolean).join('\n') });
            }
        }
        i++;
    }
    return cues;
}

/**
 * SubtitleOverlay — renders subtitles as an absolute overlay on the iframe.
 *
 * Props:
 *   subtitleUrl    — proxied VTT URL (or null/undefined to hide)
 *   elapsedSeconds — current playback time (managed by parent DiziDetay)
 *   syncOffset     — ±seconds shift (user controlled)
 *   onReady        — callback(cueCount) when cues are loaded
 */
export default function SubtitleOverlay({ subtitleUrl, elapsedSeconds = 0, syncOffset = 0, onReady }) {
    const [cues, setCues] = useState([]);
    const [status, setStatus] = useState('idle'); // idle | loading | ready | error

    useEffect(() => {
        if (!subtitleUrl) {
            setCues([]);
            setStatus('idle');
            return;
        }

        setStatus('loading');
        const fetchUrl = subtitleUrl.startsWith('http') ? subtitleUrl : `${API_BASE}${subtitleUrl}`;
        fetch(fetchUrl)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            })
            .then(text => {
                console.log('[SubtitleOverlay] Raw (first 500 chars):', JSON.stringify(text.substring(0, 500)));
                const parsed = parseVTT(text);
                setCues(parsed);
                setStatus('ready');
                console.log(
                    `[SubtitleOverlay] Loaded ${parsed.length} cues.`,
                    parsed.length > 0 ? `First: ${parsed[0].start}s → ${parsed[0].end}s` : 'No cues!'
                );
                if (onReady) onReady(parsed.length);
            })
            .catch(err => {
                console.warn('[SubtitleOverlay] Failed to load subtitles:', err);
                setStatus('error');
            });
    }, [subtitleUrl]);

    const adjustedTime = elapsedSeconds + syncOffset;
    const activeCue = cues.find(c => adjustedTime >= c.start && adjustedTime < c.end);

    // Always render the container so it's in the DOM; content is conditional
    return (
        <div
            className="subtitle-text-layer"
            aria-live="polite"
            style={{ zIndex: 9999, pointerEvents: 'none' }}
        >
            {activeCue && (
                <div className="subtitle-text">
                    {activeCue.text.split('\n').map((line, i) => (
                        <span key={i} style={{ display: 'block' }}>{line}</span>
                    ))}
                </div>
            )}
        </div>
    );
}
