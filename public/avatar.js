// Blocky avatar drawing + the shop's item list.
// avatarSVG(look) returns an SVG string. Each accessory is a small piece of SVG drawn on top.

const COLORS = {
  skin: ["#f5d0a9", "#e0ac69", "#c68642", "#8d5524", "#ffe066", "#a0e7a0"],
  shirt: ["#e63946", "#1d7bf2", "#2bb673", "#ffb703", "#8338ec", "#222831"],
  pants: ["#1d3557", "#3a3a3a", "#6d4c41", "#2a9d8f", "#f1faee", "#ff006e"],
};

const DEFAULT_LOOK = { skin: "#ffe066", shirt: "#1d7bf2", pants: "#1d3557", hat: null, face: null, back: null };

// slot: where it goes on the avatar (one item per slot). cost: price in coins.
const SHOP = [
  { id: "cap", name: "Baseball Cap", slot: "hat", cost: 40, svg: '<rect x="16" y="2" width="28" height="9" rx="3" fill="#e63946"/><rect x="38" y="8" width="14" height="4" rx="2" fill="#b0222d"/>' },
  { id: "headphones", name: "Headphones", slot: "hat", cost: 60, svg: '<path d="M15 16 Q30 -2 45 16" stroke="#222" stroke-width="4" fill="none"/><rect x="11" y="13" width="7" height="11" rx="2" fill="#ff006e"/><rect x="42" y="13" width="7" height="11" rx="2" fill="#ff006e"/>' },
  { id: "wizard", name: "Wizard Hat", slot: "hat", cost: 100, svg: '<polygon points="30,-14 14,10 46,10" fill="#5a189a"/><circle cx="30" cy="0" r="2.5" fill="#ffd60a"/><rect x="10" y="8" width="40" height="4" rx="2" fill="#3c096c"/>' },
  { id: "crown", name: "Golden Crown", slot: "hat", cost: 150, svg: '<polygon points="16,10 16,-2 23,5 30,-4 37,5 44,-2 44,10" fill="#ffd60a" stroke="#c9a400" stroke-width="1.5"/><circle cx="30" cy="5" r="2" fill="#e63946"/>' },
  { id: "shades", name: "Cool Shades", slot: "face", cost: 50, svg: '<rect x="18" y="15" width="10" height="6" rx="2" fill="#111"/><rect x="32" y="15" width="10" height="6" rx="2" fill="#111"/><rect x="27" y="16" width="6" height="2" fill="#111"/>' },
  { id: "nerd", name: "Study Glasses", slot: "face", cost: 30, svg: '<circle cx="23" cy="18" r="5" fill="none" stroke="#333" stroke-width="2"/><circle cx="37" cy="18" r="5" fill="none" stroke="#333" stroke-width="2"/><rect x="27" y="17" width="6" height="2" fill="#333"/>' },
  { id: "cape", name: "Hero Cape", slot: "back", cost: 120, svg: '<polygon points="14,32 46,32 54,78 6,78" fill="#d00000"/>' },
  { id: "wings", name: "Angel Wings", slot: "back", cost: 200, svg: '<ellipse cx="6" cy="44" rx="10" ry="18" fill="#fff" stroke="#cfd8e3" stroke-width="2"/><ellipse cx="54" cy="44" rx="10" ry="18" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>' },
];

function shopItem(id) {
  return SHOP.find((item) => item.id === id);
}

function avatarSVG(look) {
  const l = { ...DEFAULT_LOOK, ...look };
  const extra = (slot) => (l[slot] && shopItem(l[slot]) ? shopItem(l[slot]).svg : "");
  return `<svg viewBox="-6 -16 72 116" xmlns="http://www.w3.org/2000/svg">
    ${extra("back")}
    <rect x="17" y="4" width="26" height="26" rx="5" fill="${l.skin}"/>
    <rect x="23" y="13" width="4" height="5" rx="1" fill="#222"/>
    <rect x="33" y="13" width="4" height="5" rx="1" fill="#222"/>
    <path d="M24 23 Q30 28 36 23" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="14" y="32" width="32" height="30" rx="3" fill="${l.shirt}"/>
    <rect x="3" y="32" width="10" height="28" rx="3" fill="${l.skin}"/>
    <rect x="47" y="32" width="10" height="28" rx="3" fill="${l.skin}"/>
    <rect x="14" y="63" width="15" height="30" rx="3" fill="${l.pants}"/>
    <rect x="31" y="63" width="15" height="30" rx="3" fill="${l.pants}"/>
    ${extra("face")}
    ${extra("hat")}
  </svg>`;
}
