import { splitEqually } from './allocation.js';
import { toSafePaise } from './money.js';

/**
 * Expand a quantity-based item into individually assignable units.
 * Residual paise are assigned to the earliest units so the total is preserved.
 *
 * @param {object} item
 * @returns {object[]|null} Expanded items, or null when expansion is unnecessary.
 */
export function unrollItem(item) {
  if (!item || typeof item !== 'object') {
    throw new TypeError('item must be an object.');
  }

  const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
  if (quantity <= 1 || item.unrolledFrom) return null;

  const totalPaise = toSafePaise(item.totalPaise, 'item.totalPaise');
  const unitAmounts = splitEqually(totalPaise, quantity);

  return unitAmounts.map((unitPaise, index) => ({
    ...item,
    id: `${item.id}-u${index + 1}`,
    name: `${item.name} (${index + 1}/${quantity})`,
    quantity: 1,
    unitPaise,
    totalPaise: unitPaise,
    assignments: [...(item.assignments || [])],
    unrolledFrom: item.id
  }));
}

/**
 * Restore an original item by removing the units created from it.
 * The input array and original item are not mutated.
 *
 * @param {object[]} items
 * @param {object} originalItem
 * @returns {object[]}
 */
export function undoUnrollItem(items, originalItem) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array.');
  }
  if (!originalItem || typeof originalItem !== 'object') {
    throw new TypeError('originalItem must be an object.');
  }

  const remainingItems = items.filter(item => item.unrolledFrom !== originalItem.id);
  return [...remainingItems, originalItem];
}

/**
 * Assign every currently unassigned item to all supplied members.
 * Existing assignments are retained.
 *
 * @param {object[]} items
 * @param {string[]} memberIds
 * @returns {{ items: object[], assignedCount: number }}
 */
export function assignUnassignedItemsEqually(items, memberIds) {
  if (!Array.isArray(items) || !Array.isArray(memberIds)) {
    throw new TypeError('items and memberIds must be arrays.');
  }

  const uniqueMemberIds = [...new Set(memberIds)];
  let assignedCount = 0;

  const updatedItems = items.map(item => {
    const currentAssignments = Array.isArray(item.assignments) ? item.assignments : [];
    if (currentAssignments.length > 0) return { ...item, assignments: [...currentAssignments] };

    assignedCount += 1;
    return { ...item, assignments: [...uniqueMemberIds] };
  });

  return { items: updatedItems, assignedCount };
}

/**
 * Assign VEG items to VEG members and NON-VEG items to NON-VEG members.
 * Items are left unchanged when no eligible member exists for their category.
 *
 * @param {object[]} items
 * @param {object[]} members
 * @returns {{ items: object[], changedCount: number }}
 */
export function assignItemsByDiet(items, members) {
  if (!Array.isArray(items) || !Array.isArray(members)) {
    throw new TypeError('items and members must be arrays.');
  }

  const eligibleMembersByDiet = {
    VEG: members.filter(member => member.dietaryTag === 'VEG').map(member => member.id),
    'NON-VEG': members.filter(member => member.dietaryTag === 'NON-VEG').map(member => member.id)
  };

  let changedCount = 0;
  const updatedItems = items.map(item => {
    const eligibleMembers = eligibleMembersByDiet[item.category];
    if (!eligibleMembers || eligibleMembers.length === 0) return { ...item };

    changedCount += 1;
    return { ...item, assignments: [...eligibleMembers] };
  });

  return { items: updatedItems, changedCount };
}
