/** SplitSmart — Footer and static information pages (terms, privacy, support, report). */
import { $, esc, toast } from '../core.jsx';

const SUPPORT_EMAIL = String(import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim();

export function renderFooter() {
  return `<footer class="site-footer" aria-label="Application footer">
    <span>SplitSmart</span>
    <nav>${[['terms', 'Terms of Service'], ['privacy', 'Privacy Policy'], ['disclaimer', 'Disclaimer'], ['support', 'Contact Support'], ['report', 'Report a Problem']].map(([viewName, label]) => `<button type="button" data-view="${viewName}">${label}</button>`).join('')}</nav>
  </footer>`;
}

export function renderInfoPage(page) {
  const pages = {
    terms: {
      title: 'Terms of Service',
      body: `<h2>Using SplitSmart</h2><p>SplitSmart helps groups organize shared bills and participant claims. Use it only for lawful, honest purposes and only with information you are authorized to share.</p><h2>Your responsibilities</h2><p>Enter accurate bill, participant, item, tax, and discount information. Review assignments, calculations, and claims before relying on them. Do not misuse claim links, impersonate another participant, interfere with the service, or submit deceptive information.</p><h2>Service limitations</h2><p>SplitSmart may depend on your browser, local storage, Google Apps Script, Google Sheets, Gemini, and network availability. Features may be unavailable or produce errors. You remain responsible for verifying the result and completing any payment outside SplitSmart.</p>`
    },
    privacy: {
      title: 'Privacy Policy',
      body: `<h2>Information used</h2><p>SplitSmart uses bill details, participant names, item assignments, claim selections, and optional contact details that users enter or submit. It stores application preferences, drafts, saved bills, and claim-link metadata in browser localStorage on the device.</p><h2>External services</h2><p>Shared claim submissions are sent to the bill owner's configured Google Apps Script and stored in the associated Google Sheet. Google Apps Script handles the application requests. Receipt images may be sent to Gemini for extraction when receipt scanning is used. Review those providers' terms and privacy policies for their handling and retention practices.</p><h2>Access and protection</h2><p>People who receive a shared bill or claim link may be able to access the information encoded or submitted through that link. Share common claim links only with people who should access the bill. SplitSmart does not claim that data is encrypted end-to-end or automatically deleted; retention depends on browser storage, Google Sheets, Apps Script configuration, and user actions.</p>`
    },
    disclaimer: {
      title: 'Disclaimer',
      body: `<p>SplitSmart organizes shared expenses and participant claims. It does not process, transfer, hold, or guarantee payments.</p><p>Verify receipt extraction, item assignments, quantities, taxes, discounts, claims, and final calculations before settling. Receipt extraction and user-submitted claims can contain errors. Actual payments and payment disputes are handled outside SplitSmart between the participants.</p>`
    },
    support: {
      title: 'Contact Support',
      body: SUPPORT_EMAIL ? `<p>For help with SplitSmart, contact support at <a class="info-link" href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>.</p>` : `<p>A support email has not been configured for this deployment.</p><p class="info-note">The owner can configure <code>VITE_SUPPORT_EMAIL</code> in the environment to enable a clickable support address.</p>`
    },
    report: {
      title: 'Report a Problem',
      body: `<form class="problem-form" id="problem-report-form"><label>Problem category<select name="category"><option>Incorrect calculations</option><option>Assignment problem</option><option>Receipt scanning error</option><option>Claim-link issue</option><option>Google Sheets synchronization</option><option>General bug</option></select></label><label>Problem title<input name="title" required maxlength="120" placeholder="Brief summary"></label><label>Description<textarea name="description" required maxlength="2000" rows="6" placeholder="Describe what happened"></textarea></label><label>Contact email (optional)<input name="email" type="email" maxlength="200" placeholder="you@example.com"></label><button class="button button-primary" type="submit">Open report email</button><p class="info-note">This opens your email application with the report prepared. It does not submit automatically.</p></form>`
    }
  };
  const content = pages[page] || pages.terms;
  $('#app').innerHTML = `<article class="info-page"><div class="info-page-head"><button class="button button-secondary button-small" data-action="info-back">Back</button><p class="eyebrow">SplitSmart</p></div><h1>${content.title}</h1><div class="info-page-body">${content.body}</div>${renderFooter()}</article>`;
}

document.addEventListener('submit', event => {
  if (event.target.id !== 'problem-report-form') return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const subject = `[SplitSmart] ${String(data.get('category') || 'Problem')}: ${String(data.get('title') || '')}`;
  const body = [`Category: ${data.get('category') || ''}`, `Title: ${data.get('title') || ''}`, '', String(data.get('description') || ''), '', `Contact: ${data.get('email') || 'Not provided'}`].join('\n');
  if (!SUPPORT_EMAIL) {
    toast('Support email is not configured for this deployment.', true);
    return;
  }
  window.location.href = `mailto:${encodeURIComponent(SUPPORT_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
