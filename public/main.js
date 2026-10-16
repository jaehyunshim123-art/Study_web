// Starts the game. Loaded last, after every other script has defined its functions.

$("coin-icon").innerHTML = pixelIcon("coin", 14);
$("streak-icon").innerHTML = pixelIcon("flame", 14);
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
$("quiz-close").addEventListener("click", closeQuiz);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("quiz").hidden) closeQuiz();
});
render();
