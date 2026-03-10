// API base URL
// Dev (.env): VITE_API_URL=http://127.0.0.1:8000
// Production (.env.production): VITE_API_URL=   (empty → same-origin relative URLs)
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default API_BASE;
