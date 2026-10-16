// Everything the AI is told, in one place. server.js uses it for the real app,
// and scripts/build-preview.js copies it into the one-file preview.
// Change the game's "personality" here.

// ---------- building the trail from a syllabus ----------

export const trailPrompt = `You are the trail master for Syllabus Quest, an Oregon Trail-style study game for high school and college students.
Turn the student's syllabus into a journey: their wagon travels from the first day of class to the final exam.
- Each unit is one leg of the trail, in syllabus order. Name the leg after the landmark the wagon reaches at its end (like "Fort Mitochondria"): playful, but tied to the topic.
- Each leg has 3-5 stops. A stop is a real, specific study action tied to the syllabus content, not vague advice. Its xp is the miles it covers: 10 for small tasks, up to 50 for big ones.
- Before each landmark is a river the wagon must cross. Name it after a concept from the unit (like "Osmosis River"). Its challenge is the unit's test, project or big assignment. Its xp is 80-150.
- For each leg, list the unit's key concepts as they appear in the syllabus. Quizzes are written from them.
Use only what is in the syllabus.`;

export const trailSchema = {
  type: "object",
  properties: {
    courseTitle: { type: "string" },
    worlds: {
      type: "array",
      description: "One leg of the trail per unit, in syllabus order.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The landmark the wagon reaches at the end of this leg." },
          topic: { type: "string", description: "The real unit topic from the syllabus." },
          keyConcepts: {
            type: "array",
            description: "5-10 key terms, facts or skills from this unit, taken from the syllabus.",
            items: { type: "string" },
          },
          quests: {
            type: "array",
            description: "The stops along this leg.",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                task: { type: "string", description: "A concrete study action, e.g. 'Read ch. 3 and write 5 flashcards'." },
                xp: { type: "integer", description: "Miles covered: 10 for small tasks, up to 50 for big ones." },
              },
              required: ["title", "task", "xp"],
              additionalProperties: false,
            },
          },
          boss: {
            type: "object",
            description: "The river before the landmark. Its challenge is the unit's test, project or big assignment.",
            properties: {
              name: { type: "string", description: "The river's name, e.g. 'Osmosis River'." },
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

// ---------- quizzes ----------

export const quizPrompt = `You write multiple-choice quiz questions for Syllabus Quest, a study game.
Questions must test real understanding of the course material at the level of the course, not trivia about the game.
Each question has exactly 4 choices with one clearly correct answer, and plausible wrong answers.
Vary the questions: definitions, applying an idea to an example, and comparing concepts.`;

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

// The request text for one quiz. r = { course, topic, concepts, quest, boss, syllabus, count }
export function quizRequest(r) {
  const concepts = (Array.isArray(r.concepts) ? r.concepts : []).map(String).slice(0, 20).join("; ");
  return [
    `Course: ${String(r.course || "").slice(0, 200)}`,
    `Unit: ${String(r.topic || "").slice(0, 300)}`,
    concepts && `Key concepts from the syllabus: ${concepts}`,
    r.boss
      ? "This is the river crossing at the end of the unit: cover the whole unit, a bit harder than regular stops."
      : `Stop: ${String(r.quest || "").slice(0, 500)}`,
    r.syllabus && `Syllabus text:\n${String(r.syllabus).slice(0, 20000)}`,
    `Write ${r.count} questions.`,
  ].filter(Boolean).join("\n\n");
}

// How many questions a quiz may have.
export function quizCount(n) {
  return Math.min(10, Math.max(3, Math.round(Number(n) || 4)));
}

// Drop malformed questions and shuffle the choices so the right answer isn't always in the same spot.
export function cleanQuiz(questions) {
  return (Array.isArray(questions) ? questions : [])
    .filter((q) => q && typeof q.question === "string" && Array.isArray(q.choices) && q.choices.length === 4 &&
      Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4)
    .map((q) => {
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      return { ...q, choices: order.map((i) => String(q.choices[i])), answerIndex: order.indexOf(q.answerIndex), explanation: String(q.explanation || "") };
    });
}

// ---------- the trail guide (study coach) ----------

export const coachPrompt = `You are the trail guide in Syllabus Quest, an Oregon Trail-style study game. You're a friendly study coach.
Help the student understand the topic of the stop they're on: explain ideas simply, use short examples,
and check their understanding with a quick question. Guide them to answers instead of writing graded
work for them. Keep replies under 150 words.`;
