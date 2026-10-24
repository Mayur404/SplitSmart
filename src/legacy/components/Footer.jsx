import React from 'react';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer">
      <div className="footer-brand"><span className="footer-mark">S</span><span>SplitSmart</span></div>
      <p>Thoughtful group expenses. Clear, fair settlements.</p>
      <div className="footer-meta">
        <span>© {year} SplitSmart</span>
        <span className="footer-separator" aria-hidden="true">·</span>
        <span>Private by design · Runs in your browser</span>
      </div>
    </footer>
  );
}
