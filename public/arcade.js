// The machine's game menu, and four more games that quiz you on the same syllabus questions:
//   QUIZ KART: four lanes, four answers. Steer into the lane of the right answer before you
//   reach the gate. A wrong lane costs one of your 5 lives.
//   SYLLABUS FIGHTER: a one-on-one fight. Right answers land hits on the boss; a wrong answer,
//   or running out of time, lets the boss hit you. Knock out one boss and the next steps up.
//   FLAPPY FACTS: flap through the gap in the wall marked with the right answer. 3 lives.
//   QUIZ BLOCKS: falling blocks; every few pieces a quiz blasts away rows (right) or adds junk (wrong).
// The menu works like an arcade's attract screen: one game at a time, with a trailer of it playing
// itself (Kart, Flappy and Blocks run on autopilot), and arrows to flip to the next game.
// Everything runs on an overlay that covers the machine's screen and uses the arcade buttons:
// A-D (or keys 1-4 / A-D) pick an answer, the arrow keys move the joystick, Escape goes back.
// Coins won here go into the same wallet as the trail game, so they spend in its store.

const Arcade = (() => {
  const root = () => $("arcade");
  let mode = null;     // null (closed) | "menu" | "kart" | "fight" | "flap" | "blocks"
  let paused = false;  // hidden while the study timer is open
  let unit = null;     // the unit Quiz Kart and Syllabus Fighter quiz you on
  let stop = null;     // stops the running game's loop and timers
  let onPad = null;    // what the current screen does with arcade button i (returns true if handled)
  let onStick = null;  // what the current screen does with the joystick ("left" | "right")
  let onKey = null;    // other keys the current screen uses (returns true if handled)
  let pick = 0;        // the game showing on the menu
  let loadSeq = 0;     // bumped whenever the screen changes, so a slow load can't take over later

  // trailer(el) plays a demo of the game in el and returns a function that stops it.
  const GAMES = [
    { id: "trail", name: "TRAIL QUEST", desc: "Take your wagon from the first unit to the final exam: a lesson, then questions, for every unit.", trailer: trailTrailer },
    { id: "blocks", name: "QUIZ BLOCKS", desc: "Tetris-style falling blocks. Every 6 pieces, a quiz: right blasts 2 rows away, wrong adds a junk row.", trailer: (el) => startBlocks(null, el), start: startBlocks },
    { id: "kart", name: "QUIZ KART", desc: "Steer into the lane with the right answer before you reach the gate. 5 lives.", trailer: (el) => startKart(null, el), start: startKart },
    { id: "fight", name: "SYLLABUS FIGHTER", desc: "Right answers land hits. Miss, or run out of time, and the boss hits back.", trailer: fightTrailer, start: startFight },
    { id: "flap", name: "FLAPPY FACTS", desc: "Flap through the gap in the wall with the right answer. 3 lives.", trailer: (el) => startFlap(null, el), start: startFlap },
    { id: "snake", name: "SNAKE SMARTS", desc: "Classic snake. Four snacks marked A-D: eat the one with the right answer. 3 lives.", trailer: (el) => startSnake(null, el), start: startSnake },
    { id: "invaders", name: "QUIZ INVADERS", desc: "Space-invaders style. Shoot the invader with the right answer before they land. 3 lives.", trailer: (el) => startInvaders(null, el), start: startInvaders },
    { id: "breakout", name: "BRICK BREAKER", desc: "Bounce the ball into the brick with the right answer. Don't drop it! 3 lives.", trailer: (el) => startBreakout(null, el), start: startBreakout },
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
    loadSeq++;
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
      blocks: b.blocks ? `BEST: ${plural(b.blocks, "LINE")}` : "NEW!",
      snake: b.snake ? `BEST: ${plural(b.snake, "SNACK")}` : "NEW!",
      invaders: b.invaders ? `BEST: ${plural(b.invaders, "HIT")}` : "NEW!",
      breakout: b.breakout ? `BEST: ${plural(b.breakout, "BRICK")}` : "NEW!",
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
    const token = ++loadSeq;
    if (!game.banks[u]?.length) {
      mode = id;
      show(`<div class="arc-center"><div class="card message">
        <h2>LOADING<span class="loading-dots"></span></h2>
        <p>Writing questions about ${escapeHTML(game.trail.units[u].topic)}.</p></div></div>`);
      try {
        await questionsFor(u);
      } catch (err) {
        if (token !== loadSeq || mode !== id) return;
        show(`<div class="arc-center"><div class="card message">
          <h2>SOMETHING WENT WRONG</h2><p>${escapeHTML(err.message || "Couldn't load this unit.")}</p>
          <button class="btn-next" data-pad="0">TRY AGAIN</button><button class="btn-ghost" data-pad="1">MENU</button></div></div>`);
        wireButtons({ 0: () => loadThen(start, id), 1: openMenu });
        return;
      }
      if (token !== loadSeq || mode !== id) return; // left (or started something else) while loading
    }
    fillBank(u);
    mode = id;
    stop = start(u);
  }

  // Buttons marked data-pad="i" are pressed by arcade button i too.
  // Only visible buttons count, so a hidden card's buttons can't be pressed by accident.
  function wireButtons(actions) {
    const button = (i) => [...root().querySelectorAll(`[data-pad="${i}"]`)].find((b) => b.offsetParent && !b.disabled);
    for (const [i, fn] of Object.entries(actions)) button(i)?.addEventListener("click", fn);
    onPad = (i) => {
      button(i)?.click();
      return true;
    };
  }

  function close() {
    loadSeq++;
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
    let alive = true;
    const sfx = (name) => { if (ui && alive) Sound.play(name); };
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
      alive = false;
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

    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

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
    let alive = true;
    const sfx = (name) => { if (ui && alive) Sound.play(name); };
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

    // At least 240 pixels tall (so the gaps keep their size) and 180 wide, keeping the screen's shape.
    const fit = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const ratio = r.width / r.height;
      b.H = Math.max(240, Math.round(180 / ratio));
      b.W = Math.min(720, Math.round(b.H * ratio));
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
      const gapH = playH * 0.205; // big gaps: the solid bits between them are thin
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
        b.next = 2;
      } else {
        loseLife(q);
        popText("WRONG GAP! -1 LIFE", "bad");
        sfx("wrong");
        b.next = 2.8;
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
        if (bx + 3 > wall.x && bx - 3 < wall.x + WALL_W) {
          const gap = gaps().findIndex((g) => b.y - 3 >= g.top && b.y + 3 <= g.bottom); // a forgiving hitbox
          if (gap < 0) return crash();
          wall.gap = gap;
        } else if (bx - 3 >= wall.x + WALL_W) {
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
      alive = false;
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }

  // ---------- QUIZ BLOCKS ----------
  // Falling-block puzzle. Every QUIZ_EVERY pieces a QUIZ DROP pauses the game for a question:
  // right blasts away your bottom two rows, wrong pushes a junk row up from the bottom.

  const COLS = 10, ROWS = 20, CELL = 10;
  const QUIZ_EVERY = 6;
  const SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };
  const BLOCK_COLORS = { I: "#3fc1d9", O: "#ffc94d", T: "#8e5bd6", S: "#3ca55c", Z: "#e5484d", J: "#3b6fe0", L: "#ff8a3d", X: "#8f98a8" };

  // demo: an element to play a silent, self-playing demo in (for the menu). Returns a stop function.
  function startBlocks(u, demo = null) {
    const ui = !demo;
    const sfx = (name) => { if (ui && t.alive) Sound.play(name); };
    const deck = ui ? makeDeck(u) : null;
    const t = {
      phase: "intro", board: [], piece: null, next: null, bag: [], lines: 0, coins: 0, right: 0, wrong: 0,
      untilQuiz: QUIZ_EVERY, fall: 0, q: null, flash: 0, flashColor: "", shake: 0, banner: "", bannerT: 0,
      W: 240, H: 220, ai: null, aiT: 0, alive: true,
    };

    if (demo) demo.innerHTML = "<canvas></canvas>";
    else show(`
      <div class="kart blocks">
        <div class="arc-bar">
          <button class="hud-btn" data-act="menu" aria-label="Back to the game menu">&lt;<span class="lbl"> MENU</span></button>
          <div class="hud-stat"><span class="k">LINES</span><span class="v" id="k-gates">0</span></div>
          <div class="hud-stat"><span class="k">QUIZZES</span><span class="v" id="t-quiz">0/0</span></div>
          <div class="hud-stat"><span class="k">COINS</span><span class="v" id="k-coins">+0</span></div>
        </div>
        <div class="k-q" id="k-q"></div>
        <div class="k-road" id="k-road">
          <canvas aria-label="The block well. Use the arcade buttons: A left, B rotate, C right, D drop."></canvas>
          <div class="k-card" id="k-card"></div>
        </div>
      </div>`);
    if (ui) root().querySelector("[data-act=menu]").addEventListener("click", openMenu);
    const box = demo || $("k-road");
    const canvas = box.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    // At least 220 pixels tall (the well is 200) and 190 wide, keeping the screen's shape.
    const fit = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const ratio = r.width / r.height;
      t.H = Math.max(220, Math.round(190 / ratio));
      t.W = Math.min(720, Math.round(t.H * ratio));
      canvas.width = t.W;
      canvas.height = t.H;
      ctx.imageSmoothingEnabled = false;
    };
    const resize = new ResizeObserver(fit);
    resize.observe(box);
    fit();
    const wellX = () => Math.round(t.W / 2 - 75);
    const wellTop = () => Math.round((t.H - ROWS * CELL) / 2);

    // ---- pieces and the well ----

    const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    function takeFromBag() {
      if (!t.bag.length) t.bag = shuffle(Object.keys(SHAPES));
      return t.bag.pop();
    }
    const cellsOf = (p) => p.cells.map(([x, y]) => [p.x + x, p.y + y]);
    const fits = (p) => cellsOf(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !t.board[y][x]));
    function rotated(p) {
      if (p.type === "O") return p;
      const size = p.type === "I" ? 4 : 3;
      return { ...p, cells: p.cells.map(([x, y]) => [size - 1 - y, x]) };
    }
    function spawn() {
      const type = t.next || takeFromBag();
      t.next = takeFromBag();
      t.piece = { type, cells: SHAPES[type].map((c) => [...c]), x: 3, y: type === "I" ? -1 : 0 };
      if (!fits(t.piece)) return gameOver();
      if (!ui) t.ai = bestMove(t.piece);
    }
    // both return false when blocked
    function move(dx) {
      if (t.phase !== "play") return false;
      const p = { ...t.piece, x: t.piece.x + dx };
      if (!fits(p)) return false;
      t.piece = p;
      sfx("step");
      return true;
    }
    function rotate() {
      if (t.phase !== "play") return false;
      const r = rotated(t.piece);
      for (const kick of [0, -1, 1, -2, 2]) {
        const p = { ...r, x: r.x + kick };
        if (fits(p)) { t.piece = p; sfx("blip"); return true; }
      }
      return false;
    }
    // One row down; locks the piece when it can't go further. Returns false once locked.
    function stepDown() {
      const p = { ...t.piece, y: t.piece.y + 1 };
      if (fits(p)) { t.piece = p; return true; }
      lock();
      return false;
    }
    function hardDrop() {
      if (t.phase !== "play") return;
      while (stepDown());
      sfx("press");
    }
    function lock() {
      for (const [x, y] of cellsOf(t.piece)) {
        if (y < 0) return gameOver();
        t.board[y][x] = t.piece.type;
      }
      const full = t.board.filter((row) => row.every(Boolean)).length;
      if (full) {
        t.board = t.board.filter((row) => !row.every(Boolean));
        while (t.board.length < ROWS) t.board.unshift(Array(COLS).fill(null));
        t.lines += full;
        t.flash = 1; t.flashColor = "255,255,255";
        sfx(full >= 4 ? "win" : "right");
        if (ui) $("k-gates").textContent = t.lines;
      }
      t.piece = null;
      t.untilQuiz--;
      if (t.untilQuiz <= 0) quizDrop();
      else spawn();
    }
    // the junk row a wrong answer pushes up: grey with one hole
    function addJunk() {
      const hole = Math.floor(Math.random() * COLS);
      if (t.board[0].some(Boolean)) return gameOver();
      t.board.shift();
      t.board.push(Array.from({ length: COLS }, (_, i) => (i === hole ? null : "X")));
    }
    function blastRows(n) {
      t.board.splice(ROWS - n, n);
      while (t.board.length < ROWS) t.board.unshift(Array(COLS).fill(null));
    }

    // ---- the quiz drop ----

    function quizDrop() {
      t.untilQuiz = QUIZ_EVERY;
      t.phase = "quiz";
      t.banner = "QUIZ DROP!"; t.bannerT = 1.4;
      sfx("open");
      if (!ui) {
        // the demo answers by itself after a moment
        t.aiT = 1.4;
        return;
      }
      t.q = deck.next();
      renderPanel();
      onPad = (i) => { answerQuiz(i); return true; };
    }

    function answerQuiz(i) {
      if (t.phase !== "quiz") return;
      const q = t.q;
      const right = ui ? i === q.answerIndex : Math.random() < 0.8;
      t.phase = "result";
      if (right) {
        const coins = q?.difficulty === "hard" ? 10 : 5;
        t.right++;
        t.coins += coins;
        if (ui) earn(coins);
        blastRows(2);
        t.flash = 1; t.flashColor = "31,157,85";
        t.banner = "BLAST! -2 ROWS"; t.bannerT = 1.3;
        sfx("right");
        setTimeout(() => sfx("coindrop"), 200);
      } else {
        t.wrong++;
        if (ui) deck.again(q);
        addJunk();
        t.flash = 1; t.flashColor = "217,58,58"; t.shake = 0.5;
        t.banner = "JUNK ROW!"; t.bannerT = 1.3;
        sfx("wrong");
      }
      if (t.phase === "over") return;
      if (ui) {
        $("t-quiz").textContent = `${t.right}/${t.right + t.wrong}`;
        $("k-coins").textContent = `+${t.coins}`;
        renderPanel({ right, picked: i });
        if (right) setTimeout(resume, 1100);
        else wireButtons({ 0: resume });
      } else {
        t.aiT = 1.1;
      }
    }

    function resume() {
      if (!t.alive || t.phase !== "result") return;
      t.phase = "play";
      t.q = null;
      renderPanel();
      playPads();
      spawn();
    }

    // A-D move, rotate, move, drop while the blocks fall
    function playPads() {
      onPad = (i) => {
        if (t.phase === "play") [() => move(-1), rotate, () => move(1), hardDrop][i]?.();
        return true;
      };
    }

    function renderPanel(result) {
      if (!ui) return;
      const q = t.q;
      if (!q) {
        $("k-q").innerHTML = `<p class="t-controls"><span class="key ka">A</span> LEFT <span class="key kb">B</span> ROTATE
          <span class="key kc">C</span> RIGHT <span class="key kd">D</span> DROP</p>`;
        return;
      }
      $("k-q").innerHTML = `
        <p class="t-label">QUIZ DROP! Right: blast 2 rows. Wrong: a junk row.</p>
        <p class="k-qtext">${escapeHTML(q.question)}</p>
        <div class="k-choices">${q.choices.map((c, i) => {
          const cls = !result ? "" : i === q.answerIndex ? " right" : i === result.picked ? " wrong" : " dim";
          return `<button class="k-choice${cls}" data-i="${i}" ${result ? "disabled" : ""}><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(c)}</span></button>`;
        }).join("")}</div>
        ${result && !result.right ? `${q.explanation ? `<p class="k-why">${escapeHTML(q.explanation)}</p>` : ""}
          <button class="btn-next t-go" data-pad="0">KEEP PLAYING<span class="hint" aria-hidden="true">A</span></button>` : ""}`;
      $("k-q").querySelectorAll(".k-choice").forEach((b) => b.addEventListener("click", () => answerQuiz(Number(b.dataset.i))));
    }

    // ---- start, game over ----

    const card = (html, buttons) => {
      $("k-card").innerHTML = html;
      $("k-card").hidden = false;
      wireButtons(buttons);
    };

    function intro() {
      t.phase = "intro";
      t.board = emptyBoard();
      card(`<div class="card message">
        <h2>QUIZ BLOCKS</h2>
        <p>Stack the falling blocks and clear lines. Every ${QUIZ_EVERY} pieces there's a QUIZ DROP:
        a right answer blasts away your bottom 2 rows, a wrong one pushes up a junk row.
        Buttons: <b>A</b> left, <b>B</b> rotate, <b>C</b> right, <b>D</b> drop (or the arrow keys and Space).</p>
        <button class="btn-next" data-pad="0">START<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: begin, 1: openMenu });
    }

    function begin() {
      if (ui) { $("k-card").hidden = true; $("k-card").innerHTML = ""; }
      Object.assign(t, { phase: "play", board: emptyBoard(), bag: [], next: null, lines: 0, coins: 0, right: 0, wrong: 0, untilQuiz: QUIZ_EVERY, fall: 0, q: null });
      if (ui) {
        $("k-gates").textContent = "0";
        $("t-quiz").textContent = "0/0";
        $("k-coins").textContent = "+0";
        renderPanel();
        playPads();
      }
      sfx("go");
      spawn();
    }

    function gameOver() {
      t.phase = "over";
      t.piece = null;
      if (!ui) { t.aiT = 1.5; return; } // the demo starts over
      const record = t.lines > (best().blocks || 0);
      if (record) best().blocks = t.lines;
      persistGame();
      t.q = null;
      renderPanel();
      sfx("lose");
      const tries = t.right + t.wrong;
      card(`<div class="card message">
        <h2>${record && t.lines ? "NEW RECORD!" : "GAME OVER"}</h2>
        <div class="stats">
          <div><b>${t.lines}</b><span>lines cleared</span></div>
          <div><b>${tries ? Math.round((100 * t.right) / tries) : 0}%</b><span>quiz accuracy</span></div>
          <div><b>+${t.coins}</b><span>coins won</span></div>
          <div><b>${best().blocks || 0}</b><span>best</span></div>
        </div>
        <button class="btn-next" data-pad="0">PLAY AGAIN<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: begin, 1: openMenu });
    }

    // ---- the demo player: tries every rotation and column, keeps the tidiest result ----

    function bestMove(piece) {
      let bestScore = -Infinity, choice = { rot: 0, x: piece.x };
      let p = piece;
      for (let rot = 0; rot < 4; rot++) {
        for (let x = -2; x < COLS; x++) {
          let q = { ...p, x, y: piece.y };
          if (!fits(q)) continue;
          while (fits({ ...q, y: q.y + 1 })) q = { ...q, y: q.y + 1 };
          const board = t.board.map((row) => [...row]);
          let above = false;
          for (const [cx, cy] of cellsOf(q)) { if (cy < 0) above = true; else board[cy][cx] = q.type; }
          if (above) continue;
          const lines = board.filter((row) => row.every(Boolean)).length;
          const heights = Array.from({ length: COLS }, (_, c) => { const r = board.findIndex((row) => row[c]); return r < 0 ? 0 : ROWS - r; });
          let holes = 0;
          for (let c = 0; c < COLS; c++) for (let r = ROWS - heights[c] + 1; r < ROWS; r++) if (!board[r][c]) holes++;
          const bump = heights.slice(1).reduce((s, h, i) => s + Math.abs(h - heights[i]), 0);
          const score = -0.51 * heights.reduce((s, h) => s + h, 0) + 0.76 * lines - 0.36 * holes - 0.18 * bump;
          if (score > bestScore) { bestScore = score; choice = { rot, x }; }
        }
        p = rotated(p);
      }
      return choice;
    }

    function demoStep(dt) {
      t.aiT -= dt;
      if (t.aiT > 0) return;
      if (t.phase === "over") { begin(); return; }
      if (t.phase === "quiz") return answerQuiz(0);
      if (t.phase === "result") { t.phase = "play"; spawn(); return; }
      if (t.phase !== "play" || !t.piece || !t.ai) return;
      t.aiT = 0.09;
      if (t.ai.rot > 0) { t.ai.rot--; if (!rotate()) hardDrop(); return; }
      if (t.piece.x !== t.ai.x) { if (!move(Math.sign(t.ai.x - t.piece.x))) hardDrop(); return; }
      t.aiT = 0.25;
      hardDrop();
    }

    // ---- the loop ----

    function update(dt) {
      t.flash = Math.max(0, t.flash - dt * 2.5);
      t.shake = Math.max(0, t.shake - dt);
      t.bannerT = Math.max(0, t.bannerT - dt);
      if (!ui) demoStep(dt);
      if (t.phase !== "play" || !t.piece) return;
      const level = Math.floor(t.lines / 5);
      const interval = Math.max(0.12, 0.8 - level * 0.07);
      t.fall += dt;
      if (ui && t.fall >= interval) { t.fall = 0; stepDown(); }
    }

    function drawCell(x, y, type, alpha = 1) {
      const px0 = wellX() + x * CELL, py0 = wellTop() + y * CELL;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = INK; ctx.fillRect(px0, py0, CELL, CELL);
      ctx.fillStyle = BLOCK_COLORS[type]; ctx.fillRect(px0 + 1, py0 + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(px0 + 1, py0 + 1, CELL - 2, 2);
      ctx.globalAlpha = 1;
    }

    function text(str, x, y, color = "#fff", size = 8, align = "left") {
      ctx.font = `${size}px "Press Start 2P", monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = INK; ctx.fillText(str, x + 1, y + 1);
      ctx.fillStyle = color; ctx.fillText(str, x, y);
    }

    function draw() {
      const { W, H } = t;
      const wx = wellX();
      ctx.save();
      if (t.shake) ctx.translate(Math.round((Math.random() - 0.5) * 6 * t.shake), 0);
      // backdrop: a dark arcade grid
      ctx.fillStyle = "#1c2027"; ctx.fillRect(-8, -8, W + 16, H + 16);
      ctx.fillStyle = "#262b34";
      for (let x = (W / 2) % 20; x < W; x += 20) ctx.fillRect(Math.round(x), 0, 1, H);
      for (let y = 0; y < H; y += 20) ctx.fillRect(0, y, W, 1);
      // the well
      ctx.fillStyle = "#5b6577"; ctx.fillRect(wx - 3, wellTop() - 3, COLS * CELL + 6, ROWS * CELL + 6);
      ctx.fillStyle = "#0f1217"; ctx.fillRect(wx, wellTop(), COLS * CELL, ROWS * CELL);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (t.board[y]?.[x]) drawCell(x, y, t.board[y][x]);
      if (t.piece && t.phase === "play") {
        // where it will land, faintly
        let ghost = t.piece;
        while (fits({ ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
        for (const [x, y] of cellsOf(ghost)) if (y >= 0) drawCell(x, y, ghost.type, 0.22);
        for (const [x, y] of cellsOf(t.piece)) if (y >= 0) drawCell(x, y, t.piece.type);
      }
      // side panel
      const sx = wx + COLS * CELL + 12;
      text("NEXT", sx, wellTop());
      ctx.fillStyle = "#0f1217"; ctx.fillRect(sx, wellTop() + 12, 46, 30);
      if (t.next) for (const [x, y] of SHAPES[t.next]) {
        const px0 = sx + 4 + x * 9, py0 = wellTop() + 17 + y * 9;
        ctx.fillStyle = INK; ctx.fillRect(px0, py0, 9, 9);
        ctx.fillStyle = BLOCK_COLORS[t.next]; ctx.fillRect(px0 + 1, py0 + 1, 7, 7);
      }
      text("QUIZ IN", sx, wellTop() + 54);
      for (let i = 0; i < QUIZ_EVERY; i++) {
        ctx.fillStyle = i < QUIZ_EVERY - t.untilQuiz ? "#ffc94d" : "#3a4252";
        ctx.fillRect(sx + i * 7, wellTop() + 66, 5, 8);
      }
      text("LINES", sx, wellTop() + 86);
      text(String(t.lines), sx, wellTop() + 98, "#ffc94d");
      text("LEVEL", sx, wellTop() + 118);
      text(String(Math.floor(t.lines / 5) + 1), sx, wellTop() + 130, "#ffc94d");
      // the quiz dims the well
      if (t.phase === "quiz" || t.phase === "result") {
        ctx.fillStyle = "rgba(17,20,24,0.55)"; ctx.fillRect(wx, wellTop(), COLS * CELL, ROWS * CELL);
      }
      if (t.bannerT) {
        const by = wellTop() + ROWS * CELL * 0.42;
        ctx.fillStyle = "rgba(17,20,24,0.85)"; ctx.fillRect(wx - 6, by - 6, COLS * CELL + 12, 22);
        text(t.banner, wx + (COLS * CELL) / 2, by, t.banner.startsWith("JUNK") ? "#ff8a7a" : "#ffd23f", 8, "center");
      }
      ctx.restore();
      if (t.flash) {
        ctx.fillStyle = `rgba(${t.flashColor},${(t.flash * 0.3).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    let raf, last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused) update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    if (ui) {
      intro();
      onStick = (dir) => move(dir === "left" ? -1 : 1);
      onKey = (key) => {
        if (key === "ArrowUp") { rotate(); return true; }
        if (key === "ArrowDown") { if (t.phase === "play") { stepDown(); t.fall = 0; } return true; }
        if (key === " ") { hardDrop(); return true; }
        return false;
      };
      // touch: tap the left or right of the well to move, the middle to rotate; swipe down to drop
      let downAt = null;
      canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
      canvas.addEventListener("pointerup", (e) => {
        if (!downAt) return;
        const dy = e.clientY - downAt.y;
        downAt = null;
        if (dy > 40) return hardDrop();
        const r = canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * t.W;
        if (x < wellX() + COLS * CELL * 0.33) move(-1);
        else if (x > wellX() + COLS * CELL * 0.67) move(1);
        else rotate();
      });
    } else {
      begin();
    }
    return () => {
      t.alive = false;
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }

  // ---------- shared cabinet for the classic canvas games (Snake, Invaders, Breakout) ----------
  // Builds the top bar, the question panel and the canvas; handles lives, coins, pop-up text,
  // the intro and game-over cards and the game loop. demo: an element to play a silent demo in.

  function cabinet({ u, demo, cls, stat, lives, minW, minH, intro: introHTML, bestKey, bestWord }) {
    const ui = !demo;
    const deck = ui ? makeDeck(u) : null;
    const c = {
      ui, deck, lives, score: 0, misses: 0, coins: 0, flash: 0, flashColor: "", shake: 0, W: minW, H: minH,
      alive: true, q: null, sfx: (name) => { if (ui) Sound.play(name); },
    };
    if (demo) demo.innerHTML = "<canvas></canvas>";
    else show(`
      <div class="kart ${cls}">
        <div class="arc-bar">
          <button class="hud-btn" data-act="menu" aria-label="Back to the game menu">&lt;<span class="lbl"> MENU</span></button>
          <div class="lives" id="k-lives"></div>
          <div class="hud-stat"><span class="k">${stat}</span><span class="v" id="k-gates">0</span></div>
          <div class="hud-stat"><span class="k">COINS</span><span class="v" id="k-coins">+0</span></div>
        </div>
        <div class="k-q" id="k-q"></div>
        <div class="k-road" id="k-road"><canvas></canvas><div class="k-card" id="k-card" hidden></div></div>
      </div>`);
    if (ui) root().querySelector("[data-act=menu]").addEventListener("click", openMenu);
    const box = demo || $("k-road");
    const canvas = box.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    Object.assign(c, { box, canvas, ctx });

    // at least minW x minH canvas pixels, keeping the screen's shape (never stretched)
    const fit = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const ratio = r.width / r.height;
      c.H = Math.max(minH, Math.round(minW / ratio));
      c.W = Math.min(760, Math.round(c.H * ratio));
      canvas.width = c.W;
      canvas.height = c.H;
      ctx.imageSmoothingEnabled = false;
    };
    const resize = new ResizeObserver(fit);
    resize.observe(box);
    fit();

    c.renderLives = () => {
      if (!ui) return;
      $("k-lives").innerHTML = heartsHTML(c.lives, lives);
      $("k-lives").setAttribute("aria-label", `${c.lives} of ${lives} lives left`);
    };
    c.stats = () => {
      if (!ui) return;
      $("k-gates").textContent = c.score;
      $("k-coins").textContent = `+${c.coins}`;
    };
    // the question and its four answers; result = {right, picked} once answered
    c.renderQuestion = (result, why = "") => {
      if (!ui) return;
      const q = c.q;
      if (!q) { $("k-q").innerHTML = ""; return; }
      $("k-q").innerHTML = `
        <p class="k-qtext">${escapeHTML(q.question)}</p>
        <div class="k-choices">${q.choices.map((ch, i) => {
          const k = !result ? "" : i === q.answerIndex ? " right" : i === result.picked ? " wrong" : " dim";
          return `<div class="k-choice${k}"><span class="key">${"ABCD"[i]}</span><span>${escapeHTML(ch)}</span></div>`;
        }).join("")}</div>
        ${result && !result.right ? `<p class="k-why">${why}${escapeHTML(q.explanation || "")}</p>` : ""}`;
    };
    c.nextQuestion = (demoQ) => {
      c.q = ui ? deck.next() : demoQ || { answerIndex: Math.floor(Math.random() * 4) };
      c.renderQuestion();
      return c.q;
    };
    c.pop = (text, kind) => {
      const pop = document.createElement("div");
      pop.className = `k-pop ${kind}`;
      pop.textContent = text;
      box.append(pop);
      setTimeout(() => pop.remove(), 1100);
    };
    c.card = (html, buttons) => {
      $("k-card").innerHTML = html;
      $("k-card").hidden = false;
      wireButtons(buttons);
    };
    c.hideCard = () => { if (ui) { $("k-card").hidden = true; $("k-card").innerHTML = ""; } };
    c.intro = (start) => c.card(`<div class="card message">${introHTML}
      <button class="btn-next" data-pad="0">START<span class="hint" aria-hidden="true">A</span></button>
      <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: start, 1: openMenu });
    c.reset = () => {
      Object.assign(c, { lives, score: 0, misses: 0, coins: 0, q: null });
      c.renderLives();
      c.stats();
      c.renderQuestion();
    };
    // a right answer: coins, a green flash, a pop-up
    c.right = (picked) => {
      const coins = c.q?.difficulty === "hard" ? 10 : 5;
      c.score++;
      c.coins += coins;
      if (ui) earn(coins);
      c.flash = 1; c.flashColor = "31,157,85";
      c.pop(`+${coins} COINS`, "good");
      c.sfx("right");
      setTimeout(() => c.alive && c.sfx("coindrop"), 200);
      c.renderQuestion({ right: true, picked });
      c.stats();
    };
    // a miss: a life gone (not in the demo); the question comes back later. Returns lives left.
    c.wrong = (picked, label, why = "") => {
      if (ui) c.lives--;
      c.misses++;
      c.flash = 1; c.flashColor = "217,58,58"; c.shake = 0.5;
      if (ui && c.q) deck.again(c.q);
      c.pop(label, "bad");
      c.sfx(picked >= 0 ? "wrong" : "crash");
      c.renderQuestion({ right: false, picked }, why);
      c.renderLives();
      c.stats();
      return c.lives;
    };
    c.gameOver = (again) => {
      const record = c.score > (best()[bestKey] || 0);
      if (record) best()[bestKey] = c.score;
      persistGame();
      c.sfx("lose");
      const tries = c.score + c.misses;
      c.card(`<div class="card message">
        <h2>${record && c.score ? "NEW RECORD!" : "GAME OVER"}</h2>
        <div class="stats">
          <div><b>${c.score}</b><span>${bestWord}</span></div>
          <div><b>${tries ? Math.round((100 * c.score) / tries) : 0}%</b><span>accuracy</span></div>
          <div><b>+${c.coins}</b><span>coins won</span></div>
          <div><b>${best()[bestKey] || 0}</b><span>best</span></div>
        </div>
        <button class="btn-next" data-pad="0">PLAY AGAIN<span class="hint" aria-hidden="true">A</span></button>
        <button class="btn-ghost" data-pad="1">MENU</button></div>`, { 0: again, 1: openMenu });
    };
    c.text = (str, x, y, color = "#fff", size = 8, align = "center") => {
      ctx.font = `${size}px "Press Start 2P", monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillStyle = INK; ctx.fillText(str, x + 1, y + 1);
      ctx.fillStyle = color; ctx.fillText(str, x, y);
    };
    c.rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

    let raf, last = performance.now();
    c.run = (update, draw) => {
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!paused) {
          c.flash = Math.max(0, c.flash - dt * 2.4);
          c.shake = Math.max(0, c.shake - dt);
          update(dt);
        }
        ctx.save();
        if (c.shake) ctx.translate(Math.round((Math.random() - 0.5) * 8 * c.shake), Math.round((Math.random() - 0.5) * 5 * c.shake));
        draw();
        ctx.restore();
        if (c.flash) { ctx.fillStyle = `rgba(${c.flashColor},${(c.flash * 0.3).toFixed(3)})`; ctx.fillRect(0, 0, c.W, c.H); }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    c.stop = () => {
      c.alive = false;
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
    c.renderLives();
    return c;
  }

  // ---------- SNAKE SMARTS ----------
  // Four snacks on the grid, marked A-D. Eat the one with the right answer. Walls and your own
  // tail cost a life too. 3 lives.

  function startSnake(u, demo = null) {
    const GW = 24, GH = 16, CS = 10;
    const c = cabinet({
      u, demo, cls: "snake", stat: "SNACKS", lives: 3, minW: 260, minH: 190, bestKey: "snake", bestWord: "right snacks",
      intro: `<h2>SNAKE SMARTS</h2><p>Four snacks are on the board, marked A, B, C and D. Steer the snake to the one with the right answer.
        A wrong snack, a wall or your own tail costs a life. You have 3.
        Steer with the arrow keys, or the buttons: <b>A</b> left, <b>B</b> up, <b>C</b> down, <b>D</b> right (swipe on a phone).</p>`,
    });
    const s = { phase: "intro", body: [], dir: [1, 0], turns: [], foods: [], grow: 0, step: 0, wait: 0, blink: 0 };
    const ox = () => Math.round((c.W - GW * CS) / 2);
    const oy = () => Math.round((c.H - GH * CS) / 2);
    const DIRS = { left: [-1, 0], up: [0, -1], down: [0, 1], right: [1, 0] };

    function placeSnake() {
      s.body = [[8, 8], [7, 8], [6, 8], [5, 8]];
      s.dir = [1, 0];
      s.turns = [];
    }
    const occupied = (x, y) => s.body.some(([bx, by]) => bx === x && by === y) || s.foods.some((f) => f.x === x && f.y === y);
    function placeFoods() {
      s.foods = [];
      const [hx, hy] = s.body[0];
      for (let i = 0; i < 4; i++) {
        let x, y, tries = 0;
        do {
          x = 1 + Math.floor(Math.random() * (GW - 2));
          y = 1 + Math.floor(Math.random() * (GH - 2));
          tries++;
        } while (tries < 200 && (occupied(x, y) || Math.abs(x - hx) + Math.abs(y - hy) < 5 || s.foods.some((f) => Math.abs(f.x - x) + Math.abs(f.y - y) < 4)));
        s.foods.push({ x, y, i });
      }
    }
    function newRound() {
      if (s.crashed) { placeSnake(); s.crashed = false; }
      c.nextQuestion();
      placeFoods();
      s.phase = "play";
      if (!c.ui) s.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function turn(name) {
      if (s.phase !== "play") return;
      const d = DIRS[name];
      const lastDir = s.turns.length ? s.turns[s.turns.length - 1] : s.dir;
      if (d[0] === -lastDir[0] && d[1] === -lastDir[1]) return; // no reversing into yourself
      if (d[0] === lastDir[0] && d[1] === lastDir[1]) return;
      if (s.turns.length < 2) s.turns.push(d);
    }
    // walls and your tail: a life gone, and the question counts as missed
    function crash(label) {
      const left = c.wrong(-1, label, "Crashed! ");
      s.foods = [];
      s.crashed = true;
      s.phase = left ? "pause" : "dead";
      s.wait = left ? 2.4 : 1.4;
      s.blink = 1.5;
    }
    function tick() {
      if (s.turns.length) s.dir = s.turns.shift();
      const [hx, hy] = s.body[0];
      const nx = hx + s.dir[0], ny = hy + s.dir[1];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return crash("WALL! -1 LIFE");
      const solid = s.grow > 0 ? s.body : s.body.slice(0, -1); // a growing tail doesn't move out of the way
      if (solid.some(([bx, by]) => bx === nx && by === ny)) return crash("OUCH! -1 LIFE");
      s.body.unshift([nx, ny]);
      const food = s.foods.find((f) => f.x === nx && f.y === ny);
      if (food) {
        if (food.i === c.q.answerIndex) {
          c.right(food.i);
          s.grow += 2;
          s.foods = [];
          s.phase = "pause";
          s.wait = 1.1;
        } else {
          const left = c.wrong(food.i, "WRONG SNACK! -1 LIFE");
          s.foods = [];
          s.phase = left ? "pause" : "dead";
          s.wait = left ? 2.4 : 1.4;
        }
      }
      if (s.grow > 0) s.grow--;
      else s.body.pop();
    }
    function begin() {
      c.hideCard();
      c.reset();
      placeSnake();
      Object.assign(s, { grow: 0, step: 0, crashed: false, blink: 0 });
      c.sfx("go");
      newRound();
      if (c.ui) onPad = (i) => { turn(["left", "up", "down", "right"][i]); return true; };
    }

    // demo: head for the target snack, avoiding walls and the tail
    function demoSteer() {
      const target = s.foods.find((f) => f.i === s.aim) || s.foods[0];
      if (!target) return;
      const [hx, hy] = s.body[0];
      const safe = (d) => {
        const nx = hx + d[0], ny = hy + d[1];
        return nx >= 0 && ny >= 0 && nx < GW && ny < GH && !s.body.slice(0, -1).some(([bx, by]) => bx === nx && by === ny) &&
          !s.foods.some((f) => f !== target && f.x === nx && f.y === ny);
      };
      const options = Object.values(DIRS).filter((d) => !(d[0] === -s.dir[0] && d[1] === -s.dir[1]) && safe(d));
      options.sort((a, b) => (Math.abs(hx + a[0] - target.x) + Math.abs(hy + a[1] - target.y)) - (Math.abs(hx + b[0] - target.x) + Math.abs(hy + b[1] - target.y)));
      if (options[0]) s.turns = [options[0]];
    }

    function update(dt) {
      s.blink = Math.max(0, s.blink - dt);
      if (s.phase === "pause" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.step += dt;
      const interval = Math.max(0.09, 0.16 - c.score * 0.004);
      if (s.step >= interval) {
        s.step = 0;
        if (!c.ui) demoSteer();
        tick();
      }
    }

    function draw() {
      const { rect, text } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#1c2027");
      const x0 = ox(), y0 = oy();
      rect(x0 - 3, y0 - 3, GW * CS + 6, GH * CS + 6, "#5b6577");
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) rect(x0 + x * CS, y0 + y * CS, CS, CS, (x + y) % 2 ? "#a9d39a" : "#9fca8f");
      for (const f of s.foods) {
        const fx = x0 + f.x * CS, fy = y0 + f.y * CS;
        rect(fx - 1, fy - 1, CS + 2, CS + 2, INK);
        rect(fx, fy, CS, CS, LANE_COLORS[f.i]);
        text("ABCD"[f.i], fx + CS / 2, fy + CS / 2 + 1, "#fff", 8);
      }
      if (!(s.blink && Math.floor(s.blink * 10) % 2)) s.body.forEach(([bx, by], i) => {
        const px0 = x0 + bx * CS, py0 = y0 + by * CS;
        rect(px0, py0, CS, CS, INK);
        rect(px0 + 1, py0 + 1, CS - 2, CS - 2, i === 0 ? "#3b6fe0" : i % 2 ? "#6b9cf0" : "#5a8de8");
        if (i === 0) { // eyes, looking where it's going
          const ex = s.dir[0], ey = s.dir[1];
          if (ex) { rect(px0 + 4 + ex * 2, py0 + 2, 2, 2, "#fff"); rect(px0 + 4 + ex * 2, py0 + 6, 2, 2, "#fff"); }
          else { rect(px0 + 2, py0 + 4 + ey * 2, 2, 2, "#fff"); rect(px0 + 6, py0 + 4 + ey * 2, 2, 2, "#fff"); }
        }
      });
      if (s.phase === "pause" && s.crashed) text("GET READY", c.W / 2, c.H / 2);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      onStick = (dir) => turn(dir);
      onKey = (key) => {
        if (key === "ArrowUp" || key === "ArrowDown") { turn(key === "ArrowUp" ? "up" : "down"); return true; }
        return false;
      };
      let downAt = null;
      c.canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
      c.canvas.addEventListener("pointerup", (e) => {
        if (!downAt) return;
        const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
        downAt = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
        turn(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");
      });
    } else {
      placeSnake();
      newRound();
    }
    return c.stop;
  }

  // ---------- QUIZ INVADERS ----------
  // Four invaders, marked A-D, march back and forth and creep down. Shoot the one with the
  // right answer. Hitting a wrong one, or letting them land, costs a life. 3 lives.

  function startInvaders(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "invaders", stat: "HITS", lives: 3, minW: 240, minH: 220, bestKey: "invaders", bestWord: "right hits",
      intro: `<h2>QUIZ INVADERS</h2><p>Four invaders, marked A, B, C and D, are marching down. Shoot the one with the right answer.
        Hitting a wrong one, or letting them reach you, costs a life. You have 3.
        Buttons: <b>A</b> left, <b>B</b> or <b>C</b> fire, <b>D</b> right (or the arrow keys and Space; tap the screen to move and fire).</p>`,
    });
    const v = { phase: "intro", x: 0, shot: null, inv: [], dirX: 1, speed: 14, drop: 0, wait: 0, target: null, stars: [], t: 0, booms: [] };
    for (let i = 0; i < 40; i++) v.stars.push([Math.random(), Math.random(), Math.random() < 0.3]);
    const ground = () => c.H - 18;
    const IW = 22, IH = 16;

    function wave() {
      c.nextQuestion();
      const gap = Math.min(54, (c.W - 40) / 4);
      const left = c.W / 2 - gap * 1.5;
      v.inv = [0, 1, 2, 3].map((i) => ({ i, x: left + gap * i, y: 34, alive: true }));
      v.dirX = Math.random() < 0.5 ? 1 : -1;
      const sweep = Math.max(2.6, 4.5 - c.score * 0.15); // seconds to cross the screen once
      v.speed = Math.max(10, (c.W - 28 - gap * 3 - IW) / sweep);
      v.shot = null;
      v.phase = "play";
      if (!c.ui) v.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function move(dx) {
      if (v.phase !== "play" && v.phase !== "pause") return;
      v.x = Math.max(12, Math.min(c.W - 12, v.x + dx));
    }
    function fire() {
      if (v.phase !== "play" || v.shot) return;
      v.shot = { x: v.x, y: ground() - 10 };
      c.sfx("blip");
    }
    function boom(x, y, color) { v.booms.push({ x, y, t: 0.5, color }); }
    function begin() {
      c.hideCard();
      c.reset();
      v.x = c.W / 2;
      v.booms = [];
      c.sfx("go");
      wave();
      if (c.ui) onPad = (i) => { [() => move(-10), fire, fire, () => move(10)][i](); return true; };
    }
    function finish(left) {
      v.phase = left ? "pause" : "dead";
      v.wait = left ? 2.4 : 1.4;
    }

    function update(dt) {
      v.t += dt;
      v.booms.forEach((b) => (b.t -= dt));
      v.booms = v.booms.filter((b) => b.t > 0);
      if (v.phase === "pause" || v.phase === "dead") {
        v.wait -= dt;
        if (v.wait > 0) return;
        if (v.phase === "dead") { v.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return wave();
      }
      if (v.phase !== "play") return;
      // the formation marches; at an edge it steps down and turns around
      const alive = v.inv.filter((n) => n.alive);
      const minX = Math.min(...alive.map((n) => n.x)), maxX = Math.max(...alive.map((n) => n.x));
      let dx = v.dirX * v.speed * dt;
      if (minX + dx < 14 || maxX + dx > c.W - 14) { v.dirX *= -1; dx = 0; for (const n of v.inv) n.y += 14; }
      for (const n of v.inv) n.x += dx;
      if (alive.some((n) => n.y + IH / 2 >= ground() - 14)) {
        for (const n of alive) boom(n.x, n.y, "#ff8a7a");
        v.inv.forEach((n) => (n.alive = false));
        return finish(c.wrong(-1, "THEY LANDED! -1 LIFE", "Too slow! "));
      }
      // the demo lines up under its target and fires
      if (!c.ui) {
        const t = v.inv[v.aim];
        if (t?.alive) {
          const lead = t.x + v.dirX * v.speed * 0.4;
          if (Math.abs(lead - v.x) > 3) move(Math.sign(lead - v.x) * 90 * dt);
          else fire();
        }
      }
      if (v.shot) {
        v.shot.y -= 190 * dt;
        if (v.shot.y < 0) v.shot = null;
        else {
          const hit = v.inv.find((n) => n.alive && Math.abs(n.x - v.shot.x) < IW / 2 + 1 && Math.abs(n.y - v.shot.y) < IH / 2 + 2);
          if (hit) {
            v.shot = null;
            hit.alive = false;
            if (hit.i === c.q.answerIndex) {
              boom(hit.x, hit.y, "#7dffa8");
              c.right(hit.i);
              v.inv.forEach((n) => { if (n.alive) boom(n.x, n.y, "#9aa3b2"); n.alive = false; });
              v.phase = "pause";
              v.wait = 1.1;
            } else {
              boom(hit.x, hit.y, "#ff8a7a");
              finish(c.wrong(hit.i, "WRONG ONE! -1 LIFE"));
              v.inv.forEach((n) => (n.alive = false));
            }
          }
        }
      }
    }

    function invader(x, y, color, frame) {
      const { rect } = c;
      const L = x - IW / 2, T = y - IH / 2;
      rect(L + 4, T, 14, 2, color);
      rect(L + 2, T + 2, 18, 8, color);
      rect(L, T + 4, 22, 6, color);
      rect(L + 6, T + 4, 3, 3, INK); rect(L + 13, T + 4, 3, 3, INK); // eyes
      if (frame) { rect(L, T + 10, 4, 4, color); rect(L + 18, T + 10, 4, 4, color); rect(L + 7, T + 10, 3, 2, color); rect(L + 12, T + 10, 3, 2, color); }
      else { rect(L + 3, T + 10, 4, 4, color); rect(L + 15, T + 10, 4, 4, color); rect(L + 9, T + 12, 4, 2, color); }
    }

    function draw() {
      const { rect, text } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#0f1217");
      for (const [sx, sy, big] of v.stars) rect(sx * c.W, ((sy * c.H + v.t * (big ? 8 : 4)) % c.H), big ? 2 : 1, big ? 2 : 1, big ? "#c9cdd4" : "#5b6577");
      const frame = Math.floor(v.t * 2.5) % 2;
      for (const n of v.inv) if (n.alive) {
        invader(n.x, n.y, LANE_COLORS[n.i], frame);
        text("ABCD"[n.i], n.x, n.y - IH / 2 - 7, LANE_COLORS[n.i], 8);
      }
      for (const b of v.booms) {
        const r = (0.5 - b.t) * 30;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          rect(b.x + Math.cos(a) * r - 1, b.y + Math.sin(a) * r - 1, 3, 3, b.color);
        }
      }
      if (v.shot) rect(v.shot.x - 1, v.shot.y - 5, 2, 7, "#ffd23f");
      // the cannon and the ground
      rect(0, ground() + 6, c.W, 2, "#3ce070");
      const gx = v.x, gy = ground();
      rect(gx - 11, gy - 2, 22, 7, "#3ce070");
      rect(gx - 7, gy - 6, 14, 4, "#3ce070");
      rect(gx - 2, gy - 10, 4, 4, "#3ce070");
      if (v.phase === "play" && !v.inv.some((n) => n.alive)) text("...", c.W / 2, c.H / 2);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      v.x = c.W / 2;
      onStick = (dir) => move(dir === "left" ? -10 : 10);
      onKey = (key) => {
        if (key === " " || key === "ArrowUp") { fire(); return true; }
        return false;
      };
      // tap: slide toward the tap and fire when there
      c.canvas.addEventListener("pointerdown", (e) => {
        const r = c.canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * c.W;
        if (Math.abs(x - v.x) < 14) return fire();
        v.target = Math.max(12, Math.min(c.W - 12, x));
      });
      const glide = setInterval(() => {
        if (!c.alive) return clearInterval(glide);
        if (v.target == null || paused) return;
        if (Math.abs(v.target - v.x) <= 4) { v.target = null; fire(); }
        else move(Math.sign(v.target - v.x) * 4);
      }, 16);
    } else {
      v.x = c.W / 2;
      wave();
    }
    return c.stop;
  }

  // ---------- BRICK BREAKER ----------
  // Four big bricks, marked A-D. Bounce the ball into the one with the right answer.
  // A wrong brick, or dropping the ball, costs a life. 3 lives.

  function startBreakout(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "breakout", stat: "BRICKS", lives: 3, minW: 240, minH: 230, bestKey: "breakout", bestWord: "right bricks",
      intro: `<h2>BRICK BREAKER</h2><p>Four bricks at the top are marked A, B, C and D. Bounce the ball into the one with the right answer.
        A wrong brick, or letting the ball fall, costs a life. You have 3.
        Move the paddle with <b>A</b>/<b>B</b> (left) and <b>C</b>/<b>D</b> (right), the arrow keys, or by dragging on the screen.</p>`,
    });
    const k = { phase: "intro", px: 0, ball: null, bricks: [], wait: 0, held: true, holdT: 0, t: 0, trail: [] };
    const PW = 44, BR = 3;
    const paddleY = () => c.H - 16;

    function layBricks() {
      const w = Math.min(130, (c.W - 30) / 4);
      const left = c.W / 2 - w * 2;
      k.bricks = [0, 1, 2, 3].map((i) => ({ i, x: left + i * w + 2, y: 30, w: w - 4, h: 22, alive: true }));
    }
    function serve() {
      k.held = true;
      k.holdT = c.ui ? 1.2 : 0.6;
      k.ball = { x: k.px, y: paddleY() - BR - 2, vx: 0, vy: 0 };
      k.trail = [];
    }
    function launch() {
      if (!k.held || k.phase !== "play") return;
      k.held = false;
      const speed = 150 + Math.min(70, c.score * 6);
      const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.9;
      k.ball.vx = Math.cos(a) * speed;
      k.ball.vy = Math.sin(a) * speed;
      c.sfx("press");
    }
    function round() {
      c.nextQuestion();
      layBricks();
      k.phase = "play";
      serve();
      if (!c.ui) k.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1) % 4;
    }
    function move(dx) {
      if (k.phase === "intro" || k.phase === "over") return;
      k.px = Math.max(PW / 2, Math.min(c.W - PW / 2, k.px + dx));
      if (k.held && k.ball) k.ball.x = k.px;
    }
    function begin() {
      c.hideCard();
      c.reset();
      k.px = c.W / 2;
      c.sfx("go");
      round();
      if (c.ui) onPad = (i) => { move(i < 2 ? -14 : 14); if (k.held) launch(); return true; };
    }
    function after(left) {
      k.phase = left ? "pause" : "dead";
      k.wait = left ? 2.4 : 1.4;
      k.ball = null;
    }

    function update(dt) {
      k.t += dt;
      if (k.phase === "pause" || k.phase === "dead") {
        k.wait -= dt;
        if (k.wait > 0) return;
        if (k.phase === "dead") { k.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return round();
      }
      if (k.phase !== "play" || !k.ball) return;
      if (k.held) {
        k.holdT -= dt;
        if (k.holdT <= 0) launch();
        k.ball.x = k.px;
        return;
      }
      // the demo keeps the paddle under the ball, nudged so it sends it toward its target brick
      if (!c.ui) {
        const t = k.bricks[k.aim];
        const offset = t ? Math.max(-14, Math.min(14, (k.ball.x - (t.x + t.w / 2)) * 0.25)) : 0;
        const want = k.ball.vy > 0 ? k.ball.x + offset : c.W / 2;
        move(Math.max(-200 * dt, Math.min(200 * dt, want - k.px)));
      }
      const b = k.ball;
      // move in small steps so the ball can't pass through a brick
      const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 3);
      for (let s = 0; s < steps; s++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); c.sfx("step"); }
        if (b.x > c.W - BR) { b.x = c.W - BR; b.vx = -Math.abs(b.vx); c.sfx("step"); }
        if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); c.sfx("step"); }
        // the paddle: where it hits sets the angle
        if (b.vy > 0 && b.y + BR >= paddleY() && b.y + BR <= paddleY() + 6 && Math.abs(b.x - k.px) <= PW / 2 + BR) {
          const speed = Math.hypot(b.vx, b.vy);
          const hitAt = (b.x - k.px) / (PW / 2);
          const a = -Math.PI / 2 + hitAt * 1.05;
          b.vx = Math.cos(a) * speed;
          b.vy = Math.sin(a) * speed;
          b.y = paddleY() - BR;
          c.sfx("blip");
        }
        const brick = k.bricks.find((r) => r.alive && b.x + BR > r.x && b.x - BR < r.x + r.w && b.y + BR > r.y && b.y - BR < r.y + r.h);
        if (brick) {
          brick.alive = false;
          if (brick.i === c.q.answerIndex) {
            c.right(brick.i);
            k.bricks.forEach((r) => (r.alive = false));
            k.phase = "pause";
            k.wait = 1.1;
            k.ball = null;
          } else {
            after(c.wrong(brick.i, "WRONG BRICK! -1 LIFE"));
          }
          return;
        }
        if (b.y > c.H + 6) return after(c.wrong(-1, "DROPPED IT! -1 LIFE", "The ball fell! "));
      }
      k.trail.push([b.x, b.y]);
      if (k.trail.length > 6) k.trail.shift();
    }

    function draw() {
      const { rect, text } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#1c2027");
      for (let x = 0; x < c.W; x += 16) rect(x, 0, 1, c.H, "#232832");
      rect(0, 0, c.W, 3, "#5b6577");
      for (const r of k.bricks) if (r.alive) {
        rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, INK);
        rect(r.x, r.y, r.w, r.h, LANE_COLORS[r.i]);
        rect(r.x, r.y, r.w, 3, "rgba(255,255,255,0.35)");
        text("ABCD"[r.i], r.x + r.w / 2, r.y + r.h / 2 + 1, "#fff", 16);
      }
      if (k.ball) {
        k.trail.forEach(([tx, ty], i) => rect(tx - 1, ty - 1, 2, 2, `rgba(255,210,63,${(i / k.trail.length) * 0.5})`));
        rect(k.ball.x - BR, k.ball.y - BR, BR * 2, BR * 2, "#ffd23f");
      }
      rect(k.px - PW / 2, paddleY(), PW, 6, "#fbfaf6");
      rect(k.px - PW / 2, paddleY() + 4, PW, 2, "#9aa3b2");
      if (k.held && k.phase === "play" && c.ui) text("PRESS ANY BUTTON TO SERVE", c.W / 2, c.H * 0.6, "#c9cdd4", 8);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      k.px = c.W / 2;
      onStick = (dir) => move(dir === "left" ? -14 : 14);
      onKey = (key) => {
        if (key === " " || key === "ArrowUp") { launch(); return true; }
        return false;
      };
      // drag (or tap) to move the paddle there; a tap also serves
      const follow = (e) => {
        const r = c.canvas.getBoundingClientRect();
        move(((e.clientX - r.left) / r.width) * c.W - k.px);
      };
      c.canvas.addEventListener("pointerdown", (e) => { follow(e); launch(); });
      c.canvas.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "mouse") follow(e); });
    } else {
      k.px = c.W / 2;
      round();
    }
    return c.stop;
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
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
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
