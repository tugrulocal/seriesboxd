import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [kullanici, setKullanici] = useState(null);     // { user_id, username, email, avatar }
    const [yukleniyor, setYukleniyor] = useState(true);  // Token kontrol ediliyor

    // Sayfa yenilendiğinde localStorage'dan token kontrol et
    useEffect(() => {
        const token = localStorage.getItem('sb_token');
        if (!token) { setYukleniyor(false); return; }

        fetch('http://127.0.0.1:8000/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setKullanici(data); })
            .catch(() => { })
            .finally(() => setYukleniyor(false));
    }, []);

    const girisYap = (token, user) => {
        localStorage.setItem('sb_token', token);
        setKullanici(user);
    };

    const cikisYap = () => {
        localStorage.removeItem('sb_token');
        setKullanici(null);
    };

    return (
        <AuthContext.Provider value={{ kullanici, yukleniyor, girisYap, cikisYap }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
