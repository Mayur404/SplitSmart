const APP = {
  SPREADSHEET_ID: "1qH6-SjT3uiLCkYLctgoNcxdvvoFN56e6NtIYCoGofns",
  MAX_FIELDS: 20,
  MAX_ANSWER_LENGTH: 5000
};

const HEADERS = {
  Forms: ["formId", "ownerKey", "title", "description", "fieldsJson", "createdAt", "participantsJson", "claimRound", "acceptingClaims"],
  Customers: ["customerKey", "formId", "createdAt", "linkType", "participantId", "participantName"],
  Responses: ["responseId", "formId", "customerKey", "answersJson", "submittedAt", "customerId", "participantId", "linkType"]
};

function setupSheets() {
  const ss = SpreadsheetApp.openById(APP.SPREADSHEET_ID);
  Object.keys(HEADERS).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(HEADERS[name]);
    else ensureHeaders_(sh, HEADERS[name]);
  });
}

function ensureHeaders_(sh, expected) {
  const width = Math.max(sh.getLastColumn(), 1);
  const existing = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(String);
  expected.forEach(function(header) {
    if (existing.indexOf(header) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
      existing.push(header);
    }
  });
}

function doGet(e) {
  if (e && e.parameter && e.parameter.api === "1") return apiJsonp_(e);
  const template = HtmlService.createTemplateFromFile("Index");
  template.appUrl = ScriptApp.getService().getUrl();
  template.page = e && e.parameter && e.parameter.page === "customer" ? "customer" : "owner";
  template.formId = e && e.parameter && e.parameter.formId || "";
  template.customerKey = e && e.parameter && e.parameter.customerKey || "";
  return template.evaluate().setTitle("SplitSmart — Customer Claim").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function db_() {
  if (!APP.SPREADSHEET_ID || APP.SPREADSHEET_ID.indexOf("PASTE_") === 0) throw new Error("Configure APP.SPREADSHEET_ID in Code.gs.");
  return SpreadsheetApp.openById(APP.SPREADSHEET_ID);
}
function sheet_(name) {
  const sh = db_().getSheetByName(name);
  if (!sh) throw new Error("Missing sheet: " + name + ". Run setupSheets() first.");
  ensureHeaders_(sh, HEADERS[name]);
  return sh;
}
function headers_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(String); }
function col_(sh, name) {
  const i = headers_(sh).indexOf(name);
  if (i < 0) throw new Error("Missing column " + name + " in " + sh.getName());
  return i + 1;
}
function value_(sh, row, name) { return sh.getRange(row, col_(sh, name)).getValue(); }
function setValuesByHeader_(sh, values) {
  const heads = headers_(sh);
  const row = heads.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : "");
  sh.appendRow(row);
}
function findRow_(sh, header, value) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const col = col_(sh, header);
  const vals = sh.getRange(2, col, last - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (vals[i][0] === String(value)) return i + 2;
  return -1;
}
function id_(prefix) { return prefix + "_" + Utilities.getUuid().replace(/-/g, ""); }
function clean_(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function parseJson_(value, fallback) { try { return JSON.parse(String(value || "")); } catch (_) { return fallback; } }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ""); }

function getFormById_(formId) {
  const sh = sheet_("Forms");
  const row = findRow_(sh, "formId", formId);
  if (row < 0) return null;
  return {
    row: row,
    formId: String(value_(sh, row, "formId")),
    ownerKey: String(value_(sh, row, "ownerKey")),
    title: String(value_(sh, row, "title")),
    description: String(value_(sh, row, "description")),
    fields: parseJson_(value_(sh, row, "fieldsJson"), []),
    participants: parseJson_(value_(sh, row, "participantsJson"), []),
    claimRound: Math.max(1, Number(value_(sh, row, "claimRound")) || 1),
    acceptingClaims: String(value_(sh, row, "acceptingClaims")).toLowerCase() !== "false",
    createdAt: iso_(value_(sh, row, "createdAt"))
  };
}
function getOwnerForm(ownerKey) {
  ownerKey = clean_(ownerKey, 200);
  if (!ownerKey) return null;
  const sh = sheet_("Forms");
  const row = findRow_(sh, "ownerKey", ownerKey);
  if (row < 0) return null;
  return getFormById_(String(value_(sh, row, "formId")));
}

// React creates formId when the bill is created. Repeated calls reuse the same owner mapping.
function createForm(payload) {
  payload = payload || {};
  const formId = clean_(payload.formId, 200);
  const title = clean_(payload.title, 120);
  const description = clean_(payload.description, 500);
  const fields = Array.isArray(payload.fields) ? payload.fields.map(v => clean_(v, 80)).filter(Boolean) : [];
  const participants = Array.isArray(payload.participants) ? payload.participants.map(p => ({ id: clean_(p && p.id, 160), name: clean_(p && p.name, 60) })).filter(p => p.id && p.name) : [];
  if (!formId) throw new Error("React-generated formId is required.");
  if (!title) throw new Error("Form title is required.");
  if (!fields.length || fields.length > APP.MAX_FIELDS) throw new Error("Form must contain between 1 and " + APP.MAX_FIELDS + " fields.");
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = sheet_("Forms");
    const existingRow = findRow_(sh, "formId", formId);
    if (existingRow >= 0) {
      // Refresh bill metadata/roster while preserving its owner key and form identity.
      sh.getRange(existingRow, col_(sh, "title")).setValue(title);
      sh.getRange(existingRow, col_(sh, "description")).setValue(description);
      sh.getRange(existingRow, col_(sh, "fieldsJson")).setValue(JSON.stringify(fields));
      sh.getRange(existingRow, col_(sh, "participantsJson")).setValue(JSON.stringify(participants));
      return Object.assign(getFormById_(formId), { reused: true });
    }
    const ownerKey = id_("OWNER");
    setValuesByHeader_(sh, { formId, ownerKey, title, description, fieldsJson: JSON.stringify(fields), createdAt: new Date(), participantsJson: JSON.stringify(participants), claimRound: 1, acceptingClaims: true });
    return Object.assign(getFormById_(formId), { reused: false });
  } finally { lock.releaseLock(); }
}

function findCustomerLink_(formId, linkType, participantId) {
  const sh = sheet_("Customers");
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const h = headers_(sh);
  const ix = name => h.indexOf(name);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[ix("formId")]) === formId && String(r[ix("linkType")] || "common") === linkType && String(r[ix("participantId")] || "") === String(participantId || "")) {
      return { customerKey: String(r[ix("customerKey")]), formId, linkType, participantId: String(r[ix("participantId")] || ""), participantName: String(r[ix("participantName")] || "") };
    }
  }
  return null;
}
function customerUrl_(customer) {
  return ScriptApp.getService().getUrl() + "?page=customer&formId=" + encodeURIComponent(customer.formId) + "&customerKey=" + encodeURIComponent(customer.customerKey);
}
function createCommonCustomerLink(ownerKey) {
  const form = getOwnerForm(ownerKey);
  if (!form) throw new Error("Owner key not found.");
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    let customer = findCustomerLink_(form.formId, "common", "");
    if (!customer) {
      customer = { customerKey: id_("CUSTOMER"), formId: form.formId, linkType: "common", participantId: "", participantName: "" };
      setValuesByHeader_(sheet_("Customers"), { customerKey: customer.customerKey, formId: customer.formId, createdAt: new Date(), linkType: customer.linkType, participantId: "", participantName: "" });
    }
    customer.url = customerUrl_(customer); customer.reused = true;
    return customer;
  } finally { lock.releaseLock(); }
}
// Compatibility for older frontend builds: old links are common links.
function createCustomerLink(ownerKey) { return createCommonCustomerLink(ownerKey); }

function getCustomerByKey_(customerKey) {
  const sh = sheet_("Customers");
  const row = findRow_(sh, "customerKey", customerKey);
  if (row < 0) return null;
  return {
    row,
    customerKey: String(value_(sh, row, "customerKey")),
    formId: String(value_(sh, row, "formId")),
    linkType: String(value_(sh, row, "linkType") || "common"),
    participantId: String(value_(sh, row, "participantId") || ""),
    participantName: String(value_(sh, row, "participantName") || "")
  };
}
function getPublicForm(formId, customerKey) {
  formId = clean_(formId, 200); customerKey = clean_(customerKey, 200);
  const customer = getCustomerByKey_(customerKey);
  if (!customer || customer.formId !== formId) throw new Error("Invalid customer link for this form.");
  const form = getFormById_(formId);
  if (!form) throw new Error("Form not found.");
  return { formId: form.formId, title: form.title, description: form.description, fields: form.fields, participants: form.participants, linkType: customer.linkType, participantId: customer.participantId, participantName: customer.participantName };
}
/**
 * Saves a claim for a bill.
 *
 * Current React personal/common links are generated locally and carry the
 * React-created formId in the URL. They intentionally do NOT create a
 * customerKey row in the Customers sheet. Therefore customerKey is optional.
 *
 * Backward compatibility: if an older link supplies customerKey, it is still
 * checked against the bill. A supplied but invalid/mismatched key is rejected.
 */
function submitResponse(formId, customerKey, claimRound, answers) {
  formId = clean_(formId, 200);
  customerKey = clean_(customerKey, 200); // Empty for locally generated links.

  if (!formId) throw new Error("Bill formId is required.");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("Invalid claim answers.");
  }

  const form = getFormById_(formId);
  if (!form) throw new Error("Form not found for this bill.");
  claimRound = Math.max(1, Number(claimRound) || 1);
  if (claimRound !== form.claimRound) {
    throw new Error("This claim link belongs to an old round. Ask the bill owner for a fresh link.");
  }
  if (form.acceptingClaims === false) {
    throw new Error("The bill owner has closed customer submissions. Contact the owner if you need to submit a claim.");
  }

  // Only validate a customer token when an older frontend actually sends one.
  // Common claim links are validated against the bill roster.
  let customer = null;
  if (customerKey) {
    customer = getCustomerByKey_(customerKey);
    if (!customer) throw new Error("Customer link is invalid. Please generate a fresh claim link.");
    if (customer.formId !== formId) {
      throw new Error("Customer token belongs to a different bill. Please use the correct claim link.");
    }
  }

  const submittedParticipantId = clean_(answers["Participant ID"], 160);
  const submittedName = clean_(answers["Customer name"] || answers.Name, 60);
  if (!submittedParticipantId || !submittedName) {
    throw new Error("Participant name and ID are required to submit a claim.");
  }

  // The bill roster is the source of truth for both common and locally
  // generated common links. A participant must exist on this exact bill.
  const participant = (form.participants || []).find(function(p) {
    return p.id === submittedParticipantId && p.name === submittedName;
  });
  if (!participant) {
    throw new Error("This participant is not part of this bill's roster. Open the latest common claim link or ask the owner to update the bill.");
  }


  const safeAnswers = {};
  (form.fields || []).forEach(function(field) {
    safeAnswers[field] = clean_(answers[field], APP.MAX_ANSWER_LENGTH);
  });
  // Always store the validated roster identity, not the raw client values.
  safeAnswers["Customer name"] = participant.name;
  safeAnswers["Participant ID"] = participant.id;

  const responseId = id_("RESP");
  const customerId = id_("CLAIMANT");
  const linkType = "common";

  setValuesByHeader_(sheet_("Responses"), {
    responseId: responseId,
    formId: formId,
    customerKey: customerKey, // Blank for locally generated links.
    answersJson: JSON.stringify(safeAnswers),
    submittedAt: new Date(),
    customerId: customerId,
    participantId: participant.id,
    linkType: linkType
  });

  return {
    responseId: responseId,
    customerId: customerId,
    formId: formId,
    participantId: participant.id,
    linkType: linkType,
    message: "Your claim has been submitted."
  };
}

function resetClaims(ownerKey, formId, expectedRound) {
  ownerKey = clean_(ownerKey, 200);
  formId = clean_(formId, 200);
  const form = getOwnerForm(ownerKey);
  if (!form || form.formId !== formId) throw new Error("Owner does not control this bill.");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const current = getFormById_(formId);
    if (!current) throw new Error("Bill form not found.");
    if (Number(expectedRound) !== current.claimRound) {
      throw new Error("The claim round has changed. Refresh claims and try again.");
    }

    const responses = sheet_("Responses");
    const headers = headers_(responses);
    const formCol = headers.indexOf("formId") + 1;
    const last = responses.getLastRow();
    if (last >= 2 && formCol > 0) {
      const values = responses.getRange(2, formCol, last - 1, 1).getDisplayValues();
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i][0] === formId) responses.deleteRow(i + 2);
      }
    }

    const nextRound = current.claimRound + 1;
    const forms = sheet_("Forms");
    forms.getRange(current.row, col_(forms, "claimRound")).setValue(nextRound);
    forms.getRange(current.row, col_(forms, "acceptingClaims")).setValue(true);
    return {
      formId: formId,
      claimRound: nextRound,
      acceptingClaims: true,
      clearedResponses: true,
      message: "Previous claims cleared. A new common claim link is ready."
    };
  } finally {
    lock.releaseLock();
  }
}

function setClaimsOpen(ownerKey, formId, acceptingClaims) {
  ownerKey = clean_(ownerKey, 200);
  formId = clean_(formId, 200);
  const form = getOwnerForm(ownerKey);
  if (!form || form.formId !== formId) throw new Error("Owner does not control this bill.");
  const sh = sheet_("Forms");
  sh.getRange(form.row, col_(sh, "acceptingClaims")).setValue(acceptingClaims === true || String(acceptingClaims).toLowerCase() === "true");
  const updated = getFormById_(formId);
  return { formId: formId, acceptingClaims: updated.acceptingClaims };
}

function getOwnerResponses(ownerKey) {
  const form = getOwnerForm(ownerKey);
  if (!form) throw new Error("Owner key not found.");
  const sh = sheet_("Responses"); const last = sh.getLastRow(); if (last < 2) return [];
  const h = headers_(sh); const rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const ix = name => h.indexOf(name);
  return rows.filter(r => String(r[ix("formId")]) === form.formId).map(r => ({
    responseId: String(r[ix("responseId")]), formId: String(r[ix("formId")]), customerKey: String(r[ix("customerKey")]),
    answers: parseJson_(r[ix("answersJson")], {}), submittedAt: iso_(r[ix("submittedAt")]), customerId: String(r[ix("customerId")] || r[ix("responseId")]),
    participantId: String(r[ix("participantId")] || ""), linkType: String(r[ix("linkType")] || "common")
  })).reverse();
}

function apiJsonp_(e) {
  const callback = String(e.parameter.callback || "");
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) return ContentService.createTextOutput("/* Invalid JSONP callback */").setMimeType(ContentService.MimeType.JAVASCRIPT);
  let result;
  try {
    const p = e.parameter || {};
    switch (String(p.action || "")) {
      case "createForm": result = createForm(JSON.parse(p.payload || "{}")); break;
      case "getOwnerForm": result = getOwnerForm(p.ownerKey); break;
      case "createCustomerLink":
      case "createCommonCustomerLink": result = createCommonCustomerLink(p.ownerKey); break;
      case "getPublicForm": result = getPublicForm(p.formId, p.customerKey); break;
      case "submitResponse": result = submitResponse(p.formId, p.customerKey, p.claimRound, JSON.parse(p.answers || "{}")); break;
      case "resetClaims": result = resetClaims(p.ownerKey, p.formId, p.claimRound); break;
      case "setClaimsOpen": result = setClaimsOpen(p.ownerKey, p.formId, p.acceptingClaims === "true"); break;
      case "getOwnerResponses": result = getOwnerResponses(p.ownerKey); break;
      default: throw new Error("Unknown Apps Script API action.");
    }
    result = { data: result };
  } catch (error) { result = { error: error && error.message ? error.message : "Apps Script request failed." }; }
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(result) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
}