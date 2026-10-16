// Builds dist/preview.html: the whole site in one file that works without the server.
// It runs in demo mode: quest building and the coach return sample answers instead of calling the AI.
// Run with: npm run preview

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const demo = JSON.parse(read("demo-quests.json"));

// Stands in for the server's two API routes.
const fakeServer = `
const DEMO_QUESTS = ${JSON.stringify({ ...demo, demo: true })};
window.fetch = async (url) => {
  await new Promise((done) => setTimeout(done, 400));
  const body = url.endsWith("/api/coach")
    ? { reply: "This is the preview, so I can't really answer. In the full app with an API key, I'd explain this topic and quiz you on it." }
    : DEMO_QUESTS;
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};`;

let html = read("public/index.html");
html = html.replace('<link rel="stylesheet" href="style.css" />', () => `<style>\n${read("public/style.css")}\n</style>`);
html = html.replace(
  /<script src="pixel.js"><\/script>\s*<script src="avatar.js"><\/script>\s*<script src="app.js"><\/script>/,
  () => `<script>${fakeServer}</script>\n<script>\n${read("public/pixel.js")}\n${read("public/avatar.js")}\n${read("public/app.js")}\n</script>`
);
if (html.includes('src="app.js"') || html.includes('href="style.css"')) throw new Error("index.html layout changed; update build-preview.js");

mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/preview.html", import.meta.url), html);
console.log("Wrote dist/preview.html");
