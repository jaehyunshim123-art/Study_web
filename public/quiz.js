// Quiz battles: every quest and boss is cleared by passing a quiz the AI writes from your syllabus.
// startQuiz() opens the quiz screen, asks the server for questions, then walks through them one by one.

const PASS_RATE = { quest: 0.75, boss: 0.8 }; // share of questions you must get right

let quiz = null; // { quest, questions, index, score, results }

function startQuiz(quest) {
  quiz = { quest, questions: [], index: 0, score: 0, results: [] };
  $("quiz").hidden = false;
  document.body.classList.add("no-scroll");
  $("quiz-title").textContent = quest.boss ? `BOSS BATTLE: ${quest.title}` : `QUIZ: ${quest.title}`;
  $("quiz-progress").replaceChildren();
  showQuizMessage("GENERATING QUIZ...", "The AI is writing questions from your syllabus.");
  loadQuiz(quiz);
}

async function loadQuiz(thisQuiz) {
  const { quest } = thisQuiz;
  const w = Number(quest.id.match(/^w(\d+)/)[1]);
  const world = save.map.worlds[w];
  try {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course: save.map.courseTitle,
        topic: world.topic,
        concepts: world.keyConcepts || [],
        quest: `${quest.title}: ${quest.detail}`,
        boss: quest.boss,
        syllabus: save.syllabus,
        world: w,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (quiz !== thisQuiz) return; // closed or restarted while loading
    quiz.questions = data.questions;
    showQuestion();
  } catch (err) {
    if (quiz !== thisQuiz) return;
    showQuizMessage("ERROR", err.message || "Couldn't load the quiz.", [
      ["TRY AGAIN", () => startQuiz(quest)],
      ["BACK", closeQuiz, "ghost"],
    ]);
  }
}

function closeQuiz() {
  quiz = null;
  $("quiz").hidden = true;
  document.body.classList.remove("no-scroll");
}

// A title, a line of text and some buttons: used for loading, errors and the results screen.
function showQuizMessage(title, text, buttons = []) {
  const body = $("quiz-body");
  body.innerHTML = `<div class="quiz-message"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p></div>`;
  const row = document.createElement("div");
  row.className = "quiz-buttons";
  for (const [label, onClick, kind] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    if (kind) b.className = kind;
    b.addEventListener("click", onClick);
    row.append(b);
  }
  body.append(row);
  row.querySelector("button")?.focus();
}

function renderProgress() {
  const n = quiz.questions.length;
  const pips = quiz.questions
    .map((_, i) => `<span class="pip ${quiz.results[i] === true ? "right" : quiz.results[i] === false ? "wrong" : ""}"></span>`)
    .join("");
  $("quiz-progress").innerHTML = `<span>Q ${Math.min(quiz.index + 1, n)}/${n}</span><span class="pips">${pips}</span><span>SCORE ${quiz.score}</span>`;
}

function showQuestion() {
  renderProgress();
  const q = quiz.questions[quiz.index];
  const body = $("quiz-body");
  body.innerHTML = `<p class="quiz-question">${escapeHTML(q.question)}</p>`;

  const choices = document.createElement("div");
  choices.className = "choices";
  q.choices.forEach((choice, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<span class="letter">${"ABCD"[i]}</span> ${escapeHTML(choice)}`;
    b.addEventListener("click", () => answer(i));
    choices.append(b);
  });
  body.append(choices);
  choices.querySelector("button").focus();
}

function answer(picked) {
  const q = quiz.questions[quiz.index];
  const right = picked === q.answerIndex;
  if (right) quiz.score++;
  quiz.results[quiz.index] = right;
  renderProgress();

  const buttons = $("quiz-body").querySelectorAll(".choice");
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answerIndex) b.classList.add("right");
    else if (i === picked) b.classList.add("wrong");
  });

  const explain = document.createElement("div");
  explain.className = `explain ${right ? "right" : "wrong"}`;
  explain.innerHTML = `<strong>${right ? "CORRECT!" : "NOT QUITE."}</strong> ${escapeHTML(q.explanation)}`;

  const last = quiz.index === quiz.questions.length - 1;
  const next = document.createElement("button");
  next.textContent = last ? "SEE RESULTS" : "NEXT";
  next.addEventListener("click", () => {
    quiz.index++;
    last ? finishQuiz() : showQuestion();
  });
  $("quiz-body").append(explain, next);
  next.focus();
}

function finishQuiz() {
  const { quest, score } = quiz;
  const total = quiz.questions.length;
  const needed = Math.ceil(total * (quest.boss ? PASS_RATE.boss : PASS_RATE.quest));
  renderProgress();

  if (score >= needed) {
    if (score === total) save.profile.perfect = true;
    showQuizMessage(quest.boss ? "BOSS DEFEATED!" : "QUEST CLEARED!", `You got ${score}/${total}.`, [
      [`COLLECT +${quest.xp} XP`, () => {
        closeQuiz();
        complete(quest.id, quest.xp, quest.title);
      }],
    ]);
  } else {
    showQuizMessage("NOT YET", `You got ${score}/${total}. You need ${needed} to clear it.`, [
      ["RETRY", () => startQuiz(quest)],
      ["ASK COACH", () => {
        closeQuiz();
        openCoach(`${quest.title}: ${quest.detail}`);
      }, "ghost"],
      ["BACK", closeQuiz, "ghost"],
    ]);
  }
}

$("quiz-close").addEventListener("click", closeQuiz);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && quiz) closeQuiz();
});
