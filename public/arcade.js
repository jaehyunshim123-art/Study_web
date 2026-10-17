// The machine's game menu, and three more games that quiz you on the same syllabus questions:
//   QUIZ KART: four lanes, four answers. Steer into the lane of the right answer before you
//   reach the gate. A wrong lane costs one of your 5 lives.
//   SYLLABUS FIGHTER: a one-on-one fight. Right answers land hits on the boss; a wrong answer,
//   or running out of time, lets the boss hit you. Knock out one boss and the next steps up.
//   FLAPPY FACTS: flap through the gap in the wall marked with the right answer. 3 lives.
// The menu works like an arcade's attract screen: one game at a time, with a demo of it playing
// itself (Kart and Flappy run on autopilot), and arrows to flip to the next game.
// Everything runs on an overlay that covers the machine's screen and uses the arcade buttons:
// A-D (or keys 1-4 / A-D) pick an answer, the arrow keys move the joystick, Escape goes back.
// Coins won here go into the same wallet as the trail game, so they spend in its store.

const Arcade = (() => {
  const root = () => $("arcade");
  let mode = null;     // null (closed) | "menu" | "kart" | "fight" | "flap"
  let paused = false;  // hidden while the study timer is open
  let unit = null;     // the unit Quiz Kart and Syllabus Fighter quiz you on
  let stop = null;     // stops the running game's loop and timers
  let onPad = null;    // what the current screen does with arcade button i (returns true if handled)
  let onStick = null;  // what the current screen does with the joystick ("left" | "right")
  let onKey = null;    // other keys the current screen uses (returns true if handled)
  let pick = 0;        // the game showing on the menu

  // trailer(el) plays a demo of the game in el and returns a function that stops it.
  const GAMES = [
    { id: "trail", name: "TRAIL QUEST", desc: "Take your wagon from the first unit to the final exam: a lesson, then questions, for every unit.", trailer: trailTrailer },
    { id: "kart", name: "QUIZ KART", desc: "Steer into the lane with the right answer before you reach the gate. 5 lives.", trailer: (el) => startKart(null, el), start: startKart },
    { id: "fight", name: "SYLLABUS FIGHTER", desc: "Right answers land hits. Miss, or run out of time, and the boss hits back.", trailer: fightTrailer, start: startFight },
    { id: "flap", name: "FLAPPY FACTS", desc: "Flap through the gap in the wall with the right answer. 3 lives.", trailer: (el) => startFlap(null, el), start: startFlap },
  ];

  const best = () => (game.best ||= {});
  function earn(n) {
    game.coins += n;
    persistGame();
  }

  // Questions for one unit, shuffled; a missed question comes back a few questions later.
  function makeDeck(u) {
    let order = [];
    return {
      next() {
        const bank = game.banks[u];
        if (!order.length) order = shuffle(bank.map((_, i) => i));
        return bank[order.shift()];
      },
      again(q) {
        const i = game.banks[u].indexOf(q);
        if (i >= 0) order.splice(3, 0, i);
      },
    };
  }

  function show(html) {
    if (stop) stop();
    stop = onPad = onStick = onKey = null;
    root().innerHTML = html;
    root().scrollTop = 0;
  }

  function open() {
    root().hidden = false;
    $("views").inert = true;
    paused = false;
  }

  // ---------- the menu ----------

  function openMenu() {
    if (shopIsOpen) resetScreens();
    if (view !== "play") showView("play");
    answering = false;
    mode = "menu";
    open();
    if (unit === null || unit >= game.trail.units.length) unit = Math.min(game.unit, game.trail.units.length - 1);
    renderMenu();
    Sound.play("open");
  }

  // dir: -1 or 1 when flipping to the previous or next game (the screen slides that way)
  function renderMenu(dir = 0) {
    const units = game.trail.units;
    const g = GAMES[pick];
    const b = best();
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const note = {
      trail: game.finished ? "FINISHED!" : `UNIT ${game.unit + 1} OF ${units.length}`,
      kart: b.kart ? `BEST: ${plural(b.kart, "GATE")}` : "NEW!",
      fight: b.fight ? `BEST: ${plural(b.fight, "KNOCKOUT")}` : "NEW!",
      flap: b.flap ? `BEST: ${plural(b.flap, "WALL")}` : "NEW!",
    }[g.id];
    const arrow = `<svg viewBox="0 0 8 12" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 0h2v2h2v2h2v4h-2v2h-2v2h-2z" fill="currentColor"/></svg>`;
    show(`
      <div class="arc-menu">
        <div class="hud">
          <button class="hud-btn" data-act="exit" aria-label="Exit to the arcade">&lt;<span class="lbl"> EXIT</span></button>
          <p class="arc-head">SELECT GAME</p>
          <div class="hud-stat"><span class="k">COINS</span><span class="v">${game.coins}</span></div>
        </div>
        <div class="arc-body">
          <div class="arc-stage">
            <button class="arc-arrow prev" data-act="left" aria-label="Previous game">${arrow}</button>
            <div class="arc-screen ${dir > 0 ? "from-right" : dir < 0 ? "from-left" : ""}">
              <div class="trailer" id="trailer" aria-hidden="true"></div>
              <span class="trailer-tag">DEMO</span>
              <span class="trailer-count">${pick + 1}/${GAMES.length}</span>
            </div>
            <button class="arc-arrow next" data-act="right" aria-label="Next game">${arrow}</button>
          </div>
          <div class="arc-info ${dir ? "fade" : ""}" aria-live="polite">
            <h2 class="arc-name">${g.name}</h2>
            <p class="arc-desc">${g.desc}</p>
            <p class="arc-note">${note}</p>
          </div>
          <div class="arc-dots">${GAMES.map((x, i) => `<button class="arc-dot ${i === pick ? "on" : ""}" data-dot="${i}" aria-label="${x.name}" ${i === pick ? 'aria-current="true"' : ""}></button>`).join("")}</div>
          <button class="btn-next arc-play" data-pad="0">PRESS<span class="hint" aria-hidden="true">A</span>TO PLAY</button>
          ${g.id === "trail" ? "" : `
          <div class="arc-unit">
            <p class="arc-unit-label">QUESTIONS FROM</p>
            <div class="arc-unit-row">
              <button class="hud-btn" data-act="prev" aria-label="Previous unit" ${unit === 0 ? "disabled" : ""}>&lt;</button>
              <span class="arc-unit-name">${escapeHTML(units[unit].topic)}</span>
              <button class="hud-btn" data-act="next" aria-label="Next unit" ${unit === units.length - 1 ? "disabled" : ""}>&gt;</button>
            </div>
          </div>`}
        </div>
      </div>`);
    const flip = (d) => {
      pick = (pick + d + GAMES.length) % GAMES.length;
      Sound.play("blip");
      renderMenu(d);
    };
    const step = (d) => {
      const next = Math.max(0, Math.min(units.length - 1, unit + d));
      if (next === unit || g.id === "trail") return;
      unit = next;
      Sound.play("step");
      renderMenu();
    };
    const play = () => {
      Sound.play("coin");
      if (g.id === "trail") return playTrail();
      loadThen(g.start, g.id);
    };
    root().querySelector("[data-act=exit]").addEventListener("click", () => exitGame());
    root().querySelector("[data-act=left]").addEventListener("click", () => flip(-1));
    root().querySelector("[data-act=right]").addEventListener("click", () => flip(1));
    root().querySelectorAll("[data-dot]").forEach((d) => d.addEventListener("click", () => {
      const i = Number(d.dataset.dot);
      if (i !== pick) { const dirn = i > pick ? 1 : -1; pick = i; Sound.play("blip"); renderMenu(dirn); }
    }));
    root().querySelector("[data-act=prev]")?.addEventListener("click", () => step(-1));
    root().querySelector("[data-act=next]")?.addEventListener("click", () => step(1));
    root().querySelector(".arc-play").addEventListener("click", play);
    onPad = (i) => { if (i === 0) play(); return true; };
    onStick = (dir) => flip(dir === "left" ? -1 : 1);
    onKey = (key) => {
      if (key === "ArrowUp" || key === "ArrowDown") { step(key === "ArrowUp" ? -1 : 1); return true; }
      return false;
    };
    stop = g.trailer($("trailer"));
  }

  function playTrail() {
    close();
    startGame();
  }

  // Make sure the chosen unit has questions (the AI writes them the first time), then start.
  async function loadThen(start, id) {
    const u = unit;
    if (!game.banks[u]?.length) {
      mode = id;
      show(`<div class="arc-center"><div class="card message">
        <h2>LOADING<span class="loading-dots"></span></h2>
        <p>Writing questions about ${escapeHTML(game.trail.units[u].topic)}.</p></div></div>`);
      try {
        await questionsFor(u);
      } catch (err) {
        if (mode !== id) return;
        show(`<div class="arc-center"><div class="card message">
          <h2>SOMETHING WENT WRONG</h2><p>${escapeHTML(err.message || "Couldn't load this unit.")}</p>
          <button class="btn-next" data-pad="0">TRY AGAIN</button><button class="btn-ghost" data-pad="1">MENU</button></div></div>`);
        wireButtons({ 0: () => loadThen(start, id), 1: openMenu });
        return;
      }
      if (mode !== id) return; // left while loading
    }
    fillBank(u);
    mode = id;
    stop = start(u);
  }

  // Buttons marked data-pad="i" are pressed by arcade button i too.
  function wireButtons(actions) {
    for (const [i, fn] of Object.entries(actions)) root().querySelector(`[data-pad="${i}"]`)?.addEventListener("click", fn);
    onPad = (i) => {
      const b = root().querySelector(`[data-pad="${i}"]`);
      if (b && !b.disabled) b.click();
      return true;
    };
  }

  function close() {
    if (stop) stop();
    stop = onPad = onStick = onKey = null;
    mode = null;
    paused = false;
    root().hidden = true;
    root().innerHTML = "";
    $("views").inert = false;
  }

  // A row of pixel hearts: n full out of max.
  function heartsHTML(n, max) {
    const heart = px(1, 0, 2, 1, "#e5484d") + px(4, 0, 2, 1, "#e5484d") + px(0, 1, 7, 2, "#e5484d") + px(1, 3, 5, 1, "#e5484d") + px(2, 4, 3, 1, "#e5484d") + px(3, 5, 1, 1, "#e5484d") + px(1, 1, 1, 1, "#fff");
    return Array.from({ length: max }, (_, i) => `<svg class="heart ${i < n ? "" : "lost"}" viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">${heart}</svg>`).join("");
  }

  // ---------- QUIZ KART ----------

  const LANE_COLORS = ["#ff4d2e", "#3b6fe0", "#e0a100", "#1f9d55"];
  const SPAWN = 30;  // how far away (in road units) each gate appears
  const SEG = 0.7;   // length of one road stripe

  // demo: an element to play a silent, self-driving demo in (for the menu). Returns a stop function.
  function startKart(u, demo = null) {
    const ui = !demo;
    const sfx = (name) => { if (ui) Sound.play(name); };
    const deck = ui ? makeDeck(u) : null;
    const look = themeLook(game.trail.theme);
    const paint = (PAINTS.find((p) => p.id === game.paint) || PAINTS[0]).color;
    const k = {
      phase: "intro", lives: 5, gates: 0, misses: 0, coins: 0, streak: 0,
      lane: 1, laneX: 1, pos: 0, speed: 3, gate: null, q: null, wait: 0, count: 0,
      shake: 0, flash: 0, flashColor: "", spin: 0, slow: 0, curve: 0, curveT: Math.random() * 10, W: 320, H: 220,
      color: paint === PAINTS[0].color ? "#ff4d2e" : paint,
    };

    if (demo) demo.innerHTML = "<canvas></canvas>";
    else show(`
      <div class="kart">
        <div class="arc-bar">
          <button class="hud-btn" data-act="menu" aria-label="Back to the game menu">&lt;<span class="lbl"> MENU</span></button>
          <div class="lives" id="k-lives"></div>
          <div class="hud-stat"><span class="k">GATES</span><span class="v" id="k-gates">0</span></div>
          <div class="hud-stat"><span class="k">COINS</span><span class="v" id="k-coins">+0</span></div>
        </div>
        <div class="k-q" id="k-q"></div>
        <div class="k-road" id="k-road">
          <canvas id="k-canvas" aria-label="The race track. Your kart is in lane ${"ABCD"[k.lane]}."></canvas>
          <div class="k-card" id="k-card"></div>
        </div>
      </div>`);
    if (ui) root().querySelector("[data-act=menu]").addEventListener("click", openMenu);
    const box = demo || $("k-road");
    const canvas = box.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    const fit = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      k.W = 320;
      k.H = Math.max(150, Math.min(420, Math.round((320 * r.height) / r.width)));
      canvas.width = k.W;
      canvas.height = k.H;
      ctx.imageSmoothingEnabled = false;
    };
    const resize = new ResizeObserver(fit);
    resize.observe(box);
    fit();
    document.fonts?.load('8px "Press Start 2P"').catch(() => {});

    const renderLives = () => {
      if (!ui) return;
      $("k-lives").innerHTML = heartsHTML(k.lives, 5);
      $("k-lives").setAttribute("aria-label", `${k.lives} of 5 lives left`);
    };
    renderLives();

    // the question and the four lanes' answers
    const renderQuestion = (result) => {
      if (!ui) return;
      const q = k.q;
      if (!q) { $("k-q").innerHTML = ""; return; }
      $("k-q").innerHTML = `
        <p class="k-qtext">${escapeHTML(q.question)}</p>
        <div class="k-choices">${q.choices.map((c, i) => {
          let cls = i === k.lane ? " on" : "";
          if (result) cls = i === q.answerIndex ? " right" : i === result.lane ? " wrong" : " dim";
          return `<button class="k-choice${cls}" data-i="${i}" ${result ? "disabled" : ""}><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(c)}</span></button>`;
        }).join("")}</div>
        <div class="k-dist"><i id="k-dist"></i></div>
        ${result && !result.right && q.explanation ? `<p class="k-why">${escapeHTML(q.explanation)}</p>` : ""}`;
      $("k-q").querySelectorAll(".k-choice").forEach((b) => b.addEventListener("click", () => steer(Number(b.dataset.i))));
    };

    const markLane = () => ui && $("k-q").querySelectorAll(".k-choice").forEach((b, i) => b.classList.toggle("on", i === k.lane));

    function steer(lane) {
      if (k.phase !== "drive" && k.phase !== "count") return;
      lane = Math.max(0, Math.min(3, lane));
      if (lane === k.lane) return;
      k.lane = lane;
      sfx("step");
      if (k.gate && !k.gate.judged) markLane();
      canvas.setAttribute("aria-label", `The race track. Your kart is in lane ${"ABCD"[lane]}.`);
    }

    if (ui) canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      steer(k.lane + (e.clientX - r.left < r.width / 2 ? -1 : 1));
    });

    const card = (html, buttons) => {
      $("k-card").innerHTML = html;
      $("k-card").hidden = false;
      wireButtons(buttons);
    };
    const hideCard = () => { $("k-card").hidden = true; };

    function intro() {
      k.phase = "intro";
      card(`<div class="card message">
        <h2>QUIZ KART</h2>
        <p>A gate with four lanes is coming. Steer into the lane with the right answer before you reach it.
        Change lanes with <b>A</b>-<b>D</b>, the arrow keys, or by tapping an answer. A wrong lane costs a life. You have 5.</p>
        <button class="btn-next" data-pad="0">START<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: countdown, 1: openMenu });
    }

    function countdown() {
      hideCard();
      Object.assign(k, { phase: "count", count: 3.2, lives: 5, gates: 0, misses: 0, coins: 0, streak: 0, lane: 1, laneX: 1, gate: null, q: null, spin: 0, slow: 0 });
      renderLives();
      $("k-gates").textContent = "0";
      $("k-coins").textContent = "+0";
      renderQuestion();
      onPad = (i) => { steer(i); return true; };
      Sound.play("press");
    }

    function spawnGate() {
      if (ui) k.q = deck.next();
      else {
        // the demo driver usually picks the right lane, partway down the road
        const answerIndex = Math.floor(Math.random() * 4);
        k.q = { answerIndex };
        k.aim = Math.random() < 0.8 ? answerIndex : (answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
        k.aimAt = 0.25 + Math.random() * 0.4;
      }
      const seconds = Math.max(5, 11 - k.gates * 0.3); // gates come faster as you go
      k.speed = (SPAWN - 1) / seconds;
      k.gate = { z: k.pos + SPAWN, judged: false };
      renderQuestion();
    }

    function judge() {
      const q = k.q;
      k.gate.judged = true;
      const right = k.lane === q.answerIndex;
      if (right) {
        const coins = q.difficulty === "hard" ? 10 : 5;
        k.gates++;
        k.streak++;
        k.coins += coins;
        if (ui) earn(coins);
        k.flash = 1; k.flashColor = "31,157,85";
        popText(`+${coins} COINS`, "good");
        sfx("right");
        setTimeout(() => sfx("coindrop"), 200);
        k.wait = 1;
      } else {
        if (ui) k.lives--;
        k.misses++;
        k.streak = 0;
        k.shake = 0.6; k.flash = 1; k.flashColor = "217,58,58"; k.spin = 1; k.slow = 1.2;
        if (ui) deck.again(q);
        popText("-1 LIFE", "bad");
        sfx("crash");
        renderLives();
        k.wait = k.lives ? 2.6 : 1.6;
      }
      if (ui) {
        $("k-gates").textContent = k.gates;
        $("k-coins").textContent = `+${k.coins}`;
      }
      renderQuestion({ right, lane: k.lane });
      k.phase = "result";
    }

    function gameOver() {
      k.phase = "over";
      k.q = null;
      const b = best();
      const record = k.gates > (b.kart || 0);
      if (record) b.kart = k.gates;
      persistGame();
      renderQuestion();
      Sound.play("lose");
      const tries = k.gates + k.misses;
      card(`<div class="card message">
        <h2>${record && k.gates ? "NEW RECORD!" : "GAME OVER"}</h2>
        <div class="stats">
          <div><b>${k.gates}</b><span>gates cleared</span></div>
          <div><b>${tries ? Math.round((100 * k.gates) / tries) : 0}%</b><span>accuracy</span></div>
          <div><b>+${k.coins}</b><span>coins won</span></div>
          <div><b>${b.kart || 0}</b><span>best</span></div>
        </div>
        <button class="btn-next" data-pad="0">RACE AGAIN<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: countdown, 1: openMenu });
    }

    function popText(text, kind) {
      const pop = document.createElement("div");
      pop.className = `k-pop ${kind}`;
      pop.textContent = text;
      box.append(pop);
      setTimeout(() => pop.remove(), 1100);
    }

    function update(dt) {
      const go = k.phase === "drive" || k.phase === "result" || k.phase === "count";
      const speed = k.phase === "intro" || k.phase === "over" ? 2 : k.speed * (k.slow > 0 ? 0.35 : 1);
      k.pos += speed * dt;
      k.laneX += (k.lane - k.laneX) * Math.min(1, dt * 12);
      k.curveT += dt * (go ? 1 : 0.4);
      k.curve = Math.sin(k.curveT * 0.31) * 0.55 + Math.sin(k.curveT * 0.11) * 0.35;
      k.shake = Math.max(0, k.shake - dt);
      k.flash = Math.max(0, k.flash - dt * 2.2);
      k.spin = Math.max(0, k.spin - dt * 1.4);
      k.slow = Math.max(0, k.slow - dt);

      if (k.phase === "count") {
        const before = Math.ceil(k.count);
        k.count -= dt;
        if (Math.ceil(k.count) !== before && k.count > 0) sfx("press");
        if (k.count <= 0) {
          k.phase = "drive";
          sfx("go");
          spawnGate();
        }
      } else if (k.phase === "drive" && k.gate) {
        const dz = k.gate.z - k.pos;
        if (!ui && (SPAWN - dz) / SPAWN > k.aimAt) steer(k.aim);
        const bar = ui && $("k-dist");
        if (bar) bar.style.width = `${Math.min(100, (100 * (SPAWN - dz)) / (SPAWN - 1))}%`;
        if (dz <= 1) judge();
      } else if (k.phase === "result") {
        if (k.gate && k.gate.z - k.pos < 0.8) k.gate = null; // the gate has passed overhead
        k.wait -= dt;
        if (k.wait <= 0) {
          if (!k.lives) return gameOver();
          k.phase = "drive";
          spawnGate();
        }
      }
    }

    // ---- drawing (a small pixel canvas, scaled up) ----

    const horizon = () => Math.round(k.H * 0.34);
    const ROAD = () => k.W * 0.46; // half the road's width at the bottom of the screen
    const centerAt = (s) => k.W / 2 + k.curve * (1 - s) * (1 - s) * k.W * 0.55;

    function draw() {
      const { W, H } = k;
      const hz = horizon();
      ctx.save();
      if (k.shake) ctx.translate(Math.round((Math.random() - 0.5) * 10 * k.shake), Math.round((Math.random() - 0.5) * 6 * k.shake));
      // sky, sun, clouds and the far hills (they drift as the road bends)
      ctx.fillStyle = look.sky; ctx.fillRect(-8, -8, W + 16, hz + 8);
      const drift = k.curve * 40;
      ctx.fillStyle = "#ffc94d"; ctx.fillRect(Math.round(W * 0.78 - drift), Math.round(hz * 0.3), 12, 12);
      ctx.fillStyle = "#fff";
      ctx.fillRect(Math.round(40 - drift * 0.6), Math.round(hz * 0.35), 26, 5); ctx.fillRect(Math.round(46 - drift * 0.6), Math.round(hz * 0.35) - 4, 14, 4);
      ctx.fillRect(Math.round(170 - drift * 0.6), Math.round(hz * 0.55), 30, 5); ctx.fillRect(Math.round(178 - drift * 0.6), Math.round(hz * 0.55) - 4, 14, 4);
      ctx.fillStyle = look.far;
      for (let x = -8; x < W + 8; x += 8) {
        const h = 5 + Math.round(4 * Math.sin((x + drift * 2) / 23) + 3 * Math.sin((x + drift * 2) / 9));
        ctx.fillRect(x, hz - h, 8, h);
      }
      // the ground and the road, one row at a time
      for (let y = hz; y < H + 8; y++) {
        const s = Math.max(0.004, (y - hz) / (H - hz));
        const z = 1 / s;
        const odd = Math.floor((z + k.pos) / SEG) & 1;
        const cx = centerAt(s);
        const rw = ROAD() * s;
        const rumble = Math.max(1, rw * 0.1);
        ctx.fillStyle = odd ? look.ground : look.edge; ctx.fillRect(-8, y, W + 16, 1);
        ctx.fillStyle = odd ? "#e5484d" : "#fbfaf6";
        ctx.fillRect(Math.round(cx - rw - rumble), y, Math.ceil(rumble), 1);
        ctx.fillRect(Math.round(cx + rw), y, Math.ceil(rumble), 1);
        ctx.fillStyle = odd ? "#6b7280" : "#747c89"; ctx.fillRect(Math.round(cx - rw), y, Math.ceil(rw * 2), 1);
        if (odd) {
          ctx.fillStyle = "#e9ecef";
          const lw = Math.max(1, Math.round(rw * 0.025));
          for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(cx - rw + (i * rw) / 2 - lw / 2), y, lw, 1);
        }
      }
      // roadside trees and posts, far to near
      const first = Math.ceil(k.pos / 3) * 3;
      for (let i = 12; i >= 0; i--) {
        const dz = first + i * 3 - k.pos;
        if (dz < 0.6) continue;
        const s = 1 / dz;
        const y = hz + s * (H - hz);
        const cx = centerAt(s);
        const rw = ROAD() * s;
        const size = 46 * s;
        tree(cx - rw - size * 1.4, y, size, look);
        tree(cx + rw + size * 0.4, y, size, look);
      }
      if (k.gate) drawGate();
      drawKart();
      if (k.phase === "count") {
        const n = Math.ceil(k.count);
        bigText(n > 3 ? "" : n > 0 ? String(n) : "GO!", "#fff");
      } else if (k.phase === "drive" && k.gate && k.gate.z - k.pos > SPAWN - 2) {
        bigText("GO!", "#fff");
      }
      ctx.restore();
      if (k.flash) {
        ctx.fillStyle = `rgba(${k.flashColor},${(k.flash * 0.35).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function tree(x, y, size, lk) {
      if (size < 1.5) return;
      const s = Math.max(1, Math.round(size));
      ctx.fillStyle = "#6e4a2b"; ctx.fillRect(Math.round(x + s * 0.4), Math.round(y - s * 0.5), Math.max(1, Math.round(s * 0.2)), Math.round(s * 0.5));
      ctx.fillStyle = "#2f7d4f"; ctx.fillRect(Math.round(x), Math.round(y - s * 1.3), s, Math.round(s * 0.85));
      ctx.fillStyle = "#3a9a62"; ctx.fillRect(Math.round(x + s * 0.15), Math.round(y - s * 1.45), Math.round(s * 0.7), Math.max(1, Math.round(s * 0.25)));
    }

    function drawGate() {
      const { H } = k;
      const hz = horizon();
      const dz = k.gate.z - k.pos;
      if (dz < 0.25) return;
      const s = 1 / dz;
      const y = Math.round(hz + s * (H - hz));
      const cx = centerAt(s);
      const rw = ROAD() * s;
      const postH = Math.round(Math.min(H * 0.55, 92 * s));
      const pw = Math.max(1, Math.round(5 * s));
      ctx.fillStyle = "#111418";
      ctx.fillRect(Math.round(cx - rw - pw), y - postH, pw, postH);
      ctx.fillRect(Math.round(cx + rw), y - postH, pw, postH);
      const boxH = Math.max(2, Math.round(30 * s));
      const top = y - postH;
      ctx.fillRect(Math.round(cx - rw - pw), top - 1, Math.round(rw * 2 + pw * 2), Math.max(2, Math.round(boxH + 4 * s)));
      const laneW = (rw * 2) / 4;
      const result = k.gate.judged;
      for (let i = 0; i < 4; i++) {
        const x = Math.round(cx - rw + i * laneW + laneW * 0.06);
        const w = Math.max(1, Math.round(laneW * 0.88));
        const dim = result && i !== k.q.answerIndex;
        ctx.fillStyle = dim ? "#9aa3b2" : LANE_COLORS[i];
        ctx.fillRect(x, top + Math.round(2 * s), w, boxH);
        if (boxH >= 9) {
          const font = boxH >= 22 ? 16 : 8;
          ctx.font = `${font}px "Press Start 2P", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          ctx.fillText("ABCD"[i], x + w / 2, top + Math.round(2 * s) + boxH / 2 + 1);
        }
      }
    }

    function drawKart() {
      const { W, H } = k;
      const laneW = (ROAD() * 2) / 4;
      const x = Math.round(W / 2 - ROAD() + (k.laneX + 0.5) * laneW);
      const y = H - 8;
      const lean = Math.max(-1, Math.min(1, (k.lane - k.laneX) * 2));
      const bounce = (k.phase === "drive" || k.phase === "count") && Math.floor(k.pos * 6) % 2 ? 1 : 0;
      ctx.save();
      ctx.translate(x, y - 14 - bounce); // spin around the kart's middle
      if (k.spin) ctx.rotate(k.spin * Math.PI * 4);
      ctx.translate(0, 14);
      const r = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(dx, dy, w, h); };
      r(-19, -2, 38, 3, "rgba(17,20,24,0.25)");   // shadow
      r(-19, -10, 8, 10, "#111418"); r(11, -10, 8, 10, "#111418"); // back wheels
      r(-18, -8, 2, 6, "#5b6577"); r(16, -8, 2, 6, "#5b6577");
      r(-14, -16, 28, 10, k.color);                // body
      r(-14, -16, 28, 2, "rgba(255,255,255,0.35)");
      r(-6, -12, 12, 4, "#111418");                // engine
      r(-16, -20, 32, 3, "#111418");               // spoiler
      r(-12, -17, 2, 3, "#111418"); r(10, -17, 2, 3, "#111418");
      r(-5 + Math.round(lean * 2), -28, 10, 9, "#fbfaf6"); // helmet
      r(-4 + Math.round(lean * 2), -25, 8, 3, "#111418");  // visor
      r(-5 + Math.round(lean * 2), -28, 10, 2, k.color);
      if (k.phase === "drive" && Math.floor(k.pos * 8) % 2) { r(-4, 2, 3, 2, "#c9cdd4"); r(2, 3, 2, 2, "#c9cdd4"); } // exhaust
      ctx.restore();
    }

    function bigText(text, color) {
      if (!text) return;
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111418";
      ctx.fillText(text, k.W / 2 + 2, k.H * 0.5 + 2);
      ctx.fillStyle = color;
      ctx.fillText(text, k.W / 2, k.H * 0.5);
    }

    let raf, last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!paused) update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    if (ui) {
      intro();
      onStick = (dir) => steer(k.lane + (dir === "left" ? -1 : 1));
    } else {
      k.phase = "drive";
      spawnGate();
    }
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }

  // ---------- SYLLABUS FIGHTER ----------

  const PLAYER = { name: "YOU", skin: "#f1c27d", hair: "#3a2a1a", gi: "#fbfaf6", belt: "#111418", pants: "#fbfaf6", glove: "#e5484d", band: "#e5484d" };
  const BOSSES = {
    frontier: { name: "THE OUTLAW", skin: "#e0ac69", hair: "#3a2a1a", gi: "#8a5a32", belt: "#3a2a1a", pants: "#5a3a1a", glove: "#3a2a1a", hat: "cowboy" },
    law: { name: "THE JUDGE", skin: "#f1c27d", hair: "#eceae4", gi: "#20242c", belt: "#20242c", pants: "#20242c", glove: "#fbfaf6", wig: true },
    science: { name: "DR. ENTROPY", skin: "#f1c27d", hair: "#5a3a1a", gi: "#fbfaf6", belt: "#3ce070", pants: "#5b6577", glove: "#3ce070", goggles: true },
    math: { name: "THE PROFESSOR", skin: "#e0ac69", hair: "#8f98a8", gi: "#1f7a4c", belt: "#f5ebcc", pants: "#5b6577", glove: "#f5ebcc", glasses: true },
    literature: { name: "THE CRITIC", skin: "#f1c27d", hair: "#a0453a", gi: "#8e5bd6", belt: "#f5ebcc", pants: "#3a2a1a", glove: "#f5ebcc", glasses: true },
    tech: { name: "THE GLITCH", skin: "#c68642", hair: "#2b2f36", gi: "#2b2f36", belt: "#6b9cf0", pants: "#3a4252", glove: "#6b9cf0", cap: true },
    health: { name: "THE SURGEON", skin: "#f1c27d", hair: "#2b2f36", gi: "#5fb7a8", belt: "#5fb7a8", pants: "#5fb7a8", glove: "#cfe8f2", mask: true },
    business: { name: "THE TYCOON", skin: "#e0ac69", hair: "#3a2a1a", gi: "#2e3f5c", belt: "#2e3f5c", pants: "#2e3f5c", glove: "#ffc94d", tie: true },
  };

  // A fighter facing right, 28 x 36 pixels. pose: "idle" | "punch"
  function fighterArt(f, pose) {
    let s = "";
    // legs and feet
    s += px(7, 22, 5, 11, f.pants) + px(16, 22, 5, 11, f.pants) + px(5, 33, 7, 2, INK) + px(16, 33, 7, 2, INK);
    // body
    s += px(8, 11, 12, 10, f.gi) + px(8, 20, 12, 2, f.belt);
    s += f.tie ? px(12, 11, 4, 6, "#fbfaf6") + px(13, 11, 2, 7, "#e5484d") : px(12, 11, 4, 4, f.skin);
    // head
    s += px(10, 2, 8, 9, f.skin) + px(16, 5, 1, 2, INK) + px(17, 8, 1, 1, "#a0453a");
    if (f.hat) s += px(9, -2, 10, 3, "#5a3a1a") + px(6, 1, 16, 1, "#5a3a1a") + px(10, 2, 8, 1, f.hair);
    else if (f.wig) s += px(9, 0, 10, 4, f.hair) + px(8, 2, 3, 9, f.hair) + px(9, 5, 1, 1, "#cfcbc0") + px(9, 8, 1, 1, "#cfcbc0");
    else if (f.cap) s += px(10, 0, 8, 3, "#ff4d2e") + px(17, 2, 5, 1, "#ff4d2e") + px(10, 3, 2, 3, f.hair);
    else s += px(10, 1, 8, 3, f.hair) + px(10, 3, 2, 4, f.hair);
    if (f.band) s += px(10, 3, 8, 1, f.band) + px(7, 3, 3, 1, f.band) + px(6, 4, 2, 1, f.band);
    if (f.glasses) s += px(14, 4, 4, 3, INK) + px(15, 5, 2, 1, "#cfe8f2");
    if (f.goggles) s += px(13, 4, 6, 2, "#3ce070") + px(10, 4, 3, 1, "#3ce070");
    if (f.mask) s += px(13, 7, 5, 3, "#cfe8f2");
    // arms
    if (pose === "punch") {
      s += px(18, 12, 8, 4, f.gi) + px(25, 11, 4, 5, f.glove);       // the punching arm, straight out
      s += px(14, 13, 4, 4, f.glove);                                 // the other fist kept at the chest
    } else {
      s += px(18, 12, 3, 5, f.gi) + px(19, 8, 4, 4, f.glove);        // guard up by the chin
      s += px(6, 12, 3, 5, f.gi) + px(15, 10, 3, 3, f.glove);
    }
    return s;
  }

  // Where each fighter stands (left edge) and where hits land on them. The menu's demo stands
  // them closer together so both fit on a narrow screen.
  const STANCE = { me: 82, them: 200, hitMe: 104, hitThem: 214 };
  const STANCE_NEAR = { me: 108, them: 174, hitMe: 127, hitThem: 193 };

  // The whole fight scene as one SVG: the stage, both fighters, and a layer for hit effects.
  function stageSVG(boss, at = STANCE) {
    const look = themeLook(game.trail.theme);
    let s = px(0, 0, 320, 90, look.sky) + px(262, 22, 12, 12, "#ffc94d");
    s += BACKDROPS[look.backdrop](look);
    s += px(0, 62, 320, 28, look.ground) + px(0, 62, 320, 2, look.edge);
    s += px(40, 66, 240, 3, look.edge) + px(56, 70, 208, 2, look.edge);
    const fighter = (id, f, x, flip) => `
      <g class="ft ${id}" id="f-${id}">
        <svg x="${x}" y="13" width="38" height="53" viewBox="-1 -3 30 39" overflow="visible">
          <g ${flip ? 'transform="translate(28 0) scale(-1 1)"' : ""}><g class="ft-art">${fighterArt(f, "idle")}</g></g>
        </svg>
      </g>`;
    s += fighter("me", PLAYER, at.me, false) + fighter("them", boss, at.them, true);
    return `<svg class="f-svg ${at === STANCE_NEAR ? "near" : ""}" viewBox="0 0 320 90" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" role="img" aria-label="You against ${boss.name}">${s}<g id="f-fx"></g></svg>`;
  }

  // move: "attack" (lunge and punch) | "hurt" | "ko" | "" (back to idle). later(fn, ms) schedules
  // the punch frames so the caller can cancel them.
  function fighterMove(who, move, data, later) {
    const g = $(`f-${who}`);
    if (!g) return;
    const art = g.querySelector(".ft-art");
    g.classList.remove("attack", "hurt", "ko");
    g.getBoundingClientRect(); // restart the animation
    if (move) g.classList.add(move);
    if (move === "attack") {
      later(() => (art.innerHTML = fighterArt(data, "punch")), 140);
      later(() => (art.innerHTML = fighterArt(data, "idle")), 420);
    } else {
      art.innerHTML = fighterArt(data, "idle");
    }
  }

  // A hit spark with a number (or COMBO!) over the fighter at x.
  function hitFx(text, x, kind, later) {
    const layer = $("f-fx");
    if (!layer) return;
    const star = document.createElementNS("http://www.w3.org/2000/svg", "g");
    star.setAttribute("class", `f-hit ${kind}`);
    star.innerHTML = `${px(x - 7, 36, 14, 2, "#ffd23f")}${px(x - 1, 30, 2, 14, "#ffd23f")}${px(x - 3, 34, 6, 6, "#fff")}
      <text x="${x}" y="52" text-anchor="middle">${text}</text>`;
    layer.append(star);
    later(() => star.remove(), 900);
  }

  function startFight(u) {
    const deck = makeDeck(u);
    const order = [game.trail.theme, ...Object.keys(BOSSES).filter((t) => t !== game.trail.theme)];
    const f = { round: 1, me: 100, them: 100, kos: 0, hits: 0, misses: 0, coins: 0, combo: 0, q: null, timeLeft: 0, timeMax: 0, busy: false };
    let timer = null;
    let boss = BOSSES[order[0]] || BOSSES.frontier;

    show(`
      <div class="fight">
        <div class="arc-bar">
          <button class="hud-btn" data-act="menu" aria-label="Back to the game menu">&lt;<span class="lbl"> MENU</span></button>
          <div class="hud-stat"><span class="k">ROUND</span><span class="v" id="f-round">1</span></div>
          <div class="hud-stat"><span class="k">KOs</span><span class="v" id="f-kos">0</span></div>
          <div class="hud-stat"><span class="k">COINS</span><span class="v" id="f-coins">+0</span></div>
        </div>
        <div class="f-stage">
          <div class="f-bars">
            <div class="f-hp"><span class="f-name">YOU</span><div class="f-bar"><i id="f-hp-me"></i></div></div>
            <div class="f-clock" id="f-clock" aria-label="Seconds left">--</div>
            <div class="f-hp them"><span class="f-name" id="f-boss">${boss.name}</span><div class="f-bar"><i id="f-hp-them"></i></div></div>
          </div>
          <div class="f-scene" id="f-scene">${stageSVG(boss)}</div>
        </div>
        <div class="card f-q" id="f-q"></div>
      </div>`);
    root().querySelector("[data-act=menu]").addEventListener("click", openMenu);

    const bars = () => {
      $("f-hp-me").style.width = `${f.me}%`;
      $("f-hp-them").style.width = `${f.them}%`;
      $("f-hp-me").classList.toggle("low", f.me <= 30);
      $("f-hp-them").classList.toggle("low", f.them <= 30);
      $("f-round").textContent = f.round;
      $("f-kos").textContent = f.kos;
      $("f-coins").textContent = `+${f.coins}`;
    };
    bars();

    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const timers = [];

    const act = (who, move) => fighterMove(who, move, who === "me" ? PLAYER : boss, later);
    const fx = (text, x, kind) => hitFx(text, x, kind, later);

    function intro() {
      setQ(`<div class="message">
        <h2>SYLLABUS FIGHTER</h2>
        <p>Every question is a round of blows. Answer right to hit ${escapeHTML(boss.name)}; three in a row is a combo.
        A wrong answer, or running out of time, and you take the hit. Knock out the boss to face the next one.</p>
        <button class="btn-next" data-pad="0">FIGHT!<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: () => { Sound.play("go"); nextQuestion(); }, 1: openMenu });
    }

    function setQ(html, buttons) {
      $("f-q").innerHTML = html;
      if (buttons) wireButtons(buttons);
    }

    function nextQuestion() {
      f.q = deck.next();
      f.busy = false;
      const q = f.q;
      f.timeMax = Math.max(q.difficulty === "hard" ? 11 : 8, (q.difficulty === "hard" ? 20 : 15) - (f.round - 1) * 1.5);
      f.timeLeft = f.timeMax;
      setQ(`
        <div class="q-top"><span class="diff ${q.difficulty === "hard" ? "hard" : "easy"}">${q.difficulty === "hard" ? "HARD" : "EASY"}</span>
          <p class="q-count">${escapeHTML(game.trail.units[u].topic)}</p></div>
        <p class="q-text">${escapeHTML(q.question)}</p>
        <div class="answers">${q.choices.map((c, i) => `<button class="answer" data-i="${i}"><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(c)}</span></button>`).join("")}</div>
        <div class="feedback" id="f-feedback"></div>`);
      $("f-q").querySelectorAll(".answer").forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.i))));
      onPad = (i) => { answer(i); return true; };
      clearInterval(timer);
      timer = setInterval(tick, 100);
      tick();
    }

    function tick() {
      if (paused || f.busy) return;
      f.timeLeft -= 0.1;
      const n = Math.max(0, Math.ceil(f.timeLeft));
      $("f-clock").textContent = n;
      $("f-clock").classList.toggle("hurry", n <= 3);
      if (f.timeLeft <= 0) answer(-1);
    }

    function answer(i) {
      if (f.busy || !f.q) return;
      f.busy = true;
      clearInterval(timer);
      const q = f.q;
      const right = i === q.answerIndex;
      $("f-q").querySelectorAll(".answer").forEach((b, j) => {
        b.disabled = true;
        b.classList.add(j === q.answerIndex ? "right" : j === i ? "wrong" : "dim");
      });
      if (right) {
        f.hits++;
        f.combo++;
        const dmg = (q.difficulty === "hard" ? 30 : 20) + (f.combo >= 3 ? 10 : 0);
        f.them = Math.max(0, f.them - dmg);
        act("me", "attack");
        later(() => {
          act("them", "hurt");
          fx(f.combo >= 3 ? "COMBO!" : `-${dmg}`, STANCE.hitThem, "good");
          Sound.play("punch");
          bars();
        }, 220);
        $("f-feedback").innerHTML = `<span class="gain">HIT! -${dmg}${f.combo >= 3 ? ` &middot; COMBO x${f.combo}` : ""}</span>`;
        later(() => (f.them ? nextQuestion() : bossDown()), 1300);
      } else {
        f.misses++;
        f.combo = 0;
        const dmg = Math.min(35, 20 + (f.round - 1) * 5);
        f.me = Math.max(0, f.me - dmg);
        deck.again(q);
        act("them", "attack");
        later(() => {
          act("me", "hurt");
          fx(`-${dmg}`, STANCE.hitMe, "bad");
          Sound.play("punch");
          later(() => Sound.play("wrong"), 120);
          bars();
        }, 220);
        $("f-feedback").innerHTML = `
          <span class="loss">${i < 0 ? "TIME UP!" : "OUCH!"} -${dmg} HP</span>
          <button class="btn-next" data-pad="0">${f.me ? "CONTINUE" : "..."}<span class="hint" aria-hidden="true">A</span></button>
          ${q.explanation ? `<p class="why">${escapeHTML(q.explanation)}</p>` : ""}`;
        const go = () => (f.me ? nextQuestion() : playerDown());
        wireButtons({ 0: go });
        if (!f.me) later(playerDown, 1400);
      }
    }

    function bossDown() {
      f.kos++;
      const prize = 25 + 10 * (f.round - 1);
      f.coins += prize;
      earn(prize);
      act("them", "ko");
      Sound.play("ko");
      later(() => Sound.play("win"), 500);
      const b = best();
      if (f.kos > (b.fight || 0)) { b.fight = f.kos; persistGame(); }
      bars();
      $("f-clock").textContent = "KO";
      setQ(`<div class="message">
        <h2>K.O.! YOU WIN ROUND ${f.round}</h2>
        <p>${escapeHTML(boss.name)} is down. +${prize} coins. You catch your breath (+30 HP) before the next fight.</p>
        <button class="btn-next" data-pad="0">NEXT FIGHT<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: nextRound, 1: openMenu });
    }

    function nextRound() {
      f.round++;
      boss = BOSSES[order[(f.round - 1) % order.length]] || BOSSES.frontier;
      f.them = 100;
      f.me = Math.min(100, f.me + 30);
      f.combo = 0;
      $("f-boss").textContent = boss.name;
      $("f-scene").innerHTML = stageSVG(boss);
      bars();
      Sound.play("go");
      nextQuestion();
    }

    function playerDown() {
      if (f.over) return;
      f.over = true;
      act("me", "ko");
      Sound.play("lose");
      $("f-clock").textContent = "KO";
      const tries = f.hits + f.misses;
      setQ(`<div class="message">
        <h2>K.O. &middot; GAME OVER</h2>
        <div class="stats">
          <div><b>${f.kos}</b><span>bosses beaten</span></div>
          <div><b>${tries ? Math.round((100 * f.hits) / tries) : 0}%</b><span>accuracy</span></div>
          <div><b>+${f.coins}</b><span>coins won</span></div>
          <div><b>${best().fight || 0}</b><span>best</span></div>
        </div>
        <button class="btn-next" data-pad="0">FIGHT AGAIN<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: () => { if (mode === "fight") stop = startFight(u); }, 1: openMenu });
    }

    intro();
    return () => {
      clearInterval(timer);
      timers.forEach(clearTimeout);
    };
  }

  // ---------- FLAPPY FACTS ----------

  const WALL_W = 26;

  // demo: an element to play a silent, self-flying demo in (for the menu). Returns a stop function.
  function startFlap(u, demo = null) {
    const ui = !demo;
    const sfx = (name) => { if (ui) Sound.play(name); };
    const deck = ui ? makeDeck(u) : null;
    const look = themeLook(game.trail.theme);
    const b = {
      phase: "intro", lives: 3, walls: 0, misses: 0, coins: 0, y: 100, vy: 0, list: [], q: null, next: 0,
      scroll: 0, shake: 0, flash: 0, flashColor: "", blink: 0, t: 0, W: 320, H: 240,
    };

    if (demo) demo.innerHTML = "<canvas></canvas>";
    else show(`
      <div class="kart flap">
        <div class="arc-bar">
          <button class="hud-btn" data-act="menu" aria-label="Back to the game menu">&lt;<span class="lbl"> MENU</span></button>
          <div class="lives" id="k-lives"></div>
          <div class="hud-stat"><span class="k">WALLS</span><span class="v" id="k-gates">0</span></div>
          <div class="hud-stat"><span class="k">COINS</span><span class="v" id="k-coins">+0</span></div>
        </div>
        <div class="k-q" id="k-q"></div>
        <div class="k-road" id="k-road">
          <canvas aria-label="Your bird and the wall of answers. Tap or press any button to flap."></canvas>
          <div class="k-card" id="k-card"></div>
        </div>
      </div>`);
    if (ui) root().querySelector("[data-act=menu]").addEventListener("click", openMenu);
    const box = demo || $("k-road");
    const canvas = box.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    // Always 240 pixels tall (so the gaps keep their size); as wide as the screen's shape allows.
    const fit = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      b.H = 240;
      b.W = Math.max(180, Math.min(720, Math.round((240 * r.width) / r.height)));
      canvas.width = b.W;
      canvas.height = b.H;
      ctx.imageSmoothingEnabled = false;
    };
    const resize = new ResizeObserver(fit);
    resize.observe(box);
    fit();

    // The play area, and the wall's four gaps (A-D from top to bottom), in canvas pixels.
    const groundY = () => Math.round(b.H * 0.88);
    const birdX = () => Math.round(b.W * 0.26);
    const gaps = () => {
      const playH = groundY();
      const gapH = playH * 0.17;
      const solid = (playH - 4 * gapH) / 5;
      return [0, 1, 2, 3].map((i) => ({ top: solid * (i + 1) + gapH * i, bottom: solid * (i + 1) + gapH * (i + 1) }));
    };
    // a wall takes about 8 seconds to reach the bird, a little less after each one you clear
    const speed = () => ((b.W - birdX()) / 8) * (1 + Math.min(0.8, b.walls * 0.05));
    const active = () => b.list.find((w) => !w.judged);

    const renderLives = () => {
      if (!ui) return;
      $("k-lives").innerHTML = heartsHTML(b.lives, 3);
      $("k-lives").setAttribute("aria-label", `${b.lives} of 3 lives left`);
    };
    renderLives();

    // gap: the one the bird went through (-1: it crashed)
    const renderQuestion = (result) => {
      if (!ui) return;
      const q = b.q;
      if (!q) { $("k-q").innerHTML = ""; return; }
      $("k-q").innerHTML = `
        <p class="k-qtext">${escapeHTML(q.question)}</p>
        <div class="k-choices">${q.choices.map((c, i) => {
          const cls = !result ? "" : i === q.answerIndex ? " right" : i === result.gap ? " wrong" : " dim";
          return `<div class="k-choice${cls}"><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(c)}</span></div>`;
        }).join("")}</div>
        ${result && !result.right && q.explanation ? `<p class="k-why">${result.gap < 0 ? "Crashed! " : ""}${escapeHTML(q.explanation)}</p>` : ""}`;
    };

    const card = (html, buttons) => {
      $("k-card").innerHTML = html;
      $("k-card").hidden = false;
      wireButtons(buttons);
    };

    function popText(text, kind) {
      const pop = document.createElement("div");
      pop.className = `k-pop ${kind}`;
      pop.textContent = text;
      box.append(pop);
      setTimeout(() => pop.remove(), 1100);
    }

    function intro() {
      b.phase = "intro";
      card(`<div class="card message">
        <h2>FLAPPY FACTS</h2>
        <p>A wall with four gaps (A, B, C, D) is coming. Flap through the gap with the right answer.
        Tap the screen, press any arcade button, or Space to flap. A wrong gap, the wall or the ground costs a life. You have 3.</p>
        <button class="btn-next" data-pad="0">START<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: ready, 1: openMenu });
    }

    function ready() {
      $("k-card").hidden = true;
      Object.assign(b, { phase: "ready", lives: 3, walls: 0, misses: 0, coins: 0, list: [], q: null, next: 0, blink: 0 });
      renderLives();
      $("k-gates").textContent = "0";
      $("k-coins").textContent = "+0";
      renderQuestion();
      onPad = () => { flap(); return true; };
      sfx("press");
    }

    function flap() {
      if (b.phase === "ready") {
        b.phase = "fly";
        spawnWall();
      }
      if (b.phase !== "fly") return;
      b.vy = -120;
      sfx("flap");
    }

    function spawnWall() {
      const wall = { x: b.W + 4, judged: false, gap: -1 };
      if (ui) b.q = deck.next();
      else {
        // the demo bird usually heads for the right gap
        const answerIndex = Math.floor(Math.random() * 4);
        b.q = { answerIndex };
        wall.aim = Math.random() < 0.8 ? answerIndex : (answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
      }
      wall.q = b.q;
      b.list.push(wall);
      renderQuestion();
    }

    function judge(wall) {
      wall.judged = true;
      const q = wall.q;
      const right = wall.gap === q.answerIndex;
      if (right) {
        const coins = q.difficulty === "hard" ? 10 : 5;
        b.walls++;
        b.coins += coins;
        if (ui) earn(coins);
        b.flash = 1; b.flashColor = "31,157,85";
        popText(`+${coins} COINS`, "good");
        sfx("right");
        setTimeout(() => sfx("coindrop"), 200);
        b.next = 1.2;
      } else {
        loseLife(q);
        popText("WRONG GAP! -1 LIFE", "bad");
        sfx("wrong");
        b.next = 2.4;
      }
      updateStats();
      renderQuestion({ right, gap: wall.gap });
      if (!b.lives) b.phase = "dead";
    }

    // Hit the wall or the ground: back to the middle, and the question counts as missed.
    function crash() {
      const wall = active();
      if (wall) {
        wall.judged = true;
        b.list = b.list.filter((w) => w !== wall);
        renderQuestion({ right: false, gap: -1 });
      }
      loseLife(wall?.q);
      popText("CRASH! -1 LIFE", "bad");
      sfx("crash");
      b.shake = 0.5;
      b.blink = 1.6;
      b.y = groundY() * 0.45;
      b.vy = 0;
      b.next = 2.4;
      updateStats();
      b.phase = b.lives ? "hover" : "dead";
    }

    function loseLife(q) {
      if (ui) b.lives--;
      b.misses++;
      b.flash = 1; b.flashColor = "217,58,58";
      if (ui && q) deck.again(q);
      renderLives();
    }

    function updateStats() {
      if (!ui) return;
      $("k-gates").textContent = b.walls;
      $("k-coins").textContent = `+${b.coins}`;
    }

    function gameOver() {
      b.phase = "over";
      b.q = null;
      const record = b.walls > (best().flap || 0);
      if (record) best().flap = b.walls;
      persistGame();
      renderQuestion();
      sfx("lose");
      const tries = b.walls + b.misses;
      card(`<div class="card message">
        <h2>${record && b.walls ? "NEW RECORD!" : "GAME OVER"}</h2>
        <div class="stats">
          <div><b>${b.walls}</b><span>walls cleared</span></div>
          <div><b>${tries ? Math.round((100 * b.walls) / tries) : 0}%</b><span>accuracy</span></div>
          <div><b>+${b.coins}</b><span>coins won</span></div>
          <div><b>${best().flap || 0}</b><span>best</span></div>
        </div>
        <button class="btn-next" data-pad="0">FLY AGAIN<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: ready, 1: openMenu });
    }

    function update(dt) {
      b.t += dt;
      b.shake = Math.max(0, b.shake - dt);
      b.flash = Math.max(0, b.flash - dt * 2.2);
      b.blink = Math.max(0, b.blink - dt);
      if (b.phase !== "over") b.scroll += speed() * dt;
      for (const w of b.list) w.x -= speed() * dt;
      b.list = b.list.filter((w) => w.x + WALL_W > -8);

      if (b.phase === "intro" || b.phase === "ready" || b.phase === "hover") {
        // hover in the middle until it's time to fly
        b.y = groundY() * 0.45 + Math.sin(b.t * 4) * 4;
        b.vy = 0;
        if (b.phase === "hover") {
          b.next -= dt;
          if (b.next <= 0) {
            b.phase = "fly";
            if (!active()) spawnWall();
            b.vy = -90;
          }
        }
        return;
      }
      if (b.phase === "dead") {
        b.next -= dt;
        b.vy = Math.min(240, b.vy + 430 * dt);
        b.y = Math.min(groundY() - 5, b.y + b.vy * dt);
        if (b.next <= 1.2) gameOver();
        return;
      }
      if (b.phase !== "fly") return;

      // the demo bird flaps toward the middle of the gap it's aiming for
      const wall = active();
      if (!ui) {
        const g = wall ? gaps()[wall.aim] : null;
        const target = g ? (g.top + g.bottom) / 2 : groundY() * 0.45;
        if (b.y > target + 6 && b.vy > -30) flap();
      }

      b.vy = Math.min(240, b.vy + 430 * dt);
      b.y += b.vy * dt;
      if (b.y < 5) { b.y = 5; b.vy = 0; }
      if (b.y + 5 >= groundY()) return crash();

      if (wall) {
        const bx = birdX();
        if (bx + 4 > wall.x && bx - 4 < wall.x + WALL_W) {
          const gap = gaps().findIndex((g) => b.y - 4 >= g.top && b.y + 4 <= g.bottom);
          if (gap < 0) return crash();
          wall.gap = gap;
        } else if (bx - 4 >= wall.x + WALL_W) {
          judge(wall);
        }
      } else {
        b.next -= dt;
        if (b.next <= 0) spawnWall();
      }
    }

    // ---- drawing ----

    function draw() {
      const { W, H } = b;
      const gy = groundY();
      ctx.save();
      if (b.shake) ctx.translate(Math.round((Math.random() - 0.5) * 8 * b.shake), Math.round((Math.random() - 0.5) * 6 * b.shake));
      ctx.fillStyle = look.sky; ctx.fillRect(-8, -8, W + 16, H + 16);
      ctx.fillStyle = "#ffc94d"; ctx.fillRect(W - 50, Math.round(H * 0.1), 12, 12);
      ctx.fillStyle = "#fff";
      for (const [cx, cy] of [[40, 0.18], [190, 0.3], [300, 0.12]]) {
        const x = Math.round(((cx - b.scroll * 0.15) % (W + 60) + W + 60) % (W + 60)) - 30;
        ctx.fillRect(x, Math.round(H * cy), 26, 5); ctx.fillRect(x + 6, Math.round(H * cy) - 4, 14, 4);
      }
      ctx.fillStyle = look.far;
      for (let x = -8; x < W + 8; x += 8) {
        const p = x + b.scroll * 0.35;
        const h = Math.round(H * 0.1 + 6 * Math.sin(p / 23) + 4 * Math.sin(p / 9));
        ctx.fillRect(x, gy - h, 8, h);
      }
      for (const w of b.list) drawWall(w);
      // ground
      ctx.fillStyle = look.ground; ctx.fillRect(-8, gy, W + 16, H - gy + 8);
      ctx.fillStyle = look.edge; ctx.fillRect(-8, gy, W + 16, 3);
      for (let x = -(b.scroll % 16); x < W; x += 16) ctx.fillRect(Math.round(x), gy + 6, 8, 3);
      if (!(b.blink && Math.floor(b.t * 12) % 2)) drawBird();
      if (b.phase === "ready") label("TAP TO FLAP");
      if (b.phase === "hover") label("GET READY");
      ctx.restore();
      if (b.flash) {
        ctx.fillStyle = `rgba(${b.flashColor},${(b.flash * 0.35).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawWall(w) {
      const x = Math.round(w.x);
      const gy = groundY();
      const gs = gaps();
      const done = w.judged;
      // the solid parts between (and around) the gaps
      let top = 0;
      for (let i = 0; i <= 4; i++) {
        const bottom = i < 4 ? gs[i].top : gy;
        ctx.fillStyle = "#1f6e3a"; ctx.fillRect(x, Math.round(top), WALL_W, Math.round(bottom - top));
        ctx.fillStyle = "#3ca55c"; ctx.fillRect(x + 2, Math.round(top), WALL_W - 4, Math.round(bottom - top));
        ctx.fillStyle = "#6fcf8a"; ctx.fillRect(x + 5, Math.round(top), 3, Math.round(bottom - top));
        if (i < 4) top = gs[i].bottom;
      }
      // each gap: colored lips and its letter
      gs.forEach((g, i) => {
        const dim = done && i !== w.q.answerIndex;
        const color = dim ? "#9aa3b2" : LANE_COLORS[i];
        ctx.fillStyle = INK;
        ctx.fillRect(x - 3, Math.round(g.top) - 4, WALL_W + 6, 4);
        ctx.fillRect(x - 3, Math.round(g.bottom), WALL_W + 6, 4);
        ctx.fillStyle = color;
        ctx.fillRect(x - 2, Math.round(g.top) - 3, WALL_W + 4, 2);
        ctx.fillRect(x - 2, Math.round(g.bottom) + 1, WALL_W + 4, 2);
        const size = g.bottom - g.top >= 30 ? 16 : 8;
        ctx.font = `${size}px "Press Start 2P", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK;
        ctx.fillText("ABCD"[i], x + WALL_W / 2 + 1, (g.top + g.bottom) / 2 + 2);
        ctx.fillStyle = color;
        ctx.fillText("ABCD"[i], x + WALL_W / 2, (g.top + g.bottom) / 2 + 1);
      });
    }

    function drawBird() {
      const tilt = Math.max(-0.5, Math.min(0.9, b.vy / 300));
      const wingUp = b.phase === "fly" ? b.vy < 0 : Math.floor(b.t * 6) % 2 === 0;
      ctx.save();
      ctx.translate(birdX(), Math.round(b.y));
      ctx.rotate(tilt);
      const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
      r(-8, -6, 14, 12, INK);
      r(-7, -5, 12, 10, "#ffc94d");
      r(-7, 2, 12, 3, "#ffb000");
      r(1, -5, 5, 5, "#fff"); r(4, -3, 2, 2, INK);     // eye
      r(6, -1, 5, 3, INK); r(6, 0, 4, 2, "#ff8a3d");   // beak
      if (wingUp) { r(-9, -6, 7, 4, INK); r(-8, -5, 5, 2, "#fff"); }
      else { r(-9, 0, 7, 4, INK); r(-8, 1, 5, 2, "#fff"); }
      ctx.restore();
    }

    function label(text) {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const y = Math.round(groundY() * 0.45) - 22;
      ctx.fillStyle = INK; ctx.fillText(text, b.W / 2 + 1, y + 1);
      ctx.fillStyle = "#fff"; ctx.fillText(text, b.W / 2, y);
    }

    let raf, last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!paused) update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    if (ui) {
      intro();
      canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); flap(); });
      onKey = (key) => {
        if (key === " " || key === "ArrowUp") { flap(); return true; }
        return false;
      };
    } else {
      b.phase = "fly";
      spawnWall();
    }
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }

  // ---------- the menu's demos for Trail Quest and Syllabus Fighter ----------

  // The wagon rolling along the trail toward the first landmark, over and over.
  function trailTrailer(el) {
    // a narrow screen shows only the middle of the 320-wide scene, so drive across that part
    const shown = Math.min(320, (90 * el.clientWidth) / Math.max(1, el.clientHeight));
    const from = Math.max(30, 160 - shown / 2 + 16);
    const to = Math.min(262, 160 + shown / 2 - 24);
    let x = from;
    const draw = () => {
      el.innerHTML = trailSceneSVG({
        theme: game.trail.theme, startSign: true, reached: false, x, cover: paintColor(), label: "Trail Quest",
      }).replace(' id="wagon"', "");
    };
    draw();
    const timer = setInterval(() => {
      if (paused) return;
      x += Math.max(10, (to - from) / 9);
      if (x > to) { x = from; return draw(); }
      const wagon = el.querySelector(".wagon");
      if (wagon) wagon.style.transform = `translateX(${x}px)`;
    }, 750);
    return () => clearInterval(timer);
  }

  // You and the boss trading blows until someone is knocked out, then a rematch.
  function fightTrailer(el) {
    const boss = BOSSES[game.trail.theme] || BOSSES.frontier;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    let hp = { me: 100, them: 100 };
    let rest = 0;
    const draw = () => {
      el.innerHTML = `
        <div class="f-bars">
          <div class="f-hp"><span class="f-name">YOU</span><div class="f-bar"><i data-hp="me"></i></div></div>
          <div class="f-clock">VS</div>
          <div class="f-hp them"><span class="f-name">${boss.name}</span><div class="f-bar"><i data-hp="them"></i></div></div>
        </div>${stageSVG(boss, STANCE_NEAR)}`;
    };
    const bars = () => {
      for (const who of ["me", "them"]) {
        const bar = el.querySelector(`[data-hp=${who}]`);
        if (bar) { bar.style.width = `${hp[who]}%`; bar.classList.toggle("low", hp[who] <= 30); }
      }
    };
    draw();
    bars();
    const timer = setInterval(() => {
      if (paused) return;
      if (rest) {
        if (--rest === 0) { hp = { me: 100, them: 100 }; draw(); bars(); }
        return;
      }
      const attacker = Math.random() < 0.62 ? "me" : "them";
      const target = attacker === "me" ? "them" : "me";
      const dmg = 20 + 10 * Math.floor(Math.random() * 2);
      fighterMove(attacker, "attack", attacker === "me" ? PLAYER : boss, later);
      later(() => {
        hp[target] = Math.max(0, hp[target] - dmg);
        fighterMove(target, hp[target] ? "hurt" : "ko", target === "me" ? PLAYER : boss, later);
        hitFx(hp[target] ? `-${dmg}` : "K.O.!", target === "me" ? STANCE_NEAR.hitMe : STANCE_NEAR.hitThem, attacker === "me" ? "good" : "bad", later);
        bars();
        if (!hp[target]) rest = 2;
      }, 220);
    }, 1200);
    return () => {
      clearInterval(timer);
      timers.forEach(clearTimeout);
    };
  }

  // ---------- controls (called from game.js) ----------

  return {
    openMenu,
    close,
    isOpen: () => mode !== null && !paused,
    isPaused: () => mode !== null && paused,
    // The study timer covers the game for a while.
    pause(on) {
      if (mode === null) return;
      paused = on;
      root().hidden = on;
      $("views").inert = !on;
    },
    pad(i) {
      return onPad ? onPad(i) : false;
    },
    // Keys while a game is open. Returns true if the key was used.
    key(e) {
      if (e.key === "Escape") {
        if (mode === "menu") return false;
        openMenu();
        return true;
      }
      if (onKey?.(e.key)) return true;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const dir = e.key === "ArrowLeft" ? "left" : "right";
        wiggleStick(dir);
        onStick?.(dir);
        return true;
      }
      if (e.key.length !== 1) return false;
      const i = "1234".includes(e.key) ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i < 0) return false;
      pressPad(i);
      return true;
    },
  };
})();
