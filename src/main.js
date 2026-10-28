// App screen: question flow, HUD, practice / 60-second modes, settings and records sheets.
import './style.css';
import { VER, RELEASE, VER_LABEL } from './version.js';
import { store, save, S, STRUCT, saveSettings } from './store.js';
import { buildPool, midiName, midiOf, noteName, noteWeight, pickChord } from './theory.js';
import { ChordCollector, accuracy, avgSeconds, isMatch, judgeChord, newSession, recordNote, scoreCorrect, scoreMiss } from './judge.js';
import { drawStaff, resetGlyphCache } from './staff.js';
import { attachTapInput, buildKeyboard, clearMarks, flash, keyForMidi } from './keyboard.js';
import { playTone, unlock, vibrate } from './audio.js';
import { createMidiInput } from './midi-input.js';
import { createRhythmMode } from './rhythm.js';
import { createSongMode } from './song.js';
import { PROGRESSIONS, chordPool, pickChordName } from './chords.js';

const $ = (id) => document.getElementById(id);

let pool = [], cur = null, lastId = null, shownAt = 0, locked = false;
let mode = 'practice', running = false, endAt = 0, timer = null;
let ses = newSession();
let kbRange = { lo: 60, hi: 71 };
let collector = new ChordCollector(1), flushTimer = null;
let names = []; // chord-name questions for the current settings

/** Chord-name form: questions are chord symbols instead of notes on the staff. */
const isName = () => S.form === 'name';
/** A chord name may be played with doubled notes in any voicing, so MIDI waits this long for the rest of it. */
const NAME_WINDOW_MS = 300;

const nm = (n, withOct) => noteName(n, S.names, withOct);
function draw() {
  const drill = mode === 'practice' || mode === 'timed', asName = isName() && drill;
  $('staff').toggleAttribute('hidden', !drill || asName); // an SVG element has no .hidden property
  $('cname').hidden = !asName;
  if (asName) {
    $('cname').textContent = cur ? cur.chord.name : '';
    $('cname').classList.toggle('ng', !!(cur && cur.missed));
  } else if (drill) drawStaff($('staff'), S.clef, cur);
}

function rebuildPool() {
  pool = buildPool(S);
  names = chordPool(S.ctype, S.croot);
}
/** Target notes of the current question, and whether the octave matters. */
const targetsOf = (q) => (q.chord ? q.chord.midis : q.notes.map(midiOf));
const octaveOf = (q) => (q.chord ? false : S.octave);
function rebuildKeyboard() {
  kbRange = buildKeyboard($('kb'), $('kbwrap'), { pool, octave: S.octave, labels: S.labels, names: S.names });
}

/* ---------- flow ---------- */
function setFb(t, cls) {
  const f = $('fb');
  f.textContent = t;
  f.className = 'fb' + (cls ? ' ' + cls : '');
}
/*
 * cur: {st, notes (low to high), id, missed, missIds: ids of notes that were missing in a wrong answer, fresh}
 * or, in the chord-name form, {chord (see chords.js makeChord), id, missed, missIds, fresh}.
 */
function next() {
  clearMarks();
  if (isName()) {
    const chord = pickChordName(names, lastId, (c) => (S.weak ? noteWeight(store.chordStats[c.id]) : 1));
    cur = { chord, id: chord.id };
  } else cur = pickChord(pool, S.chord, lastId, (n) => (S.weak ? noteWeight(store.notes[n.id]) : 1));
  cur.missed = false;
  cur.missIds = new Set();
  cur.fresh = true;
  lastId = cur.id;
  resetCollector();
  updSubmit();
  shownAt = performance.now();
  locked = false;
  draw();
  setFb('');
}
const multi = () => isName() || S.chord > 1;
const updSubmit = () => ($('submit').hidden = !cur || !multi());
const chordName = (notes) => notes.map((n) => nm(n, true)).join('・');
const toneList = (c) => c.tones.join('・');

function onKey(el, t) {
  const m = +el.dataset.midi;
  unlock();
  if (S.sound) playTone(m);
  if (mode === 'rhythm') return rhythm.onNote(m, t);
  if (mode === 'song') return;
  if (multi()) {
    // Chords: taps select keys, 決定 submits them.
    if (!locked) el.classList.toggle('sel');
    return;
  }
  answer([m], [el]);
}
function submitSelection() {
  const els = [...document.querySelectorAll('.key.sel')];
  if (!els.length) return;
  els.forEach((k) => k.classList.remove('sel'));
  answer(els.map((k) => +k.dataset.midi), els);
}

/* MIDI notes played together count as one answer (a single note answers at once). */
function resetCollector() {
  clearTimeout(flushTimer);
  collector = cur && cur.chord ? new ChordCollector(Infinity, NAME_WINDOW_MS) : new ChordCollector(cur ? cur.notes.length : 1);
}
function collectNote(note, el) {
  if (locked || !cur) return;
  const group = collector.add(note, performance.now());
  clearTimeout(flushTimer);
  if (group) return answerNotes(group);
  // A chord name answers as soon as the notes so far make the chord.
  if (cur.chord && judgeChord(collector.notes, targetsOf(cur), false).ok) return answerNotes(collector.flush());
  flushTimer = setTimeout(() => answerNotes(collector.flush()), collector.deadline() - performance.now());
}
function answerNotes(notes) {
  if (notes.length) answer(notes, notes.map((n) => keyForMidi(n, { lo: kbRange.lo, octave: S.octave })));
}

/* played: MIDI note numbers given as one answer. els: matching on-screen keys (null when off the keyboard). */
function answer(played, els) {
  if (locked || !cur) return;
  if (mode === 'timed' && !running) return;
  const targets = targetsOf(cur), oct = octaveOf(cur);
  const r = judgeChord(played, targets, oct);
  const single = !cur.chord && cur.notes.length === 1;
  if (r.ok) {
    els.forEach((el) => el && flash(el, 'ok'));
    scoreCorrect(ses, { missed: cur.missed, rt: performance.now() - shownAt });
    if (cur.chord) recordNote(store.chordStats, cur.id, cur.missed);
    else cur.notes.forEach((n) => recordNote(store.notes, n.id, cur.missIds.has(n.id)));
    save();
    setFb(cur.chord ? `${cur.chord.name}  ✓（${toneList(cur.chord)}）` : chordName(cur.notes) + '  ✓', 'ok');
    locked = true;
    hud();
    setTimeout(() => {
      if (mode === 'timed' && !running) return;
      next();
    }, cur.missed ? 260 : 190);
    return;
  }
  played.forEach((m, i) => {
    if (els[i] && r.extra.includes(m)) flash(els[i], 'ng', 320);
  });
  if (S.vibe) vibrate();
  if (!cur.chord)
    cur.notes.forEach((n) => {
      if (r.missing.includes(midiOf(n))) cur.missIds.add(n.id);
    });
  if (!cur.missed) {
    cur.missed = true;
    scoreMiss(ses);
    draw();
  }
  let first = null;
  document.querySelectorAll('.key').forEach((k) => {
    if (targets.some((t) => isMatch(+k.dataset.midi, t, oct))) {
      k.classList.add('hint');
      first = first || k;
    }
  });
  if (first && S.octave) first.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  if (cur.chord) {
    const c = cur.chord, pc = (m) => ((m % 12) + 12) % 12, detail = [];
    const miss = c.tones.filter((_, i) => r.missing.some((m) => pc(m) === c.pcs[i]));
    const extra = [...new Set(r.extra.map((m) => midiName(m, 'en', false)))];
    if (miss.length) detail.push('足りない音 ' + miss.join('・'));
    if (extra.length) detail.push('余分な音 ' + extra.join('・'));
    setFb(`${c.name} は ${toneList(c)}（${detail.join('、')}）`, 'ng');
  } else if (single) setFb('正解は ' + nm(cur.notes[0], true) + '　光っている鍵盤で次へ', 'ng');
  else {
    const detail = [];
    const miss = cur.notes.filter((n) => r.missing.includes(midiOf(n)));
    if (miss.length) detail.push('足りない音 ' + miss.map((n) => nm(n, S.octave)).join('・'));
    if (r.extra.length) detail.push('余分な音 ' + r.extra.map((m) => midiName(m, S.names, S.octave)).join('・'));
    setFb('正解は ' + chordName(cur.notes) + '（' + detail.join('、') + '）', 'ng');
  }
  hud();
}
$('submit').addEventListener('click', submitSelection);
attachTapInput($('kb'), $('kbwrap'), onKey);

function hud() {
  if (mode === 'rhythm') return rhythm.hud();
  if (mode === 'song') return song.hud();
  $('hL1').textContent = '正解';
  $('hL2').textContent = '連続';
  $('hL3').textContent = '正答率';
  $('hCorrect').textContent = ses.first;
  $('hStreak').textContent = ses.streak;
  const acc = accuracy(ses);
  $('hAcc').innerHTML = acc == null ? '–' : acc + '<small>%</small>';
  if (mode === 'timed') {
    $('hTimeLabel').textContent = '残り';
    const left = running ? Math.max(0, (endAt - performance.now()) / 1000) : ses.shown ? 0 : 60;
    $('hTime').innerHTML = left.toFixed(1) + '<small>秒</small>';
  } else {
    $('hTimeLabel').textContent = '平均';
    const a = avgSeconds(ses);
    $('hTime').innerHTML = a == null ? '–' : a.toFixed(2) + '<small>秒</small>';
  }
}

/* ---------- modes ---------- */
const CLEFN = { T: 'ト音記号', B: 'ヘ音記号', G: '大譜表' };
const CTYPEN = { 1: 'メジャー・マイナー', 2: '三和音すべて', 3: 'セブンスまで' };
const nameText = (ctype, croot) => `コード名・${CTYPEN[ctype]}・ルート${croot === 'natural' ? '白鍵のみ' : 'すべて'}`;
// Single-note bests stay in store.best with the v0.0.x key format; chord bests go to store.bestChord,
// chord-name bests to store.bestName.
const bestStore = () => (isName() ? store.bestName : S.chord > 1 ? store.bestChord : store.best);
const unit = () => (isName() ? '個' : '音');
const comboKey = () =>
  isName() ? `${S.ctype}-${S.croot}` : `${S.clef}-${S.ledger}-${S.acc}-${S.octave}` + (S.chord > 1 ? `-${S.chord}` : '');
const comboText = () =>
  isName()
    ? nameText(S.ctype, S.croot)
    : `${CLEFN[S.clef]}・加線${S.ledger ? S.ledger + '本まで' : 'なし'}・♯♭${S.acc ? 'あり' : 'なし'}・${S.octave ? '高さまで判定' : '音名だけ判定'}` +
      (S.chord > 1 ? `・${S.chord}音の和音` : '');
function showPanel(html) {
  const p = $('panel');
  p.innerHTML = '<div class="inner">' + html + '</div>';
  p.hidden = false;
}
function hidePanel() {
  $('panel').hidden = true;
}
function showStart() {
  const b = bestStore()[comboKey()];
  showPanel(`<p class="eyebrow">60秒チャレンジ</p><h2>60秒で${isName() ? 'いくつ弾けるか' : '何音読めるか'}</h2><p class="combo">${comboText()}</p>
    ${b != null ? `<span class="badge">自己ベスト ${b}${unit()}</span>` : ''}
    <div class="btns"><button class="primary" id="goTimed">スタート</button></div>`);
  $('goTimed').addEventListener('click', startTimed);
}
function startTimed() {
  unlock();
  hidePanel();
  ses = newSession();
  running = true;
  endAt = performance.now() + 60000;
  next();
  hud();
  clearInterval(timer);
  timer = setInterval(() => {
    if (performance.now() >= endAt) finishTimed();
    else hud();
  }, 100);
}
function finishTimed() {
  clearInterval(timer);
  running = false;
  cur = null;
  updSubmit();
  clearMarks();
  draw();
  setFb('');
  hud();
  const k = comboKey(), best = bestStore(), prev = best[k];
  let isNew = false;
  if (prev == null || ses.first > prev) {
    best[k] = ses.first;
    save();
    isNew = prev != null || ses.first > 0;
  }
  const a = avgSeconds(ses);
  showPanel(`<p class="eyebrow">結果</p><p class="big">${ses.first}<small>${unit()}</small></p>
    ${isNew ? '<span class="badge">自己ベスト更新</span>' : ''}
    <div class="res-grid"><span>正答率</span><span>平均</span><span>ベスト</span>
    <b>${accuracy(ses) ?? 0}%</b><b>${a == null ? '–' : a.toFixed(2) + '秒'}</b><b>${best[k]}${unit()}</b></div>
    <p class="combo">${comboText()}</p>
    <div class="btns"><button class="primary" id="again">もう一度</button><button class="ghost" id="toPractice">練習に戻る</button></div>`);
  $('again').addEventListener('click', startTimed);
  $('toPractice').addEventListener('click', () => setMode('practice'));
}
const rhythm = createRhythmMode({
  $,
  getPool: () => pool,
  weightOf: (n) => (S.weak ? noteWeight(store.notes[n.id]) : 1),
  setFb,
  isName,
});
const song = createSongMode({ $, setFb });
function setMode(m) {
  if (mode === 'rhythm') rhythm.exit();
  if (mode === 'song') song.exit();
  mode = m;
  clearInterval(timer);
  running = false;
  ses = newSession();
  $('tabPractice').setAttribute('aria-selected', m === 'practice');
  $('tabTimed').setAttribute('aria-selected', m === 'timed');
  $('tabRhythm').setAttribute('aria-selected', m === 'rhythm');
  $('tabSong').setAttribute('aria-selected', m === 'song');
  if (m === 'song') {
    cur = null;
    updSubmit();
    clearMarks();
    draw();
    hidePanel();
    setFb('');
    song.enter();
    return;
  }
  if (m === 'rhythm') {
    cur = null;
    updSubmit();
    clearMarks();
    draw();
    hidePanel();
    setFb('');
    hud();
    return rhythm.enter();
  }
  if (m === 'timed') {
    cur = null;
    updSubmit();
    clearMarks();
    draw();
    setFb('');
    showStart();
  } else {
    hidePanel();
    next();
  }
  hud();
}
$('tabPractice').addEventListener('click', () => setMode('practice'));
$('tabTimed').addEventListener('click', () => setMode('timed'));
$('tabRhythm').addEventListener('click', () => setMode('rhythm'));
$('tabSong').addEventListener('click', () => setMode('song'));

/* ---------- MIDI input (electronic piano) ---------- */
const held = new Map(); // note -> on-screen key lit while the piano key is held
const midi = createMidiInput({
  isEnabled: () => !!S.midi,
  onNote(ev, t) {
    if (ev.type === 'on') {
      const el = keyForMidi(ev.note, { lo: kbRange.lo, octave: S.octave });
      if (el) el.classList.add('down');
      held.set(ev.note, el);
      if (mode === 'rhythm') rhythm.onNote(ev.note, t);
      else if (mode !== 'song') collectNote(ev.note, el);
    } else {
      const el = held.get(ev.note);
      if (el) el.classList.remove('down');
      held.delete(ev.note);
    }
  },
  onChange: updMidi,
});
function setMidi(on) {
  S.midi = on ? 1 : 0;
  saveSettings();
  if (on) midi.connect();
  else {
    held.forEach((el) => el && el.classList.remove('down'));
    held.clear();
    midi.disconnect();
  }
}
function updMidi() {
  const { names, text } = midi.status(), bd = $('midiBadge');
  bd.hidden = !names.length;
  bd.textContent = names.join('、');
  const row = $('midiRow');
  if (!row) return;
  row.querySelector('.midi-st').textContent = text;
  row.querySelector('button').textContent = S.midi ? 'オフにする' : '接続する';
}

/* ---------- settings sheet ---------- */
function defs() {
  return [
    { k: 'form', label: '形式', opts: [['staff', '楽譜'], ['name', 'コード名']], help: 'コード名では、表示されたコードの構成音を弾きます（転回・オクターブ・音の重ねは自由）。リズムのタブはコード進行になります' },
    { k: 'ctype', only: 'name', label: 'コードの種類', opts: [[1, 'メジャー・マイナー'], [2, '三和音すべて'], [3, 'セブンスまで']], help: '「三和音すべて」は dim・aug・sus4、「セブンスまで」は 7・M7・m7・m7(♭5)・dim7・6・m6・7sus4 も出ます。コード進行ではセブンスにするかどうかに使います' },
    { k: 'croot', only: 'name', label: 'ルート', opts: [['natural', '白鍵のみ'], ['all', 'すべて']] },
    { k: 'prog', only: 'name', label: 'コード進行', opts: [['all', 'おまかせ'], ...PROGRESSIONS.map((p) => [p.id, p.name])], help: 'リズムのタブで弾く進行' },
    { k: 'ckey', only: 'name', label: 'キー', opts: [['C', 'C のみ'], ['any', 'いろいろ']] },
    { k: 'harm', only: 'name', label: 'コードの長さ', opts: [[4, '1小節'], [2, '2拍']], help: 'コード進行で、1つのコードを何拍弾くか' },
    { k: 'clef', only: 'staff', label: '音部記号', opts: [['T', 'ト音'], ['B', 'ヘ音'], ['G', '大譜表']] },
    { k: 'chord', only: 'staff', label: '出題', opts: [[1, '単音'], [2, '2音'], [3, '3音']], help: '和音は同じ段の 7 度以内から出ます。電子ピアノでは同時に弾き、画面の鍵盤では選んでから「決定」を押します' },
    { k: 'ledger', only: 'staff', label: '加線', opts: [[0, 'なし'], [1, '1本'], [2, '2本'], [3, '3本']], help: '五線の外に出る音を何本目の加線まで出すか' },
    { k: 'acc', only: 'staff', label: '♯・♭', opts: [[0, 'なし'], [1, 'あり']] },
    { k: 'octave', only: 'staff', label: '判定', opts: [[0, '音名だけ'], [1, '高さまで']], help: '「高さまで」は鍵盤が数オクターブに広がり、横にスクロールして弾きます' },
    { k: 'labels', label: '鍵盤の文字', opts: [['N', 'なし'], ['C', S.names === 'jp' ? 'ドだけ' : 'Cだけ'], ['A', 'すべて']] },
    { k: 'names', label: '音名', opts: [['jp', 'ドレミ'], ['en', 'CDE']] },
    { k: 'weak', label: '苦手な音を多めに出す', opts: [[1, 'オン'], [0, 'オフ']] },
    { k: 'sound', label: '鍵盤の音', opts: [[1, 'オン'], [0, 'オフ']] },
    { k: 'vibe', label: 'ミスで振動', opts: [[1, 'オン'], [0, 'オフ']], help: '対応していない端末では振動しません' },
    { k: 'jwin', label: '判定の幅', opts: [['strict', 'きびしい'], ['normal', 'ふつう'], ['easy', 'あまい']], help: 'リズムの PERFECT / GREAT / GOOD になるずれの幅。きびしい ±20 / 40 / 70ms、ふつう ±30 / 60 / 100ms、あまい ±45 / 90 / 150ms。それより大きくずれた音と、音違い・弾き忘れは MISS' },
    { k: 'measures', only: 'staff', label: 'リズムの長さ', opts: [[1, '1小節'], [2, '2小節']], help: 'リズムのタブで出すフレーズの長さ' },
  ];
}
function renderSettings() {
  $('settingsBody').innerHTML =
    defs()
      .filter((d) => !d.only || d.only === S.form)
      .map(
        (d) =>
          `<div class="row"><label>${d.label}</label><div class="seg">${d.opts
            .map(([v, t]) => `<button data-k="${d.k}" data-v="${v}" aria-pressed="${String(S[d.k]) === String(v)}">${t}</button>`)
            .join('')}</div>${d.help ? `<p class="help">${d.help}</p>` : ''}</div>`
      )
      .join('') +
    `<div class="row" id="midiRow"><label>電子ピアノ（MIDI）</label><button class="ghost" data-midi-toggle></button>
   <p class="help midi-st"></p>
   <p class="help">USB ケーブルで電子ピアノをつなぐと、弾いた鍵盤で答えられます（スマホは OTG アダプタが必要）。</p></div>
  <div class="row"><label>音のずれの補正</label><span class="midi-st">${S.latency > 0 ? '+' : ''}${S.latency}ms</span>
   <button class="ghost" data-calibrate>測定する</button>
   <p class="help">リズムの判定で、メトロノームの音が聞こえるまでの遅れを差し引きます。イヤホンやスピーカーを変えたら測り直してください。</p></div>
  <p class="ver">バージョン ${VER_LABEL}</p>`;
  updMidi();
}
$('settingsBody').addEventListener('click', (e) => {
  if (e.target.closest('[data-midi-toggle]')) {
    setMidi(!S.midi);
    return;
  }
  if (e.target.closest('[data-calibrate]')) {
    unlock();
    $('scrimSettings').hidden = true;
    if (mode !== 'rhythm') setMode('rhythm');
    rhythm.calibrate();
    return;
  }
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  const k = b.dataset.k, raw = b.dataset.v, v = /^\d+$/.test(raw) ? +raw : raw;
  if (S[k] === v) return;
  S[k] = v;
  saveSettings();
  if (STRUCT.includes(k)) {
    rebuildPool();
    lastId = null;
    rebuildKeyboard();
    setMode(mode);
  } else if (k === 'labels' || k === 'names') {
    rebuildKeyboard();
    if (cur && k === 'names' && $('fb').textContent) setFb('');
  }
  renderSettings();
});

/* ---------- stats sheet ---------- */
let armed = false;
function renderStats() {
  const a = avgSeconds(ses);
  const rows = Object.entries(store.notes)
    .filter(([, r]) => r.s >= 3 && r.m > 0)
    .map(([id, r]) => {
      const [st, d, acc] = id.split(':');
      return { st, n: { d: +d, acc: +acc }, r, rate: r.m / r.s };
    })
    .sort((x, y) => y.rate - x.rate || y.r.m - x.r.m)
    .slice(0, 8);
  const staffTxt = (k) => {
    const [c, l, ac, o, ch] = k.split('-');
    return `${CLEFN[c]}・加線${+l ? l + '本' : 'なし'}・♯♭${+ac ? 'あり' : 'なし'}・${+o ? '高さ' : '音名'}${ch ? `・${ch}音の和音` : ''}`;
  };
  const bests = [
    ...[...Object.entries(store.best), ...Object.entries(store.bestChord)].map(([k, v]) => [staffTxt(k), v]),
    ...Object.entries(store.bestName).map(([k, v]) => [nameText(...k.split('-')), v]),
  ].sort((x, y) => y[1] - x[1]);
  const weakChords = Object.entries(store.chordStats)
    .filter(([, r]) => r.s >= 3 && r.m > 0)
    .map(([id, r]) => ({ id, r, rate: r.m / r.s }))
    .sort((x, y) => y.rate - x.rate || y.r.m - x.r.m)
    .slice(0, 8);
  $('statsBody').innerHTML = `
    <p class="sec-t">このセッション</p>
    <div class="kv">
      <div class="stat"><span>出題</span><b>${ses.shown}</b></div>
      <div class="stat"><span>一発正解</span><b>${ses.first}</b></div>
      <div class="stat"><span>最長連続</span><b>${ses.best}</b></div>
      <div class="stat"><span>平均</span><b>${a == null ? '–' : a.toFixed(2) + '<small>秒</small>'}</b></div>
    </div>
    <p class="sec-t">苦手な音（3回以上出た音のミス率）</p>
    ${rows.length
      ? `<table class="weak"><tbody>${rows
          .map(
            (x) => `<tr><td>${x.st === 'T' ? 'ト音' : 'ヘ音'}　<b>${nm(x.n, true)}</b></td>
      <td><span class="bar-mini" style="width:${Math.max(4, Math.round(x.rate * 60))}px"></span>${Math.round(x.rate * 100)}%ミス（${x.r.s}回）</td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p class="empty">まだデータがありません。練習を続けると、間違えやすい音がここに並びます。</p>'}
    ${weakChords.length
      ? `<p class="sec-t">苦手なコード（3回以上出たコードのミス率）</p><table class="weak"><tbody>${weakChords
          .map(
            (x) => `<tr><td><b>${x.id}</b></td>
      <td><span class="bar-mini" style="width:${Math.max(4, Math.round(x.rate * 60))}px"></span>${Math.round(x.rate * 100)}%ミス（${x.r.s}回）</td></tr>`
          )
          .join('')}</tbody></table>`
      : ''}
    <p class="sec-t">60秒チャレンジの自己ベスト</p>
    ${bests.length
      ? `<table class="weak"><tbody>${bests.map(([t, v]) => `<tr><td>${t}</td><td><b>${v}${t.startsWith('コード名') ? '個' : '音'}</b></td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">まだ記録がありません。</p>'}
    <button class="danger${armed ? ' armed' : ''}" id="reset">${armed ? 'もう一度押すと消去します' : 'すべての記録を消す'}</button>`;
  $('reset').addEventListener('click', () => {
    if (!armed) {
      armed = true;
      renderStats();
      return;
    }
    armed = false;
    store.notes = {};
    store.best = {};
    store.bestChord = {};
    store.bestName = {};
    store.chordStats = {};
    save();
    renderStats();
  });
}

function openSheet(id) {
  $(id).hidden = false;
}
document.querySelectorAll('.scrim').forEach((sc) => {
  sc.addEventListener('click', (e) => {
    if (e.target === sc || e.target.closest('[data-close]')) {
      sc.hidden = true;
      armed = false;
    }
  });
});
$('btnSettings').addEventListener('click', () => {
  renderSettings();
  openSheet('scrimSettings');
});
$('btnStats').addEventListener('click', () => {
  armed = false;
  renderStats();
  openSheet('scrimStats');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.scrim').forEach((s) => (s.hidden = true));
});

/* ---------- boot ---------- */
if (!RELEASE) {
  $('verBadge').textContent = VER === 'next' ? '開発版' : 'dev';
  $('verBadge').hidden = false;
}
rebuildPool();
rebuildKeyboard();
setMode('practice');
if (S.midi) midi.connect();
if (document.fonts && document.fonts.load) {
  Promise.all(['𝄞𝄢', '♯♭'].map((t) => document.fonts.load('100px "Noto Music"', t)))
    .then(() => {
      resetGlyphCache();
      draw();
    })
    .catch(() => {});
}
