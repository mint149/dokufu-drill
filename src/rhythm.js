// Rhythm mode: count in, play a short phrase with the metronome, then see pitch and timing per note.
// お手本 plays the phrase itself the same way, highlighting each note as it sounds.
import { S, saveSettings } from './store.js';
import { audioContext, playTone } from './audio.js';
import { perfTimeOf, scheduleClicks } from './metronome.js';
import { expectedOnsets, makePhrase, phraseMs, phraseTones } from './phrase.js';
import { WINDOW_MS, estimateLatency, judgePerformance } from './timing.js';

export const BPM_MIN = 40, BPM_MAX = 200;
const COUNT_IN = 4; // beats
const CALIB_BPM = 90, CALIB_LEAD = 4, CALIB_TAPS = 8;

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const signed = (ms) => (ms > 0 ? '+' : ms < 0 ? '−' : '±') + Math.abs(Math.round(ms));

/**
 * $: element lookup. getPool(): current question pool. weightOf(note): pick weight. setFb(text, cls): feedback line.
 */
export function createRhythmMode({ $, getPool, weightOf, setFb }) {
  let score = null; // lazily imported score.js
  let phrase = null, state = 'idle', marks = [];
  let played = [], taps = [], heard = [], phraseStart = 0, clicks = null, tones = [], timers = [], wake = null;
  let beforeDemo = null; // screen to restore after the model performance
  let ses = { notes: 0, ok: 0, streak: 0, lastAbs: null };
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
    if (!score || !phrase) return;
    score.drawPhrase($('score'), phrase, { ink: cssVar('--ink'), marks });
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
    $('hCorrect').textContent = ses.ok;
    $('hStreak').textContent = ses.streak;
    $('hAcc').innerHTML = ses.notes ? Math.round((ses.ok / ses.notes) * 100) + '<small>%</small>' : '–';
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
    phrase = makePhrase({ pool: getPool(), measures: S.measures, size: S.chord, weightOf });
    marks = [];
    state = 'ready';
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
    later(phraseStart + phraseMs(phrase, S.bpm) + WINDOW_MS + 100 - now, finish);
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
    const res = judgePerformance(expectedOnsets(phrase, S.bpm), played, { octave: S.octave });
    const c = { ok: cssVar('--ok'), warn: cssVar('--warn'), ng: cssVar('--ng'), muted: cssVar('--muted') };
    let k = 0;
    marks = phrase.events.map((e) => {
      if (e.rest) return null;
      const r = res.events[k++];
      if (r.status === 'miss') return { color: c.muted, label: '–' };
      if (r.status === 'wrong') return { color: c.ng, label: '×' };
      return { color: r.grade === 'off' ? c.warn : c.ok, label: signed(r.dev) };
    });
    state = 'result';
    render();
    const s = res.summary;
    ses.notes += s.total;
    ses.ok += s.ok;
    ses.streak = s.ok === s.total && !res.extra.length ? ses.streak + 1 : 0;
    ses.lastAbs = s.meanAbs;
    let text = `${s.ok}/${s.total} 正確`;
    if (s.meanDev != null) {
      text += `・平均 ${signed(s.meanDev)}ms`;
      if (Math.abs(s.meanDev) > 15) text += s.meanDev > 0 ? '（遅れぎみ）' : '（走りぎみ）';
    }
    if (s.wrong) text += `・音違い${s.wrong}`;
    if (s.miss) text += `・弾き忘れ${s.miss}`;
    if (res.extra.length) text += `・余分${res.extra.length}`;
    setFb(text, s.ok === s.total && !res.extra.length ? 'ok' : s.ok ? '' : 'ng');
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
    const base = perfTimeOf(ac, t0), beatMs = beatS * 1000, now = performance.now(), accent = cssVar('--accent');
    for (let i = 0; i < COUNT_IN; i++) later(base + i * beatMs - now, () => setFb(`${i + 1}`));
    list.forEach((x) =>
      later(base + COUNT_IN * beatMs + x.t - now, () => {
        marks = phrase.events.map((_, j) => (j === x.index ? { color: accent } : null));
        render();
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
    if (state === 'count' || state === 'play') played.push({ t: t - phraseStart, note });
    else if (state === 'calib') taps.push(t);
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
      ses = { notes: 0, ok: 0, streak: 0, lastAbs: null };
      hud();
      keepAwake();
      loading = (async () => {
        if (!score) {
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
    },
    calibrate,
    onNote,
    hud,
  };
}
