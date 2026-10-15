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

/**
 * A piano-like tone for MIDI note m. Without options it sounds now and decays over 1.5 s.
 * at: audio time (s) to start; dur: held length (s) before release; vol: peak gain.
 * Returns {stop()} to cut it (e.g. when a scheduled demo is cancelled), or null without audio.
 */
export function playTone(m, { at, dur, vol = 0.3 } = {}) {
  if (!ac) return null;
  const f = 440 * Math.pow(2, (m - 69) / 12), t = at ?? ac.currentTime;
  const end = dur == null ? t + 1.5 : t + dur + 0.12;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  if (dur != null) out.gain.exponentialRampToValueAtTime(vol * 0.4, t + Math.max(0.02, dur));
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, f * 7);
  const oscs = [['triangle', 1, 1], ['sine', 2, 0.32], ['sine', 3, 0.1]].map(([ty, mul, amp]) => {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = ty;
    o.frequency.value = f * mul;
    og.gain.value = amp;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(end + 0.1);
    return o;
  });
  lp.connect(out);
  out.connect(ac.destination);
  return {
    stop() {
      oscs.forEach((o) => {
        try { o.stop(); } catch (e) {}
      });
    },
  };
}

export function vibrate() {
  if (navigator.vibrate) {
    try { navigator.vibrate(60); } catch (e) {}
  }
}
