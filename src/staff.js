// Staff rendering: hand-drawn SVG lines plus Noto Music glyphs for clefs and accidentals.
import { BOT } from './theory.js';

/* ---------- glyph measurement (ink bounds via canvas) ---------- */
let gcache = {};
const cv = document.createElement('canvas').getContext('2d');

/** Forget measured glyph bounds (call after the music font finishes loading). */
export function resetGlyphCache() {
  gcache = {};
}

function gm(ch) {
  if (gcache[ch]) return gcache[ch];
  cv.font = '100px "Noto Music","Noto Sans Symbols 2",serif';
  const t = cv.measureText(ch);
  return (gcache[ch] = {
    l: t.actualBoundingBoxLeft || 0,
    r: t.actualBoundingBoxRight || 0,
    a: t.actualBoundingBoxAscent || 0,
    d: t.actualBoundingBoxDescent || 0,
  });
}

/** A glyph scaled so its ink spans [top, top+h], aligned to opts.left or opts.right. */
function glyph(ch, top, h, opts) {
  const m = gm(ch), tot = m.a + m.d;
  if (!tot) return '';
  const F = (h * 100) / tot, w = ((m.l + m.r) * F) / 100;
  const left = opts.right != null ? opts.right - w : opts.left;
  const x = left + (m.l * F) / 100, y = top + (m.a * F) / 100;
  return `<text class="glyph${opts.cls ? ' ' + opts.cls : ''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${F.toFixed(2)}">${ch}</text>`;
}

function layout(clef) {
  if (clef === 'G') return { H: 244, tops: { T: 62, B: 150 } };
  return { H: 150, tops: { [clef]: 55 } };
}

/**
 * Draw the staff for clef ('T' / 'B' / 'G' grand staff) and the current note, if any.
 * cur: {st, d, acc, missed, fresh}; fresh is cleared after the enter animation is applied once.
 */
export function drawStaff(svg, clef, cur) {
  const L = layout(clef);
  svg.setAttribute('viewBox', `0 0 260 ${L.H}`);
  const x0 = 14, x1 = 248;
  let s = '';
  for (const st in L.tops) {
    const top = L.tops[st];
    for (let i = 0; i < 5; i++) {
      const y = top + i * 10;
      s += `<line class="sl" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
    }
    s += `<line class="bar" x1="${x1}" y1="${top}" x2="${x1}" y2="${top + 40}"/>`;
    s += st === 'T' ? glyph('𝄞', top - 15, 70, { left: 20 }) : glyph('𝄢', top - 0.5, 31, { left: 20 });
  }
  if (clef === 'G') {
    s += `<line class="bar" x1="${x0}" y1="${L.tops.T}" x2="${x0}" y2="${L.tops.B + 40}"/>`;
    s += `<line class="brace" x1="${x0 - 6}" y1="${L.tops.T}" x2="${x0 - 6}" y2="${L.tops.B + 40}"/>`;
  } else {
    const t = L.tops[clef];
    s += `<line class="bar" x1="${x0}" y1="${t}" x2="${x0}" y2="${t + 40}"/>`;
  }
  if (cur) {
    const top = L.tops[cur.st], b = BOT[cur.st], bl = top + 40;
    const yOf = (d) => bl - (d - b) * 5;
    const y = yOf(cur.d), nx = 160;
    const c = cur.missed ? ' ng' : '';
    let g = '';
    if (cur.d <= b - 2) for (let ld = b - 2; ld >= cur.d; ld -= 2) g += `<line class="ledger" x1="${nx - 12}" y1="${yOf(ld)}" x2="${nx + 12}" y2="${yOf(ld)}"/>`;
    if (cur.d >= b + 10) for (let ld = b + 10; ld <= cur.d; ld += 2) g += `<line class="ledger" x1="${nx - 12}" y1="${yOf(ld)}" x2="${nx + 12}" y2="${yOf(ld)}"/>`;
    if (cur.d >= b + 4) g += `<line class="stem${c}" x1="${nx - 5.4}" y1="${y + 1}" x2="${nx - 5.4}" y2="${y + 34}"/>`;
    else g += `<line class="stem${c}" x1="${nx + 5.4}" y1="${y - 1}" x2="${nx + 5.4}" y2="${y - 34}"/>`;
    g += `<ellipse class="note${c}" cx="${nx}" cy="${y}" rx="6.3" ry="4.4" transform="rotate(-20 ${nx} ${y})"/>`;
    if (cur.acc === 1) g += glyph('♯', y - 14, 28, { right: nx - 11, cls: c.trim() });
    if (cur.acc === -1) g += glyph('♭', y - 19, 25, { right: nx - 11, cls: c.trim() });
    s += `<g class="${cur.fresh ? 'enter' : ''}">${g}</g>`;
    cur.fresh = false;
  }
  svg.innerHTML = s;
}
