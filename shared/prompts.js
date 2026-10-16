// Everything the AI is told, in one place. server.js uses it for the real app,
// and scripts/build-preview.js copies it into the one-file preview.

// ---------- the route, built from a syllabus ----------

export const trailPrompt = `You design the route for Syllabus Quest, a study game where a wagon travels from the first day of class to the final exam.
Turn the syllabus into the route: one stop per unit, in syllabus order.
Each stop is a landmark (a town, fort or pass) named playfully after the unit's topic, like "Fort Mitochondria".
For each unit, list 5-10 key concepts as the syllabus covers them. Quiz questions are written from them.
Use only what is in the syllabus.`;

export const trailSchema = {
  type: "object",
  properties: {
    courseTitle: { type: "string" },
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
  required: ["courseTitle", "units"],
  additionalProperties: false,
};

// ---------- questions ----------

export const quizPrompt = `You write multiple-choice questions for Syllabus Quest, a study game.
Questions must test real understanding of the course material at the level of the course.
Each question has exactly 4 short choices with one clearly correct answer and plausible wrong answers.
Mix definitions, applying an idea to an example, and comparing concepts. Keep each question under 30 words.`;

export const quizSchema = {
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
          explanation: { type: "string", description: "One sentence on why the answer is right." },
        },
        required: ["question", "choices", "answerIndex", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

// The request text for one batch of questions. r = { course, topic, concepts, syllabus, count }
export function quizRequest(r) {
  const concepts = (Array.isArray(r.concepts) ? r.concepts : []).map(String).slice(0, 20).join("; ");
  return [
    `Course: ${String(r.course || "").slice(0, 200)}`,
    `Unit: ${String(r.topic || "").slice(0, 300)}`,
    concepts && `Key concepts from the syllabus: ${concepts}`,
    r.syllabus && `Syllabus text:\n${String(r.syllabus).slice(0, 20000)}`,
    `Write ${r.count} questions about this unit.`,
  ].filter(Boolean).join("\n\n");
}

// How many questions one batch may have.
export function quizCount(n) {
  return Math.min(12, Math.max(3, Math.round(Number(n) || 10)));
}

// Drop malformed questions and shuffle the choices so the right answer isn't always in the same spot.
export function cleanQuiz(questions) {
  return (Array.isArray(questions) ? questions : [])
    .filter((q) => q && typeof q.question === "string" && Array.isArray(q.choices) && q.choices.length === 4 &&
      Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4)
    .map((q) => {
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      return { question: q.question, choices: order.map((i) => String(q.choices[i])), answerIndex: order.indexOf(q.answerIndex), explanation: String(q.explanation || "") };
    });
}
