// API base URL
// Dev (.env): VITE_API_URL=http://127.0.0.1:8000
// Production (.env.production): VITE_API_URL=   (empty → same-origin relative URLs)
const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = import.meta.env.VITE_API_URL ?? (isLocalhost ? 'http://127.0.0.1:8000' : '');

export default API_BASE;
