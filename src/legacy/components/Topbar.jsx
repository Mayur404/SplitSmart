import React from 'react';

export default function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button id="menu-toggle" className="icon-button mobile-menu" type="button" aria-label="Toggle navigation drawer" aria-expanded="false">
          <span className="hamburger" aria-hidden="true" />
        </button>
        <div id="breadcrumb" className="breadcrumb" aria-live="polite">Overview</div>
      </div>
      <div className="topbar-right">
        <button className="button button-primary button-small" data-action="new-bill" type="button" aria-label="Create a new bill">
          <span aria-hidden="true">＋</span><span>New Bill</span>
        </button>
      </div>
    </header>
  );
}
