// Everything the AI is told, in one place. server.js uses it for the real app,
// and scripts/build-preview.js copies it into the one-file preview.

// ---------- the route, built from a syllabus ----------

// Worlds the trail can travel through; each has its own scenery in public/sprites.js.
export const THEMES = ["frontier", "law", "science", "math", "literature", "tech", "health", "business"];

export const trailPrompt = `You design the route for Study Helper + Syllabus, a study game where a wagon travels from the first day of class to the final exam.
Turn the syllabus into the route: one stop per unit, in syllabus order.
First pick the theme whose world best fits the subject: law, science, math, literature, tech, health, business, or frontier (history and anything else).
Each stop is a landmark in that world, named playfully after the unit's topic: "Precedent Plaza" for law, "Fort Mitochondria" for biology, "Derivative Peak" for calculus.
For each unit, list 5-10 key concepts as the syllabus covers them. Quiz questions are written from them.
Use only what is in the syllabus.`;

export const trailSchema = {
  type: "object",
  properties: {
    courseTitle: { type: "string" },
    theme: { type: "string", enum: THEMES, description: "The world the journey travels through." },
    units: {
      type: "array",
      description: "One stop per unit, in syllabus order.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The landmark, named after the unit's topic." },
          topic: { type: "string", description: "The real unit title from the syllabus." },
          keyConcepts: { type: "array", items: { type: "string" }, description: "5-10 key terms, facts or skills from this unit." },
        },
        required: ["name", "topic", "keyConcepts"],
        additionalProperties: false,
      },
    },
  },
  required: ["courseTitle", "theme", "units"],
  additionalProperties: false,
};

// ---------- one unit: a lesson summary, then questions ----------

export const quizPrompt = `You write study material for Study Helper + Syllabus, a study game.
For the unit you are given, first write a short lesson summary a student reads before playing:
a 2-3 sentence overview, 4-6 key points, and 3-6 key terms with one-line definitions.
Then write multiple-choice questions that check the lesson. Questions must test real understanding of the course material at the level of the course.
Each question has exactly 4 short choices with one clearly correct answer and plausible wrong answers.
Mix definitions, applying an idea to an example, and comparing concepts. Keep each question under 30 words.
Rate each question's difficulty: "easy" for recalling a fact or definition, "hard" for applying, comparing or reasoning in more than one step. Aim for roughly 60% easy and 40% hard.`;

export const quizSchema = {
  type: "object",
  properties: {
    lesson: {
      type: "object",
      properties: {
        overview: { type: "string", description: "2-3 sentences on what this unit is about." },
        keyPoints: { type: "array", items: { type: "string" }, description: "4-6 key points, one sentence each." },
        keyTerms: {
          type: "array",
          description: "3-6 key terms.",
          items: {
            type: "object",
            properties: { term: { type: "string" }, definition: { type: "string" } },
            required: ["term", "definition"],
            additionalProperties: false,
          },
        },
      },
      required: ["overview", "keyPoints", "keyTerms"],
      additionalProperties: false,
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          choices: { type: "array", items: { type: "string" }, description: "Exactly 4 answer choices." },
          answerIndex: { type: "integer", description: "Index (0-3) of the correct choice." },
          explanation: { type: "string", description: "One sentence on why the answer is right." },
          hint: { type: "string", description: "One sentence that nudges toward the answer without giving it away." },
          difficulty: { type: "string", enum: ["easy", "hard"], description: "easy: recall a fact or definition. hard: apply, compare or reason in more than one step." },
        },
        required: ["question", "choices", "answerIndex", "explanation", "hint", "difficulty"],
        additionalProperties: false,
      },
    },
  },
  required: ["lesson", "questions"],
  additionalProperties: false,
};

// Follow-up batches are questions only (the lesson was written with the first batch).
export const quizMoreSchema = {
  type: "object",
  properties: { questions: quizSchema.properties.questions },
  required: ["questions"],
  additionalProperties: false,
};

// The request text for one batch. r = { course, topic, concepts, syllabus, count, more, avoid }
// more: a follow-up batch; avoid: questions already written, so new ones don't repeat them.
export function quizRequest(r) {
  const avoid = (Array.isArray(r.avoid) ? r.avoid : []).map((q) => `- ${String(q).slice(0, 160)}`).slice(0, 80).join("\n");
  const concepts = (Array.isArray(r.concepts) ? r.concepts : []).map(String).slice(0, 20).join("; ");
  return [
    `Course: ${String(r.course || "").slice(0, 200)}`,
    `Unit: ${String(r.topic || "").slice(0, 300)}`,
    concepts && `Key concepts from the syllabus: ${concepts}`,
    r.syllabus && `Syllabus text:\n${String(r.syllabus).slice(0, 20000)}`,
    r.more
      ? `Write ${r.count} NEW questions about this unit (no lesson). Cover different concepts and angles than these existing questions, and don't reword them:\n${avoid}`
      : `Write the lesson summary and ${r.count} questions about this unit.`,
  ].filter(Boolean).join("\n\n");
}

// How many questions one batch may have.
export function quizCount(n) {
  return Math.min(25, Math.max(3, Math.round(Number(n) || 15)));
}

// Make sure a lesson has every field the game shows.
export function cleanLesson(l) {
  const list = (x) => (Array.isArray(x) ? x : []);
  return {
    overview: String(l?.overview || ""),
    keyPoints: list(l?.keyPoints).map(String).slice(0, 8),
    keyTerms: list(l?.keyTerms).filter((t) => t && t.term).map((t) => ({ term: String(t.term), definition: String(t.definition || "") })).slice(0, 8),
  };
}

// Drop malformed questions and shuffle the choices so the right answer isn't always in the same spot.
export function cleanQuiz(questions) {
  return (Array.isArray(questions) ? questions : [])
    .filter((q) => q && typeof q.question === "string" && Array.isArray(q.choices) && q.choices.length === 4 &&
      Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4)
    .map((q) => {
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      return { question: q.question, choices: order.map((i) => String(q.choices[i])), answerIndex: order.indexOf(q.answerIndex), explanation: String(q.explanation || ""), hint: String(q.hint || ""), difficulty: q.difficulty === "hard" ? "hard" : "easy" };
    });
}
