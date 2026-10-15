import { describe, expect, it } from 'vitest';
import { expectedOnsets, phraseTones } from './phrase.js';
import { judgePerformance } from './timing.js';
import { judgeChord } from './judge.js';
import { KEYS, PROGRESSIONS, ROOTS, above, chordPool, degreeChord, makeChord, makeProgression, pcOf, pickChordName, spell } from './chords.js';

const R = (name) => ROOTS.find((r) => spell(r) === name);

describe('spelling', () => {
  it('spells intervals from the letter', () => {
    expect(spell(above(R('E♭'), 2, 3))).toBe('G♭'); // minor third above E♭
    expect(spell(above(R('B'), 2, 4))).toBe('D♯');
    expect(spell(above(R('C'), 6, 9))).toBe('B𝄫'); // diminished seventh above C
  });
  it('pitch classes', () => {
    expect(pcOf(R('B♭'))).toBe(10);
    expect(pcOf({ L: 6, a: 1 })).toBe(0); // B♯
  });
});

describe('makeChord', () => {
  it('builds names, spelled tones and pitch classes', () => {
    expect(makeChord(R('C'), '7')).toMatchObject({ name: 'C7', tones: ['C', 'E', 'G', 'B♭'], pcs: [0, 4, 7, 10] });
    expect(makeChord(R('E♭'), 'm')).toMatchObject({ name: 'E♭m', tones: ['E♭', 'G♭', 'B♭'] });
    expect(makeChord(R('B'), 'm7(♭5)').tones).toEqual(['B', 'D', 'F', 'A']);
    expect(makeChord(R('F♯'), 'aug').tones).toEqual(['F♯', 'A♯', 'C𝄪']);
    expect(makeChord(R('C'), 'sus4').tones).toEqual(['C', 'F', 'G']);
    expect(makeChord(R('A'), '6').tones).toEqual(['A', 'C♯', 'E', 'F♯']);
  });
  it('voices the chord with a bass note', () => {
    expect(makeChord(R('A'), 'm').midis).toEqual([57, 69, 72, 76]);
  });
});

describe('chordPool / pickChordName', () => {
  it('filters by level and roots', () => {
    expect(chordPool(1, 'natural')).toHaveLength(7 * 2);
    expect(chordPool(2, 'all')).toHaveLength(12 * 5);
    expect(chordPool(3, 'all')).toHaveLength(12 * 13);
    expect(chordPool(1, 'natural').every((c) => !/[♭♯]/.test(c.name))).toBe(true);
  });
  it('does not repeat the previous chord and follows weights', () => {
    const pool = chordPool(1, 'natural');
    for (let i = 0; i < 50; i++) expect(pickChordName(pool, 'C', () => 1).id).not.toBe('C');
    expect(pickChordName(pool, null, (c) => (c.id === 'Am' ? 1 : 0)).id).toBe('Am');
  });
});

describe('progressions', () => {
  it('diatonic chords of C major', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => degreeChord(R('C'), d, false).name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect([0, 1, 4, 6].map((d) => degreeChord(R('C'), d, true).name)).toEqual(['CM7', 'Dm7', 'G7', 'Bm7(♭5)']);
    expect(degreeChord(R('C'), 5, true).roman).toBe('VIm7');
  });
  it('spells chords in flat and sharp keys', () => {
    const k = KEYS.find((x) => spell(x) === 'G♭');
    expect([0, 3, 4].map((d) => degreeChord(k, d, false).name)).toEqual(['G♭', 'C♭', 'D♭']);
    expect(degreeChord(R('E'), 2, false).name).toBe('G♯m');
  });
  it('C → G → Am → C', () => {
    const p = makeProgression({ prog: 'i-v-vi-i', key: 'C' });
    expect(p.events.map((e) => e.chord.name)).toEqual(['C', 'G', 'Am', 'C']);
    expect(p.events.map((e) => e.beat)).toEqual([0, 4, 8, 12]);
    expect(p.measures).toBe(4);
    expect(p.title).toBe('I–V–VIm–I（キー C）');
  });
  it('two chords per bar halves the length', () => {
    const p = makeProgression({ prog: 'canon', key: 'C', beatsPerChord: 2 });
    expect(p.events.map((e) => e.beat)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(p.measures).toBe(4);
  });
  it('every progression works in every key', () => {
    for (const pr of PROGRESSIONS) for (const k of [0, 0.3, 0.6, 0.99]) {
      const p = makeProgression({ prog: pr.id, key: 'any', seventh: true, rand: () => k });
      expect(p.events).toHaveLength(pr.degs.length);
      p.events.forEach((e) => expect(e.midis.length).toBeGreaterThan(3));
    }
  });
});

describe('progressions in the rhythm mode', () => {
  const p = makeProgression({ prog: 'i-v-vi-i', key: 'C' });

  it('onsets come every bar with the chord voicing', () => {
    const on = expectedOnsets(p, 120);
    expect(on.map((x) => x.t)).toEqual([0, 2000, 4000, 6000]);
    expect(on[2].notes).toEqual([57, 69, 72, 76]); // A3 bass, then A4 C5 E5
    expect(phraseTones(p, 120)[1].dur).toBe(2000);
  });
  it('any inversion, octave or doubling of the chord counts; other notes do not', () => {
    const am = expectedOnsets(p, 120)[2].notes;
    expect(judgeChord([64, 69, 72], am, false).ok).toBe(true); // E A C (2nd inversion)
    expect(judgeChord([45, 57, 60, 64, 76], am, false).ok).toBe(true); // doubled
    expect(judgeChord([57, 60], am, false).missing.map((m) => m % 12)).toEqual([4]); // no E
    expect(judgeChord([57, 60, 64, 67], am, false).extra).toEqual([67]); // + G = Am7, not Am
  });
  it('a played progression is judged per chord', () => {
    const played = [
      { t: 10, note: 48 }, { t: 20, note: 64 }, { t: 25, note: 67 }, // C
      { t: 1980, note: 55 }, { t: 1990, note: 59 }, { t: 2000, note: 62 }, // G
      { t: 4050, note: 57 }, { t: 4060, note: 60 }, // Am without E
      // last C missed
    ];
    const r = judgePerformance(expectedOnsets(p, 120), played, { octave: false });
    expect(r.events.map((e) => e.status)).toEqual(['ok', 'ok', 'wrong', 'miss']);
    expect(r.events.map((e) => e.dev)).toEqual([10, -20, 50, null]);
  });
});
