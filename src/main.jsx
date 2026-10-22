import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './style.css';

const NAV_ITEMS = [
  {
    view: 'dashboard',
    label: 'Overview',
    icon: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  },
  {
    view: 'groups',
    label: 'Groups',
    icon: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5V20" /></>
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4L7.7 15a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8H14l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.8Z" /></>
  }
];

function Brand() {
  return (
    <a className="brand" href="#dashboard" data-view="dashboard" aria-label="SplitSmart Home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      </span>
      <span className="brand-text">Split<span className="brand-light">Smart</span></span>
    </a>
  );
}

function Sidebar({ activeView }) {
  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-top"><Brand /></div>
      <nav className="nav" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            type="button"
            data-view={item.view}
            className={`nav-link${item.view === activeView ? ' active' : ''}`}
            aria-current={item.view === activeView ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">{item.icon}</svg>
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({ pageTitle }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button id="menu-toggle" className="icon-button mobile-menu" type="button" aria-label="Toggle navigation drawer" aria-expanded="false">
          <span className="hamburger" aria-hidden="true" />
        </button>
        <div id="breadcrumb" className="breadcrumb" aria-live="polite">{pageTitle}</div>
      </div>
      <div className="topbar-right">
        <button className="button button-primary button-small" type="button" data-action="new-bill">
          <span aria-hidden="true">＋</span>
          <span>New Bill</span>
        </button>
      </div>
    </header>
  );
}

function Dialogs() {
  return (
    <>
      <dialog id="confirm-dialog" className="dialog">
        <form method="dialog" id="confirm-form">
          <h2 id="confirm-title">Are you sure?</h2>
          <p id="confirm-copy" />
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" data-action="cancel-dialog">Cancel</button>
            <button id="confirm-ok" type="submit" className="button button-danger" value="confirm">Confirm</button>
          </div>
        </form>
      </dialog>

      <dialog id="member-dialog" className="dialog">
        <form id="member-form">
          <h2 id="member-dialog-title">Add Member</h2>
          <input type="hidden" name="id" />
          <div className="dialog-fields">
            <label>
              Full Name
              <input name="name" required maxLength="60" autoComplete="off" placeholder="e.g. Aman Sharma" />
            </label>
            <label>
              UPI ID <span className="quiet">(Optional for payment QR)</span>
              <input name="upiId" maxLength="120" placeholder="e.g. aman@okhdfcbank" pattern="^[\w.\-]{2,256}@[\w.\-]{2,64}$|^$" />
            </label>
            <label>
              Dietary Preference
              <select name="dietaryTag" defaultValue="ANY">
                <option value="ANY">ANY (No dietary restriction)</option>
                <option value="VEG">VEG (Vegetarian only)</option>
                <option value="NON-VEG">NON-VEG (Non-Vegetarian)</option>
              </select>
            </label>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" data-action="close-member">Cancel</button>
            <button type="submit" className="button button-primary">Save Member</button>
          </div>
        </form>
      </dialog>

      <dialog id="ambiguity-dialog" className="dialog">
        <h2>Select Matching Option</h2>
        <p id="ambiguity-prompt">Multiple items or members matched your command. Please choose one:</p>
        <div id="ambiguity-choices" className="choice-list" />
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" data-action="close-ambiguity">Cancel</button>
        </div>
      </dialog>

      <dialog id="split-dialog" className="dialog">
        <h2>Split Large UPI Transfer</h2>
        <p id="split-dialog-copy">This settlement is above the recommended ₹2,000 threshold. Choose how many payments to split into:</p>
        <div id="split-dialog-options" className="split-options" />
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" data-action="close-split">Done</button>
        </div>
      </dialog>

      <dialog id="qr-dialog" className="dialog modal-wide">
        <h2 id="qr-dialog-title">UPI Payment</h2>
        <div className="qr-dialog-body">
          <div id="modal-qr-container" className="qr-container-large" />
          <div className="qr-details" id="qr-dialog-details" />
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" data-action="close-qr">Close</button>
          <a id="modal-upi-link" className="button button-primary" href="#">Pay in UPI App</a>
        </div>
      </dialog>

      <dialog id="share-dialog" className="dialog">
        <h2>Share Bill for Claims</h2>
        <p>Send this link to your group. Each person selects the items they consumed and sends their claim back to you on WhatsApp.</p>
        <div className="dialog-fields">
          <label>
            Self-Claim Link
            <input
              id="share-dialog-link"
              readOnly
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '10px' }}
              onClick={(event) => event.currentTarget.select()}
            />
          </label>
        </div>
        <div className="dialog-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="button button-secondary" data-action="close-share-dialog">Close</button>
          <button type="button" className="button button-secondary" id="share-dialog-copy-btn">Copy Link</button>
          <a id="share-dialog-open-btn" className="button button-secondary" target="_blank" rel="noreferrer" href="#">Open Link in New Tab</a>
          <a id="share-dialog-wa-btn" className="button button-primary" target="_blank" rel="noreferrer" href="#">Send on WhatsApp</a>
        </div>
      </dialog>
    </>
  );
}

function App() {
  const [appMarkup, setAppMarkup] = React.useState('');
  const [activeView, setActiveView] = React.useState('dashboard');
  const [pageTitle, setPageTitle] = React.useState('Overview');

  useEffect(() => {
    // The established feature workflows publish their view output and active
    // route through React state. Financial and storage modules stay independent.
    window.__splitSmartSetContent = (markup) => {
      // Several legacy interactions attach DOM listeners immediately after a
      // screen render, so commit the React update before returning to them.
      flushSync(() => setAppMarkup(markup));
    };
    window.__splitSmartSetView = (nextView, nextTitle) => {
      setActiveView(nextView);
      setPageTitle(nextTitle);
    };

    import('../app.js').catch((error) => {
      console.error('SplitSmart failed to initialize:', error);
      setAppMarkup(`
        <section class="panel">
          <h2>SplitSmart could not start</h2>
          <p>Please refresh the page. If the problem continues, run the project with <code>npm run dev</code>.</p>
        </section>
      `);
    });

    return () => {
      delete window.__splitSmartSetContent;
      delete window.__splitSmartSetView;
    };
  }, []);

  return (
    <>
      <div className="app-shell">
        <Sidebar activeView={activeView} />
        <main className="main">
          <Topbar pageTitle={pageTitle} />
          <div
            id="app"
            className="content"
            tabIndex={-1}
            dangerouslySetInnerHTML={{ __html: appMarkup }}
          />
        </main>
      </div>
      <div id="toast-region" className="toast-region" aria-live="polite" aria-atomic="true" />
      <Dialogs />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
