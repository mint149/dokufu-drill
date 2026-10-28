// MusicXML (.musicxml / .xml, or compressed .mxl) to a timeline of notes for playback and judging.
// Pure apart from XML parsing: pass a DOMParser (the browser's by default).
import { strFromU8, unzipSync } from 'fflate';

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const EPS = 1e-6;

/** The MusicXML text of a file's bytes. A .mxl file is a zip whose META-INF/container.xml names the score. */
export function musicXmlText(bytes) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const container = files['META-INF/container.xml'];
    let path = container && (strFromU8(container).match(/full-path="([^"]+)"/) || [])[1];
    if (!path || !files[path]) path = Object.keys(files).find((n) => !n.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(n));
    if (!path) throw new Error('ファイルの中に楽譜（MusicXML）が見つかりません');
    return strFromU8(files[path]);
  }
  return new TextDecoder().decode(bytes);
}

const child = (el, name) => (el ? [...el.children].find((c) => c.tagName === name) || null : null);
const text = (el, name) => {
  const c = child(el, name);
  return c ? c.textContent.trim() : null;
};
const num = (el, name, dflt) => {
  const v = text(el, name);
  return v == null || v === '' ? dflt : +v;
};

/**
 * Parse a score-partwise MusicXML document.
 * Returns {
 *   title, composer, tempo: BPM (quarter notes) of the first tempo mark or null,
 *   parts: [{id, name, staves}],
 *   measures: [{index, number, start, length, beats, beatType}],
 *   notes: [{t, dur, midi, part, staff, hand, voice, measure}] sorted by time, then pitch,
 * }
 * Times and lengths are in quarter notes from the start of the piece, written order (repeats are not unfolded).
 * Tied notes are merged into one. Grace notes, rests and unpitched notes are left out.
 * hand: 'R' / 'L' for the upper / lower staff of the first part (or the first two parts when it has one staff), else null.
 */
export function parseMusicXml(xml, parser = new DOMParser()) {
  const doc = parser.parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length) throw new Error('MusicXML として読み込めませんでした');
  if (root.tagName === 'score-timewise') throw new Error('この形式（score-timewise）の MusicXML には対応していません');
  if (root.tagName !== 'score-partwise') throw new Error('MusicXML ではないようです');

  const work = child(root, 'work');
  const ident = child(root, 'identification');
  const composerEl = ident && [...ident.children].find((c) => c.tagName === 'creator' && c.getAttribute('type') === 'composer');
  const title = text(work, 'work-title') || text(root, 'movement-title') || '';
  const composer = composerEl ? composerEl.textContent.trim() : '';

  const partList = child(root, 'part-list');
  const names = {};
  if (partList)
    for (const sp of partList.children) if (sp.tagName === 'score-part') names[sp.getAttribute('id')] = text(sp, 'part-name') || '';

  const partEls = [...root.children].filter((c) => c.tagName === 'part');
  const parts = [], measures = [], notes = [];
  let tempo = null;

  partEls.forEach((partEl, pi) => {
    let divisions = 1, beats = 4, beatType = 4, staves = 1;
    const measureEls = [...partEl.children].filter((c) => c.tagName === 'measure');
    let start = 0;
    measureEls.forEach((mEl, mi) => {
      let pos = 0, maxPos = 0, lastOnset = 0;
      const at = (q) => start + q;
      for (const el of mEl.children) {
        const tag = el.tagName;
        if (tag === 'attributes') {
          divisions = num(el, 'divisions', divisions);
          staves = num(el, 'staves', staves);
          const time = child(el, 'time');
          if (time && text(time, 'beats')) {
            beats = +text(time, 'beats').split('+').reduce((a, b) => +a + +b, 0);
            beatType = num(time, 'beat-type', beatType);
          }
        } else if (tag === 'backup') {
          pos -= num(el, 'duration', 0) / divisions;
        } else if (tag === 'forward') {
          pos += num(el, 'duration', 0) / divisions;
          maxPos = Math.max(maxPos, pos);
        } else if (tag === 'sound' || tag === 'direction') {
          const snd = tag === 'sound' ? el : child(el, 'sound');
          if (tempo == null && snd && snd.getAttribute('tempo')) tempo = +snd.getAttribute('tempo');
          if (tempo == null && tag === 'direction') {
            const met = el.getElementsByTagName('metronome')[0];
            if (met && text(met, 'beat-unit') === 'quarter' && text(met, 'per-minute')) tempo = +text(met, 'per-minute');
          }
        } else if (tag === 'note') {
          if (child(el, 'grace')) continue;
          const dur = num(el, 'duration', 0) / divisions;
          const isChord = !!child(el, 'chord');
          const onset = isChord ? lastOnset : pos;
          if (!isChord) {
            lastOnset = pos;
            pos += dur;
            maxPos = Math.max(maxPos, pos);
          }
          const pitch = child(el, 'pitch');
          if (!pitch || child(el, 'rest') || child(el, 'cue')) continue;
          const midi = 12 * (num(pitch, 'octave', 4) + 1) + STEP_PC[text(pitch, 'step')] + num(pitch, 'alter', 0);
          const staff = num(el, 'staff', 1), voice = text(el, 'voice') || '1';
          const tieStop = [...el.children].some((c) => c.tagName === 'tie' && c.getAttribute('type') === 'stop');
          const t = at(onset);
          if (tieStop) {
            // Continuation of a tied note: lengthen the note it is tied from instead of adding an onset.
            for (let k = notes.length - 1; k >= 0; k--) {
              const n = notes[k];
              if (n.part === pi && n.staff === staff && n.midi === midi && Math.abs(n.t + n.dur - t) < EPS) {
                n.dur += dur;
                break;
              }
            }
            continue;
          }
          notes.push({ t, dur, midi, part: pi, staff, hand: null, voice, measure: mi });
        }
      }
      // Bar lengths come from the first part. A pickup (implicit) bar is as long as its notes.
      const nominal = (beats * 4) / beatType;
      if (pi === 0) {
        const length = mEl.getAttribute('implicit') === 'yes' && maxPos > EPS ? maxPos : nominal;
        measures.push({ index: mi, number: mEl.getAttribute('number') || String(mi + 1), start, length, beats, beatType });
      }
      start = measures[mi] ? measures[mi].start + measures[mi].length : start + nominal;
    });
    parts.push({ id: partEl.getAttribute('id'), name: names[partEl.getAttribute('id')] || '', staves });
  });

  const piano = parts[0] && parts[0].staves >= 2;
  for (const n of notes) {
    if (piano) n.hand = n.part === 0 ? (n.staff === 1 ? 'R' : n.staff === 2 ? 'L' : null) : null;
    else n.hand = n.part === 0 ? 'R' : n.part === 1 ? 'L' : null;
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { title, composer, tempo, parts, measures, notes };
}

/**
 * Notes grouped by onset, for playing or judging part of a song.
 * hand: 'both' | 'R' | 'L'. from / to: first and last measure index (inclusive).
 * Returns [{t, notes: MIDI[], durs, measure}] with t in quarter notes from the start of measure `from`.
 */
export function songOnsets(song, { hand = 'both', from = 0, to = Infinity } = {}) {
  const base = song.measures[from] ? song.measures[from].start : 0;
  const out = [];
  for (const n of song.notes) {
    if (n.measure < from || n.measure > to) continue;
    if (hand !== 'both' && n.hand !== hand) continue;
    const t = n.t - base, last = out[out.length - 1];
    if (last && Math.abs(last.t - t) < EPS) {
      last.notes.push(n.midi);
      last.durs.push(n.dur);
    } else out.push({ t, notes: [n.midi], durs: [n.dur], measure: n.measure });
  }
  return out;
}

/** Length in quarter notes of measures from..to (inclusive). */
export function spanLength(song, from = 0, to = song.measures.length - 1) {
  return song.measures.slice(from, to + 1).reduce((a, m) => a + m.length, 0);
}
