// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { musicXmlText, parseMusicXml, songOnsets, spanLength } from './musicxml.js';
import xml from './fixtures/twinkle.musicxml?raw';

const song = parseMusicXml(xml);
const at = (hand) => song.notes.filter((n) => n.hand === hand).map((n) => [n.t, n.midi, n.dur]);

describe('parseMusicXml', () => {
  it('reads title, composer, tempo and parts', () => {
    expect(song).toMatchObject({ title: 'きらきら星（テスト用）', composer: 'フランス民謡', tempo: 96 });
    expect(song.parts).toEqual([{ id: 'P1', name: 'Piano', staves: 2 }]);
  });
  it('bars: a one-beat pickup, then 4/4', () => {
    expect(song.measures.map((m) => [m.number, m.start, m.length])).toEqual([
      ['0', 0, 1], ['1', 1, 4], ['2', 5, 4], ['3', 9, 4], ['4', 13, 4],
    ]);
    expect(spanLength(song)).toBe(17);
    expect(spanLength(song, 1, 2)).toBe(8);
  });
  it('right hand: upper staff, with accidentals, eighths, rests skipped and ties merged', () => {
    expect(at('R')).toEqual([
      [0, 67, 1],
      [1, 72, 1], [2, 72, 1], [3, 79, 1], [4, 79, 1],
      [5, 81, 1], [6, 81, 1], [7, 79, 2],
      [9, 78, 1], [10, 78, 1], [11, 76, 0.5], [11.5, 76, 0.5], [12, 74, 2], // D5 tied over the bar
      [15, 72, 2],
    ]);
  });
  it('left hand: lower staff after <backup>, chords share an onset', () => {
    expect(at('L')).toEqual([
      [1, 48, 4], [1, 55, 4],
      [5, 53, 2], [5, 57, 2], [7, 48, 2], [7, 52, 2],
      [9, 50, 2], [9, 57, 2], [11, 43, 4], // G2 tied over the bar
      [15, 48, 2], [15, 52, 2], [15, 55, 2],
    ]);
  });
  it('notes know their bar', () => {
    expect(song.notes.find((n) => n.t === 12).measure).toBe(3);
  });
  it('rejects files that are not MusicXML', () => {
    expect(() => parseMusicXml('<html><body/></html>')).toThrow('MusicXML ではない');
    expect(() => parseMusicXml('not xml <')).toThrow();
  });
  it('a single-staff part per hand', () => {
    const two = `<score-partwise><part-list/>
      <part id="A"><measure number="1"><attributes><divisions>1</divisions></attributes>
        <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration></note></measure></part>
      <part id="B"><measure number="1"><attributes><divisions>1</divisions></attributes>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note></measure></part>
    </score-partwise>`;
    expect(parseMusicXml(two).notes.map((n) => [n.midi, n.hand])).toEqual([[48, 'L'], [76, 'R']]);
  });
  it('grace notes take no time', () => {
    const g = `<score-partwise><part-list/><part id="A"><measure number="1"><attributes><divisions>1</divisions></attributes>
      <note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;
    expect(parseMusicXml(g).notes.map((n) => [n.t, n.midi])).toEqual([[0, 60], [1, 64]]);
  });
});

describe('songOnsets', () => {
  it('groups both hands by onset', () => {
    const on = songOnsets(song);
    expect(on.slice(0, 3)).toEqual([
      { t: 0, notes: [67], durs: [1], measure: 0 },
      { t: 1, notes: [48, 55, 72], durs: [4, 4, 1], measure: 1 },
      { t: 2, notes: [72], durs: [1], measure: 1 },
    ]);
  });
  it('one hand and a range of bars, timed from the first bar of the range', () => {
    expect(songOnsets(song, { hand: 'L', from: 2, to: 3 }).map((o) => [o.t, o.notes])).toEqual([
      [0, [53, 57]], [2, [48, 52]], [4, [50, 57]], [6, [43]],
    ]);
  });
});

describe('musicXmlText', () => {
  it('reads plain files', () => {
    expect(musicXmlText(strToU8(xml))).toBe(xml);
  });
  it('unzips .mxl through META-INF/container.xml', () => {
    const mxl = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score/song.musicxml"/></rootfiles></container>'),
      'score/song.musicxml': strToU8(xml),
    });
    expect(parseMusicXml(musicXmlText(mxl)).title).toBe('きらきら星（テスト用）');
  });
  it('a zip without a score is an error', () => {
    expect(() => musicXmlText(zipSync({ 'a.txt': strToU8('x') }))).toThrow('見つかりません');
  });
});
