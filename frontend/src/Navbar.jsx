import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, List, LogOut, Menu, Shield, UserRound, X } from 'lucide-react';
import SearchBar from './SearchBar';
import { useAuth } from './AuthContext';

function Navbar({ onSonuclar, onAnaSayfaGit }) {
  const { kullanici, cikisYap } = useAuth();
  const navigate = useNavigate();
  const [menuAcik, setMenuAcik] = useState(false);
  const menuRef = useRef(null);

  // Dropdown dışına tıklayınca kapat
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAcik(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCikis = () => {
    cikisYap();
    setMenuAcik(false);
    navigate('/');
  };

  // Kullanıcı baş harfi (avatar yoksa)
  const basharf = kullanici?.username?.[0]?.toUpperCase() ?? '?';

  const [mobileMenuAcik, setMobileMenuAcik] = useState(false);
  const [mobileSearchAcik, setMobileSearchAcik] = useState(false);
  const [heisenbergLogo, setHeisenbergLogo] = useState(false);

  return (
    <nav className="navbar">
      <div className={`logo ${mobileSearchAcik ? 'gizli-mobil-logo' : ''}`}>
        <Link to="/" onClick={(e) => { e.preventDefault(); onAnaSayfaGit && onAnaSayfaGit(); setMobileMenuAcik(false); }}>
          {heisenbergLogo ? (
            <>
              <span className="logo-element" data-number="16" data-mass="32.06"><span className="logo-element-letter">S</span></span>
              eries
              <span className="logo-element" data-number="5" data-mass="10.81"><span className="logo-element-letter">B</span></span>
              oxd
            </>
          ) : 'seriesboxd'}
        </Link>
      </div>

      {/* Mobile Top Actions: Search + Hamburger */}
      <div className={`mobile-top-actions ${mobileSearchAcik ? 'search-active' : ''}`}>
        <div className="mobile-nav-search">
          <SearchBar onOpenChange={setMobileSearchAcik} onHeisenberg={setHeisenbergLogo} onSonuclar={(data, isActive) => { if (onSonuclar) onSonuclar(data, isActive); setMobileMenuAcik(false); }} />
        </div>
        <button className="hamburger-btn" onClick={() => setMobileMenuAcik(!mobileMenuAcik)}>
          {mobileMenuAcik ? <X size={28} color="#f8fafc" /> : <Menu size={28} color="#f8fafc" />}
        </button>
      </div>

      <div className={`menu-linkler ${mobileMenuAcik ? 'mobile-open' : ''}`}>
        <Link to="/" onClick={(e) => { e.preventDefault(); onAnaSayfaGit && onAnaSayfaGit(); setMobileMenuAcik(false); }}>Ana Sayfa</Link>
        <Link to="/top50" onClick={() => setMobileMenuAcik(false)}>Top 50</Link>
        <Link to="/discovery" onClick={() => setMobileMenuAcik(false)} className="discovery-link">Keşfet</Link>
        <SearchBar onHeisenberg={setHeisenbergLogo} onSonuclar={(data, isActive) => { if (onSonuclar) onSonuclar(data, isActive); setMobileMenuAcik(false); }} />

        {kullanici ? (
          /* Giriş yapıldıysa avatar + dropdown */
          <div className="kullanici-menu" ref={menuRef}>
            <button
              className="avatar-btn"
              type="button"
              onClick={() => setMenuAcik(p => !p)}
              title={kullanici.username}
              aria-haspopup="menu"
              aria-expanded={menuAcik}
            >
              {kullanici.avatar
                ? <img src={kullanici.avatar} alt={kullanici.username} className="avatar-img" />
                : <span className="avatar-harf">{basharf}</span>
              }
              <ChevronDown size={12} className={`avatar-caret ${menuAcik ? 'acik' : ''}`} />
            </button>

            {menuAcik && (
              <div className="kullanici-dropdown">
                <div className="dropdown-kullanici-bilgi">
                  <div className="dropdown-avatar">
                    {kullanici.avatar
                      ? <img src={kullanici.avatar} alt="" />
                      : <span>{basharf}</span>
                    }
                  </div>
                  <div>
                    <p className="dropdown-username">@{kullanici.username}</p>
                    <p className="dropdown-email">{kullanici.email}</p>
                  </div>
                </div>
                <div className="dropdown-ayirici" />
                <Link to="/profil" className="dropdown-item" onClick={() => { setMenuAcik(false); setMobileMenuAcik(false); }}>
                  <UserRound size={16} strokeWidth={2} />
                  <span>Profilim</span>
                </Link>
                <Link to="/listelerim" className="dropdown-item" onClick={() => { setMenuAcik(false); setMobileMenuAcik(false); }}>
                  <List size={16} strokeWidth={2} />
                  <span>Listelerim</span>
                </Link>
                {kullanici?.email?.toLowerCase() === 'seriesboxd@gmail.com' && (
                  <Link to="/admin-dashboard" className="dropdown-item" onClick={() => { setMenuAcik(false); setMobileMenuAcik(false); }}>
                    <Shield size={16} strokeWidth={2} />
                    <span>Admin Panel</span>
                  </Link>
                )}
                <div className="dropdown-ayirici" />
                <button className="dropdown-item cikis" onClick={() => { handleCikis(); setMobileMenuAcik(false); }}>
                  <LogOut size={16} strokeWidth={2} />
                  <span>Çıkış Yap</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Giriş yapılmadıysa Giriş Yap butonu */
          <Link to="/login" className="login-btn" onClick={() => setMobileMenuAcik(false)}>Giriş Yap</Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;