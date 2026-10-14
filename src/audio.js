// Key sound synthesized with Web Audio, and vibration on misses.

let ac = null;

/** Create/resume the AudioContext. Must be called from a user gesture. */
export function unlock() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
}

/** The shared AudioContext (created on first use; call from a user gesture). */
export function audioContext() {
  unlock();
  return ac;
}

/** A short piano-like tone for MIDI note m. */
export function playTone(m) {
  if (!ac) return;
  const f = 440 * Math.pow(2, (m - 69) / 12), t = ac.currentTime;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.3, t + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, f * 7);
  [['triangle', 1, 1], ['sine', 2, 0.32], ['sine', 3, 0.1]].forEach(([ty, mul, amp]) => {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = ty;
    o.frequency.value = f * mul;
    og.gain.value = amp;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(t + 1.6);
  });
  lp.connect(out);
  out.connect(ac.destination);
}

export function vibrate() {
  if (navigator.vibrate) {
    try { navigator.vibrate(60); } catch (e) {}
  }
}
