import React, { useEffect, useState } from 'react';

const FLOW_STEPS = [
  { key: 'bill', label: 'Bill' },
  { key: 'assign', label: 'Assign' },
  { key: 'breakdown', label: 'Shares' },
  { key: 'settlements', label: 'Settle' },
];

export default function FlowProgress() {
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    const handleViewChange = (event) => setCurrentView(event.detail?.view || 'dashboard');
    window.addEventListener('splitsmart:viewchange', handleViewChange);
    const initial = document.getElementById('breadcrumb')?.textContent?.trim();
    const titleToView = {
      Overview: 'dashboard',
      'Group Roster': 'groups',
      'Bill & Receipt Entry': 'bill',
      'Assign Items': 'assign',
      'Individual Shares': 'breakdown',
      'Settle Up': 'settlements',
      Settings: 'settings',
      'Claim Your Items': 'claim',
    };
    if (initial && titleToView[initial]) setCurrentView(titleToView[initial]);
    return () => window.removeEventListener('splitsmart:viewchange', handleViewChange);
  }, []);

  const currentIndex = FLOW_STEPS.findIndex((step) => step.key === currentView);
  return (
    <nav className="flow-bar" aria-label="Bill progress" hidden={currentIndex < 0}>
      <ol className="flow-steps">
        {FLOW_STEPS.map((step, index) => {
          const current = index === currentIndex;
          const done = index < currentIndex;
          return (
            <li
              key={step.key}
              className={`${done ? 'done ' : ''}${current ? 'current' : ''}`.trim()}
              data-step={step.key}
            >
              <button
                type="button"
                className="flow-step-button"
                data-view={step.key}
                aria-current={current ? 'step' : undefined}
                aria-label={`Go to step ${index + 1}: ${step.label}`}
                title={`Go to ${step.label}`}
              >
                <span className="flow-dot" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="flow-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
