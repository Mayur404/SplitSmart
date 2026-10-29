import React from 'react';

/** Dedicated React mount point for feature screens. */
export default function MainViewport() {
  return (
    <div id="app" className="content" tabIndex={-1} aria-live="polite">
      <div id="legacy-react-root" className="legacy-react-root" />
    </div>
  );
}
