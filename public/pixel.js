// Tiny pixel-art icons. Each icon is an 8x8 grid: every character is one pixel,
// "." is empty, any other letter is a color from PALETTE. Edit the grids to redraw an icon.

const PALETTE = {
  "#": "#000000",
  o: "#ffb000", h: "#fff3b0", d: "#c77800", y: "#ffd23f",
  r: "#ff3b3b", b: "#3f7fff", w: "#f4f4f4", n: "#7a4a1e",
  g: "#9aa0b4", c: "#38e0e0", p: "#c04cf0", G: "#3ce070",
};

const ICONS = {
  coin: ["..####..", ".#hooo#.", "#hooooo#", "#oooooo#", "#oooooo#", "#oooood#", ".#oood#.", "..####.."],
  star: ["........", "...yy...", "...yy...", "yyyyyyyy", ".yyyyyy.", "..yyyy..", ".yy..yy.", "yy....yy"],
  book: ["########", "#bbbbbw#", "#bwwwbw#", "#bbbbbw#", "#bwwwbw#", "#bbbbbw#", "#bbbbbw#", "########"],
  sword: ["......ww", ".....www", "....www.", "y..www..", ".yyww...", "..yy....", ".n..y...", "n......."],
  crown: ["........", "y..yy..y", "yy.yy.yy", "yyyyyyyy", "yryyyyry", "yyyyyyyy", "dddddddd", "........"],
  flame: ["...r....", "..rr....", "..rrr.r.", ".rrorrr.", ".roooor.", "rooyyoor", "rooyyoor", ".roooor."],
  arrow: ["...GG...", "..GGGG..", ".GGGGGG.", "GGGGGGGG", "..GGGG..", "..GGGG..", "..GGGG..", "..GGGG.."],
  gem: ["..cccc..", ".cwcccc.", "cwcccccc", "cccccccc", ".cccccc.", "..cccc..", "...cc...", "........"],
  bag: ["..#..#..", ".#....#.", "########", "#pppppp#", "#pppppp#", "#ppwwpp#", "#pppppp#", "########"],
  question: ["..wwww..", ".ww..ww.", ".....ww.", "....ww..", "...ww...", "...ww...", "........", "...ww..."],
  lock: ["..gggg..", ".g....g.", ".g....g.", "gggggggg", "gggggggg", "ggg##ggg", "ggg##ggg", "gggggggg"],
};

// Returns an <svg> string. colors can override palette letters, e.g. { r: "#3f7fff" } for a blue flame.
function pixelIcon(name, size = 16, colors = {}) {
  const pal = { ...PALETTE, ...colors };
  let rects = "";
  ICONS[name].forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`;
    });
  });
  return `<svg class="px-icon" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
