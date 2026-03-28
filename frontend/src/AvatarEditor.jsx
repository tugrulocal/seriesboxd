import { useState, useEffect, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { X, Camera, Upload, Search, Trash2, Loader, Check, ChevronDown } from 'lucide-react';
import API_BASE from './config';
import './AvatarEditor.css';

// Canvas ile kırpılmış görseli oluştur
async function getCroppedImg(imageSrc, pixelCrop) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = imageSrc;
    });

    const canvas = document.createElement('canvas');
    const size = 400;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Yuvarlak maske
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0, size, size
    );

    return canvas.toDataURL('image/webp', 0.9);
}

function AvatarEditor({ isOpen, onClose, currentAvatar, onAvatarChange }) {
    const [activeTab, setActiveTab] = useState('presets'); // 'presets' | 'upload'
    const [categories, setCategories] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState(null);
    const [selectedPreset, setSelectedPreset] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Upload state
    const [uploadedImage, setUploadedImage] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [compressing, setCompressing] = useState(false);
    const fileInputRef = useRef(null);

    const token = localStorage.getItem('sb_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    // Avatar önerilerini yükle — modal her açıldığında yeniden dene
    useEffect(() => {
        if (!isOpen || activeTab !== 'presets') return;

        setLoadingSuggestions(true);
        setCategories([]);
        fetch(`${API_BASE}/profile/avatar-suggestions`, { headers })
            .then(res => res.json())
            .then(data => {
                if (data.categories && data.categories.length > 0) {
                    setCategories(data.categories);
                    setExpandedCategory(0);
                }
            })
            .catch(err => console.error('Avatar önerileri çekilemedi:', err))
            .finally(() => setLoadingSuggestions(false));
    }, [isOpen, activeTab]);

    const onCropComplete = useCallback((croppedArea, croppedAreaPx) => {
        setCroppedAreaPixels(croppedAreaPx);
    }, []);

    // Dosya seçme
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Lütfen bir görsel dosyası seçin.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('Dosya 10MB\'dan büyük olamaz.');
            return;
        }

        // Dosyayı browser-image-compression ile sıkıştır
        setCompressing(true);
        try {
            const options = {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1200,
                useWebWorker: true,
                fileType: 'image/webp',
            };
            const compressedFile = await imageCompression(file, options);
            const reader = new FileReader();
            reader.onload = () => {
                setUploadedImage(reader.result);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
            };
            reader.readAsDataURL(compressedFile);
        } catch (err) {
            console.error('Sıkıştırma hatası:', err);
            // Fallback: orijinal dosyayı kullan
            const reader = new FileReader();
            reader.onload = () => {
                setUploadedImage(reader.result);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
            };
            reader.readAsDataURL(file);
        } finally {
            setCompressing(false);
        }
    };

    // Drag & drop
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const fakeEvent = { target: { files: [file] } };
            handleFileSelect(fakeEvent);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    // Kırpılmış görseli Cloudinary'ye yükle
    const handleUploadCropped = async () => {
        if (!uploadedImage || !croppedAreaPixels) return;

        setSaving(true);
        try {
            const croppedBase64 = await getCroppedImg(uploadedImage, croppedAreaPixels);

            const res = await fetch(`${API_BASE}/profile/avatar/upload`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: croppedBase64 }),
            });

            const data = await res.json();
            if (res.ok && data.avatar_url) {
                onAvatarChange(data.avatar_url);
                handleClose();
            } else {
                alert(data.detail || 'Yükleme başarısız.');
            }
        } catch (err) {
            console.error('Upload hatası:', err);
            alert('Bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    // Hazır avatar seç
    const handlePresetSelect = async (avatarUrl) => {
        setSelectedPreset(avatarUrl);
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/profile/avatar/preset`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar_url: avatarUrl }),
            });
            const data = await res.json();
            if (res.ok && data.avatar_url) {
                onAvatarChange(data.avatar_url);
                handleClose();
            } else {
                alert(data.detail || 'Seçim başarısız.');
            }
        } catch (err) {
            console.error('Preset seçim hatası:', err);
            alert('Bir hata oluştu.');
        } finally {
            setSaving(false);
            setSelectedPreset(null);
        }
    };

    // Avatar sil
    const handleDeleteAvatar = async () => {
        if (!currentAvatar) return;
        setDeleting(true);
        try {
            const res = await fetch(`${API_BASE}/profile/avatar`, {
                method: 'DELETE',
                headers,
            });
            if (res.ok) {
                onAvatarChange(null);
                handleClose();
            }
        } catch (err) {
            console.error('Silme hatası:', err);
        } finally {
            setDeleting(false);
        }
    };

    const handleClose = () => {
        setUploadedImage(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setSelectedPreset(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="avatar-editor-overlay" onClick={handleClose}>
            <div className="avatar-editor-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="ae-header">
                    <h2 className="ae-title">Profil Resmini Düzenle</h2>
                    <button className="ae-close" onClick={handleClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="ae-tabs">
                    <button
                        className={`ae-tab ${activeTab === 'presets' ? 'active' : ''}`}
                        onClick={() => setActiveTab('presets')}
                    >
                        <Camera size={16} />
                        Avatarlar
                    </button>
                    <button
                        className={`ae-tab ${activeTab === 'upload' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upload')}
                    >
                        <Upload size={16} />
                        Fotoğraf Yükle
                    </button>
                </div>

                {/* Presets Tab */}
                {activeTab === 'presets' && (
                    <div className="ae-presets-content">
                        {loadingSuggestions ? (
                            <div className="ae-loading">
                                <Loader size={24} className="ae-spinner" />
                                <span>Karakter avatarları yükleniyor...</span>
                            </div>
                        ) : categories.length === 0 ? (
                            <div className="ae-empty">
                                <p>Henüz avatar önerisi bulunamadı.</p>
                                <p className="ae-empty-sub">Dizi izledikçe kişiselleştirilmiş avatarlar burada görünecek.</p>
                            </div>
                        ) : (
                            <div className="ae-categories">
                                {categories.map((cat, catIdx) => (
                                    <div key={cat.tmdb_id} className="ae-category">
                                        <button
                                            className={`ae-category-header ${expandedCategory === catIdx ? 'expanded' : ''}`}
                                            onClick={() => setExpandedCategory(expandedCategory === catIdx ? null : catIdx)}
                                        >
                                            <span className="ae-category-name">{cat.series_name}</span>
                                            <span className="ae-category-count">{cat.avatars.length} karakter</span>
                                            <ChevronDown size={16} className={`ae-category-chevron ${expandedCategory === catIdx ? 'rotated' : ''}`} />
                                        </button>
                                        {expandedCategory === catIdx && (
                                            <div className="ae-avatar-grid">
                                                {cat.avatars.map((avatar, i) => (
                                                    <button
                                                        key={`${cat.tmdb_id}-${i}`}
                                                        className={`ae-avatar-item ${selectedPreset === avatar.image ? 'selecting' : ''}`}
                                                        onClick={() => handlePresetSelect(avatar.image)}
                                                        disabled={saving}
                                                        title={`${avatar.name} — ${avatar.character}`}
                                                    >
                                                        <div className="ae-avatar-img-wrap">
                                                            <img
                                                                src={avatar.image}
                                                                alt={avatar.name}
                                                                loading="lazy"
                                                                decoding="async"
                                                            />
                                                            {selectedPreset === avatar.image && saving && (
                                                                <div className="ae-avatar-loading">
                                                                    <Loader size={20} className="ae-spinner" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="ae-avatar-name">{avatar.character || avatar.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Upload Tab */}
                {activeTab === 'upload' && (
                    <div className="ae-upload-content">
                        {!uploadedImage ? (
                            <div
                                className="ae-dropzone"
                                onClick={() => fileInputRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                            >
                                {compressing ? (
                                    <>
                                        <Loader size={32} className="ae-spinner" />
                                        <p className="ae-dropzone-text">Görsel sıkıştırılıyor...</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} className="ae-dropzone-icon" />
                                        <p className="ae-dropzone-text">
                                            Fotoğrafınızı buraya sürükleyin<br />
                                            <span className="ae-dropzone-sub">veya tıklayıp seçin</span>
                                        </p>
                                        <span className="ae-dropzone-hint">JPG, PNG, WEBP • Max 10MB</span>
                                    </>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="ae-file-input"
                                />
                            </div>
                        ) : (
                            <div className="ae-crop-container">
                                <div className="ae-crop-area">
                                    <Cropper
                                        image={uploadedImage}
                                        crop={crop}
                                        zoom={zoom}
                                        aspect={1}
                                        cropShape="round"
                                        showGrid={false}
                                        onCropChange={setCrop}
                                        onZoomChange={setZoom}
                                        onCropComplete={onCropComplete}
                                    />
                                </div>
                                <div className="ae-crop-controls">
                                    <div className="ae-zoom-control">
                                        <span className="ae-zoom-label">Yakınlaştır</span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={3}
                                            step={0.05}
                                            value={zoom}
                                            onChange={e => setZoom(Number(e.target.value))}
                                            className="ae-zoom-slider"
                                        />
                                    </div>
                                    <div className="ae-crop-actions">
                                        <button
                                            className="ae-btn ae-btn-ghost"
                                            onClick={() => {
                                                setUploadedImage(null);
                                                setCrop({ x: 0, y: 0 });
                                                setZoom(1);
                                            }}
                                        >
                                            Farklı Fotoğraf Seç
                                        </button>
                                        <button
                                            className="ae-btn ae-btn-primary"
                                            onClick={handleUploadCropped}
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader size={16} className="ae-spinner" />
                                                    Yükleniyor...
                                                </>
                                            ) : (
                                                <>
                                                    <Check size={16} />
                                                    Kaydet
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                {currentAvatar && (
                    <div className="ae-footer">
                        <button
                            className="ae-btn ae-btn-danger"
                            onClick={handleDeleteAvatar}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <Loader size={14} className="ae-spinner" />
                            ) : (
                                <Trash2 size={14} />
                            )}
                            Avatarı Kaldır
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AvatarEditor;
