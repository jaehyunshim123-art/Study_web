# Study Helper + Syllabus

A study arcade. Upload your course syllabus and step up to the machine: the page zooms into the cabinet, and the AI (Claude) reads your syllabus on its screen, maps a journey from your first unit to the final exam, and writes a lesson and questions for each unit.

## How it plays

- **Syllabus first:** upload a PDF (or paste the text). Nothing starts without one. A loading screen inside the machine shows each step.
- **Lesson, then questions:** every unit opens with a short lesson summary (overview, key points, key terms), then questions on it. You can reopen the lesson from any question.
- **A world that fits the subject:** the AI picks a theme from your syllabus (law, science, math, literature, tech, health, business, or the frontier), and the trail's scenery and landmarks match it: courthouses for law, labs for science, pyramids for math.
- **Answer to move:** right answers earn coins and move your wagon toward the unit's landmark; each unit is a 100-mile leg. Reach the last landmark to win.
- **BYTE, the AI helper:** a Game Boy-style bot under every question. Ask it for a hint (written by the AI from your syllabus; a hint halves the coins for that question), and it explains your mistakes.
- **Arcade sounds:** chiptune sound effects made in the browser. The speaker grille on the control panel (or the landing page button) turns them on and off.
- **Arcade controls:** the four buttons under the screen answer A-D (keys 1-4 work too) and press the screen's main button on other screens.
- **Help:** the ? button opens How to Play, which slides in as its own screen. It also opens automatically the first time you play.
- **The general store:** the trail window zooms in and grows into a store with a pixel shopkeeper who talks to you. Buy three upgrades (Earnings, Streak bonus, Stronger oxen) and paint jobs for your wagon.
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

`npm run preview` builds `dist/preview.html`: the whole game in a single file that runs without the server. Published as a claude.ai artifact with the `sample` capability, it uses Claude on the viewer's own account (same prompts as the server) and reads PDFs in the page with pdf.js. Opened anywhere else, it falls back to the demo trail.

## How it fits together

| File | What it does |
|---|---|
| `server.js` | Small Express server. `POST /api/trail` sends the syllabus (text or PDF) to Claude and returns the route (one landmark per unit). `POST /api/unit` writes a lesson summary and a batch of questions for one unit. The API key stays on the server. |
| `shared/prompts.js` | Everything the AI is told: the prompts and JSON shapes for the route, lessons and questions. Used by the server and the preview. |
| `public/index.html` | The arcade landing page and the game screen. |
| `public/app.js` | Landing page: syllabus upload, saving, the loading steps, and the zoom into the machine. |
| `public/sprites.js` | All the pixel art: themed scenery and landmarks, the wagon, BYTE, the shopkeeper, the store and item icons. |
| `public/sound.js` | Arcade sound effects, synthesized with the Web Audio API. |
| `public/game.js` | The game: lessons, questions, coins, streaks, the wagon scene, the sliding shop and the arcade buttons. |
| `public/style.css` | The look: white and minimal outside the machine, a cream pixel screen inside. |
| `demo-quests.json` | Sample data used when there's no API key. |

Easy places to change things:
- What the AI is told: `shared/prompts.js`.
- Upgrade prices and values, leg length and questions per unit: `UPGRADES`, `LEG_MILES` and `BATCH` at the top of `public/game.js`.
- Colors and fonts: the variables at the top of `public/style.css`.
