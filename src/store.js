// Settings and records persisted in localStorage. Shared by every deployed version (/, /next/, /vX.Y.Z/),
// so a format change needs a migration or a new key.
const LS = 'dokufu.v1';

// best: 60-second bests for single notes (also read by v0.0.x), bestChord: bests for chord questions,
// bestName: bests for chord-name questions. chordStats: per chord name {s: shown, m: missed}, like notes.
export const store = { settings: {}, notes: {}, best: {}, bestChord: {}, bestName: {}, chordStats: {} };
try {
  const r = localStorage.getItem(LS);
  if (r) Object.assign(store, JSON.parse(r));
} catch (e) {}

export function save() {
  try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {}
}

export const DEF = { clef: 'T', ledger: 2, acc: 0, octave: 0, labels: 'C', names: 'jp', weak: 1, sound: 1, vibe: 1, midi: 0, chord: 1, bpm: 80, measures: 1, latency: 0,
  // Chord names: form 'staff' | 'name', ctype 1–3 (see chords.js QUALITIES), croot 'natural' | 'all',
  // prog: progression id or 'all', ckey 'C' | 'any', harm: beats per chord in progressions.
  form: 'staff', ctype: 1, croot: 'natural', prog: 'all', ckey: 'C', harm: 4 };
/** Current settings (mutated in place). */
export const S = Object.assign({}, DEF, store.settings || {});
/** Settings that change the question pool or keyboard range. */
export const STRUCT = ['clef', 'ledger', 'acc', 'octave', 'chord', 'measures', 'form', 'ctype', 'croot', 'prog', 'ckey', 'harm'];

export function saveSettings() {
  store.settings = Object.assign({}, S);
  save();
}
