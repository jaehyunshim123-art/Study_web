// Syllabus Quest — a tiny web server.
// It serves the website in /public and three API routes that talk to Claude:
//   POST /api/quests  syllabus (text or PDF) -> the trail: legs, stops and river crossings
//   POST /api/quiz    one stop or river crossing -> multiple-choice questions
//   POST /api/coach   a chat with the trail guide
// What the AI is told lives in shared/prompts.js.

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { trailPrompt, trailSchema, quizPrompt, quizSchema, quizRequest, quizCount, cleanQuiz, coachPrompt } from "./shared/prompts.js";

// Load .env by hand so there's one less dependency to learn about.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const PORT = process.env.PORT || 3000;
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const demoData = () => JSON.parse(readFileSync("demo-quests.json", "utf8"));

const app = express();
app.use(express.json({ limit: "15mb" })); // big enough for a base64 PDF
app.use(express.static("public"));

// Same settings for every AI call. If the main model declines, the API retries on a fallback model.
function askClaude(params) {
  return client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
  });
}

const textOf = (response) => response.content.filter((b) => b.type === "text").map((b) => b.text).join("");

app.post("/api/quests", async (req, res) => {
  const syllabus = String(req.body?.syllabus || "").trim();
  const pdf = typeof req.body?.pdf === "string" ? req.body.pdf : "";
  if (!syllabus && !pdf) return res.status(400).json({ error: "Upload or paste your syllabus first." });
  if (pdf.length * 0.75 > MAX_PDF_BYTES) return res.status(413).json({ error: "That PDF is over 10 MB." });

  if (!client) {
    // Demo mode: no API key yet, so send back the sample trail.
    return res.json({ ...demoData(), demo: true });
  }

  // Claude reads PDFs directly, so a PDF goes in as a document block.
  const content = pdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
        { type: "text", text: "Here is my syllabus as a PDF." + (syllabus ? `\n\nExtra notes: ${syllabus}` : "") },
      ]
    : `Here is my syllabus:\n\n${syllabus}`;

  try {
    const response = await askClaude({
      system: trailPrompt,
      output_config: { effort: "low", format: { type: "json_schema", schema: trailSchema } },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The AI couldn't turn that into a trail. Try a different syllabus." });
    }
    res.json(JSON.parse(textOf(response)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong talking to the AI. Check the server log." });
  }
});

app.post("/api/quiz", async (req, res) => {
  const body = req.body || {};
  const count = quizCount(body.count);

  if (!client) {
    // Demo mode: hand-written questions from demo-quests.json.
    const worlds = demoData().worlds;
    const pool = (worlds[Number(body.world)] || worlds[0]).demoQuiz;
    return res.json({ questions: cleanQuiz([...pool].sort(() => Math.random() - 0.5).slice(0, count)) });
  }

  try {
    const response = await askClaude({
      system: quizPrompt,
      output_config: { effort: "low", format: { type: "json_schema", schema: quizSchema } },
      messages: [{ role: "user", content: quizRequest({ ...body, count }) }],
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The AI couldn't write a quiz for this one. Try again." });
    }
    const questions = cleanQuiz(JSON.parse(textOf(response)).questions).slice(0, count);
    if (questions.length === 0) return res.status(502).json({ error: "The quiz came back empty. Try again." });
    res.json({ questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't make the quiz. Check the server log." });
  }
});

app.post("/api/coach", async (req, res) => {
  const { course = "", quest = "", messages = [] } = req.body || {};
  // Only keep well-formed turns, and only the last 20 so requests stay small.
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (history.at(-1)?.role !== "user") return res.status(400).json({ error: "Ask the guide something first." });
  while (history[0]?.role !== "user") history.shift();

  if (!client) {
    return res.json({ reply: "I'm the trail guide! I'm in demo mode right now, so I can't really answer yet. Add an API key to the .env file and ask me again." });
  }

  try {
    const response = await askClaude({
      system: `${coachPrompt}\n\nCourse: ${String(course).slice(0, 200)}\nCurrent stop: ${String(quest).slice(0, 500)}`,
      output_config: { effort: "low" },
      messages: history,
    });
    if (response.stop_reason === "refusal") {
      return res.json({ reply: "I can't help with that one. Try asking about the topic in a different way." });
    }
    res.json({ reply: textOf(response) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "The guide couldn't answer. Check the server log." });
  }
});

app.listen(PORT, () => {
  console.log(`Syllabus Quest running at http://localhost:${PORT}`);
  if (!hasKey) console.log("No ANTHROPIC_API_KEY found, running in demo mode.");
});
