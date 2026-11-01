export default function Topbar() {
  return (
  <header className="topbar">
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
