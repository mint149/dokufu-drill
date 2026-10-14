// Pure layout of a chord on a staff (no DOM), used by staff.js.

/**
 * Lay out noteheads sharing one stem.
 * ds: diatonic indices sorted low to high. mid: diatonic index of the staff's middle line.
 * Returns {stemUp, shift: per note -1/0/+1 (head moved left/right of the stem for seconds),
 *          accCol: per note column index for accidentals (0 nearest the notes)} given hasAcc per note.
 */
export function chordLayout(ds, mid, hasAcc = ds.map(() => false)) {
  const lo = ds[0], hi = ds[ds.length - 1];
  // The note farthest from the middle line decides; ties (and a single note on the middle line) go down.
  const stemUp = mid - lo > hi - mid;
  const shift = ds.map(() => 0);
  if (stemUp) {
    // Stem on the right: walking up, the upper note of a second moves to the right of the stem.
    for (let i = 1; i < ds.length; i++) if (ds[i] - ds[i - 1] === 1 && shift[i - 1] === 0) shift[i] = 1;
  } else {
    // Stem on the left: walking down, the lower note of a second moves to the left of the stem.
    for (let i = ds.length - 2; i >= 0; i--) if (ds[i + 1] - ds[i] === 1 && shift[i + 1] === 0) shift[i] = -1;
  }
  // Accidentals: from the top, put each in the first column where it is at least a sixth from the others.
  const cols = [], accCol = ds.map(() => -1);
  for (let i = ds.length - 1; i >= 0; i--) {
    if (!hasAcc[i]) continue;
    let c = 0;
    while (cols[c] && cols[c].some((d) => Math.abs(d - ds[i]) < 6)) c++;
    (cols[c] = cols[c] || []).push(ds[i]);
    accCol[i] = c;
  }
  return { stemUp, shift, accCol };
}
