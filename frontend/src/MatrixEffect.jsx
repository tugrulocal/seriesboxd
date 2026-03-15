import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ─────────────────────────────────────────────────────────
   MatrixEffect — Digital Rain (Canvas-based)
   • Classic green falling characters on black
   • Fades in/out smoothly
   Calls onDone() after 6000 ms.
───────────────────────────────────────────────────────── */
export default function MatrixEffect({ onDone }) {
    const canvasRef = useRef(null);
    const doneRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animId;
        let fadeOpacity = 0;
        const fadeInDuration = 800;
        const fadeOutStart = 5000;
        const totalDuration = 6000;
        const startTime = Date.now();

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const fontSize = 14;
        let columns = Math.floor(canvas.width / fontSize);
        let drops = Array.from({ length: columns }, () => Math.random() * -50);

        // Katakana, Latin, digits, and some symbols
        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*';

        const draw = () => {
            const now = Date.now();
            const elapsed = now - startTime;

            // Fade logic
            if (elapsed < fadeInDuration) {
                fadeOpacity = elapsed / fadeInDuration;
            } else if (elapsed > fadeOutStart) {
                fadeOpacity = Math.max(0, 1 - (elapsed - fadeOutStart) / (totalDuration - fadeOutStart));
            } else {
                fadeOpacity = 1;
            }

            if (elapsed >= totalDuration) {
                if (!doneRef.current) { doneRef.current = true; onDone(); }
                return;
            }

            // Recalculate columns on resize
            const newCols = Math.floor(canvas.width / fontSize);
            if (newCols !== columns) {
                columns = newCols;
                drops = Array.from({ length: columns }, (_, i) => drops[i] ?? Math.random() * -50);
            }

            // Semi-transparent black to create trail effect
            ctx.fillStyle = `rgba(0, 0, 0, ${0.05 * fadeOpacity + 0.03})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < columns; i++) {
                const char = chars[Math.floor(Math.random() * chars.length)];
                const x = i * fontSize;
                const y = drops[i] * fontSize;

                // Head character: bright white-green
                const brightness = 180 + Math.random() * 75;
                ctx.fillStyle = `rgba(${brightness > 230 ? 200 : 0}, ${brightness}, 0, ${fadeOpacity * (0.7 + Math.random() * 0.3)})`;
                ctx.fillText(char, x, y);

                // Random chance of a bright "head"
                if (Math.random() < 0.03) {
                    ctx.fillStyle = `rgba(180, 255, 180, ${fadeOpacity * 0.95})`;
                    ctx.fillText(char, x, y);
                }

                // Reset drop to top randomly or when it goes below screen
                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }

            animId = requestAnimationFrame(draw);
        };

        // Start with a black fill
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        animId = requestAnimationFrame(draw);

        const timeout = setTimeout(() => {
            if (!doneRef.current) { doneRef.current = true; onDone(); }
        }, totalDuration + 200);

        return () => {
            cancelAnimationFrame(animId);
            clearTimeout(timeout);
            window.removeEventListener('resize', resize);
        };
    }, [onDone]);

    return createPortal(
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                pointerEvents: 'none',
            }}
        />,
        document.body
    );
}
