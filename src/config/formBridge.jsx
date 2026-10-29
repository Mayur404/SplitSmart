/**
 * Shared inline validation for the compatibility-rendered feature screens.
 * Rules are declared with data-validate attributes in the view templates.
 */

const ERROR_CLASS = 'field-validation-message';
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;
const RECEIPT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** Return a user-facing receipt image error, or an empty string when the file is valid. */
export function getReceiptFileError(file) {
  if (!file) return 'Choose a receipt image before scanning.';
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  const mimeType = String(file.type || '').toLowerCase();
  const mimeIsUnknown = !mimeType || mimeType === 'application/octet-stream';
  const validImage = RECEIPT_MIME_TYPES.has(mimeType) || (mimeIsUnknown && RECEIPT_EXTENSIONS.has(extension));
  if (!validImage) return 'Choose a JPG, PNG, WEBP or HEIC image.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'The selected image is empty or unreadable.';
  if (file.size > MAX_RECEIPT_BYTES) return 'Receipt image must be 15 MB or smaller.';
  return '';
}

function getErrorHost(input) {
  return input.closest('label') || input.parentElement || input;
}

function getExistingError(host) {
  return host.querySelector(`:scope > .${ERROR_CLASS}`);
}

function setFeedback(input, message) {
  const host = getErrorHost(input);
  let error = getExistingError(host);

  input.classList.toggle('is-invalid', Boolean(message));
  input.setAttribute('aria-invalid', String(Boolean(message)));

  if (!message) {
    error?.remove();
    return;
  }

  if (!error) {
    error = document.createElement('small');
    error.className = ERROR_CLASS;
    error.setAttribute('role', 'alert');
    host.appendChild(error);
  }
  error.textContent = message;
}

function nativeValidityMessage(input) {
  const validity = input.validity;
  if (!validity) return '';
  if (validity.valueMissing) return 'This field is required.';
  if (validity.badInput) return 'Enter a valid value.';
  if (validity.typeMismatch) return `Enter a valid ${input.type || 'value'}.`;
  if (validity.patternMismatch)
    return input.dataset.validationMessage || 'Use the required format.';
  if (validity.tooLong) return `Use no more than ${input.maxLength} characters.`;
  if (validity.tooShort) return `Enter at least ${input.minLength} characters.`;
  if (validity.rangeUnderflow) return `Enter a value of at least ${input.min}.`;
  if (validity.rangeOverflow) return `Enter a value no greater than ${input.max}.`;
  if (validity.stepMismatch) return `Use valid increments of ${input.step}.`;
  return '';
}

function customRuleMessage(input) {
  const value = input.value.trim();
  const rule = input.dataset.validate;

  if (rule === 'member-name') {
    if (!value) return 'Enter the member name.';
    if (value.length < 2) return 'Name must contain at least 2 characters.';
    if (value.length > 60) return 'Name must be 60 characters or fewer.';
  }

  if (rule === 'optional-text' && input.maxLength > 0 && value.length > input.maxLength) {
    return `Use no more than ${input.maxLength} characters.`;
  }

  if (rule === 'required-date') {
    if (!value) return 'Choose a date.';
    if (input.type === 'date' && !input.valueAsDate) return 'Choose a valid date.';
  }

  if (rule === 'item-name') {
    if (!value) return 'Enter an item name.';
    if (value.length < 2) return 'Item name must contain at least 2 characters.';
    if (value.length > 100) return 'Item name must be 100 characters or fewer.';
  }

  if (rule === 'positive-quantity') {
    const quantity = Number(value);
    if (!value || !Number.isFinite(quantity)) return 'Enter a valid quantity.';
    if (quantity <= 0) return 'Quantity must be greater than zero.';
    if (quantity > 9999) return 'Quantity cannot exceed 9,999.';
  }

  if (rule === 'money' || rule === 'payer-amount') {
    if (!value && input.required) return 'Enter an amount.';
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return 'Enter a valid amount of zero or more.';
    }
    if (value && Number(value) > 99999999.99) return 'Amount is too large.';
  }

  if (rule === 'discount' && value) {
    const root = input.closest('#legacy-react-root') || document;
    const itemTotal = Array.from(root.querySelectorAll('.item-entry')).reduce((sum, row) => {
      const quantity = Number(row.querySelector('[data-field="quantity"]')?.value || 0);
      const price = Number(row.querySelector('[data-field="unitPrice"]')?.value || 0);
      return sum + quantity * price;
    }, 0);
    const taxTotal = ['tax-cgst', 'tax-sgst', 'tax-sc'].reduce((sum, id) => {
      return sum + Number(root.querySelector(`#${id}`)?.value || 0);
    }, 0);
    if (Number(value) > itemTotal + taxTotal + 0.000001) {
      return 'Discount cannot exceed the items subtotal plus tax and service charge.';
    }
  }

  if (rule === 'outing-name' && value && value.length < 2) {
    return 'Enter at least 2 characters, or leave this optional field blank.';
  }

  if (rule === 'command') {
    if (!value) return 'Enter a command before applying it.';
    if (value.length > 300) return 'Command must be 300 characters or fewer.';
  }

  if (rule === 'upi' && value) {
    if (!/^[\w.-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(value)) {
      return 'Enter a valid UPI ID, such as aman@okhdfcbank.';
    }
  }


  if (rule === 'claimant' && !value) return 'Choose your name before generating a claim.';
  if (rule === 'category' && !['ANY', 'VEG', 'NON-VEG'].includes(value)) {
    return 'Choose ANY, VEG or NON-VEG.';
  }
  if (rule === 'dietary-tag' && !['ANY', 'VEG', 'NON-VEG'].includes(value)) {
    return 'Choose a valid dietary preference.';
  }
  if (
    rule === 'model' &&
    ![
      'auto',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ].includes(value)
  ) {
    return 'Choose one of the available Gemini model options.';
  }
  if (
    rule === 'primary-payer' &&
    value &&
    !Array.from(input.options || []).some((option) => option.value === value)
  ) {
    return 'Choose a member from this group.';
  }

  return '';
}

export function validateField(input) {
  if (!(input instanceof HTMLElement) || input.disabled || input.readOnly) return true;
  const message = customRuleMessage(input) || nativeValidityMessage(input);
  setFeedback(input, message);
  return !message;
}

export function validateFields(container, { focusFirst = true } = {}) {
  if (!container) return true;
  const fields = Array.from(container.querySelectorAll('[data-validate]'));
  const invalidFields = fields.filter((field) => !validateField(field));

  if (invalidFields.length && focusFirst) {
    invalidFields[0].focus({ preventScroll: true });
    invalidFields[0].scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }
  return invalidFields.length === 0;
}

export function setFieldValidationError(input, message) {
  if (!input) return;
  setFeedback(input, message);
}

export function clearFieldValidation(input) {
  if (!input) return;
  setFeedback(input, '');
}

export function validateFileInput(input, kind) {
  const file = input?.files?.[0];
  if (!input) return false;
  if (!file) {
    setFeedback(input, '');
    return true;
  }

  let message = '';
  if (kind === 'image') {
    message = getReceiptFileError(file);
  } else if (kind === 'json') {
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      message = 'Choose a .json backup file.';
    } else if (file.size > MAX_BACKUP_BYTES) {
      message = 'Backup file must be 10 MB or smaller.';
    }
  }

  setFeedback(input, message);
  return !message;
}

/** Install once at app startup; input errors appear on blur and update as the user edits. */
export function installInlineValidation() {
  if (document.documentElement.dataset.inlineValidationInstalled === 'true') return;
  document.documentElement.dataset.inlineValidationInstalled = 'true';

  document.addEventListener('focusout', (event) => {
    const field = event.target.closest?.('[data-validate]');
    if (field) {
      field.dataset.validationTouched = 'true';
      validateField(field);
    }
  });

  const updateTouchedField = (event) => {
    const field = event.target.closest?.('[data-validate]');
    if (
      field &&
      (field.dataset.validationTouched === 'true' || field.getAttribute('aria-invalid') === 'true')
    ) {
      validateField(field);
    }
  };
  document.addEventListener('input', updateTouchedField);
  document.addEventListener('change', updateTouchedField);
}
