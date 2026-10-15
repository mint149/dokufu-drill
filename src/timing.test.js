import { describe, expect, it } from 'vitest';
import { JUDGE_WINDOWS, estimateLatency, judgePerformance, matchWindowMs, onsetIndexAt, rankOf } from './timing.js';

const exp = [
  { t: 0, notes: [60] },
  { t: 500, notes: [62] },
  { t: 750, notes: [64, 67] },
  { t: 1500, notes: [65] },
];

describe('rankOf', () => {
  const w = JUDGE_WINDOWS.normal; // 30 / 60 / 100
  it('ranks by absolute deviation, inclusive at each limit', () => {
    expect(rankOf(0, w)).toBe('perfect');
    expect(rankOf(-30, w)).toBe('perfect');
    expect(rankOf(31, w)).toBe('great');
    expect(rankOf(-60, w)).toBe('great');
    expect(rankOf(100, w)).toBe('good');
    expect(rankOf(-101, w)).toBe('miss');
  });
  it('presets get wider from strict to easy', () => {
    expect(rankOf(45, JUDGE_WINDOWS.strict)).toBe('good');
    expect(rankOf(45, JUDGE_WINDOWS.easy)).toBe('perfect');
  });
});

describe('matching window', () => {
  it('covers the GOOD window', () => {
    expect(matchWindowMs(JUDGE_WINDOWS.normal)).toBe(200);
    expect(matchWindowMs([60, 150, 300])).toBe(350);
  });
  it('finds the onset a note belongs to', () => {
    expect(onsetIndexAt(exp, -150)).toBe(0);
    expect(onsetIndexAt(exp, 620)).toBe(1); // 500 and 750 split at 625
    expect(onsetIndexAt(exp, 630)).toBe(2);
    expect(onsetIndexAt(exp, 1100)).toBe(-1);
  });
});

describe('judgePerformance', () => {
  it('a clean performance', () => {
    const played = [
      { t: 10, note: 60 },
      { t: 480, note: 62 },
      { t: 760, note: 64 },
      { t: 775, note: 67 },
      { t: 1600, note: 65 },
    ];
    const r = judgePerformance(exp, played, { octave: true });
    expect(r.events.map((e) => e.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r.events.map((e) => e.dev)).toEqual([10, -20, 10, 100]);
    expect(r.events.map((e) => e.rank)).toEqual(['perfect', 'perfect', 'perfect', 'good']);
    expect(r.summary).toMatchObject({ total: 4, perfect: 3, great: 0, good: 1, miss: 0, meanDev: 25, meanAbs: 35 });
    expect(r.summary.accuracy).toBeCloseTo(85); // (3 × 100 + 40) / 4
    expect(r.extra).toEqual([]);
  });
  it('wrong pitches, missed onsets and extra notes', () => {
    const played = [
      { t: 5, note: 61 }, // wrong pitch
      { t: 760, note: 64 }, // chord missing 67
      { t: 1100, note: 70 }, // far from every onset
    ];
    const r = judgePerformance(exp, played, { octave: true });
    expect(r.events.map((e) => e.status)).toEqual(['wrong', 'miss', 'wrong', 'miss']);
    expect(r.events[2].missing).toEqual([67]);
    expect(r.extra).toEqual([{ t: 1100, note: 70 }]);
    expect(r.events.map((e) => e.rank)).toEqual(['miss', 'miss', 'miss', 'miss']);
    expect(r.summary).toMatchObject({ miss: 4, wrong: 2, unplayed: 2, accuracy: 0, meanDev: null });
  });
  it('windows shrink to half the gap so close onsets do not steal notes', () => {
    // 500 → 750 is 250 ms apart: a note at 630 belongs to 500 (130 after), one at 640 to 750.
    const r = judgePerformance(exp, [{ t: 620, note: 62 }, { t: 640, note: 64 }, { t: 650, note: 67 }], { octave: true });
    expect(r.events[1]).toMatchObject({ status: 'ok', dev: 120 });
    expect(r.events[2]).toMatchObject({ status: 'ok', dev: -110 });
  });
  it('notes before the first beat can still count as early', () => {
    const r = judgePerformance(exp, [{ t: -60, note: 60 }], { octave: true });
    expect(r.events[0]).toMatchObject({ status: 'ok', dev: -60, rank: 'great' });
  });
  it('right notes too far off are a MISS but keep their deviation', () => {
    const r = judgePerformance([{ t: 0, notes: [60] }], [{ t: 160, note: 60 }], { octave: true });
    expect(r.events[0]).toMatchObject({ status: 'ok', rank: 'miss', dev: 160 });
    expect(r.summary.meanDev).toBe(160);
  });
  it('the judgement windows can be changed', () => {
    const played = [{ t: 45, note: 60 }];
    const at = (w) => judgePerformance([{ t: 0, notes: [60] }], played, { octave: true, windows: JUDGE_WINDOWS[w] }).events[0].rank;
    expect([at('strict'), at('normal'), at('easy')]).toEqual(['good', 'great', 'perfect']);
  });
  it('note-name judging ignores the octave', () => {
    const r = judgePerformance([{ t: 0, notes: [60] }], [{ t: 0, note: 72 }], { octave: false });
    expect(r.events[0].status).toBe('ok');
  });
});

describe('estimateLatency', () => {
  const clicks = Array.from({ length: 12 }, (_, i) => 1000 + i * 667);
  it('takes the median offset of taps after the lead-in', () => {
    const offs = [40, 55, 38, 61, 47, 300, 45, 52]; // one outlier, still within half a beat
    const taps = clicks.slice(4).map((c, i) => c + offs[i]);
    expect(estimateLatency(clicks, taps, { skip: 4 })).toEqual({ offset: 50, count: 8 });
  });
  it('ignores taps during the lead-in and needs enough taps', () => {
    const taps = [clicks[0] + 30, clicks[1] + 30, clicks[5] + 30, clicks[6] + 30];
    expect(estimateLatency(clicks, taps, { skip: 4 })).toEqual({ offset: null, count: 2 });
  });
});
