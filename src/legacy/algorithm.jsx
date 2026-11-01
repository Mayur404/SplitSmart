/**
 * SplitSmart — algorithm.jsx
 * Financial Calculation Systems Engine
 *
 * All monetary values are handled internally as integer paise (1 INR = 100 paise)
 * to avoid binary floating-point rounding errors.
 */

/**
 * Safely parse any decimal currency string or number to integer paise.
 * Strips currency symbols (₹, $, etc.), commas, and whitespace.
 * e.g. "1,250.50" -> 125050 paise, "0.1" -> 10 paise.
 */
export function toPaise(value) {
  if (value == null) return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }
  const clean = String(value).replace(/[^0-9.-]/g, '').trim();
  if (!clean || clean === '-' || clean === '.') return 0;
  const num = Number(clean);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

/**
 * Format integer paise to rupees string with 2 decimal places.
 * e.g. 125050 -> "1250.50"
 */
export function rupees(paise) {
  const p = Math.trunc(Number(paise) || 0);
  return (p / 100).toFixed(2);
}

/**
 * Format integer paise with Indian comma grouping for display.
 * e.g. 12500000 -> "₹1,25,000.00", 125050 -> "₹1,250.50"
 */
export function formatCurrency(paise) {
  const p = Math.trunc(Number(paise) || 0);
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const rupeesPart = Math.floor(abs / 100);
  const paisePart = String(abs % 100).padStart(2, '0');

  // Indian numbering format: last 3 digits, then groups of 2 digits
  let s = String(rupeesPart);
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${sign}₹${s}.${paisePart}`;
}

/**
 * Largest Remainder Method (Hamilton-Hare / Largest Remainder Quota).
 * Distributes integer `total` proportionally across `weights` such that
 * the sum of returned parts EXACTLY equals `total`.
 *
 * Residual paise are distributed to elements with the largest fractional remainders.
 * Deterministic tie-breaking uses the original index.
 */
export function allocateLargestRemainder(total, weights) {
  const tot = Math.trunc(Number(total) || 0);
  if (!tot) return weights.map(() => 0);

  const posWeights = weights.map(w => Math.max(0, Math.trunc(Number(w) || 0)));
  const weightSum = posWeights.reduce((a, b) => a + b, 0);

  // If weights sum to 0, distribute equally across all slots
  if (weightSum === 0) {
    const count = weights.length;
    if (count === 0) return [];
    const sign = tot < 0 ? -1 : 1;
    const mag = Math.abs(tot);
    const base = Math.floor(mag / count);
    const rem = mag % count;
    return weights.map((_, i) => sign * (base + (i < rem ? 1 : 0)));
  }

  const sign = tot < 0 ? -1 : 1;
  const mag = Math.abs(tot);

  // Initial floor allocation and remainders
  const parts = posWeights.map((w, i) => {
    const exact = (mag * w) / weightSum;
    const val = Math.floor(exact);
    return {
      index: i,
      value: val,
      remainder: exact - val
    };
  });

  const allocated = parts.reduce((acc, p) => acc + p.value, 0);
  let residual = mag - allocated;

  // Sort descending by remainder, tie-breaking by original index
  const sorted = [...parts].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < residual; i++) {
    const target = sorted[i % sorted.length];
    parts[target.index].value += 1;
  }

  return parts.map(p => p.value * sign);
}

/**
 * Unroll an item with quantity > 1 into individual assignable units.
 * e.g. 3 x Naan at ₹40 (total ₹120) becomes:
 * [Naan (1/3) ₹40, Naan (2/3) ₹40, Naan (3/3) ₹40]
 * Handles residual paise deterministically.
 */
export function unrollItem(item) {
  const qty = Math.max(1, Math.trunc(Number(item.quantity) || 1));
  if (qty <= 1 || item.unrolledFrom) return null;

  const totalPaise = Math.trunc(Number(item.totalPaise) || 0);
  const basePrice = Math.floor(totalPaise / qty);
  const remainder = totalPaise % qty;

  return Array.from({ length: qty }, (_, i) => {
    const itemPaise = basePrice + (i < remainder ? 1 : 0);
    return {
      ...item,
      id: `${item.id}-u${i + 1}`,
      name: `${item.name} (${i + 1}/${qty})`,
      quantity: 1,
      unitPaise: itemPaise,
      totalPaise: itemPaise,
      assignments: [...(item.assignments || [])],
      unrolledFrom: item.id
    };
  });
}

/**
 * Undo unrolling of items that originated from an unrolled item.
 */
export function undoUnrollItem(items, originalItem) {
  const unrolledPrefix = `${originalItem.id}-u`;
  const filtered = items.filter(i => !i.id.startsWith(unrolledPrefix));
  return [...filtered, originalItem];
}

/**
 * Proportional Tax and Discount Allocation.
 *
 * For each participant:
 * Final Share = Food Subtotal + Proportional Net Adjustment
 * Where:
 * Proportional Net Adjustment = (Participant Food Subtotal / Total Food Subtotal) * (Total Tax - Discount)
 *
 * Invariant: Sum of participant shares === Grand Total in paise.
 */
export function calculateShares(items, members, tax = { cgst: 0, sgst: 0, serviceCharge: 0 }, discount = 0) {
  const memberCount = members.length;
  const foodPaise = new Array(memberCount).fill(0);
  const memberIndexMap = new Map(members.map((m, idx) => [m.id, idx]));

  // 1. Allocate each item's totalPaise equally among its assigned members
  for (const item of items) {
    const assignedIds = [...new Set(item.assignments || [])].filter(id => memberIndexMap.has(id));
    if (assignedIds.length > 0) {
      const itemCost = Math.trunc(Number(item.totalPaise) || 0);
      const splitShares = allocateLargestRemainder(itemCost, assignedIds.map(() => 1));
      assignedIds.forEach((id, j) => {
        const idx = memberIndexMap.get(id);
        foodPaise[idx] += splitShares[j];
      });
    }
  }

  const totalFoodPaise = foodPaise.reduce((a, b) => a + b, 0);

  // 2. Compute net adjustment: (CGST + SGST + ServiceCharge) - Discount
  const cgstPaise = Math.max(0, Math.trunc(Number(tax.cgst) || 0));
  const sgstPaise = Math.max(0, Math.trunc(Number(tax.sgst) || 0));
  const scPaise = Math.max(0, Math.trunc(Number(tax.serviceCharge) || 0));
  const discountPaise = Math.max(0, Math.trunc(Number(discount) || 0));

  const totalTaxPaise = cgstPaise + sgstPaise + scPaise;
  const netAdjustmentPaise = totalTaxPaise - discountPaise;

  // 3. Proportional distribution of net adjustment by food subtotals
  // If total food is 0, split adjustment equally across all members
  const adjustmentWeights = totalFoodPaise > 0 ? foodPaise : members.map(() => 1);
  const adjustments = allocateLargestRemainder(netAdjustmentPaise, adjustmentWeights);

  // 4. Construct final shares
  return members.map((m, i) => {
    const fPaise = foodPaise[i];
    const adjPaise = adjustments[i] || 0;
    const sharePaise = Math.max(0, fPaise + adjPaise);
    return {
      memberId: m.id,
      name: m.name,
      foodPaise: fPaise,
      taxDiscountPaise: adjPaise,
      sharePaise
    };
  });
}

/**
 * Calculate net balances across all participants.
 * Net Balance = Total Paid - Total Consumed (Share)
 *
 * Positive balance (> 0): Creditor (money owed TO them).
 * Negative balance (< 0): Debtor (money they OWE to the group).
 * Zero balance (= 0): Fully settled.
 *
 * Invariant: Sum of all net balances === 0.
 */
export function netBalances(shares, payers) {
  const balanceMap = new Map();

  for (const s of shares) {
    balanceMap.set(s.memberId, {
      id: s.memberId,
      name: s.name,
      sharePaise: Math.trunc(Number(s.sharePaise) || 0),
      paidPaise: 0,
      balancePaise: -Math.trunc(Number(s.sharePaise) || 0)
    });
  }

  for (const p of payers) {
    const row = balanceMap.get(p.memberId);
    const amt = Math.trunc(Number(p.amountPaise) || 0);
    if (row) {
      row.paidPaise += amt;
      row.balancePaise += amt;
    } else {
      balanceMap.set(p.memberId, {
        id: p.memberId,
        name: p.name || 'Participant',
        sharePaise: 0,
        paidPaise: amt,
        balancePaise: amt
      });
    }
  }

  const list = [...balanceMap.values()];
  const poolSum = list.reduce((acc, x) => acc + x.balancePaise, 0);

  if (poolSum !== 0) {
    throw new Error(`Outing payments do not balance shares. Discrepancy is ${rupees(poolSum)}.`);
  }

  return list;
}

/**
 * Greedy Minimum Cash Flow Algorithm.
 * Matches the largest debtor with the largest creditor iteratively.
 * Reduces the number of settlement transfers needed.
 *
 * Output: List of direct settlement transactions:
 * { debtor, debtorName, creditor, creditorName, amountPaise, amountRupees }
 */
export function minimumCashFlow(balances) {
  const rows = balances.map((x, idx) => ({
    id: x.id,
    name: x.name,
    balance: Math.trunc(x.balancePaise || 0),
    originalIndex: idx
  }));

  // Debtors have negative balance (< 0). Creditors have positive balance (> 0).
  const debtors = rows
    .filter(x => x.balance < 0)
    .sort((a, b) => a.balance - b.balance || a.originalIndex - b.originalIndex); // Most negative first

  const creditors = rows
    .filter(x => x.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.originalIndex - b.originalIndex); // Most positive first

  const settlements = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtAmount = -debtors[d].balance;
    const creditAmount = creditors[c].balance;
    const transferAmount = Math.min(debtAmount, creditAmount);

    if (transferAmount > 0) {
      settlements.push({
        debtor: debtors[d].id,
        debtorName: debtors[d].name,
        creditor: creditors[c].id,
        creditorName: creditors[c].name,
        amountPaise: transferAmount,
        amountRupees: rupees(transferAmount)
      });
    }

    debtors[d].balance += transferAmount;
    creditors[c].balance -= transferAmount;

    if (debtors[d].balance === 0) d++;
    if (creditors[c].balance === 0) c++;
  }

  // Verification check: all balances must reconcile to exactly 0
  const remainingDebt = debtors.slice(d).reduce((acc, x) => acc + x.balance, 0);
  const remainingCredit = creditors.slice(c).reduce((acc, x) => acc + x.balance, 0);

  if (remainingDebt !== 0 || remainingCredit !== 0) {
    throw new Error('Settlement algorithm failed to reconcile all balances.');
  }

  return settlements;
}

/**
 * In-browser development test runner verifying financial calculations and invariants.
 */
export function runSelfTests() {
  const assert = (condition, msg) => {
    if (!condition) throw new Error(`Self-test assertion failed: ${msg}`);
  };

  // 1. One-paise remainder allocation
  const onePaise = allocateLargestRemainder(1, [1, 1, 1]);
  assert(onePaise.reduce((a, b) => a + b, 0) === 1, 'one-paise remainder total');
  assert(onePaise[0] === 1 && onePaise[1] === 0 && onePaise[2] === 0, 'one-paise tie-breaking');

  // 2. Unroll quantity with fractional residual
  const unrolled = unrollItem({ id: 'naan', name: 'Butter Naan', quantity: 3, totalPaise: 100 });
  assert(unrolled.length === 3, 'unroll count');
  assert(unrolled.reduce((a, x) => a + x.totalPaise, 0) === 100, 'unroll residual sum');
  assert(unrolled[0].totalPaise === 34 && unrolled[1].totalPaise === 33 && unrolled[2].totalPaise === 33, 'unroll residual parts');

  // 3. Proportional tax allocation & reconciliation
  const mockItems = [
    { id: 'i1', totalPaise: 10000, assignments: ['m1', 'm2'] }, // 5000 each
    { id: 'i2', totalPaise: 5000, assignments: ['m1'] }          // 5000 to m1
  ];
  const mockMembers = [{ id: 'm1', name: 'Aman' }, { id: 'm2', name: 'Bina' }];
  // Food: m1 has 10,000, m2 has 5,000. Total food = 15,000.
  // Tax: 1,500 (10%). Discount: 300. Net adjustment = 1,200.
  // m1 share of adj: 1200 * (10000/15000) = 800.
  // m2 share of adj: 1200 * (5000/15000) = 400.
  const shares = calculateShares(mockItems, mockMembers, { cgst: 750, sgst: 750 }, 300);
  assert(shares.find(s => s.memberId === 'm1').sharePaise === 10800, 'm1 proportional share');
  assert(shares.find(s => s.memberId === 'm2').sharePaise === 5400, 'm2 proportional share');
  assert(shares.reduce((a, x) => a + x.sharePaise, 0) === 16200, 'shares match grand total');

  // 4. Full discount edge case
  const freeShares = calculateShares([{ id: 'z', totalPaise: 5000, assignments: ['m1'] }], mockMembers, {}, 5000);
  assert(freeShares.find(s => s.memberId === 'm1').sharePaise === 0, 'full discount share');

  // 5. Multiple payers & net balances
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
  assert(balances.reduce((a, x) => a + x.balancePaise, 0) === 0, 'multiple payers balance zero sum');

  // 6. Minimum cash flow settlements
  const settlements = minimumCashFlow(balances);
  assert(settlements.length === 2, 'two transfers required');
  assert(settlements.reduce((a, x) => a + x.amountPaise, 0) === 700, 'total settlement equals total debt');

  // 7. Multiple equal debtors
  const equalDebtors = [
    { id: 'd1', name: 'D1', balancePaise: -100 },
    { id: 'd2', name: 'D2', balancePaise: -100 },
    { id: 'c1', name: 'C1', balancePaise: 200 }
  ];
  const eqTransfers = minimumCashFlow(equalDebtors);
  assert(eqTransfers.length === 2, 'equal debtors transfers');
  assert(eqTransfers.every(t => t.creditor === 'c1' && t.amountPaise === 100), 'equal debtors match');

  // 8. String parsing in toPaise
  assert(toPaise('₹ 1,250.75') === 125075, 'rupee string parsing');
  assert(toPaise('0') === 0, 'zero string parsing');
  assert(toPaise(null) === 0, 'null parsing');

  return 'All financial calculation and settlement tests passed (8/8).';
}
