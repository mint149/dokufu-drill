import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './midi-input.js';

describe('parseMidiMessage', () => {
  it('reads note-on on any channel', () => {
    expect(parseMidiMessage([0x90, 60, 80])).toEqual({ type: 'on', note: 60, velocity: 80 });
    expect(parseMidiMessage([0x93, 61, 1])).toMatchObject({ type: 'on', note: 61 });
  });
  it('treats note-off and note-on with velocity 0 as off', () => {
    expect(parseMidiMessage([0x80, 60, 64])).toMatchObject({ type: 'off', note: 60 });
    expect(parseMidiMessage([0x90, 60, 0])).toMatchObject({ type: 'off', note: 60 });
  });
  it('ignores other messages', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull(); // sustain pedal
    expect(parseMidiMessage([0xfe])).toBeNull(); // active sensing
    expect(parseMidiMessage(null)).toBeNull();
  });
});
