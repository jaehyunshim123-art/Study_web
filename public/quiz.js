// The quiz screen. startQuiz() opens it, asks the server for questions written from your syllabus,
// and walks through them one by one. When the last question is answered it calls quizFinished()
// in trail.js, which decides what happens next (miles, supplies, health, river crossings).
// The same overlay is used for trail messages through openDialog().

let quiz = null; // { stop, mode, questions, index, score, results }

// Opens the overlay with a title. Used by quizzes and by trail messages.
function openDialog(title) {
  quiz = quiz || { dialogOnly: true };
  $("quiz").hidden = false;
  document.body.classList.add("no-scroll");
  $("quiz-title").textContent = title;
  $("quiz-progress").replaceChildren();
}

function showDialog(title, text, buttons) {
  quiz = null;
  openDialog(title);
  showQuizMessage("", text, buttons);
}

function closeQuiz() {
  quiz = null;
  $("quiz").hidden = true;
  document.body.classList.remove("no-scroll");
}

// stop = { id, w, title, detail, river }, mode = { count, pass } (see trail.js)
function startQuiz(stop, mode) {
  quiz = { stop, mode, questions: [], index: 0, score: 0, results: [] };
  openDialog(stop.river ? `CROSSING ${stop.title}` : `STOP: ${stop.title}`);
  showQuizMessage("PACKING THE QUESTIONS...", "The AI is writing questions from your syllabus.");
  loadQuiz(quiz);
}

async function loadQuiz(thisQuiz) {
  const { stop, mode } = thisQuiz;
  const world = save.map.worlds[stop.w];
  try {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course: save.map.courseTitle,
        topic: world.topic,
        concepts: world.keyConcepts || [],
        quest: `${stop.title}: ${stop.detail}`,
        boss: Boolean(stop.river),
        syllabus: save.syllabus,
        world: stop.w,
        count: mode.count,
        demo: Boolean(save.map.demo),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (quiz !== thisQuiz) return; // closed or restarted while loading
    if (!data.questions?.length) throw new Error("The quiz came back empty. Try again.");
    quiz.questions = data.questions;
    showQuestion();
  } catch (err) {
    if (quiz !== thisQuiz) return;
    showQuizMessage("TROUBLE ON THE TRAIL", err.message || "Couldn't load the quiz.", [
      ["TRY AGAIN", () => startQuiz(stop, mode)],
      ["BACK", closeQuiz, "ghost"],
    ]);
  }
}

// A heading, a line of text and some buttons: used for loading, errors, results and trail events.
// buttons = [[label, onClick, className?], ...]
function showQuizMessage(title, text, buttons = []) {
  const body = $("quiz-body");
  body.innerHTML = `<div class="quiz-message">${title ? `<h3>${escapeHTML(title)}</h3>` : ""}<p>${escapeHTML(text)}</p></div>`;
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

  $("quiz-body").querySelectorAll(".choice").forEach((b, i) => {
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
    if (!last) return showQuestion();
    renderProgress();
    const { stop, mode, score } = quiz;
    const total = quiz.questions.length;
    const needed = Math.ceil(total * mode.pass);
    quizFinished({ stop, mode, score, total, needed, passed: score >= needed });
  });
  $("quiz-body").append(explain, next);
  next.focus();
}
