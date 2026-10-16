// The study timer: focus sessions and short breaks (Pomodoro-style), separate from the game.
// It's saved in the browser and counts from a fixed end time, so it keeps going if you
// exit to the arcade or reload the page. Any element with data-timer="..." shows part of it
// (clock, mode, bar, toggle, sessions), and buttons with data-timer-action control it, so the
// same timer can appear in several places at once (the game, the control panel, the landing page).

const StudyTimer = (() => {
  const KEY = "study-helper-timer";
  const PRESETS = [
    { focus: 25, rest: 5, label: "25 / 5" },
    { focus: 50, rest: 10, label: "50 / 10" },
    { focus: 15, rest: 3, label: "15 / 3" },
  ];
  const today = () => new Date().toDateString();

  let s = load();

  function load() {
    const fresh = { preset: 0, mode: "focus", running: false, endsAt: 0, left: PRESETS[0].focus * 60000, sessions: 0, day: today() };
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage blocked: start fresh */ }
    const state = { ...fresh, ...saved };
    if (state.day !== today()) Object.assign(state, { sessions: 0, day: today() });
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not saved */ }
  }

  const preset = () => PRESETS[s.preset] || PRESETS[0];
  const total = () => (s.mode === "focus" ? preset().focus : preset().rest) * 60000;
  const remaining = () => (s.running ? Math.max(0, s.endsAt - Date.now()) : s.left);

  function start() {
    if (s.running) return;
    s.running = true;
    s.endsAt = Date.now() + s.left;
    save();
    render();
  }

  function pause() {
    if (!s.running) return;
    s.left = remaining();
    s.running = false;
    save();
    render();
  }

  function reset() {
    s.running = false;
    s.left = total();
    save();
    render();
  }

  // A session ended (or was skipped): switch between focus and break.
  function finish(completed) {
    const wasFocus = s.mode === "focus";
    if (wasFocus && completed) s.sessions++;
    s.mode = wasFocus ? "break" : "focus";
    s.running = false;
    s.left = total();
    save();
    render();
    if (completed) {
      Sound.play("arrive");
      announce(wasFocus ? `FOCUS SESSION DONE! TAKE A ${preset().rest}-MINUTE BREAK.` : "BREAK'S OVER. READY TO FOCUS?");
    }
  }

  function announce(text) {
    if (typeof toast === "function") toast(text);
  }

  const clock = (ms) => {
    const sec = Math.ceil(ms / 1000);
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };

  // Update every place the timer is shown.
  function render() {
    const left = remaining();
    const set = (name, fn) => document.querySelectorAll(`[data-timer="${name}"]`).forEach(fn);
    set("clock", (el) => (el.textContent = clock(left)));
    set("mode", (el) => (el.textContent = s.mode === "focus" ? "FOCUS" : "BREAK"));
    set("bar", (el) => (el.style.width = `${100 - (left / total()) * 100}%`));
    set("toggle", (el) => (el.textContent = s.running ? "PAUSE" : left < total() ? "RESUME" : "START"));
    set("sessions", (el) => (el.textContent = `${s.sessions} focus session${s.sessions === 1 ? "" : "s"} today`));
    document.querySelectorAll(".timer-panel, .lcd").forEach((el) => {
      el.classList.toggle("running", s.running);
      el.classList.toggle("on-break", s.mode === "break");
    });
    document.querySelectorAll("[data-timer-action='preset']").forEach((b) => b.classList.toggle("active", Number(b.dataset.i) === s.preset));
  }

  // The timer's controls, ready to drop into any container.
  function panelHTML() {
    return `
      <p class="tp-mode" data-timer="mode">FOCUS</p>
      <div class="tp-clock" data-timer="clock">25:00</div>
      <div class="tp-bar"><div data-timer="bar"></div></div>
      <div class="tp-actions">
        <button class="btn-next" data-timer-action="toggle" data-timer="toggle">START</button>
        <button class="btn-ghost" data-timer-action="reset">RESET</button>
        <button class="btn-ghost" data-timer-action="skip">SKIP</button>
      </div>
      <p class="tp-label">FOCUS / BREAK MINUTES</p>
      <div class="tp-presets">${PRESETS.map((p, i) => `<button class="chip" data-timer-action="preset" data-i="${i}">${p.label}</button>`).join("")}</div>
      <p class="tp-note">Study with no distractions until the timer rings, then take the break. <span data-timer="sessions"></span>.</p>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-timer-action]");
    if (!b) return;
    Sound.play("press");
    const action = b.dataset.timerAction;
    if (action === "toggle") s.running ? pause() : start();
    else if (action === "reset") reset();
    else if (action === "skip") finish(false);
    else if (action === "preset") {
      s.preset = Number(b.dataset.i);
      s.mode = "focus";
      reset();
    }
  });

  setInterval(() => {
    if (s.running && remaining() === 0) finish(true);
    else if (s.running) render();
  }, 250);

  return { render, panelHTML };
})();
