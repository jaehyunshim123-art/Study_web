// The game inside the machine.
// Each unit of the course is one leg of a wagon journey through a world that fits the subject
// (a courthouse district for law, a lab campus for science...). A unit starts with a short lesson,
// then questions written from your syllabus. BYTE, the AI helper under each question, gives hints
// and explains mistakes. Right answers earn coins and move the wagon; reach the last landmark to win.
// The general store grows out of the trail window; How to Play slides in as its own screen.
// The four arcade buttons under the screen answer A-D (keys 1-4 or A-D work too).

const LEG_MILES = 100; // length of each unit's leg
const FIRST_BATCH = 15;      // questions that come with the lesson, so play can start quickly
const MORE_BATCH = 20;       // questions per follow-up batch, fetched in the background
const TARGET_QUESTIONS = 50; // keep adding batches until a unit has this many

// Shop upgrades. values[level] is what you get at that level; costs[level] is the price of the next one.
const UPGRADES = [
  { id: "earnings", name: "Earnings", desc: "Coins for each right answer", values: [10, 20, 40, 80, 150], costs: [60, 200, 600, 1500], unit: "coins" },
  { id: "streak", name: "Streak bonus", desc: "Extra coins for every answer in a row", values: [0, 5, 10, 20, 40], costs: [40, 150, 500, 1200], unit: "per streak" },
  { id: "oxen", name: "Stronger oxen", desc: "Miles the wagon moves per right answer", values: [10, 15, 20, 30, 40], costs: [80, 250, 700, 1800], unit: "miles" },
];

// Wagon paint jobs (just for looks).
const PAINTS = [
  { id: "canvas", name: "Canvas", color: "#fbfaf6", cost: 0 },
  { id: "red", name: "Barn red", color: "#e5484d", cost: 80 },
  { id: "blue", name: "River blue", color: "#6b9cf0", cost: 80 },
  { id: "gold", name: "Gold rush", color: "#ffc94d", cost: 250 },
];

const BOT = {
  start: ["You've got this!", "Think back to the lesson.", "Read every choice before you pick.", "Stuck? Tap HINT. A hint halves the coins for this question."],
  right: ["Correct!", "Nailed it!", "That's right!", "Great job!"],
  lesson: "Read this first. Press A when you're ready for questions!",
};

const KEEPER = {
  bought: ["Pleasure doing business!", "Fine choice.", "That'll serve you well on the trail."],
  paint: "Looking sharp! Your wagon's freshly painted.",
  poor: (n) => `You'll need ${n} more coins for that. Answer a few more questions!`,
};

// Each subject gets its own store: the sign, the shopkeeper's lines, and what the upgrades are called.
const SHOPS = {
  frontier: { sign: "GENERAL STORE", hello: ["Howdy, traveler! Upgrades make the trail go faster.", "Fresh stock today. Spend those coins wisely!"],
    earnings: ["Saddlebags", "Coins for each right answer"], streak: ["Lucky horseshoe", "Extra coins for every answer in a row"] },
  law: { sign: "LAW BOOKSHOP", hello: ["Order in the shop! Every good case needs good supplies.", "Counsel, welcome. Shall we review the evidence... I mean, the prices?"],
    earnings: ["Billable hours", "Coins for each right answer"], streak: ["Winning record", "Extra coins for every case won in a row"] },
  science: { sign: "LAB SUPPLY", hello: ["Welcome to the lab! Goggles on, coins out.", "Hypothesis: you need an upgrade. Let's test it."],
    earnings: ["Research grant", "Coins for each right answer"], streak: ["Chain reaction", "Extra coins for every answer in a row"] },
  math: { sign: "COUNTING HOUSE", hello: ["Welcome! Everything here adds up.", "Do the math: upgrades now, faster miles later."],
    earnings: ["Compound interest", "Coins for each right answer"], streak: ["Proof by induction", "Extra coins for every answer in a row"] },
  literature: { sign: "BOOKSHOP", hello: ["Welcome, reader! Every journey needs a good chapter two.", "Ah, a fellow traveler of the page. Browse a while."],
    earnings: ["Royalties", "Coins for each right answer"], streak: ["Page turner", "Extra coins for every answer in a row"] },
  tech: { sign: "PARTS SHOP", hello: ["Welcome! Fresh hardware, fully patched.", "Running slow? Nothing a good upgrade can't fix."],
    earnings: ["Overclock", "Coins for each right answer"], streak: ["Combo multiplier", "Extra coins for every answer in a row"] },
  health: { sign: "PHARMACY", hello: ["Welcome in! Doctor's orders: keep studying.", "Here for a checkup? Your wagon could use one."],
    earnings: ["Daily vitamins", "Coins for each right answer"], streak: ["Healthy habit", "Extra coins for every answer in a row"] },
  business: { sign: "TRADING POST", hello: ["Welcome! Let's talk return on investment.", "Buy low, study high. What'll it be?"],
    earnings: ["Dividends", "Coins for each right answer"], streak: ["Bull run", "Extra coins for every answer in a row"] },
};
const shopText = () => SHOPS[game.trail.theme] || SHOPS.frontier;
const storeArt = (mood) => storeSVG(mood, game.trail.theme);
const upgradeLabel = (u) => (shopText()[u.id] || [u.name, u.desc]);

// The shopkeeper's greeting: a line for this subject, or one about the unit you're studying.
function keeperWelcome() {
  const unit = game.trail.units[game.unit];
  const concept = unit && pick(unit.keyConcepts.length ? unit.keyConcepts : [unit.topic]);
  const lines = [...shopText().hello];
  if (unit) lines.push(`Headed for ${unit.name}? Brush up on ${concept} before you get there.`, `Studying ${unit.topic}? Smart upgrades make the miles go faster.`);
  return pick(lines);
}

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
let game = null;        // the saved game (see newGame in app.js)
let current = null;     // index of the question on screen
let answering = false;  // a question is waiting for an answer
let hintUsed = false;   // the player asked BYTE for a hint on this question
const pending = {};     // units being fetched
let loadSignal = null;  // while the course is loading: cancels the first unit if you leave

const upgradeLevel = (id) => game.levels[id] || 0;
const upgradeValue = (id) => UPGRADES.find((u) => u.id === id).values[upgradeLevel(id)];
// A wrong answer costs 1 coin on an easy question and 2 on a hard one.
const penalty = (q) => (q.difficulty === "hard" ? 2 : 1);
const paintColor = () => (PAINTS.find((p) => p.id === game.paint) || PAINTS[0]).color;
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

// ---------- a unit's lesson and questions ----------

function questionsFor(unit) {
  if (game.banks[unit]?.length) return Promise.resolve(game.banks[unit]);
  pending[unit] ||= fetchUnit(unit).finally(() => delete pending[unit]);
  return pending[unit];
}

async function fetchUnit(unit) {
  const thisGame = game;
  const u = thisGame.trail.units[unit];
  const res = await fetch("/api/unit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course: thisGame.trail.courseTitle, topic: u.topic, concepts: u.keyConcepts, syllabus: thisGame.syllabus, unit, count: FIRST_BATCH, demo: thisGame.demo }),
    signal: loadSignal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  if (!data.questions?.length) throw new Error("No questions came back. Try again.");
  thisGame.lessons[unit] = data.lesson || null;
  thisGame.banks[unit] = data.questions;
  persistGame();
  return data.questions;
}

const sameQuestion = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const filling = {}; // units being topped up

// Keep asking for more questions in the background until the unit has TARGET_QUESTIONS,
// so there are always fresh ones (especially after wrong answers). Repeats are dropped.
async function fillBank(unit) {
  if (filling[unit] || game.demo) return;
  filling[unit] = true;
  const thisGame = game;
  try {
    for (let tries = 0; tries < 8 && thisGame === game; tries++) {
      const bank = game.banks[unit];
      if (!bank || bank.length >= TARGET_QUESTIONS) break;
      const u = game.trail.units[unit];
      const res = await fetch("/api/unit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: game.trail.courseTitle, topic: u.topic, concepts: u.keyConcepts, syllabus: game.syllabus, unit,
          more: true, count: Math.min(MORE_BATCH, TARGET_QUESTIONS - bank.length + 5), avoid: bank.map((q) => q.question),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || thisGame !== game) break;
      const known = new Set(bank.map((q) => sameQuestion(q.question)));
      const fresh = (data.questions || []).filter((q) => {
        const key = sameQuestion(q.question);
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      if (!fresh.length) continue;
      const start = bank.length;
      bank.push(...fresh);
      // New questions join the current unit's shuffle right away.
      if (game.unit === unit) game.queue.push(...shuffle(fresh.map((_, i) => start + i)));
      persistGame();
    }
  } catch {
    // Offline or the AI is busy: play continues with the questions already here.
  } finally {
    filling[unit] = false;
  }
}

// Start (or resume) the current unit: lesson first, then questions.
async function startUnit() {
  const unit = game.unit;
  if (!game.banks[unit]?.length) {
    renderMessage("LOADING THE LESSON", `Writing a lesson and questions about ${game.trail.units[unit].topic}.`, [], true);
    try {
      await questionsFor(unit);
    } catch (err) {
      renderMessage("SOMETHING WENT WRONG", err.message || "Couldn't load this unit.", [["TRY AGAIN", startUnit], ["EXIT", () => exitGame(), "ghost"]]);
      return;
    }
    if (game.unit !== unit) return;
  }
  fillBank(unit);
  if (!game.lessonSeen[unit] && game.lessons[unit]) renderLesson(false);
  else showNext();
}

function renderLesson(review) {
  answering = false;
  const unit = game.unit;
  const u = game.trail.units[unit];
  const lesson = game.lessons[unit];
  $("play").innerHTML = `
    <article class="card lesson">
      <p class="eyebrow-px">UNIT ${unit + 1} OF ${game.trail.units.length} &middot; LESSON</p>
      <h2>${escapeHTML(u.topic)}</h2>
      <p class="overview">${escapeHTML(lesson.overview)}</p>
      ${lesson.keyPoints.length ? `<h3>KEY POINTS</h3><ul>${lesson.keyPoints.map((p) => `<li>${escapeHTML(p)}</li>`).join("")}</ul>` : ""}
      ${lesson.keyTerms.length ? `<h3>KEY TERMS</h3><dl class="terms">${lesson.keyTerms.map((t) => `<div><dt>${escapeHTML(t.term)}</dt><dd>${escapeHTML(t.definition)}</dd></div>`).join("")}</dl>` : ""}
      <button class="btn-next" id="lesson-go">${review ? "BACK TO THE QUESTION" : "START THE QUESTIONS"}<span class="hint" aria-hidden="true">A</span></button>
      ${helperHTML(false)}
    </article>`;
  $("view-play").scrollTop = 0;
  botSay(review ? "Take another look, then head back to the question." : BOT.lesson, "talk");
  $("lesson-go").addEventListener("click", () => {
    if (review) return renderQuestion(game.banks[game.unit][current], true);
    game.lessonSeen[unit] = true;
    persistGame();
    showNext();
  });
}

// ---------- BYTE, the AI helper ----------

function helperHTML(withHint) {
  return `<div class="helper">
    <div class="bot" id="bot"></div>
    <p class="bubble" id="bot-say"></p>
    ${withHint ? `<button class="hint-btn" id="hint" title="A hint halves the coins for this question">HINT</button>` : ""}
  </div>`;
}

let typing;
// Show a line from BYTE, typed out like an old game.
function botSay(text, mood = "idle") {
  const bot = $("bot");
  const say = $("bot-say");
  if (!bot || !say) return;
  bot.innerHTML = botSVG(mood === "talk" ? "talk" : mood);
  bot.className = `bot ${mood}`;
  clearInterval(typing);
  if (reducedMotion()) {
    say.textContent = text;
  } else {
    let i = 0;
    say.textContent = "";
    typing = setInterval(() => {
      i += 2;
      say.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typing);
        if (mood === "talk" && $("bot")) $("bot").innerHTML = botSVG("idle");
      }
    }, 18);
  }
  Sound.play("blip");
}

// ---------- questions ----------

function showNext() {
  const bank = game.banks[game.unit];
  if (!game.queue.length) game.queue = shuffle(bank.map((_, i) => i).filter((i) => i !== current));
  current = game.queue.shift();
  renderQuestion(bank[current]);
}

function renderQuestion(q, returning = false) {
  answering = true;
  if (!returning) hintUsed = false;
  const units = game.trail.units;
  $("play").innerHTML = `
    <div class="card qcard">
      <div class="q-top">
        <span class="diff ${q.difficulty === "hard" ? "hard" : "easy"}" title="A wrong answer costs ${penalty(q)} coin${penalty(q) > 1 ? "s" : ""}">${q.difficulty === "hard" ? "HARD" : "EASY"} -${penalty(q)}</span>
        <p class="q-count">UNIT ${game.unit + 1}/${units.length}<span class="q-total"> &middot; ${game.banks[game.unit].length} QUESTIONS${game.streak > 1 ? ` &middot; STREAK x${game.streak}` : ""}</span></p>
        ${game.lessons[game.unit] ? `<button class="link-btn" id="review" aria-label="Review the lesson"><span class="long">REVIEW </span>LESSON</button>` : ""}
      </div>
      <p class="q-text">${escapeHTML(q.question)}</p>
      <div class="answers">${q.choices.map((c, i) => `<button class="answer" data-i="${i}"><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(c)}</span></button>`).join("")}</div>
      <div class="feedback" id="feedback"></div>
      ${helperHTML(true)}
    </div>`;
  $("play").querySelectorAll(".answer").forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.i))));
  $("review")?.addEventListener("click", () => renderLesson(true));
  $("hint").addEventListener("click", useHint);
  if (hintUsed) {
    $("hint").disabled = true;
    botSay(`Hint: ${q.hint || "Rule out the answers you're sure are wrong."}`, "think");
  } else if (game.answered === 0) botSay(BOT.start[3], "talk");
  else if (game.streak >= 3) botSay(`Streak x${game.streak}! Keep it going!`, "happy");
  else botSay(pick(BOT.start.slice(0, 3)), "talk");
}

function useHint() {
  if (!answering || hintUsed) return;
  hintUsed = true;
  $("hint").disabled = true;
  const q = game.banks[game.unit][current];
  botSay(`Hint: ${q.hint || "Rule out the answers you're sure are wrong."}`, "think");
}

function answer(picked) {
  if (!answering) return;
  answering = false;
  clearInterval(typing);
  const q = game.banks[game.unit][current];
  const right = picked === q.answerIndex;
  $("play").querySelectorAll(".answer").forEach((b, i) => {
    b.disabled = true;
    b.classList.add(i === q.answerIndex ? "right" : i === picked ? "wrong" : "dim");
  });
  $("review")?.remove();
  $("hint")?.remove();

  game.answered++;
  const feedback = $("feedback");
  if (right) {
    game.correct++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    let earned = upgradeValue("earnings") + upgradeValue("streak") * Math.min(game.streak - 1, 10);
    if (hintUsed) earned = Math.ceil(earned / 2);
    const miles = upgradeValue("oxen");
    game.coins += earned;
    game.legMiles = Math.min(LEG_MILES, game.legMiles + miles);
    feedback.innerHTML = `<span class="gain">+${earned} COINS</span><span class="gain">+${miles} MI</span>`;
    Sound.play("right");
    setTimeout(() => Sound.play("coindrop"), 260);
    botSay(pick(BOT.right) + (hintUsed ? " (Half coins for the hint.)" : ""), "happy");
  } else {
    game.streak = 0;
    const lost = Math.min(game.coins, penalty(q));
    game.coins -= lost;
    game.queue.splice(2, 0, current); // see it again soon
    feedback.innerHTML = `<span class="loss">${lost ? `-${lost} COINS` : "STREAK LOST"}</span>`;
    Sound.play("wrong");
    botSay(`Not quite. ${q.explanation}`, "sad");
  }
  persistGame();
  renderHUD(right);
  drawScene();

  const arrived = game.legMiles >= LEG_MILES;
  // Start fetching the next unit before the wagon gets there.
  if (game.legMiles >= 60 && game.unit + 1 < game.trail.units.length) questionsFor(game.unit + 1).catch(() => {});

  const next = arrived ? arrive : showNext;
  if (right) {
    setTimeout(() => { if (!$("game").hidden && !answering && !Arcade.isOpen() && !Arcade.isPaused()) next(); }, 1300);
  } else {
    const b = document.createElement("button");
    b.className = "btn-next";
    b.innerHTML = `CONTINUE<span class="hint" aria-hidden="true">A</span>`;
    b.addEventListener("click", next);
    feedback.append(b);
    b.focus({ preventScroll: true });
  }
}

function arrive() {
  const units = game.trail.units;
  const reached = units[game.unit];
  game.unit++;
  game.legMiles = 0;
  game.queue = [];
  current = null;
  if (game.unit >= units.length) {
    game.finished = true;
    persistGame();
    return renderWin();
  }
  persistGame();
  Sound.play("arrive");
  const next = units[game.unit];
  renderMessage(`YOU REACHED ${reached.name.toUpperCase()}`,
    `Unit ${game.unit} complete. Next stop: ${next.name}, covering ${next.topic}.`,
    [["NEXT LESSON", () => { drawScene(); renderHUD(); startUnit(); }]]);
}

function renderWin() {
  answering = false;
  drawScene();
  Sound.play("win");
  const accuracy = game.answered ? Math.round((game.correct / game.answered) * 100) : 0;
  $("play").innerHTML = `
    <div class="card message">
      <h2>YOU MADE IT TO THE FINAL EXAM!</h2>
      <p>You finished every unit of ${escapeHTML(game.trail.courseTitle)}.</p>
      <div class="stats">
        <div><b>${game.correct}/${game.answered}</b><span>answered right</span></div>
        <div><b>${accuracy}%</b><span>accuracy</span></div>
        <div><b>${game.bestStreak}</b><span>best streak</span></div>
        <div><b>${game.coins}</b><span>coins</span></div>
      </div>
      <button class="btn-next" id="again">PLAY AGAIN<span class="hint" aria-hidden="true">A</span></button>
      <button class="btn-ghost" id="new-course">NEW SYLLABUS</button>
    </div>`;
  $("again").addEventListener("click", () => {
    restartGame();
    startGame();
  });
  $("new-course").addEventListener("click", () => exitGame(true));
}

// A centered message card. buttons = [[label, onClick, "ghost"?], ...]
function renderMessage(title, text, buttons = [], loading = false) {
  answering = false;
  $("play").innerHTML = `<div class="card message"><h2 class="${loading ? "loading-dots" : ""}">${escapeHTML(title)}</h2><p>${escapeHTML(text)}</p></div>`;
  const card = $("play").firstElementChild;
  buttons.forEach(([label, onClick, kind], i) => {
    const b = document.createElement("button");
    b.className = kind === "ghost" ? "btn-ghost" : "btn-next";
    b.innerHTML = escapeHTML(label) + (i === 0 && kind !== "ghost" ? `<span class="hint" aria-hidden="true">A</span>` : "");
    b.addEventListener("click", onClick);
    card.append(b);
  });
  card.querySelector("button")?.focus({ preventScroll: true });
}

// ---------- the loading screen (while the syllabus is read) ----------

const LOAD_STEPS = ["Reading your syllabus", "Mapping out the units", "Writing the first lesson and questions", "Starting the game"];

// step = index of the step in progress; error = message to show instead of continuing
function renderLoading(step, error = "", onBack = null) {
  answering = false;
  $("view-play").classList.add("bare");
  if (step > 0 && !error) Sound.play("step");
  if (error) Sound.play("deny");
  const pct = Math.round((step / LOAD_STEPS.length) * 100);
  $("play").innerHTML = `
    <div class="card loading">
      <h2>${error ? "LOADING STOPPED" : `LOADING SYLLABUS<span class="loading-dots"></span>`}</h2>
      <div class="load-bar"><div style="width:${error ? pct : Math.max(pct, 6)}%"></div></div>
      <ol class="steps">${LOAD_STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step && !error ? "active" : "";
        return `<li class="${state}"><span class="box">${i < step ? "&#10003;" : ""}</span>${label}</li>`;
      }).join("")}</ol>
      ${error ? `<p class="error">${escapeHTML(error)}</p>` : ""}
    </div>`;
  if (error && onBack) {
    const b = document.createElement("button");
    b.className = "btn-next";
    b.innerHTML = `BACK TO THE ARCADE<span class="hint" aria-hidden="true">A</span>`;
    b.addEventListener("click", onBack);
    $("play").firstElementChild.append(b);
    b.focus();
  }
}

// ---------- HUD, scene and leg progress ----------

let shownCoins = null;

function renderHUD(gained = false) {
  $("coins").textContent = game.coins;
  $("streak").textContent = game.streak;
  if (gained && shownCoins !== null && game.coins > shownCoins) {
    $("coins").classList.remove("bump");
    void $("coins").offsetWidth; // restart the animation
    $("coins").classList.add("bump");
  }
  shownCoins = game.coins;

  const units = game.trail.units;
  const unit = Math.min(game.unit, units.length - 1);
  const miles = game.finished ? LEG_MILES : game.legMiles;
  $("leg-from").textContent = unit === 0 ? "START" : units[unit - 1].name.toUpperCase();
  $("leg-to").textContent = units[unit].name.toUpperCase();
  $("leg-fill").style.width = `${(miles / LEG_MILES) * 100}%`;
  const topic = units[unit].topic;
  $("leg-unit").textContent = /^unit\b/i.test(topic) ? topic : `Unit ${unit + 1}: ${topic}`; // some topics already say "Unit 1"
  $("leg-miles").textContent = `${miles} / ${LEG_MILES} mi`;
}

let lastWagon = null;

function drawScene() {
  const units = game.trail.units;
  const unit = Math.min(game.unit, units.length - 1);
  const miles = game.finished ? LEG_MILES : game.legMiles;
  const x = Math.round(44 + (226 * miles) / LEG_MILES);
  const from = lastWagon !== null && lastWagon <= x ? lastWagon : x;
  $("scene").innerHTML = trailSceneSVG({
    theme: game.trail.theme,
    startSign: unit === 0 && !game.finished,
    reached: game.finished,
    x: from,
    cover: paintColor(),
    label: `Your wagon, ${miles} of ${LEG_MILES} miles toward ${units[unit].name}`,
  });
  // roll the wagon from where it was to where it is now
  const el = $("wagon");
  requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transform = `translateX(${x}px)`)));
  lastWagon = x;
}

// ---------- How to Play and the study timer: slide in beside the game ----------

const VIEWS = ["play", "help", "timer"];
const HELP_SEEN_KEY = "study-helper-help-seen";
let view = "play";
let shopIsOpen = false;
const overlayOpen = () => shopIsOpen || view !== "play"; // anything covering the game

function showView(name, focusId) {
  view = name;
  $("views").style.transform = `translateX(-${VIEWS.indexOf(name) * 100}%)`;
  for (const v of VIEWS) $(`view-${v}`).inert = v !== name;
  $(`view-${name}`).scrollTop = 0;
  if (focusId) setTimeout(() => $(focusId).focus({ preventScroll: true }), 50);
}

// first = shown automatically the first time someone plays
function openHelp(first = false) {
  $("help-intro").textContent = (first ? "Welcome! " : "") +
    "Your syllabus is now a wagon journey. Each unit is one leg of the trail, and the final exam is the finish line.";
  $("help-back").innerHTML = first ? "LET'S GO &gt;" : "&lt; BACK";
  Sound.play("open");
  showView("help", "help-back");
}

function closeHelp() {
  try { localStorage.setItem(HELP_SEEN_KEY, "1"); } catch { /* storage blocked: help shows again next time */ }
  Sound.play("close");
  showView("play", "help-btn");
}

function helpSeen() {
  try { return localStorage.getItem(HELP_SEEN_KEY) === "1"; } catch { return false; }
}

// ---------- the general store: zoom into the trail window, then step inside ----------
// Opening: a copy of the trail window grows into the store's banner while the store fades in
// through it; then the shelves rise into place; then the shopkeeper speaks. Closing runs it backwards.

const STORE_ZOOM_MS = 560;

// A rectangle inside the screen, relative to the screen's top-left corner.
function rectIn(el) {
  const r = el.getBoundingClientRect();
  const screen = document.querySelector(".screen").getBoundingClientRect();
  return { left: r.left - screen.left, top: r.top - screen.top, width: r.width, height: r.height };
}

function placeZoomer(z, r) {
  Object.assign(z.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}

// The store banner's spot, measured with the store laid out but not yet visible.
function bannerRect() {
  const shop = $("shop");
  shop.style.visibility = "hidden";
  shop.hidden = false;
  shop.scrollTop = 0;
  const r = rectIn($("store-scene").querySelector("svg"));
  shop.hidden = true;
  shop.style.visibility = "";
  return r;
}

function makeZoomer(atStore) {
  const z = document.createElement("div");
  z.className = "zoomer" + (atStore ? " store" : "");
  z.innerHTML = `<div class="zoom-trail">${$("scene").innerHTML.replace(' id="wagon"', "")}</div><div class="zoom-store">${storeArt("idle")}</div>`;
  document.querySelector(".screen").append(z);
  return z;
}

let shopTimers = [];
const later = (fn, ms) => shopTimers.push(setTimeout(fn, ms));

function openShop() {
  if (shopIsOpen) return;
  shopIsOpen = true;
  shopTimers.forEach(clearTimeout);
  shopTimers = [];
  document.querySelectorAll(".zoomer").forEach((z) => z.remove());
  renderShop();
  drawStore("idle");
  hideKeeperSpeech();
  $("view-play").inert = true;
  Sound.play("open");

  const shop = $("shop");
  const showStore = () => {
    shop.hidden = false;
    shop.scrollTop = 0;
    $("shop-body").classList.remove("enter");
    void $("shop-body").offsetWidth; // restart the animation
    $("shop-body").classList.add("enter");
  };

  if (reducedMotion()) {
    showStore();
    keeperSay(keeperWelcome());
    $("shop-back").focus({ preventScroll: true });
    return;
  }

  // 1. Zoom: the trail window grows into the store banner, and the store fades in through it.
  const target = bannerRect();
  const z = makeZoomer(false);
  placeZoomer(z, rectIn($("scene")));
  z.getBoundingClientRect(); // start from the window's spot
  z.classList.add("moving", "store");
  placeZoomer(z, target);
  // 2. Inside: show the real store underneath, then let the shelves rise in.
  later(() => {
    showStore();
    z.remove();
  }, STORE_ZOOM_MS);
  // 3. The shopkeeper speaks once everything has settled.
  later(() => {
    keeperSay(keeperWelcome());
    $("shop-back").focus({ preventScroll: true });
  }, STORE_ZOOM_MS + 320);
}

function closeShop() {
  if (!shopIsOpen) return;
  shopIsOpen = false;
  shopTimers.forEach(clearTimeout);
  shopTimers = [];
  Sound.play("close");
  hideKeeperSpeech();
  const shop = $("shop");
  const done = () => {
    $("view-play").inert = false;
    $("shop-btn").focus({ preventScroll: true });
  };

  if (reducedMotion()) {
    shop.hidden = true;
    return done();
  }

  // Run it backwards: the store banner shrinks into the trail window as the trail fades back in.
  // (If the zoom in hasn't finished yet, reverse from wherever it has got to.)
  const midway = document.querySelector(".zoomer");
  let from;
  if (midway) {
    from = rectIn(midway);
    midway.remove();
  } else {
    shop.scrollTop = 0;
    from = rectIn($("store-scene").querySelector("svg"));
  }
  const z = makeZoomer(true);
  placeZoomer(z, from);
  shop.hidden = true;
  z.getBoundingClientRect();
  z.classList.add("moving");
  z.classList.remove("store");
  placeZoomer(z, rectIn($("scene")));
  later(() => {
    z.remove();
    done();
  }, STORE_ZOOM_MS);
}

// Put the game screens back to normal right away (used when leaving the machine).
function resetScreens() {
  Arcade.close();
  shopIsOpen = false;
  shopTimers.forEach(clearTimeout);
  shopTimers = [];
  document.querySelectorAll(".zoomer").forEach((z) => z.remove());
  $("shop").hidden = true;
  $("view-play").inert = false;
  showView("play");
}

function hideKeeperSpeech() {
  clearInterval(keeperTyping);
  $("keeper-say").classList.remove("show");
  $("keeper-say").textContent = "";
}

let keeperTimer, keeperTyping;
function drawStore(mood) {
  $("store-scene").querySelector("svg")?.remove();
  $("store-scene").insertAdjacentHTML("afterbegin", storeArt(mood));
}

// The shopkeeper says something: the bubble pops in and the words type out.
function keeperSay(text, mood = "idle") {
  drawStore(mood);
  const say = $("keeper-say");
  say.classList.add("show");
  clearInterval(keeperTyping);
  if (reducedMotion()) {
    say.textContent = text;
  } else {
    let i = 0;
    say.textContent = "";
    keeperTyping = setInterval(() => {
      i += 2;
      say.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(keeperTyping);
    }, 18);
  }
  Sound.play("blip");
  clearTimeout(keeperTimer);
  if (mood === "happy") keeperTimer = setTimeout(() => drawStore("idle"), 1200);
}

// Try to spend coins; the shopkeeper tells you when you're short.
function spend(cost) {
  if (game.coins >= cost) {
    game.coins -= cost;
    return true;
  }
  Sound.play("deny");
  keeperSay(KEEPER.poor(cost - game.coins));
  return false;
}

function renderShop() {
  $("shop-title").textContent = shopText().sign;
  $("shop-coins").textContent = game.coins;
  $("shop-list").replaceChildren(...UPGRADES.map((u) => {
    const lvl = upgradeLevel(u.id);
    const maxed = lvl >= u.costs.length;
    const [name, desc] = upgradeLabel(u);
    const el = document.createElement("div");
    el.className = "upgrade";
    el.innerHTML = `
      <div class="item-icon">${itemIcon(u.id)}</div>
      <div class="item-text">
        <h3>${name}</h3>
        <p>${desc}: <b>${u.values[lvl]} ${u.unit}</b>${maxed ? "" : ` &rarr; ${u.values[lvl + 1]}`}</p>
        <div class="pips">${u.values.map((_, i) => `<i class="${i <= lvl ? "on" : ""}"></i>`).join("")}</div>
      </div>`;
    const buy = document.createElement("button");
    buy.className = "price" + (!maxed && game.coins < u.costs[lvl] ? " short" : "");
    buy.textContent = maxed ? "MAX" : `${u.costs[lvl]}`;
    buy.setAttribute("aria-label", maxed ? `${name} is maxed out` : `Buy ${name} for ${u.costs[lvl]} coins`);
    buy.disabled = maxed;
    buy.addEventListener("click", () => {
      if (!spend(u.costs[lvl])) return;
      game.levels[u.id] = lvl + 1;
      persistGame();
      Sound.play("buy");
      keeperSay(pick(KEEPER.bought), "happy");
      renderShop();
      renderHUD();
    });
    el.append(buy);
    return el;
  }));

  $("paint-list").replaceChildren(...PAINTS.map((p) => {
    const owned = p.cost === 0 || game.paints.includes(p.id);
    const using = (game.paint || "canvas") === p.id;
    const b = document.createElement("button");
    b.className = "paint" + (using ? " using" : "");
    b.innerHTML = `<span class="paint-pic">${paintIcon(p.color)}</span><span class="paint-name">${p.name}</span>
      <span class="paint-tag ${!owned && game.coins < p.cost ? "short" : ""}">${using ? "IN USE" : owned ? "USE" : p.cost}</span>`;
    b.setAttribute("aria-label", using ? `${p.name} paint, in use` : owned ? `Use ${p.name} paint` : `Buy ${p.name} paint for ${p.cost} coins`);
    b.addEventListener("click", () => {
      if (using) return;
      if (!owned) {
        if (!spend(p.cost)) return;
        game.paints.push(p.id);
      }
      game.paint = p.id;
      persistGame();
      Sound.play("buy");
      keeperSay(KEEPER.paint, "happy");
      renderShop();
      renderHUD();
      drawScene();
    });
    return b;
  }));
}

// A short message at the bottom of the screen (used by the study timer).
let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

// ---------- the arcade controls ----------

let stickTimer;
function wiggleStick(dir) {
  const stick = $("stick");
  stick.classList.remove("left", "right");
  stick.classList.add(dir);
  clearTimeout(stickTimer);
  stickTimer = setTimeout(() => stick.classList.remove("left", "right"), 180);
}

// Pressing button i: answer A-D during a question; otherwise any button presses the screen's main button.
function pressPad(i) {
  const pad = document.querySelector(`.pad[data-i="${i}"]`);
  pad.classList.add("pressed");
  setTimeout(() => pad.classList.remove("pressed"), 120);
  wiggleStick(i < 2 ? "left" : "right");
  Sound.play("press");
  if (Arcade.isOpen()) return Arcade.pad(i);
  if (overlayOpen()) return;
  if (answering) return answer(i);
  $("play").querySelector(".btn-next")?.click();
}

document.querySelectorAll(".pad").forEach((pad) => pad.addEventListener("click", () => pressPad(Number(pad.dataset.i))));

// The joystick's ball is a button: in the arcade games it fires (like Space).
$("stick").addEventListener("click", () => {
  $("stick").classList.add("pushed");
  setTimeout(() => $("stick").classList.remove("pushed"), 140);
  Sound.play("press");
  if (Arcade.isOpen()) Arcade.fire();
});

// The speaker grille on the deck (and the landing page button) turns sound on and off.
function syncSound() {
  const on = !Sound.isMuted();
  $("sound-btn").setAttribute("aria-pressed", String(on));
  $("sound-btn").setAttribute("aria-label", on ? "Sound is on. Press to mute." : "Sound is off. Press to turn it on.");
  $("sound-label").textContent = on ? "SOUND ON" : "SOUND OFF";
  $("sound-btn").classList.toggle("off", !on);
  $("landing-sound").textContent = on ? "Sound on" : "Sound off";
  $("landing-sound").setAttribute("aria-pressed", String(on));
}

function toggleSound() {
  Sound.toggle();
  syncSound();
}

$("sound-btn").addEventListener("click", toggleSound);

// ---------- start ----------

function startGame() {
  $("view-play").classList.remove("bare");
  resetScreens();
  lastWagon = null;
  shownCoins = null;
  renderHUD();
  drawScene();
  if (game.finished) renderWin();
  else startUnit();
  if (!helpSeen()) openHelp(true);
}

$("shop-btn").addEventListener("click", openShop);
$("shop-back").addEventListener("click", closeShop);
$("help-btn").addEventListener("click", () => openHelp());
$("help-back").addEventListener("click", closeHelp);

// The study timer (timer.js) gets its own screen; the LCD on the control panel opens it.
$("game-timer").innerHTML = StudyTimer.panelHTML();
$("landing-timer-panel").innerHTML = StudyTimer.panelHTML();
StudyTimer.render();
function openTimer() {
  if (shopIsOpen) return;
  if (Arcade.isOpen()) Arcade.pause(true); // the timer covers the arcade game for a while
  Sound.play("open");
  showView("timer", "timer-back");
}
function closeTimer() {
  Sound.play("close");
  showView("play", "deck-timer");
  if (Arcade.isPaused()) Arcade.pause(false);
}
$("deck-timer").addEventListener("click", () => (view === "timer" ? closeTimer() : openTimer()));
$("timer-back").addEventListener("click", closeTimer);

// Keyboard: 1-4 or A-D press the arcade buttons, arrows move the joystick, Escape closes the store or help.
document.addEventListener("keydown", (e) => {
  if ($("game").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (Arcade.isOpen() && Arcade.key(e)) return e.preventDefault();
  if (e.key === "Escape") {
    if (shopIsOpen) return closeShop();
    if (view === "help") return closeHelp();
    if (view === "timer") return closeTimer();
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") return wiggleStick(e.key === "ArrowLeft" ? "left" : "right");
  if (overlayOpen() || e.key.length !== 1 || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  const i = "1234".includes(e.key) ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  if (i < 0) return;
  // Letter keys only answer questions; on other screens Enter/Space already press the focused button.
  if (!answering && "abcd".includes(e.key.toLowerCase()) && i !== 0) return;
  e.preventDefault();
  pressPad(i);
});
