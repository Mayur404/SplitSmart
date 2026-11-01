export default function Sidebar() {
  return (
    <>
    <aside className="sidebar" id="sidebar" style={{ position: "fixed" }}>
      <div className="sidebar-top">
        <a className="brand" href="#dashboard" data-view="dashboard" aria-label="SplitSmart Home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18M17.5 6H9.75a3.25 3.25 0 0 0 0 6.5h4.5a3.25 3.25 0 0 1 0 6.5H6"></path>
            </svg>
          </span>
          <span className="brand-text">
            Split
            <span className="brand-light">Smart</span>
          </span>
        </a>
        <p className="sidebar-tagline">Every rupee accounted for.</p>
      </div>
      <nav className="nav" aria-label="Main Navigation">
        <button data-view="dashboard" className="nav-link active">
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"></path>
            </svg>
          </span>
          <span>Overview</span>
        </button>
        <button data-view="groups" className="nav-link">
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="3"></circle>
              <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5V20"></path>
            </svg>
          </span>
          <span>Groups</span>
        </button>
        <button data-action="new-bill" className="nav-link nav-create">
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </span>
          <span>New bill</span>
        </button>
        <span className="nav-label nav-label-spaced">Preferences</span>
        <button data-view="settings" className="nav-link">
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4L7.7 15a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8H14l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.8Z"></path>
            </svg>
          </span>
          <span>Settings</span>
        </button>
      </nav>
    </aside>
    <button id="sidebar-scrim" className="sidebar-scrim" type="button" aria-label="Close navigation"></button>
    </>
  );
}
