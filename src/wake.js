// Keep the screen on while practicing (Screen Wake Lock). The browser releases it when the page is hidden,
// so callers ask again when it becomes visible.

let lock = null;

export async function keepAwake() {
  try {
    if (navigator.wakeLock && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    }
  } catch (e) {}
}

export function releaseWake() {
  if (lock) lock.release().catch(() => {});
  lock = null;
}
