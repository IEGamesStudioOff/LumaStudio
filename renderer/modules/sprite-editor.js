/**
 * SPRITE EDITOR
 *
 *   Canvas principal (zoomé)  +  canvas overlay (grille / curseur)
 *   Buffer pixel : Uint16Array RGB565
 *   Outils       : crayon · gomme · pipette · remplissage
 *   Transformes  : flip H/V · redimensionner
 *   Historique   : undo/redo (snapshots)
 *   Palette ST7735 cliquable
 *
 *   Workflow :
 *     - open(frame, sourceImage)  -> charge le buffer depuis la frame
 *     - sauvegarde -> commitFrameEdits sur Asset Lab
 *     - retour    -> showScreen('assetLab')
 */

import { PALETTE_ST7735, indexOfRgb565 } from "./palette.js";
import {
  rgbToRgb565, rgb565ToRgb, rgb565ToHex,
  rgb565ToImageData, imageDataToRgb565,
  rgb565ToBase64, base64ToRgb565
} from "./rgb565.js";
import { HistoryStack } from "./history.js";
import { showScreen } from "./navigation.js";

const ERASER_VALUE = 0x0000; /* noir = pixel "vide" sur ST7735 */

const state = {
  frame:       null,
  width:       16,
  height:      16,
  buffer:      null, /* Uint16Array */
  zoom:        16,
  tool:        "pencil",
  colorIndex:  21, /* blanc par défaut dans la palette */
  showGrid:    true,
  drawing:     false,
  lastPixel:   null,
  history:     new HistoryStack(60),
  onCommit:    null
};

let mainCanvas, mainCtx;
let overlayCanvas, overlayCtx;
let miniCanvas, miniCtx;
let paletteEl, infoEl, currentColorEl;
let initialized = false;

export function initSpriteEditor({ onCommit }) {
  if (initialized) return;
  initialized = true;
  state.onCommit = onCommit;

  mainCanvas    = document.getElementById("spriteCanvas");
  mainCtx       = mainCanvas.getContext("2d");
  overlayCanvas = document.getElementById("spriteOverlay");
  overlayCtx    = overlayCanvas.getContext("2d");
  miniCanvas    = document.getElementById("spriteMini");
  miniCtx       = miniCanvas.getContext("2d");
  paletteEl     = document.getElementById("spritePalette");
  infoEl        = document.getElementById("spriteInfo");
  currentColorEl = document.getElementById("currentColor");

  buildPalette();
  bindTools();
  bindCanvas();
  bindHeader();
}

/* ---------------------- OUVERTURE ---------------------- */

export function openSpriteEditor(frame, sourceImage) {
  state.frame  = frame;
  state.width  = frame.w;
  state.height = frame.h;

  /* Charge le buffer depuis pixelsB64 (édité) ou depuis l'image source */
  if (frame.edited && frame.pixelsB64) {
    state.buffer = new Uint16Array(base64ToRgb565(frame.pixelsB64));
  } else {
    /* Découpe la frame depuis sourceImage puis convertit en RGB565 */
    const tmp = document.createElement("canvas");
    tmp.width  = frame.w;
    tmp.height = frame.h;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    if (sourceImage) {
      tctx.drawImage(sourceImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    }
    const img = tctx.getImageData(0, 0, frame.w, frame.h);
    state.buffer = imageDataToRgb565(img);
  }

  state.history.clear();
  state.history.push(new Uint16Array(state.buffer));

  computeZoom();
  resizeCanvases();
  render();
  showScreen("spriteEditor");
}

function computeZoom() {
  const maxDim = 640;
  state.zoom = Math.max(1, Math.floor(Math.min(maxDim / state.width, maxDim / state.height)));
  if (state.zoom > 32) state.zoom = 32;
  if (state.zoom < 4) state.zoom = 4;
}

function resizeCanvases() {
  mainCanvas.width  = state.width  * state.zoom;
  mainCanvas.height = state.height * state.zoom;
  overlayCanvas.width  = mainCanvas.width;
  overlayCanvas.height = mainCanvas.height;
  miniCanvas.width  = state.width;
  miniCanvas.height = state.height;
}

/* ---------------------- RENDU ---------------------- */

function render() {
  renderMain();
  renderOverlay();
  renderMini();
  updateInfo();
}

function renderMain() {
  /* On dessine via une ImageData de la taille native puis on scale */
  const img = rgb565ToImageData(state.buffer, state.width, state.height);
  const tmp = document.createElement("canvas");
  tmp.width = state.width;
  tmp.height = state.height;
  tmp.getContext("2d").putImageData(img, 0, 0);
  mainCtx.imageSmoothingEnabled = false;
  mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  mainCtx.drawImage(tmp, 0, 0, mainCanvas.width, mainCanvas.height);
}

function renderOverlay() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!state.showGrid || state.zoom < 6) return;
  overlayCtx.strokeStyle = "rgba(95,124,255,0.35)";
  overlayCtx.lineWidth = 1;
  const z = state.zoom;
  for (let x = 0; x <= state.width; x++) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(x * z + 0.5, 0);
    overlayCtx.lineTo(x * z + 0.5, state.height * z);
    overlayCtx.stroke();
  }
  for (let y = 0; y <= state.height; y++) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(0, y * z + 0.5);
    overlayCtx.lineTo(state.width * z, y * z + 0.5);
    overlayCtx.stroke();
  }
}

function renderMini() {
  const img = rgb565ToImageData(state.buffer, state.width, state.height);
  miniCtx.putImageData(img, 0, 0);
}

function updateInfo() {
  if (!state.frame) return;
  infoEl.textContent =
    `${state.frame.name} · ${state.width}×${state.height} px · zoom ${state.zoom}× · outil : ${state.tool}`;
  const c = PALETTE_ST7735[state.colorIndex];
  currentColorEl.style.background = c.hex;
  currentColorEl.title = `${c.hex} · RGB565 0x${c.rgb565.toString(16).padStart(4, "0").toUpperCase()}`;
}

/* ---------------------- PALETTE ---------------------- */

function buildPalette() {
  paletteEl.innerHTML = "";
  PALETTE_ST7735.forEach((c, i) => {
    const s = document.createElement("button");
    s.className = "palette-cell";
    s.style.background = c.hex;
    s.title = `${c.hex} · RGB565 0x${c.rgb565.toString(16).padStart(4, "0").toUpperCase()}`;
    if (i === state.colorIndex) s.classList.add("selected");
    s.addEventListener("click", () => {
      state.colorIndex = i;
      paletteEl.querySelectorAll(".palette-cell").forEach((el, idx) => {
        el.classList.toggle("selected", idx === i);
      });
      updateInfo();
    });
    paletteEl.appendChild(s);
  });
}

/* ---------------------- OUTILS ---------------------- */

function bindTools() {
  for (const btn of document.querySelectorAll(".tool-btn")) {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      if (tool === "flipH") { transformFlipH(); return; }
      if (tool === "flipV") { transformFlipV(); return; }
      if (tool === "resize") { transformResize(); return; }
      if (tool === "clear") { transformClear(); return; }
      state.tool = tool;
      for (const b of document.querySelectorAll(".tool-btn")) {
        b.classList.toggle("active", b === btn);
      }
      updateInfo();
    });
  }
  document.getElementById("toggleGrid").addEventListener("click", () => {
    state.showGrid = !state.showGrid;
    renderOverlay();
  });
  document.getElementById("zoomIn").addEventListener("click", () => {
    state.zoom = Math.min(48, state.zoom + 2);
    resizeCanvases(); render();
  });
  document.getElementById("zoomOut").addEventListener("click", () => {
    state.zoom = Math.max(2, state.zoom - 2);
    resizeCanvases(); render();
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);

  /* Raccourcis clavier */
  window.addEventListener("keydown", (e) => {
    if (document.getElementById("spriteEditor")?.classList.contains("active") === false) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (e.key === "p" || e.key === "b") setTool("pencil");
    else if (e.key === "e") setTool("eraser");
    else if (e.key === "i") setTool("eyedropper");
    else if (e.key === "g") setTool("fill");
  });
}

function setTool(name) {
  state.tool = name;
  for (const b of document.querySelectorAll(".tool-btn")) {
    b.classList.toggle("active", b.dataset.tool === name);
  }
  updateInfo();
}

function bindHeader() {
  document.getElementById("closeSprite").addEventListener("click", () => {
    showScreen("assetLab");
  });
  document.getElementById("saveSprite").addEventListener("click", commit);
  document.getElementById("savePngSprite").addEventListener("click", savePng);
}

/* ---------------------- INTERACTION CANVAS ---------------------- */

function bindCanvas() {
  const handler = overlayCanvas;
  handler.addEventListener("mousedown", onMouseDown);
  handler.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  handler.addEventListener("mouseleave", () => { state.lastPixel = null; });
}

function eventToPixel(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / state.zoom);
  const y = Math.floor((e.clientY - rect.top)  / state.zoom);
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return { x, y };
}

function onMouseDown(e) {
  const p = eventToPixel(e);
  if (!p) return;
  state.drawing = true;
  applyToolAt(p);
  state.lastPixel = p;
}

function onMouseMove(e) {
  const p = eventToPixel(e);
  if (!p) return;
  if (!state.drawing) return;
  /* tracé continu : ligne de Bresenham entre lastPixel et p */
  if (state.lastPixel) {
    drawLine(state.lastPixel.x, state.lastPixel.y, p.x, p.y);
  } else {
    applyToolAt(p);
  }
  state.lastPixel = p;
}

function onMouseUp() {
  if (state.drawing) {
    /* Snapshot d'historique à la fin du trait */
    state.history.push(new Uint16Array(state.buffer));
  }
  state.drawing = false;
  state.lastPixel = null;
}

function applyToolAt({ x, y }) {
  if (state.tool === "pencil") {
    setPixel(x, y, PALETTE_ST7735[state.colorIndex].rgb565);
  } else if (state.tool === "eraser") {
    setPixel(x, y, ERASER_VALUE);
  } else if (state.tool === "eyedropper") {
    const v = state.buffer[y * state.width + x];
    const idx = indexOfRgb565(v);
    if (idx >= 0) {
      state.colorIndex = idx;
      paletteEl.querySelectorAll(".palette-cell").forEach((el, i) => {
        el.classList.toggle("selected", i === idx);
      });
      updateInfo();
    }
  } else if (state.tool === "fill") {
    floodFill(x, y, PALETTE_ST7735[state.colorIndex].rgb565);
    render();
  }
}

function setPixel(x, y, value) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
  const idx = y * state.width + x;
  if (state.buffer[idx] === value) return;
  state.buffer[idx] = value;
  /* Repaint partiel rapide */
  const { r, g, b } = rgb565ToRgb(value);
  mainCtx.fillStyle = `rgb(${r},${g},${b})`;
  mainCtx.fillRect(x * state.zoom, y * state.zoom, state.zoom, state.zoom);
  /* mini */
  miniCtx.fillStyle = `rgb(${r},${g},${b})`;
  miniCtx.fillRect(x, y, 1, 1);
}

function drawLine(x0, y0, x1, y1) {
  /* Bresenham */
  const dx =  Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    applyToolAt({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function floodFill(x, y, target) {
  const w = state.width, h = state.height;
  const start = state.buffer[y * w + x];
  if (start === target) return;

  /* BFS itératif avec queue plate, max 64k pixels (suffit largement) */
  const queue = [x, y];
  let safety = w * h + 1;
  while (queue.length && safety-- > 0) {
    const cx = queue.shift();
    const cy = queue.shift();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    if (state.buffer[cy * w + cx] !== start) continue;
    state.buffer[cy * w + cx] = target;
    queue.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
}

/* ---------------------- TRANSFORMS ---------------------- */

function transformFlipH() {
  const w = state.width, h = state.height;
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + (w - 1 - x)] = state.buffer[y * w + x];
    }
  }
  state.buffer = out;
  state.history.push(new Uint16Array(state.buffer));
  render();
}

function transformFlipV() {
  const w = state.width, h = state.height;
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[(h - 1 - y) * w + x] = state.buffer[y * w + x];
    }
  }
  state.buffer = out;
  state.history.push(new Uint16Array(state.buffer));
  render();
}

function transformResize() {
  const newW = parseInt(prompt(`Nouvelle largeur (actuel ${state.width}) ?`, state.width) || "", 10);
  if (!Number.isFinite(newW) || newW < 1 || newW > 256) return;
  const newH = parseInt(prompt(`Nouvelle hauteur (actuel ${state.height}) ?`, state.height) || "", 10);
  if (!Number.isFinite(newH) || newH < 1 || newH > 256) return;

  /* Nearest-neighbor */
  const oldW = state.width, oldH = state.height, old = state.buffer;
  const out = new Uint16Array(newW * newH);
  for (let y = 0; y < newH; y++) {
    const sy = Math.floor(y * oldH / newH);
    for (let x = 0; x < newW; x++) {
      const sx = Math.floor(x * oldW / newW);
      out[y * newW + x] = old[sy * oldW + sx];
    }
  }
  state.width  = newW;
  state.height = newH;
  state.buffer = out;
  state.history.push(new Uint16Array(state.buffer));
  computeZoom();
  resizeCanvases();
  render();
}

function transformClear() {
  if (!confirm("Effacer toute la frame ?")) return;
  state.buffer.fill(ERASER_VALUE);
  state.history.push(new Uint16Array(state.buffer));
  render();
}

/* ---------------------- HISTORIQUE ---------------------- */

function undo() {
  const snap = state.history.undo();
  if (!snap) return;
  state.buffer = new Uint16Array(snap);
  render();
}

function redo() {
  const snap = state.history.redo();
  if (!snap) return;
  state.buffer = new Uint16Array(snap);
  render();
}

/* ---------------------- COMMIT ---------------------- */

function commit() {
  if (!state.frame) return;
  state.onCommit?.(state.frame.id, {
    pixelsB64: rgb565ToBase64(state.buffer),
    w: state.width,
    h: state.height
  });
  showScreen("assetLab");
}

async function savePng() {
  if (!state.frame) return;
  /* Génère le PNG depuis le mini canvas (taille native) */
  const tmp = document.createElement("canvas");
  tmp.width = state.width;
  tmp.height = state.height;
  const ctx = tmp.getContext("2d");
  ctx.putImageData(rgb565ToImageData(state.buffer, state.width, state.height), 0, 0);
  const dataUrl = tmp.toDataURL("image/png");
  const result = await window.lumaAPI.saveFramePng({ name: state.frame.name, dataUrl });
  if (!result.ok) { alert(result.error || "Erreur sauvegarde PNG"); return; }
  alert(`PNG sauvegardé : ${result.path}`);
}
