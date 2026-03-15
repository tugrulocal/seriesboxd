import { useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

/* ── Randomised crystal data ── */
function useCrystals(count = 120) {
    return useMemo(() =>
        Array.from({ length: count }, (_, i) => ({
            id: i,
            left: `${1 + Math.random() * 98}%`,
            size: 14 + Math.random() * 28,
            duration: 2.0 + Math.random() * 3.5,
            delay: Math.random() * 3.5,
            rotation: Math.random() * 360,
            hue: 190 + Math.random() * 30,
            lightness: 55 + Math.random() * 25,
            opacity: 0.65 + Math.random() * 0.35,
        })),
    []);
}

/* ── Breaking Bad theme — Web Audio API synthesis ── */
function playBBTheme() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.35, ctx.currentTime);
        master.connect(ctx.destination);

        // BB intro: twangy low guitar riff in D
        // Notes: D3, F3, A3, D4, C4, A3, F3, D3 (simplified iconic motif)
        const notes = [
            { freq: 146.83, start: 0.0,  dur: 0.45 },  // D3
            { freq: 174.61, start: 0.5,  dur: 0.35 },  // F3
            { freq: 220.00, start: 0.9,  dur: 0.35 },  // A3
            { freq: 293.66, start: 1.3,  dur: 0.50 },  // D4
            { freq: 261.63, start: 1.9,  dur: 0.30 },  // C4
            { freq: 220.00, start: 2.3,  dur: 0.35 },  // A3
            { freq: 174.61, start: 2.7,  dur: 0.40 },  // F3
            { freq: 146.83, start: 3.2,  dur: 0.70 },  // D3 (sustain)
            // Second phrase — darker
            { freq: 138.59, start: 4.1,  dur: 0.40 },  // C#3
            { freq: 146.83, start: 4.6,  dur: 0.35 },  // D3
            { freq: 164.81, start: 5.0,  dur: 0.30 },  // E3
            { freq: 174.61, start: 5.4,  dur: 0.50 },  // F3
            { freq: 146.83, start: 6.0,  dur: 0.90 },  // D3 (long)
        ];

        notes.forEach(({ freq, start, dur }) => {
            // Main oscillator — sawtooth for that gritty guitar tone
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

            // Distortion via waveshaper
            const distortion = ctx.createWaveShaper();
            const curve = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                const x = (i * 2) / 256 - 1;
                curve[i] = (Math.PI + 3.4) * x / (Math.PI + 3.4 * Math.abs(x));
            }
            distortion.curve = curve;

            // Filter — low pass for muffled desert tone
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, ctx.currentTime + start);
            filter.Q.setValueAtTime(2, ctx.currentTime + start);

            // Envelope
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, ctx.currentTime + start);
            env.gain.linearRampToValueAtTime(0.5, ctx.currentTime + start + 0.03);
            env.gain.setValueAtTime(0.5, ctx.currentTime + start + dur * 0.5);
            env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);

            osc.connect(distortion);
            distortion.connect(filter);
            filter.connect(env);
            env.connect(master);

            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur + 0.05);
        });

        // Global fade out
        master.gain.setValueAtTime(0.35, ctx.currentTime + 6.0);
        master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 7.2);

        // Cleanup
        setTimeout(() => ctx.close(), 8000);
        return ctx;
    } catch {
        return null;
    }
}

/* ─────────────────────────────────────────────────────────
   HeisenbergEffect — Breaking Bad Blue Crystal Rain
   • 120 blue crystal shapes falling from top
   • Subtle blue smoke/fog overlay
   • Blue tinted screen
   • BB theme music via Web Audio API
   Calls onDone() after 7000 ms.
───────────────────────────────────────────────────────── */
export default function HeisenbergEffect({ onDone }) {
    const doneRef = useRef(false);
    const audioRef = useRef(null);
    const crystals = useCrystals();

    useEffect(() => {
        audioRef.current = playBBTheme();

        const t = setTimeout(() => {
            if (!doneRef.current) { doneRef.current = true; onDone(); }
        }, 7000);
        return () => {
            clearTimeout(t);
            if (audioRef.current && audioRef.current.state !== 'closed') {
                try { audioRef.current.close(); } catch {}
            }
        };
    }, [onDone]);

    return createPortal(
        <>
            <style>{`
                @keyframes heisenbergCrystalFall {
                    0%   { transform: translateY(-60px) rotate(var(--crystal-rot)) scale(0.4); opacity: 0; }
                    6%   { opacity: var(--crystal-opacity); }
                    70%  { opacity: calc(var(--crystal-opacity) * 0.5); }
                    100% { transform: translateY(108vh) rotate(calc(var(--crystal-rot) + 200deg)) scale(0.7); opacity: 0; }
                }
                @keyframes heisenbergSmoke {
                    0%   { opacity: 0; transform: scale(1) translateY(0); }
                    25%  { opacity: 0.22; }
                    65%  { opacity: 0.15; }
                    100% { opacity: 0; transform: scale(1.15) translateY(-8vh); }
                }
            `}</style>

            {/* ── Blue tint overlay ── */}
            <motion.div
                style={{
                    position: 'fixed', inset: 0,
                    background: 'radial-gradient(ellipse at center, rgba(0, 140, 255, 0.14) 0%, rgba(0, 60, 180, 0.10) 60%, transparent 100%)',
                    zIndex: 9999,
                    pointerEvents: 'none',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 1, 0] }}
                transition={{ duration: 6.5, times: [0, 0.12, 0.5, 0.78, 1], ease: 'easeInOut' }}
            />

            {/* ── Blue smoke / fog ── */}
            <motion.div
                style={{
                    position: 'fixed', inset: 0,
                    zIndex: 10000,
                    pointerEvents: 'none',
                    background: `
                        radial-gradient(ellipse 120% 60% at 20% 80%, rgba(56, 189, 248, 0.18) 0%, transparent 70%),
                        radial-gradient(ellipse 100% 50% at 80% 70%, rgba(59, 130, 246, 0.14) 0%, transparent 65%),
                        radial-gradient(ellipse 80% 40% at 50% 90%, rgba(96, 165, 250, 0.12) 0%, transparent 60%)
                    `,
                    filter: 'blur(40px)',
                    animation: 'heisenbergSmoke 7s ease-in-out forwards',
                }}
            />

            {/* ── Falling crystals ── */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 10001, pointerEvents: 'none', overflow: 'hidden' }}>
                {crystals.map(c => (
                    <div key={c.id} style={{
                        position: 'absolute',
                        top: '-40px',
                        left: c.left,
                        width: `${c.size}px`,
                        height: `${c.size * 1.6}px`,
                        '--crystal-rot': `${c.rotation}deg`,
                        '--crystal-opacity': c.opacity,
                        background: `linear-gradient(
                            135deg,
                            hsla(${c.hue}, 85%, ${c.lightness}%, 0.9) 0%,
                            hsla(${c.hue}, 90%, ${c.lightness + 15}%, 0.7) 40%,
                            hsla(${c.hue}, 80%, ${c.lightness + 25}%, 0.4) 70%,
                            hsla(${c.hue}, 95%, 90%, 0.8) 100%
                        )`,
                        clipPath: 'polygon(50% 0%, 85% 25%, 100% 60%, 70% 100%, 30% 100%, 0% 60%, 15% 25%)',
                        filter: `drop-shadow(0 0 8px hsla(${c.hue}, 90%, 70%, 0.7)) drop-shadow(0 0 16px hsla(${c.hue}, 80%, 50%, 0.4))`,
                        animation: `heisenbergCrystalFall ${c.duration}s ease-in forwards`,
                        animationDelay: `${c.delay}s`,
                        opacity: 0,
                    }} />
                ))}
            </div>
        </>,
        document.body
    );
}
