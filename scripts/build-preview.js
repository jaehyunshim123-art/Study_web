// Builds dist/preview.html: the whole game in one file that works without the server,
// for publishing as a claude.ai artifact.
//
// Inside claude.ai the preview asks Claude through the artifact "sample" capability (on the viewer's
// own Claude account), using the same prompts as server.js. PDFs are read in the page with pdf.js.
// Anywhere Claude isn't available (opened as a plain file, or the viewer says no) it falls back
// to the demo trail from demo-quests.json.
//
// Run with: npm run preview

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { trailPrompt, trailSchema, quizPrompt, quizSchema, quizRequest, quizCount, cleanQuiz, coachPrompt } from "../shared/prompts.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const demo = JSON.parse(read("demo-quests.json"));

// Stands in for server.js's three API routes.
const previewServer = `
const PROMPTS = ${JSON.stringify({ trailPrompt, trailSchema, quizPrompt, quizSchema, coachPrompt })};
const DEMO_TRAIL = ${JSON.stringify({ ...demo, demo: true })};
${quizRequest}
${quizCount}
${cleanQuiz}

const samplePromise = window.claude?.use ? window.claude.use("sample").catch(() => null) : Promise.resolve(null);
const NO_AI = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];
const ERRORS = {
  not_granted: "Claude isn't allowed on this page. Allow it from the artifact's Permissions menu, then try again.",
  rate_limited: "Too many requests right now. Wait a little and try again.",
  refused: "Claude declined that one. Try different text.",
  invalid_json: "The AI's answer came back garbled. Try again.",
  prompt_too_large: "That syllabus is too long. Try pasting just the schedule and unit list.",
  session_expired: "Sign in to Claude again, then try again.",
};
const errorText = (e) => ERRORS[e?.code] || e?.message || "Something went wrong. Try again.";
const asJSON = (schema) => "Reply with only a JSON value matching this JSON Schema:\\n" + JSON.stringify(schema);

async function pdfToText(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\\n\\n";
  }
  return text.trim();
}

// Make sure the AI's trail has every field the game needs.
function cleanTrail(t) {
  const worlds = (Array.isArray(t?.worlds) ? t.worlds : [])
    .filter((w) => w && Array.isArray(w.quests) && w.quests.length && w.boss)
    .map((w) => ({
      name: String(w.name || "The Next Fort"),
      topic: String(w.topic || ""),
      keyConcepts: Array.isArray(w.keyConcepts) ? w.keyConcepts.map(String) : [],
      quests: w.quests.map((q) => ({ title: String(q.title || "Stop"), task: String(q.task || ""), xp: Math.max(5, Math.round(Number(q.xp) || 20)) })),
      boss: { name: String(w.boss.name || "The River"), challenge: String(w.boss.challenge || ""), xp: Math.max(20, Math.round(Number(w.boss.xp) || 100)) },
    }));
  if (!worlds.length) throw new Error("The AI's trail came back incomplete. Try again.");
  return { courseTitle: String(t.courseTitle || "Your course"), worlds };
}

async function handle(path, req) {
  const sample = await samplePromise;

  if (path.endsWith("/api/quests")) {
    if (!sample) return DEMO_TRAIL;
    let syllabus = String(req.syllabus || "").trim();
    if (req.pdf) {
      const fromPdf = await pdfToText(req.pdf).catch(() => "");
      if (!fromPdf) throw new Error("Couldn't read any text in that PDF (it may be a scanned image). Paste the syllabus text instead.");
      syllabus = fromPdf + (syllabus ? "\\n\\nExtra notes: " + syllabus : "");
    }
    try {
      const trail = await sample.json(PROMPTS.trailPrompt + "\\n\\n" + asJSON(PROMPTS.trailSchema) + "\\n\\nHere is my syllabus:\\n\\n" + syllabus.slice(0, 60000));
      return { ...cleanTrail(trail), syllabusText: syllabus.slice(0, 20000) };
    } catch (e) {
      if (NO_AI.includes(e?.code)) return DEMO_TRAIL;
      throw e;
    }
  }

  if (path.endsWith("/api/quiz")) {
    const count = quizCount(req.count);
    if (!sample || req.demo) {
      const pool = (DEMO_TRAIL.worlds[req.world] || DEMO_TRAIL.worlds[0]).demoQuiz;
      return { questions: cleanQuiz([...pool].sort(() => Math.random() - 0.5).slice(0, count)) };
    }
    const data = await sample.json(PROMPTS.quizPrompt + "\\n\\n" + asJSON(PROMPTS.quizSchema) + "\\n\\n" + quizRequest({ ...req, count }), { cache: false });
    const questions = cleanQuiz(data?.questions).slice(0, count);
    if (!questions.length) throw new Error("The quiz came back empty. Try again.");
    return { questions };
  }

  if (path.endsWith("/api/coach")) {
    if (!sample) return { reply: "This copy of the game can't reach Claude, so the trail guide can't answer here. Open it in claude.ai to chat with the guide." };
    const turns = (req.messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && String(m.content || "").trim()).slice(-20);
    while (turns.length && turns[0].role !== "user") turns.shift();
    const rules = PROMPTS.coachPrompt + "\\n\\nCourse: " + String(req.course || "").slice(0, 200) + "\\nCurrent stop: " + String(req.quest || "").slice(0, 500);
    const { text } = await sample([{ role: "user", content: rules }, ...turns], { cache: false, modelTier: "quick" });
    return { reply: text };
  }
  throw new Error("Unknown route");
}

window.fetch = async (url, options = {}) => {
  const req = options.body ? JSON.parse(options.body) : {};
  let status = 200, body;
  try {
    body = await handle(String(url), req);
  } catch (e) {
    status = 500;
    body = { error: errorText(e) };
  }
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
};`;

const pdfjs = ["pdf.min.js", "pdf.worker.min.js"].map((f) => read(`node_modules/pdfjs-dist/build/${f}`));
const appScripts = ["pixel", "avatar", "app", "quiz", "trail", "main"].map((f) => read(`public/${f}.js`)).join("\n");
const inline = (code) => `<script>\n${code}\n</script>`;

let html = read("public/index.html");
html = html.replace('<link rel="stylesheet" href="style.css" />', () => `<style>\n${read("public/style.css")}\n</style>`);
html = html.replace(
  /<script src="pixel.js"><\/script>[\s\S]*<script src="main.js"><\/script>/,
  () => [
    // pdf.worker defines globalThis.pdfjsWorker, so pdf.js reads PDFs on the page without a separate worker.
    inline(pdfjs[0]), inline(pdfjs[1]),
    inline(previewServer),
    inline(appScripts),
  ].join("\n")
);
if (/<script src=|href="style.css"/.test(html)) throw new Error("index.html layout changed; update build-preview.js");

mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/preview.html", import.meta.url), html);
console.log(`Wrote dist/preview.html (${Math.round(html.length / 1024)} KB)`);
