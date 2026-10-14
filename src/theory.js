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

const SHARP_NAMES = {
  jp: ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'],
  en: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
};

/** Name of a played MIDI note (no staff spelling, so black keys use ♯). */
export function midiName(m, names, withOct) {
  const s = SHARP_NAMES[names === 'jp' ? 'jp' : 'en'][((m % 12) + 12) % 12];
  return withOct ? s + (Math.floor(m / 12) - 1) : s;
}

/** Largest distance between the lowest and highest chord note, in diatonic steps (6 = a seventh). */
export const CHORD_SPAN = 6;

/**
 * Pick a question of `size` notes, all on one staff, within CHORD_SPAN, with distinct staff positions and
 * distinct pitch classes (so "note name only" judging stays unambiguous). Notes are sorted low to high.
 * Returns {st, notes, id}. Avoids repeating lastId when possible.
 */
export function pickChord(pool, size, lastId, weightOf, rand = Math.random) {
  let best = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const first = pickNote(pool, size === 1 ? lastId : null, weightOf, rand);
    const notes = [first];
    while (notes.length < size) {
      const ds = notes.map((n) => n.d), pcs = notes.map((n) => ((midiOf(n) % 12) + 12) % 12);
      const lo = Math.min(...ds), hi = Math.max(...ds);
      const cand = pool.filter(
        (n) =>
          n.st === first.st &&
          !ds.includes(n.d) &&
          !pcs.includes(((midiOf(n) % 12) + 12) % 12) &&
          Math.max(hi, n.d) - Math.min(lo, n.d) <= CHORD_SPAN
      );
      if (!cand.length) break;
      notes.push(pickNote(cand, null, weightOf, rand));
    }
    if (notes.length < size) continue;
    notes.sort((a, b) => a.d - b.d);
    const q = { st: first.st, notes, id: notes.map((n) => n.id).join('|') };
    if (q.id !== lastId) return q;
    best = q;
  }
  return best;
}
