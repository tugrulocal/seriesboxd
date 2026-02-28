import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

function Top50() {
  const [diziler, setDiziler] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('http://127.0.0.1:8000/top50')
      .then(res => res.json())
      .then(data => setDiziler(data))
      .catch(err => console.error("Hata:", err));
  }, []);

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <h1 style={{ marginTop: '20px', color: '#f8fafc' }}>🏆 Top 50 Series</h1>
      
      <div className="top50-listesi">
        {diziler.map((dizi, index) => (
          <div 
            key={dizi.series_id} 
            className="top50-satir" 
            onClick={() => navigate(`/dizi/${dizi.series_id}`)}
          >
            {/* 1. Sıralama Numarası */}
            <div className="top50-sira">{index + 1}</div>
            
            {/* 2. Afiş */}
            <img 
              src={`https://image.tmdb.org/t/p/w200${dizi.poster_path}`} 
              alt={dizi.name} 
              className="top50-poster" 
            />
            
            {/* 3. Bilgiler (Başlık, Puan, Özet) */}
            <div className="top50-bilgi">  
              <div className="top50-baslik-satiri">
                <h2 className="top50-baslik">{dizi.name}</h2>
                <span className="top50-puan">★ {Number(dizi.rating).toFixed(1)}</span>
              </div>
              <p className="top50-ozet">{dizi.overview}</p>
            </div>
          </div>  
        ))}
      </div>
    </div>
  );
}

export default Top50;