import { rupees, formatCurrency } from './algorithm.jsx';
import { shortMoney } from './hero-data.jsx';

export const VIEW = { w: 440, h: 520 };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const LAYOUT = {
  friendX: [78, 220, 362],
  friendYDining: [228, 186, 228],
  friendScaleDining: [1, 0.92, 1],
  friendYStand: 44,
  cardY: 156,
  table: { x: 220, yDining: 352, yFar: 458, scaleFar: 0.6 },
  bill: { x: 220, y: 296, w: 216, h: 240 },
  rowCenters: [-56, -26, 4, 34],
  taxCenter: 64
};

function lamp() {
  return `<g data-r="lamp">
    <path d="M220 0V58" class="hs-cord"/>
    <path d="M200 60h40l12 28h-64z" class="hs-shade"/>
    <ellipse cx="220" cy="90" rx="9" ry="4" class="hs-bulb"/>
  </g>`;
}

function avatar(f, i) {
  const long = i === 1;
  return `<g data-r="friend${i}" class="hs-friend hs-f${i}">
    <circle data-r="ring${i}" r="28" class="hs-ring"/>
    ${long ? '<path class="hs-hair" d="M-20 4C-25-26-8-31 2-31 16-31 25-18 20 4L23 40-23 40Z"/>' : ''}
    <path class="hs-shirt" d="M-37 84C-37 44-24 24 0 24 24 24 37 44 37 84Z"/>
    <rect class="hs-skin" x="-6" y="12" width="12" height="18" rx="5"/>
    <circle class="hs-skin" r="17"/>
    ${i === 2 ? '<path class="hs-hair" d="M-13 7C-9 19 9 19 13 7 8 11-8 11-13 7Z"/>' : ''}
    <path class="hs-hair" d="M-17-3C-20-22-7-26 1-25 14-25 21-14 17-3 12-12-4-14-17-3Z"/>
    <circle cx="0" cy="55" r="10" class="hs-badge"/>
    <text x="0" y="59" text-anchor="middle" class="hs-badge-t">${f.initial}</text>
  </g>`;
}

function plate(x, y, rx, name) {
  return `<g transform="translate(${x} ${y})" data-r="${name}">
    <ellipse cy="4" rx="${rx}" ry="${rx * 0.34}" class="hs-contact"/>
    <ellipse rx="${rx}" ry="${rx * 0.34}" class="hs-plate"/>
    <ellipse rx="${rx * 0.66}" ry="${rx * 0.22}" class="hs-plate-in"/>
  </g>`;
}

function glass(x, y, kind, name) {
  const liquid = kind === 'coffee' ? 'hs-coffee' : 'hs-lassi';
  return `<g transform="translate(${x} ${y})" data-r="${name}">
    <ellipse cy="28" rx="11" ry="4" class="hs-contact"/>
    <path d="M-10 0h20l-2.4 28h-15.2z" class="hs-glass"/>
    <path d="M-9.4 6h18.8l-1.9 22h-15z" class="${liquid}"/>
    ${kind === 'coffee' ? '<path d="M-9.4 6h18.8l-.5 6h-17.8z" class="hs-cream"/>' : ''}
    <path d="M3-2 8-16" class="hs-straw"/>
  </g>`;
}

function table() {
  return `<g data-r="table">
    <ellipse cy="26" rx="212" ry="84" class="hs-floor"/>
    <ellipse cy="9" rx="205" ry="84" class="hs-table-rim"/>
    <ellipse rx="205" ry="84" class="hs-table-top"/>
    <ellipse rx="188" ry="74" class="hs-table-line"/>
    <g data-r="dish0">${glass(-58, -66, 'lassi', 'g0')}</g>
    <g data-r="dish1">${glass(62, -68, 'coffee', 'g1')}</g>
    <g data-r="dish2">${plate(-128, -26, 30, 'p0')}</g>
    <g data-r="dish3">${plate(0, -52, 30, 'p1')}</g>
    <g data-r="dish4">${plate(128, -26, 30, 'p2')}</g>
    <g data-r="dish5"><g transform="translate(2 -8)">
      <ellipse cy="9" rx="30" ry="9" class="hs-contact"/>
      <ellipse cy="2" rx="30" ry="9" class="hs-naan-c"/>
      <ellipse cy="-3" rx="30" ry="9" class="hs-naan-b"/>
      <ellipse cy="-8" rx="29" ry="9" class="hs-naan-a"/>
      <circle cx="-9" cy="-9" r="2" class="hs-char"/><circle cx="8" cy="-7" r="2.4" class="hs-char"/><circle cx="-1" cy="-11" r="1.6" class="hs-char"/>
    </g></g>
    <g data-r="dish6"><g transform="translate(-60 12)">
      <ellipse cy="17" rx="42" ry="11" class="hs-contact"/>
      <path d="M-38-2h76C38 20 20 30 0 30S-38 20-38-2Z" class="hs-bowl"/>
      <ellipse cy="-2" rx="38" ry="11" class="hs-rim"/>
      <path d="M-30-3C-26-22-8-28 0-28 10-28 26-22 30-3 14 3-14 3-30-3Z" class="hs-rice"/>
      <circle cx="-14" cy="-14" r="2.3" class="hs-spice"/><circle cx="6" cy="-18" r="2.3" class="hs-spice"/>
      <circle cx="17" cy="-8" r="2.3" class="hs-spice"/><circle cx="-4" cy="-6" r="2.3" class="hs-spice"/>
      <circle cx="11" cy="-22" r="2" class="hs-herb"/><circle cx="-19" cy="-9" r="2" class="hs-herb"/>
      <g class="hs-steam-g">
        <path data-r="steam0" d="M-14-34c-9-9 9-14 0-24" class="hs-steam"/>
        <path data-r="steam1" d="M2-36c-9-10 9-16 0-28" class="hs-steam"/>
        <path data-r="steam2" d="M18-34c-9-9 9-14 0-24" class="hs-steam"/>
      </g>
    </g></g>
    <g data-r="dish7"><g transform="translate(62 14)">
      <ellipse cy="5" rx="40" ry="13" class="hs-contact"/>
      <ellipse rx="40" ry="13" class="hs-plate"/><ellipse rx="27" ry="8.5" class="hs-plate-in"/>
      <rect x="-24" y="-9" width="15" height="12" rx="3.5" class="hs-paneer" transform="rotate(-12 -16 -3)"/>
      <rect x="-6" y="-12" width="15" height="12" rx="3.5" class="hs-paneer" transform="rotate(8 2 -6)"/>
      <rect x="11" y="-8" width="15" height="12" rx="3.5" class="hs-paneer" transform="rotate(-6 18 -2)"/>
      <rect x="-14" y="-1" width="9" height="7" rx="2" class="hs-herb-f"/><rect x="4" y="0" width="9" height="7" rx="2" class="hs-herb-f"/>
    </g></g>
  </g>`;
}

function cards(story) {
  const conn = story.friends.map((f, i) => `<path data-r="conn${i}" class="hs-conn" pathLength="1" d=""/>`).join('');
  const body = story.friends.map((f, i) => `<g data-r="card${i}" class="hs-card-g">
    <rect data-r="cardBg${i}" class="hs-card"/>
    <text data-r="cardName${i}" class="hs-card-name" text-anchor="middle">${esc(f.name)}</text>
    <text data-r="cardAmt${i}" class="hs-card-amt" text-anchor="middle">₹0.00</text>
    <g data-r="cardChk${i}"><circle r="9.5" class="hs-chk"/><path d="M-4.2 .2 -1.3 3.2 4.4-2.8" class="hs-chk-mark"/></g>
  </g>`).join('');
  return conn + body;
}

function bill(story) {
  const { w, h } = LAYOUT.bill;
  const hw = w / 2;
  const rows = story.dishes.map((d, i) => {
    const c = LAYOUT.rowCenters[i];
    const badges = d.parts.map((p, j) => {
      const bx = 28 + j * 19;
      return `<g data-r="badge${i}_${j}" data-x="${bx}" data-y="${c}"><circle r="8.5" class="hs-badge"/><text y="3.7" text-anchor="middle" class="hs-badge-t hs-badge-s">${story.friends[p.friendIdx].initial}</text></g>`;
    }).join('');
    return `<g data-r="row${i}">
      <rect data-r="rowHl${i}" x="${-hw + 6}" y="${c - 14}" width="${w - 12}" height="28" rx="8" class="hs-hl"/>
      <text x="${-hw + 12}" y="${c + 5}" class="hs-row">${esc(d.label)}</text>${badges}
      <text data-r="rowAmt${i}" x="${hw - 12}" y="${c + 5}" text-anchor="end" class="hs-row hs-num">${rupees(d.totalPaise)}</text>
    </g>`;
  }).join('');
  const t = LAYOUT.taxCenter;
  return `<g data-r="bill">
    <rect data-r="billShadow" class="hs-bill-shadow"/>
    <rect data-r="billBg" class="hs-paper"/>
    <g data-r="billRows">
      <text x="${-hw + 12}" y="-95" class="hs-head">House of Thali</text>
      <path d="M${-hw + 12} -80H${hw - 12}" class="hs-rule"/>
      ${rows}
      <g data-r="rowTax">
        <rect data-r="rowHlTax" x="${-hw + 6}" y="${t - 14}" width="${w - 12}" height="28" rx="8" class="hs-hl"/>
        <text x="${-hw + 12}" y="${t + 4.5}" class="hs-row hs-small">Tax, net of discount</text>
        <text data-r="rowAmtTax" x="${hw - 12}" y="${t + 4.5}" text-anchor="end" class="hs-row hs-small hs-num">+${rupees(story.taxNetPaise)}</text>
      </g>
      <path d="M${-hw + 12} 84H${hw - 12}" class="hs-rule"/>
      <text x="${-hw + 12}" y="109" class="hs-total-l">Total</text>
      <text x="${hw - 12}" y="110" text-anchor="end" class="hs-total-a hs-num">${formatCurrency(story.totalPaise)}</text>
    </g>
    <g data-r="billPill">
      <text y="-9" text-anchor="middle" class="hs-pill-l">Group total</text>
      <text y="21" text-anchor="middle" class="hs-pill-a hs-num">${formatCurrency(story.totalPaise)}</text>
      <g data-r="pillChk" transform="translate(${-hw + 28} 0)"><circle r="11" class="hs-chk"/><path d="M-4.8 .2 -1.5 3.6 5-3.2" class="hs-chk-mark"/></g>
    </g>
  </g>`;
}

export function tokenSpecs(story) {
  const specs = [];
  story.dishes.forEach((d, di) => d.parts.forEach(p => specs.push({ kind: 'dish', di, friendIdx: p.friendIdx, paise: p.paise, label: shortMoney(p.paise) })));
  story.friends.forEach((f, i) => specs.push({ kind: 'tax', di: -1, friendIdx: i, paise: f.taxDiscountPaise, label: `+${formatCurrency(f.taxDiscountPaise)}` }));
  return specs;
}

function tokens(specs) {
  return specs.map((s, i) => {
    const w = 18 + s.label.length * 7.2;
    return `<g data-r="tok${i}" class="hs-token"><rect x="${-w / 2}" y="-11.5" width="${w}" height="23" rx="11.5" class="hs-tok"/><text y="4.6" text-anchor="middle" class="hs-tok-t">${esc(s.label)}</text></g>`;
  }).join('');
}

export function sceneMarkup(story, specs) {
  return `<svg class="hs-svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}" aria-hidden="true" focusable="false">
    ${lamp()}
    ${story.friends.map(avatar).join('')}
    ${table()}
    ${cards(story)}
    ${bill(story)}
    ${tokens(specs)}
  </svg>`;
}
