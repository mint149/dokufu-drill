// Short rhythm phrases for the rhythm mode (pure, no DOM).
import { midiOf, pickChord } from './theory.js';

/**
 * Build a phrase of `measures` bars of 4/4 from the question pool.
 * Every beat holds one rhythm cell: a quarter, two eighths, a quarter rest, or (on beats 1 and 3) a half note.
 * All notes come from one staff. size: notes per event (1 = single notes, 2–3 = chords).
 * Returns {st, beats: per measure, measures, events: [{beat, dur, rest, notes}]}; beat and dur are in quarter
 * notes from the start of the phrase, notes are sorted low to high (empty for rests).
 */
export function makePhrase({ pool, measures, size = 1, weightOf = () => 1, rand = Math.random }) {
  const beats = 4;
  const staves = [...new Set(pool.map((n) => n.st))];
  const st = staves[Math.floor(rand() * staves.length) % staves.length];
  const staffPool = pool.filter((n) => n.st === st);
  const events = [];
  let lastId = null;
  const sound = (beat, dur) => {
    const q = pickChord(staffPool, size, lastId, weightOf, rand);
    lastId = q.id;
    events.push({ beat, dur, rest: false, notes: q.notes });
  };
  for (let m = 0; m < measures; m++) {
    for (let b = 0; b < beats; ) {
      const at = m * beats + b, r = rand();
      if (b % 2 === 0 && r < 0.2) {
        sound(at, 2);
        b += 2;
        continue;
      }
      if (r < 0.45) {
        sound(at, 0.5);
        sound(at + 0.5, 0.5);
      } else if (r < 0.55 && at > 0) {
        events.push({ beat: at, dur: 1, rest: true, notes: [] });
      } else {
        sound(at, 1);
      }
      b += 1;
    }
  }
  return { st, beats, measures, events };
}

/**
 * Which accidental to print for each note, following the rule that an accidental lasts until the end of the bar.
 * Returns per event an array (per note) of '#', 'b', 'n' (natural) or null.
 */
export function displayAccidentals(phrase) {
  let bar = -1, state = {};
  return phrase.events.map((e) => {
    const m = Math.floor(e.beat / phrase.beats);
    if (m !== bar) {
      bar = m;
      state = {};
    }
    return e.notes.map((n) => {
      const prev = state[n.d] ?? 0;
      state[n.d] = n.acc;
      if (n.acc === prev) return null;
      return n.acc === 1 ? '#' : n.acc === -1 ? 'b' : 'n';
    });
  });
}

/** MIDI numbers of an event: staff notes, or the voicing of a chord-progression event (chords.js). */
const midisOf = (e) => e.midis ?? e.notes.map(midiOf);

/** Expected onsets for judging: [{t: ms from the first beat, notes: MIDI numbers}] for every sounding event. */
export function expectedOnsets(phrase, bpm) {
  const beatMs = 60000 / bpm;
  return phrase.events.filter((e) => !e.rest).map((e) => ({ t: e.beat * beatMs, notes: midisOf(e) }));
}

/**
 * What the model performance plays: [{index: event index, t: onset ms, dur: length ms, notes: MIDI numbers}]
 * for every sounding event. Each note is held for its written length.
 */
export function phraseTones(phrase, bpm) {
  const beatMs = 60000 / bpm;
  return phrase.events
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => !e.rest)
    .map(({ e, index }) => ({ index, t: e.beat * beatMs, dur: e.dur * beatMs, notes: midisOf(e) }));
}

/** Length of the phrase in ms. */
export const phraseMs = (phrase, bpm) => (phrase.measures * phrase.beats * 60000) / bpm;
