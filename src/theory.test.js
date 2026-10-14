import { describe, expect, it } from 'vitest';
import { buildPool, midiOf, noteName, noteWeight, pickNote } from './theory.js';

describe('midiOf', () => {
  it('converts staff notes to MIDI numbers', () => {
    expect(midiOf({ d: 30, acc: 0 })).toBe(64); // E4: treble bottom line
    expect(midiOf({ d: 18, acc: 0 })).toBe(43); // G2: bass bottom line
    expect(midiOf({ d: 28, acc: 0 })).toBe(60); // C4
    expect(midiOf({ d: 28, acc: 1 })).toBe(61); // C♯4
    expect(midiOf({ d: 29, acc: -1 })).toBe(61); // D♭4
  });
});

describe('noteName', () => {
  it('names notes in solfège or letters', () => {
    expect(noteName({ d: 28, acc: 1 }, 'jp', true)).toBe('ド♯4');
    expect(noteName({ d: 34, acc: -1 }, 'en', false)).toBe('B♭');
  });
});

describe('buildPool', () => {
  it('treble staff without ledger lines spans D4 to G5', () => {
    const pool = buildPool({ clef: 'T', ledger: 0, acc: 0 });
    expect(pool.map(midiOf)).toEqual([62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79]);
  });
  it('each ledger line adds two notes on each side', () => {
    expect(buildPool({ clef: 'T', ledger: 2, acc: 0 })).toHaveLength(11 + 8);
  });
  it('accidentals skip E♯, F♭, B♯ and C♭', () => {
    const pool = buildPool({ clef: 'T', ledger: 0, acc: 1 });
    const names = pool.map((n) => noteName(n, 'en', false));
    expect(names).toContain('F♯');
    expect(names).not.toContain('E♯');
    expect(names).not.toContain('F♭');
  });
  it('grand staff covers both clefs with unique ids', () => {
    const pool = buildPool({ clef: 'G', ledger: 1, acc: 1 });
    expect(new Set(pool.map((n) => n.st))).toEqual(new Set(['T', 'B']));
    expect(new Set(pool.map((n) => n.id)).size).toBe(pool.length);
  });
});

describe('noteWeight', () => {
  it('favors unseen and often-missed notes', () => {
    expect(noteWeight(undefined)).toBe(2);
    expect(noteWeight({ s: 10, m: 0 })).toBe(1);
    expect(noteWeight({ s: 10, m: 5 })).toBeGreaterThan(noteWeight({ s: 10, m: 1 }));
  });
});

describe('pickNote', () => {
  const pool = buildPool({ clef: 'T', ledger: 0, acc: 0 });
  it('never repeats the previous note', () => {
    for (let i = 0; i < 50; i++) expect(pickNote(pool, pool[0].id, () => 1).id).not.toBe(pool[0].id);
  });
  it('follows the weights', () => {
    const target = pool[3].id;
    const n = pickNote(pool, null, (x) => (x.id === target ? 1 : 0), () => 0.5);
    expect(n.id).toBe(target);
  });
  it('returns a copy', () => {
    const n = pickNote(pool, null, () => 1);
    n.missed = true;
    expect(pool.some((x) => x.missed)).toBe(false);
  });
});
