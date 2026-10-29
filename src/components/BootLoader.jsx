import React from 'react';

export default function BootLoader() {
  return (
    <div className="boot-loader" role="status" aria-live="polite">
      <span className="boot-loader__spinner" aria-hidden="true" />
      <span>Preparing SplitSmart…</span>
    </div>
  );
}
