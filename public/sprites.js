// Pixel art, drawn with SVG rectangles: the trail scenery for each theme, the wagon,
// BYTE (the AI helper), the shopkeeper, the store, and the shop's item icons.
// Every function returns an SVG string. Coordinates are in pixels of each picture's viewBox.

const px = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const INK = "#111418";

// ---------- trail scenery, one look per theme ----------

// A stepped triangle (pyramids, roofs, mountains).
function steps(cx, baseY, width, stepH, layers, fill) {
  let s = "";
  for (let i = 0; i < layers; i++) {
    const w = Math.max(2, Math.round(width - (width / layers) * i));
    s += px(Math.round(cx - w / 2), baseY - stepH * (i + 1), w, stepH, fill);
  }
  return s;
}

const flag = (x, top, color) => px(x, top, 1, 12, "#6e4a2b") + px(x + 1, top, 7, 5, color);

const BACKDROPS = {
  hills: (look) => [0, 1, 2, 3, 4, 5].map((i) => px(i * 60 - 10, 44 - (i % 3) * 4, 80, 30, look.far)).join(""),
  skyline: (look) => {
    let s = "";
    [[0, 26, 18], [30, 34, 22], [60, 22, 16], [84, 38, 20], [112, 28, 24], [146, 42, 18], [170, 24, 22], [200, 36, 16], [222, 30, 26], [256, 40, 20], [282, 26, 18], [304, 34, 20]]
      .forEach(([x, h, w]) => {
        s += px(x, 62 - h, w, h, look.far);
        for (let wy = 66 - h; wy < 58; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) s += px(wx, wy, 2, 2, "#eef1f6");
      });
    return s;
  },
  pyramids: (look) => steps(70, 62, 70, 4, 7, look.far) + steps(190, 62, 54, 4, 6, look.far) + steps(250, 62, 40, 4, 4, look.far),
  trees: (look) => {
    let s = BACKDROPS.hills(look);
    [52, 104, 156, 208, 248].forEach((x, i) => {
      const leaf = ["#e39b5a", "#d9634a", "#e8b04c"][i % 3];
      s += px(x + 6, 46, 3, 16, "#8a5a32") + px(x, 36, 15, 12, leaf) + px(x + 3, 32, 9, 4, leaf);
    });
    return s;
  },
  towers: (look) => {
    let s = BACKDROPS.skyline(look);
    [52, 160, 238].forEach((x) => { s += px(x, 18, 6, 44, "#b9c3d8") + px(x + 2, 12, 2, 6, "#8f98a8") + px(x + 2, 10, 2, 2, "#ff4d2e"); });
    return s;
  },
  domes: (look) => BACKDROPS.hills(look) + steps(110, 50, 30, 3, 5, "#bcd9d2") + px(95, 50, 30, 12, "#bcd9d2") + steps(220, 54, 20, 3, 4, "#bcd9d2") + px(210, 54, 20, 8, "#bcd9d2"),
};

const LANDMARKS = {
  fort: (x, f) => px(x - 7, 50, 15, 16, "#b07a4a") + px(x - 8, 48, 17, 3, "#6e4a2b") + px(x - 2, 58, 4, 8, "#4a3020") +
    px(x - 7, 46, 3, 3, "#b07a4a") + px(x + 5, 46, 3, 3, "#b07a4a") + flag(x, 34, f),
  courthouse: (x, f) => steps(x, 50, 27, 3, 3, "#e3ddcc") + px(x - 12, 50, 25, 14, "#f6f3ea") +
    [-10, -5, 0, 5, 9].map((dx) => px(x + dx, 51, 2, 13, "#d3ccb8")).join("") + px(x - 14, 64, 29, 2, "#cfc8b6") + flag(x, 29, f),
  lab: (x, f) => px(x - 10, 50, 21, 16, "#f6f8f9") + steps(x, 50, 14, 3, 3, "#bfe0ea") + px(x - 7, 54, 4, 4, "#9fd3e6") + px(x + 4, 54, 4, 4, "#9fd3e6") +
    px(x - 1, 58, 3, 8, "#7c8a94") + flag(x, 30, f),
  pyramid: (x, f) => steps(x, 66, 28, 4, 5, "#d9bc78") + px(x - 2, 60, 4, 6, "#9c7c3c") + flag(x, 34, f),
  library: (x, f) => px(x - 11, 50, 23, 16, "#ead9c0") + px(x - 12, 47, 25, 3, "#8a5a32") + px(x - 2, 58, 5, 8, "#5a3a1a") +
    px(x - 8, 52, 2, 5, "#d9634a") + px(x - 5, 52, 2, 5, "#3b6fe0") + px(x + 4, 52, 2, 5, "#1f9d55") + px(x + 7, 52, 2, 5, "#e0a100") + flag(x, 35, f),
  tower: (x, f) => px(x - 6, 30, 13, 36, "#5b6577") + [34, 40, 46, 52, 58].map((y) => px(x - 3, y, 2, 2, "#3ce070") + px(x + 2, y, 2, 2, "#3ce070")).join("") +
    px(x, 20, 1, 10, "#8f98a8") + px(x - 1, 18, 3, 2, f),
  hospital: (x, f) => px(x - 12, 47, 25, 19, "#cfd6dc") + px(x - 11, 48, 23, 18, "#ffffff") + px(x - 1, 51, 3, 9, "#e5484d") + px(x - 4, 54, 9, 3, "#e5484d") +
    px(x - 2, 61, 5, 5, "#8fa1ad") + flag(x, 35, f),
  bank: (x, f) => steps(x, 46, 23, 3, 2, "#c9b48a") + px(x - 10, 46, 21, 20, "#e4d6b8") + [-8, -3, 2, 7].map((dx) => px(x + dx, 49, 2, 15, "#c9b48a")).join("") +
    px(x - 2, 38, 5, 5, "#e0a100") + flag(x, 26, f),
};

const THEME_LOOK = {
  frontier:   { sky: "#e9f3fb", far: "#d3e7c6", ground: "#a9d39a", edge: "#93c585", path: "#e5d3ae", backdrop: "hills", landmark: "fort" },
  law:        { sky: "#eef1f6", far: "#d6dae3", ground: "#c9cdd4", edge: "#b4b8c2", path: "#ece6d6", backdrop: "skyline", landmark: "courthouse" },
  science:    { sky: "#e8f6f3", far: "#d1ebe3", ground: "#acd8c5", edge: "#93c9b2", path: "#e3e7ea", backdrop: "domes", landmark: "lab" },
  math:       { sky: "#f3eefb", far: "#e9dcb6", ground: "#ead9a6", edge: "#dcc78d", path: "#f5ebcc", backdrop: "pyramids", landmark: "pyramid" },
  literature: { sky: "#fbf3e8", far: "#ecdcc0", ground: "#c9dca8", edge: "#b3cc8c", path: "#e5d3ae", backdrop: "trees", landmark: "library" },
  tech:       { sky: "#e9efff", far: "#d3dbee", ground: "#c5ccd8", edge: "#aab3c4", path: "#9aa3b2", backdrop: "towers", landmark: "tower" },
  health:     { sky: "#eef8fb", far: "#d5ebdc", ground: "#bde1c3", edge: "#a2d2ab", path: "#e6ebee", backdrop: "hills", landmark: "hospital" },
  business:   { sky: "#edf3fb", far: "#d6dce8", ground: "#c9cdd4", edge: "#b4b8c2", path: "#ece6d6", backdrop: "skyline", landmark: "bank" },
};

const themeLook = (theme) => THEME_LOOK[theme] || THEME_LOOK.frontier;

// The covered wagon with its driver. cover = the canvas color.
function wagonSprite(cover = "#fbfaf6") {
  return px(-11, 49, 14, 2, cover) + px(-12, 51, 16, 8, cover) + px(-12, 51, 1, 8, INK) + px(3, 51, 1, 8, INK) + px(-11, 48, 14, 1, INK) +
    px(-13, 59, 18, 4, "#8a5a32") +
    px(-12, 62, 5, 5, INK) + px(-1, 62, 5, 5, INK) + px(-11, 63, 3, 3, "#c9a27a") + px(0, 63, 3, 3, "#c9a27a") +
    // driver on the bench
    px(4, 52, 4, 5, "#3b6fe0") + px(4, 48, 4, 4, "#f1c27d") + px(3, 47, 6, 2, "#7a4a1e") + px(5, 45, 3, 2, "#7a4a1e") +
    // ox
    px(8, 60, 3, 1, "#6e4a2b") + px(10, 56, 9, 6, "#7a4a1e") + px(18, 54, 4, 5, "#7a4a1e") + px(19, 53, 1, 1, "#f4f2ec") + px(21, 53, 1, 1, "#f4f2ec") +
    px(11, 62, 2, 5, "#5a3a1a") + px(16, 62, 2, 5, "#5a3a1a");
}

// The whole scene. opts = { theme, startSign, reached, x, cover, label }
function trailSceneSVG({ theme, startSign, reached, x, cover, label }) {
  const look = themeLook(theme);
  const landmark = LANDMARKS[look.landmark];
  let s = px(0, 0, 320, 90, look.sky);
  s += px(40, 14, 22, 5, "#fff") + px(46, 10, 12, 4, "#fff") + px(180, 20, 28, 5, "#fff") + px(188, 16, 14, 4, "#fff") + px(270, 10, 12, 12, "#ffc94d");
  s += BACKDROPS[look.backdrop](look);
  s += px(0, 62, 320, 28, look.ground) + px(0, 62, 320, 2, look.edge) + px(0, 66, 320, 5, look.path);
  if (look.path === "#9aa3b2") for (let dx = 4; dx < 320; dx += 16) s += px(dx, 68, 8, 1, "#e9efff"); // road markings
  for (let gx = 8; gx < 320; gx += 26) s += px(gx, 76 + ((gx * 7) % 8), 3, 2, look.edge);
  s += startSign ? px(22, 50, 2, 16, "#6e4a2b") + px(16, 48, 14, 6, "#e5d3ae") : landmark(24, "#3b6fe0");
  s += landmark(292, reached ? "#1f9d55" : "#ff4d2e");
  s += `<g id="wagon" class="wagon" style="transform:translateX(${x}px)">${wagonSprite(cover)}</g>`;
  return `<svg viewBox="0 0 320 90" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" role="img" aria-label="${label}">${s}</svg>`;
}

// ---------- BYTE, the AI helper (a little handheld game console) ----------

// mood: "idle" | "happy" | "sad" | "think" | "talk"
function botSVG(mood = "idle") {
  const face = "#0f380f";
  let mouth;
  if (mood === "happy") mouth = px(7, 10, 1, 1, face) + px(8, 11, 4, 1, face) + px(12, 10, 1, 1, face);
  else if (mood === "sad") mouth = px(7, 11, 1, 1, face) + px(8, 10, 4, 1, face) + px(12, 11, 1, 1, face);
  else if (mood === "talk") mouth = px(9, 10, 2, 2, face);
  else mouth = px(8, 11, 4, 1, face);
  const eyes = mood === "think" ? px(8, 7, 1, 2, face) + px(12, 7, 1, 2, face) : px(7, 8, 1, 2, face) + px(12, 8, 1, 2, face);
  return `<svg viewBox="0 0 20 24" shape-rendering="crispEdges" aria-hidden="true">
    ${px(9, 0, 2, 2, "#ff4d2e") + px(9, 2, 2, 2, INK)}
    ${px(3, 4, 14, 16, INK) + px(4, 5, 12, 14, "#d9dbd0")}
    ${px(5, 6, 10, 7, INK) + px(6, 7, 8, 5, "#9bbc0f")}
    ${eyes + mouth}
    ${px(6, 15, 3, 1, INK) + px(7, 14, 1, 3, INK)}
    ${px(11, 15, 2, 2, "#c0392b") + px(13, 14, 2, 2, "#6b5bd6")}
    ${px(1, 10, 2, 5, INK) + px(17, 10, 2, 5, INK)}
    ${px(5, 20, 3, 2, INK) + px(12, 20, 3, 2, INK)}
  </svg>`;
}

// ---------- the shop ----------

function shopkeeperSVG(mood = "idle") {
  const skin = "#f1c27d";
  const mouth = mood === "happy" ? px(9, 12, 2, 1, "#a0453a") : "";
  return `<svg viewBox="0 0 20 28" shape-rendering="crispEdges" aria-hidden="true">
    ${px(6, 0, 8, 5, "#7a4a1e") + px(6, 3, 8, 1, "#ff4d2e") + px(3, 4, 14, 2, "#5a3a1a")}
    ${px(6, 6, 8, 7, skin) + px(8, 8, 1, 1, INK) + px(11, 8, 1, 1, INK)}
    ${px(7, 10, 6, 1, "#5a3a1a") + px(7, 11, 1, 1, "#5a3a1a") + px(12, 11, 1, 1, "#5a3a1a") + mouth}
    ${px(4, 13, 12, 9, "#3b6fe0") + px(7, 14, 6, 9, "#fbfaf6") + px(9, 16, 2, 1, "#e5d3ae")}
    ${mood === "happy" ? px(1, 10, 2, 6, "#3b6fe0") + px(1, 8, 2, 2, skin) : px(2, 14, 2, 7, "#3b6fe0") + px(2, 21, 2, 2, skin)}
    ${px(16, 14, 2, 7, "#3b6fe0") + px(16, 21, 2, 2, skin)}
    ${px(6, 23, 3, 4, "#3a2a1a") + px(11, 23, 3, 4, "#3a2a1a")}
  </svg>`;
}

// The store's inside: plank wall, shelves of goods, a counter, and the shopkeeper.
function storeSVG(mood) {
  let s = px(0, 0, 320, 90, "#d8ab73");
  for (let y = 8; y < 70; y += 10) s += px(0, y, 320, 1, "#c4955e");
  [22, 46].forEach((y) => {
    s += px(0, y, 320, 3, "#8a5a32");
    for (let x = 8; x < 320; x += 18) {
      const k = (x + y) % 4;
      s += k === 0 ? px(x, y - 8, 7, 8, "#e5d3ae") + px(x + 2, y - 10, 3, 2, "#8a5a32")       // sack
        : k === 1 ? px(x + 1, y - 9, 5, 9, "#9fd3e6") + px(x + 1, y - 10, 5, 1, "#6e4a2b")    // jar
        : k === 2 ? px(x, y - 6, 8, 6, "#d9634a") + px(x, y - 6, 8, 1, "#a0453a")              // crate
        : px(x + 2, y - 8, 4, 8, "#3ce070") + px(x + 3, y - 9, 2, 1, "#6e4a2b");               // bottle
    }
  });
  s += px(0, 66, 320, 24, "#8a5a32") + px(0, 66, 320, 3, "#6e4a2b");
  s += px(196, 56, 22, 10, "#ffc94d") + px(198, 54, 18, 2, "#e0a100"); // coin pile
  s += `<svg x="148" y="34" width="24" height="34" viewBox="0 0 20 28" shape-rendering="crispEdges">${shopkeeperSVG(mood).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
  return `<svg viewBox="0 0 320 90" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}

const ICONS = {
  earnings: px(4, 5, 8, 9, "#e5d3ae") + px(5, 3, 6, 2, "#e5d3ae") + px(5, 5, 6, 1, "#8a5a32") + px(9, 9, 6, 6, "#ffc94d") + px(11, 10, 2, 4, "#b8860b"),
  streak: px(7, 1, 2, 2, "#ff4d2e") + px(5, 3, 6, 4, "#ff4d2e") + px(4, 7, 8, 6, "#ff4d2e") + px(6, 7, 4, 6, "#ffb000") + px(7, 10, 2, 3, "#ffd23f") + px(5, 13, 6, 2, "#ff4d2e"),
  oxen: px(3, 6, 10, 8, "#7a4a1e") + px(1, 4, 3, 2, "#f4f2ec") + px(12, 4, 3, 2, "#f4f2ec") + px(5, 8, 1, 2, INK) + px(10, 8, 1, 2, INK) + px(5, 12, 6, 2, "#c9a27a"),
};

const itemIcon = (id) => `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${ICONS[id] || ""}</svg>`;

// A small wagon for the paint shelf.
const paintIcon = (color) => `<svg viewBox="-14 44 36 24" shape-rendering="crispEdges" aria-hidden="true">${wagonSprite(color)}</svg>`;
