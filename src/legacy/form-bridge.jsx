/**
 * SplitSmart ↔ Google Apps Script bridge.
 * JSONP transport for the separately hosted React/Vite frontend.
 * Personal/common participant identity is carried by the encoded claim URL;
 * Apps Script validates the participant against the bill's roster.
 */
import { FORM_BRIDGE_WEB_APP_URL } from "../config/formBridge.jsx";

function endpoint() {
  const value = String(FORM_BRIDGE_WEB_APP_URL || "").trim();
  if (!value || value.includes("PASTE_YOUR_")) {
    throw new Error("Configure FORM_BRIDGE_WEB_APP_URL in src/config/formBridge.jsx.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid Google Apps Script deployment URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec\/?$/i.test(parsed.pathname)
  ) {
    throw new Error("Use the deployed https://script.google.com/macros/s/DEPLOYMENT_ID/exec URL.");
  }

  return parsed;
}

let sequence = 0;

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = endpoint();
    } catch (error) {
      reject(error);
      return;
    }

    const requestId = ++sequence;
    const callbackName = `__splitSmartGas_${Date.now()}_${requestId}`;
    url.searchParams.set("api", "1");
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(
          key,
          typeof value === "string" ? value : JSON.stringify(value)
        );
      }
    });

    const script = document.createElement("script");
    let timer = null;
    let settled = false;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      script.onerror = null;
      script.remove();
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    };

    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      console.error("[SplitSmart GAS] Request failed:", {
        requestId,
        action,
        message: error.message
      });
      reject(error);
    };

    window[callbackName] = result => {
      if (settled) return;
      if (!result || typeof result !== "object") {
        fail(new Error(`Invalid response from Google Apps Script. Action: ${action}`));
        return;
      }
      if (result.error) {
        fail(new Error(String(result.error)));
        return;
      }

      settled = true;
      cleanup();
      console.info("[SplitSmart GAS] Request succeeded:", { requestId, action });
      resolve(result.data);
    };

    script.onerror = () => fail(new Error(
      `Google Apps Script response failed to load. Action: ${action}. Check Network for the final URL and status.`
    ));

    timer = setTimeout(() => fail(new Error(
      `Google Apps Script timed out. Action: ${action}.`
    )), 30000);

    script.src = url.toString();
    console.info("[SplitSmart GAS] Request:", {
      requestId,
      action,
      endpoint: `${url.origin}${url.pathname}`
    });
    document.head.appendChild(script);
  });
}

/** Create/reuse the owner mapping for one bill. */
export const createForm = payload => jsonp("createForm", { payload });

/** Retrieve a form owned by this browser/account key. */
export const getOwnerForm = ownerKey => jsonp("getOwnerForm", { ownerKey });

/**
 * Submit a claim for the given bill and round.
 * Signature intentionally matches app.jsx:
 * gasSubmitResponse(formId, claimRound, answers)
 */
export const submitResponse = (formId, claimRound, answers) =>
  jsonp("submitResponse", { formId, claimRound, answers });

/** Retrieve responses for the form associated with this owner key. */
export const getOwnerResponses = ownerKey =>
  jsonp("getOwnerResponses", { ownerKey });

/** Open or close customer submissions for one bill. */
export const setClaimsOpen = (ownerKey, formId, acceptingClaims) =>
  jsonp("setClaimsOpen", { ownerKey, formId, acceptingClaims });

/** Clear the previous common-claim round and open a fresh round. */
export const resetClaims = (ownerKey, formId, claimRound) =>
  jsonp("resetClaims", { ownerKey, formId, claimRound });
