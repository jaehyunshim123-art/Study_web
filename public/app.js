// Syllabus Quest — the game logic that runs in the browser.
// Everything is saved in localStorage so it survives a page refresh.
//
// save = {
//   map:  quest map from the AI (or null before a syllabus is loaded)
//   done: { "w0-q1": true, "w0-boss": true, ... }   which quests are finished
//   profile: { xp, coins, days: ["2026-10-16", ...], badges: {id: date}, owned: [...], look: {...}, asked }
// }
// The profile stays when you load a new syllabus, so your avatar, coins and badges carry over.

const XP_PER_LEVEL = 100;
const SAVE_KEY = "syllabus-quest-save";

const $ = (id) => document.getElementById(id);
const COIN = pixelIcon("coin", 14);
const save = load();

// ---------- saving ----------

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    // Storage blocked or corrupted: start fresh.
  }
  data = data || {};
  return {
    map: data.map || null,
    done: data.done || {},
    profile: { xp: 0, coins: 0, days: [], badges: {}, owned: [], look: { ...DEFAULT_LOOK }, asked: false, ...data.profile },
  };
}

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private browsing can block storage; the game still works for this visit.
  }
}

// ---------- levels, streaks, badges ----------

const level = () => Math.floor(save.profile.xp / XP_PER_LEVEL) + 1;

function dayKey(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10); // local YYYY-MM-DD
}

// Consecutive days with at least one finished quest, ending today (or yesterday, so it isn't lost before you study today).
function streak() {
  const days = new Set(save.profile.days);
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

const bossesBeaten = () => Object.keys(save.done).filter((id) => id.endsWith("-boss")).length;
const questsDone = () => Object.keys(save.done).length;

const BADGES = [
  { id: "first-quest", icon: pixelIcon("star", 32), name: "First Steps", desc: "Finish your first quest", test: () => questsDone() >= 1 },
  { id: "ten-quests", icon: pixelIcon("book", 32), name: "Bookworm", desc: "Finish 10 quests", test: () => questsDone() >= 10 },
  { id: "first-boss", icon: pixelIcon("sword", 32), name: "Boss Slayer", desc: "Defeat a boss", test: () => bossesBeaten() >= 1 },
  { id: "three-bosses", icon: pixelIcon("crown", 32), name: "Dragon Tamer", desc: "Defeat 3 bosses", test: () => bossesBeaten() >= 3 },
  { id: "streak-3", icon: pixelIcon("flame", 32), name: "On Fire", desc: "3-day study streak", test: () => streak() >= 3 },
  { id: "streak-7", icon: pixelIcon("flame", 32, { r: "#3f7fff", o: "#38e0e0", y: "#f4f4f4" }), name: "Unstoppable", desc: "7-day study streak", test: () => streak() >= 7 },
  { id: "level-5", icon: pixelIcon("arrow", 32), name: "Rising Star", desc: "Reach level 5", test: () => level() >= 5 },
  { id: "xp-1000", icon: pixelIcon("gem", 32), name: "XP Hoarder", desc: "Earn 1,000 XP", test: () => save.profile.xp >= 1000 },
  { id: "shopper", icon: pixelIcon("bag", 32), name: "Drip Check", desc: "Buy something in the shop", test: () => save.profile.owned.length >= 1 },
  { id: "curious", icon: pixelIcon("question", 32), name: "Curious Mind", desc: "Ask the study coach a question", test: () => save.profile.asked },
];

// Small icon per badge for the unlock toast (the BADGES list holds the big version).
const ICON_OF = { "first-quest": "star", "ten-quests": "book", "first-boss": "sword", "three-bosses": "crown", "streak-3": "flame",
  "streak-7": "flame", "level-5": "arrow", "xp-1000": "gem", shopper: "bag", curious: "question" };

function checkBadges() {
  for (const badge of BADGES) {
    if (!save.profile.badges[badge.id] && badge.test()) {
      save.profile.badges[badge.id] = dayKey();
      toast(`${pixelIcon(ICON_OF[badge.id], 16)} BADGE UNLOCKED: <b>${badge.name}</b>`, "badge");
    }
  }
}

// ---------- quest completion ----------

function complete(id, xp, title) {
  if (save.done[id]) return;
  const before = level();
  const coins = Math.round(xp / 2);
  save.done[id] = true;
  save.profile.xp += xp;
  save.profile.coins += coins;
  if (!save.profile.days.includes(dayKey())) save.profile.days.push(dayKey());

  toast(`&gt; ${escapeHTML(title)} <b>+${xp} XP</b> <b>+${coins}</b>${COIN}`);
  if (level() > before) showLevelUp(level());
  checkBadges();
  persist();
  render();
  document.querySelector(".avatar-on-platform")?.classList.add("hop");
}

// ---------- small UI helpers ----------

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function toast(html, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  $("toasts").append(el);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove(); // keep the stack short
  setTimeout(() => el.remove(), 3500);
}

function showLevelUp(n) {
  const el = $("levelup");
  el.innerHTML = `<div><div class="levelup-title">LEVEL UP!</div><div class="levelup-num">${n}</div></div>`;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 2200);
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
}

// ---------- rendering ----------

function renderStats() {
  const xp = save.profile.xp;
  $("level").textContent = `LV ${String(level()).padStart(2, "0")}`;
  $("xp-fill").style.width = `${((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%`;
  $("coins").textContent = String(save.profile.coins).padStart(3, "0");
  $("streak").textContent = streak();
  $("header-avatar").innerHTML = avatarSVG(save.profile.look);
}

// Where the player stands: the first unfinished quest (or boss) on the map.
function currentSpot() {
  for (const [w, world] of save.map.worlds.entries()) {
    const q = world.quests.findIndex((_, i) => !save.done[`w${w}-q${i}`]);
    if (q !== -1) return `w${w}-q${q}`;
    if (!save.done[`w${w}-boss`]) return `w${w}-boss`;
  }
  return null;
}

function platform({ id, title, detail, xp, boss, locked, offset, here }) {
  const done = Boolean(save.done[id]);
  const el = document.createElement("div");
  el.className = `platform pos-${offset}` + (boss ? " boss" : "") + (done ? " done" : "") + (locked ? " locked" : "");

  if (here) {
    const me = document.createElement("div");
    me.className = "avatar-on-platform";
    me.innerHTML = avatarSVG(save.profile.look);
    el.append(me);
  }

  const block = document.createElement("div");
  block.className = "block";
  block.innerHTML = `
    <div class="block-top">
      <strong>${boss ? "BOSS: " : ""}${escapeHTML(title)}</strong>
      <span class="reward">+${xp} XP</span>
    </div>
    <p>${locked ? "LOCKED. Finish every quest in this world to unlock the boss." : escapeHTML(detail)}</p>`;

  const actions = document.createElement("div");
  actions.className = "block-actions";
  if (done) {
    actions.innerHTML = `<span class="cleared">[X] CLEARED</span>`;
  } else if (!locked) {
    const go = document.createElement("button");
    go.textContent = boss ? "I BEAT IT" : "DONE";
    go.addEventListener("click", () => complete(id, xp, title));
    actions.append(go);
  }
  if (!locked) {
    const ask = document.createElement("button");
    ask.className = "ghost small";
    ask.textContent = "ASK COACH";
    ask.addEventListener("click", () => openCoach(`${title}: ${detail}`));
    actions.append(ask);
  }
  block.append(actions);
  el.append(block);
  return el;
}

function renderMap() {
  $("setup").hidden = Boolean(save.map);
  $("map").hidden = !save.map;
  if (!save.map) return;

  $("course-title").textContent = save.map.courseTitle + (save.map.demo ? " (demo mode)" : "");
  const here = currentSpot();
  const offsets = [0, 1, 2, 1]; // zigzag like an obby
  const worlds = $("worlds");
  worlds.replaceChildren();

  save.map.worlds.forEach((world, w) => {
    const section = document.createElement("div");
    section.className = "world";
    const cleared = world.quests.every((_, q) => save.done[`w${w}-q${q}`]);
    section.innerHTML = `<div class="world-head"><h3>WORLD ${w + 1}</h3><p class="world-name">${escapeHTML(world.name)}</p><p class="muted">${escapeHTML(world.topic)}</p></div>`;

    world.quests.forEach((quest, q) => {
      const id = `w${w}-q${q}`;
      section.append(platform({ id, title: quest.title, detail: quest.task, xp: quest.xp, offset: offsets[q % 4], here: id === here }));
    });
    const bossId = `w${w}-boss`;
    section.append(platform({ id: bossId, title: world.boss.name, detail: world.boss.challenge, xp: world.boss.xp, boss: true, locked: !cleared, offset: 1, here: bossId === here }));
    worlds.append(section);
  });

  if (!here) {
    const win = document.createElement("div");
    win.className = "card win";
    win.innerHTML = `${pixelIcon("crown", 32)}<div>ALL WORLDS CLEARED</div>`;
    worlds.append(win);
  }
}

function renderAvatar() {
  $("avatar-preview").innerHTML = avatarSVG(save.profile.look);

  document.querySelectorAll(".swatches").forEach((row) => {
    const part = row.dataset.part;
    row.replaceChildren(
      ...COLORS[part].map((color) => {
        const b = document.createElement("button");
        b.className = "swatch" + (save.profile.look[part] === color ? " picked" : "");
        b.style.background = color;
        b.setAttribute("aria-label", `${part} color ${color}`);
        b.addEventListener("click", () => {
          save.profile.look[part] = color;
          persist();
          render();
        });
        return b;
      })
    );
  });

  $("shop").replaceChildren(
    ...SHOP.map((item) => {
      const owned = save.profile.owned.includes(item.id);
      const wearing = save.profile.look[item.slot] === item.id;
      const card = document.createElement("div");
      card.className = "shop-item" + (wearing ? " wearing" : "");
      card.innerHTML = `<div class="shop-pic">${avatarSVG({ ...save.profile.look, [item.slot]: item.id })}</div><strong>${item.name}</strong>`;

      const b = document.createElement("button");
      if (!owned) {
        b.innerHTML = `${COIN} ${item.cost}`;
        b.disabled = save.profile.coins < item.cost;
        b.addEventListener("click", () => {
          save.profile.coins -= item.cost;
          save.profile.owned.push(item.id);
          save.profile.look[item.slot] = item.id;
          toast(`&gt; GOT <b>${item.name}</b>`);
          checkBadges();
          persist();
          render();
        });
      } else {
        b.textContent = wearing ? "Take off" : "Wear";
        b.className = wearing ? "ghost" : "";
        b.addEventListener("click", () => {
          save.profile.look[item.slot] = wearing ? null : item.id;
          persist();
          render();
        });
      }
      card.append(b);
      return card;
    })
  );
}

function renderBadges() {
  const s = streak();
  $("streak-text").textContent = s
    ? `${s}-day streak. Finish a quest every day to keep it going.`
    : "Finish a quest today to start a streak.";
  $("badges").replaceChildren(
    ...BADGES.map((badge) => {
      const earned = save.profile.badges[badge.id];
      const el = document.createElement("div");
      el.className = "badge" + (earned ? " earned" : "");
      el.innerHTML = `<div class="badge-icon">${earned ? badge.icon : pixelIcon("lock", 32)}</div><strong>${badge.name}</strong><span class="muted small">${badge.desc}</span>`;
      return el;
    })
  );
}

function render() {
  renderStats();
  renderMap();
  renderAvatar();
  renderBadges();
}

// ---------- syllabus loading ----------

let pdfData = null;

$("pdf").addEventListener("change", () => {
  const file = $("pdf").files[0];
  pdfData = null;
  $("pdf-name").textContent = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    $("pdf-name").textContent = "That PDF is over 10 MB. Try a smaller file.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pdfData = String(reader.result).split(",")[1]; // strip the "data:application/pdf;base64," part
    $("pdf-name").textContent = `Loaded: ${file.name}`;
  };
  reader.readAsDataURL(file);
});

$("generate").addEventListener("click", async () => {
  const button = $("generate");
  button.disabled = true;
  $("status").textContent = "The game master is building your world…";
  try {
    const res = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syllabus: $("syllabus").value, pdf: pdfData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    save.map = data;
    save.done = {};
    persist();
    $("status").textContent = "";
    render();
  } catch (err) {
    $("status").textContent = err.message || "Something went wrong.";
  } finally {
    button.disabled = false;
  }
});

$("reset").addEventListener("click", () => {
  if (!confirm("Load a new syllabus? Your map resets, but you keep your XP, coins, avatar and badges.")) return;
  save.map = null;
  save.done = {};
  pdfData = null;
  $("pdf").value = "";
  $("pdf-name").textContent = "";
  persist();
  render();
});

// ---------- study coach ----------

const chat = []; // this visit's conversation: [{role: "user"|"assistant", content}]
let coachQuest = "";

function addBubble(role, text) {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  $("chat").append(el);
  $("chat").scrollTop = $("chat").scrollHeight;
  return el;
}

function openCoach(quest) {
  coachQuest = quest;
  $("coach-context").textContent = `Asking about: ${quest}`;
  switchTab("coach");
  $("coach-input").focus();
}

$("coach-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("coach-input").value.trim();
  if (!text) return;
  $("coach-input").value = "";
  chat.push({ role: "user", content: text });
  addBubble("user", text);
  const thinking = addBubble("assistant", "…");

  if (!save.profile.asked) {
    save.profile.asked = true;
    checkBadges();
    persist();
    renderBadges();
  }

  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course: save.map?.courseTitle || "", quest: coachQuest, messages: chat }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    thinking.textContent = data.reply;
    chat.push({ role: "assistant", content: data.reply });
  } catch (err) {
    thinking.textContent = err.message || "The coach couldn't answer.";
    chat.pop(); // drop the unanswered question so the conversation stays valid
  }
});

// ---------- start ----------

$("coin-icon").innerHTML = pixelIcon("coin", 14);
$("streak-icon").innerHTML = pixelIcon("flame", 14);
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
render();
