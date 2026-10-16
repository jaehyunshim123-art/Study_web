// The trail: an Oregon Trail-style journey on the TRAIL tab.
// Each unit of the course is a leg of the trail. A leg has stops (each one a quiz) and ends with a
// river crossing (a bigger quiz) right before the leg's landmark. Miles traveled = the miles of
// every stop you've cleared. Supplies are your coins; health goes up when you pass and down when you fail.

const START_DATE = new Date(1848, 2, 1); // the journey "starts" March 1, 1848, like the original game
const WEATHER = ["WARM", "COOL", "FAIR", "RAINY", "HOT", "COLD", "WINDY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// A regular stop's quiz, and the three ways to cross a river. Each changes the quiz you take.
const STOP_QUIZ = { count: 4, pass: 0.75, bonus: 1, cost: 0 };
const CROSSINGS = [
  { label: "FORD THE RIVER", detail: "6 questions, need 5 right.", count: 6, pass: 0.8, bonus: 1, cost: 0 },
  { label: "BUILD A RAFT", detail: "8 questions, need 6 right. Earns 1.5x XP.", count: 8, pass: 0.75, bonus: 1.5, cost: 0 },
  { label: "PAY FOR A FERRY", detail: "Costs 30 supplies. 4 questions, need 3 right.", count: 4, pass: 0.75, bonus: 1, cost: 30 },
];

// Random things that can happen after you clear a stop.
const EVENT_CHANCE = 0.35;
const EVENTS = [
  { text: "You found wild berries along the trail.", coins: 8 },
  { text: "A friendly traveler trades you a map.", coins: 12 },
  { text: "Clear skies. The oxen are in good spirits.", health: 10 },
  { text: "You found an abandoned wagon with spare parts.", coins: 15 },
  { text: "A wagon wheel broke. Fixing it costs supplies.", coins: -10 },
  { text: "Heavy rain turns the trail to mud.", health: -10 },
  { text: "A snake spooked the oxen.", health: -5 },
  { text: "You lost the trail for a while, then found it again." },
];

// ---------- trail data ----------

// Every stop in order: [{ id, w, title, detail, xp, river }]
function trailStops() {
  const stops = [];
  save.map.worlds.forEach((world, w) => {
    world.quests.forEach((quest, q) => stops.push({ id: `w${w}-q${q}`, w, title: quest.title, detail: quest.task, xp: quest.xp }));
    stops.push({ id: `w${w}-boss`, w, title: world.boss.name, detail: world.boss.challenge, xp: world.boss.xp, river: true });
  });
  return stops;
}

const nextStop = () => trailStops().find((s) => !save.done[s.id]) || null;
const healthWord = (h) => (h >= 75 ? "GOOD" : h >= 50 ? "FAIR" : h >= 25 ? "POOR" : "VERY POOR");
const changeHealth = (delta) => (save.health = Math.max(0, Math.min(100, save.health + delta)));
const changeSupplies = (delta) => (save.profile.coins = Math.max(0, save.profile.coins + delta));

function trailDate() {
  const days = Math.max(0, Math.round((new Date(dayKey()) - new Date(save.startedOn)) / 86400000));
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + days);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function weather() {
  const key = dayKey();
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return WEATHER[hash % WEATHER.length];
}

// ---------- the trail picture ----------

const X0 = 18, X1 = 302; // where the trail starts and ends in the picture
const rect = (x, y, w, h, fill, cls = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ""}/>`;

// A stepped pixel mountain.
function mountain(x, width, height, color, snow) {
  let out = "";
  for (let step = 0; step < height; step += 4) {
    const w = Math.max(4, width - (step / height) * width);
    out += rect(Math.round(x + (width - w) / 2), 60 - step - 4, Math.round(w), 4, step > height - 9 && snow ? "#f4f4f4" : color);
  }
  return out;
}

function wagonSprite() {
  const look = avatarSVG(save.profile.look).replace("<svg ", '<svg x="21" y="51" width="13" height="21" ');
  return look +
    rect(-11, 55, 14, 2, "#f4f4f4") + rect(-12, 57, 16, 7, "#e8e2cf") + rect(-12, 63, 16, 1, "#b8b09a") +
    rect(-13, 64, 18, 4, "#8b5a2b") +
    rect(-12, 67, 5, 5, "#222", "wheel") + rect(-1, 67, 5, 5, "#222", "wheel") +
    rect(-11, 68, 3, 3, "#8b5a2b") + rect(0, 68, 3, 3, "#8b5a2b") +
    rect(5, 64, 3, 1, "#5a3a1a") +
    rect(8, 61, 9, 6, "#7a4a1e") + rect(16, 59, 4, 5, "#7a4a1e") + rect(19, 58, 1, 2, "#e8e2cf") +
    rect(9, 67, 2, 5, "#5a3a1a") + rect(14, 67, 2, 5, "#5a3a1a");
}

function landmarkX(w) {
  return X0 + ((w + 1) * (X1 - X0)) / save.map.worlds.length;
}

// Where the wagon is: partway along the current leg, by how many of its stops are cleared.
function wagonX() {
  const worlds = save.map.worlds;
  for (const [w, world] of worlds.entries()) {
    const ids = [...world.quests.map((_, q) => `w${w}-q${q}`), `w${w}-boss`];
    const cleared = ids.filter((id) => save.done[id]).length;
    if (cleared < ids.length) {
      const start = w === 0 ? X0 : landmarkX(w - 1) + 6;
      const end = landmarkX(w) - 22; // stop at the riverbank
      return Math.round(start + (end - start) * (cleared / (ids.length - 1 || 1)));
    }
  }
  return X1;
}

function trailSVG() {
  let svg = rect(0, 0, 320, 22, "#1d1a45") + rect(0, 22, 320, 18, "#2b2a63") + rect(0, 40, 320, 20, "#3f3a80");
  svg += rect(258, 10, 12, 12, "#ffd23f") + rect(256, 12, 16, 8, "#ffd23f");
  svg += mountain(10, 70, 30, "#4b4f7a", true) + mountain(70, 60, 22, "#3e4268") + mountain(140, 90, 36, "#4b4f7a", true) +
         mountain(220, 70, 26, "#3e4268") + mountain(270, 60, 32, "#4b4f7a", true);
  svg += rect(0, 60, 320, 36, "#2f6b2a") + rect(0, 60, 320, 2, "#3f8a37");
  svg += rect(0, 71, 320, 3, "#8a6a3a");
  for (let x = 6; x < 320; x += 23) svg += rect(x, 80 + ((x * 7) % 9), 2, 2, "#3f8a37"); // grass tufts

  // start sign
  svg += rect(X0 - 8, 58, 2, 14, "#8b5a2b") + rect(X0 - 12, 58, 10, 5, "#c79a5a");

  save.map.worlds.forEach((_, w) => {
    const lx = Math.round(landmarkX(w));
    const reached = save.done[`w${w}-boss`];
    // river before the landmark
    svg += rect(lx - 15, 60, 8, 36, "#3f7fff") + rect(lx - 13, 64, 2, 4, "#8fd0ff") + rect(lx - 11, 80, 2, 4, "#8fd0ff");
    // fort with a flag
    svg += rect(lx - 4, 60, 9, 11, "#8b5a2b") + rect(lx - 5, 58, 11, 2, "#5a3a1a") + rect(lx - 1, 65, 3, 6, "#3a2410");
    svg += rect(lx, 46, 1, 12, "#ddd") + rect(lx + 1, 46, 6, 4, reached ? "#ffd23f" : "#ff3b3b");
  });

  svg += `<g id="wagon" class="wagon">${wagonSprite()}</g>`;
  return `<svg viewBox="0 0 320 96" shape-rendering="crispEdges" role="img" aria-label="Your wagon on the trail">${svg}</svg>`;
}

let lastWagonX = null;

// Draw the scene, then roll the wagon from where it was to where it is now.
function drawScene() {
  $("trail-scene").innerHTML = trailSVG();
  const wagon = $("wagon");
  const target = wagonX();
  const from = lastWagonX ?? target;
  wagon.style.transform = `translateX(${from}px)`;
  if (from !== target) {
    wagon.classList.add("rolling");
    requestAnimationFrame(() => requestAnimationFrame(() => (wagon.style.transform = `translateX(${target}px)`)));
    setTimeout(() => wagon.classList.remove("rolling"), 1600);
  }
  lastWagonX = target;
}

// ---------- the TRAIL tab ----------

function renderTrail() {
  $("setup").hidden = Boolean(save.map);
  $("journey").hidden = !save.map;
  updateStartButton();
  if (!save.map) return;

  $("course-title").textContent = save.map.courseTitle + (save.map.demo ? " (demo trail)" : "");
  drawScene();

  const stops = trailStops();
  const next = nextStop();
  const total = stops.reduce((sum, s) => sum + s.xp, 0);
  const traveled = stops.filter((s) => save.done[s.id]).reduce((sum, s) => sum + s.xp, 0);
  const leg = next ? save.map.worlds[next.w] : null;
  const toLandmark = next ? stops.filter((s) => s.w === next.w && !save.done[s.id]).reduce((sum, s) => sum + s.xp, 0) : 0;

  const line = (label, value) => `<div><span class="label">${label}</span> ${escapeHTML(value)}</div>`;
  $("trail-status").innerHTML =
    line("DATE:", trailDate()) + line("WEATHER:", weather()) + line("HEALTH:", healthWord(save.health)) +
    line("SUPPLIES:", String(save.profile.coins)) + line("MILES TRAVELED:", `${traveled} OF ${total}`) +
    (leg ? line("NEXT LANDMARK:", `${leg.name}, ${toLandmark} MILES`) : "");

  const nextBox = $("trail-next");
  if (!next) {
    nextBox.innerHTML = `<div class="trail-end">${pixelIcon("crown", 32)}<h2>YOU MADE IT TO THE END OF THE TRAIL!</h2><p>Every stop cleared and every river crossed. Good luck on the final exam.</p></div>`;
  } else {
    nextBox.innerHTML = `
      <h3 class="next-kind">${next.river ? "RIVER AHEAD" : "NEXT STOP"}</h3>
      <p class="next-title">${escapeHTML(next.title)}</p>
      <p class="muted">${escapeHTML(next.detail)}</p>
      <p class="you-may">YOU MAY:</p>`;
    const menu = document.createElement("div");
    menu.className = "menu";
    const options = [
      [next.river ? "CROSS THE RIVER" : "CONTINUE ON THE TRAIL", () => continueTrail()],
      ["ASK THE TRAIL GUIDE", () => openCoach(`${next.title}: ${next.detail}`)],
      ["VISIT THE GENERAL STORE", () => switchTab("avatar")],
    ];
    options.forEach(([label, onClick], i) => {
      const b = document.createElement("button");
      b.className = i === 0 ? "menu-item primary" : "menu-item";
      b.innerHTML = `<span class="num">${i + 1}.</span> ${label}`;
      b.addEventListener("click", onClick);
      menu.append(b);
    });
    nextBox.append(menu);
  }

  // trail log: every leg and its stops
  $("trail-log").innerHTML = save.map.worlds.map((world, w) => {
    const rows = stops.filter((s) => s.w === w).map((s) => {
      const mark = save.done[s.id] ? "[X]" : next?.id === s.id ? "[&gt;]" : "[ ]";
      const cls = save.done[s.id] ? "done" : next?.id === s.id ? "current" : "";
      return `<li class="${cls}${s.river ? " river" : ""}"><span class="mark">${mark}</span><span class="name">${s.river ? "CROSS " : ""}${escapeHTML(s.title)}</span><span class="mi">${s.xp} MI</span></li>`;
    }).join("");
    return `<div class="leg"><h3>LEG ${w + 1}: TO ${escapeHTML(world.name)}</h3><p class="muted">${escapeHTML(world.topic)}</p><ul>${rows}</ul></div>`;
  }).join("");
}

// ---------- moving along ----------

function continueTrail() {
  const stop = nextStop();
  if (!stop) return;
  if (!stop.river) return startQuiz(stop, STOP_QUIZ);

  // River crossing: choose how, like the original game.
  openDialog(`YOU HAVE REACHED ${stop.title}`);
  const body = $("quiz-body");
  body.innerHTML = `<p class="muted">${escapeHTML(stop.detail)}</p><p class="you-may">HOW WILL YOU CROSS?</p>`;
  const list = document.createElement("div");
  list.className = "choices";
  CROSSINGS.forEach((mode, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.disabled = save.profile.coins < mode.cost;
    b.innerHTML = `<span class="letter">${i + 1}.</span><span><b>${mode.label}</b><br>${escapeHTML(mode.detail)}${b.disabled ? " (not enough supplies)" : ""}</span>`;
    b.addEventListener("click", () => {
      if (mode.cost) {
        changeSupplies(-mode.cost);
        persist();
        render();
      }
      startQuiz(stop, mode);
    });
    list.append(b);
  });
  const back = document.createElement("button");
  back.className = "ghost";
  back.textContent = "NOT YET";
  back.addEventListener("click", closeQuiz);
  body.append(list, back);
  list.querySelector("button:not([disabled])")?.focus();
}

// Called by quiz.js when the last question is answered.
function quizFinished({ stop, mode, score, total, needed, passed }) {
  if (passed) {
    if (score === total) save.profile.perfect = true;
    const xp = Math.round(stop.xp * mode.bonus);
    showQuizMessage(stop.river ? "YOU MADE IT ACROSS!" : "STOP CLEARED!", `You got ${score}/${total}.`, [
      [`CONTINUE (+${xp} XP)`, () => {
        changeHealth(10);
        closeQuiz();
        complete(stop.id, xp, stop.title);
        afterStop(stop);
      }],
    ]);
    return;
  }

  // Failed: the trail takes its toll.
  let text = `You got ${score}/${total}. You needed ${needed}.`;
  if (stop.river) {
    changeHealth(-30);
    changeSupplies(-15);
    text += " Your wagon tipped over in the river! You lost 15 supplies.";
  } else {
    changeHealth(-20);
    text += " The trail was rough. Your health dropped.";
  }
  if (save.health <= 0) {
    save.health = 60;
    text += " YOU HAVE DIED OF DYSENTERY. (Just kidding. Rest up, review with the trail guide, and try again.)";
  }
  persist();
  render();
  showQuizMessage("NOT YET", text, [
    ["TRY AGAIN", () => (stop.river ? continueTrail() : startQuiz(stop, mode))],
    ["ASK THE TRAIL GUIDE", () => {
      closeQuiz();
      openCoach(`${stop.title}: ${stop.detail}`);
    }, "ghost"],
    ["BACK TO CAMP", closeQuiz, "ghost"],
  ]);
}

// After clearing a stop: maybe a random trail event, or arriving at a landmark.
function afterStop(stop) {
  if (stop.river) {
    const landmark = save.map.worlds[stop.w].name;
    const done = !nextStop();
    showDialog(done ? "END OF THE TRAIL" : `YOU REACHED ${landmark}`,
      done ? `You crossed ${stop.title} and reached ${landmark}. That's the whole course. Well done!`
           : `You crossed ${stop.title} and arrived at ${landmark}. Rest a moment, then head out on the next leg.`,
      [["CONTINUE", closeQuiz]]);
    return;
  }
  if (Math.random() >= EVENT_CHANCE) return;
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  let effect = "";
  if (event.coins) {
    changeSupplies(event.coins);
    effect = ` ${event.coins > 0 ? "+" : ""}${event.coins} supplies.`;
  }
  if (event.health) {
    changeHealth(event.health);
    effect += ` Health ${event.health > 0 ? "up" : "down"}.`;
  }
  persist();
  render();
  showDialog("ON THE TRAIL", event.text + effect, [["CONTINUE", closeQuiz]]);
}
