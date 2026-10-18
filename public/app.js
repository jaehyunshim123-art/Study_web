// The arcade landing page: upload a syllabus, zoom into the machine, and load the course
// there (the AI builds the route and the first lesson) before the game (game.js) starts.
// The game is saved in the browser (localStorage) so you can come back to it.

const SAVE_KEY = "study-helper-game";
let pdfData = null;
let busy = false;

// ---------- saving ----------

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data?.trail?.units?.length) return null;
    return { lessons: {}, lessonSeen: {}, paint: "canvas", paints: [], ...data };
  } catch {
    return null;
  }
}

function persistGame() {
  try {
    if (game) localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be blocked (private browsing); the game still works for this visit.
  }
}

function newGame(trail, syllabus) {
  return {
    trail: { courseTitle: trail.courseTitle, theme: trail.theme || "frontier", units: trail.units },
    demo: Boolean(trail.demo),
    syllabus: syllabus.slice(0, 20000), // sent along when asking for questions
    banks: {},      // questions per unit
    lessons: {},    // lesson summary per unit
    lessonSeen: {}, // units whose lesson has been read
    levels: {},
    paint: "canvas", paints: [], // wagon paint in use, and paints bought
    unit: 0, legMiles: 0, queue: [],
    coins: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, finished: false,
  };
}

// Same course, same questions, fresh run.
function restartGame() {
  Object.assign(game, { lessonSeen: {}, levels: {}, unit: 0, legMiles: 0, queue: [], coins: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, finished: false });
  persistGame();
}

// ---------- landing: syllabus upload ----------

function updateStart() {
  const ready = Boolean(pdfData || $("syllabus").value.trim());
  $("start").disabled = busy || !ready;
}

function setStatus(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}

function setScreen(html, isBusy = false) {
  $("screen-text").innerHTML = html;
  $("screen-text").classList.toggle("busy", isBusy);
}

function readPdf(file) {
  pdfData = null;
  $("drop").classList.remove("ready");
  $("pdf-name").textContent = "PDF, up to 10 MB";
  updateStart();
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setStatus("That isn't a PDF. Upload a PDF or paste the text instead.", true);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setStatus("That PDF is over 10 MB. Try a smaller file or paste the text.", true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pdfData = String(reader.result).split(",")[1]; // drop the "data:application/pdf;base64," part
    $("drop").classList.add("ready");
    $("pdf-name").textContent = file.name;
    setStatus("");
    setScreen("READY<br />PRESS START");
    Sound.play("insert");
    setTimeout(() => Sound.play("coindrop"), 330); // the coin lands inside the machine
    updateStart();
  };
  reader.readAsDataURL(file);
}

$("pdf").addEventListener("change", () => readPdf($("pdf").files[0]));
$("syllabus").addEventListener("input", updateStart);
for (const type of ["dragenter", "dragover"]) {
  $("drop").addEventListener(type, (e) => { e.preventDefault(); $("drop").classList.add("over"); });
}
for (const type of ["dragleave", "drop"]) {
  $("drop").addEventListener(type, () => $("drop").classList.remove("over"));
}
$("drop").addEventListener("drop", (e) => {
  e.preventDefault();
  readPdf(e.dataTransfer.files[0]);
});

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// Insert the syllabus: zoom into the machine, then load the course on its screen.
$("start").addEventListener("click", async () => {
  busy = true;
  updateStart();
  setStatus("");
  setScreen("LOADING", true);
  await enterMachine(() => showLoading(0));
  await loadCourse({ syllabus: $("syllabus").value, pdf: pdfData });
});

// ---------- loading the course ----------
// Claude can take a minute or two to read a syllabus (and, in the claude.ai preview, first asks
// the player to allow it), so the loading screen says what it's waiting for, shows Claude's
// writing as it arrives, and always offers the demo course instead.

let loadCtl = null; // cancels the loading that's under way
const live = { start: 0, chars: 0, timer: null };

window.addEventListener("ai-progress", (e) => {
  live.chars = e.detail.chars;
  showLive();
});

function showLive() {
  const el = $("load-live");
  if (!el) return;
  const secs = Math.round((Date.now() - live.start) / 1000);
  if (live.chars) el.textContent = `Claude is writing... ${live.chars.toLocaleString()} characters so far (${secs}s)`;
  else if (window.claude) el.textContent = `Waiting for Claude (${secs}s). If a box asks to let this page use Claude, press Allow. Reading a syllabus can take a minute or two.`;
  else el.textContent = `Working on it (${secs}s). Reading a syllabus can take a minute or two.`;
}

function showLoading(step, error = "") {
  renderLoading(step, error, error ? () => exitGame() : null);
  const card = $("play").querySelector(".loading");
  if (!error) card.insertAdjacentHTML("beforeend", `<p class="load-live" id="load-live" aria-live="polite"></p>`);
  const demo = document.createElement("button");
  demo.className = "btn-ghost load-demo";
  demo.textContent = "PLAY THE DEMO COURSE INSTEAD";
  demo.addEventListener("click", playDemo);
  card.append(demo);
  showLive();
}

// body: what /api/trail needs ({syllabus, pdf}, or {demo: true})
async function loadCourse(body) {
  const ctl = (loadCtl = new AbortController());
  loadSignal = ctl.signal;
  Object.assign(live, { start: Date.now(), chars: 0 });
  clearInterval(live.timer);
  live.timer = setInterval(showLive, 1000);
  let step = 0;
  const mapping = setTimeout(() => !ctl.signal.aborted && showLoading((step = 1)), 2500); // the AI reads and maps in one go
  try {
    const res = await fetch("/api/trail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    clearTimeout(mapping);
    if (ctl.signal.aborted) return;
    game = newGame(data, data.syllabusText || body.syllabus || "");
    for (const k in pending) delete pending[k]; // nothing from an earlier course
    persistGame();
    live.chars = 0;
    showLoading((step = 2));
    await questionsFor(0).catch(() => {}); // if this fails, the game screen shows a retry
    if (ctl.signal.aborted) return;
    showLoading((step = 3));
    await wait(600);
    if (ctl.signal.aborted) return;
    Arcade.openMenu();
  } catch (err) {
    clearTimeout(mapping);
    if (!ctl.signal.aborted) showLoading(step, err.message || "Something went wrong. Try again.");
  } finally {
    if (loadCtl === ctl) {
      loadCtl = loadSignal = null;
      clearInterval(live.timer);
      busy = false;
      updateStart();
    }
  }
}

function playDemo() {
  loadCtl?.abort();
  Sound.play("blip");
  busy = true;
  loadCourse({ demo: true });
}

$("resume").addEventListener("click", () => enterMachine(() => Arcade.openMenu()));

function updateResume() {
  $("resume").hidden = !game;
  if (game) $("resume").textContent = `Continue ${game.trail.courseTitle}`;
}

// ---------- the zoom into (and out of) the arcade screen ----------

const ZOOM_MS = 1100;

// The part of the cabinet drawing to zoom into: the screen plus the control deck below it
// (in the drawing's own units; the drawing is 300 wide).
const ZOOM_REGION = { x: 18, y: 80, width: 264, height: 222 };

// The transform that makes that part of the cabinet fill the window.
function zoomTransform() {
  const landing = $("landing").getBoundingClientRect();
  const art = document.querySelector(".cabinet-art").getBoundingClientRect();
  const k = art.width / 300;
  const width = ZOOM_REGION.width * k;
  const height = ZOOM_REGION.height * k;
  const cx = art.left + (ZOOM_REGION.x + ZOOM_REGION.width / 2) * k;
  const cy = art.top + (ZOOM_REGION.y + ZOOM_REGION.height / 2) * k;
  const scale = Math.min(innerWidth / width, innerHeight / height);
  return {
    origin: `${cx - landing.left}px ${cy - landing.top}px`,
    transform: `translate(${innerWidth / 2 - cx}px, ${innerHeight / 2 - cy}px) scale(${scale})`,
  };
}

// Zoom into the machine, switch to the game view, then run show() to fill its screen.
function enterMachine(show) {
  const landing = $("landing");
  const wait = reducedMotion() ? 0 : ZOOM_MS;
  if (wait) {
    const z = zoomTransform();
    landing.style.transformOrigin = z.origin;
    landing.classList.add("zooming");
    Sound.play("whoosh");
    requestAnimationFrame(() => (landing.style.transform = z.transform));
  }
  return new Promise((done) => setTimeout(() => {
    landing.hidden = true;
    landing.classList.remove("zooming");
    landing.style.transform = "";
    $("game").hidden = false;
    $("game").classList.add("entering");
    setTimeout(() => $("game").classList.remove("entering"), 600);
    show();
    done();
  }, wait));
}

// Back out to the arcade. With clear = true, forget this course.
function exitGame(clear = false) {
  loadCtl?.abort();
  resetScreens();
  $("game").hidden = true;
  if (clear) {
    game = null;
    persistGame();
  }
  setScreen(game ? "PAUSED" : "INSERT<br />SYLLABUS");
  updateResume();
  const landing = $("landing");
  landing.hidden = false;
  window.scrollTo(0, 0);
  if (reducedMotion()) return;
  // Start zoomed in on the screen, then pull back out to the whole arcade.
  const z = zoomTransform();
  landing.style.transformOrigin = z.origin;
  landing.style.transform = z.transform;
  landing.getBoundingClientRect(); // apply the zoomed-in state before animating out of it
  landing.classList.add("unzooming");
  Sound.play("unwhoosh");
  landing.style.transform = "";
  setTimeout(() => landing.classList.remove("unzooming"), ZOOM_MS);
}

$("exit").addEventListener("click", () => Arcade.openMenu()); // the trail's < MENU button

// ---------- start ----------

$("landing-sound").addEventListener("click", toggleSound);

// The study timer on the landing page opens in a small window.
function openTimerModal() {
  $("timer-modal").hidden = false;
  StudyTimer.render();
  $("timer-close").focus();
}
function closeTimerModal() {
  $("timer-modal").hidden = true;
  $("landing-timer").focus();
}
$("landing-timer").addEventListener("click", openTimerModal);
$("timer-close").addEventListener("click", closeTimerModal);
$("timer-modal").addEventListener("click", (e) => { if (e.target === $("timer-modal")) closeTimerModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("timer-modal").hidden) closeTimerModal(); });
syncSound();
game = loadGame();
updateResume();
updateStart();
