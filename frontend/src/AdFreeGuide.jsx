import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Sparkles, Smartphone, Monitor, X } from 'lucide-react';
import './AdFreeGuide.css';

const LINKS = {
  uBlockOriginLite: 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh?pli=1',
  braveIos: 'https://apps.apple.com/tr/app/brave-browser-search-engine/id1052879175',
  braveAndroid: 'https://play.google.com/store/apps/details?id=com.brave.browser',
  adguardIos: 'https://adguard.com/en/adguard-ios/overview.html',
  kiwi: 'https://kiwibrowser.com/',
  orion: 'https://kagi.com/orion/',
};

function AdFreeGuide() {
  const [open, setOpen] = useState(false);
  const [deviceType, setDeviceType] = useState('desktop');
  const [adblockActive, setAdblockActive] = useState(null);
  const [panelStyle, setPanelStyle] = useState(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isAppleMobile = /iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && /iPad|Mac/i.test(ua));
    if (isAndroid) setDeviceType('android');
    else if (isAppleMobile) setDeviceType('ios');
    else setDeviceType('desktop');
  }, []);

  useEffect(() => {
    const bait = document.createElement('div');
    bait.className = 'ads ad-banner ad-unit adsbox sponsor-box';
    bait.style.cssText = [
      'position:absolute',
      'left:-9999px',
      'top:-9999px',
      'width:10px',
      'height:10px',
      'pointer-events:none',
    ].join(';');

    const timer = window.setTimeout(() => {
      document.body.appendChild(bait);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const computed = window.getComputedStyle(bait);
          const blocked = computed.display === 'none' || computed.visibility === 'hidden' || bait.offsetHeight === 0 || bait.clientHeight === 0 || bait.offsetParent === null;
          setAdblockActive(blocked);
          bait.remove();
        });
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      bait.remove();
    };
  }, []);

  const bannerLabel = adblockActive ? 'Reklamsız Mod Aktif! ✅' : 'Reklamlardan nasıl kurtulurum?';

  const openExternalLink = (event, href) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const SmartLink = ({ href, children, title }) => (
    <a
      className="adfree-guide-link"
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      draggable="false"
      onMouseUp={(e) => {
        if (e.button !== 0) return;
        openExternalLink(e, href);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchEnd={(e) => {
        openExternalLink(e, href);
      }}
    >
      {children}
    </a>
  );

  const renderDeviceSpecificCard = () => {
    if (deviceType === 'ios') {
      return (
        <article className="adfree-guide-card adfree-guide-card-featured">
          <div className="adfree-guide-card-head">
            <Smartphone size={18} />
            <h4>iPhone (iOS)</h4>
          </div>
          <p>
            iPhone'da en temiz yol <SmartLink href={LINKS.adguardIos} title="AdGuard iOS çözümünü aç">AdGuard</SmartLink> kullanmak veya doğrudan <SmartLink href={LINKS.braveIos} title="Brave iOS uygulamasını aç">Brave Browser</SmartLink> indirmek.
          </p>
        </article>
      );
    }

    if (deviceType === 'android') {
      return (
        <article className="adfree-guide-card adfree-guide-card-featured">
          <div className="adfree-guide-card-head">
            <Smartphone size={18} />
            <h4>Android</h4>
          </div>
          <p>
            Android'de <SmartLink href={LINKS.braveAndroid} title="Brave Android uygulamasını aç">Brave Browser</SmartLink> veya uBlock destekli tarayıcıları tercih et. <SmartLink href={LINKS.kiwi} title="Kiwi Browser sitesini aç">Kivi</SmartLink> ve <SmartLink href={LINKS.orion} title="Orion Browser sitesini aç">Orion</SmartLink> ile daha temiz sonuç alırsın.
          </p>
        </article>
      );
    }

    return (
      <article className="adfree-guide-card adfree-guide-card-featured">
        <div className="adfree-guide-card-head">
          <Monitor size={18} />
          <h4>PC / Mac</h4>
        </div>
        <p>
          Masaüstünde <SmartLink href={LINKS.uBlockOriginLite} title="uBlock Origin Lite indirme sayfasını aç">uBlock Origin Lite</SmartLink> kullan. Reklamları hızlıca filtreleyip daha temiz bir izleme deneyimi sağlar.
        </p>
      </article>
    );
  };

  useEffect(() => {
    if (!open) return;

    const updatePanelPosition = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;

      const rect = triggerEl.getBoundingClientRect();
      const isMobile = window.innerWidth <= 640;

      if (isMobile) {
        setPanelStyle({
          top: `${Math.min(rect.bottom + 8, window.innerHeight - 130)}px`,
          left: '10px',
          right: '10px',
          width: 'auto',
        });
        return;
      }

      const panelWidth = Math.min(920, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 12));
      setPanelStyle({
        top: `${rect.bottom + 10}px`,
        left: `${left}px`,
        right: 'auto',
        width: `${panelWidth}px`,
      });
    };

    updatePanelPosition();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onWindowChange = () => updatePanelPosition();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const modalContent = open ? (
    <div
      className="adfree-guide-overlay"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="adfree-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adfree-guide-title"
        style={panelStyle || undefined}
      >
        <div className="adfree-guide-modal-scroll">
          {adblockActive ? (
            <>
              <div className="adfree-guide-success">
                <div className="adfree-guide-success-icon">✅</div>
                <div className="adfree-guide-success-copy">
                  <span className="adfree-guide-badge">
                    <Sparkles size={14} /> Reklamsız Mod Aktif
                  </span>
                  <h3 id="adfree-guide-title">Reklamsız Mod Aktif! ✅</h3>
                  <p>Tarayıcında çalışan bir engelleyici algıladık. İyi seyirler, reklamlar zaten bloklanıyor.</p>
                </div>
                <button type="button" className="adfree-guide-close" onClick={() => setOpen(false)} aria-label="Kapat">
                  <X size={18} />
                </button>
              </div>
              <div className="adfree-guide-active-helper">
                <p className="adfree-guide-active-helper-text">Halen reklam görüyorsanız şu yöntemleri deneyin:</p>
                <div className="adfree-guide-grid adfree-guide-grid-single">
                  {renderDeviceSpecificCard()}
                </div>
              </div>
            </>
          ) : (
            <>
            <div className="adfree-guide-modal-header">
              <div className="adfree-guide-title-wrap">
                <span className="adfree-guide-badge">
                  <Sparkles size={14} /> Seriesboxd Reklamsız İzleme Rehberi
                </span>
                <h3 id="adfree-guide-title">Reklamları minimuma indirmenin en temiz yolu</h3>
                <p>
                  Dizi keyfini reklamlarla bölme. Embed playerlardaki reklamlar sitemizden bağımsızdır.
                  Daha temiz bir izleme deneyimi için aşağıdaki araçlardan birini kullan.
                </p>
              </div>

              <button type="button" className="adfree-guide-close" onClick={() => setOpen(false)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>

            <div className="adfree-guide-grid">
              {deviceType === 'ios' && (
                <article className="adfree-guide-card adfree-guide-card-featured">
                  <div className="adfree-guide-card-head">
                    <Smartphone size={18} />
                    <h4>iPhone İçin Çözüm</h4>
                  </div>
                  <p>
                    iPhone'da en temiz yol <SmartLink href={LINKS.adguardIos} title="AdGuard iOS çözümünü aç">AdGuard</SmartLink> kullanmak veya doğrudan <SmartLink href={LINKS.braveIos} title="Brave iOS uygulamasını aç">Brave Browser</SmartLink> indirmek.
                  </p>
                </article>
              )}

              {deviceType === 'desktop' && (
                <article className="adfree-guide-card">
                  <div className="adfree-guide-card-head">
                    <Monitor size={18} />
                    <h4>PC / Mac</h4>
                  </div>
                  <p>
                    <SmartLink href={LINKS.uBlockOriginLite} title="uBlock Origin Lite indirme sayfasını aç">uBlock Origin Lite</SmartLink> kur. Anında reklam kesme etkisiyle daha temiz bir masaüstü deneyimi sağlar.
                  </p>
                </article>
              )}

              {deviceType === 'desktop' && (
                <article className="adfree-guide-card">
                  <div className="adfree-guide-card-head">
                    <Smartphone size={18} />
                    <h4>iPhone (iOS)</h4>
                  </div>
                  <p>
                    En pratik çözüm <SmartLink href={LINKS.adguardIos} title="AdGuard iOS çözümünü aç">AdGuard</SmartLink> ya da direkt <SmartLink href={LINKS.braveIos} title="Brave iOS uygulamasını aç">Brave Browser</SmartLink> kullanmak.
                  </p>
                </article>
              )}

              {(deviceType === 'desktop' || deviceType === 'android') && (
                <article className={`adfree-guide-card${deviceType === 'android' ? ' adfree-guide-card-featured' : ''}`}>
                  <div className="adfree-guide-card-head">
                    <Smartphone size={18} />
                    <h4>Android</h4>
                  </div>
                  <p>
                    <SmartLink href={LINKS.braveAndroid} title="Brave Android uygulamasını aç">Brave Browser</SmartLink> veya uBlock destekli tarayıcılar tercih et. <SmartLink href={LINKS.kiwi} title="Kiwi Browser sitesini aç">Kivi</SmartLink>, <SmartLink href={LINKS.orion} title="Orion Browser sitesini aç">Orion</SmartLink> ve benzeri seçeneklerle daha temiz sonuç alırsın.
                  </p>
                </article>
              )}
            </div>
          </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="adfree-guide-anchor">
      <button
        type="button"
        ref={triggerRef}
        className={`adfree-guide-banner${adblockActive ? ' adfree-guide-banner-active' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="adfree-guide-banner-icon">
          <ShieldCheck size={15} />
        </span>
        <span className="adfree-guide-banner-text">{bannerLabel}</span>
        <span className="adfree-guide-banner-glow" aria-hidden="true" />
      </button>
      {createPortal(modalContent, document.body)}
    </div>
  );
}

export default AdFreeGuide;