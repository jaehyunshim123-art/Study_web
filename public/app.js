// Syllabus Quest — the game logic that runs in the browser.
// Progress is saved in localStorage so it survives a page refresh.

const XP_PER_LEVEL = 100;
const SAVE_KEY = "syllabus-quest-save";

// game = { map: <quest map from the AI>, done: { "w0-q1": true, ... } }
let game = load();

const $ = (id) => document.getElementById(id);

function load() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch {
    // Private browsing can block storage; the game still works for this visit.
  }
}

function totalXp() {
  if (!game) return 0;
  let xp = 0;
  game.map.worlds.forEach((world, w) => {
    world.quests.forEach((quest, q) => { if (game.done[`w${w}-q${q}`]) xp += quest.xp; });
    if (game.done[`w${w}-boss`]) xp += world.boss.xp;
  });
  return xp;
}

function renderStats() {
  const xp = totalXp();
  $("level").textContent = `Level ${Math.floor(xp / XP_PER_LEVEL) + 1}`;
  $("xp-text").textContent = `${xp} XP`;
  $("xp-fill").style.width = `${xp % XP_PER_LEVEL}%`;
}

function questRow(id, title, detail, xp, { boss = false, locked = false } = {}) {
  const row = document.createElement("label");
  row.className = "quest" + (boss ? " boss" : "") + (locked ? " locked" : "") + (game.done[id] ? " done" : "");

  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(game.done[id]);
  box.disabled = locked;
  box.addEventListener("change", () => {
    game.done[id] = box.checked;
    save();
    render();
  });

  const text = document.createElement("div");
  const name = document.createElement("strong");
  name.className = "title";
  name.textContent = (boss ? "👹 " : "") + title;
  const desc = document.createElement("p");
  desc.textContent = locked ? "Finish every quest in this world to unlock the boss." : detail;
  text.append(name, desc);

  const reward = document.createElement("span");
  reward.className = "xp";
  reward.textContent = `+${xp} XP`;

  row.append(box, text, reward);
  return row;
}

function render() {
  renderStats();
  $("setup").hidden = Boolean(game);
  $("map").hidden = !game;
  if (!game) return;

  $("course-title").textContent = game.map.courseTitle + (game.map.demo ? " — demo mode, add an API key for real quests" : "");
  const worlds = $("worlds");
  worlds.replaceChildren();

  game.map.worlds.forEach((world, w) => {
    const card = document.createElement("div");
    card.className = "world";
    const heading = document.createElement("h3");
    heading.textContent = `🌍 ${world.name}`;
    const topic = document.createElement("p");
    topic.className = "topic";
    topic.textContent = world.topic;
    card.append(heading, topic);

    world.quests.forEach((quest, q) => {
      card.append(questRow(`w${w}-q${q}`, quest.title, quest.task, quest.xp));
    });

    const allQuestsDone = world.quests.every((_, q) => game.done[`w${w}-q${q}`]);
    card.append(questRow(`w${w}-boss`, world.boss.name, world.boss.challenge, world.boss.xp, { boss: true, locked: !allQuestsDone }));
    worlds.append(card);
  });
}

$("generate").addEventListener("click", async () => {
  const button = $("generate");
  button.disabled = true;
  $("status").textContent = "The game master is reading your syllabus…";
  try {
    const res = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syllabus: $("syllabus").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    game = { map: data, done: {} };
    save();
    $("status").textContent = "";
    render();
  } catch (err) {
    $("status").textContent = err.message || "Something went wrong.";
  } finally {
    button.disabled = false;
  }
});

$("reset").addEventListener("click", () => {
  if (!confirm("Start over? Your current quest progress will be cleared.")) return;
  game = null;
  save();
  render();
});

render();
