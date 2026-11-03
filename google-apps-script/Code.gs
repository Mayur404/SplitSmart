const APP = {
  SPREADSHEET_ID: "1qH6-SjT3uiLCkYLctgoNcxdvvoFN56e6NtIYCoGofns",
  MAX_FIELDS: 20,
  MAX_ANSWER_LENGTH: 5000
};

/**
 * Run setupSheets() once from the Apps Script editor.
 * Then deploy this project as a Web app.
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(APP.SPREADSHEET_ID);
  const schemas = {
    Forms: ["formId", "ownerKey", "title", "description", "fieldsJson", "createdAt"],
    Customers: ["customerKey", "formId", "createdAt"],
    Responses: ["responseId", "formId", "customerKey", "answersJson", "submittedAt", "customerId"]
  };

  Object.keys(schemas).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(schemas[name]);
    } else if (name === "Responses") {
      // Backward-compatible migration: append customerId without shifting existing columns.
      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
      if (headers.indexOf("customerId") < 0) {
        sheet.getRange(1, headers.length + 1).setValue("customerId");
      }
    }
  });
}

function doGet(e) {
  // JSONP API for the separately hosted React app. The original Apps Script
  // owner/customer HTML UI remains available when api=1 is not supplied.
  if (e && e.parameter && e.parameter.api === "1") {
    return apiJsonp_(e);
  }
  const template = HtmlService.createTemplateFromFile("Index");
  template.appUrl = ScriptApp.getService().getUrl();
  template.page = (e && e.parameter && e.parameter.page === "customer") ? "customer" : "owner";
  template.formId = (e && e.parameter && e.parameter.formId) || "";
  template.customerKey = (e && e.parameter && e.parameter.customerKey) || "";
  return template.evaluate()
    .setTitle("FormBridge — Form Sharing Demo")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function db_() {
  if (!APP.SPREADSHEET_ID || APP.SPREADSHEET_ID.indexOf("PASTE_") === 0) {
    throw new Error("Configure APP.SPREADSHEET_ID in Code.gs first.");
  }
  return SpreadsheetApp.openById(APP.SPREADSHEET_ID);
}

function sheet_(name) {
  const sheet = db_().getSheetByName(name);
  if (!sheet) throw new Error("Missing sheet: " + name + ". Run setupSheets() first.");
  return sheet;
}

function id_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "");
}

function findRow_(sheet, col, value) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const values = sheet.getRange(2, col, last - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === String(value)) return i + 2;
  }
  return -1;
}

function cleanText_(value, max) {
  return String(value || "").trim().slice(0, max);
}

/**
 * Creates a form and returns its owner key.
 * Keep the owner key private: it grants access to owner operations.
 */
function createForm(payload) {
  payload = payload || {};
  // React creates this ID when the bill is created. Apps Script must preserve it.
  const requestedFormId = cleanText_(payload.formId, 200);
  const title = cleanText_(payload.title, 120);
  const description = cleanText_(payload.description, 500);
  const fields = Array.isArray(payload.fields)
    ? payload.fields.map(function (f) { return cleanText_(f, 80); }).filter(Boolean)
    : [];

  if (!requestedFormId) throw new Error("A client-generated bill form ID is required.");
  if (!title) throw new Error("Please enter a form title.");
  if (!fields.length) throw new Error("Add at least one field.");
  if (fields.length > APP.MAX_FIELDS) throw new Error("Maximum " + APP.MAX_FIELDS + " fields allowed.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const formsSheet = sheet_("Forms");
    // Idempotency: sharing the same bill again must not create another Forms row
    // or rotate its owner key. Return the existing mapping instead.
    const existingRow = findRow_(formsSheet, 1, requestedFormId);
    if (existingRow >= 0) {
      const existing = formsSheet.getRange(existingRow, 1, 1, 6).getValues()[0];
      return {
        formId: String(existing[0]),
        ownerKey: String(existing[1]),
        title: String(existing[2]),
        description: String(existing[3]),
        fields: JSON.parse(String(existing[4]))
      };
    }

    const ownerKey = id_("OWNER");
    formsSheet.appendRow([
      requestedFormId, ownerKey, title, description, JSON.stringify(fields), new Date()
    ]);
    return { formId: requestedFormId, ownerKey: ownerKey, title: title, description: description, fields: fields };
  } finally {
    lock.releaseLock();
  }
}

function getOwnerForm(ownerKey) {
  ownerKey = cleanText_(ownerKey, 200);
  if (!ownerKey) return null;
  const sheet = sheet_("Forms");
  const row = findRow_(sheet, 2, ownerKey);
  if (row < 0) return null;
  const v = sheet.getRange(row, 1, 1, 6).getValues()[0];
  return {
    formId: String(v[0]),
    title: String(v[2]),
    description: String(v[3]),
    fields: JSON.parse(String(v[4])),
    createdAt: v[5] instanceof Date ? v[5].toISOString() : String(v[5])
  };
}

/**
 * Generates a customer key tied to this form and returns a share URL.
 * Anyone with this URL can submit to the form, so share it carefully.
 */
function createCustomerLink(ownerKey) {
  const form = getOwnerForm(ownerKey);
  if (!form) throw new Error("Owner key not found.");
  const customerKey = id_("CUSTOMER");
  sheet_("Customers").appendRow([customerKey, form.formId, new Date()]);
  const url = ScriptApp.getService().getUrl()
    + "?page=customer&formId=" + encodeURIComponent(form.formId)
    + "&customerKey=" + encodeURIComponent(customerKey);
  return { customerKey: customerKey, url: url };
}

function getPublicForm(formId, customerKey) {
  formId = cleanText_(formId, 200);
  customerKey = cleanText_(customerKey, 200);
  if (!formId || !customerKey) throw new Error("Invalid form link.");

  const customerRow = findRow_(sheet_("Customers"), 1, customerKey);
  if (customerRow < 0) throw new Error("Customer link is invalid.");
  const linkedFormId = sheet_("Customers").getRange(customerRow, 2).getDisplayValue();
  if (linkedFormId !== formId) throw new Error("This customer key does not belong to this form.");

  const row = findRow_(sheet_("Forms"), 1, formId);
  if (row < 0) throw new Error("Form not found.");
  const v = sheet_("Forms").getRange(row, 1, 1, 6).getValues()[0];
  return {
    formId: String(v[0]),
    title: String(v[2]),
    description: String(v[3]),
    fields: JSON.parse(String(v[4]))
  };
}

function submitResponse(formId, customerKey, answers) {
  formId = cleanText_(formId, 200);
  customerKey = cleanText_(customerKey, 200);
  if (!formId || !customerKey) throw new Error("Invalid form link.");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("Invalid form answers.");
  }

  const customerRow = findRow_(sheet_("Customers"), 1, customerKey);
  if (customerRow < 0) throw new Error("Customer link is invalid.");
  if (sheet_("Customers").getRange(customerRow, 2).getDisplayValue() !== formId) {
    throw new Error("Customer key does not belong to this form.");
  }

  const formRow = findRow_(sheet_("Forms"), 1, formId);
  if (formRow < 0) throw new Error("Form not found.");
  const fields = JSON.parse(sheet_("Forms").getRange(formRow, 5).getDisplayValue());
  const safeAnswers = {};
  fields.forEach(function (field) {
    // Answers are stored as text, including JSON-encoded selected item details.
    // Keep the payload bounded so a customer cannot send an oversized request.
    safeAnswers[field] = cleanText_(answers[field], APP.MAX_ANSWER_LENGTH);
  });

  const responseId = id_("RESP");
  // Every submission receives its own customerId, even when many people use the same shared link.
  const customerId = id_("CLAIMANT");
  sheet_("Responses").appendRow([
    responseId, formId, customerKey, JSON.stringify(safeAnswers), new Date(), customerId
  ]);
  return { responseId: responseId, customerId: customerId, message: "Your claim has been submitted." };
}

function getOwnerResponses(ownerKey) {
  const form = getOwnerForm(ownerKey);
  if (!form) throw new Error("Owner key not found.");

  const sheet = sheet_("Responses");
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, Math.max(sheet.getLastColumn(), 5)).getValues();
  return rows.filter(function (r) {
    return String(r[1]) === form.formId;
  }).map(function (r) {
    return {
      responseId: String(r[0]),
      formId: String(r[1]),
      customerKey: String(r[2]),
      customerId: String(r[5] || r[0]),
      answers: JSON.parse(String(r[3])),
      submittedAt: r[4] instanceof Date ? r[4].toISOString() : String(r[4])
    };
  }).reverse();
}


/**
 * Cross-origin JSONP bridge for the React app.
 * Actions: createForm, getOwnerForm, createCustomerLink, getPublicForm,
 * submitResponse, getOwnerResponses.
 */
function apiJsonp_(e) {
  const callback = String(e.parameter.callback || "");
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput("/* Invalid JSONP callback */")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  let result;
  try {
    const p = e.parameter || {};
    const action = String(p.action || "");
    switch (action) {
      case "createForm":
        result = createForm(JSON.parse(p.payload || "{}"));
        break;
      case "getOwnerForm":
        result = getOwnerForm(p.ownerKey);
        break;
      case "createCustomerLink":
        result = createCustomerLink(p.ownerKey);
        break;
      case "getPublicForm":
        result = getPublicForm(p.formId, p.customerKey);
        break;
      case "submitResponse":
        result = submitResponse(p.formId, p.customerKey, JSON.parse(p.answers || "{}"));
        break;
      case "getOwnerResponses":
        result = getOwnerResponses(p.ownerKey);
        break;
      default:
        throw new Error("Unknown Apps Script API action.");
    }
    result = { data: result };
  } catch (error) {
    result = { error: error && error.message ? error.message : "Apps Script request failed." };
  }

  const body = callback + "(" + JSON.stringify(result) + ");";
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
