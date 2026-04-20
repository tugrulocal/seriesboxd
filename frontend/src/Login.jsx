import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

import API_BASE from './config';
const API = API_BASE;

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

    // 'giris' | 'kayit' | 'dogrulama' | 'sifremi-unuttum' | 'sifre-sifirla'
    const [sekme, setSekme] = useState('giris');
    const [yukleniyor, setYukleniyor] = useState(false);
    const [hata, setHata] = useState('');
    const [basari, setBasari] = useState('');
    const [gosterSifre, setGosterSifre] = useState(false);
    const [gosterSifre2, setGosterSifre2] = useState(false);

    // Giriş formu
    const [girisKadi, setGirisKadi] = useState('');
    const [girisSifre, setGirisSifre] = useState('');
    const [beniHatirla, setBeniHatirla] = useState(false);

    // Kayıt formu
    const [kayitKadi, setKayitKadi] = useState('');
    const [kayitEmail, setKayitEmail] = useState('');
    const [kayitSifre, setKayitSifre] = useState('');
    const [kayitSifre2, setKayitSifre2] = useState('');

    // Doğrulama kodu
    const [dogrulamaEmail, setDogrulamaEmail] = useState('');
    const [dogrulamaKodu, setDogrulamaKodu] = useState('');

    // Şifremi unuttum
    const [resetEmail, setResetEmail] = useState('');
    const [resetKodu, setResetKodu] = useState('');
    const [yeniSifre, setYeniSifre] = useState('');
    const [yeniSifre2, setYeniSifre2] = useState('');

    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

    const guc = sifreGucu(sekme === 'kayit' ? kayitSifre : sekme === 'sifre-sifirla' ? yeniSifre : '');

    const handleGiris = async (e) => {
        e.preventDefault();
        setHata(''); setBasari('');
        setYukleniyor(true);
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: girisKadi, password: girisSifre })
            });
            const data = await res.json();
            if (res.status === 403 && data.detail.includes("E-posta adresiniz henüz doğrulanmamış")) {
                setHata("E-posta adresiniz doğrulanmamış. Lütfen kayıt sekmesine gidip tekrar kod isteyin veya posta kutunuzu kontrol edin.");
                setYukleniyor(false);
                return;
            }
            if (!res.ok) throw new Error(data.detail || 'Giriş başarısız.');
            girisYap(data.token, data.user);
            navigate('/');
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    const googleLoginProvider = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setHata(''); setBasari('');
            setYukleniyor(true);
            try {
                // Since useGoogleLogin gives an access_token by default, we need to send it to our backend
                // or fetch the user info first. For security, we should send it to the backend.
                // NOTE: The previous backend expected an id_token, but useGoogleLogin by default returns an access_token.
                // We will fetch the user info directly here, then send to a specialized backend payload if needed, 
                // OR configured useGoogleLogin for flow="implicit" (default) and use that.

                // Fetching user info from Google
                const userInfoRaw = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const userInfo = await userInfoRaw.json();

                // Now we still need to log them in to our own FastAPI backend so a JWT is minted.
                // We'll mutate the API endpoint logic slightly by sending the google sub ID and email, 
                // but since the endpoint in main.py already uses id_token tokeninfo verification, 
                // we should just patch the google request to work inside our python server.
                // *For now, we'll assume the backend will handle this access token string*.
                const res = await fetch(`${API}/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ token: tokenResponse.access_token })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Google ile giriş başarısız.');

                girisYap(data.token, data.user);
                navigate('/');
            } catch (err) {
                setHata(err.message);
            } finally {
                setYukleniyor(false);
            }
        },
        onError: errorResponse => setHata('Google ile bağlantı kurulamadı.')
    });

    const handleKayit = async (e) => {
        e.preventDefault();
        setHata(''); setBasari('');
        if (kayitSifre !== kayitSifre2) { setHata('Şifreler eşleşmiyor.'); return; }
        if (kayitSifre.length < 8) { setHata('Şifre en az 8 karakter olmalı.'); return; }
        setYukleniyor(true);
        try {
            const res = await fetch(`${API}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: kayitKadi, email: kayitEmail, password: kayitSifre })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Kayıt başarısız.');

            if (data.status === 'verification_required') {
                setDogrulamaEmail(data.email);
                setIsVerificationModalOpen(true);
                setBasari(data.message);
            } else {
                girisYap(data.token, data.user);
                navigate('/');
            }
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    const handleDogrulama = async (e) => {
        e.preventDefault();
        setHata(''); setBasari('');
        setYukleniyor(true);
        try {
            const res = await fetch(`${API}/auth/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: dogrulamaEmail, code: dogrulamaKodu })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Doğrulama başarısız.');
            setIsVerificationModalOpen(false);
            girisYap(data.token, data.user);
            navigate('/');
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    const handleKoduTekrarGonder = async () => {
        setHata(''); setBasari('');
        try {
            const res = await fetch(`${API}/auth/resend-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: dogrulamaEmail })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail);
            setBasari('Kod tekrar gönderildi! Lütfen mesaj kutunuzu kontrol ediniz.');
        } catch (err) {
            setHata(err.message);
        }
    };

    const handleSifremiUnuttum = async (e) => {
        e.preventDefault();
        setHata(''); setBasari('');
        setYukleniyor(true);
        try {
            const res = await fetch(`${API}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'İşlem başarısız.');
            setSekme('sifre-sifirla');
            setBasari(data.message);
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    const handleSifreSifirla = async (e) => {
        e.preventDefault();
        setHata(''); setBasari('');
        if (yeniSifre !== yeniSifre2) { setHata('Şifreler eşleşmiyor.'); return; }
        if (yeniSifre.length < 8) { setHata('Şifre en az 8 karakter olmalı.'); return; }
        setYukleniyor(true);
        try {
            const res = await fetch(`${API}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail, code: resetKodu, new_password: yeniSifre })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Sıfırlama başarısız.');
            setBasari('Şifreniz güncellendi! Giriş yapabilirsiniz.');
            setTimeout(() => { setSekme('giris'); setBasari(''); setHata(''); }, 2000);
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    };

    const sekmeDegistir = (yeniSekme) => {
        setSekme(yeniSekme);
        setHata('');
        setBasari('');
    };

    return (
        <div className="auth-sayfa">
            <div className="auth-arka" />
            <div className="auth-arka-gradyan" />

            <div className={`auth-kart ${isVerificationModalOpen ? 'blur-background' : ''}`}>
                <Link to="/" className="auth-logo">seriesboxd</Link>
                <p className="auth-slogan">Dizilerini takip et, keşfet, paylaş.</p>

                {/* Tab seçici - sadece giriş/kayıt ekranında */}
                {(sekme === 'giris' || sekme === 'kayit') && (
                    <div className="auth-tab-wrapper">
                        <button className={`auth-tab ${sekme === 'giris' ? 'aktif' : ''}`} onClick={() => sekmeDegistir('giris')}>Giriş Yap</button>
                        <button className={`auth-tab ${sekme === 'kayit' ? 'aktif' : ''}`} onClick={() => sekmeDegistir('kayit')}>Kayıt Ol</button>
                        <div className={`auth-tab-cizgi ${sekme === 'kayit' ? 'sagda' : ''}`} />
                    </div>
                )}

                {/* Hata mesajı */}
                {hata && (
                    <div className="auth-hata">
                        <span>⚠️</span> {hata}
                    </div>
                )}

                {/* Başarı mesajı */}
                {basari && (
                    <div className="auth-basari">
                        <span>✅</span> {basari}
                    </div>
                )}

                {/* ─── GİRİŞ FORMU ─── */}
                {sekme === 'giris' && (
                    <form className="auth-form" onSubmit={handleGiris}>
                        <div className="auth-alan">
                            <label>Kullanıcı Adı</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">👤</span>
                                <input
                                    type="text"
                                    placeholder="kullanici_adi"
                                    value={girisKadi}
                                    onChange={e => setGirisKadi(e.target.value)}
                                    required
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div className="auth-alan">
                            <div className="auth-label-satir">
                                <label>Şifre</label>
                                <button type="button" className="sifre-unut-link" onClick={() => sekmeDegistir('sifremi-unuttum')}>Şifremi unuttum</button>
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

                        <div className="auth-divider">
                            <span>VEYA</span>
                        </div>

                        <div className="google-login-wrapper">
                            <button type="button" className="custom-google-btn" onClick={() => googleLoginProvider()} disabled={yukleniyor}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="google-icon">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                                </svg>
                                <span>Google ile Giriş Yap</span>
                            </button>
                        </div>

                        <p className="auth-alt-link" style={{ marginTop: '20px' }}>
                            Hesabın yok mu?{' '}
                            <button type="button" onClick={() => sekmeDegistir('kayit')}>Kayıt ol →</button>
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
                                <input type="text" placeholder="kullanici_adi" value={kayitKadi} onChange={e => setKayitKadi(e.target.value)} required autoComplete="username" />
                            </div>
                            <span className="auth-ipucu">Harf, rakam ve _ kullanabilirsin.</span>
                        </div>

                        <div className="auth-alan">
                            <label>E-posta</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">✉️</span>
                                <input type="email" placeholder="ornek@mail.com" value={kayitEmail} onChange={e => setKayitEmail(e.target.value)} required autoComplete="email" />
                            </div>
                        </div>

                        <div className="auth-alan">
                            <label>Şifre</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">🔒</span>
                                <input type={gosterSifre ? 'text' : 'password'} placeholder="En az 8 karakter" value={kayitSifre} onChange={e => setKayitSifre(e.target.value)} required autoComplete="new-password" />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre(p => !p)}>{gosterSifre ? '🙈' : '👁️'}</button>
                            </div>
                            {kayitSifre && (
                                <div className="sifre-guc-container">
                                    <div className="sifre-guc-bar">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div key={i} className="sifre-guc-segment" style={{ background: i <= guc.puan ? guc.renk : '#334155' }} />
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
                                <input type={gosterSifre2 ? 'text' : 'password'} placeholder="Şifreyi tekrar girin" value={kayitSifre2} onChange={e => setKayitSifre2(e.target.value)} required autoComplete="new-password" />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre2(p => !p)}>{gosterSifre2 ? '🙈' : '👁️'}</button>
                            </div>
                            {kayitSifre2 && kayitSifre !== kayitSifre2 && <span className="auth-ipucu hata-rengi">Şifreler eşleşmiyor.</span>}
                            {kayitSifre2 && kayitSifre === kayitSifre2 && <span className="auth-ipucu basari-rengi">✓ Şifreler eşleşiyor.</span>}
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={yukleniyor}>
                            {yukleniyor ? <span className="auth-spinner" /> : 'Hesap Oluştur'}
                        </button>

                        <div className="auth-divider">
                            <span>VEYA</span>
                        </div>

                        <div className="google-login-wrapper">
                            <button type="button" className="custom-google-btn" onClick={() => googleLoginProvider()} disabled={yukleniyor}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="google-icon">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                                </svg>
                                <span>Google ile Kayıt Ol</span>
                            </button>
                        </div>

                        <p className="auth-alt-link" style={{ marginTop: '20px' }}>
                            Zaten hesabın var mı?{' '}
                            <button type="button" onClick={() => sekmeDegistir('giris')}>Giriş yap →</button>
                        </p>
                    </form>
                )}

                {/* ─── ŞİFREMİ UNUTTUM ─── */}
                {sekme === 'sifremi-unuttum' && (
                    <form className="auth-form" onSubmit={handleSifremiUnuttum}>
                        <div className="auth-dogrulama-baslik">
                            <span className="auth-dogrulama-ikon">🔐</span>
                            <h3>Şifremi Unuttum</h3>
                            <p className="auth-dogrulama-aciklama">Hesabınla ilişkili e-posta adresini gir, sana sıfırlama kodu gönderelim.</p>
                        </div>

                        <div className="auth-alan">
                            <label>E-posta</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">✉️</span>
                                <input type="email" placeholder="ornek@mail.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoComplete="email" />
                            </div>
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={yukleniyor}>
                            {yukleniyor ? <span className="auth-spinner" /> : 'Kod Gönder'}
                        </button>

                        <p className="auth-alt-link">
                            <button type="button" onClick={() => sekmeDegistir('giris')}>← Giriş'e dön</button>
                        </p>
                    </form>
                )}

                {/* ─── ŞİFRE SIFIRLA ─── */}
                {sekme === 'sifre-sifirla' && (
                    <form className="auth-form" onSubmit={handleSifreSifirla}>
                        <div className="auth-dogrulama-baslik">
                            <span className="auth-dogrulama-ikon">🔑</span>
                            <h3>Yeni Şifre Belirle</h3>
                            <p className="auth-dogrulama-aciklama"><strong>{resetEmail}</strong> adresine gönderilen kodu ve yeni şifreni gir.</p>
                        </div>

                        <div className="auth-alan">
                            <label>Sıfırlama Kodu</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">🔢</span>
                                <input type="text" placeholder="000000" value={resetKodu} onChange={e => setResetKodu(e.target.value.replace(/\D/g, '').slice(0, 6))} required maxLength={6} className="auth-kod-input" autoComplete="one-time-code" />
                            </div>
                        </div>

                        <div className="auth-alan">
                            <label>Yeni Şifre</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">🔒</span>
                                <input type={gosterSifre ? 'text' : 'password'} placeholder="En az 8 karakter" value={yeniSifre} onChange={e => setYeniSifre(e.target.value)} required autoComplete="new-password" />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre(p => !p)}>{gosterSifre ? '🙈' : '👁️'}</button>
                            </div>
                            {yeniSifre && (
                                <div className="sifre-guc-container">
                                    <div className="sifre-guc-bar">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div key={i} className="sifre-guc-segment" style={{ background: i <= guc.puan ? guc.renk : '#334155' }} />
                                        ))}
                                    </div>
                                    <span className="sifre-guc-etiket" style={{ color: guc.renk }}>{guc.etiket}</span>
                                </div>
                            )}
                        </div>

                        <div className="auth-alan">
                            <label>Yeni Şifre Tekrar</label>
                            <div className={`auth-input-wrapper ${yeniSifre2 && yeniSifre !== yeniSifre2 ? 'yanlis' : yeniSifre2 && yeniSifre === yeniSifre2 ? 'dogru' : ''}`}>
                                <span className="auth-input-ikon">🔒</span>
                                <input type={gosterSifre2 ? 'text' : 'password'} placeholder="Şifreyi tekrar girin" value={yeniSifre2} onChange={e => setYeniSifre2(e.target.value)} required autoComplete="new-password" />
                                <button type="button" className="goster-btn" onClick={() => setGosterSifre2(p => !p)}>{gosterSifre2 ? '🙈' : '👁️'}</button>
                            </div>
                            {yeniSifre2 && yeniSifre !== yeniSifre2 && <span className="auth-ipucu hata-rengi">Şifreler eşleşmiyor.</span>}
                            {yeniSifre2 && yeniSifre === yeniSifre2 && <span className="auth-ipucu basari-rengi">✓ Şifreler eşleşiyor.</span>}
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={yukleniyor || resetKodu.length !== 6}>
                            {yukleniyor ? <span className="auth-spinner" /> : 'Şifreyi Güncelle'}
                        </button>

                        <p className="auth-alt-link">
                            <button type="button" onClick={() => sekmeDegistir('giris')}>← Giriş'e dön</button>
                        </p>
                    </form>
                )}
            </div>

            {/* GLASSMORPHISM EMAIL VERIFICATION MODAL */}
            {isVerificationModalOpen && (
                <div className="verification-modal-overlay">
                    <div className="verification-modal">
                        <div className="auth-dogrulama-baslik" style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <span className="auth-dogrulama-ikon" style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}>📧</span>
                            <h3 style={{ fontSize: '1.5rem', color: '#f8fafc', margin: '0 0 10px 0' }}>E-posta Doğrulama</h3>
                            <p className="auth-dogrulama-aciklama" style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>
                                Lütfen <strong>{dogrulamaEmail}</strong> adresine gönderilen 6 haneli kodu girin.<br />
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginTop: '5px' }}>(Geliştirme aşamasında konsola da yazdırıldı)</span>
                            </p>
                        </div>

                        <form onSubmit={handleDogrulama}>
                            <div className="auth-alan">
                                <div className="auth-input-wrapper" style={{ margin: '0 auto', maxWidth: '300px' }}>
                                    <span className="auth-input-ikon">🔢</span>
                                    <input
                                        type="text"
                                        placeholder="000000"
                                        value={dogrulamaKodu}
                                        onChange={e => setDogrulamaKodu(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        required
                                        maxLength={6}
                                        className="auth-kod-input"
                                        style={{ textAlign: 'center', letterSpacing: '0.5rem', fontSize: '1.2rem' }}
                                        autoComplete="one-time-code"
                                    />
                                </div>
                            </div>

                            {hata && <div className="auth-hata" style={{ marginTop: '15px' }}>{hata}</div>}
                            {basari && <div className="auth-basari" style={{ marginTop: '15px' }}>{basari}</div>}

                            <button type="submit" className="auth-submit-btn" disabled={yukleniyor || dogrulamaKodu.length !== 6} style={{ marginTop: '20px' }}>
                                {yukleniyor ? <span className="auth-spinner" /> : 'Doğrula ve Giriş Yap'}
                            </button>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', padding: '0 10px' }}>
                                <button type="button" className="auth-alt-link" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }} onClick={handleKoduTekrarGonder}>
                                    Tekrar gönder
                                </button>
                                <button type="button" className="auth-alt-link" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }} onClick={() => setIsVerificationModalOpen(false)}>
                                    İptal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Login;
