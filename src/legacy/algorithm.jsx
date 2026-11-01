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

export function rupees(paise) {
  const p = Math.trunc(Number(paise) || 0);
  return (p / 100).toFixed(2);
}

export function formatCurrency(paise) {
  const p = Math.trunc(Number(paise) || 0);
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const rupeesPart = Math.floor(abs / 100);
  const paisePart = String(abs % 100).padStart(2, '0');

  let s = String(rupeesPart);
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${sign}₹${s}.${paisePart}`;
}

export function allocateLargestRemainder(total, weights) {
  const tot = Math.trunc(Number(total) || 0);
  if (!tot) return weights.map(() => 0);

  const posWeights = weights.map(w => Math.max(0, Math.trunc(Number(w) || 0)));
  const weightSum = posWeights.reduce((a, b) => a + b, 0);

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

export function undoUnrollItem(items, originalItem) {
  const unrolledPrefix = `${originalItem.id}-u`;
  const filtered = items.filter(i => !i.id.startsWith(unrolledPrefix));
  return [...filtered, originalItem];
}

export function calculateShares(items, members, tax = { cgst: 0, sgst: 0, serviceCharge: 0 }, discount = 0) {
  const memberCount = members.length;
  const foodPaise = new Array(memberCount).fill(0);
  const memberIndexMap = new Map(members.map((m, idx) => [m.id, idx]));

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

  const cgstPaise = Math.max(0, Math.trunc(Number(tax.cgst) || 0));
  const sgstPaise = Math.max(0, Math.trunc(Number(tax.sgst) || 0));
  const scPaise = Math.max(0, Math.trunc(Number(tax.serviceCharge) || 0));
  const discountPaise = Math.max(0, Math.trunc(Number(discount) || 0));

  const totalTaxPaise = cgstPaise + sgstPaise + scPaise;
  const netAdjustmentPaise = totalTaxPaise - discountPaise;

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

export function minimumCashFlow(balances) {
  const rows = balances.map((x, idx) => ({
    id: x.id,
    name: x.name,
    balance: Math.trunc(x.balancePaise || 0),
    originalIndex: idx
  }));

  const debtors = rows
    .filter(x => x.balance < 0)
    .sort((a, b) => a.balance - b.balance || a.originalIndex - b.originalIndex); 

  const creditors = rows
    .filter(x => x.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.originalIndex - b.originalIndex); 

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

  const remainingDebt = debtors.slice(d).reduce((acc, x) => acc + x.balance, 0);
  const remainingCredit = creditors.slice(c).reduce((acc, x) => acc + x.balance, 0);

  if (remainingDebt !== 0 || remainingCredit !== 0) {
    throw new Error('Settlement algorithm failed to reconcile all balances.');
  }

  return settlements;
}

export function runSelfTests() {
  const assert = (condition, msg) => {
    if (!condition) throw new Error(`Self-test assertion failed: ${msg}`);
  };

  const onePaise = allocateLargestRemainder(1, [1, 1, 1]);
  assert(onePaise.reduce((a, b) => a + b, 0) === 1, 'one-paise remainder total');
  assert(onePaise[0] === 1 && onePaise[1] === 0 && onePaise[2] === 0, 'one-paise tie-breaking');

  const unrolled = unrollItem({ id: 'naan', name: 'Butter Naan', quantity: 3, totalPaise: 100 });
  assert(unrolled.length === 3, 'unroll count');
  assert(unrolled.reduce((a, x) => a + x.totalPaise, 0) === 100, 'unroll residual sum');
  assert(unrolled[0].totalPaise === 34 && unrolled[1].totalPaise === 33 && unrolled[2].totalPaise === 33, 'unroll residual parts');

  const mockItems = [
    { id: 'i1', totalPaise: 10000, assignments: ['m1', 'm2'] }, // 5000 each
    { id: 'i2', totalPaise: 5000, assignments: ['m1'] }          // 5000 to m1
  ];
  const mockMembers = [{ id: 'm1', name: 'Aman' }, { id: 'm2', name: 'Bina' }];
  const shares = calculateShares(mockItems, mockMembers, { cgst: 750, sgst: 750 }, 300);
  assert(shares.find(s => s.memberId === 'm1').sharePaise === 10800, 'm1 proportional share');
  assert(shares.find(s => s.memberId === 'm2').sharePaise === 5400, 'm2 proportional share');
  assert(shares.reduce((a, x) => a + x.sharePaise, 0) === 16200, 'shares match grand total');

  const freeShares = calculateShares([{ id: 'z', totalPaise: 5000, assignments: ['m1'] }], mockMembers, {}, 5000);
  assert(freeShares.find(s => s.memberId === 'm1').sharePaise === 0, 'full discount share');

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

  const settlements = minimumCashFlow(balances);
  assert(settlements.length === 2, 'two transfers required');
  assert(settlements.reduce((a, x) => a + x.amountPaise, 0) === 700, 'total settlement equals total debt');

  const equalDebtors = [
    { id: 'd1', name: 'D1', balancePaise: -100 },
    { id: 'd2', name: 'D2', balancePaise: -100 },
    { id: 'c1', name: 'C1', balancePaise: 200 }
  ];
  const eqTransfers = minimumCashFlow(equalDebtors);
  assert(eqTransfers.length === 2, 'equal debtors transfers');
  assert(eqTransfers.every(t => t.creditor === 'c1' && t.amountPaise === 100), 'equal debtors match');

  assert(toPaise('₹ 1,250.75') === 125075, 'rupee string parsing');
  assert(toPaise('0') === 0, 'zero string parsing');
  assert(toPaise(null) === 0, 'null parsing');

  return 'All financial calculation and settlement tests passed (8/8).';
}
