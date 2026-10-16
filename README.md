# Syllabus Quest

Upload or paste a class syllabus, and an AI (Claude) turns it into a game. Each unit becomes a world you climb platform by platform, with study quests worth XP and coins, and the unit test is the boss at the top.

## Features

- **Obby-style quest map:** your avatar hops from platform to platform as you finish quests. Bosses stay locked until you clear the world.
- **Avatar + shop:** a blocky avatar you can recolor, plus hats, glasses, capes and wings you buy with coins earned from quests.
- **XP, levels, streaks & badges:** level-up screen, a daily study streak, and 10 badges to unlock.
- **PDF upload:** upload the syllabus PDF directly; Claude reads it.
- **AI study coach:** a chat tutor that explains the topic of any quest and checks your understanding.

Your avatar, coins, XP and badges carry over when you load a new syllabus.

It's a minimal working base for you to shape however you want.

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

## How it fits together

| File | What it does |
|---|---|
| `server.js` | Small Express server. `POST /api/quests` sends the syllabus (text or PDF) to Claude with a system prompt and a JSON schema and returns the quest map. `POST /api/coach` runs the study coach chat. The API key stays on the server. |
| `public/index.html` | The page and its four tabs. |
| `public/app.js` | Game logic: map, XP, coins, levels, streaks, badges, shop, coach chat, saving progress in the browser. |
| `public/avatar.js` | Draws the blocky avatar and lists the shop items. |
| `public/style.css` | The look. |
| `demo-quests.json` | Sample data used when there's no API key. |

Easy places to change things:
- How the AI builds quests: `systemPrompt` and `questSchema` in `server.js`.
- How the coach talks: `coachPrompt` in `server.js`.
- Badges: the `BADGES` list in `public/app.js`.
- Shop items: the `SHOP` list in `public/avatar.js` (each item is a few lines of SVG).
