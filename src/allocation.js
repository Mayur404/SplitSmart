import { toSafePaise } from './money.js';

/**
 * Split an integer amount into equal parts without losing residual paise.
 * Any remainder is assigned one paisa at a time, starting with the first part.
 *
 * @param {number} totalPaise
 * @param {number} partCount
 * @returns {number[]}
 */
export function splitEqually(totalPaise, partCount) {
  const total = toSafePaise(totalPaise, 'totalPaise');
  const count = Number(partCount);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('partCount must be a non-negative safe integer.');
  }

  if (count === 0) {
    if (total !== 0) {
      throw new RangeError('A non-zero amount cannot be split into zero parts.');
    }
    return [];
  }

  const sign = total < 0 ? -1 : 1;
  const magnitude = BigInt(Math.abs(total));
  const divisor = BigInt(count);
  const basePart = magnitude / divisor;
  const remainder = Number(magnitude % divisor);

  return Array.from({ length: count }, (_, index) => {
    const part = basePart + (index < remainder ? 1n : 0n);
    return Number(part) * sign;
  });
}

/**
 * Allocate an integer amount proportionally using the Largest Remainder Method
 * (Hamilton/Hare quota). The returned parts always sum exactly to totalPaise.
 *
 * Negative weights are treated as zero. If all weights are zero, the amount is
 * divided equally. Equal fractional remainders are resolved by original index.
 * BigInt arithmetic avoids floating-point remainder errors.
 *
 * @param {number} totalPaise
 * @param {number[]} weights
 * @returns {number[]}
 */
export function allocateLargestRemainder(totalPaise, weights) {
  const total = toSafePaise(totalPaise, 'totalPaise');
  if (!Array.isArray(weights)) {
    throw new TypeError('weights must be an array.');
  }

  if (weights.length === 0) {
    if (total !== 0) {
      throw new RangeError('A non-zero amount cannot be allocated to zero recipients.');
    }
    return [];
  }

  const normalizedWeights = weights.map((weight, index) => {
    const value = Number(weight ?? 0);
    if (!Number.isFinite(value)) {
      throw new TypeError(`weights[${index}] must be finite.`);
    }
    return BigInt(Math.max(0, Math.trunc(value)));
  });

  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0n);
  if (weightTotal === 0n) {
    return splitEqually(total, weights.length);
  }

  const sign = total < 0 ? -1 : 1;
  const magnitude = BigInt(Math.abs(total));
  const parts = normalizedWeights.map((weight, index) => {
    const numerator = magnitude * weight;
    return {
      index,
      value: numerator / weightTotal,
      remainder: numerator % weightTotal
    };
  });

  const allocatedTotal = parts.reduce((sum, part) => sum + part.value, 0n);
  const residualPaise = Number(magnitude - allocatedTotal);

  const remainderOrder = [...parts].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.index - right.index;
    }
    return left.remainder > right.remainder ? -1 : 1;
  });

  for (let index = 0; index < residualPaise; index += 1) {
    remainderOrder[index].value += 1n;
  }

  return parts.map(part => Number(part.value) * sign);
}

/**
 * Split a payment into at least two equal payment instructions.
 * Residual paise are assigned to the earliest instructions.
 *
 * @param {number} amountPaise
 * @param {number} partsCount
 * @returns {number[]}
 */
export function splitPayment(amountPaise, partsCount = 2) {
  const requestedCount = Math.trunc(Number(partsCount) || 2);
  const safeCount = Math.max(2, requestedCount);
  return splitEqually(amountPaise, safeCount);
}
