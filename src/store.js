// Settings and records persisted in localStorage. Shared by every deployed version (/, /next/, /vX.Y.Z/),
// so a format change needs a migration or a new key.
const LS = 'dokufu.v1';

// best: 60-second bests for single notes (also read by v0.0.x), bestChord: bests for chord questions.
export const store = { settings: {}, notes: {}, best: {}, bestChord: {} };
try {
  const r = localStorage.getItem(LS);
  if (r) Object.assign(store, JSON.parse(r));
} catch (e) {}

export function save() {
  try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {}
}

export const DEF = { clef: 'T', ledger: 2, acc: 0, octave: 0, labels: 'C', names: 'jp', weak: 1, sound: 1, vibe: 1, midi: 0, chord: 1 };
/** Current settings (mutated in place). */
export const S = Object.assign({}, DEF, store.settings || {});
/** Settings that change the question pool or keyboard range. */
export const STRUCT = ['clef', 'ledger', 'acc', 'octave', 'chord'];

export function saveSettings() {
  store.settings = Object.assign({}, S);
  save();
}
