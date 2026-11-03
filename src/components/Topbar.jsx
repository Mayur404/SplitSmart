import { useEffect, useRef } from "react";

export default function Topbar() {
  const topbarRef = useRef(null);

  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;

    let rafId = null;
    const updateScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      // Change at the same pace as the scroll over the first 60px
      const progress = Math.min(1, Math.max(0, scrollY / 60));
      el.style.setProperty('--scroll-p', progress.toFixed(3));
      if (progress > 0) {
        el.classList.add('is-scrolled');
      } else {
        el.classList.remove('is-scrolled');
      }
    };

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateScroll);
    };

    updateScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('popstate', updateScroll, { passive: true });
    window.addEventListener('hashchange', updateScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', updateScroll);
      window.removeEventListener('hashchange', updateScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <header ref={topbarRef} className="topbar">
      <div className="topbar-left">
        <button id="menu-toggle" className="icon-button mobile-menu" aria-label="Toggle navigation drawer" aria-expanded="false">
          <span className="hamburger" aria-hidden="true"></span>
        </button>
        <div className="claim-brand" aria-label="SplitSmart">
          <span className="claim-brand-mark" aria-hidden="true">$</span>
          <span className="claim-brand-text">Split<span>Smart</span></span>
        </div>
        <div id="breadcrumb" className="breadcrumb" aria-live="polite">Overview</div>
      </div>
      <div className="topbar-right">
        <button className="button button-primary button-small" data-action="new-bill">
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
          <span>New bill</span>
        </button>
        <button className="icon-button theme-toggle" data-action="toggle-theme" title="Toggle light or dark theme" aria-label="Toggle theme">
          <span id="theme-icon" aria-hidden="true"></span>
        </button>
      </div>
    </header>
  );
}
