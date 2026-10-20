import { allocateLargestRemainder } from './allocation.js';
import { toSafePaise } from './money.js';

const DEFAULT_TAX = Object.freeze({
  cgst: 0,
  sgst: 0,
  serviceCharge: 0
});

/**
 * Calculate each participant's item share and proportional tax/discount share.
 *
 * 1. Each item is split equally among its unique, valid assignees.
 * 2. Net tax/discount is allocated in proportion to each member's food subtotal.
 * 3. All calculations use integer paise and deterministic residual allocation.
 *
 * @param {object[]} items
 * @param {object[]} members
 * @param {{cgst?: number, sgst?: number, serviceCharge?: number}} tax
 * @param {number} discountPaise
 * @returns {object[]}
 */
export function calculateShares(items, members, tax = DEFAULT_TAX, discountPaise = 0) {
  if (!Array.isArray(items) || !Array.isArray(members)) {
    throw new TypeError('items and members must be arrays.');
  }

  const foodAmounts = new Array(members.length).fill(0);
  const memberIndexById = new Map();

  members.forEach((member, index) => {
    if (memberIndexById.has(member.id)) {
      throw new Error(`Duplicate member id: ${member.id}`);
    }
    memberIndexById.set(member.id, index);
  });

  for (const item of items) {
    const assignedMemberIds = [...new Set(item.assignments || [])]
      .filter(memberId => memberIndexById.has(memberId));

    if (assignedMemberIds.length === 0) continue;

    const itemTotalPaise = toSafePaise(item.totalPaise, `item ${item.id} totalPaise`);
    const itemShares = allocateLargestRemainder(
      itemTotalPaise,
      assignedMemberIds.map(() => 1)
    );

    assignedMemberIds.forEach((memberId, shareIndex) => {
      const memberIndex = memberIndexById.get(memberId);
      foodAmounts[memberIndex] += itemShares[shareIndex];
    });
  }

  const totalFoodPaise = foodAmounts.reduce((sum, amount) => sum + amount, 0);
  const normalizedTax = tax || {};
  const cgstPaise = Math.max(0, toSafePaise(normalizedTax.cgst, 'tax.cgst'));
  const sgstPaise = Math.max(0, toSafePaise(normalizedTax.sgst, 'tax.sgst'));
  const serviceChargePaise = Math.max(
    0,
    toSafePaise(normalizedTax.serviceCharge, 'tax.serviceCharge')
  );
  const normalizedDiscountPaise = Math.max(0, toSafePaise(discountPaise, 'discountPaise'));

  const netAdjustmentPaise =
    cgstPaise + sgstPaise + serviceChargePaise - normalizedDiscountPaise;

  const adjustmentWeights = totalFoodPaise > 0
    ? foodAmounts
    : members.map(() => 1);
  const memberAdjustments = allocateLargestRemainder(
    netAdjustmentPaise,
    adjustmentWeights
  );

  return members.map((member, index) => {
    const foodPaise = foodAmounts[index];
    const taxDiscountPaise = memberAdjustments[index] || 0;

    return {
      memberId: member.id,
      name: member.name,
      foodPaise,
      taxDiscountPaise,
      sharePaise: Math.max(0, foodPaise + taxDiscountPaise)
    };
  });
}
