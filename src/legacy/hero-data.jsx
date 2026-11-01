/**
 * SplitSmart — hero-data.jsx
 * Sample dinner for the landing-page story. Every number shown in the
 * animation is derived here from the real calculation engine (algorithm.jsx),
 * so the hero can never drift from what the product actually computes.
 */
import { calculateShares, allocateLargestRemainder, formatCurrency } from './algorithm.jsx';

const FRIENDS = [
  { id: 'aman',  name: 'Aman',  initial: 'A' },
  { id: 'sneha', name: 'Sneha', initial: 'S' },
  { id: 'rahul', name: 'Rahul', initial: 'R' }
];

// Same dinner as the product's demo bill (House of Thali), amounts in paise.
const DISHES = [
  { id: 'biryani', label: 'Veg Biryani',    totalPaise: 52000, eaters: ['aman'] },
  { id: 'naan',    label: 'Butter Naan ×2', totalPaise: 8000,  eaters: ['aman', 'sneha'] },
  { id: 'coffee',  label: 'Cold Coffee',    totalPaise: 18000, eaters: ['sneha'] },
  { id: 'paneer',  label: 'Paneer Tikka',   totalPaise: 38000, eaters: ['rahul'] }
];
const TAX = { cgst: 5800, sgst: 5800, serviceCharge: 0 };
const DISCOUNT = 1600;

/** Whole rupees read cleanly ("₹520"); anything else keeps its paise. */
export const shortMoney = paise => (paise % 100 === 0 ? `₹${paise / 100}` : formatCurrency(paise));

export function buildStory() {
  const members = FRIENDS.map(f => ({ id: f.id, name: f.name }));
  const items = DISHES.map(d => ({ id: d.id, totalPaise: d.totalPaise, assignments: d.eaters }));
  const shares = calculateShares(items, members, TAX, DISCOUNT);

  const foodTotal = DISHES.reduce((a, d) => a + d.totalPaise, 0);
  const taxNetPaise = TAX.cgst + TAX.sgst + TAX.serviceCharge - DISCOUNT;
  const totalPaise = foodTotal + taxNetPaise;

  const friends = FRIENDS.map((f, i) => ({ ...f, ...shares[i] }));

  // Which friend pays how much of each dish (same split calculateShares uses).
  const dishes = DISHES.map(d => {
    const split = allocateLargestRemainder(d.totalPaise, d.eaters.map(() => 1));
    return {
      ...d,
      parts: d.eaters.map((id, j) => ({ friendIdx: FRIENDS.findIndex(f => f.id === id), paise: split[j] }))
    };
  });

  // Invariants the animation relies on. If they ever fail we fall back to a static frame.
  const sumShares = friends.reduce((a, f) => a + f.sharePaise, 0);
  const sumFood = friends.reduce((a, f) => a + f.foodPaise, 0);
  const ok = sumShares === totalPaise && sumFood === foodTotal;
  if (!ok) console.warn('[hero-story] sample totals do not reconcile', { sumShares, totalPaise });

  return { friends, dishes, taxNetPaise, totalPaise, foodTotal, ok };
}
