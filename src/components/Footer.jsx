import React from 'react';

export default function Footer() {
  return (
    <footer className="app-footer">
      <div>
        <div className="app-footer__brand">SplitSmart</div>
        <p className="app-footer__tagline">Fair splits. Clear balances. Better outings.</p>
      </div>
      <div className="app-footer__meta">
        <div>PRIVATE BY DESIGN · NO BACKEND</div>
        <div>© {new Date().getFullYear()} SplitSmart</div>
      </div>
    </footer>
  );
}
