// Syllabus Quest — a tiny web server.
// It serves the website in /public and has one API route, POST /api/quests,
// which sends the syllabus to Claude and gets back a quest map as JSON.

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";

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

// The shape of what the AI must return. Change this to change the game.
const questSchema = {
  type: "object",
  properties: {
    courseTitle: { type: "string" },
    worlds: {
      type: "array",
      description: "One world per unit or major topic, in syllabus order.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "A fun fantasy-style name for the unit." },
          topic: { type: "string", description: "The real topic from the syllabus." },
          quests: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                task: { type: "string", description: "A concrete study action, e.g. 'Read ch. 3 and write 5 flashcards'." },
                xp: { type: "integer", description: "10 for small tasks, up to 50 for big ones." },
              },
              required: ["title", "task", "xp"],
              additionalProperties: false,
            },
          },
          boss: {
            type: "object",
            description: "The unit's test, project or big assignment, framed as a boss battle.",
            properties: {
              name: { type: "string" },
              challenge: { type: "string" },
              xp: { type: "integer" },
            },
            required: ["name", "challenge", "xp"],
            additionalProperties: false,
          },
        },
        required: ["name", "topic", "quests", "boss"],
        additionalProperties: false,
      },
    },
  },
  required: ["courseTitle", "worlds"],
  additionalProperties: false,
};

// The instructions the AI follows. This is the "personality" of your game master.
const systemPrompt = `You are the game master for Syllabus Quest, a study game for high school and college students.
Turn the student's syllabus into a quest map: one world per unit, 3-5 quests per world, and one boss per world.
Quests must be real, specific study actions tied to the syllabus content, not vague advice.
Keep names playful but keep the actual tasks clear and useful.`;

// The study coach's personality. It explains and guides instead of doing the work.
const coachPrompt = `You are the friendly study coach inside Syllabus Quest.
Help the student understand the topic of the quest they're on: explain ideas simply, use short examples,
and check their understanding with a quick question. Guide them to answers instead of writing graded
work for them. Keep replies under 150 words.`;

const MAX_PDF_BYTES = 10 * 1024 * 1024;

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

app.post("/api/quests", async (req, res) => {
  const syllabus = String(req.body?.syllabus || "").trim();
  const pdf = typeof req.body?.pdf === "string" ? req.body.pdf : "";
  if (!syllabus && !pdf) return res.status(400).json({ error: "Paste a syllabus or upload a PDF first." });
  if (pdf.length * 0.75 > MAX_PDF_BYTES) return res.status(413).json({ error: "That PDF is over 10 MB." });

  if (!client) {
    // Demo mode: no API key yet, so send back sample quests.
    const demo = JSON.parse(readFileSync("demo-quests.json", "utf8"));
    return res.json({ ...demo, demo: true });
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
      system: systemPrompt,
      output_config: { effort: "low", format: { type: "json_schema", schema: questSchema } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The AI couldn't turn that into quests. Try a different syllabus." });
    }
    const text = response.content.find((block) => block.type === "text")?.text;
    res.json(JSON.parse(text));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong talking to the AI. Check the server log." });
  }
});

app.post("/api/coach", async (req, res) => {
  const { course = "", quest = "", messages = [] } = req.body || {};
  // Only keep well-formed turns, and only the last 20 so requests stay small.
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (history.at(-1)?.role !== "user") return res.status(400).json({ error: "Ask the coach something first." });
  while (history[0]?.role !== "user") history.shift();

  if (!client) {
    return res.json({ reply: "I'm the study coach! I'm in demo mode right now, so I can't really answer yet. Add an API key to the .env file and ask me again." });
  }

  try {
    const response = await askClaude({
      system: `${coachPrompt}\n\nCourse: ${String(course).slice(0, 200)}\nCurrent quest: ${String(quest).slice(0, 500)}`,
      output_config: { effort: "low" },
      messages: history,
    });
    if (response.stop_reason === "refusal") {
      return res.json({ reply: "I can't help with that one. Try asking about the quest topic in a different way." });
    }
    const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "The coach couldn't answer. Check the server log." });
  }
});

app.listen(PORT, () => {
  console.log(`Syllabus Quest running at http://localhost:${PORT}`);
  if (!hasKey) console.log("No ANTHROPIC_API_KEY found, running in demo mode.");
});
