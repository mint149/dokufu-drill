// Chord symbols and diatonic chord progressions (pure, no DOM).
//
// A spelled pitch is {L: letter index 0–6 (C–B), a: accidental −2…+2}, so chord tones keep their names
// (E♭m is E♭ G♭ B♭, not D♯ F♯ A♯).

const LETTER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

export const pcOf = (p) => (((LETTER_PC[p.L] + p.a) % 12) + 12) % 12;
export const spell = (p) => LETTER[p.L] + ACC[p.a];

/** The pitch `steps` letters and `semis` semitones above p, spelled from its letter. */
export function above(p, steps, semis) {
  const L = (p.L + steps) % 7;
  const d = (pcOf(p) + semis - LETTER_PC[L]) % 12;
  const a = ((d + 18) % 12) - 6; // −6…+5
  return { L, a };
}

/** Root choices: the 12 pitch classes with their usual spelling. */
export const ROOTS = [
  { L: 0, a: 0 }, { L: 1, a: -1 }, { L: 1, a: 0 }, { L: 2, a: -1 }, { L: 2, a: 0 }, { L: 3, a: 0 },
  { L: 3, a: 1 }, { L: 4, a: 0 }, { L: 5, a: -1 }, { L: 5, a: 0 }, { L: 6, a: -1 }, { L: 6, a: 0 },
];

/**
 * Chord qualities. tones: [letter steps above the root, semitones above the root].
 * level: 1 = major/minor, 2 = all triads and sus4, 3 = sevenths and sixths.
 */
export const QUALITIES = [
  { sym: '', tones: [[0, 0], [2, 4], [4, 7]], level: 1 },
  { sym: 'm', tones: [[0, 0], [2, 3], [4, 7]], level: 1 },
  { sym: 'dim', tones: [[0, 0], [2, 3], [4, 6]], level: 2 },
  { sym: 'aug', tones: [[0, 0], [2, 4], [4, 8]], level: 2 },
  { sym: 'sus4', tones: [[0, 0], [3, 5], [4, 7]], level: 2 },
  { sym: '7', tones: [[0, 0], [2, 4], [4, 7], [6, 10]], level: 3 },
  { sym: 'M7', tones: [[0, 0], [2, 4], [4, 7], [6, 11]], level: 3 },
  { sym: 'm7', tones: [[0, 0], [2, 3], [4, 7], [6, 10]], level: 3 },
  { sym: 'm7(♭5)', tones: [[0, 0], [2, 3], [4, 6], [6, 10]], level: 3 },
  { sym: 'dim7', tones: [[0, 0], [2, 3], [4, 6], [6, 9]], level: 3 },
  { sym: '6', tones: [[0, 0], [2, 4], [4, 7], [5, 9]], level: 3 },
  { sym: 'm6', tones: [[0, 0], [2, 3], [4, 7], [5, 9]], level: 3 },
  { sym: '7sus4', tones: [[0, 0], [3, 5], [4, 7], [6, 10]], level: 3 },
];
const QUALITY = Object.fromEntries(QUALITIES.map((q) => [q.sym, q]));

/**
 * A chord from a spelled root and a quality symbol.
 * Returns {id, name, tones: spelled tone names, pcs, midis}. midis is the voicing used for playback and hints:
 * the root in octave 3 as bass, then the chord in close position from the root in octave 4.
 */
export function makeChord(root, sym) {
  const q = QUALITY[sym];
  const name = spell(root) + sym;
  const tones = q.tones.map(([st, se]) => above(root, st, se));
  const r = pcOf(root);
  return {
    id: name,
    name,
    tones: tones.map(spell),
    pcs: q.tones.map(([, se]) => (r + se) % 12),
    midis: [48 + r, ...q.tones.map(([, se]) => 60 + r + se)],
  };
}

/** Every chord for the settings: level (see QUALITIES) and roots ('natural' = white keys only, or 'all'). */
export function chordPool(level, roots) {
  const rs = roots === 'natural' ? ROOTS.filter((r) => r.a === 0) : ROOTS;
  return rs.flatMap((r) => QUALITIES.filter((q) => q.level <= level).map((q) => makeChord(r, q.sym)));
}

/** Weighted random chord that is not lastId (when possible). */
export function pickChordName(pool, lastId, weightOf = () => 1, rand = Math.random) {
  const c = pool.length > 1 ? pool.filter((x) => x.id !== lastId) : pool;
  const ws = c.map(weightOf);
  let x = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < c.length; i++) if ((x -= ws[i]) <= 0) return c[i];
  return c[c.length - 1];
}

/* ---------- progressions ---------- */

/** Major-scale degrees: semitones above the key, and the triad / seventh quality symbols. */
const DEGREES = [
  { semis: 0, tri: '', sev: 'M7' },
  { semis: 2, tri: 'm', sev: 'm7' },
  { semis: 4, tri: 'm', sev: 'm7' },
  { semis: 5, tri: '', sev: 'M7' },
  { semis: 7, tri: '', sev: '7' },
  { semis: 9, tri: 'm', sev: 'm7' },
  { semis: 11, tri: 'dim', sev: 'm7(♭5)' },
];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Common progressions as scale degrees (0 = I). */
export const PROGRESSIONS = [
  { id: 'cadence', name: 'カデンツ', degs: [0, 3, 4, 0] },
  { id: 'i-v-vi-i', name: 'I–V–VIm–I', degs: [0, 4, 5, 0] },
  { id: 'pop', name: 'I–V–VIm–IV', degs: [0, 4, 5, 3] },
  { id: 'fifties', name: 'I–VIm–IV–V', degs: [0, 5, 3, 4] },
  { id: 'ohdo', name: '王道進行', degs: [3, 4, 2, 5] },
  { id: 'komuro', name: '小室進行', degs: [5, 3, 4, 0] },
  { id: 'two-five', name: 'ツーファイブ', degs: [1, 4, 0, 0] },
  { id: 'canon', name: 'カノン進行', degs: [0, 4, 5, 2, 3, 0, 3, 4] },
];

/** Major keys used when the key is not fixed to C (G♭ major rather than F♯ major). */
export const KEYS = ROOTS.map((r) => (r.L === 3 && r.a === 1 ? { L: 4, a: -1 } : r));

/** The chord on `deg` (0 = I) of the major key `key`, with its degree name (e.g. VIm7); seventh: diatonic sevenths. */
export function degreeChord(key, deg, seventh) {
  const g = DEGREES[deg], sym = seventh ? g.sev : g.tri;
  return { ...makeChord(above(key, deg, g.semis), sym), roman: NUMERALS[deg] + sym };
}

/**
 * A progression as a rhythm phrase: one chord every `beatsPerChord` beats (4 = a bar, 2 = half a bar), played
 * on its first beat. prog: an id from PROGRESSIONS or 'all' (random); key: 'C' or 'any' (random major key).
 * Returns {kind: 'chords', title, beats: 4, measures, events: [{beat, dur, rest: false, notes: [], midis, chord}]}.
 */
export function makeProgression({ prog = 'all', key = 'C', seventh = false, beatsPerChord = 4, rand = Math.random }) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length) % xs.length];
  const p = prog === 'all' ? pick(PROGRESSIONS) : PROGRESSIONS.find((x) => x.id === prog) || PROGRESSIONS[0];
  const k = key === 'any' ? pick(KEYS) : ROOTS[0];
  const events = p.degs.map((deg, i) => {
    const chord = degreeChord(k, deg, seventh);
    return { beat: i * beatsPerChord, dur: beatsPerChord, rest: false, notes: [], midis: chord.midis, chord };
  });
  return {
    kind: 'chords',
    title: `${p.name}（キー ${spell(k)}）`,
    beats: 4,
    measures: Math.ceil((p.degs.length * beatsPerChord) / 4),
    events,
  };
}
