import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, Eye, EyeOff, X } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from './AuthContext';
import API_BASE from './config';
import './AuthRequiredModal.css';

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21.35 11.1H12v2.9h5.35c-.23 1.43-1.06 2.64-2.24 3.45v2.87h3.62c2.12-1.95 3.34-4.83 3.34-8.22 0-.76-.07-1.48-.22-2.2Z" fill="#4285F4" />
      <path d="M12 22c3.02 0 5.56-1 7.42-2.68l-3.62-2.87c-1.01.68-2.3 1.08-3.8 1.08-2.92 0-5.4-1.97-6.28-4.62H1.98v2.97A10 10 0 0 0 12 22Z" fill="#34A853" />
      <path d="M5.72 12.91c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V5.76H1.98A10 10 0 0 0 1 10.82c0 1.61.39 3.13 1.08 4.46l3.64-2.37Z" fill="#FBBC05" />
      <path d="M12 4.1c1.66 0 3.16.57 4.34 1.69l3.25-3.25C17.55.94 14.98 0 12 0 7.98 0 4.52 2.28 2.98 5.76l3.74 2.87C7.6 5.36 9.98 4.1 12 4.1Z" fill="#EA4335" />
    </svg>
  );
}

function AuthRequiredModal({ isOpen, onClose, contextText }) {
  const { girisYap } = useAuth();
  const navigate = useNavigate();
  const loginButtonRef = useRef(null);
  const emailInputRef = useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    loginButtonRef.current?.focus();
    emailInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setLoading(false);
    setGoogleLoading(false);
  }, [isOpen]);

  const performLogin = async (payload) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.status === 403 && data?.detail?.includes('E-posta adresiniz henüz doğrulanmamış')) {
      throw new Error('E-posta adresiniz doğrulanmamış. Lütfen posta kutunuzu kontrol edin.');
    }
    if (!res.ok) throw new Error(data?.detail || 'Giriş başarısız.');
    girisYap(data.token, data.user);
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await performLogin({ username, password });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setError('');
      setGoogleLoading(true);
      try {
        const res = await fetch(`${API_BASE}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: tokenResponse.access_token })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || 'Google ile giriş başarısız.');
        girisYap(data.token, data.user);
        onClose();
      } catch (googleError) {
        setError(googleError.message);
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: () => {
      setError('Google ile bağlantı kurulamadı.');
    }
  });

  if (!isOpen) return null;

  return (
    <div className="auth-gate-overlay" onClick={onClose}>
      <div
        className="auth-gate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="auth-gate-close-btn" onClick={onClose} aria-label="Kapat">
          <X size={22} />
        </button>
        <div className="auth-gate-header">
          <div className="auth-gate-badge">
            <Lock size={14} />
            Giriş gerekli
          </div>
          <h3 id="auth-gate-title">Giriş yap</h3>
          <p>
            {contextText || 'Bu işlemi gerçekleştirmek'} için giriş yapmalısın.
            Giriş yaptıktan sonra sayfada kalırsın.
          </p>
        </div>

        <div className="auth-gate-body">
          <button
            type="button"
            className="auth-gate-google-btn"
            onClick={() => googleLogin()}
            disabled={loading || googleLoading}
          >
            {googleLoading ? <Loader2 size={16} className="auth-gate-spin" /> : <GoogleMark />}
            {googleLoading ? 'Bağlanıyor...' : 'Google ile giriş yap/kayıt ol'}
          </button>

          <div className="auth-gate-divider">
            <span>Ya da</span>
          </div>

          <form className="auth-gate-form" onSubmit={handleSubmit}>
            <label className="auth-gate-field">
              <span>Kullanıcı adı</span>
              <input
                ref={emailInputRef}
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="kullaniciadi"
                autoComplete="username"
              />
            </label>

            <label className="auth-gate-field">
              <span>Şifre</span>
              <div className="auth-gate-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-gate-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <div className="auth-gate-error">{error}</div>}

            <button
              ref={loginButtonRef}
              type="submit"
              className="auth-gate-login-btn"
              disabled={loading || googleLoading || !username.trim() || !password}
            >
              {loading ? <Loader2 size={16} className="auth-gate-spin" /> : null}
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>

            <p className="auth-gate-register-line">
              Hesabın yok mu?{' '}
              <button
                type="button"
                className="auth-gate-register-link"
                onClick={() => {
                  onClose();
                  navigate('/login?tab=kayit');
                }}
              >
                Hemen Kayıt Ol
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AuthRequiredModal;