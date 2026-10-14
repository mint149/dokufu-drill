// Timing judgement for played phrases, and latency calibration (pure, no DOM).
import { judgeChord } from './judge.js';

/** A played note further than this from every expected onset is not matched to any of them. */
export const WINDOW_MS = 200;
/** |deviation| limits for the grades. */
export const PERFECT_MS = 40;
export const GOOD_MS = 90;

export function grade(dev) {
  const a = Math.abs(dev);
  return a <= PERFECT_MS ? 'perfect' : a <= GOOD_MS ? 'good' : 'off';
}

/**
 * Match played notes against expected onsets.
 * expected: [{t, notes: MIDI[]}] sorted by t. played: [{t, note}] with t in the same timebase (ms from the first beat,
 * already corrected for latency).
 * Each onset accepts notes within WINDOW_MS, narrowed to half the gap to its neighbours so windows never overlap.
 * Returns {events: [{status: 'ok' | 'wrong' | 'miss', dev, grade, missing, extra}], extra: unmatched played notes,
 *          summary: {total, ok, perfect, good, off, wrong, miss, meanDev, meanAbs}}.
 * dev is the first matched note's time minus the expected time (negative = early).
 */
export function judgePerformance(expected, played, { octave, windowMs = WINDOW_MS }) {
  const win = expected.map((e, i) => {
    const before = i > 0 ? (e.t - expected[i - 1].t) / 2 : Infinity;
    const after = i < expected.length - 1 ? (expected[i + 1].t - e.t) / 2 : Infinity;
    return [Math.min(windowMs, before), Math.min(windowMs, after)];
  });
  const groups = expected.map(() => []), extra = [];
  for (const p of played) {
    const i = expected.findIndex((e, k) => p.t >= e.t - win[k][0] && p.t <= e.t + win[k][1]);
    if (i < 0) extra.push(p);
    else groups[i].push(p);
  }
  const events = expected.map((e, i) => {
    const g = groups[i];
    if (!g.length) return { status: 'miss', dev: null, grade: null, missing: e.notes, extra: [] };
    const r = judgeChord(g.map((p) => p.note), e.notes, octave);
    const dev = Math.min(...g.map((p) => p.t)) - e.t;
    return { status: r.ok ? 'ok' : 'wrong', dev, grade: grade(dev), missing: r.missing, extra: r.extra };
  });
  const ok = events.filter((e) => e.status === 'ok');
  const devs = ok.map((e) => e.dev);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    events,
    extra,
    summary: {
      total: events.length,
      ok: ok.length,
      perfect: ok.filter((e) => e.grade === 'perfect').length,
      good: ok.filter((e) => e.grade === 'good').length,
      off: ok.filter((e) => e.grade === 'off').length,
      wrong: events.filter((e) => e.status === 'wrong').length,
      miss: events.filter((e) => e.status === 'miss').length,
      meanDev: mean(devs),
      meanAbs: mean(devs.map(Math.abs)),
    },
  };
}

/**
 * Latency from a tap-along: the median of (tap - nearest click) over taps within half a beat of a click.
 * clicks and taps are times in ms in one timebase. Clicks before index `skip` are ignored (lead-in).
 * Returns {offset, count}; offset is null with fewer than minCount matched taps.
 */
export function estimateLatency(clicks, taps, { skip = 0, minCount = 5 } = {}) {
  const used = clicks.slice(skip);
  if (!used.length) return { offset: null, count: 0 };
  const half = used.length > 1 ? (used[1] - used[0]) / 2 : 250;
  const diffs = [];
  for (const t of taps) {
    let best = null;
    for (const c of used) if (best == null || Math.abs(t - c) < Math.abs(best)) best = t - c;
    if (best != null && Math.abs(best) <= half) diffs.push(best);
  }
  if (diffs.length < minCount) return { offset: null, count: diffs.length };
  diffs.sort((a, b) => a - b);
  const mid = diffs.length >> 1;
  const offset = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return { offset: Math.round(offset), count: diffs.length };
}
