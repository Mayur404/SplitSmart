import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allocateLargestRemainder,
  assignItemsByDiet,
  assignUnassignedItemsEqually,
  calculateShares,
  formatCurrency,
  minimumCashFlow,
  netBalances,
  splitEqually,
  splitPayment,
  toPaise,
  undoUnrollItem,
  unrollItem
} from '../src/index.js';

test('Largest Remainder allocation preserves the total and deterministic ties', () => {
  assert.deepEqual(allocateLargestRemainder(1, [1, 1, 1]), [1, 0, 0]);
  assert.deepEqual(allocateLargestRemainder(100, [1, 2, 1]), [25, 50, 25]);
  assert.deepEqual(allocateLargestRemainder(-5, [1, 1]), [-3, -2]);
  assert.deepEqual(allocateLargestRemainder(5, [0, 0, 0]), [2, 2, 1]);
});

test('equal split and payment split preserve every paisa', () => {
  assert.deepEqual(splitEqually(100, 3), [34, 33, 33]);
  assert.deepEqual(splitEqually(-5, 2), [-3, -2]);
  assert.deepEqual(splitPayment(1001, 4), [251, 250, 250, 250]);
  assert.deepEqual(splitPayment(100, 1), [50, 50]);
});

test('quantity unrolling and undo preserve item totals', () => {
  const originalItem = {
    id: 'naan',
    name: 'Butter Naan',
    quantity: 3,
    totalPaise: 100,
    assignments: ['m1']
  };
  const unrolledItems = unrollItem(originalItem);

  assert.equal(unrolledItems.length, 3);
  assert.deepEqual(unrolledItems.map(item => item.totalPaise), [34, 33, 33]);
  assert.equal(unrolledItems.reduce((sum, item) => sum + item.totalPaise, 0), 100);
  assert.deepEqual(undoUnrollItem(unrolledItems, originalItem), [originalItem]);
  assert.equal(unrollItem({ id: 'single', quantity: 1, totalPaise: 100 }), null);
});

test('unassigned items are assigned to all members without overwriting assignments', () => {
  const items = [
    { id: 'i1', assignments: [] },
    { id: 'i2', assignments: ['m1'] }
  ];
  const result = assignUnassignedItemsEqually(items, ['m1', 'm2', 'm2']);

  assert.equal(result.assignedCount, 1);
  assert.deepEqual(result.items[0].assignments, ['m1', 'm2']);
  assert.deepEqual(result.items[1].assignments, ['m1']);
  assert.deepEqual(items[0].assignments, []);
});

test('diet assignment only updates categories with eligible members', () => {
  const items = [
    { id: 'v', category: 'VEG', assignments: [] },
    { id: 'n', category: 'NON-VEG', assignments: ['old'] },
    { id: 'a', category: 'ANY', assignments: [] }
  ];
  const members = [
    { id: 'm1', dietaryTag: 'VEG' },
    { id: 'm2', dietaryTag: 'NON-VEG' }
  ];
  const result = assignItemsByDiet(items, members);

  assert.equal(result.changedCount, 2);
  assert.deepEqual(result.items.map(item => item.assignments), [['m1'], ['m2'], []]);
});

test('participant shares split food equally and allocate net tax proportionally', () => {
  const items = [
    { id: 'i1', totalPaise: 10000, assignments: ['m1', 'm2'] },
    { id: 'i2', totalPaise: 5000, assignments: ['m1'] }
  ];
  const members = [
    { id: 'm1', name: 'Aman' },
    { id: 'm2', name: 'Bina' }
  ];
  const shares = calculateShares(items, members, { cgst: 750, sgst: 750 }, 300);

  assert.equal(shares[0].foodPaise, 10000);
  assert.equal(shares[1].foodPaise, 5000);
  assert.equal(shares[0].sharePaise, 10800);
  assert.equal(shares[1].sharePaise, 5400);
  assert.equal(shares.reduce((sum, share) => sum + share.sharePaise, 0), 16200);
});

test('net balances reconcile and greedy minimum cash flow creates valid transfers', () => {
  const balances = netBalances(
    [
      { memberId: 'a', name: 'A', sharePaise: 600 },
      { memberId: 'b', name: 'B', sharePaise: 400 },
      { memberId: 'c', name: 'C', sharePaise: 0 }
    ],
    [
      { memberId: 'c', amountPaise: 700 },
      { memberId: 'a', amountPaise: 300 }
    ]
  );
  const settlements = minimumCashFlow(balances);

  assert.equal(balances.reduce((sum, row) => sum + row.balancePaise, 0), 0);
  assert.equal(settlements.length, 2);
  assert.equal(settlements.reduce((sum, row) => sum + row.amountPaise, 0), 700);
  assert.throws(
    () => minimumCashFlow([{ id: 'a', balancePaise: 100 }]),
    /sum to exactly zero/
  );
});

test('currency helpers parse and format rupee values', () => {
  assert.equal(toPaise('₹ 1,250.75'), 125075);
  assert.equal(toPaise(null), 0);
  assert.equal(formatCurrency(12500000), '₹1,25,000.00');
});
