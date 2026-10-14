// Input from an electronic piano over Web MIDI.

/**
 * Decode a MIDI message into a note event, or null for anything else.
 * Note-on with velocity 0 is a note-off. The channel is ignored.
 */
export function parseMidiMessage(data) {
  if (!data || data.length < 3) return null;
  const [st, note, velocity] = data, type = st & 0xf0;
  if (type === 0x90 && velocity > 0) return { type: 'on', note, velocity };
  if (type === 0x80 || type === 0x90) return { type: 'off', note, velocity };
  return null;
}

/**
 * isEnabled(): whether the user turned MIDI on. onNote({type, note, velocity}, timeStamp) for each note event.
 * onChange(): connection state changed; read status() for the UI.
 */
export function createMidiInput({ isEnabled, onNote, onChange }) {
  let access = null, error = '';
  const supported = () => !!navigator.requestMIDIAccess && window.isSecureContext;
  const inputs = () => (access ? [...access.inputs.values()].filter((i) => i.state === 'connected') : []);

  function onMessage(e) {
    const ev = parseMidiMessage(e.data);
    if (ev) onNote(ev, e.timeStamp);
  }
  function bind() {
    if (access) access.inputs.forEach((i) => { i.onmidimessage = isEnabled() ? onMessage : null; });
    onChange();
  }

  return {
    async connect() {
      error = '';
      if (!supported()) {
        error = 'このブラウザは Web MIDI に対応していません（Android の Chrome などで開いてください）';
        onChange();
        return;
      }
      try {
        access = await navigator.requestMIDIAccess();
        access.onstatechange = bind;
      } catch (e) {
        access = null;
        error = 'MIDI の利用が許可されませんでした。ブラウザのサイト設定で許可してください';
      }
      bind();
    },
    /** Stop listening (call after isEnabled() turned false). */
    disconnect() {
      error = '';
      bind();
    },
    /** {names: connected device names, text: status line for settings}. */
    status() {
      const names = isEnabled() ? inputs().map((i) => i.name) : [];
      let text;
      if (!isEnabled()) text = 'オフ';
      else if (error) text = error;
      else if (!access) text = '接続中…';
      else text = names.length ? '接続中：' + names.join('、') : '電子ピアノが見つかりません。ケーブルと電源を確認してください';
      return { names, text };
    },
  };
}
