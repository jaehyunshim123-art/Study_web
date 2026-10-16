// The arcade landing page: upload a syllabus, build the route with the AI,
// then zoom into the cabinet's screen where the game (game.js) runs.
// The game is saved in the browser (localStorage) so you can come back to it.

const SAVE_KEY = "syllabus-quest-game";
let pdfData = null;
let busy = false;

// ---------- saving ----------

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    return data?.trail?.units?.length ? data : null;
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
    trail: { courseTitle: trail.courseTitle, units: trail.units },
    demo: Boolean(trail.demo),
    syllabus: syllabus.slice(0, 20000), // sent along when asking for questions
    banks: {}, // questions per unit
    levels: {},
    unit: 0, legMiles: 0, queue: [],
    coins: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, finished: false,
  };
}

// Same course, same questions, fresh run.
function restartGame() {
  Object.assign(game, { levels: {}, unit: 0, legMiles: 0, queue: [], coins: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, finished: false });
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

$("start").addEventListener("click", async () => {
  busy = true;
  updateStart();
  setStatus("Reading your syllabus and mapping the route. This can take a minute.");
  setScreen("LOADING", true);
  try {
    const res = await fetch("/api/trail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syllabus: $("syllabus").value, pdf: pdfData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    game = newGame(data, data.syllabusText || $("syllabus").value);
    persistGame();
    setStatus("Writing the first questions...");
    await questionsFor(0).catch(() => {}); // the game screen shows any error with a retry
    setStatus("");
    enterMachine();
  } catch (err) {
    setStatus(err.message || "Something went wrong. Try again.", true);
    setScreen("INSERT<br />SYLLABUS");
  } finally {
    busy = false;
    updateStart();
  }
});

$("resume").addEventListener("click", enterMachine);

function updateResume() {
  $("resume").hidden = !game;
  if (game) $("resume").textContent = `Continue ${game.trail.courseTitle}`;
}

// ---------- the zoom into (and out of) the arcade screen ----------

const ZOOM_MS = 1100;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The transform that makes the cabinet's screen fill the window.
function zoomTransform() {
  const landing = $("landing").getBoundingClientRect();
  const screen = $("cabinet-screen").getBoundingClientRect();
  const scale = Math.max(innerWidth / screen.width, innerHeight / screen.height) * 1.02;
  const sx = screen.left + screen.width / 2;
  const sy = screen.top + screen.height / 2;
  return {
    origin: `${sx - landing.left}px ${sy - landing.top}px`,
    transform: `translate(${innerWidth / 2 - sx}px, ${innerHeight / 2 - sy}px) scale(${scale})`,
  };
}

function enterMachine() {
  if (!game) return;
  const landing = $("landing");
  setScreen("PRESS<br />START");
  const wait = reducedMotion() ? 0 : ZOOM_MS;
  if (wait) {
    const z = zoomTransform();
    landing.style.transformOrigin = z.origin;
    landing.classList.add("zooming");
    requestAnimationFrame(() => (landing.style.transform = z.transform));
  }
  setTimeout(() => {
    landing.hidden = true;
    landing.classList.remove("zooming");
    landing.style.transform = "";
    $("game").hidden = false;
    $("game").classList.add("entering");
    setTimeout(() => $("game").classList.remove("entering"), 600);
    startGame();
  }, wait);
}

// Back out to the arcade. With clear = true, forget this course.
function exitGame(clear = false) {
  $("shop").hidden = true;
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
  landing.style.transform = "";
  setTimeout(() => landing.classList.remove("unzooming"), ZOOM_MS);
}

$("exit").addEventListener("click", () => exitGame());

// ---------- start ----------

game = loadGame();
updateResume();
updateStart();
