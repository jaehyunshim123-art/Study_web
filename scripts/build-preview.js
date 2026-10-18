// Builds dist/preview.html: the whole game in one file that works without the server,
// for publishing as a claude.ai artifact.
//
// Inside claude.ai the preview asks Claude through the artifact "sample" capability (on the viewer's
// own Claude account), using the same prompts as server.js. PDFs are read in the page with pdf.js.
// Anywhere Claude isn't available (opened as a plain file, or the viewer says no) it falls back
// to the demo course from demo-quests.json.
//
// Run with: npm run preview

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";
import { THEMES, trailPrompt, trailSchema, quizPrompt, quizSchema, quizMoreSchema, quizRequest, quizCount, cleanQuiz, cleanLesson } from "../shared/prompts.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const demo = JSON.parse(read("demo-quests.json"));

// Stands in for server.js's two API routes.
const previewServer = `
const PROMPTS = ${JSON.stringify({ trailPrompt, trailSchema, quizPrompt, quizSchema, quizMoreSchema })};
const THEMES = ${JSON.stringify(THEMES)};
const DEMO_TRAIL = ${JSON.stringify({ ...demo, demo: true })};
${quizRequest}
${quizCount}
${cleanQuiz}
${cleanLesson}

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
// The loading screen shows how much Claude has written so far (game.js listens for this).
const progress = (chars) => window.dispatchEvent(new CustomEvent("ai-progress", { detail: { chars } }));
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

// Make sure the AI's route has every field the game needs.
function cleanTrail(t) {
  const units = (Array.isArray(t?.units) ? t.units : [])
    .filter((u) => u && (u.topic || u.name))
    .map((u) => ({
      name: String(u.name || u.topic),
      topic: String(u.topic || u.name),
      keyConcepts: Array.isArray(u.keyConcepts) ? u.keyConcepts.map(String) : [],
    }));
  if (!units.length) throw new Error("The AI's route came back empty. Try again.");
  return { courseTitle: String(t.courseTitle || "Your course"), theme: THEMES.includes(t.theme) ? t.theme : "frontier", units };
}

// signal: cancels the call (leaving the machine while it loads).
async function handle(path, req, signal) {
  const sample = await samplePromise;
  // The two calls the player waits on use the fast model and stream progress; the background
  // top-ups (more questions while you play) use the regular model.
  const waiting = { modelTier: "quick", signal, onText: ({ text }) => progress(text.length) };

  if (path.endsWith("/api/trail")) {
    if (!sample) return DEMO_TRAIL;
    let syllabus = String(req.syllabus || "").trim();
    if (req.pdf) {
      const fromPdf = await pdfToText(req.pdf).catch(() => "");
      if (!fromPdf) throw new Error("Couldn't read any text in that PDF (it may be a scanned image). Paste the syllabus text instead.");
      syllabus = fromPdf + (syllabus ? "\\n\\nExtra notes: " + syllabus : "");
    }
    try {
      const trail = await sample.json(PROMPTS.trailPrompt + "\\n\\n" + asJSON(PROMPTS.trailSchema) + "\\n\\nHere is my syllabus:\\n\\n" + syllabus.slice(0, 60000), waiting);
      return { ...cleanTrail(trail), syllabusText: syllabus.slice(0, 20000) };
    } catch (e) {
      if (NO_AI.includes(e?.code)) return DEMO_TRAIL;
      throw e;
    }
  }

  if (path.endsWith("/api/unit")) {
    const count = quizCount(req.count);
    if (!sample || req.demo) {
      const unit = DEMO_TRAIL.units[req.unit] || DEMO_TRAIL.units[0];
      return { lesson: unit.demoLesson, questions: cleanQuiz([...unit.demoQuiz].sort(() => Math.random() - 0.5).slice(0, count)) };
    }
    const data = await sample.json(PROMPTS.quizPrompt + "\\n\\n" + asJSON(req.more ? PROMPTS.quizMoreSchema : PROMPTS.quizSchema) + "\\n\\n" + quizRequest({ ...req, count }),
      req.more ? { cache: false } : { ...waiting, cache: false });
    const questions = cleanQuiz(data?.questions).slice(0, count);
    if (!questions.length) throw new Error("No questions came back. Try again.");
    return req.more ? { questions } : { lesson: cleanLesson(data?.lesson), questions };
  }
  throw new Error("Unknown route");
}

window.fetch = async (url, options = {}) => {
  const req = options.body ? JSON.parse(options.body) : {};
  let status = 200, body;
  try {
    body = await handle(String(url), req, options.signal);
  } catch (e) {
    status = 500;
    body = { error: errorText(e) };
  }
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
};`;

// Fail the build if the generated scripts don't parse.
for (const [name, code] of [["preview server", previewServer]]) {
  try { new vm.Script(code); } catch (err) { throw new Error(`${name} has a syntax error: ${err.message}`); }
}

const pdfjs = ["pdf.min.js", "pdf.worker.min.js"].map((f) => read(`node_modules/pdfjs-dist/build/${f}`));
const appScripts = ["sound", "sprites", "timer", "game", "arcade", "app"].map((f) => read(`public/${f}.js`)).join("\n");
try { new vm.Script(appScripts); } catch (err) { throw new Error(`game scripts have a syntax error: ${err.message}`); }
const inline = (code) => `<script>\n${code}\n</script>`;

let html = read("public/index.html");
html = html.replace('<link rel="stylesheet" href="style.css" />', () => `<style>\n${read("public/style.css")}\n</style>`);
html = html.replace(
  /<script src="sound.js"><\/script>[\s\S]*<script src="app.js"><\/script>/,
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
