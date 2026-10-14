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

/**
 * Compare the notes played as one chord with the target notes.
 * Returns {ok, missing: target notes not played, extra: played notes that are not in the chord}.
 * With octave=false, notes are compared by pitch class.
 */
export function judgeChord(played, targets, octave) {
  const hit = (a, b) => isMatch(a, b, octave);
  const missing = targets.filter((t) => !played.some((p) => hit(p, t)));
  const extra = played.filter((p) => !targets.some((t) => hit(p, t)));
  return { ok: !missing.length && !extra.length, missing, extra };
}

/** How long after the first note-on later notes still count as the same chord. */
export const CHORD_WINDOW_MS = 120;

/**
 * Groups note-ons into chords. A group closes when `size` distinct notes have arrived, or when the caller calls
 * flush() after the window (deadline()) has passed. Times are in ms (MIDIMessageEvent.timeStamp).
 */
export class ChordCollector {
  constructor(size, windowMs = CHORD_WINDOW_MS) {
    this.size = size;
    this.windowMs = windowMs;
    this.notes = [];
    this.start = null;
  }
  /** Add a note-on. Returns the finished group when it reaches `size` notes, otherwise null. */
  add(note, t) {
    if (this.start != null && t - this.start > this.windowMs) {
      // The caller missed the deadline; the earlier notes form their own group.
      const done = this.flush();
      this.add(note, t);
      return done;
    }
    if (this.start == null) this.start = t;
    if (!this.notes.includes(note)) this.notes.push(note);
    return this.notes.length >= this.size ? this.flush() : null;
  }
  /** Time at which the open group should be closed, or null when empty. */
  deadline() {
    return this.start == null ? null : this.start + this.windowMs;
  }
  /** Close the open group and return its notes (possibly empty). */
  flush() {
    const g = this.notes;
    this.notes = [];
    this.start = null;
    return g;
  }
}
