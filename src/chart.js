// Chord chart for chord progressions in the rhythm mode: one box per bar with chord names and degrees.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Draw `prog` (see chords.js makeProgression) into el.
 * marks (optional): per event {color, label} or null; the chord is colored and the label shown under it.
 */
export function drawChart(el, prog, { marks = [] }) {
  const bars = Array.from({ length: prog.measures }, () => []);
  prog.events.forEach((e, i) => bars[Math.floor(e.beat / prog.beats)].push(i));
  // Four bars per row; two when a bar holds two chords, so the names fit on a phone.
  const wide = bars.some((b) => b.length > 1);
  el.innerHTML = `<div class="chart"><p class="chart-t">${esc(prog.title)}</p><div class="bars${wide ? ' wide' : ''}">${bars
    .map(
      (idx) =>
        `<div class="cbar">${idx
          .map((i) => {
            const c = prog.events[i].chord, mk = marks[i];
            return `<span class="cch"${mk ? ` style="color:${esc(mk.color)}"` : ''}><b>${esc(c.name)}</b><small>${esc(c.roman)}</small>${
              mk && mk.label ? `<em>${esc(mk.label)}</em>` : ''
            }</span>`;
          })
          .join('')}</div>`
    )
    .join('')}</div></div>`;
}
