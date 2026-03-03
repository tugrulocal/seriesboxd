import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

const API = 'http://127.0.0.1:8000';

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
                setSekme('dogrulama');
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
            setBasari('Kod tekrar gönderildi!');
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

            <div className="auth-kart">
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

                        <p className="auth-alt-link">
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

                        <p className="auth-alt-link">
                            Zaten hesabın var mı?{' '}
                            <button type="button" onClick={() => sekmeDegistir('giris')}>Giriş yap →</button>
                        </p>
                    </form>
                )}

                {/* ─── E-POSTA DOĞRULAMA ─── */}
                {sekme === 'dogrulama' && (
                    <form className="auth-form" onSubmit={handleDogrulama}>
                        <div className="auth-dogrulama-baslik">
                            <span className="auth-dogrulama-ikon">📧</span>
                            <h3>E-posta Doğrulama</h3>
                            <p className="auth-dogrulama-aciklama">
                                <strong>{dogrulamaEmail}</strong> adresine gönderilen 6 haneli kodu girin.
                            </p>
                        </div>

                        <div className="auth-alan">
                            <label>Doğrulama Kodu</label>
                            <div className="auth-input-wrapper">
                                <span className="auth-input-ikon">🔢</span>
                                <input
                                    type="text"
                                    placeholder="000000"
                                    value={dogrulamaKodu}
                                    onChange={e => setDogrulamaKodu(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    maxLength={6}
                                    className="auth-kod-input"
                                    autoComplete="one-time-code"
                                />
                            </div>
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={yukleniyor || dogrulamaKodu.length !== 6}>
                            {yukleniyor ? <span className="auth-spinner" /> : 'Doğrula'}
                        </button>

                        <p className="auth-alt-link">
                            Kod gelmedi mi?{' '}
                            <button type="button" onClick={handleKoduTekrarGonder}>Tekrar gönder</button>
                        </p>
                        <p className="auth-alt-link">
                            <button type="button" onClick={() => sekmeDegistir('kayit')}>← Kayıt'a dön</button>
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
        </div>
    );
}

export default Login;
