import React from 'react';
import SpecularButton from './SpecularButton.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          id="menu-toggle"
          className="icon-button mobile-menu"
          type="button"
          aria-label="Toggle navigation drawer"
          aria-expanded="false"
        >
          <span className="hamburger" aria-hidden="true" />
        </button>
        <div id="breadcrumb" className="breadcrumb" aria-live="polite">
          Overview
        </div>
      </div>
      <div className="topbar-right">
        <SpecularButton
          size="sm"
          radius={12}
          tint="var(--accent)"
          tintOpacity={1}
          textColor="var(--on-accent)"
          lineColor="var(--accent-soft)"
          baseColor="var(--accent-strong)"
          intensity={1.1}
          idleIntensity={0.24}
          shineSize={11}
          shineFade={36}
          thickness={1.25}
          glow={0.8}
          followMouse
          proximity={220}
          className="topbar-new-bill"
          data-action="new-bill"
          aria-label="Create a new bill"
        >
          <span aria-hidden="true">＋</span>
          <span>New Bill</span>
        </SpecularButton>
        <ThemeToggle />
      </div>
    </header>
  );
}
