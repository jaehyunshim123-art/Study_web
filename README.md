# Syllabus Quest

A study arcade. Upload your course syllabus and step up to the machine: the AI (Claude) reads it, maps a journey from your first unit to the final exam, and writes the questions. The screen zooms into the cabinet and the game begins.

## How it plays

- **Syllabus first:** upload a PDF (or paste the text). Nothing starts without one.
- **Answer to move:** every right answer earns coins and moves your wagon toward the next landmark. Each unit is one 100-mile leg; reach the last landmark to win.
- **Streaks:** answers in a row earn bonus coins once you buy the streak upgrade. A wrong answer breaks the streak, costs a few coins, shows why, and the question comes back soon.
- **Shop:** three upgrades bought with coins: Earnings (coins per answer), Streak bonus, and Stronger oxen (miles per answer).
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
| `server.js` | Small Express server. `POST /api/trail` sends the syllabus (text or PDF) to Claude and returns the route (one landmark per unit). `POST /api/quiz` writes a batch of questions for one unit. The API key stays on the server. |
| `shared/prompts.js` | Everything the AI is told: the prompts and JSON shapes for the route and questions. Used by the server and the preview. |
| `public/index.html` | The arcade landing page and the game screen. |
| `public/app.js` | Landing page: syllabus upload, saving, and the zoom into the cabinet's screen. |
| `public/game.js` | The game: questions, coins, streaks, the wagon scene and the shop. |
| `public/style.css` | The look: white and minimal outside the machine, a cream pixel screen inside. |
| `demo-quests.json` | Sample data used when there's no API key. |

Easy places to change things:
- What the AI is told: `shared/prompts.js`.
- Upgrade prices and values, leg length and questions per unit: `UPGRADES`, `LEG_MILES` and `BATCH` at the top of `public/game.js`.
- Colors and fonts: the variables at the top of `public/style.css`.
