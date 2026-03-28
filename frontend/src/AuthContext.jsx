import { createContext, useContext, useState, useEffect } from 'react';
import API_BASE from './config';

const API = API_BASE;
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [kullanici, setKullanici] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('sb_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch(`${API}/auth/me`, {
            headers,
            credentials: 'include'
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setKullanici(data); })
            .catch(() => { })
            .finally(() => setYukleniyor(false));
    }, []);

    const girisYap = (token, user) => {
        if (token) localStorage.setItem('sb_token', token);
        setKullanici(user);
    };

    const cikisYap = async () => {
        try {
            await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch { }
        localStorage.removeItem('sb_token');
        setKullanici(null);
    };

    const isAdmin = kullanici?.email?.toLowerCase() === 'seriesboxd@gmail.com';

    const guncelleKullanici = (updates) => {
        setKullanici(prev => prev ? { ...prev, ...updates } : prev);
    };

    return (
        <AuthContext.Provider value={{ kullanici, yukleniyor, girisYap, cikisYap, isAdmin, guncelleKullanici }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
