import { useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import dragonUrl from './assets/dragon.json?url';

/* ── Randomised ember data, stable per mount via useMemo ── */
function useEmbers(count = 28) {
    return useMemo(() =>
        Array.from({ length: count }, (_, i) => ({
            id: i,
            left: `${4 + Math.random() * 92}%`,
            size: 3 + Math.random() * 12,
            duration: 1.6 + Math.random() * 2.4,
            delay: 0.4 + Math.random() * 2.0,
            opacity: 0.55 + Math.random() * 0.45,
        })),
    []); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ─────────────────────────────────────────────────────────
   DracarysEffect — Cinematic Lottie Dragon Edition
   • Real Lottie dragon flying bottom-left → top-right
   • Depth/scale zoom effect via framer-motion
   • Full-screen turuncu color-grade overlay
   • Fire wave peaks when dragon hits centre
   • Screen shake via framer-motion (backInOut)
   Calls onDone() after 4 000 ms → clean DOM teardown.
───────────────────────────────────────────────────────── */
export default function DracarysEffect({ onDone }) {
    const doneRef = useRef(false);
    const embers = useEmbers();

    useEffect(() => {
        const t = setTimeout(() => {
            if (!doneRef.current) { doneRef.current = true; onDone(); }
        }, 4000);
        return () => clearTimeout(t);
    }, [onDone]);

    return createPortal(
        <>
            {/* ── Keyframes injected once per mount ── */}
            <style>{`
                @keyframes dracarysFireWave {
                    0%   { transform: translateY(100%); opacity: 0; }
                    14%  { transform: translateY(56%);  opacity: 0.72; }
                    38%  { transform: translateY(26%);  opacity: 0.92; }
                    55%  { transform: translateY(18%);  opacity: 0.88; }
                    76%  { transform: translateY(24%);  opacity: 0.52; }
                    100% { transform: translateY(100%); opacity: 0; }
                }
                @keyframes dracarysEmber {
                    0%   { transform: translateY(0)     scale(1);    opacity: var(--ember-opacity); }
                    60%  { opacity: calc(var(--ember-opacity) * 0.7); }
                    100% { transform: translateY(-85vh) scale(0.15); opacity: 0; }
                }
            `}</style>

            {/* ── Full-screen turuncu color-grade overlay ── */}
            <motion.div
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(255, 65, 0, 0.18)',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    mixBlendMode: 'color-dodge',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 1, 0] }}
                transition={{ duration: 3.8, times: [0, 0.22, 0.45, 0.60, 1], ease: 'easeInOut' }}
            />

            {/* ── Screen-shake + fire + dragon + embers wrapper ── */}
            <motion.div
                style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}
                animate={{
                    x: [0, -6, 6, -5, 5, -3, 3, -1, 0],
                    y: [0,  3, -4,  4, -3,  2, -2,  1, 0],
                }}
                transition={{ delay: 1.3, duration: 0.55, ease: 'backInOut' }}
            >
                {/* Fire wave — peaks ~38–55% into animation, synced with dragon at centre */}
                <div style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0,
                    height: '80vh', zIndex: 10001, pointerEvents: 'none',
                    background: `linear-gradient(
                        to top,
                        rgba(255,  72,  0, 0.68)   0%,
                        rgba(255, 145,  0, 0.50)  16%,
                        rgba(255,  55,  0, 0.32)  40%,
                        rgba(205,  20,  0, 0.15)  64%,
                        transparent               100%
                    )`,
                    filter: 'blur(22px) saturate(190%)',
                    animation: 'dracarysFireWave 3.9s ease-in-out forwards',
                }} />

                {/* Lottie Dragon — fullscreen, sol-alt → merkez → sağ-üst kavis + depth zoom */}
                <motion.div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10002,
                        pointerEvents: 'none',
                        background: 'transparent',
                        filter: 'drop-shadow(0 0 32px rgba(255,110,0,0.85)) drop-shadow(0 0 14px rgba(255,210,0,0.50))',
                    }}
                    initial={{ x: '-110vw', y: '70vh', scale: 0.28, opacity: 0 }}
                    animate={{
                        x: ['-110vw', '0vw', '110vw'],
                        y: ['70vh', '0vh', '-70vh'],
                        scale: [0.28, 1.0, 0.45],
                        opacity: [0, 1, 0],
                    }}
                    transition={{
                        duration: 3.6,
                        times: [0, 0.46, 1.0],
                        ease: 'backInOut',
                    }}
                >
                    <DotLottieReact
                        src={dragonUrl}
                        loop
                        autoplay
                        background="transparent"
                        style={{ width: '100%', height: '100%', background: 'transparent' }}
                    />
                </motion.div>

                {/* Ember particles */}
                {embers.map(e => (
                    <div key={e.id} style={{
                        position: 'fixed', bottom: 0, left: e.left,
                        width: e.size, height: e.size,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #ffee55 0%, #ff5500 55%, transparent 100%)',
                        zIndex: 10003, pointerEvents: 'none',
                        '--ember-opacity': e.opacity,
                        animation: `dracarysEmber ${e.duration}s ease-out forwards`,
                        animationDelay: `${e.delay}s`,
                        opacity: 0,
                    }} />
                ))}
            </motion.div>
        </>,
        document.body
    );
}
