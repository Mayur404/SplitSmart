export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, k) => a + (b - a) * k;

export const seg = (t, a, b) => clamp01((t - a) / (b - a));

export const easeOut = p => 1 - Math.pow(1 - p, 3);
export const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export function spring(p, a = 7, b = 8.5) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.exp(-a * p) * Math.cos(b * p);
}
export const springSoft = p => spring(p, 8, 6.5);

export function arc(p, ax, ay, bx, by, lift = 60, bend = 0) {
  const cx = (ax + bx) / 2 + bend;
  const cy = (ay + by) / 2 - lift;
  const q = 1 - p;
  return [
    q * q * ax + 2 * q * p * cx + p * p * bx,
    q * q * ay + 2 * q * p * cy + p * p * by
  ];
}

export const pulse = p => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * easeOut(p)));
