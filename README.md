# Syllabus Quest

A starter project: paste a class syllabus, and an AI (Claude) turns it into a quest map. Each unit becomes a world with study quests worth XP, and the unit test is the boss you unlock by finishing the quests.

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
| `server.js` | Small Express server. `POST /api/quests` sends the syllabus to Claude with a system prompt and a JSON schema, and returns the quest map. The API key stays on the server. |
| `public/index.html` | The page. |
| `public/app.js` | Game logic: draws the map, tracks completed quests, XP and levels, saves progress in the browser. |
| `public/style.css` | The look. |
| `demo-quests.json` | Sample data used when there's no API key. |

The two easiest places to change how the AI behaves are `systemPrompt` and `questSchema` in `server.js`.
