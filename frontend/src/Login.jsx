import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Şifre gücü hesaplayıcı
function sifreGucu(sifre) {
    if (!sifre) return { puan: 0, etiket: '', renk: '' };
    let p = 0;
    if (sifre.length >= 8) p++;
    if (sifre.length >= 12) p++;
    if (/[A-Z]/.test(sifre)) p++;
    if (/[0-9]/.test(sifre)) p++;
    if (/[^A-Za-z0-9]/.test(sifre)) p++;
    if (p <= 1) return { puan: p, etiket: 'Çok Zayıf', renk: '#ef4444' };
    if (p === 2) return { puan: p, etiket: 'Zayıf', renk: '#f97316' };
    if (p === 3) return { puan: p, etiket: 'Orta', renk: '#eab308' };
    if (p === 4) return { puan: p, etiket: 'İyi', renk: '#22c55e' };
    return { puan: p, etiket: 'Güçlü 🔒', renk: '#10b981' };
}

function Login() {
    const navigate = useNavigate();
    const { girisYap } = useAuth();

    const [sekme, setSekme] = useState('giris'); // 'giris' | 'kayit'
    const [yukleniyor, setYukleniyor] = useState(false);
    const [hata, setHata] = useState('');
    const [gosterSifre, setGosterSifre] = useState(false);
    const [gosterSifre2, setGosterSifre2] = useState(false);

    // Giriş formu
    const [girisEmail, setGirisEmail] = useState('');
    const [girisSifre, setGirisSifre] = useState('');
    const [beniHatirla, setBeniHatirla] = useState(false);

    // Kayıt formu
    const [kayitKadi, setKayitKadi] = useState('');
    const [kayitEmail, setKayitEmail] = useState('');
    const [kayitSifre, setKayitSifre] = useState('');
    const [kayitSifre2, setKayitSifre2] = useState('');

    const guc = sifreGucu(sekme === 'kayit' ? kayitSifre : '');

    const handleGiris = async (e) => {
        e.preventDefault();
        setHata('');
        setYukleniyor(true);
        try {
            const res = await fetch('http://127.0.0.1:8000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: girisEmail, password: girisSifre })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Giriş başarısız.');
            girisYap(data.token, data.user);
            navigate('/');
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    const handleKayit = async (e) => {
        e.preventDefault();
        setHata('');
        if (kayitSifre !== kayitSifre2) { setHata('Şifreler eşleşmiyor.'); return; }
        if (kayitSifre.length < 8) { setHata('Şifre en az 8 karakter olmalı.'); return; }
        setYukleniyor(true);
        try {
            const res = await fetch('http://127.0.0.1:8000/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: kayitKadi, email: kayitEmail, password: kayitSifre })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Kayıt başarısız.');
            girisYap(data.token, data.user);
            navigate('/');
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    return (
        <div className="auth-sayfa">
            {/* Arkaplan efekti */}
            <div className="auth-arka" />
            <div className="auth-arka-gradyan" />

            <div className="auth-kart">
                {/* Logo */}
                <Link to="/" className="auth-logo">seriesboxd</Link>
                <p className="auth-slogan">Dizilerini takip et, keşfet, paylaş.</p>

                {/* Tab seçici */}
                <div className="auth-tab-wrapper">
                    <button
                        className={`auth-tab ${sekme === 'giris' ? 'aktif' : ''}`}
                        onClick={() => { setSekme('giris'); setHata(''); }}
                    >
                        Giriş Yap
                    </button>
                    <button
                        className={`auth-tab ${sekme === 'kayit' ? 'aktif' : ''}`}
                        onClick={() => { setSekme('kayit'); setHata(''); }}
                    >
                        Kayıt Ol
                    </button>
                    <div className={`auth-tab-cizgi ${sekme === 'kayit' ? 'sagda' : ''}`} />
                </div>

                {/* Hata mesajı */}
                {hata && (
                    <div className="auth-hata">
                        <span>⚠️</span> {hata}
                    </div>
                )}

                {/* ─── GİRİŞ FORMU ─── */}
                {sekme === 'giris' && (
                    <form className="auth-form" onSubmit={handleGiris}>
                        <div className="auth-alan">
                            <label>E-posta</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">✉️</span>
                                <input
                                    type="email"
                                    placeholder="ornek@mail.com"
                                    value={girisEmail}
                                    onChange={e => setGirisEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="auth-alan">
                            <div className="auth-label-satir">
                                <label>Şifre</label>
                                <Link to="/sifremi-unuttum" className="sifre-unut-link">Şifremi unuttum</Link>
                            </div>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">🔑</span>
                                <input
                                    type={gosterSifre ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={girisSifre}
                                    onChange={e => setGirisSifre(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre(p => !p)}>
                                    {gosterSifre ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        <label className="hatirla-checkbox">
                            <input type="checkbox" checked={beniHatirla} onChange={e => setBeniHatirla(e.target.checked)} />
                            <span>Beni hatırla</span>
                        </label>

                        <button type="submit" className="auth-submit-btn" disabled={yukleniyor}>
                            {yukleniyor ? <span className="auth-spinner" /> : 'Giriş Yap'}
                        </button>

                        <p className="auth-alt-link">
                            Hesabın yok mu?{' '}
                            <button type="button" onClick={() => { setSekme('kayit'); setHata(''); }}>
                                Kayıt ol →
                            </button>
                        </p>
                    </form>
                )}

                {/* ─── KAYIT FORMU ─── */}
                {sekme === 'kayit' && (
                    <form className="auth-form" onSubmit={handleKayit}>
                        <div className="auth-alan">
                            <label>Kullanıcı Adı</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">👤</span>
                                <input
                                    type="text"
                                    placeholder="kullanici_adi"
                                    value={kayitKadi}
                                    onChange={e => setKayitKadi(e.target.value)}
                                    required
                                    autoComplete="username"
                                />
                            </div>
                            <span className="auth-ipucu">Harf, rakam ve _ kullanabilirsin.</span>
                        </div>

                        <div className="auth-alan">
                            <label>E-posta</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">✉️</span>
                                <input
                                    type="email"
                                    placeholder="ornek@mail.com"
                                    value={kayitEmail}
                                    onChange={e => setKayitEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="auth-alan">
                            <label>Şifre</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">🔒</span>
                                <input
                                    type={gosterSifre ? 'text' : 'password'}
                                    placeholder="En az 8 karakter"
                                    value={kayitSifre}
                                    onChange={e => setKayitSifre(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre(p => !p)}>
                                    {gosterSifre ? '🙈' : '👁️'}
                                </button>
                            </div>

                            {/* Şifre gücü göstergesi */}
                            {kayitSifre && (
                                <div className="sifre-guc-container">
                                    <div className="sifre-guc-bar">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div
                                                key={i}
                                                className="sifre-guc-segment"
                                                style={{ background: i <= guc.puan ? guc.renk : '#334155' }}
                                            />
                                        ))}
                                    </div>
                                    <span className="sifre-guc-etiket" style={{ color: guc.renk }}>{guc.etiket}</span>
                                </div>
                            )}
                        </div>

                        <div className="auth-alan">
                            <label>Şifre Tekrar</label>
                            <div className={`auth-input-wrapper ${kayitSifre2 && kayitSifre !== kayitSifre2 ? 'yanlis' : kayitSifre2 && kayitSifre === kayitSifre2 ? 'dogru' : ''}`}>
                                <span className="auth-input-ikon">🔒</span>
                                <input
                                    type={gosterSifre2 ? 'text' : 'password'}
                                    placeholder="Şifreyi tekrar girin"
                                    value={kayitSifre2}
                                    onChange={e => setKayitSifre2(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre2(p => !p)}>
                                    {gosterSifre2 ? '🙈' : '👁️'}
                                </button>
                            </div>
                            {kayitSifre2 && kayitSifre !== kayitSifre2 && (
                                <span className="auth-ipucu hata-rengi">Şifreler eşleşmiyor.</span>
                            )}
                            {kayitSifre2 && kayitSifre === kayitSifre2 && (
                                <span className="auth-ipucu basari-rengi">✓ Şifreler eşleşiyor.</span>
                            )}
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={yukleniyor}>
                            {yukleniyor ? <span className="auth-spinner" /> : 'Hesap Oluştur'}
                        </button>

                        <p className="auth-alt-link">
                            Zaten hesabın var mı?{' '}
                            <button type="button" onClick={() => { setSekme('giris'); setHata(''); }}>
                                Giriş yap →
                            </button>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}

export default Login;
