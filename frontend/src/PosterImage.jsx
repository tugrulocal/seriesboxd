/**
 * PosterImage — Optimised TMDB poster element.
 *
 * Features:
 *  • <picture> tag ready for WebP/AVIF via VITE_IMAGE_PROXY
 *    Set VITE_IMAGE_PROXY=https://your-cdn.com/img in .env and the proxy
 *    must accept ?src=<encoded_tmdb_url>&format=webp to enable format conversion.
 *  • Native lazy loading  (loading="lazy")   for below-the-fold images
 *  • Eager loading        (loading="eager" + fetchpriority="high") for LCP / above-the-fold
 *  • Off-main-thread decoding via decoding="async"
 *  • CSS skeleton shimmer until the image loads (.poster-loaded class added onLoad)
 *  • Responsive images (srcSet) — serves optimal size based on device
 *
 * Props:
 *   path       {string}   TMDB poster_path e.g. "/abc123.jpg"
 *   size       {string}   TMDB size bucket — default "w185"
 *                         (w92 | w154 | w185 | w342 | w500 | w780 | original)
 *   alt        {string}   img alt text
 *   eager      {boolean}  true for above-the-fold / LCP images
 *   className  {string}   extra class(es) forwarded to <img>
 *   responsive {boolean}  enable responsive srcSet (default: false)
 *   type       {string}   image type for responsive: 'poster' | 'backdrop' | 'thumbnail'
 */

const TMDB_BASE = 'https://image.tmdb.org/t/p/';
// Optional CDN/proxy for WebP conversion. Configure via .env: VITE_IMAGE_PROXY=https://...
const WEBP_PROXY = import.meta.env.VITE_IMAGE_PROXY || null;

// Responsive image configurations for different types
const RESPONSIVE_CONFIGS = {
  poster: {
    sizes: ['w342', 'w500', 'w780'],
    sizesAttr: '(max-width: 640px) 342px, (max-width: 1024px) 500px, 780px',
    fallback: 'w500'
  },
  backdrop: {
    sizes: ['w780', 'w1280'],
    sizesAttr: '(max-width: 768px) 780px, 1280px',
    fallback: 'w1280'
  },
  thumbnail: {
    sizes: ['w92', 'w154', 'w185'],
    sizesAttr: '(max-width: 640px) 92px, (max-width: 1024px) 154px, 185px',
    fallback: 'w154'
  }
};

export default function PosterImage({
  path,
  size = 'w185',
  alt = '',
  eager = false,
  className = '',
  responsive = false,
  type = 'poster',
}) {
  if (!path) return null;

  // Use responsive configuration if enabled
  const config = responsive && RESPONSIVE_CONFIGS[type];

  const isExternalUrl = path.startsWith('http://') || path.startsWith('https://');

  let srcSet = null;
  let sizesAttr = null;
  let finalSrc = isExternalUrl ? path : `${TMDB_BASE}${size}${path}`;

  if (config && !isExternalUrl) {
    // Build srcSet from configuration
    srcSet = config.sizes.map(s => `${TMDB_BASE}${s}${path} ${s.substring(1)}w`).join(', ');
    sizesAttr = config.sizesAttr;
    finalSrc = `${TMDB_BASE}${config.fallback}${path}`;
  }

  const jpegSrc = finalSrc;
  const webpSrc = WEBP_PROXY
    ? `${WEBP_PROXY}?src=${encodeURIComponent(jpegSrc)}&format=webp`
    : null;

  return (
    <picture>
      {/* WebP source — active only when VITE_IMAGE_PROXY is configured */}
      {webpSrc && <source type="image/webp" srcSet={webpSrc} />}
      <img
        src={jpegSrc}
        srcSet={srcSet || undefined}
        sizes={sizesAttr || undefined}
        alt={alt}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        /* fetchPriority tells the browser to boost network priority for LCP images */
        {...(eager ? { fetchPriority: 'high' } : {})}
        /* Add .poster-loaded on load — CSS uses it to fade in and stop the shimmer */
        onLoad={(e) => e.currentTarget.classList.add('poster-loaded')}
      />
    </picture>
  );
}
