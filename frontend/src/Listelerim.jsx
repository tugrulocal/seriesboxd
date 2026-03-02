import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Profil.css'; // Profil.css stillerini tekrar kullanabiliriz

function Listelerim() {
    const { kullanici } = useAuth();
    const navigate = useNavigate();
    const [listeler, setListeler] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!kullanici) {
            navigate('/login');
            return;
        }

        const token = localStorage.getItem('sb_token');
        fetch('http://127.0.0.1:8000/lists', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setListeler(data);
            })
            .catch(err => console.error("Listeler alınamadı:", err))
            .finally(() => setLoading(false));

    }, [kullanici, navigate]);

    if (!kullanici) return null;

    return (
        <div className="profil-page" style={{ paddingTop: '100px' }}>
            <h2 style={{ fontSize: '2rem', borderBottom: '2px solid #334155', paddingBottom: '15px', marginBottom: '30px' }}>
                📋 Benim Listelerim
            </h2>

            {loading ? null : listeler.length > 0 ? (
                <div className="profil-stats-grid">
                    {listeler.map(liste => (
                        <div key={liste.list_id} className="stat-card" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
                            <h3 style={{ margin: '0 0 10px 0', color: '#a78bfa' }}>{liste.list_name}</h3>
                            <p style={{ margin: '0', color: '#94a3b8', fontSize: '0.9rem' }}>{new Date(liste.created_at).toLocaleDateString()}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ background: '#1e293b', padding: '40px', borderRadius: '12px', textAlign: 'center', color: '#cbd5e1' }}>
                    <p>Henüz hiç liste oluşturmadınız.</p>
                </div>
            )}
        </div>
    );
}

export default Listelerim;
