// The game on the arcade screen.
// Answer questions written from your syllabus. A right answer earns coins (more on a streak) and moves
// the wagon forward; a wrong one costs a few coins and the question comes back soon. Each unit is one
// leg of the journey, ending at a landmark; reach the last one to win. Spend coins in the shop.

const LEG_MILES = 100; // length of each unit's leg
const BATCH = 10;      // questions fetched per unit

// The shop. values[level] is what you get at that level; costs[level] is the price of the next one.
const UPGRADES = [
  { id: "earnings", name: "Earnings", desc: "Coins for each right answer", values: [10, 20, 40, 80, 150], costs: [60, 200, 600, 1500], unit: "coins" },
  { id: "streak", name: "Streak bonus", desc: "Extra coins for every answer in a row", values: [0, 5, 10, 20, 40], costs: [40, 150, 500, 1200], unit: "per streak" },
  { id: "oxen", name: "Stronger oxen", desc: "Miles the wagon moves per right answer", values: [10, 15, 20, 30, 40], costs: [80, 250, 700, 1800], unit: "miles" },
];

const $ = (id) => document.getElementById(id);
let game = null;        // the saved game (see newGame in app.js)
let current = null;     // index of the question on screen
let answering = false;  // a question is waiting for an answer
const pending = {};     // question batches being fetched, by unit

const upgradeLevel = (id) => game.levels[id] || 0;
const upgradeValue = (id) => UPGRADES.find((u) => u.id === id).values[upgradeLevel(id)];
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

// ---------- questions ----------

function questionsFor(unit) {
  if (game.banks[unit]?.length) return Promise.resolve(game.banks[unit]);
  pending[unit] ||= fetchQuestions(unit).finally(() => delete pending[unit]);
  return pending[unit];
}

async function fetchQuestions(unit) {
  const u = game.trail.units[unit];
  const res = await fetch("/api/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course: game.trail.courseTitle, topic: u.topic, concepts: u.keyConcepts, syllabus: game.syllabus, unit, count: BATCH, demo: game.demo }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  if (!data.questions?.length) throw new Error("No questions came back. Try again.");
  game.banks[unit] = data.questions;
  persistGame();
  return data.questions;
}

async function showNext() {
  const unit = game.unit;
  if (!game.banks[unit]?.length) {
    renderMessage("", "LOADING QUESTIONS", "Writing questions about " + game.trail.units[unit].topic + ".", [], true);
    try {
      await questionsFor(unit);
    } catch (err) {
      renderMessage("", "SOMETHING WENT WRONG", err.message || "Couldn't load questions.", [["TRY AGAIN", showNext], ["EXIT", () => exitGame(), "ghost"]]);
      return;
    }
    if (game.unit !== unit) return;
  }
  const bank = game.banks[unit];
  if (!game.queue.length) game.queue = shuffle(bank.map((_, i) => i).filter((i) => i !== current));
  current = game.queue.shift();
  renderQuestion(bank[current]);
}

function renderQuestion(q) {
  answering = true;
  const units = game.trail.units;
  $("play").innerHTML = `
    <div class="card">
      <p class="q-count">UNIT ${game.unit + 1} OF ${units.length}${game.streak > 1 ? ` &middot; STREAK x${game.streak}` : ""}</p>
      <p class="q-text">${escapeHTML(q.question)}</p>
      <div class="answers">${q.choices.map((c, i) => `<button class="answer" data-i="${i}"><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(c)}</span></button>`).join("")}</div>
      <div class="feedback" id="feedback"></div>
    </div>`;
  $("play").querySelectorAll(".answer").forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.i))));
}

function answer(picked) {
  if (!answering) return;
  answering = false;
  const q = game.banks[game.unit][current];
  const right = picked === q.answerIndex;
  $("play").querySelectorAll(".answer").forEach((b, i) => {
    b.disabled = true;
    b.classList.add(i === q.answerIndex ? "right" : i === picked ? "wrong" : "dim");
  });

  game.answered++;
  const feedback = $("feedback");
  if (right) {
    game.correct++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    const earned = upgradeValue("earnings") + upgradeValue("streak") * Math.min(game.streak - 1, 10);
    const miles = upgradeValue("oxen");
    game.coins += earned;
    game.legMiles = Math.min(LEG_MILES, game.legMiles + miles);
    feedback.innerHTML = `<span class="gain">+${earned} COINS</span><span class="gain">+${miles} MI</span>`;
  } else {
    game.streak = 0;
    const lost = Math.min(game.coins, Math.round(upgradeValue("earnings") / 2));
    game.coins -= lost;
    game.queue.splice(2, 0, current); // see it again soon
    feedback.innerHTML = `<span class="loss">${lost ? `-${lost} COINS` : "STREAK LOST"}</span><p class="why">${escapeHTML(q.explanation)}</p>`;
  }
  persistGame();
  renderHUD(right);
  drawScene();

  const arrived = game.legMiles >= LEG_MILES;
  // Start fetching the next unit's questions before the wagon gets there.
  if (game.legMiles >= 60 && game.unit + 1 < game.trail.units.length) questionsFor(game.unit + 1).catch(() => {});

  const next = arrived ? arrive : showNext;
  if (right) {
    setTimeout(next, 1100);
  } else {
    const b = document.createElement("button");
    b.className = "btn-next";
    b.textContent = "CONTINUE";
    b.addEventListener("click", next);
    feedback.append(b);
    b.focus();
  }
}

function arrive() {
  const units = game.trail.units;
  const reached = units[game.unit];
  game.unit++;
  game.legMiles = 0;
  game.queue = [];
  if (game.unit >= units.length) {
    game.finished = true;
    persistGame();
    return renderWin();
  }
  persistGame();
  const next = units[game.unit];
  renderMessage("", `YOU REACHED ${reached.name.toUpperCase()}`,
    `Unit ${game.unit} complete. Next stop: ${next.name}, covering ${next.topic}.`,
    [["CONTINUE", () => { drawScene(); renderHUD(); showNext(); }]]);
}

function renderWin() {
  drawScene();
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
      <button class="btn-next" id="again">PLAY AGAIN</button>
      <button class="btn-ghost" id="new-course">NEW SYLLABUS</button>
    </div>`;
  $("again").addEventListener("click", () => {
    restartGame();
    renderHUD();
    drawScene();
    showNext();
  });
  $("new-course").addEventListener("click", () => exitGame(true));
}

// A centered message card. buttons = [[label, onClick, "ghost"?], ...]
function renderMessage(_, title, text, buttons = [], loading = false) {
  answering = false;
  $("play").innerHTML = `<div class="card message"><h2 class="${loading ? "loading-dots" : ""}">${escapeHTML(title)}</h2><p>${escapeHTML(text)}</p></div>`;
  const card = $("play").firstElementChild;
  for (const [label, onClick, kind] of buttons) {
    const b = document.createElement("button");
    b.className = kind === "ghost" ? "btn-ghost" : "btn-next";
    b.textContent = label;
    b.addEventListener("click", onClick);
    card.append(b);
  }
  card.querySelector("button")?.focus();
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
  $("leg-unit").textContent = `Unit ${unit + 1}: ${units[unit].topic}`;
  $("leg-miles").textContent = `${miles} / ${LEG_MILES} mi`;
}

const px = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

function fort(x, flag) {
  return px(x - 7, 50, 15, 16, "#b07a4a") + px(x - 8, 48, 17, 3, "#6e4a2b") + px(x - 2, 58, 4, 8, "#4a3020") +
    px(x - 7, 46, 3, 3, "#b07a4a") + px(x + 5, 46, 3, 3, "#b07a4a") + px(x, 34, 1, 14, "#6e4a2b") + px(x + 1, 34, 7, 5, flag);
}

function wagon() {
  return px(-11, 49, 14, 2, "#fff") + px(-12, 51, 16, 8, "#fbfaf6") + px(-12, 51, 1, 8, "#111418") + px(3, 51, 1, 8, "#111418") +
    px(-11, 48, 14, 1, "#111418") + px(-13, 59, 18, 4, "#8a5a32") +
    px(-12, 62, 5, 5, "#111418") + px(-1, 62, 5, 5, "#111418") + px(-11, 63, 3, 3, "#c9a27a") + px(0, 63, 3, 3, "#c9a27a") +
    px(5, 60, 3, 1, "#6e4a2b") + px(8, 56, 9, 6, "#7a4a1e") + px(16, 54, 4, 5, "#7a4a1e") + px(9, 62, 2, 5, "#5a3a1a") + px(14, 62, 2, 5, "#5a3a1a");
}

let lastWagon = null;

function drawScene() {
  const units = game.trail.units;
  const unit = Math.min(game.unit, units.length - 1);
  const miles = game.finished ? LEG_MILES : game.legMiles;
  const x = Math.round(44 + (226 * miles) / LEG_MILES);

  let s = px(0, 0, 320, 90, "#e9f3fb");
  s += px(40, 14, 22, 5, "#fff") + px(46, 10, 12, 4, "#fff") + px(180, 20, 28, 5, "#fff") + px(188, 16, 14, 4, "#fff");
  s += px(270, 10, 12, 12, "#ffc94d");
  for (let i = 0; i < 6; i++) s += px(i * 60 - 10, 44 - (i % 3) * 4, 80, 30, "#d3e7c6"); // far hills
  s += px(0, 62, 320, 28, "#a9d39a") + px(0, 62, 320, 2, "#93c585");
  s += px(0, 66, 320, 5, "#e5d3ae");
  for (let gx = 8; gx < 320; gx += 26) s += px(gx, 76 + ((gx * 7) % 8), 3, 2, "#93c585");
  s += unit === 0 && !game.finished ? px(22, 50, 2, 16, "#6e4a2b") + px(16, 48, 14, 6, "#e5d3ae") : fort(24, "#3b6fe0");
  s += fort(292, game.finished ? "#1f9d55" : "#ff4d2e");
  s += `<g id="wagon" class="wagon">${wagon()}</g>`;
  $("scene").innerHTML = `<svg viewBox="0 0 320 90" shape-rendering="crispEdges" role="img" aria-label="Your wagon, ${miles} of ${LEG_MILES} miles toward ${units[unit].name}">${s}</svg>`;

  // roll the wagon from where it was to where it is now
  const el = $("wagon");
  el.style.transform = `translateX(${lastWagon !== null && lastWagon <= x ? lastWagon : x}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transform = `translateX(${x}px)`)));
  lastWagon = x;
}

// ---------- shop ----------

function openShop() {
  renderShop();
  $("shop").hidden = false;
  $("shop-close").focus();
}

function closeShop() {
  $("shop").hidden = true;
  $("shop-btn").focus();
}

function renderShop() {
  $("shop-coins").textContent = `${game.coins} COINS`;
  $("shop-list").replaceChildren(...UPGRADES.map((u) => {
    const lvl = upgradeLevel(u.id);
    const maxed = lvl >= u.costs.length;
    const el = document.createElement("div");
    el.className = "upgrade";
    el.innerHTML = `
      <h3>${u.name}</h3>
      <p>${u.desc}: <b>${u.values[lvl]} ${u.unit}</b>${maxed ? "" : ` &rarr; ${u.values[lvl + 1]}`}</p>
      <div class="pips">${u.values.map((_, i) => `<i class="${i <= lvl ? "on" : ""}"></i>`).join("")}</div>`;
    const buy = document.createElement("button");
    buy.textContent = maxed ? "MAX" : `${u.costs[lvl]}`;
    buy.setAttribute("aria-label", maxed ? `${u.name} is maxed out` : `Buy ${u.name} for ${u.costs[lvl]} coins`);
    buy.disabled = maxed || game.coins < u.costs[lvl];
    buy.addEventListener("click", () => {
      game.coins -= u.costs[lvl];
      game.levels[u.id] = lvl + 1;
      persistGame();
      renderShop();
      renderHUD();
      toast(`${u.name.toUpperCase()} UPGRADED: ${u.values[lvl + 1]} ${u.unit.toUpperCase()}`);
    });
    el.append(buy);
    return el;
  }));
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

// ---------- start ----------

function startGame() {
  lastWagon = null;
  shownCoins = null;
  renderHUD();
  drawScene();
  if (game.finished) renderWin();
  else showNext();
}

$("shop-btn").addEventListener("click", openShop);
$("shop-close").addEventListener("click", closeShop);
$("shop").addEventListener("click", (e) => { if (e.target === $("shop")) closeShop(); });

// Keyboard: 1-4 or A-D to answer, Escape closes the shop.
document.addEventListener("keydown", (e) => {
  if ($("game").hidden) return;
  if (e.key === "Escape" && !$("shop").hidden) return closeShop();
  if (!answering || !$("shop").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const i = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  if (i >= 0 && e.key.length === 1) answer(i);
});
