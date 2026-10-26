
import React from 'react';
import { House, UsersRound, Settings } from 'lucide-react';

const NAV_ITEMS = [
  {
    key: 'dashboard',
    label: 'Overview',
    icon: House,
  },
  {
    key: 'groups',
    label: 'Groups',
    icon: UsersRound,
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-top">
        <a
          className="brand"
          href="#dashboard"
          data-view="dashboard"
          aria-label="SplitSmart Home"
        >
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-symbol">$</span>
          </span>

          <span className="brand-text">
            Split<span className="brand-light">Smart</span>
          </span>
        </a>
      </div>

      <nav className="nav" aria-label="Main Navigation">
        {NAV_ITEMS.map(({ key, label, icon: Icon }, index) => (
          <button
            key={key}
            type="button"
            data-view={key}
            className={`nav-link${index === 0 ? ' active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">
              <Icon size={20} strokeWidth={2} />
            </span>

            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
