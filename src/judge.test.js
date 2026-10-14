import { describe, expect, it } from 'vitest';
import { ChordCollector, accuracy, avgSeconds, isMatch, judgeChord, newSession, pitchClass, recordNote, scoreCorrect, scoreMiss } from './judge.js';

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

describe('judgeChord', () => {
  const C = [60, 64, 67]; // C4 E4 G4
  it('accepts the chord in any order', () => {
    expect(judgeChord([67, 60, 64], C, true)).toEqual({ ok: true, missing: [], extra: [] });
  });
  it('reports missing and extra notes', () => {
    expect(judgeChord([60, 65, 67], C, true)).toEqual({ ok: false, missing: [64], extra: [65] });
    expect(judgeChord([60, 64], C, true)).toEqual({ ok: false, missing: [67], extra: [] });
    expect(judgeChord([60, 64, 67, 71], C, true)).toEqual({ ok: false, missing: [], extra: [71] });
  });
  it('note-name judging accepts any octave and voicing', () => {
    expect(judgeChord([48, 76, 55], C, false).ok).toBe(true);
    expect(judgeChord([48, 76, 55], C, true).ok).toBe(false);
  });
  it('works for single notes', () => {
    expect(judgeChord([72], [60], false).ok).toBe(true);
    expect(judgeChord([62], [60], false)).toEqual({ ok: false, missing: [60], extra: [62] });
  });
});

describe('ChordCollector', () => {
  it('closes a group once all notes arrived', () => {
    const c = new ChordCollector(3, 100);
    expect(c.add(60, 0)).toBeNull();
    expect(c.add(64, 20)).toBeNull();
    expect(c.add(67, 40)).toEqual([60, 64, 67]);
    expect(c.deadline()).toBeNull();
  });
  it('a single-note collector answers immediately', () => {
    expect(new ChordCollector(1).add(60, 0)).toEqual([60]);
  });
  it('flush returns an incomplete group after the window', () => {
    const c = new ChordCollector(3, 100);
    c.add(60, 10);
    c.add(64, 30);
    expect(c.deadline()).toBe(110);
    expect(c.flush()).toEqual([60, 64]);
    expect(c.flush()).toEqual([]);
  });
  it('a note after the window starts a new group', () => {
    const c = new ChordCollector(2, 100);
    c.add(60, 0);
    expect(c.add(64, 150)).toEqual([60]);
    expect(c.add(67, 160)).toEqual([64, 67]);
  });
  it('ignores a repeated note in the same group', () => {
    const c = new ChordCollector(2, 100);
    expect(c.add(60, 0)).toBeNull();
    expect(c.add(60, 10)).toBeNull();
    expect(c.add(64, 20)).toEqual([60, 64]);
  });
});
