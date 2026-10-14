// Metronome clicks scheduled on the Web Audio clock, and conversion from audio time to performance.now() time.

/**
 * performance.now()-based time (ms) at which a sound scheduled at audio time `t` (s) is expected to be heard.
 * Uses getOutputTimestamp() when available, which accounts for output latency the browser knows about.
 * Whatever is left (e.g. Bluetooth, or what the browser does not report) is removed by the user's calibration.
 */
export function perfTimeOf(ac, t) {
  const ts = ac.getOutputTimestamp ? ac.getOutputTimestamp() : null;
  if (ts && ts.performanceTime > 0) return ts.performanceTime + (t - ts.contextTime) * 1000;
  return performance.now() + (t - ac.currentTime) * 1000 + (ac.outputLatency || ac.baseLatency || 0) * 1000;
}

/**
 * Schedule clicks at audio times (s). accents: indices with a higher, louder click (downbeats).
 * Returns {stop()} to silence clicks that have not played yet.
 */
export function scheduleClicks(ac, times, accents = new Set()) {
  const nodes = times.map((t, i) => {
    const accent = accents.has(i);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t);
    o.stop(t + 0.05);
    return o;
  });
  return {
    stop() {
      nodes.forEach((o) => {
        try { o.stop(); } catch (e) {}
      });
    },
  };
}
