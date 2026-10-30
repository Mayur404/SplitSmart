import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const FLOW_STEPS = [
  { key: 'bill', label: 'Bill' },
  { key: 'assign', label: 'Assign' },
  { key: 'breakdown', label: 'Review' },
  { key: 'settlements', label: 'Settle' },
];

export default function FlowProgress() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [host, setHost] = useState(null);

  useEffect(() => {
    const updateHost = () => {
      const nextHost = document.getElementById('flow-progress-slot');
      setHost((current) => (current === nextHost ? current : nextHost));
    };
    const handleViewChange = (event) => {
      setCurrentView(event.detail?.view || 'dashboard');
      updateHost();
    };
    const observer = new MutationObserver(updateHost);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('splitsmart:viewchange', handleViewChange);
    updateHost();
    return () => {
      observer.disconnect();
      window.removeEventListener('splitsmart:viewchange', handleViewChange);
    };
  }, []);

  const currentIndex = FLOW_STEPS.findIndex((step) => step.key === currentView);
  if (!host || currentIndex < 0) return null;

  return createPortal(
    <nav className="flow-bar" aria-label="Bill progress">
      <ol className="flow-steps">
        {FLOW_STEPS.map((step, index) => {
          const current = index === currentIndex;
          const done = index < currentIndex;
          return (
            <React.Fragment key={step.key}>
              {index > 0 && (
                <li className={`flow-connector${index <= currentIndex ? ' is-complete' : ''}`} aria-hidden="true">
                  <svg viewBox="0 0 120 24" preserveAspectRatio="none">
                    <path d="M1 12 C28 -1, 67 25, 119 12" />
                  </svg>
                </li>
              )}
              <li className={`${done ? 'done ' : ''}${current ? 'current' : ''}`.trim()} data-step={step.key}>
                <button
                  type="button"
                  className="flow-step-button"
                  data-view={step.key}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Go to step ${index + 1}: ${step.label}`}
                  title={`Go to ${step.label}`}
                >
                  <span className="flow-dot" aria-hidden="true">0{index + 1}</span>
                  <span className="flow-label">{step.label}</span>
                </button>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>,
    host,
  );
}
