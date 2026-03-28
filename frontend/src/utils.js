export const getImageUrl = (path, size = 'w185') => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
};
