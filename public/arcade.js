// The machine's game menu, and four more games that quiz you on the same syllabus questions:
//   QUIZ KART: four lanes, four answers. Steer into the lane of the right answer before you
//   reach the gate. A wrong lane costs one of your 5 lives.
//   SYLLABUS FIGHTER: a one-on-one fight. Right answers land hits on the boss; a wrong answer,
//   or running out of time, lets the boss hit you. Knock out one boss and the next steps up.
//   FLAPPY FACTS: flap through the gap in the wall marked with the right answer. 3 lives.
//   QUIZ BLOCKS: falling blocks; every few pieces a quiz blasts away rows (right) or adds junk (wrong).
// The menu works like an arcade's attract screen: one game at a time, with a trailer of it playing
// itself (Kart, Flappy and Blocks run on autopilot), and arrows to flip to the next game.
// Everything runs on an overlay that covers the machine's screen and uses the arcade controls.
// The four face buttons sit in a diamond like a game controller: A top, B right, C bottom, D left,
// so in the steering games each button means its direction. Keys 1-4 press A-D. WASD and the
// arrow keys are the joystick (and can be held down); Space or the joystick's ball fires.
// Escape goes back.
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
    { id: "penalty", name: "PENALTY SHOOTOUT", desc: "Shoot at the goal corner with the right answer before the clock runs out. 3 lives.", trailer: (el) => startPenalty(null, el), start: startPenalty },
    { id: "moles", name: "WHACK-A-FACT", desc: "Whack-a-mole: whack the mole in the right answer's hole while it's up. 3 lives.", trailer: (el) => startMoles(null, el), start: startMoles },
    { id: "crossy", name: "CROSSY QUIZ", desc: "Frogger style. Hop across the traffic to the lily pad with the right answer. 3 lives.", trailer: (el) => startCrossy(null, el), start: startCrossy },
    { id: "maze", name: "MAZE MUNCHER", desc: "Maze-chase style. Munch the fruit with the right answer and dodge the ghosts. 3 lives.", trailer: (el) => startMaze(null, el), start: startMaze },
    { id: "asteroids", name: "ASTEROID ANSWERS", desc: "Asteroids style. Turn, thrust and shoot the asteroid with the right answer. 3 lives.", trailer: (el) => startAsteroids(null, el), start: startAsteroids },
    { id: "hunt", name: "QUIZ HUNT", desc: "Duck-hunt style. Aim the crosshair and shoot the duck with the right answer. 3 lives.", trailer: (el) => startHunt(null, el), start: startHunt },
    { id: "bump", name: "BLOCK BUMP", desc: "Platformer style. Run, jump and bump the ? block with the right answer. 3 lives.", trailer: (el) => startBump(null, el), start: startBump },
    { id: "cannon", name: "CANNON CLASH", desc: "Artillery style. Aim, time the power and lob a shell onto the right target. 3 lives.", trailer: (el) => startCannon(null, el), start: startCannon },
  ];

  // Direction keys being held down right now: "up" | "down" | "left" | "right" (WASD or arrows).
  const held = new Set();
  const DIR_KEYS = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
  document.addEventListener("keydown", (e) => { const d = DIR_KEYS[e.key.toLowerCase()]; if (d && !e.ctrlKey && !e.metaKey) held.add(d); });
  document.addEventListener("keyup", (e) => { const d = DIR_KEYS[e.key.toLowerCase()]; if (d) held.delete(d); });
  window.addEventListener("blur", () => held.clear());
  const holding = (d) => held.has(d);

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
      penalty: b.penalty ? `BEST: ${plural(b.penalty, "GOAL")}` : "NEW!",
      moles: b.moles ? `BEST: ${plural(b.moles, "WHACK")}` : "NEW!",
      crossy: b.crossy ? `BEST: ${plural(b.crossy, "CROSSING")}` : "NEW!",
      maze: b.maze ? `BEST: ${plural(b.maze, "FRUIT")}`.replace("FRUITS", "FRUIT") : "NEW!",
      asteroids: b.asteroids ? `BEST: ${plural(b.asteroids, "HIT")}` : "NEW!",
      hunt: b.hunt ? `BEST: ${plural(b.hunt, "DUCK")}` : "NEW!",
      bump: b.bump ? `BEST: ${plural(b.bump, "BUMP")}` : "NEW!",
      cannon: b.cannon ? `BEST: ${plural(b.cannon, "HIT")}` : "NEW!",
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
        Jump to a lane with its button (<b>A</b>-<b>D</b> or keys 1-4), steer one lane at a time with <b>A</b>/<b>D</b> or the arrow keys, or tap an answer. A wrong lane costs a life. You have 5.</p>
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
          <canvas aria-label="The block well. Arcade buttons: D left, B right, A rotate, C drop. Keys: A and D move, W rotates, S drops faster, Space drops."></canvas>
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
        if (t.phase === "play") [rotate, () => move(1), hardDrop, () => move(-1)][i]?.(); // A top, B right, C bottom, D left
        return true;
      };
    }

    function renderPanel(result) {
      if (!ui) return;
      const q = t.q;
      if (!q) {
        $("k-q").innerHTML = `<p class="t-controls"><span class="key kd">D</span> LEFT <span class="key kb">B</span> RIGHT
          <span class="key ka">A</span> ROTATE <span class="key kc">C</span> DROP &middot; WASD + SPACE</p>`;
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
        Keys: <b>A</b>/<b>D</b> move, <b>W</b> rotate, <b>S</b> faster, <b>Space</b> drop (arrow keys work too). Buttons: D left, B right, A rotate, C drop.</p>
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

  // ---------- shared cabinet for the classic canvas games (Snake, Invaders, Penalty, Whack-a-Fact, Crossy, Maze, Asteroids) ----------
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
    // a right answer: coins, a green flash, a pop-up. pay: a set number of coins instead;
    // scored: false when it doesn't count toward the score (a goal the keeper luckily saved)
    c.right = (picked, pay = null, scored = true) => {
      const coins = pay ?? (c.q?.difficulty === "hard" ? 10 : 5);
      if (scored) c.score++;
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
        Steer with <b>WASD</b> or the arrow keys, a swipe, or the buttons (each one points its way: A up, B right, C down, D left).</p>`,
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
      if (c.ui) onPad = (i) => { turn(PAD_DIRS[i]); return true; };
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
        Move with <b>A</b>/<b>D</b> (or the arrows), fire with <b>W</b> or <b>Space</b>. Buttons: D left, B right, A or C fire. On a phone, tap where to shoot.</p>`,
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
      if (c.ui) onPad = (i) => { [fire, () => move(12), fire, () => move(-12)][i](); return true; }; // A/C fire, B right, D left
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
      if (c.ui && holding("left")) move(-120 * dt);
      if (c.ui && holding("right")) move(120 * dt);
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
      onStick = () => {}; // held keys move the cannon smoothly (see update)
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

  // A shot clock in the top corner of a cabinet game: seconds left, red near the end.
  function drawClock(c, secs) {
    const n = Math.max(0, Math.ceil(secs));
    c.rect(c.W - 34, 6, 28, 18, INK);
    c.text(String(n), c.W - 20, 16, n <= 3 ? "#ff6b5a" : "#ffd23f", 8);
  }
  const clockFor = (q) => (q?.difficulty === "hard" ? 20 : 15);

  // ---------- PENALTY SHOOTOUT ----------
  // A goal with four corners: A top-left, B top-right, C bottom-left, D bottom-right. Shoot at the
  // corner with the right answer before the shot clock runs out. 3 lives.

  function startPenalty(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "penalty", stat: "GOALS", lives: 3, minW: 260, minH: 230, bestKey: "penalty", bestWord: "goals",
      intro: `<h2>PENALTY SHOOTOUT</h2><p>The goal has four corners: <b>A</b> top-left, <b>B</b> top-right, <b>C</b> bottom-left, <b>D</b> bottom-right.
        Shoot at the corner with the right answer before the shot clock runs out. A wrong corner gets saved (or hits the post) and costs a life. You have 3.
        Watch the keeper: once in a while he saves even a right answer (you still get 2 coins).
        Press A-D, or tap a corner.</p>`,
    });
    const s = { phase: "intro", clock: 15, t: 0, kick: 0, target: -1, dive: null, outcome: "", banner: "", bannerT: 0, wait: 0, keeperX: 0, keeperY: 0, arms: 0, demoT: 0 };
    const goal = () => {
      const gw = Math.min(c.W * 0.72, 320), gh = gw * 0.4;
      return { x: c.W / 2 - gw / 2, y: Math.round(c.H * 0.17), w: gw, h: gh };
    };
    const corner = (i) => {
      const g = goal();
      return { x: g.x + g.w * (i % 2 ? 0.84 : 0.16), y: g.y + g.h * (i < 2 ? 0.26 : 0.74) };
    };
    const spot = () => ({ x: c.W / 2, y: c.H * 0.8 });

    function nextKick() {
      c.nextQuestion();
      Object.assign(s, { phase: "aim", clock: clockFor(c.q), kick: 0, target: -1, dive: null, outcome: "", demoT: 1 + Math.random() * 1.2 });
      if (!c.ui) s.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function shoot(i) {
      if (s.phase !== "aim") return;
      const right = i === c.q.answerIndex;
      s.phase = "kick";
      s.kick = 0;
      s.target = i;
      // the keeper guesses wrong on a right answer (except for a lucky 1-in-50 save);
      // on a wrong one he saves it, or it hits the post
      const others = [0, 1, 2, 3].filter((k) => k !== i);
      s.outcome = right ? (Math.random() < 1 / 50 ? "lucky" : "goal") : Math.random() < 0.7 ? "saved" : "post";
      s.dive = s.outcome === "saved" || s.outcome === "lucky" ? i : others[Math.floor(Math.random() * 3)];
      c.sfx("press");
    }
    function resolve() {
      const i = s.target;
      if (s.outcome === "goal") {
        c.right(i);
        c.sfx("win");
        s.banner = "GOAL!";
        s.wait = 1.6;
        s.phase = "result";
      } else if (s.outcome === "lucky") {
        // the right answer, but the keeper got a hand to it: a consolation 2 coins, no life lost
        c.right(i, 2, false);
        s.banner = "WHAT A SAVE!";
        s.wait = 1.8;
        s.phase = "result";
      } else {
        const left = c.wrong(i, s.outcome === "saved" ? "SAVED! -1 LIFE" : "OFF THE POST! -1 LIFE");
        s.banner = s.outcome === "saved" ? "SAVED!" : "OFF THE POST!";
        s.wait = left ? 2.6 : 1.6;
        s.phase = left ? "result" : "dead";
      }
      s.bannerT = 1.6;
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      nextKick();
      if (c.ui) onPad = (i) => { shoot(i); return true; };
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      if (s.phase === "aim") {
        s.clock -= dt;
        // the keeper won't stand still: he shuffles across the goal and hops, arms up
        const g = goal();
        s.keeperX = Math.sin(s.t * 1.7) * g.w * 0.28 + Math.sin(s.t * 4.6) * g.w * 0.06;
        const hop = (s.t * 1.3) % 1;
        s.keeperY = hop < 0.3 ? -Math.sin((hop / 0.3) * Math.PI) * 14 : 0;
        s.arms = s.keeperY < -2 ? 1 : 0;
        if (!c.ui && (s.demoT -= dt) <= 0) return shoot(s.aim);
        if (s.clock <= 0) {
          s.target = -1;
          const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
          s.banner = "TOO SLOW!"; s.bannerT = 1.6;
          s.wait = left ? 2.6 : 1.6;
          s.phase = left ? "result" : "dead";
        }
      } else if (s.phase === "kick") {
        s.kick += dt;
        if (s.kick >= 0.85) resolve();
      } else if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        nextKick();
      }
    }

    function player(x, y, shirt, kickPose) {
      const { rect } = c;
      rect(x - 5, y - 26, 10, 9, "#f1c27d");            // head (from behind)
      rect(x - 5, y - 27, 10, 4, "#3a2a1a");            // hair
      rect(x - 7, y - 17, 14, 11, shirt);              // shirt
      rect(x - 2, y - 15, 4, 6, "#fbfaf6");             // number
      rect(x - 6, y - 6, 12, 4, "#fbfaf6");             // shorts
      if (kickPose) { rect(x - 5, y - 2, 4, 8, "#f1c27d"); rect(x + 2, y - 4, 4, 5, "#f1c27d"); rect(x + 4, y - 6, 5, 3, INK); }
      else { rect(x - 5, y - 2, 4, 8, "#f1c27d"); rect(x + 1, y - 2, 4, 8, "#f1c27d"); }
      rect(x - 6, y + 5, 5, 2, INK); if (!kickPose) rect(x + 1, y + 5, 5, 2, INK);
    }

    function draw() {
      const { rect, text } = c;
      const g = goal();
      // crowd, then grass
      rect(-8, -8, c.W + 16, g.y + 2 + 8, "#2e3f5c");
      for (let y = 4; y < g.y - 4; y += 5) for (let x = (y % 10) / 2; x < c.W; x += 6) {
        rect(x, y + (Math.sin(s.t * 6 + x) > 0.85 && s.bannerT && s.banner === "GOAL!" ? -2 : 0), 3, 3, ["#ffc94d", "#e5484d", "#fbfaf6", "#6b9cf0"][(x * 7 + y) % 4]);
      }
      for (let y = g.y; y < c.H + 8; y += 12) rect(-8, y, c.W + 16, 12, Math.floor((y - g.y) / 12) % 2 ? "#3ca55c" : "#46b265");
      // penalty box lines and the spot
      const box = { x: g.x - g.w * 0.18, w: g.w * 1.36 };
      rect(box.x, g.y + g.h, box.w, 2, "#fbfaf6");
      rect(box.x, g.y + g.h, 2, c.H * 0.42, "#fbfaf6");
      rect(box.x + box.w - 2, g.y + g.h, 2, c.H * 0.42, "#fbfaf6");
      rect(spot().x - 2, spot().y + 4, 4, 2, "#fbfaf6");
      // the goal: net, posts, and the four corner targets
      rect(g.x, g.y, g.w, g.h, "rgba(255,255,255,0.12)");
      for (let x = g.x; x <= g.x + g.w; x += 8) rect(x, g.y, 1, g.h, "rgba(255,255,255,0.35)");
      for (let y = g.y; y <= g.y + g.h; y += 8) rect(g.x, y, g.w, 1, "rgba(255,255,255,0.35)");
      if (s.phase === "aim" || s.phase === "kick") for (let i = 0; i < 4; i++) {
        const p = corner(i);
        rect(p.x - 12, p.y - 9, 24, 18, "rgba(17,20,24,0.45)");
        rect(p.x - 12, p.y - 9, 24, 2, LANE_COLORS[i]);
        text("ABCD"[i], p.x, p.y + 1, LANE_COLORS[i], 16);
      }
      rect(g.x - 4, g.y - 4, g.w + 8, 4, "#fbfaf6");
      rect(g.x - 4, g.y - 4, 4, g.h + 4, "#fbfaf6");
      rect(g.x + g.w, g.y - 4, 4, g.h + 4, "#fbfaf6");
      // the keeper: shuffles, then dives
      let kx = c.W / 2 + s.keeperX, ky = g.y + g.h + s.keeperY, tilt = 0;
      if (s.dive != null && s.kick > 0.3) {
        const p = corner(s.dive), f = Math.min(1, (s.kick - 0.3) / 0.35);
        kx += (p.x - kx) * f; ky += (p.y + 12 - ky) * f;
        tilt = (p.x < kx + 0.01 ? -1 : 1) * f * 1.2;
      }
      const armsUp = s.arms || (s.dive != null && s.kick > 0.3);
      c.ctx.save();
      c.ctx.translate(Math.round(kx), Math.round(ky));
      c.ctx.rotate(tilt);
      rect(-6, -30, 12, 10, "#f1c27d");
      rect(-8, -20, 16, 13, "#ffc94d");
      if (armsUp) { rect(-13, -30, 5, 10, "#ffc94d"); rect(8, -30, 5, 10, "#ffc94d"); rect(-14, -35, 6, 5, "#fbfaf6"); rect(8, -35, 6, 5, "#fbfaf6"); }
      else { rect(-13, -22, 5, 4, "#ffc94d"); rect(8, -22, 5, 4, "#ffc94d"); rect(-15, -25, 5, 5, "#fbfaf6"); rect(10, -25, 5, 5, "#fbfaf6"); } // gloves
      rect(-6, -7, 12, 4, INK);
      rect(-6, -3, 4, 6, "#f1c27d"); rect(2, -3, 4, 6, "#f1c27d");
      c.ctx.restore();
      // the ball: on the spot, then flying to its corner (shrinking with distance)
      let bx = spot().x, by = spot().y, br = 5;
      if (s.target >= 0 && s.kick > 0.3) {
        const p = corner(s.target), f = Math.min(1, (s.kick - 0.3) / 0.45);
        const miss = s.outcome === "post" ? (s.target % 2 ? 14 : -14) : 0;
        bx += (p.x + miss * f - bx) * f; by += (p.y - by) * f - Math.sin(f * Math.PI) * 18; br = 5 - 2 * f;
      }
      rect(bx - br, by - br, br * 2, br * 2, "#fbfaf6");
      rect(bx - br / 2, by - br / 2, br, br, INK);
      // the kicker runs up from behind the ball
      const run = s.phase === "kick" ? Math.min(1, s.kick / 0.3) : 0;
      player(spot().x - 16 + run * 10, spot().y + 22 - run * 8, "#e5484d", run >= 1);
      if (s.phase === "aim") drawClock(c, s.clock);
      if (s.bannerT) {
        rect(0, c.H * 0.5 - 14, c.W, 26, "rgba(17,20,24,0.8)");
        text(s.banner, c.W / 2, c.H * 0.5, s.banner === "GOAL!" ? "#7dffa8" : s.banner === "WHAT A SAVE!" ? "#ffd23f" : "#ff8a7a", 16);
      }
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      c.canvas.addEventListener("pointerdown", (e) => {
        const r = c.canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * c.W, y = ((e.clientY - r.top) / r.height) * c.H;
        let bestI = -1, bestD = 50;
        for (let i = 0; i < 4; i++) { const p = corner(i), d = Math.hypot(p.x - x, p.y - y); if (d < bestD) { bestD = d; bestI = i; } }
        if (bestI >= 0) shoot(bestI);
      });
    } else {
      nextKick();
    }
    return c.stop;
  }

  // ---------- WHACK-A-FACT ----------
  // Moles pop out of four holes, A-D. Whack the mole in the right answer's hole while it's up.
  // Whacking a wrong mole, or running out of time, costs a life. 3 lives.

  function startMoles(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "moles", stat: "WHACKS", lives: 3, minW: 260, minH: 210, bestKey: "moles", bestWord: "right whacks",
      intro: `<h2>WHACK-A-FACT</h2><p>Moles pop out of four holes, <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b>.
        Whack the mole in the hole with the right answer while it's up: press its button, or tap it.
        Whacking a wrong mole, or running out of time, costs a life. You have 3.</p>`,
    });
    const s = { phase: "intro", clock: 15, t: 0, holes: [], pop: 0, wait: 0, hammer: null, cool: 0, banner: "", bannerT: 0, react: 0 };
    const resetHoles = () => { s.holes = [0, 1, 2, 3].map((i) => ({ i, up: false, rise: 0, life: 0, bonk: 0 })); };
    resetHoles();
    const holePos = (i) => {
      const sp = Math.min(c.W / 4.4, 84);
      return { x: c.W / 2 + (i - 1.5) * sp, y: c.H * 0.6 };
    };

    function nextRound() {
      c.nextQuestion();
      resetHoles();
      Object.assign(s, { phase: "play", clock: clockFor(c.q), pop: 0.4, cool: 0, react: 0 });
      if (!c.ui) s.aim = Math.random() < 0.85 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function after(left, wait) {
      s.wait = left ? wait : 1.6;
      s.phase = left ? "result" : "dead";
    }
    function whack(i) {
      if (s.phase !== "play" || s.cool > 0) return;
      s.hammer = { i, t: 0.25 };
      const h = s.holes[i];
      if (!h.up || h.rise < 0.5) {
        s.cool = 0.35;
        c.sfx("step");
        return;
      }
      h.bonk = 0.5;
      c.sfx("punch");
      if (i === c.q.answerIndex) {
        c.right(i);
        s.banner = "WHACK!"; s.bannerT = 1.2;
        s.holes.forEach((o) => { if (o !== h) o.up = false; });
        after(true, 1.3);
      } else {
        const left = c.wrong(i, "WRONG MOLE! -1 LIFE");
        s.banner = "WRONG MOLE!"; s.bannerT = 1.4;
        after(left, 2.6);
      }
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      nextRound();
      if (c.ui) onPad = (i) => { whack(i); return true; };
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      s.cool = Math.max(0, s.cool - dt);
      if (s.hammer && (s.hammer.t -= dt) <= 0) s.hammer = null;
      for (const h of s.holes) {
        h.bonk = Math.max(0, h.bonk - dt);
        h.rise += ((h.up ? 1 : 0) - h.rise) * Math.min(1, dt * 12);
      }
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return nextRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        s.holes.forEach((h) => (h.up = false));
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return after(left, 2.6);
      }
      // moles pop up for a moment; the right one turns up often enough to catch
      const upTime = Math.max(0.85, 1.5 - c.score * 0.04);
      for (const h of s.holes) if (h.up && (h.life -= dt) <= 0) h.up = false;
      s.pop -= dt;
      if (s.pop <= 0) {
        const down = s.holes.filter((h) => !h.up);
        const rightHole = s.holes[c.q.answerIndex];
        const h = !rightHole.up && Math.random() < 0.4 ? rightHole : down[Math.floor(Math.random() * down.length)];
        if (h) { h.up = true; h.life = upTime; }
        s.pop = 0.45 + Math.random() * 0.4;
      }
      // the demo whacks its target when it's up, after a human-ish pause
      if (!c.ui) {
        const h = s.holes[s.aim];
        if (h.up && h.rise > 0.6) { s.react += dt; if (s.react > 0.25) { s.react = 0; whack(s.aim); } }
      }
    }

    function draw() {
      const { rect, text, ctx } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#9fd3e6");
      rect(-8, c.H * 0.32, c.W + 16, c.H, "#7cc46a");
      for (let x = -8; x < c.W; x += 14) rect(x, c.H * 0.32, 7, 3, "#6ab35a");
      rect(c.W * 0.08, c.H * 0.12, 18, 5, "#fff"); rect(c.W * 0.08 + 4, c.H * 0.12 - 4, 10, 4, "#fff");
      rect(c.W * 0.7, c.H * 0.18, 22, 5, "#fff"); rect(c.W * 0.7 + 5, c.H * 0.18 - 4, 12, 4, "#fff");
      for (const h of s.holes) {
        const p = holePos(h.i);
        // the mole, rising out of its hole (clipped at the hole's rim)
        ctx.save();
        ctx.beginPath(); ctx.rect(p.x - 30, p.y - 60, 60, 60); ctx.clip();
        const my = p.y + 4 - h.rise * 34;
        const squash = h.bonk ? 4 : 0;
        rect(p.x - 13, my + squash, 26, 30 - squash, "#8a5a32");
        rect(p.x - 10, my + 3 + squash, 20, 10, "#a8754a");
        if (h.bonk) { rect(p.x - 7, my + 6, 5, 1, INK); rect(p.x + 2, my + 6, 5, 1, INK); rect(p.x - 1, my - 10, 2, 6, "#ffd23f"); rect(p.x - 3, my - 8, 6, 2, "#ffd23f"); }
        else { rect(p.x - 6, my + 5, 3, 3, INK); rect(p.x + 3, my + 5, 3, 3, INK); }
        rect(p.x - 2, my + 9 + squash, 4, 3, "#e57a9a");
        rect(p.x - 3, my + 13 + squash, 6, 2, "#fbfaf6");
        ctx.restore();
        // the hole's rim and its letter
        rect(p.x - 26, p.y, 52, 8, "#3a2a1a");
        rect(p.x - 22, p.y + 8, 44, 4, "#5a3a1a");
        rect(p.x - 11, p.y + 16, 22, 16, INK);
        rect(p.x - 10, p.y + 17, 20, 14, LANE_COLORS[h.i]);
        text("ABCD"[h.i], p.x, p.y + 25, "#fff", 8);
      }
      if (s.hammer) {
        const p = holePos(s.hammer.i);
        const a = (s.hammer.t / 0.25) * 0.9;
        ctx.save();
        ctx.translate(Math.round(p.x + 16), Math.round(p.y - 46));
        ctx.rotate(-a);
        rect(-2, 0, 4, 22, "#8a5a32");
        rect(-10, 18, 20, 10, "#5b6577");
        rect(-10, 18, 20, 2, "#8f98a8");
        ctx.restore();
      }
      if (s.phase === "play") drawClock(c, s.clock);
      if (s.bannerT) text(s.banner, c.W / 2, c.H * 0.2, s.banner === "WHACK!" ? "#1f9d55" : "#d93a3a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      c.canvas.addEventListener("pointerdown", (e) => {
        const r = c.canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * c.W;
        let bestI = 0, bestD = Infinity;
        for (let i = 0; i < 4; i++) { const d = Math.abs(holePos(i).x - x); if (d < bestD) { bestD = d; bestI = i; } }
        whack(bestI);
      });
    } else {
      nextRound();
    }
    return c.stop;
  }

  // Four-way controls for the grid games: WASD and the arrow keys, swipes, and the buttons by their
  // place in the diamond (A up, B right, C down, D left).
  function fourWay(c, go) {
    onStick = (dir) => go(dir);
    onKey = (key) => {
      if (key === "ArrowUp" || key === "ArrowDown") { go(key === "ArrowUp" ? "up" : "down"); return true; }
      return false;
    };
    let downAt = null;
    c.canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
    c.canvas.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
      downAt = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      go(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");
    });
  }
  const PAD_DIRS = ["up", "right", "down", "left"]; // where each face button sits
  const STEP = { left: [-1, 0], up: [0, -1], down: [0, 1], right: [1, 0] };

  // ---------- CROSSY QUIZ ----------
  // Hop across the traffic to the lily pad marked with the right answer. Cars and wrong pads cost
  // a life. 3 lives.

  function startCrossy(u, demo = null) {
    const COLS = 13, ROWS = 8, CS = 16;
    const PAD_COLS = [1, 4, 8, 11];               // where the four pads sit on the top row
    const LANES = { 1: 1, 2: -1, 3: 1, 5: -1, 6: 1 }; // road rows and their direction (row 4 is the median)
    const c = cabinet({
      u, demo, cls: "crossy", stat: "CROSSINGS", lives: 3, minW: 240, minH: 170, bestKey: "crossy", bestWord: "right pads",
      intro: `<h2>CROSSY QUIZ</h2><p>Hop across the road to the lily pad with the right answer: pads <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b> along the top.
        Cars, a wrong pad, or running out of time cost a life. You have 3.
        Hop with <b>WASD</b> or the arrow keys, a swipe, or the buttons (A up, B right, C down, D left).</p>`,
    });
    const s = { phase: "intro", x: 6, y: 7, hop: 0, cars: {}, clock: 25, wait: 0, banner: "", bannerT: 0, t: 0, splat: null, demoT: 0 };
    const ox = () => Math.round((c.W - COLS * CS) / 2);
    const oy = () => Math.round((c.H - ROWS * CS) / 2) + 4;

    function makeTraffic() {
      s.cars = {};
      const level = Math.min(10, c.score);
      for (const [row, dir] of Object.entries(LANES)) {
        const speed = (22 + Number(row) * 4 + level * 3) * dir;
        const cars = [];
        const count = 2; // two cars a lane leaves real gaps to hop through
        for (let k = 0; k < count; k++) cars.push({ x: (k * COLS * CS) / count + Math.random() * 20, len: Number(row) === 3 ? 3 : 2, color: ["#e5484d", "#3b6fe0", "#ffc94d", "#8e5bd6", "#ff8a3d"][(Number(row) + k) % 5] });
        s.cars[row] = { speed, cars };
      }
    }
    function newRound() {
      c.nextQuestion();
      Object.assign(s, { x: 6, y: 7, hop: 0, clock: (c.q?.difficulty === "hard" ? 30 : 25), phase: "play", splat: null, demoT: 0.4 });
      makeTraffic();
      if (!c.ui) s.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function hopTo(dir) {
      if (s.phase !== "play" || s.hop > 0) return;
      const [dx, dy] = STEP[dir];
      const nx = s.x + dx, ny = s.y + dy;
      if (nx < 0 || nx >= COLS || ny > 7) return;
      if (ny === 0 && !PAD_COLS.includes(nx)) return; // hedges between the pads
      s.x = nx; s.y = ny; s.hop = 0.12;
      c.sfx("step");
      if (ny === 0) land(PAD_COLS.indexOf(nx));
    }
    function land(i) {
      if (i === c.q.answerIndex) {
        c.right(i);
        s.banner = "SAFE!"; s.bannerT = 1.3;
        end(true, 1.3);
      } else {
        const left = c.wrong(i, "WRONG PAD! -1 LIFE");
        s.banner = "WRONG PAD!"; s.bannerT = 1.4;
        end(left, 2.6);
      }
    }
    function end(left, wait) {
      s.phase = left ? "result" : "dead";
      s.wait = left ? wait : 1.6;
    }
    function carAt(row, px0, px1) {
      const lane = s.cars[row];
      if (!lane) return false;
      const span = COLS * CS;
      return lane.cars.some((car) => {
        const a = ((car.x % span) + span) % span, b = a + car.len * CS;
        return (px1 > a + 2 && px0 < b - 2) || (px1 > a - span + 2 && px0 < b - span - 2);
      });
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      newRound();
      if (c.ui) onPad = (i) => { hopTo(PAD_DIRS[i]); return true; };
    }

    // Is the frog's cell in this row free of cars for the next few seconds?
    function clearFor(row, secs) {
      const lane = s.cars[row];
      if (!lane) return true;
      const x0 = s.x * CS, ahead = lane.speed * secs;
      return !carAt(row, Math.min(x0, x0 - ahead), Math.max(x0 + CS, x0 + CS - ahead));
    }
    // the demo frog: line up with its pad on the safe rows; only step into a lane that stays clear
    // long enough to step out of again, and back off if a car is coming
    function demoMove() {
      const want = PAD_COLS[s.aim];
      if ((s.y === 7 || s.y === 4) && s.x !== want) return hopTo(s.x < want ? "right" : "left");
      const inLane = Boolean(LANES[s.y]);
      if (inLane && !clearFor(s.y, 0.4)) return hopTo(clearFor(s.y - 1, 0.4) ? "up" : "down");
      if (clearFor(s.y - 1, 0.9)) hopTo("up");
    }

    function update(dt) {
      s.t += dt;
      s.hop = Math.max(0, s.hop - dt);
      s.bannerT = Math.max(0, s.bannerT - dt);
      for (const lane of Object.values(s.cars)) for (const car of lane.cars) car.x += lane.speed * dt;
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      if (carAt(s.y, s.x * CS + 3, s.x * CS + CS - 3)) {
        s.splat = { x: s.x, y: s.y };
        const left = c.wrong(-1, "SPLAT! -1 LIFE", "Hit by a car! ");
        s.banner = "SPLAT!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      if (!c.ui && (s.demoT -= dt) <= 0) { s.demoT = 0.18; demoMove(); }
    }

    function draw() {
      const { rect, text } = c;
      const x0 = ox(), y0 = oy();
      rect(-8, -8, c.W + 16, c.H + 16, "#2f7d4f");
      for (let row = 0; row < ROWS; row++) {
        const y = y0 + row * CS;
        if (row === 0) {
          rect(x0, y, COLS * CS, CS, "#2f6fa8");                                        // the pond
          for (let x = 0; x < COLS; x++) if (!PAD_COLS.includes(x)) rect(x0 + x * CS, y, CS, CS, "#1f6e3a"); // hedges
        } else if (LANES[row]) {
          rect(x0, y, COLS * CS, CS, "#4a5060");
          if (row !== 3 && row !== 6) for (let x = 0; x < COLS * CS; x += 12) rect(x0 + x, y + CS - 1, 6, 1, "#c9cdd4");
        } else rect(x0, y, COLS * CS, CS, "#7cc46a");                                   // grass median and start
      }
      PAD_COLS.forEach((col, i) => {
        const px0 = x0 + col * CS, py0 = y0;
        rect(px0 + 1, py0 + 2, CS - 2, CS - 4, "#3ca55c");
        rect(px0 + 3, py0 + 3, CS - 6, CS - 6, LANE_COLORS[i]);
        text("ABCD"[i], px0 + CS / 2, py0 + CS / 2 + 1, "#fff", 8);
      });
      // cars
      const span = COLS * CS;
      c.ctx.save();
      c.ctx.beginPath(); c.ctx.rect(x0, y0, span, ROWS * CS); c.ctx.clip();
      for (const [row, lane] of Object.entries(s.cars)) for (const car of lane.cars) {
        const a = ((car.x % span) + span) % span;
        for (const off of [0, -span]) {
          const cx = x0 + a + off, cy = y0 + Number(row) * CS;
          rect(cx + 1, cy + 2, car.len * CS - 2, CS - 4, car.color);
          rect(cx + (lane.speed > 0 ? car.len * CS - 6 : 3), cy + 4, 3, CS - 8, "#cfe8f2");
          rect(cx + 3, cy + CS - 3, 4, 2, INK); rect(cx + car.len * CS - 7, cy + CS - 3, 4, 2, INK);
        }
      }
      c.ctx.restore();
      // the frog
      const fx = x0 + s.x * CS, fy = y0 + s.y * CS - (s.hop ? 3 : 0);
      if (s.splat) { rect(fx + 1, fy + 5, CS - 2, 6, "#3ca55c"); rect(fx + 4, fy + 3, CS - 8, 2, "#3ca55c"); }
      else if (s.phase !== "over") {
        rect(fx + 3, fy + 3, CS - 6, CS - 5, "#3ce070");
        rect(fx + 2, fy + 10, 3, 4, "#3ca55c"); rect(fx + CS - 5, fy + 10, 3, 4, "#3ca55c");
        rect(fx + 4, fy + 2, 3, 3, "#fff"); rect(fx + CS - 7, fy + 2, 3, 3, "#fff");
        rect(fx + 5, fy + 3, 1, 1, INK); rect(fx + CS - 6, fy + 3, 1, 1, INK);
      }
      if (s.phase === "play") drawClock(c, s.clock);
      if (s.bannerT) text(s.banner, c.W / 2, y0 + 4 * CS + CS / 2, s.banner === "SAFE!" ? "#7dffa8" : "#ff8a7a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      fourWay(c, hopTo);
    } else newRound();
    return c.stop;
  }

  // ---------- MAZE MUNCHER ----------
  // Munch the fruit marked with the right answer. Ghosts, wrong fruit and the clock cost a life.

  const MAZE = [
    "###############",
    "#.............#",
    "#.##.#####.##.#",
    "#.#.........#.#",
    "#.#.##.#.##.#.#",
    "#......#......#",
    "#.#.##.#.##.#.#",
    "#.#.........#.#",
    "#.##.#####.##.#",
    "#.............#",
    "###############",
  ];

  function startMaze(u, demo = null) {
    const MW = MAZE[0].length, MH = MAZE.length, CS = 14;
    const c = cabinet({
      u, demo, cls: "maze", stat: "FRUIT", lives: 3, minW: 230, minH: 180, bestKey: "maze", bestWord: "right fruit",
      intro: `<h2>MAZE MUNCHER</h2><p>Four fruits in the maze are marked <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b>. Munch the one with the right answer
        and keep away from the ghosts. A ghost, a wrong fruit, or running out of time costs a life. You have 3.
        Steer with <b>WASD</b> or the arrow keys, a swipe, or the buttons (A up, B right, C down, D left).</p>`,
    });
    const open = (x, y) => MAZE[y]?.[x] === ".";
    const s = { phase: "intro", me: null, ghosts: [], fruits: [], dots: new Set(), clock: 25, wait: 0, banner: "", bannerT: 0, t: 0 };
    const ox = () => Math.round((c.W - MW * CS) / 2);
    const oy = () => Math.round((c.H - MH * CS) / 2);

    const mover = (x, y, speed) => ({ x, y, fx: x, fy: y, dir: [0, 0], want: null, speed, prog: 0 });
    function newRound() {
      c.nextQuestion();
      s.me = mover(7, 5, 5.2);
      const level = Math.min(8, c.score);
      const ghostSpeed = (2.8 + level * 0.15) * (c.ui ? 1 : 0.75); // a little slower in the menu's demo
      s.ghosts = [mover(1, 1, ghostSpeed), mover(13, 9, ghostSpeed)];
      s.ghosts.forEach((g, i) => (g.color = ["#e5484d", "#ff8ad0"][i]));
      s.dots = new Set();
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (open(x, y)) s.dots.add(`${x},${y}`);
      // fruit in four spread-out spots, away from you
      const spots = shuffle([[1, 9], [13, 1], [4, 3], [10, 7], [1, 5], [13, 5], [7, 9], [7, 1], [3, 9], [11, 1]]);
      s.fruits = spots.slice(0, 4).map(([x, y], i) => ({ x, y, i }));
      Object.assign(s, { phase: "play", clock: c.q?.difficulty === "hard" ? 30 : 25 });
      if (!c.ui) s.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function steer(dir) { if (s.phase === "play") s.me.want = STEP[dir]; }
    function end(left, wait) {
      s.phase = left ? "result" : "dead";
      s.wait = left ? wait : 1.6;
    }
    // move along the grid: pick a direction at each cell, then slide to the next one
    function advance(m, dt, choose) {
      m.prog += m.speed * dt;
      while (m.prog >= 1 || (m.dir[0] === 0 && m.dir[1] === 0)) {
        if (m.dir[0] || m.dir[1]) { m.x += m.dir[0]; m.y += m.dir[1]; m.prog -= 1; arrive(m); if (s.phase !== "play") return; }
        const d = choose(m);
        if (!d) { m.dir = [0, 0]; m.prog = 0; break; }
        m.dir = d;
      }
      m.fx = m.x + m.dir[0] * m.prog;
      m.fy = m.y + m.dir[1] * m.prog;
    }
    function arrive(m) {
      if (m !== s.me) return;
      s.dots.delete(`${m.x},${m.y}`);
      const f = s.fruits.find((f) => f.x === m.x && f.y === m.y);
      if (!f) return;
      if (f.i === c.q.answerIndex) {
        c.right(f.i);
        s.banner = "YUM!"; s.bannerT = 1.3;
        end(true, 1.3);
      } else {
        const left = c.wrong(f.i, "WRONG FRUIT! -1 LIFE");
        s.banner = "WRONG FRUIT!"; s.bannerT = 1.4;
        end(left, 2.6);
      }
    }
    const meChoose = (m) => {
      if (!c.ui) demoWant(); // the demo plans each turn as it reaches a cell
      if (m.want && open(m.x + m.want[0], m.y + m.want[1])) return m.want;
      if (open(m.x + m.dir[0], m.y + m.dir[1]) && (m.dir[0] || m.dir[1])) return m.dir;
      return null;
    };
    const ghostChoose = (g) => {
      const options = Object.values(STEP).filter((d) => open(g.x + d[0], g.y + d[1]) && !(d[0] === -g.dir[0] && d[1] === -g.dir[1]));
      if (!options.length) return [-g.dir[0], -g.dir[1]];
      if (Math.random() < 0.5) options.sort((a, b) => Math.hypot(g.x + a[0] - s.me.x, g.y + a[1] - s.me.y) - Math.hypot(g.x + b[0] - s.me.x, g.y + b[1] - s.me.y));
      else options.sort(() => Math.random() - 0.5);
      return options[0];
    };
    // the demo muncher: the shortest path to its fruit, steering clear of ghosts
    function demoWant() {
      const target = s.fruits[s.aim];
      if (!target) return;
      const danger = new Set();
      for (const g of s.ghosts) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 2) danger.add(`${g.x + dx},${g.y + dy}`);
      danger.delete(`${s.me.x},${s.me.y}`);
      for (const f of s.fruits) if (f !== target) danger.add(`${f.x},${f.y}`); // don't munch the wrong fruit on the way
      const prev = new Map([[`${s.me.x},${s.me.y}`, null]]);
      const queue = [[s.me.x, s.me.y]];
      while (queue.length) {
        const [x, y] = queue.shift();
        if (x === target.x && y === target.y) break;
        for (const d of Object.values(STEP)) {
          const k = `${x + d[0]},${y + d[1]}`;
          if (!open(x + d[0], y + d[1]) || prev.has(k) || danger.has(k)) continue;
          prev.set(k, [x, y]);
          queue.push([x + d[0], y + d[1]]);
        }
      }
      let k = `${target.x},${target.y}`, step = null;
      if (!prev.has(k)) {
        // no safe way there right now: move away from the nearest ghost
        const away = Object.values(STEP).filter((d) => open(s.me.x + d[0], s.me.y + d[1]) &&
            !s.fruits.some((f) => f !== target && f.x === s.me.x + d[0] && f.y === s.me.y + d[1]))
          .sort((a, b) => Math.min(...s.ghosts.map((g) => Math.hypot(g.x - s.me.x - b[0], g.y - s.me.y - b[1])))
            - Math.min(...s.ghosts.map((g) => Math.hypot(g.x - s.me.x - a[0], g.y - s.me.y - a[1]))));
        if (away[0]) s.me.want = away[0];
        return;
      }
      while (prev.get(k) && prev.get(k).join(",") !== `${s.me.x},${s.me.y}`) { step = prev.get(k); k = step.join(","); }
      const [nx, ny] = k.split(",").map(Number);
      s.me.want = [nx - s.me.x, ny - s.me.y];
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      newRound();
      if (c.ui) onPad = (i) => { steer(PAD_DIRS[i]); return true; };
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      advance(s.me, dt, meChoose);
      if (s.phase !== "play") return;
      for (const g of s.ghosts) advance(g, dt, ghostChoose);
      if (s.ghosts.some((g) => Math.hypot(g.fx - s.me.fx, g.fy - s.me.fy) < 0.6)) {
        const left = c.wrong(-1, "CAUGHT! -1 LIFE", "A ghost got you! ");
        s.banner = "CAUGHT!"; s.bannerT = 1.4;
        end(left, 2.6);
      }
    }

    function draw() {
      const { rect, text, ctx } = c;
      const x0 = ox(), y0 = oy();
      rect(-8, -8, c.W + 16, c.H + 16, "#0f1217");
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        if (MAZE[y][x] === "#") {
          rect(x0 + x * CS, y0 + y * CS, CS, CS, "#1c2a6b");
          rect(x0 + x * CS + 2, y0 + y * CS + 2, CS - 4, CS - 4, "#2c45b8");
        } else if (s.dots.has(`${x},${y}`)) rect(x0 + x * CS + CS / 2 - 1, y0 + y * CS + CS / 2 - 1, 2, 2, "#f5ebcc");
      }
      for (const f of s.fruits) {
        const px0 = x0 + f.x * CS, py0 = y0 + f.y * CS;
        rect(px0 + 1, py0 + 1, CS - 2, CS - 2, LANE_COLORS[f.i]);
        rect(px0 + CS / 2 - 1, py0 - 1, 2, 3, "#3ca55c");
        text("ABCD"[f.i], px0 + CS / 2, py0 + CS / 2 + 1, "#fff", 8);
      }
      for (const g of s.ghosts) {
        const gx = x0 + g.fx * CS, gy = y0 + g.fy * CS;
        rect(gx + 2, gy + 2, CS - 4, CS - 4, g.color);
        rect(gx + 2, gy + CS - 4, 3, 2, "#0f1217"); rect(gx + CS - 5, gy + CS - 4, 3, 2, "#0f1217");
        rect(gx + 4, gy + 4, 2, 3, "#fff"); rect(gx + CS - 6, gy + 4, 2, 3, "#fff");
      }
      if (s.me && s.phase !== "over") {
        const mx = x0 + s.me.fx * CS + CS / 2, my = y0 + s.me.fy * CS + CS / 2;
        const open = Math.abs(Math.sin(s.t * 12)) * 0.7 + 0.05;
        const facing = Math.atan2(s.me.dir[1], s.me.dir[0] || (s.me.dir[1] ? 0 : 1));
        ctx.fillStyle = "#ffd23f";
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.arc(mx, my, CS / 2 - 1, facing + open, facing + Math.PI * 2 - open);
        ctx.closePath();
        ctx.fill();
      }
      if (s.phase === "play") drawClock(c, s.clock);
      if (s.bannerT) text(s.banner, c.W / 2, c.H / 2, s.banner === "YUM!" ? "#7dffa8" : "#ff8a7a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      fourWay(c, steer);
    } else newRound();
    return c.stop;
  }

  // ---------- ASTEROID ANSWERS ----------
  // Four asteroids drift by, marked A-D. Shoot the one with the right answer. Shooting a wrong one,
  // crashing into one, or running out of time costs a life. 3 lives.

  function startAsteroids(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "asteroids", stat: "HITS", lives: 3, minW: 250, minH: 210, bestKey: "asteroids", bestWord: "right hits",
      intro: `<h2>ASTEROID ANSWERS</h2><p>Four asteroids drift by, marked <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b>. Shoot the one with the right answer.
        Hitting a wrong one, crashing into one, or running out of time costs a life. You have 3.
        <b>A</b>/<b>D</b> turn, <b>W</b> thrust, <b>Space</b> or <b>S</b> fire (arrow keys work too). Buttons: D turn left, B turn right, A thrust, C fire. On a phone, tap where to shoot.</p>`,
    });
    const s = { phase: "intro", ship: null, rocks: [], shots: [], clock: 20, wait: 0, banner: "", bannerT: 0, t: 0, booms: [], stars: [], flame: 0, aimAt: null };
    for (let i = 0; i < 50; i++) s.stars.push([Math.random(), Math.random()]);
    const wrap = (o) => { o.x = (o.x + c.W) % c.W; o.y = (o.y + c.H) % c.H; };

    function newRound() {
      c.nextQuestion();
      s.ship = { x: c.W / 2, y: c.H / 2, a: -Math.PI / 2, vx: 0, vy: 0 };
      s.shots = [];
      s.rocks = [0, 1, 2, 3].map((i) => {
        const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.8;
        const dist = Math.min(c.W, c.H) * 0.38;
        const sp = 10 + Math.random() * 10 + Math.min(14, c.score * 1.2);
        const dir = Math.random() * Math.PI * 2;
        return { i, x: c.W / 2 + Math.cos(ang) * dist * 1.2, y: c.H / 2 + Math.sin(ang) * dist, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, r: 13, spin: Math.random() * 6, alive: true,
          shape: Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.35) };
      });
      Object.assign(s, { phase: "play", clock: c.q?.difficulty === "hard" ? 25 : 20 });
      if (!c.ui) s.aim = Math.random() < 0.8 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    const turn = (d) => { if (s.phase === "play") s.ship.a += d * 0.32; };
    function thrust() {
      if (s.phase !== "play") return;
      s.ship.vx += Math.cos(s.ship.a) * 22;
      s.ship.vy += Math.sin(s.ship.a) * 22;
      s.flame = 0.15;
    }
    function fire() {
      if (s.phase !== "play" || s.shots.length >= 3) return;
      const { x, y, a } = s.ship;
      s.shots.push({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 1.1 });
      c.sfx("blip");
    }
    const boom = (x, y, color) => s.booms.push({ x, y, t: 0.6, color });
    function end(left, wait) {
      s.phase = left ? "result" : "dead";
      s.wait = left ? wait : 1.6;
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      newRound();
      if (c.ui) onPad = (i) => { [thrust, () => turn(1), fire, () => turn(-1)][i](); return true; }; // A thrust, B right, C fire, D left
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      s.flame = Math.max(0, s.flame - dt);
      s.booms.forEach((b) => (b.t -= dt));
      s.booms = s.booms.filter((b) => b.t > 0);
      for (const r of s.rocks) if (r.alive) { r.x += r.vx * dt; r.y += r.vy * dt; r.spin += dt; wrap(r); }
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      const ship = s.ship;
      if (c.ui) {
        if (holding("left")) ship.a -= 3.6 * dt;
        if (holding("right")) ship.a += 3.6 * dt;
        if (holding("up")) { ship.vx += Math.cos(ship.a) * 110 * dt; ship.vy += Math.sin(ship.a) * 110 * dt; s.flame = 0.1; }
      }
      // tap-to-aim (and the demo): turn toward the target, then fire
      const aimRock = !c.ui ? s.rocks[s.aim] : null;
      const aimAt = aimRock?.alive ? { x: aimRock.x, y: aimRock.y } : s.aimAt;
      if (aimAt) {
        const want = Math.atan2(aimAt.y - ship.y, aimAt.x - ship.x);
        let diff = ((want - ship.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        ship.a += Math.max(-4 * dt, Math.min(4 * dt, diff));
        if (Math.abs(diff) < 0.08) { fire(); s.aimAt = null; }
      }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      ship.vx *= 1 - 0.8 * dt; ship.vy *= 1 - 0.8 * dt;
      wrap(ship);
      for (const sh of s.shots) { sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt; wrap(sh); }
      s.shots = s.shots.filter((sh) => sh.life > 0);
      for (const sh of s.shots) {
        const rock = s.rocks.find((r) => r.alive && Math.hypot(r.x - sh.x, r.y - sh.y) < r.r);
        if (!rock) continue;
        sh.life = 0;
        rock.alive = false;
        if (rock.i === c.q.answerIndex) {
          boom(rock.x, rock.y, "#7dffa8");
          c.right(rock.i);
          s.banner = "BULLSEYE!"; s.bannerT = 1.3;
          s.rocks.forEach((r) => { if (r.alive) boom(r.x, r.y, "#9aa3b2"); r.alive = false; });
          return end(true, 1.3);
        }
        boom(rock.x, rock.y, "#ff8a7a");
        const left = c.wrong(rock.i, "WRONG ROCK! -1 LIFE");
        s.banner = "WRONG ROCK!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      if (s.rocks.some((r) => r.alive && Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 5)) {
        boom(ship.x, ship.y, "#ffd23f");
        const left = c.wrong(-1, "CRASH! -1 LIFE", "You hit an asteroid! ");
        s.banner = "CRASH!"; s.bannerT = 1.4;
        end(left, 2.6);
      }
    }

    function draw() {
      const { rect, text, ctx } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#0b0d12");
      for (const [sx, sy] of s.stars) rect(sx * c.W, sy * c.H, 1, 1, "#5b6577");
      ctx.lineWidth = 1.5;
      for (const r of s.rocks) if (r.alive) {
        ctx.strokeStyle = LANE_COLORS[r.i];
        ctx.beginPath();
        r.shape.forEach((k, j) => {
          const a = (j / r.shape.length) * Math.PI * 2 + r.spin * 0.6;
          const px0 = r.x + Math.cos(a) * r.r * k, py0 = r.y + Math.sin(a) * r.r * k;
          j ? ctx.lineTo(px0, py0) : ctx.moveTo(px0, py0);
        });
        ctx.closePath();
        ctx.stroke();
        text("ABCD"[r.i], r.x, r.y + 1, LANE_COLORS[r.i], 8);
      }
      for (const sh of s.shots) rect(sh.x - 1, sh.y - 1, 2, 2, "#ffd23f");
      for (const b of s.booms) {
        const rr = (0.6 - b.t) * 40;
        for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; rect(b.x + Math.cos(a) * rr - 1, b.y + Math.sin(a) * rr - 1, 2, 2, b.color); }
      }
      if (s.ship && s.phase !== "over" && !(s.banner === "CRASH!" && s.bannerT)) {
        const { x, y, a } = s.ship;
        const pt = (d, ang) => [x + Math.cos(a + ang) * d, y + Math.sin(a + ang) * d];
        ctx.strokeStyle = "#fbfaf6";
        ctx.beginPath();
        ctx.moveTo(...pt(9, 0)); ctx.lineTo(...pt(7, 2.5)); ctx.lineTo(...pt(3, Math.PI)); ctx.lineTo(...pt(7, -2.5)); ctx.closePath();
        ctx.stroke();
        if (s.flame) { ctx.strokeStyle = "#ff8a3d"; ctx.beginPath(); ctx.moveTo(...pt(5, Math.PI - 0.4)); ctx.lineTo(...pt(11, Math.PI)); ctx.lineTo(...pt(5, Math.PI + 0.4)); ctx.stroke(); }
      }
      if (s.phase === "play") drawClock(c, s.clock);
      if (s.bannerT) text(s.banner, c.W / 2, c.H * 0.22, s.banner === "BULLSEYE!" ? "#7dffa8" : "#ff8a7a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      onStick = () => {}; // held keys turn and thrust smoothly (see update)
      onKey = (key) => {
        if (key === "ArrowUp") return true;
        if (key === " " || key === "ArrowDown") { fire(); return true; }
        return false;
      };
      c.canvas.addEventListener("pointerdown", (e) => {
        if (s.phase !== "play") return;
        const r = c.canvas.getBoundingClientRect();
        s.aimAt = { x: ((e.clientX - r.left) / r.width) * c.W, y: ((e.clientY - r.top) / r.height) * c.H };
      });
    } else newRound();
    return c.stop;
  }

  // ---------- QUIZ HUNT ----------
  // Four ducks flap around, marked A-D. Aim the crosshair and shoot the one with the right answer.
  // 5 shells a round. A wrong duck, running out of shells or time costs a life. 3 lives.

  function startHunt(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "hunt", stat: "DUCKS", lives: 3, minW: 260, minH: 210, bestKey: "hunt", bestWord: "right ducks",
      intro: `<h2>QUIZ HUNT</h2><p>Four ducks fly around, marked <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b>. Shoot the one with the right answer.
        You get 5 shells a round. A wrong duck, running out of shells, or running out of time costs a life. You have 3.
        Aim with <b>WASD</b> or the arrow keys (or the buttons: A up, B right, C down, D left) and fire with <b>Space</b> or the joystick's ball. Or just click or tap a duck.</p>`,
    });
    const s = { phase: "intro", ducks: [], cx: 0, cy: 0, shells: 5, clock: 20, wait: 0, banner: "", bannerT: 0, t: 0, flash: 0, demoT: 0 };
    const groundY = () => c.H * 0.78;

    function newRound() {
      c.nextQuestion();
      s.ducks = [0, 1, 2, 3].map((i) => {
        const speed = 34 + Math.random() * 18 + Math.min(30, c.score * 2.5);
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        return { i, x: c.W * (0.2 + i * 0.2), y: groundY() - 10, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, alive: true, fall: 0, turn: 1 + Math.random() * 2 };
      });
      Object.assign(s, { phase: "play", shells: 5, clock: c.q?.difficulty === "hard" ? 25 : 20, cx: c.W / 2, cy: c.H * 0.4, demoT: 0.8 });
      if (!c.ui) s.aim = Math.random() < 0.85 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function end(left, wait) {
      s.phase = left ? "result" : "dead";
      s.wait = left ? wait : 1.6;
    }
    function shoot(x = s.cx, y = s.cy) {
      if (s.phase !== "play" || s.shells <= 0) return;
      s.cx = x; s.cy = y;
      s.shells--;
      s.flash = 0.08;
      c.sfx("punch");
      const duck = s.ducks.find((d) => d.alive && Math.abs(d.x - x) < 13 && Math.abs(d.y - y) < 11);
      if (duck) {
        duck.alive = false;
        duck.fall = 0.01;
        if (duck.i === c.q.answerIndex) {
          c.right(duck.i);
          s.banner = "GOT IT!"; s.bannerT = 1.3;
          return end(true, 1.6);
        }
        const left = c.wrong(duck.i, "WRONG DUCK! -1 LIFE");
        s.banner = "WRONG DUCK!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      if (s.shells <= 0) {
        const left = c.wrong(-1, "OUT OF SHELLS! -1 LIFE", "Out of shells! ");
        s.banner = "OUT OF SHELLS!"; s.bannerT = 1.4;
        end(left, 2.6);
      }
    }
    const nudge = (dx, dy) => { if (s.phase === "play") { s.cx = Math.max(4, Math.min(c.W - 4, s.cx + dx)); s.cy = Math.max(4, Math.min(groundY(), s.cy + dy)); } };
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      newRound();
      if (c.ui) onPad = (i) => { [() => nudge(0, -14), () => nudge(14, 0), () => nudge(0, 14), () => nudge(-14, 0)][i](); return true; };
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      s.flash = Math.max(0, s.flash - dt);
      for (const d of s.ducks) {
        if (!d.alive) { if (d.fall) { d.fall += dt; d.y += 120 * dt; } continue; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < 10 || d.x > c.W - 10) { d.vx *= -1; d.x = Math.max(10, Math.min(c.W - 10, d.x)); }
        if (d.y < 14 || d.y > groundY() - 20) { d.vy *= -1; d.y = Math.max(14, Math.min(groundY() - 20, d.y)); }
        if ((d.turn -= dt) <= 0) { // a sudden swerve now and then
          const sp = Math.hypot(d.vx, d.vy), a = Math.atan2(d.vy, d.vx) + (Math.random() - 0.5) * 2;
          d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp; d.turn = 1 + Math.random() * 2;
        }
      }
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      if (c.ui) {
        const v = 150 * dt;
        if (holding("left")) nudge(-v, 0);
        if (holding("right")) nudge(v, 0);
        if (holding("up")) nudge(0, -v);
        if (holding("down")) nudge(0, v);
      } else {
        // the demo hunter swings the sights onto its duck, then fires
        const d = s.ducks[s.aim];
        if (d?.alive) {
          const dx = d.x - s.cx, dy = d.y - s.cy, dist = Math.hypot(dx, dy), v = 170 * dt;
          if (dist > v) nudge((dx / dist) * v, (dy / dist) * v); else { s.cx = d.x; s.cy = d.y; }
          if (dist < 6 && (s.demoT -= dt) <= 0) { s.demoT = 0.5; shoot(); }
        }
      }
    }

    function duckArt(d) {
      const { rect, text } = c;
      const x = d.x, y = d.y, dir = d.vx < 0 ? -1 : 1, flap = Math.floor(s.t * 8 + d.i) % 2;
      const col = LANE_COLORS[d.i];
      c.ctx.save();
      c.ctx.translate(Math.round(x), Math.round(y));
      if (d.fall) c.ctx.rotate(Math.PI);
      c.ctx.scale(dir, 1);
      rect(-9, -4, 15, 9, col);                   // body
      rect(4, -9, 7, 7, col);                     // head
      rect(8, -7, 2, 2, "#fff"); rect(9, -7, 1, 1, INK);
      rect(11, -5, 4, 2, "#ff8a3d");              // beak
      rect(-6, flap ? -9 : 1, 9, 4, "#fbfaf6");    // wing
      c.ctx.restore();
      if (d.alive) text("ABCD"[d.i], x, y - 15, col, 8);
    }

    function draw() {
      const { rect, text } = c;
      rect(-8, -8, c.W + 16, c.H + 16, s.flash ? "#ffffff" : "#8fd0f0");
      rect(c.W * 0.1, c.H * 0.1, 22, 5, "#fff"); rect(c.W * 0.1 + 5, c.H * 0.1 - 4, 12, 4, "#fff");
      rect(c.W * 0.62, c.H * 0.2, 26, 5, "#fff"); rect(c.W * 0.62 + 6, c.H * 0.2 - 4, 14, 4, "#fff");
      for (const d of s.ducks) if (d.alive || (d.fall && d.y < groundY() + 10)) duckArt(d);
      // tall grass and a tree, in front of the ducks
      rect(c.W * 0.06, groundY() - 50, 10, 50, "#6e4a2b");
      rect(c.W * 0.06 - 14, groundY() - 74, 38, 30, "#2f7d4f");
      rect(-8, groundY(), c.W + 16, c.H, "#5a3a1a");
      for (let x = -8; x < c.W + 8; x += 6) rect(x, groundY() - 8 - ((x * 7) % 5), 4, 12, "#3ca55c");
      // the crosshair
      if (s.phase === "play") {
        const x = Math.round(s.cx), y = Math.round(s.cy);
        rect(x - 9, y - 1, 6, 2, "#e5484d"); rect(x + 3, y - 1, 6, 2, "#e5484d");
        rect(x - 1, y - 9, 2, 6, "#e5484d"); rect(x - 1, y + 3, 2, 6, "#e5484d");
        rect(x - 1, y - 1, 2, 2, "#fff");
        drawClock(c, s.clock);
        for (let k = 0; k < 5; k++) rect(8 + k * 7, c.H - 14, 5, 9, k < s.shells ? "#e5484d" : "#3a2a1a");
      }
      if (s.bannerT) text(s.banner, c.W / 2, c.H * 0.5, s.banner === "GOT IT!" ? "#1f9d55" : "#d93a3a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      onStick = () => {}; // held keys aim smoothly (see update)
      onKey = (key) => {
        if (key === "ArrowUp" || key === "ArrowDown") return true;
        if (key === " ") { shoot(); return true; }
        return false;
      };
      c.canvas.addEventListener("pointerdown", (e) => {
        const r = c.canvas.getBoundingClientRect();
        shoot(((e.clientX - r.left) / r.width) * c.W, ((e.clientY - r.top) / r.height) * c.H);
      });
    } else newRound();
    return c.stop;
  }

  // ---------- BLOCK BUMP ----------
  // Four ? blocks hang overhead, marked A-D. Run, jump and bump the one with the right answer.
  // A wrong block, the walking beetle, or running out of time costs a life. 3 lives.

  function startBump(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "bump", stat: "BUMPS", lives: 3, minW: 260, minH: 200, bestKey: "bump", bestWord: "right bumps",
      intro: `<h2>BLOCK BUMP</h2><p>Four <b>?</b> blocks hang overhead, marked <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b>. Run under the one with the right answer and jump to bump it.
        Jump on the beetle to bounce off it; touching it from the side costs a life, and so do a wrong block and running out of time. You have 3.
        Run with <b>A</b>/<b>D</b> (or the arrows), jump with <b>W</b> or <b>Space</b>. Buttons: D left, B right, A jump.</p>`,
    });
    const s = { phase: "intro", p: null, beetle: null, blocks: [], clock: 20, wait: 0, banner: "", bannerT: 0, t: 0, push: 0 };
    const floor = () => c.H - 26;
    const blockY = () => floor() - 62;
    const blockX = (i) => c.W / 2 + (i - 1.5) * Math.min(64, (c.W - 40) / 4);

    function newRound() {
      c.nextQuestion();
      s.p = { x: c.W / 2, y: floor(), vx: 0, vy: 0, ground: true, face: 1 };
      s.beetle = { x: Math.random() < 0.5 ? 20 : c.W - 20, vx: (Math.random() < 0.5 ? -1 : 1) * (26 + Math.min(30, c.score * 3)), flat: 0 };
      s.blocks = [0, 1, 2, 3].map((i) => ({ i, bump: 0, used: false }));
      Object.assign(s, { phase: "play", clock: c.q?.difficulty === "hard" ? 25 : 20, push: 0 });
      if (!c.ui) s.aim = Math.random() < 0.85 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function end(left, wait) {
      s.phase = left ? "result" : "dead";
      s.wait = left ? wait : 1.6;
    }
    function jump() {
      if (s.phase !== "play" || !s.p.ground) return;
      s.p.vy = -205;
      s.p.ground = false;
      c.sfx("flap");
    }
    function bumpBlock(b) {
      b.bump = 0.25;
      b.used = true;
      if (b.i === c.q.answerIndex) {
        c.right(b.i);
        s.banner = "BUMP!"; s.bannerT = 1.3;
        return end(true, 1.4);
      }
      const left = c.wrong(b.i, "WRONG BLOCK! -1 LIFE");
      s.banner = "WRONG BLOCK!"; s.bannerT = 1.4;
      end(left, 2.6);
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      newRound();
      // A (top) jumps, B (right) and D (left) give a short run that way
      if (c.ui) onPad = (i) => { if (i === 0) jump(); else if (i === 1) s.push = 0.22; else if (i === 3) s.push = -0.22; return true; };
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      for (const b of s.blocks) b.bump = Math.max(0, b.bump - dt);
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      const p = s.p;
      // running: held keys, a button's short push, or the demo's plan
      let run = 0;
      if (c.ui) {
        if (holding("left")) run -= 1;
        if (holding("right")) run += 1;
        if (s.push) { run = Math.sign(s.push); s.push = Math.sign(s.push) * Math.max(0, Math.abs(s.push) - dt); }
      } else {
        const tx = blockX(s.aim), dx = tx - p.x;
        if (Math.abs(dx) > 3) run = Math.sign(dx);
        else if (p.ground) jump();
        // hop over the beetle when it gets close
        if (p.ground && !s.beetle.flat && Math.abs(s.beetle.x - p.x) < 26 && Math.sign(s.beetle.x - p.x) === Math.sign(s.beetle.vx) * -1) jump();
      }
      if (run) p.face = run;
      p.vx = run * 95;
      p.x = Math.max(8, Math.min(c.W - 8, p.x + p.vx * dt));
      p.vy += 520 * dt;
      const prevTop = p.y - 18;
      p.y += p.vy * dt;
      // head hits a block from below
      if (p.vy < 0) for (const b of s.blocks) {
        const bx = blockX(b.i), by = blockY();
        if (!b.used && Math.abs(p.x - bx) < 11 && p.y - 18 <= by + 14 && prevTop > by + 14 - 1) {
          p.vy = 60;
          p.y = by + 14 + 18;
          return bumpBlock(b);
        }
      }
      if (p.y >= floor()) { p.y = floor(); p.vy = 0; p.ground = true; }
      // the beetle walks back and forth; land on it to flatten it for a moment
      const bt = s.beetle;
      if (bt.flat > 0) bt.flat -= dt;
      else {
        bt.x += bt.vx * dt;
        if (bt.x < 10 || bt.x > c.W - 10) bt.vx *= -1;
        if (Math.abs(bt.x - p.x) < 12 && p.y > floor() - 12) {
          if (p.vy > 0 && !p.ground) { bt.flat = 2.5; p.vy = -150; c.sfx("blip"); }
          else {
            const left = c.wrong(-1, "OUCH! -1 LIFE", "The beetle got you! ");
            s.banner = "OUCH!"; s.bannerT = 1.4;
            return end(left, 2.6);
          }
        }
      }
    }

    function draw() {
      const { rect, text } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#7ec8f0");
      rect(c.W * 0.15, c.H * 0.14, 24, 6, "#fff"); rect(c.W * 0.15 + 6, c.H * 0.14 - 5, 12, 5, "#fff");
      rect(c.W * 0.7, c.H * 0.1, 28, 6, "#fff"); rect(c.W * 0.7 + 7, c.H * 0.1 - 5, 14, 5, "#fff");
      // hills, then bricks underfoot
      rect(c.W * 0.05, floor() - 30, 70, 30, "#5fbf6a"); rect(c.W * 0.05 + 15, floor() - 42, 40, 12, "#5fbf6a");
      for (let x = -8; x < c.W + 8; x += 16) for (let y = floor(); y < c.H + 8; y += 8) {
        rect(x + ((y / 8) % 2) * 8, y, 15, 7, "#c8702a"); rect(x + ((y / 8) % 2) * 8, y, 15, 1, "#e0954a");
      }
      for (const b of s.blocks) {
        const bx = blockX(b.i), by = blockY() - (b.bump ? 4 : 0);
        rect(bx - 12, by - 12, 24, 24, INK);
        rect(bx - 11, by - 11, 22, 22, b.used ? "#9aa3b2" : LANE_COLORS[b.i]);
        rect(bx - 11, by - 11, 22, 3, "rgba(255,255,255,0.35)");
        text(b.used ? "" : "ABCD"[b.i], bx, by + 1, "#fff", 16);
        if (!b.used) text("?", bx + 8, by - 16, "#fff", 8);
      }
      // the beetle
      const bt = s.beetle;
      if (bt) {
        const by = floor();
        if (bt.flat > 0) rect(bt.x - 9, by - 4, 18, 4, "#5a3a1a");
        else { rect(bt.x - 9, by - 12, 18, 10, "#8a5a32"); rect(bt.x - 7, by - 2, 4, 2, INK); rect(bt.x + 3, by - 2, 4, 2, INK); rect(bt.x - 5, by - 9, 3, 3, "#fff"); rect(bt.x + 2, by - 9, 3, 3, "#fff"); }
      }
      // the player: cap, overalls
      const p = s.p;
      if (p && s.phase !== "over") {
        c.ctx.save();
        c.ctx.translate(Math.round(p.x), Math.round(p.y));
        c.ctx.scale(p.face, 1);
        rect(-5, -18, 10, 3, "#e5484d"); rect(1, -16, 6, 2, "#e5484d");    // cap
        rect(-4, -15, 9, 6, "#f1c27d"); rect(2, -13, 2, 2, INK);          // face
        rect(-5, -9, 10, 6, "#e5484d");                                   // shirt
        rect(-5, -6, 10, 4, "#3b6fe0");                                   // overalls
        const step = p.ground && p.vx && Math.floor(s.t * 10) % 2;
        rect(-5, -2, 4, 2, "#6e4a2b"); rect(1 + (step ? 1 : 0), -2, 4, 2, "#6e4a2b");
        c.ctx.restore();
      }
      if (s.phase === "play") drawClock(c, s.clock);
      if (s.bannerT) text(s.banner, c.W / 2, c.H * 0.2, s.banner === "BUMP!" ? "#1f9d55" : "#d93a3a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      onStick = () => {}; // held keys run (see update)
      onKey = (key) => {
        if (key === " " || key === "ArrowUp") { jump(); return true; }
        if (key === "ArrowDown") return true;
        return false;
      };
      // tap: left or right third runs that way; the middle jumps
      c.canvas.addEventListener("pointerdown", (e) => {
        const r = c.canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        if (x < 0.33) s.push = -0.3; else if (x > 0.67) s.push = 0.3; else jump();
      });
    } else newRound();
    return c.stop;
  }

  // ---------- CANNON CLASH ----------
  // Four targets stand on the far hills, marked A-D. Set your cannon's angle, time the power meter
  // and lob a shell onto the one with the right answer. 4 shells a round. 3 lives.

  function startCannon(u, demo = null) {
    const c = cabinet({
      u, demo, cls: "cannon", stat: "HITS", lives: 3, minW: 280, minH: 200, bestKey: "cannon", bestWord: "right hits",
      intro: `<h2>CANNON CLASH</h2><p>Four targets stand across the field, marked <b>A</b>, <b>B</b>, <b>C</b> and <b>D</b>. Lob a shell onto the one with the right answer.
        Aim with <b>W</b>/<b>S</b> (or the arrows); the power meter swings up and down, so fire with <b>Space</b> when it's where you want it. Watch the wind!
        You get 4 shells a round. Hitting a wrong target, running out of shells, or running out of time costs a life. You have 3.
        Buttons: A aim up, C aim down, B or D fire.</p>`,
    });
    const G = 160;
    const s = { phase: "intro", angle: 45, power: 0.5, pdir: 1, shell: null, shells: 4, targets: [], wind: 0, clock: 25, wait: 0, banner: "", bannerT: 0, t: 0, puffs: [], demoPlan: null };
    const base = () => ({ x: 26, y: c.H - 30 });
    const groundAt = (x) => c.H - 30 + Math.sin(x / 37) * 4 - (x > c.W * 0.4 ? Math.sin((x - c.W * 0.4) / 60) * 10 : 0);
    const maxSpeed = () => Math.sqrt(G * (c.W - 30)) * 1.08;

    function newRound() {
      c.nextQuestion();
      const span = c.W - 30 - c.W * 0.32;
      const xs = shuffle([0, 1, 2, 3]).map((k) => c.W * 0.32 + (span * (k + 0.5)) / 4);
      s.targets = [0, 1, 2, 3].map((i) => ({ i, x: xs[i], hit: false }));
      Object.assign(s, { phase: "play", shells: 4, shell: null, angle: 45, power: 0, pdir: 1, clock: c.q?.difficulty === "hard" ? 30 : 25, wind: Math.round((Math.random() - 0.5) * 30), demoPlan: null });
      if (!c.ui) s.aim = Math.random() < 0.85 ? c.q.answerIndex : (c.q.answerIndex + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    function end(left, wait) {
      s.phase = left ? "result" : "dead";
      s.wait = left ? wait : 1.6;
    }
    const tilt = (d) => { if (s.phase === "play") s.angle = Math.max(15, Math.min(80, s.angle + d)); };
    function fire(power = s.power) {
      if (s.phase !== "play" || s.shell || s.shells <= 0) return;
      s.shells--;
      const sp = maxSpeed() * (0.35 + 0.65 * power), a = (s.angle * Math.PI) / 180, b = base();
      s.shell = { x: b.x + Math.cos(a) * 14, y: b.y - 8 - Math.sin(a) * 14, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp };
      c.sfx("crash");
    }
    function begin() {
      c.hideCard();
      c.reset();
      c.sfx("go");
      newRound();
      if (c.ui) onPad = (i) => { [() => tilt(4), fire, () => tilt(-4), fire][i](); return true; };
    }
    // where a shot lands (for the demo gunner)
    function landing(angle, power) {
      const sp = maxSpeed() * (0.35 + 0.65 * power), a = (angle * Math.PI) / 180, b = base();
      let x = b.x, y = b.y - 8, vx = Math.cos(a) * sp, vy = -Math.sin(a) * sp;
      for (let k = 0; k < 600; k++) { vx += s.wind * 0.02; vy += G * 0.02; x += vx * 0.02; y += vy * 0.02; if (y >= groundAt(x) || x > c.W + 40) break; }
      return x;
    }

    function update(dt) {
      s.t += dt;
      s.bannerT = Math.max(0, s.bannerT - dt);
      s.puffs.forEach((p) => (p.t -= dt));
      s.puffs = s.puffs.filter((p) => p.t > 0);
      if (s.phase === "result" || s.phase === "dead") {
        s.wait -= dt;
        if (s.wait > 0) return;
        if (s.phase === "dead") { s.phase = "over"; c.renderQuestion(); return c.gameOver(begin); }
        return newRound();
      }
      if (s.phase !== "play") return;
      s.clock -= dt;
      if (s.clock <= 0) {
        const left = c.wrong(-1, "TOO SLOW! -1 LIFE", "Time's up! ");
        s.banner = "TOO SLOW!"; s.bannerT = 1.4;
        return end(left, 2.6);
      }
      if (c.ui) {
        if (holding("up")) tilt(40 * dt);
        if (holding("down")) tilt(-40 * dt);
      }
      // the power meter swings while no shell is in the air
      if (!s.shell) {
        s.power += s.pdir * dt * 0.8;
        if (s.power >= 1) { s.power = 1; s.pdir = -1; }
        if (s.power <= 0) { s.power = 0; s.pdir = 1; }
        if (!c.ui) {
          // the demo works out a shot, then waits for the meter to come round to it
          if (!s.demoPlan) {
            const t = s.targets[s.aim];
            let bestP = 0.5, bestD = Infinity;
            for (let p = 0; p <= 1; p += 0.02) { const d = Math.abs(landing(s.angle, p) - t.x); if (d < bestD) { bestD = d; bestP = p; } }
            s.demoPlan = { p: bestP + (Math.random() - 0.5) * 0.04 };
          }
          if (Math.abs(s.power - s.demoPlan.p) < 0.02) { fire(s.demoPlan.p); s.demoPlan = null; }
        }
      } else {
        const sh = s.shell;
        sh.vx += s.wind * dt; sh.vy += G * dt;
        sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        if (sh.x > c.W + 30 || sh.x < -30 || sh.y >= groundAt(sh.x)) {
          s.shell = null;
          s.puffs.push({ x: sh.x, y: groundAt(sh.x), t: 0.6 });
          const t = s.targets.find((t) => !t.hit && Math.abs(t.x - sh.x) < 13);
          if (t) {
            t.hit = true;
            if (t.i === c.q.answerIndex) {
              c.right(t.i);
              s.banner = "DIRECT HIT!"; s.bannerT = 1.3;
              return end(true, 1.6);
            }
            const left = c.wrong(t.i, "WRONG TARGET! -1 LIFE");
            s.banner = "WRONG TARGET!"; s.bannerT = 1.4;
            return end(left, 2.6);
          }
          c.sfx("step");
          if (s.shells <= 0) {
            const left = c.wrong(-1, "OUT OF SHELLS! -1 LIFE", "Out of shells! ");
            s.banner = "OUT OF SHELLS!"; s.bannerT = 1.4;
            end(left, 2.6);
          }
        }
      }
    }

    function draw() {
      const { rect, text, ctx } = c;
      rect(-8, -8, c.W + 16, c.H + 16, "#f5d9a8");
      rect(c.W - 46, 16, 14, 14, "#ffb347");
      // the ground
      for (let x = -4; x < c.W + 4; x += 4) { const g = groundAt(x); rect(x, g, 4, c.H - g + 8, "#7a9a4a"); rect(x, g, 4, 2, "#5f7d36"); }
      // targets: little forts with flags
      for (const t of s.targets) {
        const g = groundAt(t.x);
        if (t.hit) { rect(t.x - 9, g - 4, 18, 4, "#5b6577"); continue; }
        rect(t.x - 9, g - 14, 18, 14, "#8f98a8"); rect(t.x - 9, g - 17, 4, 3, "#8f98a8"); rect(t.x - 2, g - 17, 4, 3, "#8f98a8"); rect(t.x + 5, g - 17, 4, 3, "#8f98a8");
        rect(t.x - 1, g - 30, 2, 14, INK);
        rect(t.x + 1, g - 30, 10, 7, LANE_COLORS[t.i]);
        text("ABCD"[t.i], t.x, g - 7, "#fff", 8);
      }
      // the cannon
      const b = base(), a = (s.angle * Math.PI) / 180;
      ctx.save();
      ctx.translate(b.x, b.y - 8);
      ctx.rotate(-a);
      rect(0, -3, 16, 6, "#2b2f36");
      ctx.restore();
      rect(b.x - 8, b.y - 10, 16, 8, "#5a3a1a");
      rect(b.x - 7, b.y - 3, 5, 5, INK); rect(b.x + 2, b.y - 3, 5, 5, INK);
      // the aim line, while there's no shell in the air
      if (s.phase === "play" && !s.shell) for (let k = 1; k <= 5; k++) rect(b.x + Math.cos(a) * (14 + k * 7), b.y - 8 - Math.sin(a) * (14 + k * 7), 2, 2, "rgba(17,20,24,0.4)");
      if (s.shell) { rect(s.shell.x - 2, s.shell.y - 2, 4, 4, INK); }
      for (const p of s.puffs) { const r = (0.6 - p.t) * 22; for (let k = 0; k < 8; k++) { const an = (k / 8) * Math.PI; rect(p.x + Math.cos(an) * r - 2, p.y - Math.sin(an) * r - 2, 4, 4, "#c9cdd4"); } }
      if (s.phase === "play") {
        // power meter, angle, wind, shells
        rect(8, 8, 10, 52, INK);
        rect(10, 10 + 48 * (1 - s.power), 6, 48 * s.power, s.power > 0.75 ? "#e5484d" : s.power > 0.4 ? "#ffc94d" : "#3ce070");
        text(`${Math.round(s.angle)}°`, 40, 14, "#fff", 8);
        text(`WIND ${s.wind < 0 ? "<" : ""}${Math.abs(s.wind)}${s.wind > 0 ? ">" : ""}`, c.W / 2, 14, "#fff", 8);
        for (let k = 0; k < 4; k++) rect(26 + k * 7, 26, 5, 5, k < s.shells ? INK : "rgba(17,20,24,0.2)");
        drawClock(c, s.clock);
      }
      if (s.bannerT) text(s.banner, c.W / 2, c.H * 0.36, s.banner === "DIRECT HIT!" ? "#1f9d55" : "#d93a3a", 16);
    }

    c.run(update, draw);
    if (c.ui) {
      c.intro(begin);
      onStick = () => {};
      onKey = (key) => {
        if (key === "ArrowUp") { tilt(3); return true; }
        if (key === "ArrowDown") { tilt(-3); return true; }
        if (key === " ") { fire(); return true; }
        return false;
      };
      c.canvas.addEventListener("pointerdown", () => fire());
    } else newRound();
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
    // the joystick's ball: Space for whatever game is running
    fire() {
      onKey?.(" ");
    },
    // Keys while a game is open. Returns true if the key was used.
    key(e) {
      // W and S are always up and down. A and D are left and right wherever the screen uses the
      // joystick; on answer-only screens they still press the A and D buttons.
      let key = e.key;
      const lower = key.toLowerCase();
      if (lower === "w") key = "ArrowUp";
      else if (lower === "s") key = "ArrowDown";
      else if ((lower === "a" || lower === "d") && onStick) key = lower === "a" ? "ArrowLeft" : "ArrowRight";
      if (key === "Enter" && mode === "menu") { onPad?.(0); return true; }
      if (e.key === "Escape") {
        if (mode === "menu") return false;
        openMenu();
        return true;
      }
      if (onKey?.(key)) return true;
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const dir = key === "ArrowLeft" ? "left" : "right";
        wiggleStick(dir);
        onStick?.(dir);
        return true;
      }
      if (key === "ArrowUp" || key === "ArrowDown") return true; // W/S with nothing to do here
      if (key.length !== 1) return false;
      const i = "1234".includes(key) ? "1234".indexOf(key) : "abcd".indexOf(key.toLowerCase());
      if (i < 0) return false;
      pressPad(i);
      return true;
    },
  };
})();
