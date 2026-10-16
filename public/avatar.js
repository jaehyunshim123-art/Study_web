// Blocky pixel avatar + the shop's item list.
// avatarSVG(look) returns an SVG string built only from rectangles, so it stays crisp and pixel-y.
// Each accessory is a few rectangles drawn on top of the body.

const COLORS = {
  skin: ["#f5d0a9", "#e0ac69", "#c68642", "#8d5524", "#ffd23f", "#8ee08e"],
  shirt: ["#ff3b3b", "#3f7fff", "#3ce070", "#ffb000", "#c04cf0", "#2b2b3a"],
  pants: ["#1d2b5a", "#3a3a3a", "#6d4c41", "#2a9d8f", "#e8e8e8", "#ff2e88"],
};

const DEFAULT_LOOK = { skin: "#ffd23f", shirt: "#3f7fff", pants: "#1d2b5a", hat: null, face: null, back: null };

const r = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

// slot: where it goes on the avatar (one item per slot). cost: price in coins.
const SHOP = [
  { id: "cap", name: "Cap", slot: "hat", cost: 40,
    svg: r(16, 0, 28, 10, "#ff3b3b") + r(36, 8, 16, 4, "#a01818") },
  { id: "headphones", name: "Headphones", slot: "hat", cost: 60,
    svg: r(14, 0, 32, 4, "#111") + r(12, 4, 4, 10, "#111") + r(44, 4, 4, 10, "#111") + r(10, 12, 8, 12, "#ff2e88") + r(42, 12, 8, 12, "#ff2e88") },
  { id: "wizard", name: "Wizard Hat", slot: "hat", cost: 100,
    svg: r(28, -16, 4, 4, "#5a189a") + r(24, -12, 12, 6, "#5a189a") + r(20, -6, 20, 6, "#5a189a") + r(28, -6, 4, 4, "#ffd23f") + r(10, 0, 40, 6, "#3c096c") },
  { id: "crown", name: "Crown", slot: "hat", cost: 150,
    svg: r(16, -4, 4, 6, "#ffd23f") + r(28, -6, 4, 8, "#ffd23f") + r(40, -4, 4, 6, "#ffd23f") + r(16, 2, 28, 6, "#ffd23f") + r(28, 3, 4, 4, "#ff3b3b") },
  { id: "shades", name: "Shades", slot: "face", cost: 50,
    svg: r(18, 14, 10, 6, "#111") + r(32, 14, 10, 6, "#111") + r(28, 15, 4, 2, "#111") },
  { id: "nerd", name: "Study Specs", slot: "face", cost: 30,
    svg: r(18, 13, 10, 2, "#222") + r(18, 19, 10, 2, "#222") + r(18, 13, 2, 8, "#222") + r(26, 13, 2, 8, "#222") +
         r(32, 13, 10, 2, "#222") + r(32, 19, 10, 2, "#222") + r(32, 13, 2, 8, "#222") + r(40, 13, 2, 8, "#222") + r(28, 15, 4, 2, "#222") },
  { id: "cape", name: "Hero Cape", slot: "back", cost: 120,
    svg: r(10, 32, 40, 46, "#d00000") },
  { id: "wings", name: "Wings", slot: "back", cost: 200,
    svg: r(-2, 34, 10, 6, "#fff") + r(-6, 40, 14, 10, "#fff") + r(-2, 50, 10, 6, "#fff") +
         r(52, 34, 10, 6, "#fff") + r(52, 40, 14, 10, "#fff") + r(52, 50, 10, 6, "#fff") },
];

function shopItem(id) {
  return SHOP.find((item) => item.id === id);
}

function avatarSVG(look) {
  const l = { ...DEFAULT_LOOK, ...look };
  const extra = (slot) => (l[slot] && shopItem(l[slot]) ? shopItem(l[slot]).svg : "");
  return `<svg viewBox="-8 -18 76 116" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
    ${extra("back")}
    ${r(16, 4, 28, 26, l.skin)}
    ${r(22, 12, 4, 6, "#111") + r(34, 12, 4, 6, "#111")}
    ${r(22, 22, 2, 2, "#111") + r(24, 24, 12, 2, "#111") + r(36, 22, 2, 2, "#111")}
    ${r(14, 32, 32, 30, l.shirt)}
    ${r(4, 32, 10, 28, l.skin) + r(46, 32, 10, 28, l.skin)}
    ${r(14, 62, 15, 30, l.pants) + r(31, 62, 15, 30, l.pants)}
    ${extra("face")}
    ${extra("hat")}
  </svg>`;
}
