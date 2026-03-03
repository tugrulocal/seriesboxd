import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

  return (
    <nav className="navbar">
      <div className="logo">
        <Link to="/" onClick={(e) => { e.preventDefault(); onAnaSayfaGit && onAnaSayfaGit(); }}>seriesboxd</Link>
      </div>

      <div className="menu-linkler">
        <Link to="/" onClick={(e) => { e.preventDefault(); onAnaSayfaGit && onAnaSayfaGit(); }}>Ana Sayfa</Link>
        <Link to="/top50">Top 50</Link>
        <SearchBar onSonuclar={onSonuclar} />

        {kullanici ? (
          /* Giriş yapıldıysa avatar + dropdown */
          <div className="kullanici-menu" ref={menuRef}>
            <button
              className="avatar-btn"
              onClick={() => setMenuAcik(p => !p)}
              title={kullanici.username}
            >
              {kullanici.avatar
                ? <img src={kullanici.avatar} alt={kullanici.username} className="avatar-img" />
                : <span className="avatar-harf">{basharf}</span>
              }
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
                <Link to="/profil" className="dropdown-item" onClick={() => setMenuAcik(false)}>
                  👤 Profilim
                </Link>
                <Link to="/listelerim" className="dropdown-item" onClick={() => setMenuAcik(false)}>
                  📋 Listelerim
                </Link>
                <div className="dropdown-ayirici" />
                <button className="dropdown-item cikis" onClick={handleCikis}>
                  🚪 Çıkış Yap
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Giriş yapılmadıysa Giriş Yap butonu */
          <Link to="/login" className="login-btn">Giriş Yap</Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;