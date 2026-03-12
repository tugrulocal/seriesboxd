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
 *
 * Props:
 *   path       {string}   TMDB poster_path e.g. "/abc123.jpg"
 *   size       {string}   TMDB size bucket — default "w185"
 *                         (w92 | w154 | w185 | w342 | w500 | w780 | original)
 *   alt        {string}   img alt text
 *   eager      {boolean}  true for above-the-fold / LCP images
 *   className  {string}   extra class(es) forwarded to <img>
 */

const TMDB_BASE = 'https://image.tmdb.org/t/p/';
// Optional CDN/proxy for WebP conversion. Configure via .env: VITE_IMAGE_PROXY=https://...
const WEBP_PROXY = import.meta.env.VITE_IMAGE_PROXY || null;

export default function PosterImage({
  path,
  size = 'w185',
  alt = '',
  eager = false,
  className = '',
}) {
  if (!path) return null;

  const jpegSrc = `${TMDB_BASE}${size}${path}`;
  const webpSrc = WEBP_PROXY
    ? `${WEBP_PROXY}?src=${encodeURIComponent(jpegSrc)}&format=webp`
    : null;

  return (
    <picture>
      {/* WebP source — active only when VITE_IMAGE_PROXY is configured */}
      {webpSrc && <source type="image/webp" srcSet={webpSrc} />}
      <img
        src={jpegSrc}
        alt={alt}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        /* fetchpriority tells the browser to boost network priority for LCP images */
        {...(eager ? { fetchpriority: 'high' } : {})}
        /* Add .poster-loaded on load — CSS uses it to fade in and stop the shimmer */
        onLoad={(e) => e.currentTarget.classList.add('poster-loaded')}
      />
    </picture>
  );
}
