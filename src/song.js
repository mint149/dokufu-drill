// 曲 tab: open a MusicXML file, show the score, and play it as a model performance with a following cursor.
import { S, saveSettings } from './store.js';
import { audioContext, playTone } from './audio.js';
import { perfTimeOf, scheduleClicks } from './metronome.js';
import { musicXmlText, parseMusicXml, songOnsets, spanLength } from './musicxml.js';
import { keepAwake, releaseWake } from './wake.js';

export const BPM_MIN = 30, BPM_MAX = 240;
const COUNT_IN = 4; // clicks before the music
const LOOKAHEAD_S = 0.5, TICK_MS = 100; // schedule notes this far ahead, this often

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** $: element lookup. setFb(text, cls): feedback line. */
export function createSongMode({ $, setFb }) {
  let sheetLib = null; // lazily imported sheet.js
  let song = null, xml = null, sheet = null, bpm = S.songBpm || 100;
  let playing = false, ticker = null, timers = [], clicks = null, tones = [];

  /* ---------- screen ---------- */
  function hud() {
    $('hL1').textContent = '小節';
    $('hL2').textContent = '右手';
    $('hL3').textContent = '左手';
    $('hTimeLabel').textContent = 'テンポ';
    const count = (h) => (song ? song.notes.filter((n) => n.hand === h).length : null);
    $('hCorrect').textContent = song ? song.measures.length : '–';
    $('hStreak').innerHTML = song ? count('R') + '<small>音</small>' : '–';
    $('hAcc').innerHTML = song ? count('L') + '<small>音</small>' : '–';
    $('hTime').innerHTML = song && song.tempo ? `♩=${song.tempo}` : '–';
  }
  function controls() {
    $('sBpmVal').textContent = bpm;
    $('sBpmDown').disabled = playing || bpm <= BPM_MIN;
    $('sBpmUp').disabled = playing || bpm >= BPM_MAX;
    $('sPlay').disabled = !song;
    $('sPlay').textContent = playing ? 'やめる' : 'お手本';
    $('sOpen').disabled = playing;
  }

  /* ---------- loading ---------- */
  async function open(file) {
    stop();
    setFb('読み込んでいます…');
    try {
      const text = musicXmlText(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseMusicXml(text);
      if (!parsed.notes.length) throw new Error('音符が見つかりませんでした');
      song = parsed;
      xml = text;
      bpm = song.tempo ? Math.round(song.tempo) : bpm;
      $('sTitle').textContent = song.title || file.name.replace(/\.[^.]+$/, '');
      await draw();
      const hands = song.notes.some((n) => n.hand === 'L') ? '右手・左手' : '片手';
      setFb(`${song.measures.length}小節・${hands}の楽譜を読み込みました`, 'ok');
    } catch (e) {
      setFb(e.message || '読み込めませんでした', 'ng');
    }
    hud();
    controls();
  }
  async function draw() {
    if (!xml) return;
    if (!sheetLib) {
      setFb('楽譜の表示を準備しています…');
      sheetLib = await import('./sheet.js');
    }
    sheet = await sheetLib.createSheet($('sheet'), xml, { ink: cssVar('--ink'), accent: cssVar('--accent') });
  }

  /* ---------- model performance ---------- */
  function play() {
    const ac = audioContext();
    if (!ac) return setFb('この端末では音を出せません', 'ng');
    stop();
    playing = true;
    keepAwake();
    const beatS = 60 / bpm, t0 = ac.currentTime + 0.3, start = t0 + COUNT_IN * beatS;
    clicks = scheduleClicks(ac, Array.from({ length: COUNT_IN }, (_, i) => t0 + i * beatS), new Set([0]));
    const onsets = songOnsets(song), total = spanLength(song) * beatS;
    const base = perfTimeOf(ac, t0), now = performance.now();
    for (let i = 0; i < COUNT_IN; i++) timers.push(setTimeout(() => setFb(`${i + 1}`), base + i * beatS * 1000 - now));
    sheet.cursorAt(0);
    // Schedule notes a little ahead of time instead of all at once: a song can have thousands of them.
    let next = 0;
    const tick = () => {
      const horizon = ac.currentTime + LOOKAHEAD_S;
      while (next < onsets.length && start + onsets[next].t * beatS < horizon) {
        const o = onsets[next], at = start + o.t * beatS;
        const vol = 0.3 / Math.sqrt(o.notes.length);
        o.notes.forEach((m, i) => {
          const tone = playTone(m, { at, dur: o.durs[i] * beatS * 0.95, vol });
          if (tone) tones.push(tone);
        });
        timers.push(setTimeout(() => sheet.cursorAt(o.t), perfTimeOf(ac, at) - performance.now()));
        next++;
      }
      if (tones.length > 200) tones = tones.slice(-100); // older ones have finished
    };
    tick();
    ticker = setInterval(tick, TICK_MS);
    timers.push(setTimeout(() => setFb('♪ お手本'), base + COUNT_IN * beatS * 1000 - now));
    timers.push(setTimeout(() => {
      stop();
      setFb('最後まで弾きました');
    }, base + (COUNT_IN * beatS + total) * 1000 + 300 - now));
    controls();
  }
  function stop() {
    clearInterval(ticker);
    ticker = null;
    timers.forEach(clearTimeout);
    timers = [];
    if (clicks) clicks.stop();
    clicks = null;
    tones.forEach((t) => t.stop());
    tones = [];
    if (playing) {
      playing = false;
      releaseWake();
      if (sheet) sheet.hideCursor();
      setFb('');
    }
    controls();
  }

  /* ---------- controls ---------- */
  $('sFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) open(f);
    e.target.value = ''; // picking the same file again still fires change
  });
  $('sOpen').addEventListener('click', () => $('sFile').click());
  $('sPlay').addEventListener('click', () => (playing ? stop() : play()));
  const stepBpm = (d) => {
    bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, bpm + d));
    S.songBpm = bpm;
    saveSettings();
    controls();
  };
  $('sBpmDown').addEventListener('click', () => stepBpm(-4));
  $('sBpmUp').addEventListener('click', () => stepBpm(4));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && playing) stop();
  });

  return {
    enter() {
      $('song').hidden = false;
      $('sctl').hidden = false;
      hud();
      controls();
      if (!song) setFb('「楽譜を開く」から MusicXML（.musicxml / .mxl）を選んでください');
    },
    exit() {
      stop();
      $('song').hidden = true;
      $('sctl').hidden = true;
    },
    hud,
  };
}
