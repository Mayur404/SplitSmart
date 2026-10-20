import { rupees, toSafePaise } from './money.js';

/**
 * Calculate each participant's net balance.
 * Positive = creditor, negative = debtor, zero = settled.
 * The sum of all balances must be exactly zero.
 *
 * @param {object[]} shares
 * @param {object[]} payers
 * @returns {object[]}
 */
export function netBalances(shares, payers) {
  if (!Array.isArray(shares) || !Array.isArray(payers)) {
    throw new TypeError('shares and payers must be arrays.');
  }

  const balanceByMemberId = new Map();

  for (const share of shares) {
    const sharePaise = toSafePaise(share.sharePaise, 'share.sharePaise');
    balanceByMemberId.set(share.memberId, {
      id: share.memberId,
      name: share.name,
      sharePaise,
      paidPaise: 0,
      balancePaise: -sharePaise
    });
  }

  for (const payer of payers) {
    const amountPaise = toSafePaise(payer.amountPaise, 'payer.amountPaise');
    const existingBalance = balanceByMemberId.get(payer.memberId);

    if (existingBalance) {
      existingBalance.paidPaise += amountPaise;
      existingBalance.balancePaise += amountPaise;
      continue;
    }

    balanceByMemberId.set(payer.memberId, {
      id: payer.memberId,
      name: payer.name || 'Participant',
      sharePaise: 0,
      paidPaise: amountPaise,
      balancePaise: amountPaise
    });
  }

  const balances = [...balanceByMemberId.values()];
  const balanceTotal = balances.reduce((sum, entry) => sum + entry.balancePaise, 0);

  if (balanceTotal !== 0) {
    throw new Error(
      `Payments do not balance shares. Discrepancy is ${rupees(balanceTotal)} rupees.`
    );
  }

  return balances;
}

/**
 * Generate direct transfers by greedily matching the largest debtor with the
 * largest creditor. This deterministic heuristic produces a valid settlement
 * and typically reduces the number of transfers; it is not a proof of a globally
 * minimum-transfer solution for every possible balance configuration.
 *
 * @param {object[]} balances
 * @returns {object[]}
 */
export function minimumCashFlow(balances) {
  if (!Array.isArray(balances)) {
    throw new TypeError('balances must be an array.');
  }

  const rows = balances.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    balance: toSafePaise(entry.balancePaise, `balances[${index}].balancePaise`),
    originalIndex: index
  }));

  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  if (totalBalance !== 0) {
    throw new Error('Settlement requires balances that sum to exactly zero.');
  }

  const debtors = rows
    .filter(row => row.balance < 0)
    .sort((left, right) => {
      if (left.balance === right.balance) return left.originalIndex - right.originalIndex;
      return left.balance < right.balance ? -1 : 1;
    });

  const creditors = rows
    .filter(row => row.balance > 0)
    .sort((left, right) => {
      if (left.balance === right.balance) return left.originalIndex - right.originalIndex;
      return left.balance > right.balance ? -1 : 1;
    });

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const transferPaise = Math.min(-debtor.balance, creditor.balance);

    if (transferPaise > 0) {
      settlements.push({
        debtor: debtor.id,
        debtorName: debtor.name,
        creditor: creditor.id,
        creditorName: creditor.name,
        amountPaise: transferPaise,
        amountRupees: rupees(transferPaise)
      });
    }

    debtor.balance += transferPaise;
    creditor.balance -= transferPaise;

    if (debtor.balance === 0) debtorIndex += 1;
    if (creditor.balance === 0) creditorIndex += 1;
  }

  const remainingDebtorBalance = debtors
    .slice(debtorIndex)
    .reduce((sum, debtor) => sum + debtor.balance, 0);
  const remainingCreditorBalance = creditors
    .slice(creditorIndex)
    .reduce((sum, creditor) => sum + creditor.balance, 0);

  if (remainingDebtorBalance !== 0 || remainingCreditorBalance !== 0) {
    throw new Error('Settlement algorithm failed to reconcile all balances.');
  }

  return settlements;
}
