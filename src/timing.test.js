import { describe, expect, it } from 'vitest';
import { estimateLatency, grade, judgePerformance } from './timing.js';

const exp = [
  { t: 0, notes: [60] },
  { t: 500, notes: [62] },
  { t: 750, notes: [64, 67] },
  { t: 1500, notes: [65] },
];

describe('grade', () => {
  it('grades by absolute deviation', () => {
    expect(grade(-40)).toBe('perfect');
    expect(grade(60)).toBe('good');
    expect(grade(-120)).toBe('off');
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
    expect(r.events.map((e) => e.grade)).toEqual(['perfect', 'perfect', 'perfect', 'off']);
    expect(r.summary).toMatchObject({ total: 4, ok: 4, perfect: 3, off: 1, meanDev: 25, meanAbs: 35 });
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
    expect(r.summary).toMatchObject({ ok: 0, wrong: 2, miss: 2, meanDev: null });
  });
  it('windows shrink to half the gap so close onsets do not steal notes', () => {
    // 500 → 750 is 250 ms apart: a note at 630 belongs to 500 (130 after), one at 640 to 750.
    const r = judgePerformance(exp, [{ t: 620, note: 62 }, { t: 640, note: 64 }, { t: 650, note: 67 }], { octave: true });
    expect(r.events[1]).toMatchObject({ status: 'ok', dev: 120 });
    expect(r.events[2]).toMatchObject({ status: 'ok', dev: -110 });
  });
  it('notes before the first beat can still count as early', () => {
    const r = judgePerformance(exp, [{ t: -60, note: 60 }], { octave: true });
    expect(r.events[0]).toMatchObject({ status: 'ok', dev: -60, grade: 'good' });
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
