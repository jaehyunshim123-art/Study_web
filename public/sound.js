// Arcade sound effects, made on the fly with the Web Audio API (no audio files).
// Sound.play("coin") plays one; Sound.toggle() mutes or unmutes, and the choice is remembered.
// Browsers only allow audio after the player clicks or presses a key, so the first sounds
// start with that first interaction.

const Sound = (() => {
  const KEY = "study-helper-muted";
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === "1"; } catch { /* storage blocked: sound on */ }

  function audio() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // One note: frequency in Hz, start offset and length in seconds, optional slide to another pitch.
  function note(a, freq, at, length, { type = "square", volume = 0.06, slide = null } = {}) {
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + length);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  const tune = (a, notes, step, opts) => notes.forEach((f, i) => note(a, f, i * step, step * 1.4, opts));

  const EFFECTS = {
    press: (a) => note(a, 520, 0, 0.05, { volume: 0.04 }),
    blip: (a) => { note(a, 880, 0, 0.04, { volume: 0.03 }); note(a, 1175, 0.05, 0.04, { volume: 0.03 }); },
    insert: (a) => { note(a, 180, 0, 0.04, { type: "triangle", volume: 0.1 }); note(a, 988, 0.08, 0.08); note(a, 1319, 0.16, 0.25); },
    coin: (a) => { note(a, 988, 0, 0.07); note(a, 1319, 0.07, 0.2); },
    right: (a) => tune(a, [523, 659, 784, 1047], 0.06),
    wrong: (a) => { note(a, 220, 0, 0.18, { type: "sawtooth", volume: 0.05, slide: 110 }); note(a, 165, 0.2, 0.25, { type: "sawtooth", volume: 0.05, slide: 82 }); },
    whoosh: (a) => note(a, 180, 0, 0.9, { type: "triangle", volume: 0.08, slide: 1400 }),
    unwhoosh: (a) => note(a, 1400, 0, 0.8, { type: "triangle", volume: 0.07, slide: 180 }),
    open: (a) => note(a, 330, 0, 0.18, { type: "triangle", volume: 0.08, slide: 880 }),
    close: (a) => note(a, 880, 0, 0.16, { type: "triangle", volume: 0.07, slide: 330 }),
    buy: (a) => { note(a, 1319, 0, 0.06); note(a, 1568, 0.06, 0.06); note(a, 2093, 0.12, 0.25); },
    deny: (a) => { note(a, 150, 0, 0.1, { volume: 0.06 }); note(a, 150, 0.14, 0.12, { volume: 0.06 }); },
    step: (a) => note(a, 1200, 0, 0.04, { volume: 0.03 }),
    arrive: (a) => tune(a, [523, 659, 784, 1047, 784, 1047], 0.09, { type: "square", volume: 0.05 }),
    win: (a) => tune(a, [392, 523, 659, 784, 659, 784, 1047, 1319], 0.11, { type: "square", volume: 0.05 }),
  };

  return {
    play(name) {
      if (muted) return;
      const a = audio();
      if (a && EFFECTS[name]) {
        try { EFFECTS[name](a); } catch { /* a failed sound never breaks the game */ }
      }
    },
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* not saved */ }
      if (!muted) this.play("blip");
      return muted;
    },
  };
})();
