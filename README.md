# Study Helper + Syllabus

A study arcade. Upload your course syllabus and step up to the machine: the page zooms into the cabinet, and the AI (Claude) reads your syllabus on its screen, maps a journey from your first unit to the final exam, and writes a lesson and questions for each unit. Then pick one of three games, all built on those questions.

## How it plays

- **Fifteen games, one syllabus:** after loading, the machine shows an arcade-style SELECT GAME screen: one game at a time, with a live demo of it playing itself (a "trailer"), arrows (or the joystick / arrow keys) to flip to the next game, and PRESS A TO PLAY:
  - **Trail Quest:** the wagon journey below, a lesson then questions for each unit.
  - **Quiz Kart:** a pixel racer. A gate with four lanes (A-D) comes down the road while the question shows above it; steer into the lane with the right answer (A-D buttons, arrow keys, or tap an answer) before you reach the gate. A wrong lane costs one of 5 lives, and the gates come faster as you go.
  - **Syllabus Fighter:** a one-on-one fight against a boss that fits the subject (The Judge for law, Dr. Entropy for science...). Right answers land hits (hard questions hit harder, three in a row is a combo); a wrong answer or running out the clock lets the boss hit you. Knock out a boss to face the next one.
  - **Flappy Facts:** a flappy-bird game. A wall with four gaps (A-D, top to bottom) scrolls in while the question shows above; flap (tap, any arcade button, or Space) through the gap with the right answer. A wrong gap, the wall or the ground costs one of 3 lives.
  - **Quiz Blocks:** a Tetris-style falling-block puzzle (2nd on the menu). The arcade buttons are A left, B rotate, C right, D drop (or the arrow keys and Space; on a phone, tap the left, middle or right of the well, or swipe down). Every 6 pieces a QUIZ DROP pauses the game: a right answer blasts away your bottom 2 rows, a wrong one pushes up a junk row.
  - **Snake Smarts:** classic snake. Four snacks on the board are marked A-D; eat the one with the right answer. Arrow keys, swipes, or the buttons (A left, B up, C down, D right). 3 lives.
  - **Quiz Invaders:** space-invaders style. Four invaders marked A-D march down; shoot the one with the right answer before they land. 3 lives.
  - **Penalty Shootout:** a penalty kick. The goal's corners are A (top-left), B (top-right), C (bottom-left) and D (bottom-right); shoot at the corner with the right answer before the shot clock runs out. The keeper hops and shuffles across his line; a wrong corner is saved or hits the post, and once in 50 kicks he even saves a right one (2 coins, no life lost). 3 lives.
  - **Whack-a-Fact:** whack-a-mole. Moles pop out of holes A-D; whack the one in the right answer's hole while it's up. A wrong mole or running out of time costs a life. 3 lives.
  - **Crossy Quiz:** Frogger style. Hop across the traffic to the lily pad marked with the right answer. 3 lives.
  - **Maze Muncher:** maze-chase style. Munch the fruit marked with the right answer while dodging two ghosts. 3 lives.
  - **Asteroid Answers:** Asteroids style (A turn left, B thrust, C fire, D turn right; tap to aim on a phone). Shoot the asteroid with the right answer. 3 lives.
  - **Quiz Hunt:** duck-hunt style. Aim the crosshair (WASD, or click/tap) and shoot the duck with the right answer; 5 shells a round. 3 lives.
  - **Block Bump:** platformer style. Run (A/D), jump (W) and bump the ? block with the right answer; stomp the beetle, don't touch it. 3 lives.
  - **Cannon Clash:** artillery style. Aim (W/S), time the swinging power meter, mind the wind, and lob a shell onto the right target; 4 shells a round. 3 lives.
  - Pick which unit the quiz games quiz you on from the menu (up/down arrow keys work too). Coins from every game go into the same wallet, and each game keeps a best score.
- **Syllabus first:** upload a PDF (or paste the text). Nothing starts without one. A loading screen inside the machine shows each step.
- **Lesson, then questions:** every unit opens with a short lesson summary (overview, key points, key terms), then questions on it. Each unit builds up a bank of at least 50 questions: the first 15 arrive with the lesson, and more are written in the background while you play (repeats are dropped), so missed questions have plenty of fresh ones around them. You can reopen the lesson from any question.
- **A world that fits the subject:** the AI picks a theme from your syllabus (law, science, math, literature, tech, health, business, or the frontier), and the trail's scenery and landmarks match it: courthouses for law, labs for science, pyramids for math.
- **Answer to move:** right answers earn coins and move your wagon toward the unit's landmark; each unit is a 100-mile leg. Reach the last landmark to win.
- **BYTE, the AI helper:** a Game Boy-style bot under every question. Ask it for a hint (written by the AI from your syllabus; a hint halves the coins for that question), and it explains your mistakes.
- **Arcade sounds:** chiptune sound effects made in the browser, including a coin dropping into the machine on every right answer. The speaker grille on the control panel (or the landing page button) turns them on and off.
- **Arcade controls:** four face buttons in a diamond, like a game controller: A top, B right, C bottom, D left (keys 1-4 press them). They answer A-D, and in the steering games each one means its direction. **WASD** and the arrow keys work as the joystick everywhere in the arcade (hold them for smooth movement), and Space or the joystick's ball fires. On answer-only screens the A-D letter keys still answer.
- **Help:** the ? button opens How to Play, which slides in as its own screen. It also opens automatically the first time you play.
- **A store that matches your subject:** the trail window zooms in and grows into a store built for your course: a law bookshop with a bewigged judge, a lab supply with a scientist in a lab coat, a pharmacy, a parts shop, a counting house, a bookshop, a trading post, or the frontier general store. The shelves, the shopkeeper, the upgrade names (Billable hours, Research grant, Dividends...) and the greetings all fit the subject, and the shopkeeper mentions the unit and key concepts you're studying. Buy three upgrades (more coins per answer, a streak bonus, stronger oxen) and paint jobs for your wagon.
- **Small, fair penalties:** the AI rates each question EASY or HARD (shown on the question). A wrong answer costs 1 coin on an easy question and 2 on a hard one, and resets your streak.
- **Study timer:** a focus/break timer (25/5, 50/10 or 15/3 minutes) that works on its own, separate from the game. Open it from the clock on the control panel or the Study timer button on the landing page. It chimes when time is up, counts today's focus sessions, and keeps running if you exit or reload.
- **Saved:** progress stays in your browser, so you can exit to the arcade and continue later.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd syllabus-quest   # the folder you cloned
npm install
npm start
```

Open http://localhost:3000.

Without an API key it runs in **demo mode** and always returns the same sample quests, so you can work on the website before setting up the AI.

To turn the AI on, copy `.env.example` to `.env` and paste a key from https://console.anthropic.com. Never commit `.env`; it's already in `.gitignore`.

## One-file preview

`npm run preview` builds `dist/preview.html`: the whole game in a single file that runs without the server. Published as a claude.ai artifact with the `sample` capability, it uses Claude on the viewer's own account (same prompts as the server) and reads PDFs in the page with pdf.js. There is no demo course in the preview: opened anywhere else (or if the viewer doesn't allow Claude), the loading screen says Claude is needed.

## How it fits together

| File | What it does |
|---|---|
| `server.js` | Small Express server. `POST /api/trail` sends the syllabus (text or PDF) to Claude and returns the route (one landmark per unit). `POST /api/unit` writes a lesson summary and a batch of questions for one unit; with `more: true` it writes extra questions that avoid the ones the unit already has. The API key stays on the server. |
| `shared/prompts.js` | Everything the AI is told: the prompts and JSON shapes for the route, lessons and questions. Used by the server and the preview. |
| `public/index.html` | The arcade landing page and the game screen. |
| `public/app.js` | Landing page: syllabus upload, saving, the loading steps, and the zoom into the machine. |
| `public/sprites.js` | All the pixel art: themed scenery and landmarks, the wagon, BYTE, the shopkeeper, the store and item icons. |
| `public/sound.js` | Arcade sound effects, synthesized with the Web Audio API. |
| `public/timer.js` | The study timer: focus and break sessions, saved in the browser. |
| `public/arcade.js` | The SELECT GAME attract screen with each game's demo, Quiz Kart (a canvas racer), Syllabus Fighter and Flappy Facts, Quiz Blocks, Snake Smarts, Quiz Invaders, Penalty Shootout, Whack-a-Fact, Crossy Quiz, Maze Muncher, Asteroid Answers, Quiz Hunt, Block Bump and Cannon Clash (canvas; the last ten share a `cabinet()` helper for the panel, lives and game loop). |
| `public/game.js` | The game: lessons, questions, coins, streaks, the wagon scene, the sliding shop and the arcade buttons. |
| `public/style.css` | The look: white and minimal outside the machine, a cream pixel screen inside. |
| `demo-quests.json` | Sample data used when there's no API key. |

Easy places to change things:
- What the AI is told: `shared/prompts.js`.
- Upgrade prices and values, leg length and questions per unit: `UPGRADES`, `LEG_MILES`, `FIRST_BATCH`, `MORE_BATCH` and `TARGET_QUESTIONS` at the top of `public/game.js`.
- Colors and fonts: the variables at the top of `public/style.css`.
