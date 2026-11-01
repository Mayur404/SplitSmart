export default function Dialogs() {
  return (
    <>
      <dialog id="confirm-dialog" className="dialog">
        <form method="dialog" id="confirm-form">
          <h2 id="confirm-title">Are you sure?</h2>
          <p id="confirm-copy"></p>
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
              <input
                name="upiId"
                maxLength="120"
                placeholder="e.g. aman@okhdfcbank"
                pattern="^[\\w.\\-]{2,256}@[\\w.-]{2,64}$|^$"
              />
            </label>
            <label>
              Dietary Preference
              <select name="dietaryTag">
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
        <div id="ambiguity-choices" className="choice-list"></div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" data-action="close-ambiguity">Cancel</button>
        </div>
      </dialog>

      <dialog id="split-dialog" className="dialog">
        <h2>Split Large UPI Transfer</h2>
        <p id="split-dialog-copy">This settlement is above the recommended ₹2,000 threshold. Choose how many payments to split into:</p>
        <div id="split-dialog-options" className="split-options"></div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" data-action="close-split">Done</button>
        </div>
      </dialog>

      <dialog id="qr-dialog" className="dialog modal-wide">
        <h2 id="qr-dialog-title">UPI Payment</h2>
        <div className="qr-dialog-body">
          <div id="modal-qr-container" className="qr-container-large"></div>
          <div className="qr-details" id="qr-dialog-details"></div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" data-action="close-qr">Close</button>
          <a id="modal-upi-link" className="button button-primary" href="#">Pay in UPI App</a>
        </div>
      </dialog>

      <dialog id="share-dialog" className="dialog">
        <h2>Share Bill for Claims</h2>
        <p>
          Send this link to your group. Each person selects the items they consumed
          and sends their claim back to you on WhatsApp.
        </p>
        <div className="dialog-fields">
          <label>
            Self-Claim Link
            <input
              id="share-dialog-link"
              readOnly
              style={{ fontFamily: "var(--font-mono)", fontSize: "12px", padding: "10px" }}
              onClick={(event) => event.currentTarget.select()}
            />
          </label>
        </div>

        <section
          id="share-dialog-personal-tools"
          className="share-personal-tools"
          aria-live="polite"
        ></section>

        <div
          className="dialog-actions"
          style={{ marginTop: "16px", flexWrap: "wrap", gap: "8px" }}
        >
          <button type="button" className="button button-secondary" data-action="close-share-dialog">Close</button>
          <button type="button" className="button button-secondary" id="share-dialog-copy-btn">Copy Link</button>
          <a id="share-dialog-open-btn" className="button button-secondary" target="_blank" rel="noopener" href="#">Open Link in New Tab</a>
          <a id="share-dialog-wa-btn" className="button button-primary" target="_blank" rel="noopener" href="#">Send on WhatsApp</a>
          <button type="button" className="button button-secondary" data-action="refresh-gas-responses">
            ↻ Update from Google Sheets
          </button>
        </div>
      </dialog>
    </>
  );
}