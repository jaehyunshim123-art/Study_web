// Builds dist/preview.html: the whole site in one file that works without the server.
// It runs in demo mode: quest building and the coach return sample answers instead of calling the AI.
// Run with: npm run preview

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const demo = JSON.parse(read("demo-quests.json"));

// Stands in for the server's two API routes.
const fakeServer = `
const DEMO_QUESTS = ${JSON.stringify({ ...demo, demo: true })};
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
function demoQuiz(request) {
  const pool = (DEMO_QUESTS.worlds[request.world] || DEMO_QUESTS.worlds[0]).demoQuiz;
  return shuffle(pool).slice(0, request.boss ? 6 : 4).map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return { ...q, choices: order.map((i) => q.choices[i]), answerIndex: order.indexOf(q.answerIndex) };
  });
}
window.fetch = async (url, options = {}) => {
  await new Promise((done) => setTimeout(done, 400));
  const request = options.body ? JSON.parse(options.body) : {};
  const body = url.endsWith("/api/coach")
    ? { reply: "This is the preview, so I can't really answer. In the full app with an API key, I'd explain this topic and quiz you on it." }
    : url.endsWith("/api/quiz")
      ? { questions: demoQuiz(request) }
      : DEMO_QUESTS;
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};`;

let html = read("public/index.html");
html = html.replace('<link rel="stylesheet" href="style.css" />', () => `<style>\n${read("public/style.css")}\n</style>`);
html = html.replace(
  /<script src="pixel.js"><\/script>\s*<script src="avatar.js"><\/script>\s*<script src="app.js"><\/script>\s*<script src="quiz.js"><\/script>/,
  () => `<script>${fakeServer}</script>\n<script>\n${["pixel", "avatar", "app", "quiz"].map((f) => read(`public/${f}.js`)).join("\n")}\n</script>`
);
if (html.includes('src="app.js"') || html.includes('href="style.css"')) throw new Error("index.html layout changed; update build-preview.js");

mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/preview.html", import.meta.url), html);
console.log("Wrote dist/preview.html");
