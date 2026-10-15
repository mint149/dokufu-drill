// Timing judgement for played phrases, and latency calibration (pure, no DOM).
import { judgeChord } from './judge.js';

/** A played note further than this from every expected onset is not matched to any of them. */
export const WINDOW_MS = 200;

/** Judgement windows in ms: [PERFECT, GREAT, GOOD]; anything later or earlier than GOOD is a MISS. */
export const JUDGE_WINDOWS = { strict: [20, 40, 70], normal: [30, 60, 100], easy: [45, 90, 150] };
export const RANKS = ['perfect', 'great', 'good', 'miss'];
/** Points per rank for the accuracy (達成率). */
const POINTS = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };

/** Matching window for the judgement windows: wide enough that a GOOD can always be matched. */
export const matchWindowMs = (windows) => Math.max(WINDOW_MS, windows[2] + 50);

/** Rank for a timing deviation (ms) with windows [perfect, great, good]. */
export function rankOf(dev, [perfect, great, good]) {
  const a = Math.abs(dev);
  return a <= perfect ? 'perfect' : a <= great ? 'great' : a <= good ? 'good' : 'miss';
}

/** Index of the expected onset a note at time t belongs to (the same windows as judgePerformance), or -1. */
export function onsetIndexAt(expected, t, windowMs = WINDOW_MS) {
  return expected.findIndex((e, i) => {
    const before = i > 0 ? Math.min(windowMs, (e.t - expected[i - 1].t) / 2) : windowMs;
    const after = i < expected.length - 1 ? Math.min(windowMs, (expected[i + 1].t - e.t) / 2) : windowMs;
    return t >= e.t - before && t <= e.t + after;
  });
}

/**
 * Match played notes against expected onsets and rank each onset.
 * expected: [{t, notes: MIDI[]}] sorted by t. played: [{t, note}] with t in the same timebase (ms from the first beat,
 * already corrected for latency).
 * Each onset accepts notes within the matching window (WINDOW_MS, widened to cover the GOOD window), narrowed to half
 * the gap to its neighbours so windows never overlap.
 * Returns {events: [{status: 'ok' | 'wrong' | 'miss', rank, dev, missing, extra}], extra: unmatched played notes,
 *          summary: {total, perfect, great, good, miss, wrong, unplayed, accuracy, meanDev, meanAbs}}.
 * status is about pitches ('miss' = nothing played); rank is the judgement: a wrong or unplayed onset is a 'miss'.
 * dev is the first matched note's time minus the expected time (negative = early). accuracy is 0–100.
 */
export function judgePerformance(expected, played, { octave, windows = JUDGE_WINDOWS.normal }) {
  const windowMs = matchWindowMs(windows);
  const groups = expected.map(() => []), extra = [];
  for (const p of played) {
    const i = onsetIndexAt(expected, p.t, windowMs);
    if (i < 0) extra.push(p);
    else groups[i].push(p);
  }
  const events = expected.map((e, i) => {
    const g = groups[i];
    if (!g.length) return { status: 'miss', rank: 'miss', dev: null, missing: e.notes, extra: [] };
    const r = judgeChord(g.map((p) => p.note), e.notes, octave);
    const dev = Math.min(...g.map((p) => p.t)) - e.t;
    return { status: r.ok ? 'ok' : 'wrong', rank: r.ok ? rankOf(dev, windows) : 'miss', dev, missing: r.missing, extra: r.extra };
  });
  const devs = events.filter((e) => e.status === 'ok').map((e) => e.dev);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const count = (f) => events.filter(f).length;
  return {
    events,
    extra,
    summary: {
      total: events.length,
      ...Object.fromEntries(RANKS.map((k) => [k, count((e) => e.rank === k)])),
      wrong: count((e) => e.status === 'wrong'),
      unplayed: count((e) => e.status === 'miss'),
      accuracy: events.length ? (100 * events.reduce((a, e) => a + POINTS[e.rank], 0)) / events.length : 0,
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
