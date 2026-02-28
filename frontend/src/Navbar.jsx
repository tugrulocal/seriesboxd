import { Link } from 'react-router-dom';

function Navbar() {
  return (
    <nav className="navbar">
      <div className="logo">
        {/* Link, a etiketinin React versiyonudur, sayfayı yenilemeden geçiş yapar */}
        <Link to="/">seriesboxd</Link>
      </div>
      
      <div className="menu-linkler">
        <Link to="/">Ana Sayfa</Link>
        <Link to="/top50">Top 50</Link>
        <Link to="/login" className="login-btn">Giriş Yap</Link>
      </div>
    </nav>
  );
}

export default Navbar;