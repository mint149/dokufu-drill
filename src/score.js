// Phrase notation with VexFlow. Imported on demand (only the rhythm mode needs it), so the drill loads fast.
import {
  Accidental,
  Annotation,
  AnnotationVerticalJustify,
  Beam,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  Voice,
} from 'vexflow/bravura';
import { LETTERS } from './theory.js';
import { displayAccidentals } from './phrase.js';

const CLEF = { T: 'treble', B: 'bass' };
const REST_KEY = { T: 'b/4', B: 'd/3' };
const DUR = { 0.5: '8', 1: 'q', 2: 'h' };
const keyOf = (n) => `${LETTERS[n.d % 7].toLowerCase()}/${Math.floor(n.d / 7)}`;

/** Resolves once VexFlow's music font is ready (drawing before that measures glyphs wrongly). */
export const ready = Promise.all([document.fonts.load('30px Bravura'), document.fonts.load('12px Academico')]).catch(() => {});

/**
 * Draw `phrase` (see phrase.js) into el as one SVG that scales to the element's width.
 * ink: default color. marks (optional): per event {color, label} or null; label is printed under the note.
 */
export function drawPhrase(el, phrase, { ink, marks = [] }) {
  el.innerHTML = '';
  // Logical width grows with the bar count; the SVG is then scaled to the element, so one bar is drawn larger.
  const W = 90 + 170 * phrase.measures, H = 170, top = 30;
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(W, H);
  const ctx = renderer.getContext();
  ctx.setFillStyle(ink);
  ctx.setStrokeStyle(ink);

  const accs = displayAccidentals(phrase), clef = CLEF[phrase.st];
  const head = 64; // room for clef and time signature in the first bar
  const barW = (W - 10 - head) / phrase.measures;
  let x = 5;
  for (let m = 0; m < phrase.measures; m++) {
    const stave = new Stave(x, top, barW + (m === 0 ? head : 0));
    if (m === 0) stave.addClef(clef).addTimeSignature(`${phrase.beats}/4`);
    stave.setContext(ctx).draw();
    x += stave.getWidth();

    const notes = [];
    phrase.events.forEach((e, i) => {
      if (Math.floor(e.beat / phrase.beats) !== m) return;
      const note = e.rest
        ? new StaveNote({ keys: [REST_KEY[phrase.st]], duration: DUR[e.dur] + 'r', clef })
        : new StaveNote({ keys: e.notes.map(keyOf), duration: DUR[e.dur], clef });
      accs[i].forEach((a, k) => a && note.addModifier(new Accidental(a), k));
      const mk = marks[i];
      // VexFlow draws stems in black and ledger lines in #444 regardless of the context color: set them for dark mode.
      const color = mk ? mk.color : ink, style = { fillStyle: color, strokeStyle: color };
      note.setStyle(style);
      note.setStemStyle(style);
      note.setLedgerLineStyle(style);
      if (mk) {
        if (mk.label) {
          const an = new Annotation(mk.label).setVerticalJustification(AnnotationVerticalJustify.BOTTOM);
          an.setFont('sans-serif', 11, 'bold');
          an.setStyle({ fillStyle: mk.color, strokeStyle: mk.color });
          note.addModifier(an, 0);
        }
      }
      notes.push(note);
    });
    const voice = new Voice({ numBeats: phrase.beats, beatValue: 4 }).addTickables(notes);
    const beams = Beam.generateBeams(notes); // groups eighths by beat; rests break beams
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setStyle({ fillStyle: ink, strokeStyle: ink }).setContext(ctx).draw());
  }
  const svg = el.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
}
