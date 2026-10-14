// Note model. A question note is {st, d, acc}: st = staff ('T' treble / 'B' bass),
// d = diatonic index (7 per octave, C0 = 0), acc = -1 / 0 / +1.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const DOREMI = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
export const PC = [0, 2, 4, 5, 7, 9, 11];
/** Diatonic index of each staff's bottom line: E4 / G2. */
export const BOT = { T: 30, B: 18 };

export const octOf = (d) => Math.floor(d / 7);
export const midiOf = (n) => 12 * (octOf(n.d) + 1) + PC[n.d % 7] + n.acc;
export const isWhite = (m) => PC.includes(((m % 12) + 12) % 12);

export function noteName(n, names, withOct) {
  const L = n.d % 7;
  let s = names === 'jp' ? DOREMI[L] : LETTERS[L];
  if (n.acc === 1) s += '♯';
  if (n.acc === -1) s += '♭';
  if (withOct) s += octOf(n.d);
  return s;
}

/** Every note that can be asked for the given settings. */
export function buildPool({ clef, ledger, acc }) {
  const staves = clef === 'G' ? ['T', 'B'] : [clef];
  const pool = [];
  for (const st of staves) {
    const b = BOT[st], lo = b - 2 * ledger - 1, hi = b + 8 + 2 * ledger + 1;
    for (let d = lo; d <= hi; d++) {
      const L = d % 7;
      pool.push({ st, d, acc: 0 });
      if (acc) {
        if ([0, 1, 3, 4, 5].includes(L)) pool.push({ st, d, acc: 1 });
        if ([1, 2, 4, 5, 6].includes(L)) pool.push({ st, d, acc: -1 });
      }
    }
  }
  pool.forEach((n) => (n.id = n.st + ':' + n.d + ':' + n.acc));
  return pool;
}

/** Pick weight from a note's record {s: shown, m: missed}; unseen and often-missed notes come up more. */
export function noteWeight(rec) {
  if (!rec) return 2;
  return 1 + (8 * rec.m) / (rec.s + 1) + (rec.s < 3 ? 1 : 0);
}

/** Weighted random pick that never repeats lastId. Returns a copy. */
export function pickNote(pool, lastId, weightOf, rand = Math.random) {
  const c = pool.filter((n) => n.id !== lastId);
  const ws = c.map(weightOf);
  let x = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < c.length; i++) {
    x -= ws[i];
    if (x <= 0) return Object.assign({}, c[i]);
  }
  return Object.assign({}, c[c.length - 1]);
}
