# Plan: Dracarys Easter Egg — DracarysEffect Component

## Trigger Logic

Inside `SearchBar.jsx`, add a `useEffect` watching `aramaMetni`:
- When the trimmed, lowercased value equals `'dracarys'` and hasn't already been triggered (via a `useRef` guard), set `dracarysActive = true`.
- When the value changes away from `'dracarys'`, reset the ref guard so the effect can re-trigger if the user types it again.

## New File: `frontend/src/DracarysEffect.jsx`

Self-contained component. Accepts `{ onDone }` prop. Fires a `setTimeout(onDone, 4000)` on mount.

### Visual Layers (all `position: fixed`, `pointer-events: none`)

| Layer | z-index | Description |
|---|---|---|
| Screen-shake wrapper | 10000 | Outer div; receives `dracarys-shake` class |
| Fire wave | 10001 | `linear-gradient` to-top, orange→red tones, 30% opacity, `filter: blur(18px)` |
| Dragon silhouette | 10002 | Inline SVG, flies left→right via `dragonFly` keyframe |
| Ember particles | 10003 | 18 small radial-gradient divs, `emberFloat` upward animation |

### CSS Keyframes (injected via `<style>` tag inside the component)

- **`dragonFly`** — `translateX(-260px → 100vw+260px)` with a slight Y arc, `scaleX(-1)` so dragon faces right, `cubic-bezier(0.4,0,0.2,1)`, 3.4s duration.
- **`fireWave`** — `translateY(100% → 20% → 100%)`, fade in/out, 3.8s, `ease-in-out`.
- **`screenShake`** — 6-step ±4px translate, 0.45s, fires at `animation-delay: 1.4s` (fire peak).
- **`emberFloat`** — `translateY(0 → -80vh)` + scale-down, each particle gets random duration (1.8–3.8s) and delay (0.6–1.8s).

### Dragon SVG

Minimal black silhouette paths using `stroke="#111"`, `fill="none"`:
- Spine/body curve
- Neck + head with jaw gap and horn
- Two wings with membrane lines
- Tail curl
- Two legs with claw splits

## SearchBar.jsx Changes

1. **Import**: `import DracarysEffect from './DracarysEffect';`

2. **State + effect**:
```js
const [dracarysActive, setDracarysActive] = useState(false);
const dracarysTriggered = useRef(false);

useEffect(() => {
    if (aramaMetni.trim().toLowerCase() === 'dracarys' && !dracarysTriggered.current) {
        dracarysTriggered.current = true;
        setDracarysActive(true);
    }
    if (aramaMetni.trim().toLowerCase() !== 'dracarys') {
        dracarysTriggered.current = false;
    }
}, [aramaMetni]);
```

3. **Input glow** — add `style` prop to `<input>` when `dracarysActive`:
```js
style={dracarysActive ? {
    borderColor: '#ff6600',
    boxShadow: '0 0 0 2px rgba(255,100,0,0.45), 0 0 14px rgba(255,80,0,0.3)',
    transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
    animation: 'dracarysInputPulse 1s ease-in-out infinite',
} : undefined}
```

4. **Pulse keyframe** in `index.css` or `SearchBar` CSS:
```css
@keyframes dracarysInputPulse {
    0%, 100% { box-shadow: 0 0 0 2px rgba(255,100,0,0.45), 0 0 14px rgba(255,80,0,0.3); }
    50%       { box-shadow: 0 0 0 3px rgba(255,100,0,0.7),  0 0 28px rgba(255,80,0,0.55); }
}
```

5. **Render effect** — just before closing `</div>` of `searchbar-container`:
```jsx
{dracarysActive && (
    <DracarysEffect onDone={() => {
        setDracarysActive(false);
        dracarysTriggered.current = false;
    }} />
)}
```

## Reset Behaviour

- `onDone` fires after exactly 4000ms via `setTimeout` inside `DracarysEffect`.
- Resets: `dracarysActive → false`, `dracarysTriggered.current → false`, input border returns to default.

## Quality Notes

- No external dependencies — pure CSS keyframes + SVG.
- All animations use `ease-in-out` or `cubic-bezier(0.4,0,0.2,1)` — no linear snapping.
- Screen shake intentionally short (0.45s) and subtle (±4px) to feel cinematic, not jarring.
- Ember particles are randomised per render (position, size, speed, delay) for organic feel.
- Dragon SVG is ~220×80px, purely stroke-based (no fills), ensuring crisp render at any DPI.
