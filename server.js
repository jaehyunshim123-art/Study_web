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
          keyConcepts: {
            type: "array",
            description: "5-10 key terms, facts or skills from this unit, taken from the syllabus. Quizzes are written from these.",
            items: { type: "string" },
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
        required: ["name", "topic", "keyConcepts", "quests", "boss"],
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
Keep names playful but keep the actual tasks clear and useful.
For each world, list the unit's key concepts as they appear in the syllabus; quizzes will be written from them.`;

// The shape of a quiz the AI writes for one quest or boss.
const quizSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          choices: { type: "array", items: { type: "string" }, description: "Exactly 4 answer choices." },
          answerIndex: { type: "integer", description: "Index (0-3) of the correct choice." },
          explanation: { type: "string", description: "One or two sentences on why the answer is right." },
        },
        required: ["question", "choices", "answerIndex", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

const quizPrompt = `You write multiple-choice quiz questions for Syllabus Quest, a study game.
Questions must test real understanding of the course material at the level of the course, not trivia about the quest.
Each question has exactly 4 choices with one clearly correct answer, and plausible wrong answers.
Vary the questions: definitions, applying an idea to an example, and comparing concepts.`;

const QUEST_QUESTIONS = 4;
const BOSS_QUESTIONS = 6;

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

// Shuffle the choices so the right answer isn't always in the same spot, and drop malformed questions.
function cleanQuiz(questions) {
  return questions
    .filter((q) => Array.isArray(q.choices) && q.choices.length === 4 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4)
    .map((q) => {
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      return { ...q, choices: order.map((i) => q.choices[i]), answerIndex: order.indexOf(q.answerIndex) };
    });
}

app.post("/api/quiz", async (req, res) => {
  const { course = "", topic = "", concepts = [], quest = "", boss = false, syllabus = "", world = 0 } = req.body || {};
  const count = boss ? BOSS_QUESTIONS : QUEST_QUESTIONS;

  if (!client) {
    // Demo mode: hand-written questions from demo-quests.json.
    const demo = JSON.parse(readFileSync("demo-quests.json", "utf8"));
    const pool = demo.worlds[Number(world)]?.demoQuiz || demo.worlds[0].demoQuiz;
    return res.json({ questions: cleanQuiz([...pool].sort(() => Math.random() - 0.5).slice(0, count)) });
  }

  const conceptList = (Array.isArray(concepts) ? concepts : []).map(String).slice(0, 20).join("; ");
  const prompt = [
    `Course: ${String(course).slice(0, 200)}`,
    `Unit: ${String(topic).slice(0, 300)}`,
    conceptList && `Key concepts from the syllabus: ${conceptList}`,
    boss ? "This is the unit boss: cover the whole unit, a bit harder than regular quests." : `Quest: ${String(quest).slice(0, 500)}`,
    syllabus && `Syllabus text:\n${String(syllabus).slice(0, 20000)}`,
    `Write ${count} questions.`,
  ].filter(Boolean).join("\n\n");

  try {
    const response = await askClaude({
      system: quizPrompt,
      output_config: { effort: "low", format: { type: "json_schema", schema: quizSchema } },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The AI couldn't write a quiz for this one. Try again." });
    }
    const text = response.content.find((block) => block.type === "text")?.text;
    const questions = cleanQuiz(JSON.parse(text).questions || []).slice(0, count);
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
