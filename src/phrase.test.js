import { describe, expect, it } from 'vitest';
import { buildPool } from './theory.js';
import { displayAccidentals, expectedOnsets, makePhrase, phraseMs, phraseTones } from './phrase.js';

// Deterministic pseudo-random sequence.
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('makePhrase', () => {
  const pool = buildPool({ clef: 'G', ledger: 2, acc: 1 });
  it('fills every bar exactly, on one staff, with beat-aligned cells', () => {
    for (let s = 1; s <= 200; s++) {
      const p = makePhrase({ pool, measures: 2, size: 1, rand: seeded(s) });
      for (let m = 0; m < 2; m++) {
        const inBar = p.events.filter((e) => Math.floor(e.beat / 4) === m);
        expect(inBar.reduce((a, e) => a + e.dur, 0)).toBe(4);
      }
      let at = 0;
      for (const e of p.events) {
        expect(e.beat).toBe(at);
        at += e.dur;
        if (e.dur === 2) expect(e.beat % 2).toBe(0);
        if (e.dur === 0.5) expect(e.beat % 0.5).toBe(0);
        expect(e.notes.every((n) => n.st === p.st)).toBe(true);
      }
      expect(p.events[0].rest).toBe(false);
    }
  });
  it('uses chords when asked', () => {
    const p = makePhrase({ pool, measures: 1, size: 3, rand: seeded(7) });
    p.events.filter((e) => !e.rest).forEach((e) => expect(e.notes).toHaveLength(3));
  });
});

describe('displayAccidentals', () => {
  const ev = (beat, d, acc) => ({ beat, dur: 1, rest: false, notes: [{ d, acc }] });
  it('an accidental lasts until the end of the bar', () => {
    // F♯ F♯ F F♯ | F♯
    const p = { beats: 4, events: [ev(0, 31, 1), ev(1, 31, 1), ev(2, 31, 0), ev(3, 31, 1), ev(4, 31, 1)] };
    expect(displayAccidentals(p)).toEqual([['#'], [null], ['n'], ['#'], ['#']]);
  });
  it('only applies to the same staff position', () => {
    const p = { beats: 4, events: [ev(0, 31, 1), ev(1, 38, 0), ev(2, 30, -1)] };
    expect(displayAccidentals(p)).toEqual([['#'], [null], ['b']]);
  });
  it('rests print nothing', () => {
    const p = { beats: 4, events: [ev(0, 31, 1), { beat: 1, dur: 1, rest: true, notes: [] }] };
    expect(displayAccidentals(p)).toEqual([['#'], []]);
  });
});

describe('expectedOnsets / phraseTones / phraseMs', () => {
  const p = {
    beats: 4,
    measures: 1,
    events: [
      { beat: 0, dur: 0.5, rest: false, notes: [{ d: 28, acc: 0 }] },
      { beat: 0.5, dur: 0.5, rest: false, notes: [{ d: 30, acc: 0 }, { d: 32, acc: 0 }] },
      { beat: 1, dur: 1, rest: true, notes: [] },
      { beat: 2, dur: 2, rest: false, notes: [{ d: 29, acc: 1 }] },
    ],
  };
  it('converts beats to ms and skips rests', () => {
    expect(expectedOnsets(p, 120)).toEqual([
      { t: 0, notes: [60] },
      { t: 250, notes: [64, 67] },
      { t: 1000, notes: [63] },
    ]);
    expect(phraseMs(p, 120)).toBe(2000);
  });
  it('the model performance holds each note for its written length and keeps event indices', () => {
    expect(phraseTones(p, 120)).toEqual([
      { index: 0, t: 0, dur: 250, notes: [60] },
      { index: 1, t: 250, dur: 250, notes: [64, 67] },
      { index: 3, t: 1000, dur: 1000, notes: [63] },
    ]);
  });
});
