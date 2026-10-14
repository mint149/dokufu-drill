// Answer judging and session scoring. Pure functions with no DOM access, covered by judge.test.js.

export const pitchClass = (m) => ((m % 12) + 12) % 12;

/**
 * Whether a played MIDI note answers the target note.
 * octave=true needs the exact pitch; otherwise any octave of the same pitch class is accepted.
 */
export function isMatch(played, target, octave) {
  return octave ? played === target : pitchClass(played - target) === 0;
}

export function newSession() {
  return { shown: 0, first: 0, streak: 0, best: 0, rts: [] };
}

/** A question was finally answered correctly. missed: whether it was missed before; rt: response time in ms. */
export function scoreCorrect(ses, { missed, rt }) {
  ses.shown++;
  if (!missed) {
    ses.first++;
    ses.streak++;
    ses.best = Math.max(ses.best, ses.streak);
    ses.rts.push(rt);
  }
}

/** First wrong answer to a question. */
export function scoreMiss(ses) {
  ses.streak = 0;
}

/** Average first-try response time in seconds, or null. */
export const avgSeconds = (ses) => (ses.rts.length ? ses.rts.reduce((a, b) => a + b, 0) / ses.rts.length / 1000 : null);

/** First-try accuracy in percent, or null before any question. */
export const accuracy = (ses) => (ses.shown ? Math.round((ses.first / ses.shown) * 100) : null);

/** Update a note's long-term record in notes[id] = {s: shown, m: missed}. */
export function recordNote(notes, id, missed) {
  const r = notes[id] || (notes[id] = { s: 0, m: 0 });
  r.s++;
  if (missed) r.m++;
  return r;
}
