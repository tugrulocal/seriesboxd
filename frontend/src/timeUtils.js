import { useEffect, useState } from 'react';

const TIMEZONE_SUFFIX_RE = /([zZ]|[+-]\d{2}:?\d{2})$/;

export function normalizeApiDate(dateString) {
    if (!dateString) return null;
    const raw = String(dateString).trim();
    if (!raw) return null;

    const normalized = raw.replace(' ', 'T');
    return TIMEZONE_SUFFIX_RE.test(normalized) ? normalized : `${normalized}Z`;
}

export function parseApiDate(dateString) {
    const normalized = normalizeApiDate(dateString);
    if (!normalized) return null;

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getRelativeTimeLabel(dateString, now = new Date()) {
    const parsed = parseApiDate(dateString);
    if (!parsed) return '';

    const diffMs = now.getTime() - parsed.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'az önce';

    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'az önce';
    if (diffMinutes < 60) return `${diffMinutes} dakika önce`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} saat önce`;

    return parsed.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function useRelativeTimeTicker(intervalMs = 60000) {
    const [, setTick] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setTick(prev => prev + 1);
        }, intervalMs);

        return () => clearInterval(timer);
    }, [intervalMs]);
}
