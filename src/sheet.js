// Song score display with OpenSheetMusicDisplay. Imported on demand (only the 曲 tab needs it).
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

const EPS = 1e-6;

/**
 * Render MusicXML into el, sized to its width. ink / accent: colors for the music and the cursor.
 * Returns {cursorAt(t), hideCursor()}: t is in quarter notes from the start of the piece (as in musicxml.js).
 */
export async function createSheet(el, xml, { ink, accent }) {
  el.innerHTML = '';
  const osmd = new OpenSheetMusicDisplay(el, {
    backend: 'svg',
    autoResize: true,
    drawTitle: true,
    drawComposer: true,
    drawPartNames: false,
    drawPartAbbreviations: false,
    followCursor: true,
    defaultColorMusic: ink,
    defaultColorLabel: ink,
    defaultColorTitle: ink,
    cursorsOptions: [{ type: 0, color: accent, alpha: 0.35, follow: true }],
  });
  osmd.EngravingRules.StaffLineColor = ink;
  osmd.EngravingRules.LedgerLineColorDefault = ink;
  await osmd.load(xml);
  // Large enough to read on a phone (2–3 bars per line), more bars per line on wider screens.
  osmd.zoom = Math.min(1, Math.max(0.6, (el.clientWidth || 360) / 600));
  osmd.render();

  // Walk the cursor once to learn the time (quarter notes) of each of its positions.
  const cur = osmd.cursor, steps = [];
  cur.reset();
  for (let guard = 0; !cur.Iterator.EndReached && guard < 100000; guard++) {
    steps.push(cur.Iterator.currentTimeStamp.RealValue * 4);
    cur.next();
  }
  cur.reset();
  cur.hide();
  let k = 0;

  return {
    /** Move the cursor to the last position at or before t (forward only, unless t went back). */
    cursorAt(t) {
      if (k > 0 && steps[k] > t + EPS) {
        cur.reset();
        k = 0;
      }
      while (k + 1 < steps.length && steps[k + 1] <= t + EPS) {
        cur.next();
        k++;
      }
      if (cur.Hidden) cur.show();
    },
    hideCursor() {
      cur.hide();
      cur.reset();
      k = 0;
    },
  };
}
