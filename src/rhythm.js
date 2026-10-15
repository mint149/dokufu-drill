// Rhythm mode: count in, play a short phrase with the metronome, then see pitch and timing per note.
// お手本 plays the phrase itself the same way, highlighting each note as it sounds.
// In the chord-name form the phrase is a chord progression shown as a chord chart.
import { S, saveSettings } from './store.js';
import { audioContext, playTone } from './audio.js';
import { perfTimeOf, scheduleClicks } from './metronome.js';
import { expectedOnsets, makePhrase, phraseMs, phraseTones } from './phrase.js';
import { JUDGE_WINDOWS, RANKS, estimateLatency, judgePerformance, matchWindowMs, onsetIndexAt, rankOf } from './timing.js';
import { makeProgression } from './chords.js';
import { drawChart } from './chart.js';

export const BPM_MIN = 40, BPM_MAX = 200;
const COUNT_IN = 4; // beats
const CALIB_BPM = 90, CALIB_LEAD = 4, CALIB_TAPS = 8;

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const RANK_LABEL = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const signed = (ms) => (ms > 0 ? '+' : ms < 0 ? '−' : '±') + Math.abs(Math.round(ms));

/**
 * $: element lookup. getPool(): current question pool. weightOf(note): pick weight. setFb(text, cls): feedback line.
 * isName(): whether the chord-name form is on (progressions instead of notated phrases).
 */
export function createRhythmMode({ $, getPool, weightOf, setFb, isName }) {
  let score = null; // lazily imported score.js
  let phrase = null, state = 'idle', marks = [];
  let played = [], taps = [], heard = [], phraseStart = 0, clicks = null, tones = [], timers = [], wake = null;
  let beforeDemo = null; // screen to restore after the model performance
  let expected = [], announced = new Set(); // onsets of the phrase being played, and those already judged live
  const newSes = () => ({ notes: 0, points: 0, combo: 0, maxCombo: 0, lastAbs: null });
  let ses = newSes();
  const windows = () => JUDGE_WINDOWS[S.jwin] || JUDGE_WINDOWS.normal;
  let active = false, loading = Promise.resolve();

  const later = (ms, f) => timers.push(setTimeout(f, Math.max(0, ms)));
  function stopAll() {
    timers.forEach(clearTimeout);
    timers = [];
    if (clicks) clicks.stop();
    clicks = null;
    tones.forEach((t) => t.stop());
    tones = [];
  }
  const busy = () => state === 'count' || state === 'play' || state === 'calib' || state === 'demo';

  /* ---------- screen ---------- */
  function render() {
    if (!phrase) return;
    if (phrase.kind === 'chords') drawChart($('score'), phrase, { marks });
    else if (score) score.drawPhrase($('score'), phrase, { ink: cssVar('--ink'), marks });
  }
  /** Light event i (or nothing) in the accent color, e.g. the chord being played. */
  function highlight(i) {
    const accent = cssVar('--accent');
    marks = phrase.events.map((_, j) => (j === i ? { color: accent } : null));
    render();
  }
  function controls() {
    const b = busy();
    $('bpmVal').textContent = S.bpm;
    $('bpmDown').disabled = b || S.bpm <= BPM_MIN;
    $('bpmUp').disabled = b || S.bpm >= BPM_MAX;
    $('rGo').textContent = b ? 'やめる' : state === 'result' ? 'もう一度' : 'スタート';
    $('rDemo').hidden = b;
    $('rNext').hidden = b;
  }
  function hud() {
    $('hL1').textContent = 'コンボ';
    $('hL2').textContent = '最大コンボ';
    $('hL3').textContent = '達成率';
    $('hCorrect').textContent = ses.combo;
    $('hStreak').textContent = ses.maxCombo;
    $('hAcc').innerHTML = ses.notes ? Math.round(ses.points / ses.notes) + '<small>%</small>' : '–';
    $('hTimeLabel').textContent = 'ずれ';
    $('hTime').innerHTML = ses.lastAbs == null ? '–' : Math.round(ses.lastAbs) + '<small>ms</small>';
  }

  /* ---------- wake lock: keep the screen on while practicing ---------- */
  async function keepAwake() {
    try {
      if (navigator.wakeLock && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => (wake = null));
      }
    } catch (e) {}
  }
  function releaseWake() {
    if (wake) wake.release().catch(() => {});
    wake = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state !== 'idle') keepAwake();
    if (document.visibilityState === 'hidden' && (state === 'count' || state === 'play' || state === 'demo')) cancel();
  });

  /* ---------- flow ---------- */
  function newPhrase() {
    stopAll();
    phrase = isName()
      ? makeProgression({ prog: S.prog, key: S.ckey, seventh: S.ctype >= 3, beatsPerChord: S.harm })
      : makePhrase({ pool: getPool(), measures: S.measures, size: S.chord, weightOf });
    marks = [];
    state = 'ready';
    $('ranks').hidden = true;
    render();
    setFb('');
    controls();
  }
  function start() {
    const ac = audioContext();
    if (!ac) return setFb('この端末では音を出せません', 'ng');
    stopAll();
    marks = [];
    render();
    played = [];
    expected = expectedOnsets(phrase, S.bpm);
    announced = new Set();
    $('ranks').hidden = true;
    state = 'count';
    const beatS = 60 / S.bpm, t0 = ac.currentTime + 0.3;
    const n = COUNT_IN + phrase.measures * phrase.beats;
    const times = Array.from({ length: n }, (_, i) => t0 + i * beatS);
    clicks = scheduleClicks(ac, times, new Set(times.map((_, i) => i).filter((i) => i % phrase.beats === 0)));
    // One conversion to performance time for all clicks keeps them evenly spaced.
    const base = perfTimeOf(ac, t0), beatMs = beatS * 1000;
    phraseStart = base + COUNT_IN * beatMs + S.latency;
    const now = performance.now();
    for (let i = 0; i < COUNT_IN; i++) later(base + i * beatMs - now, () => setFb(`${i + 1}`));
    later(phraseStart - now, () => {
      state = 'play';
      setFb('♪');
    });
    // In a chord chart, follow along: light each chord when its beat is heard.
    if (phrase.kind === 'chords')
      expectedOnsets(phrase, S.bpm).forEach((x, i) => later(base + COUNT_IN * beatMs + x.t - now, () => highlight(i)));
    later(phraseStart + phraseMs(phrase, S.bpm) + matchWindowMs(windows()) + 100 - now, finish);
    setFb('');
    controls();
  }
  function cancel() {
    if (state === 'demo') return endDemo();
    stopAll();
    state = phrase ? 'ready' : 'idle';
    setFb('');
    controls();
  }
  function finish() {
    stopAll();
    // Chord names have no octave: any voicing counts.
    const res = judgePerformance(expected, played, { octave: phrase.kind === 'chords' ? false : S.octave, windows: windows() });
    const color = {
      perfect: cssVar('--perfect'), great: cssVar('--ok'), good: cssVar('--good'), miss: cssVar('--ng'), unplayed: cssVar('--muted'),
    };
    let k = 0;
    marks = phrase.events.map((e) => {
      if (e.rest) return null;
      const r = res.events[k++];
      if (r.status === 'miss') return { color: color.unplayed, label: '–' };
      if (r.status === 'wrong') return { color: color.miss, label: '×' };
      return { color: color[r.rank], label: signed(r.dev) };
    });
    state = 'result';
    render();
    const s = res.summary;
    $('ranks').innerHTML = RANKS.map((r) => `<span class="rk rk-${r}"><b>${RANK_LABEL[r]}</b>${s[r]}</span>`).join('');
    $('ranks').hidden = false;
    // The combo carries over between phrases until a MISS.
    for (const e of res.events) {
      ses.combo = e.rank === 'miss' ? 0 : ses.combo + 1;
      ses.maxCombo = Math.max(ses.maxCombo, ses.combo);
    }
    ses.notes += s.total;
    ses.points += s.accuracy * s.total; // ses.points / ses.notes = session accuracy in %
    ses.lastAbs = s.meanAbs;
    let text = `達成率 ${s.accuracy.toFixed(1)}%`;
    if (s.meanDev != null) {
      text += `・平均 ${signed(s.meanDev)}ms`;
      if (Math.abs(s.meanDev) > 15) text += s.meanDev > 0 ? '（遅れぎみ）' : '（走りぎみ）';
    }
    if (s.wrong) text += `・音違い${s.wrong}`;
    if (s.unplayed) text += `・弾き忘れ${s.unplayed}`;
    if (res.extra.length) text += `・余分${res.extra.length}`;
    setFb(text, s.perfect === s.total && !res.extra.length ? 'rk-perfect' : s.miss === s.total ? 'ng' : '');
    controls();
    hud();
  }

  /* ---------- model performance ---------- */
  function demo() {
    const ac = audioContext();
    if (!ac) return setFb('この端末では音を出せません', 'ng');
    stopAll();
    beforeDemo = { state, marks, fb: $('fb').textContent, cls: $('fb').className.replace(/\bfb\b/, '').trim() };
    state = 'demo';
    marks = [];
    render();
    const beatS = 60 / S.bpm, t0 = ac.currentTime + 0.3;
    const n = COUNT_IN + phrase.measures * phrase.beats;
    const times = Array.from({ length: n }, (_, i) => t0 + i * beatS);
    clicks = scheduleClicks(ac, times, new Set(times.map((_, i) => i).filter((i) => i % phrase.beats === 0)));
    const lead = t0 + COUNT_IN * beatS, list = phraseTones(phrase, S.bpm);
    tones = list
      .flatMap((x) =>
        x.notes.map((m) => playTone(m, { at: lead + x.t / 1000, dur: (x.dur / 1000) * 0.92, vol: 0.3 / Math.sqrt(x.notes.length) }))
      )
      .filter(Boolean);
    // Highlight each note when it is heard (no latency correction: that is for the player's input).
    const base = perfTimeOf(ac, t0), beatMs = beatS * 1000, now = performance.now();
    for (let i = 0; i < COUNT_IN; i++) later(base + i * beatMs - now, () => setFb(`${i + 1}`));
    list.forEach((x) =>
      later(base + COUNT_IN * beatMs + x.t - now, () => {
        highlight(x.index);
        setFb('お手本');
      })
    );
    later(base + COUNT_IN * beatMs + phraseMs(phrase, S.bpm) + 200 - now, endDemo);
    setFb('');
    controls();
  }
  function endDemo() {
    stopAll();
    ({ state, marks } = beforeDemo);
    render();
    setFb(beforeDemo.fb, beforeDemo.cls);
    controls();
  }

  /* ---------- latency calibration ---------- */
  async function calibrate() {
    await loading; // entering the mode draws a fresh phrase; calibrate after that
    if (!active) return;
    const ac = audioContext();
    if (!ac) return setFb('この端末では音を出せません', 'ng');
    stopAll();
    marks = [];
    render();
    taps = [];
    $('ranks').hidden = true;
    state = 'calib';
    const beatS = 60 / CALIB_BPM, t0 = ac.currentTime + 0.3, n = CALIB_LEAD + CALIB_TAPS;
    const times = Array.from({ length: n }, (_, i) => t0 + i * beatS);
    clicks = scheduleClicks(ac, times, new Set([0, CALIB_LEAD]));
    const base = perfTimeOf(ac, t0), beatMs = beatS * 1000;
    heard = times.map((_, i) => base + i * beatMs);
    setFb(`クリックを ${CALIB_LEAD} 回聞いたあと、続く ${CALIB_TAPS} 回に合わせてどの鍵盤でも弾いてください`);
    later(heard[n - 1] + beatMs - performance.now(), () => {
      stopAll();
      const est = estimateLatency(heard, taps, { skip: CALIB_LEAD });
      state = phrase ? 'ready' : 'idle';
      if (est.offset == null) setFb(`測定できませんでした（合わせて弾けた回数 ${est.count}）。もう一度試してください`, 'ng');
      else {
        S.latency = est.offset;
        saveSettings();
        setFb(`補正値を ${signed(est.offset)}ms にしました（${est.count}回分）`, 'ok');
      }
      controls();
    });
    controls();
  }

  /* ---------- input ---------- */
  /** A note-on (MIDI or screen key) at performance time t. */
  function onNote(note, t) {
    if (state === 'count' || state === 'play') {
      const rel = t - phraseStart;
      played.push({ t: rel, note });
      // Judge the timing at once, like a rhythm game (pitches are checked when the phrase ends).
      const i = onsetIndexAt(expected, rel, matchWindowMs(windows()));
      if (i >= 0 && !announced.has(i)) {
        announced.add(i);
        const dev = rel - expected[i].t, rk = rankOf(dev, windows());
        setFb(`${RANK_LABEL[rk]} ${signed(dev)}`, 'rk-' + rk);
      }
    } else if (state === 'calib') taps.push(t);
  }

  $('rGo').addEventListener('click', () => (busy() ? cancel() : start()));
  $('rNext').addEventListener('click', newPhrase);
  $('rDemo').addEventListener('click', demo);
  const stepBpm = (d) => {
    S.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, S.bpm + d));
    saveSettings();
    if (state === 'result') {
      marks = [];
      state = 'ready';
      $('ranks').hidden = true;
      render();
      setFb('');
    }
    controls();
  };
  $('bpmDown').addEventListener('click', () => stepBpm(-4));
  $('bpmUp').addEventListener('click', () => stepBpm(4));
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => state !== 'idle' && render(), 150);
  });

  if (import.meta.env.DEV) {
    // For browser checks on the dev server only.
    window.__rhythm = { get phrase() { return phrase; }, get phraseStart() { return phraseStart; }, get state() { return state; }, get heard() { return heard; } };
  }

  return {
    /** Show the mode and draw a new phrase (resolves when drawn). */
    enter() {
      active = true;
      $('score').hidden = false;
      $('rctl').hidden = false;
      ses = newSes();
      hud();
      keepAwake();
      loading = (async () => {
        if (!score && !isName()) {
          setFb('楽譜を読み込んでいます…');
          score = await import('./score.js');
          await score.ready;
        }
        if (active) newPhrase();
      })();
      return loading;
    },
    exit() {
      active = false;
      stopAll();
      state = 'idle';
      phrase = null;
      releaseWake();
      $('score').hidden = true;
      $('rctl').hidden = true;
      $('ranks').hidden = true;
    },
    calibrate,
    onNote,
    hud,
  };
}
