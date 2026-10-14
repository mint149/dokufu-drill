import { describe, expect, it } from 'vitest';
import { accuracy, avgSeconds, isMatch, newSession, pitchClass, recordNote, scoreCorrect, scoreMiss } from './judge.js';

describe('isMatch', () => {
  it('note-name judging accepts any octave of the same pitch class', () => {
    expect(isMatch(60, 60, false)).toBe(true);
    expect(isMatch(84, 60, false)).toBe(true);
    expect(isMatch(48, 60, false)).toBe(true);
    expect(isMatch(61, 60, false)).toBe(false);
  });
  it('octave judging needs the exact pitch', () => {
    expect(isMatch(60, 60, true)).toBe(true);
    expect(isMatch(72, 60, true)).toBe(false);
  });
  it('enharmonic notes match (C♯ = D♭)', () => {
    expect(isMatch(61, 61, true)).toBe(true);
  });
});

describe('pitchClass', () => {
  it('wraps negative values', () => {
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(-12)).toBe(0);
  });
});

describe('session scoring', () => {
  it('counts first-try answers, streaks and response times', () => {
    const s = newSession();
    scoreCorrect(s, { missed: false, rt: 1000 });
    scoreCorrect(s, { missed: false, rt: 2000 });
    expect(s).toMatchObject({ shown: 2, first: 2, streak: 2, best: 2 });
    expect(avgSeconds(s)).toBe(1.5);
    expect(accuracy(s)).toBe(100);
  });
  it('a miss resets the streak and the question no longer counts as first-try', () => {
    const s = newSession();
    scoreCorrect(s, { missed: false, rt: 1000 });
    scoreCorrect(s, { missed: false, rt: 1000 });
    scoreMiss(s);
    scoreCorrect(s, { missed: true, rt: 5000 });
    expect(s).toMatchObject({ shown: 3, first: 2, streak: 0, best: 2 });
    expect(s.rts).toEqual([1000, 1000]);
    expect(accuracy(s)).toBe(67);
  });
  it('has no average or accuracy before any question', () => {
    const s = newSession();
    expect(avgSeconds(s)).toBeNull();
    expect(accuracy(s)).toBeNull();
  });
});

describe('recordNote', () => {
  it('creates and updates a note record', () => {
    const notes = {};
    recordNote(notes, 'T:30:0', false);
    recordNote(notes, 'T:30:0', true);
    expect(notes['T:30:0']).toEqual({ s: 2, m: 1 });
  });
});
