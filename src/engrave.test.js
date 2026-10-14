import { describe, expect, it } from 'vitest';
import { chordLayout } from './engrave.js';

// Treble staff: bottom line E4 = 30, middle line B4 = 34.
const MID = 34;

describe('chordLayout', () => {
  it('stem direction follows the note farthest from the middle line', () => {
    expect(chordLayout([30], MID).stemUp).toBe(true);
    expect(chordLayout([36], MID).stemUp).toBe(false);
    expect(chordLayout([34], MID).stemUp).toBe(false); // on the middle line: down
    expect(chordLayout([28, 32, 37], MID).stemUp).toBe(true); // 6 below vs 3 above
    expect(chordLayout([32, 39], MID).stemUp).toBe(false);
  });
  it('a second with the stem up puts the upper note right of the stem', () => {
    expect(chordLayout([28, 29], MID).shift).toEqual([0, 1]);
  });
  it('a second with the stem down puts the lower note left of the stem', () => {
    expect(chordLayout([38, 39], MID).shift).toEqual([-1, 0]);
  });
  it('a cluster alternates sides', () => {
    expect(chordLayout([28, 29, 30], MID).shift).toEqual([0, 1, 0]);
  });
  it('notes a third or more apart stay on the normal side', () => {
    expect(chordLayout([28, 30, 32], MID).shift).toEqual([0, 0, 0]);
  });
  it('close accidentals go to separate columns, distant ones share', () => {
    expect(chordLayout([28, 30], MID, [true, true]).accCol).toEqual([1, 0]);
    expect(chordLayout([28, 34], MID, [true, true]).accCol).toEqual([0, 0]);
    expect(chordLayout([28, 30, 32], MID, [true, false, true]).accCol).toEqual([1, -1, 0]);
  });
});
