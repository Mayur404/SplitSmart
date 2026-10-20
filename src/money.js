/**
 * Currency helpers used by the SplitSmart splitting algorithms.
 * All internal amounts are integer paise (100 paise = ₹1).
 */

/**
 * Convert a rupee value to integer paise.
 * Currency symbols, commas, and whitespace are ignored for string input.
 * Invalid or missing values are treated as zero to match the source project.
 *
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function toPaise(value) {
  if (value == null) return 0;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    const result = Math.round(value * 100);
    return Number.isSafeInteger(result) ? result : 0;
  }

  const cleanedValue = String(value).replace(/[^0-9.-]/g, '').trim();
  if (!cleanedValue || cleanedValue === '-' || cleanedValue === '.') return 0;

  const numericValue = Number(cleanedValue);
  if (!Number.isFinite(numericValue)) return 0;

  const result = Math.round((numericValue + Number.EPSILON) * 100);
  return Number.isSafeInteger(result) ? result : 0;
}

/**
 * Format integer paise as a rupee amount with two decimal places.
 *
 * @param {number} paise
 * @returns {string}
 */
export function rupees(paise) {
  const amount = Math.trunc(Number(paise) || 0);
  return (amount / 100).toFixed(2);
}

/**
 * Format integer paise using Indian digit grouping.
 * Example: 12500000 -> "₹1,25,000.00".
 *
 * @param {number} paise
 * @returns {string}
 */
export function formatCurrency(paise) {
  const amount = Math.trunc(Number(paise) || 0);
  const sign = amount < 0 ? '-' : '';
  const absoluteAmount = Math.abs(amount);
  const rupeePart = Math.floor(absoluteAmount / 100);
  const paisePart = String(absoluteAmount % 100).padStart(2, '0');

  let groupedRupees = String(rupeePart);
  if (groupedRupees.length > 3) {
    const lastThreeDigits = groupedRupees.slice(-3);
    const leadingDigits = groupedRupees.slice(0, -3);
    groupedRupees = `${leadingDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThreeDigits}`;
  }

  return `${sign}₹${groupedRupees}.${paisePart}`;
}

/**
 * Normalize an amount that is expected to be an integer number of paise.
 *
 * @param {number|string|null|undefined} value
 * @param {string} fieldName
 * @returns {number}
 * @throws {TypeError|RangeError}
 */
export function toSafePaise(value, fieldName = 'amount') {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`${fieldName} must be a finite number.`);
  }

  const integerValue = Math.trunc(numericValue);
  if (!Number.isSafeInteger(integerValue)) {
    throw new RangeError(`${fieldName} must be a safe integer number of paise.`);
  }

  return integerValue;
}
