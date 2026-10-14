// On-screen piano keyboard: building the keys and turning taps into key presses.
import { DOREMI, LETTERS, PC, isWhite, midiOf } from './theory.js';

/**
 * Rebuild the keys. One octave (C4–B4) normally; with octave judging, every octave the pool reaches.
 * Returns the MIDI range {lo, hi}.
 */
export function buildKeyboard(kb, wrap, { pool, octave, labels, names }) {
  kb.innerHTML = '';
  let lo = 60, hi = 71;
  if (octave) {
    const ms = pool.map(midiOf);
    lo = 12 * Math.floor(Math.min(...ms) / 12);
    hi = 12 * Math.floor(Math.max(...ms) / 12) + 11;
  }
  const whites = [];
  for (let m = lo; m <= hi; m++) if (isWhite(m)) whites.push(m);
  const n = whites.length;
  kb.style.minWidth = octave ? n * 36 + 'px' : '';
  whites.forEach((m) => {
    const b = document.createElement('button');
    b.className = 'key w';
    b.dataset.midi = m;
    const L = PC.indexOf(m % 12), name = names === 'jp' ? DOREMI[L] : LETTERS[L];
    let lab = '';
    if (labels === 'A') lab = name + (octave && L === 0 ? m / 12 - 1 : '');
    else if (labels === 'C' && L === 0) lab = name + (octave ? m / 12 - 1 : '');
    b.textContent = lab;
    b.setAttribute('aria-label', name + (Math.floor(m / 12) - 1));
    kb.appendChild(b);
  });
  whites.forEach((m, i) => {
    if (m + 1 <= hi && !isWhite(m + 1)) {
      const b = document.createElement('button');
      b.className = 'key b';
      b.dataset.midi = m + 1;
      b.style.left = `calc(${((i + 1) / n) * 100}% - ${(0.31 / n) * 100}%)`;
      b.style.width = `${(0.62 / n) * 100}%`;
      b.setAttribute('aria-label', '黒鍵');
      kb.appendChild(b);
    }
  });
  requestAnimationFrame(() => {
    wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
  });
  return { lo, hi };
}

/** The on-screen key for a MIDI note. Without octave judging, any octave maps onto the single shown octave. */
export function keyForMidi(m, { lo, octave }) {
  const t = octave ? m : lo + (((m - lo) % 12) + 12) % 12;
  return document.querySelector(`.key[data-midi="${t}"]`);
}

export function clearMarks() {
  document.querySelectorAll('.key.ok,.key.ng,.key.hint').forEach((k) => k.classList.remove('ok', 'ng', 'hint'));
}

export function flash(el, cls, ms) {
  el.classList.add(cls);
  if (ms) setTimeout(() => el.classList.remove(cls), ms);
}

/**
 * Call onKey(keyElement) for each tap.
 * A tap is judged on pointerup, and dragging (horizontal scroll) cancels it, so scrolling never answers.
 */
export function attachTapInput(kb, wrap, onKey) {
  let press = null;
  const endPress = () => {
    if (press) {
      press.k.classList.remove('down');
      press = null;
    }
  };
  kb.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.key');
    if (!k) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    endPress();
    press = { k, id: e.pointerId, x: e.clientX, y: e.clientY, sl: wrap.scrollLeft };
    k.classList.add('down');
  });
  kb.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10) endPress();
  });
  kb.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const k = press.k, moved = Math.abs(wrap.scrollLeft - press.sl) > 3;
    endPress();
    if (!moved) onKey(k);
  });
  kb.addEventListener('pointercancel', endPress);
  wrap.addEventListener('scroll', () => {
    if (press && Math.abs(wrap.scrollLeft - press.sl) > 3) endPress();
  }, { passive: true });
  kb.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('key')) {
      e.preventDefault();
      onKey(e.target);
    }
  });
}
