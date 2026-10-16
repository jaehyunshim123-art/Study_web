# Syllabus Quest

An Oregon Trail-style study game. Upload your class syllabus and an AI (Claude) turns the course into a journey: each unit is a leg of the trail, every stop along the way is a quiz written from your syllabus, and a river crossing (the unit test) stands before each landmark. The final exam is the end of the trail.

## Features

- **Syllabus first:** nothing starts until you upload a syllabus PDF or paste the text. The AI reads it and builds the trail, picking out each unit's key concepts.
- **The trail:** a pixel scene with your wagon rolling toward the next fort, plus an Oregon Trail status screen (date, weather, health, supplies, miles traveled, next landmark) and a trail log.
- **Quiz stops:** every stop is a 4-question quiz the AI writes from your syllabus (pass with 3/4), with an explanation after each answer.
- **River crossings:** before each landmark, choose how to cross: ford the river (6 questions, need 5), build a raft (8 questions, need 6, 1.5x XP) or pay 30 supplies for a ferry (4 questions, need 3). Fail and your wagon tips over.
- **Trail life:** random events after stops (berries, broken wheels, rain), health that drops when you fail and recovers when you pass, and the occasional case of dysentery.
- **Trail guide:** a chat tutor that explains the topic of the stop you're on and checks your understanding.
- **Avatar, general store, streaks & badges:** spend supplies on hats, capes and wings; keep a daily study streak; unlock 11 badges.

Your avatar, coins, XP and badges carry over when you start a new journey.

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
| `server.js` | Small Express server. `POST /api/quests` sends the syllabus (text or PDF) to Claude and returns the trail. `POST /api/quiz` writes a quiz for one stop or river crossing. `POST /api/coach` runs the trail guide chat. The API key stays on the server. |
| `shared/prompts.js` | Everything the AI is told: the prompts and JSON shapes for the trail, quizzes and guide. Used by the server and the preview. |
| `public/index.html` | The page and its four tabs. |
| `public/app.js` | Saving progress, XP, coins, levels, streaks, badges, the store, syllabus upload and the guide chat. |
| `public/trail.js` | The journey: trail picture, status screen, trail log, river crossings, events, health. |
| `public/quiz.js` | The quiz screen: loads questions, checks answers, shows explanations. |
| `public/main.js` | Starts the game once everything is loaded. |
| `public/avatar.js` | Draws the blocky avatar and lists the shop items. |
| `public/style.css` | The look. |
| `demo-quests.json` | Sample data used when there's no API key. |

Easy places to change things:
- What the AI is told: `shared/prompts.js`.
- Quiz sizes, river crossings and trail events: `STOP_QUIZ`, `CROSSINGS` and `EVENTS` at the top of `public/trail.js`.
- Badges: the `BADGES` list in `public/app.js`.
- Shop items: the `SHOP` list in `public/avatar.js` (each item is a few rectangles of SVG).
