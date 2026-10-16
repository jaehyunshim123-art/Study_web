// Syllabus Quest — the game logic that runs in the browser.
// Everything is saved in localStorage so it survives a page refresh.
//
// save = {
//   map:  the trail from the AI (or null before a syllabus is loaded)
//   done: { "w0-q1": true, "w0-boss": true, ... }   which stops and river crossings are cleared
//   health, startedOn: this journey's health (0-100) and the day it started
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
    syllabus: data.syllabus || "", // pasted syllabus text, sent along when making quizzes
    done: data.done || {},
    health: data.health ?? 100,
    startedOn: data.startedOn || dayKey(),
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
  { id: "first-quest", icon: pixelIcon("star", 32), name: "First Steps", desc: "Clear your first stop", test: () => questsDone() >= 1 },
  { id: "ten-quests", icon: pixelIcon("book", 32), name: "Bookworm", desc: "Clear 10 stops", test: () => questsDone() >= 10 },
  { id: "first-boss", icon: pixelIcon("sword", 32), name: "River Crosser", desc: "Cross your first river", test: () => bossesBeaten() >= 1 },
  { id: "three-bosses", icon: pixelIcon("crown", 32), name: "Trailblazer", desc: "Cross 3 rivers", test: () => bossesBeaten() >= 3 },
  { id: "streak-3", icon: pixelIcon("flame", 32), name: "On Fire", desc: "3-day study streak", test: () => streak() >= 3 },
  { id: "streak-7", icon: pixelIcon("flame", 32, { r: "#3f7fff", o: "#38e0e0", y: "#f4f4f4" }), name: "Unstoppable", desc: "7-day study streak", test: () => streak() >= 7 },
  { id: "level-5", icon: pixelIcon("arrow", 32), name: "Rising Star", desc: "Reach level 5", test: () => level() >= 5 },
  { id: "xp-1000", icon: pixelIcon("gem", 32), name: "XP Hoarder", desc: "Earn 1,000 XP", test: () => save.profile.xp >= 1000 },
  { id: "shopper", icon: pixelIcon("bag", 32), name: "Drip Check", desc: "Buy something in the shop", test: () => save.profile.owned.length >= 1 },
  { id: "perfect", icon: pixelIcon("star", 32, { y: "#38e0e0" }), name: "Perfect Score", desc: "Get every question right on a quiz", test: () => save.profile.perfect },
  { id: "curious", icon: pixelIcon("question", 32), name: "Curious Mind", desc: "Ask the trail guide a question", test: () => save.profile.asked },
];

// Small icon per badge for the unlock toast (the BADGES list holds the big version).
const ICON_OF = { "first-quest": "star", "ten-quests": "book", "first-boss": "sword", "three-bosses": "crown", "streak-3": "flame",
  "streak-7": "flame", "level-5": "arrow", "xp-1000": "gem", shopper: "bag", perfect: "star", curious: "question" };

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
  renderTrail();
  renderAvatar();
  renderBadges();
}

// ---------- syllabus loading ----------

let pdfData = null;
let building = false;

// The journey can only start once there's a syllabus to build it from.
function updateStartButton() {
  const ready = Boolean(pdfData || $("syllabus").value.trim());
  $("generate").disabled = building || !ready;
  $("start-hint").hidden = ready;
}
$("syllabus").addEventListener("input", updateStartButton);

$("pdf").addEventListener("change", () => {
  const file = $("pdf").files[0];
  pdfData = null;
  $("pdf-name").textContent = "";
  updateStartButton();
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    $("pdf-name").textContent = "That PDF is over 10 MB. Try a smaller file.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pdfData = String(reader.result).split(",")[1]; // strip the "data:application/pdf;base64," part
    $("pdf-name").textContent = `Loaded: ${file.name}`;
    updateStartButton();
  };
  reader.readAsDataURL(file);
});

$("generate").addEventListener("click", async () => {
  building = true;
  updateStartButton();
  $("status").textContent = "Reading your syllabus and packing the wagon...";
  try {
    const res = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syllabus: $("syllabus").value, pdf: pdfData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // syllabusText: text pulled out of a PDF, when whoever built the trail sends it back
    const { syllabusText, ...trail } = data;
    save.map = trail;
    save.syllabus = (syllabusText || $("syllabus").value).slice(0, 20000);
    save.done = {};
    save.health = 100;
    save.startedOn = dayKey();
    persist();
    $("status").textContent = "";
    render();
  } catch (err) {
    $("status").textContent = err.message || "Something went wrong.";
  } finally {
    building = false;
    updateStartButton();
  }
});

$("reset").addEventListener("click", () => {
  if (!confirm("Start a new journey? This trail resets, but you keep your XP, coins, avatar and badges.")) return;
  save.map = null;
  save.syllabus = "";
  save.done = {};
  pdfData = null;
  $("pdf").value = "";
  $("pdf-name").textContent = "";
  $("syllabus").value = "";
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
