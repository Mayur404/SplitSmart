
import { Settings, LayoutDashboard, Users, Plus } from "lucide-react";

export default function Sidebar() {
  return (
    <>
    <aside
        className="sidebar"
        id="sidebar"
        style={{
          position: "fixed",
          zIndex: 100000
        }}
      >
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
              <LayoutDashboard size={20} strokeWidth={1.8} />
          </span>
          <span>Overview</span>
        </button>
        <button data-view="groups" className="nav-link">
          <span className="nav-icon" aria-hidden="true">
            <Users size={20} strokeWidth={1.8} />
          </span>
          <span>Groups</span>
        </button>
        <button data-action="new-bill" className="nav-link nav-create">
          <span className="nav-icon" aria-hidden="true">
              <Plus size={21} strokeWidth={2} />
          </span>
          <span>New bill</span>
        </button>
        <span className="nav-label nav-label-spaced">Preferences</span>
        <button data-view="settings" className="nav-link">
          <span className="nav-icon" aria-hidden="true">
            <Settings size={22} strokeWidth={1.8} />
          </span>
          <span>Settings</span>
        </button>
      </nav>
    </aside>
    <button id="sidebar-scrim" className="sidebar-scrim" type="button" aria-label="Close navigation"></button>
    </>
  );
}
