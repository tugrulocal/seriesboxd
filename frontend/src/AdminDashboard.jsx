import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
    Search, Plus, Trash2, Edit3, Download, X, Film, Users, Database,
    ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle,
    ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal
} from 'lucide-react';
import API_BASE from './config';
import './AdminDashboard.css';

const EMPTY_FORM = {
    series_id: '', name: '', rating: '', overview: '', poster_path: '',
    status: '', networks: '', created_by: '', genres: '', backdrop_path: '',
    vote_count: '', imdb_id: '', origin_country: '', original_language: '', first_air_date: ''
};

function AdminDashboard() {
    const { kullanici, yukleniyor, isAdmin, cikisYap } = useAuth();
    const token = localStorage.getItem('sb_token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (yukleniyor) return null;
    if (!kullanici || !isAdmin) return <Navigate to="/" replace />;

    return <AdminPanel headers={headers} cikisYap={cikisYap} />;
}

function AdminPanel({ headers, cikisYap }) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState({ series_count: 0, users_count: 0 });
    const [authError, setAuthError] = useState(false);
    const [backendError, setBackendError] = useState(false);

    // Series list state
    const [seriesList, setSeriesList] = useState([]);
    const [seriesTotal, setSeriesTotal] = useState(0);
    const [seriesPage, setSeriesPage] = useState(1);
    const [seriesSearch, setSeriesSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');

    // Sort & filter state
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');
    const [statusFilter, setStatusFilter] = useState('');
    const [genreFilter, setGenreFilter] = useState('');
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    // Pending filter values (applied only on "Uygula")
    const [pendingStatus, setPendingStatus] = useState('');
    const [pendingGenre, setPendingGenre] = useState('');
    const [pendingSortBy, setPendingSortBy] = useState('name');
    const [pendingSortOrder, setPendingSortOrder] = useState('asc');
    const filterRef = useRef(null);

    // Users modal state
    const [usersModalOpen, setUsersModalOpen] = useState(false);
    const [usersList, setUsersList] = useState([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [usersPage, setUsersPage] = useState(1);
    const [usersSearch, setUsersSearch] = useState('');
    const [usersSearchInput, setUsersSearchInput] = useState('');
    const [usersLoading, setUsersLoading] = useState(false);

    // TMDB state
    const [tmdbQuery, setTmdbQuery] = useState('');
    const [tmdbIdInput, setTmdbIdInput] = useState('');
    const [tmdbResults, setTmdbResults] = useState([]);
    const [tmdbLoading, setTmdbLoading] = useState(false);
    const [importingId, setImportingId] = useState(null);

    // Form modal state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);

    // Misc
    const [toast, setToast] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const checkAuth = useCallback(async (res) => {
        if (res.status === 401 || res.status === 403) { setAuthError(true); return null; }
        if (res.status === 404) { setBackendError(true); return null; }
        if (!res.ok) return null;
        return res.json();
    }, []);

    // Fetch stats
    useEffect(() => {
        fetch(`${API_BASE}/admin/stats`, { headers })
            .then(checkAuth)
            .then(data => { if (data) setStats(data); })
            .catch(() => {});
    }, []);

    // Close filter panel on outside click
    useEffect(() => {
        if (!showFilterPanel) return;
        const handler = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setShowFilterPanel(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showFilterPanel]);

    // Fetch series list
    const fetchSeries = useCallback(() => {
        const params = new URLSearchParams({ page: seriesPage, per_page: 20, sort_by: sortBy, sort_order: sortOrder });
        if (seriesSearch) params.set('q', seriesSearch);
        if (statusFilter) params.set('status_filter', statusFilter);
        if (genreFilter) params.set('genre_filter', genreFilter);
        fetch(`${API_BASE}/admin/series?${params}`, { headers })
            .then(checkAuth)
            .then(data => {
                if (data) { setSeriesList(data.series); setSeriesTotal(data.total); }
            })
            .catch(() => {});
    }, [seriesPage, seriesSearch, sortBy, sortOrder, statusFilter, genreFilter]);

    useEffect(() => { fetchSeries(); }, [fetchSeries]);

    const totalPages = Math.ceil(seriesTotal / 20);

    // Column sort click handler
    const handleColumnSort = (col) => {
        if (sortBy === col) {
            setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortOrder('asc');
        }
        setSeriesPage(1);
    };

    const SortIcon = ({ col }) => {
        if (sortBy !== col) return <ChevronsUpDown size={13} className="sort-icon-neutral" />;
        return sortOrder === 'asc'
            ? <ChevronUp size={13} className="sort-icon-active" />
            : <ChevronDown size={13} className="sort-icon-active" />;
    };

    // Filter panel open — sync pending values
    const openFilterPanel = () => {
        setPendingStatus(statusFilter);
        setPendingGenre(genreFilter);
        setPendingSortBy(sortBy);
        setPendingSortOrder(sortOrder);
        setShowFilterPanel(true);
    };

    const applyFilters = () => {
        setStatusFilter(pendingStatus);
        setGenreFilter(pendingGenre);
        setSortBy(pendingSortBy);
        setSortOrder(pendingSortOrder);
        setSeriesPage(1);
        setShowFilterPanel(false);
    };

    const resetFilters = () => {
        setPendingStatus('');
        setPendingGenre('');
        setPendingSortBy('name');
        setPendingSortOrder('asc');
    };

    const hasActiveFilters = statusFilter || genreFilter || sortBy !== 'name' || sortOrder !== 'asc';

    // Search
    const handleSearch = (e) => {
        e.preventDefault();
        setSeriesPage(1);
        setSeriesSearch(searchInput);
    };

    // Fetch users
    const fetchUsers = useCallback(() => {
        setUsersLoading(true);
        const params = new URLSearchParams({ page: usersPage, per_page: 50 });
        if (usersSearch) params.set('q', usersSearch);
        fetch(`${API_BASE}/admin/users?${params}`, { headers })
            .then(checkAuth)
            .then(data => {
                if (data) { setUsersList(data.users); setUsersTotal(data.total); }
            })
            .catch(() => {})
            .finally(() => setUsersLoading(false));
    }, [usersPage, usersSearch]);

    useEffect(() => {
        if (usersModalOpen) fetchUsers();
    }, [usersModalOpen, fetchUsers]);

    const usersTotalPages = Math.ceil(usersTotal / 50);

    const handleUsersSearch = (e) => {
        e.preventDefault();
        setUsersPage(1);
        setUsersSearch(usersSearchInput);
    };

    // Form handlers
    const openAddForm = () => { setEditingId(null); setFormData({ ...EMPTY_FORM }); setShowForm(true); };
    const openEditForm = (series) => {
        setEditingId(series.series_id);
        setFormData({
            series_id: series.series_id || '', name: series.name || '',
            rating: series.rating || '', overview: series.overview || '',
            poster_path: series.poster_path || '', status: series.status || '',
            networks: series.networks || '', created_by: series.created_by || '',
            genres: series.genres || '', backdrop_path: series.backdrop_path || '',
            vote_count: series.vote_count || '', imdb_id: series.imdb_id || '',
            origin_country: series.origin_country || '',
            original_language: series.original_language || '',
            first_air_date: series.first_air_date || ''
        });
        setShowForm(true);
    };
    const handleFormChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    const handleSave = async () => {
        if (!formData.name) { showToast('Dizi adı zorunludur.', 'error'); return; }
        setSaving(true);
        try {
            if (editingId) {
                const body = {};
                Object.entries(formData).forEach(([k, v]) => {
                    if (k === 'series_id') return;
                    if (v !== '' && v !== null) {
                        if (k === 'rating') body[k] = parseFloat(v);
                        else if (k === 'vote_count') body[k] = parseInt(v);
                        else body[k] = v;
                    }
                });
                const res = await fetch(`${API_BASE}/admin/series/${editingId}`, { method: 'PUT', headers, body: JSON.stringify(body) });
                if (res.status === 401 || res.status === 403) { setAuthError(true); setSaving(false); setShowForm(false); return; }
                if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Hata'); }
                showToast('Dizi güncellendi.');
            } else {
                if (!formData.series_id) { showToast('Series ID zorunludur.', 'error'); setSaving(false); return; }
                const body = { ...formData };
                body.series_id = parseInt(body.series_id);
                if (body.rating) body.rating = parseFloat(body.rating);
                if (body.vote_count) body.vote_count = parseInt(body.vote_count);
                Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });
                const res = await fetch(`${API_BASE}/admin/series`, { method: 'POST', headers, body: JSON.stringify(body) });
                if (res.status === 401 || res.status === 403) { setAuthError(true); setSaving(false); setShowForm(false); return; }
                if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Hata'); }
                showToast('Dizi eklendi.');
            }
            setShowForm(false);
            fetchSeries();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (seriesId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/series/${seriesId}`, { method: 'DELETE', headers });
            if (res.status === 401 || res.status === 403) { setAuthError(true); setDeleteConfirm(null); return; }
            if (!res.ok) throw new Error('Silinemedi');
            showToast('Dizi silindi.');
            setDeleteConfirm(null);
            fetchSeries();
            fetch(`${API_BASE}/admin/stats`, { headers }).then(r => r.ok ? r.json() : null).then(d => { if (d) setStats(d); });
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // TMDB
    const handleTmdbSearch = async (e) => {
        e.preventDefault();
        if (!tmdbQuery.trim()) return;
        setTmdbLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/tmdb/search?q=${encodeURIComponent(tmdbQuery)}`, { headers });
            if (res.status === 401 || res.status === 403) { setAuthError(true); return; }
            if (res.status === 404) { setBackendError(true); return; }
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'TMDB arama hatası'); }
            const data = await res.json();
            setTmdbResults(data.results || []);
            if ((data.results || []).length === 0) showToast('Sonuç bulunamadı.', 'error');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setTmdbLoading(false);
        }
    };

    const handleTmdbImport = async (tmdbId) => {
        setImportingId(tmdbId);
        try {
            const res = await fetch(`${API_BASE}/admin/tmdb/import/${tmdbId}`, { method: 'POST', headers });
            if (res.status === 401 || res.status === 403) { setAuthError(true); return; }
            if (res.status === 404) { setBackendError(true); return; }
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'İçe aktarma hatası'); }
            showToast(`Dizi başarıyla içe aktarıldı! (ID: ${tmdbId})`);
            fetchSeries();
            fetch(`${API_BASE}/admin/stats`, { headers }).then(r => r.ok ? r.json() : null).then(d => { if (d) setStats(d); });
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setImportingId(null);
        }
    };

    const handleTmdbById = async (e) => {
        e.preventDefault();
        if (!tmdbIdInput.trim()) return;
        const id = parseInt(tmdbIdInput);
        if (isNaN(id)) { showToast('Geçerli bir TMDB ID girin.', 'error'); return; }
        handleTmdbImport(id);
    };

    // User avatar color from username
    const avatarColor = (name) => {
        const colors = ['#38bdf8','#818cf8','#f472b6','#34d399','#fb923c','#a78bfa','#f59e0b'];
        let h = 0;
        for (let i = 0; i < (name || '').length; i++) h = (name.charCodeAt(i) + h * 31) >>> 0;
        return colors[h % colors.length];
    };

    return (
        <div className="admin-dashboard">
            {/* Backend Error Banner */}
            {backendError && (
                <div className="admin-auth-error admin-warn-banner">
                    <AlertTriangle size={20} />
                    <div>
                        <strong>Backend Yeniden Başlatılmalı</strong>
                        <p>Admin endpoint'leri bulunamadı (404). Lütfen backend'i yeniden başlatın: <code>uvicorn main:app --reload</code></p>
                    </div>
                </div>
            )}

            {/* Auth Error Banner */}
            {authError && (
                <div className="admin-auth-error">
                    <AlertTriangle size={20} />
                    <div>
                        <strong>Erişim Reddedildi (403)</strong>
                        <p>Admin paneline erişmek için çıkış yapıp <strong>seriesboxd@gmail.com</strong> hesabıyla (Google dahil) tekrar giriş yapın.</p>
                    </div>
                    <button className="admin-relogin-btn" onClick={() => { cikisYap(); window.location.href = '/login'; }}>
                        Yeniden Giriş Yap
                    </button>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`admin-toast ${toast.type}`}>
                    {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="admin-header">
                <h1>Admin Panel</h1>
                <p>Seriesboxd Yönetim Paneli</p>
            </div>

            {/* Tabs */}
            <div className="admin-tabs">
                <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
                    <Database size={18} /> Dashboard
                </button>
                <button className={activeTab === 'series' ? 'active' : ''} onClick={() => setActiveTab('series')}>
                    <Film size={18} /> Dizi Yönetimi
                </button>
                <button className={activeTab === 'tmdb' ? 'active' : ''} onClick={() => setActiveTab('tmdb')}>
                    <Download size={18} /> TMDB Ekle
                </button>
            </div>

            {/* ── Dashboard Tab ── */}
            {activeTab === 'dashboard' && (
                <div className="admin-stats-grid">
                    <div className="admin-stat-card">
                        <div className="stat-icon"><Film size={32} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.series_count}</span>
                            <span className="stat-label">Toplam Dizi</span>
                        </div>
                    </div>
                    <div className="admin-stat-card admin-stat-clickable" onClick={() => setUsersModalOpen(true)} title="Tıkla: Kullanıcı Listesi">
                        <div className="stat-icon users-icon"><Users size={32} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.users_count}</span>
                            <span className="stat-label">Toplam Kullanıcı <span className="stat-label-hint">↗ Listeyi Gör</span></span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Series Tab ── */}
            {activeTab === 'series' && (
                <div className="admin-series-section">
                    <div className="admin-series-toolbar">
                        <form onSubmit={handleSearch} className="admin-search-form">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Dizi ara..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                            />
                            <button type="submit">Ara</button>
                        </form>

                        {/* Filter & Sort panel */}
                        <div className="admin-filter-wrapper" ref={filterRef}>
                            <button
                                className={`admin-filter-btn${hasActiveFilters ? ' has-filters' : ''}`}
                                onClick={openFilterPanel}
                            >
                                <SlidersHorizontal size={16} />
                                Filtrele &amp; Sırala
                                {hasActiveFilters && <span className="filter-badge" />}
                            </button>

                            {showFilterPanel && (
                                <div className="admin-filter-panel">
                                    <div className="filter-section">
                                        <div className="filter-label">Sıralama Kriteri</div>
                                        <div className="filter-radio-group">
                                            {[['name','Ada Göre'],['rating','Puana Göre'],['first_air_date','Tarihe Göre'],['vote_count','Oy Sayısına Göre']].map(([val, label]) => (
                                                <label key={val} className="filter-radio">
                                                    <input type="radio" name="sort_by" value={val} checked={pendingSortBy === val} onChange={() => setPendingSortBy(val)} />
                                                    {label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="filter-section">
                                        <div className="filter-label">Sıralama Yönü</div>
                                        <div className="filter-radio-group filter-row">
                                            <label className="filter-radio">
                                                <input type="radio" name="sort_order" value="asc" checked={pendingSortOrder === 'asc'} onChange={() => setPendingSortOrder('asc')} />
                                                <ChevronUp size={14} /> Artan
                                            </label>
                                            <label className="filter-radio">
                                                <input type="radio" name="sort_order" value="desc" checked={pendingSortOrder === 'desc'} onChange={() => setPendingSortOrder('desc')} />
                                                <ChevronDown size={14} /> Azalan
                                            </label>
                                        </div>
                                    </div>
                                    <div className="filter-section">
                                        <div className="filter-label">Durum</div>
                                        <div className="filter-radio-group">
                                            {[['','Tümü'],['Returning Series','Yayında'],['Ended','Bitti'],['Canceled','İptal Edildi']].map(([val, label]) => (
                                                <label key={val} className="filter-radio">
                                                    <input type="radio" name="status_filter" value={val} checked={pendingStatus === val} onChange={() => setPendingStatus(val)} />
                                                    {label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="filter-section">
                                        <div className="filter-label">Tür (metin ara)</div>
                                        <input
                                            className="filter-text-input"
                                            type="text"
                                            placeholder="örn: Drama, Korku..."
                                            value={pendingGenre}
                                            onChange={e => setPendingGenre(e.target.value)}
                                        />
                                    </div>
                                    <div className="filter-actions">
                                        <button className="admin-cancel-btn" onClick={resetFilters}>Sıfırla</button>
                                        <button className="admin-save-btn" onClick={applyFilters}><Check size={14} /> Uygula</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className="admin-add-btn" onClick={openAddForm}>
                            <Plus size={18} /> Yeni Dizi
                        </button>
                    </div>

                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Poster</th>
                                    <th className="th-sortable" onClick={() => handleColumnSort('name')}>
                                        Ad <SortIcon col="name" />
                                    </th>
                                    <th className="th-sortable" onClick={() => handleColumnSort('rating')}>
                                        Puan <SortIcon col="rating" />
                                    </th>
                                    <th>Tür</th>
                                    <th className="th-sortable" onClick={() => handleColumnSort('first_air_date')}>
                                        Tarih <SortIcon col="first_air_date" />
                                    </th>
                                    <th>İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {seriesList.map(s => (
                                    <tr key={s.series_id}>
                                        <td>
                                            {s.poster_path ? (
                                                <img src={`https://image.tmdb.org/t/p/w92${s.poster_path}`} alt="" className="admin-poster-thumb" />
                                            ) : (
                                                <div className="admin-poster-placeholder"><Film size={20} /></div>
                                            )}
                                        </td>
                                        <td className="admin-series-name">{s.name}</td>
                                        <td><span className="admin-rating">{s.rating ? Number(s.rating).toFixed(1) : '-'}</span></td>
                                        <td className="admin-genres">{s.genres || '-'}</td>
                                        <td className="admin-date">{s.first_air_date ? s.first_air_date.toString().substring(0, 4) : '-'}</td>
                                        <td className="admin-actions">
                                            <button className="admin-edit-btn" onClick={() => openEditForm(s)} title="Düzenle"><Edit3 size={16} /></button>
                                            <button className="admin-delete-btn" onClick={() => setDeleteConfirm(s.series_id)} title="Sil"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {seriesList.length === 0 && (
                                    <tr><td colSpan="6" className="admin-empty">Dizi bulunamadı.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="admin-pagination">
                            <button disabled={seriesPage <= 1} onClick={() => setSeriesPage(p => p - 1)}><ChevronLeft size={18} /></button>
                            <span>{seriesPage} / {totalPages}</span>
                            <button disabled={seriesPage >= totalPages} onClick={() => setSeriesPage(p => p + 1)}><ChevronRight size={18} /></button>
                        </div>
                    )}
                </div>
            )}

            {/* ── TMDB Tab ── */}
            {activeTab === 'tmdb' && (
                <div className="admin-tmdb-section">
                    <div className="admin-tmdb-block">
                        <h3>Dizi Adı ile Ara</h3>
                        <form onSubmit={handleTmdbSearch} className="admin-search-form">
                            <Search size={18} />
                            <input type="text" placeholder="Dizi adı yazın..." value={tmdbQuery} onChange={e => setTmdbQuery(e.target.value)} />
                            <button type="submit" disabled={tmdbLoading}>
                                {tmdbLoading ? <Loader2 size={16} className="spin" /> : 'Ara'}
                            </button>
                        </form>
                    </div>

                    <div className="admin-tmdb-block">
                        <h3>TMDB ID ile Hızlı Ekle</h3>
                        <form onSubmit={handleTmdbById} className="admin-search-form">
                            <Database size={18} />
                            <input type="text" placeholder="TMDB ID girin (örn: 1396)" value={tmdbIdInput} onChange={e => setTmdbIdInput(e.target.value)} />
                            <button type="submit" disabled={importingId !== null}>
                                {importingId !== null && importingId === parseInt(tmdbIdInput)
                                    ? <Loader2 size={16} className="spin" />
                                    : 'İçe Aktar'}
                            </button>
                        </form>
                    </div>

                    {tmdbResults.length > 0 && (
                        <div className="admin-tmdb-results">
                            <h3>Sonuçlar</h3>
                            <div className="admin-tmdb-grid">
                                {tmdbResults.map(item => (
                                    <div key={item.id} className="admin-tmdb-card">
                                        {item.poster_path ? (
                                            <img src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt={item.name} className="admin-tmdb-poster" />
                                        ) : (
                                            <div className="admin-tmdb-poster-placeholder"><Film size={32} /></div>
                                        )}
                                        <div className="admin-tmdb-info">
                                            <h4>{item.name}</h4>
                                            <p className="admin-tmdb-meta">
                                                {item.first_air_date ? item.first_air_date.substring(0, 4) : '?'} &middot; ⭐ {item.vote_average ? Number(item.vote_average).toFixed(1) : '-'}
                                            </p>
                                            <p className="admin-tmdb-overview">{item.overview || 'Özet yok.'}</p>
                                            <button className="admin-import-btn" onClick={() => handleTmdbImport(item.id)} disabled={importingId === item.id}>
                                                {importingId === item.id
                                                    ? <><Loader2 size={14} className="spin" /> İçe Aktarılıyor...</>
                                                    : <><Download size={14} /> İçe Aktar</>}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Form Modal ── */}
            {showForm && (
                <div className="admin-modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2>{editingId ? 'Dizi Düzenle' : 'Yeni Dizi Ekle'}</h2>
                            <button className="admin-modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <div className="admin-modal-body">
                            <div className="admin-form-grid">
                                {!editingId && (
                                    <div className="admin-form-group full">
                                        <label>Series ID (TMDB ID)</label>
                                        <input type="number" value={formData.series_id} onChange={e => handleFormChange('series_id', e.target.value)} />
                                    </div>
                                )}
                                <div className="admin-form-group full">
                                    <label>Dizi Adı</label>
                                    <input type="text" value={formData.name} onChange={e => handleFormChange('name', e.target.value)} />
                                </div>
                                <div className="admin-form-group">
                                    <label>Puan</label>
                                    <input type="number" step="0.1" min="0" max="10" value={formData.rating} onChange={e => handleFormChange('rating', e.target.value)} />
                                </div>
                                <div className="admin-form-group">
                                    <label>Durum</label>
                                    <input type="text" value={formData.status} onChange={e => handleFormChange('status', e.target.value)} placeholder="Returning Series / Ended" />
                                </div>
                                <div className="admin-form-group">
                                    <label>Türler</label>
                                    <input type="text" value={formData.genres} onChange={e => handleFormChange('genres', e.target.value)} placeholder="Drama, Bilim Kurgu" />
                                </div>
                                <div className="admin-form-group">
                                    <label>İlk Yayın Tarihi</label>
                                    <input type="text" value={formData.first_air_date} onChange={e => handleFormChange('first_air_date', e.target.value)} placeholder="2020-01-15" />
                                </div>
                                <div className="admin-form-group">
                                    <label>IMDB ID</label>
                                    <input type="text" value={formData.imdb_id} onChange={e => handleFormChange('imdb_id', e.target.value)} placeholder="tt1234567" />
                                </div>
                                <div className="admin-form-group">
                                    <label>Kanallar</label>
                                    <input type="text" value={formData.networks} onChange={e => handleFormChange('networks', e.target.value)} placeholder="HBO, Netflix" />
                                </div>
                                <div className="admin-form-group full">
                                    <label>Poster Path</label>
                                    <input type="text" value={formData.poster_path} onChange={e => handleFormChange('poster_path', e.target.value)} placeholder="/yXsGFpR8h.jpg" />
                                </div>
                                {formData.poster_path && (
                                    <div className="admin-form-group full admin-poster-preview-wrapper">
                                        <img src={`https://image.tmdb.org/t/p/w185${formData.poster_path}`} alt="Poster" className="admin-poster-preview" />
                                    </div>
                                )}
                                <div className="admin-form-group full">
                                    <label>Özet</label>
                                    <textarea rows={4} value={formData.overview} onChange={e => handleFormChange('overview', e.target.value)} />
                                </div>
                            </div>
                        </div>
                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowForm(false)}>İptal</button>
                            <button className="admin-save-btn" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                                {editingId ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm ── */}
            {deleteConfirm && (
                <div className="admin-modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="admin-confirm-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={48} className="confirm-icon" />
                        <h3>Diziyi Sil</h3>
                        <p>Bu dizi ve tüm ilişkili veriler (sezonlar, bölümler, oyuncular, puanlar, yorumlar) silinecektir. Bu işlem geri alınamaz.</p>
                        <div className="admin-confirm-actions">
                            <button className="admin-cancel-btn" onClick={() => setDeleteConfirm(null)}>Vazgeç</button>
                            <button className="admin-delete-confirm-btn" onClick={() => handleDelete(deleteConfirm)}>Sil</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Users Modal ── */}
            {usersModalOpen && (
                <div className="admin-modal-overlay" onClick={() => setUsersModalOpen(false)}>
                    <div className="admin-users-modal" onClick={e => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2><Users size={20} /> Kullanıcılar <span className="users-total-badge">{usersTotal}</span></h2>
                            <button className="admin-modal-close" onClick={() => setUsersModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="admin-users-search-bar">
                            <form onSubmit={handleUsersSearch} className="admin-search-form">
                                <Search size={17} />
                                <input type="text" placeholder="Kullanıcı adı veya e-posta ara..." value={usersSearchInput} onChange={e => setUsersSearchInput(e.target.value)} />
                                <button type="submit">Ara</button>
                            </form>
                        </div>
                        <div className="admin-users-table-wrapper">
                            {usersLoading ? (
                                <div className="admin-users-loading"><Loader2 size={28} className="spin" /></div>
                            ) : (
                                <table className="admin-table admin-users-table">
                                    <thead>
                                        <tr>
                                            <th>Kullanıcı</th>
                                            <th>E-posta</th>
                                            <th>Kayıt Tarihi</th>
                                            <th>Durum</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usersList.map(u => (
                                            <tr key={u.user_id}>
                                                <td>
                                                    <div className="admin-user-row">
                                                        <div className="admin-user-avatar" style={{ background: avatarColor(u.username) }}>
                                                            {u.username ? u.username[0].toUpperCase() : '?'}
                                                        </div>
                                                        <span className="admin-username">@{u.username}</span>
                                                    </div>
                                                </td>
                                                <td className="admin-user-email">{u.email}</td>
                                                <td className="admin-user-date">
                                                    {u.created_at ? new Date(u.created_at).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' }) : '-'}
                                                </td>
                                                <td>
                                                    <span className={`admin-status ${u.is_verified ? 'active' : 'ended'}`}>
                                                        {u.is_verified ? 'Doğrulandı' : 'Bekliyor'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {usersList.length === 0 && !usersLoading && (
                                            <tr><td colSpan="4" className="admin-empty">Kullanıcı bulunamadı.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        {usersTotalPages > 1 && (
                            <div className="admin-pagination admin-users-pagination">
                                <button disabled={usersPage <= 1} onClick={() => setUsersPage(p => p - 1)}><ChevronLeft size={18} /></button>
                                <span>{usersPage} / {usersTotalPages}</span>
                                <button disabled={usersPage >= usersTotalPages} onClick={() => setUsersPage(p => p + 1)}><ChevronRight size={18} /></button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
