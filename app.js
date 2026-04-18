'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let currentPalette = []; // array of { h, s, l, locked }
let history = [];        // last 5 palettes (each is array of hex strings)

// ── DOM refs ───────────────────────────────────────────────────────────────
const paletteTypeEl  = document.getElementById('palette-type');
const btnGenerate    = document.getElementById('btn-generate');
const btnExport      = document.getElementById('btn-export');
const swatchesEl     = document.getElementById('swatches-container');
const historyListEl  = document.getElementById('history-list');
const toastEl        = document.getElementById('toast');

// ── Color math helpers ─────────────────────────────────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function hexToHsl(hex) {
  let { r, g, b } = hexToRgb(hex);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function makeColor(h, s, l) {
  return { h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(100, s)), l: Math.max(0, Math.min(100, l)), locked: false };
}

// ── Palette generators ─────────────────────────────────────────────────────
function generateRandom() {
  return Array.from({ length: 5 }, () => makeColor(randInt(0, 359), randInt(30, 90), randInt(20, 75)));
}

function generateMonochromatic() {
  const h = randInt(0, 359);
  const s = randInt(40, 80);
  const lValues = [20, 35, 50, 65, 80];
  return lValues.map(l => makeColor(h, s, l));
}

function generateComplementary() {
  const h1 = randInt(0, 359);
  const h2 = (h1 + 180) % 360;
  const s  = randInt(50, 80);
  return [
    makeColor(h1, s, 30),
    makeColor(h1, s, 55),
    makeColor(h1, s - 10, 75),
    makeColor(h2, s, 45),
    makeColor(h2, s, 65),
  ];
}

function generateAnalogous() {
  const base = randInt(0, 359);
  const s = randInt(50, 80);
  return [-40, -20, 0, 20, 40].map(offset => makeColor(base + offset, s, randInt(35, 65)));
}

function generateTriadic() {
  const base = randInt(0, 359);
  const h2   = (base + 120) % 360;
  const h3   = (base + 240) % 360;
  const s = randInt(55, 80);
  return [
    makeColor(base, s, 35),
    makeColor(base, s, 60),
    makeColor(h2, s, 45),
    makeColor(h3, s, 40),
    makeColor(h3, s, 65),
  ];
}

const GENERATORS = {
  random:          generateRandom,
  monochromatic:   generateMonochromatic,
  complementary:   generateComplementary,
  analogous:       generateAnalogous,
  triadic:         generateTriadic,
};

// ── Generate palette ───────────────────────────────────────────────────────
function generatePalette() {
  const type = paletteTypeEl.value;
  const newColors = GENERATORS[type]();

  if (currentPalette.length === 5) {
    for (let i = 0; i < 5; i++) {
      if (currentPalette[i].locked) {
        newColors[i] = { ...currentPalette[i] };
      }
    }
  }

  currentPalette = newColors;
  renderSwatches();
  addToHistory(currentPalette.map(c => hslToHex(c.h, c.s, c.l)));
}

// ── Render swatches ────────────────────────────────────────────────────────
function renderSwatches() {
  swatchesEl.innerHTML = '';
  currentPalette.forEach((color, i) => {
    const hex = hslToHex(color.h, color.s, color.l);
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = hexToHsl(hex);

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.innerHTML = `
      <div class="swatch-color" style="background:${hex}">
        <button class="swatch-lock ${color.locked ? 'locked' : ''}" data-index="${i}" title="${color.locked ? 'Unlock' : 'Lock'} swatch" aria-label="${color.locked ? 'Unlock' : 'Lock'} color">
          ${color.locked ? '🔒' : '🔓'}
        </button>
      </div>
      <div class="swatch-info">
        <div class="swatch-hex">${hex}</div>
        <div class="swatch-rgb">rgb(${r}, ${g}, ${b})</div>
        <div class="swatch-hsl">hsl(${h}, ${s}%, ${l}%)</div>
        <div class="copy-hint">Click to copy</div>
      </div>
    `;

    // Click swatch to copy hex
    swatch.addEventListener('click', e => {
      if (e.target.closest('.swatch-lock')) return; // handled below
      copyToClipboard(hex, `${hex} copied!`);
    });

    // Lock button
    swatch.querySelector('.swatch-lock').addEventListener('click', e => {
      e.stopPropagation();
      currentPalette[i].locked = !currentPalette[i].locked;
      renderSwatches();
    });

    swatchesEl.appendChild(swatch);
  });
}

// ── History ────────────────────────────────────────────────────────────────
function addToHistory(hexArray) {
  history.unshift([...hexArray]);
  if (history.length > 5) history.pop();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyListEl.innerHTML = '<p class="empty-history">No history yet — generate a palette!</p>';
    return;
  }
  historyListEl.innerHTML = '';
  history.forEach((palette, i) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const label = document.createElement('span');
    label.className = 'history-label';
    label.textContent = `#${i + 1}`;
    const miniSwatches = document.createElement('div');
    miniSwatches.className = 'mini-swatches';
    palette.forEach(hex => {
      const mini = document.createElement('div');
      mini.className = 'mini-swatch';
      mini.style.background = hex;
      mini.title = hex;
      miniSwatches.appendChild(mini);
    });
    row.appendChild(label);
    row.appendChild(miniSwatches);
    historyListEl.appendChild(row);
  });
}

// ── Clipboard ──────────────────────────────────────────────────────────────
function copyToClipboard(text, message) {
  navigator.clipboard.writeText(text).then(() => showToast(message)).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(message);
  });
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ── Export ─────────────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  if (currentPalette.length === 0) return;
  const hexList = currentPalette.map(c => hslToHex(c.h, c.s, c.l)).join(', ');
  copyToClipboard(hexList, 'Palette exported!');
});

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    generatePalette();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
btnGenerate.addEventListener('click', generatePalette);
generatePalette();
