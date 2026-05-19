/**
 * ASSET LAB
 * - Import image / spritesheet / GIF (1ère frame)
 * - Découpe en grille (presets 8/16/32 + custom)
 * - Sélection active d'une frame (clic carte)
 * - Preview agrandie pixel-perfect dans le panneau "Aperçu"
 * - Ouverture d'une frame dans le Sprite Editor
 * - Estimation mémoire RGB565 + headers
 */

import { estimateFramesMemory, formatBytes, getProjectLimit } from "./memory.js";
import { PALETTE_ST7735 } from "./palette.js";
import { rgb565ToImageData, base64ToRgb565 } from "./rgb565.js";

const state = {
  importedImage:    null,
  importedName:     "",
  frames:           [],
  selectedFrameId:  null,
  projectLimit:     getProjectLimit("550ko"),
  onOpenSprite:     null
};

let sourceCanvas, sourceCtx;
let previewCanvas, previewCtx;
let framesGrid;
let memFrames, memRaw, memBar, memWarn, memLimit, frameCount, imageInfo;
let editBtn;

export function initAssetLab({ onOpenSpriteEditor }) {
  state.onOpenSprite = onOpenSpriteEditor;

  sourceCanvas  = document.getElementById("sourceCanvas");
  sourceCtx     = sourceCanvas.getContext("2d", { willReadFrequently: true });
  previewCanvas = document.getElementById("previewCanvas");
  previewCtx    = previewCanvas.getContext("2d");
  framesGrid    = document.getElementById("framesGrid");
  memFrames     = document.getElementById("memFrames");
  memRaw        = document.getElementById("memRaw");
  memBar        = document.getElementById("memBar");
  memWarn       = document.getElementById("memWarn");
  memLimit      = document.getElementById("memLimit");
  frameCount    = document.getElementById("frameCount");
  imageInfo     = document.getElementById("imageInfo");
  editBtn       = document.getElementById("openSpriteEditor");

  /* Inputs */
  document.getElementById("presetSize").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v !== "custom") {
      document.getElementById("frameW").value = v;
      document.getElementById("frameH").value = v;
    }
    drawGridPreview();
  });
  document.getElementById("frameW").addEventListener("input", drawGridPreview);
  document.getElementById("frameH").addEventListener("input", drawGridPreview);

  /* Boutons */
  document.getElementById("importImage").addEventListener("click", onImport);
  document.getElementById("sliceImage").addEventListener("click", onSlice);
  document.getElementById("saveFrames").addEventListener("click", onSaveFrames);
  document.getElementById("exportLpk").addEventListener("click", onExportLpk);
  editBtn.addEventListener("click", openCurrentInEditor);

  /* Palette en bas */
  renderPaletteRow();
  refreshUI();
}

export function setProjectSize(sizeKey) {
  state.projectLimit = getProjectLimit(sizeKey);
  if (memLimit) memLimit.textContent = sizeKey;
  refreshUI();
}

/* ---------------------- IMPORT ---------------------- */

async function onImport() {
  const result = await window.lumaAPI.importImage();
  if (result.canceled) return;
  if (!result.ok) { alert(result.error || "Erreur import."); return; }

  state.importedName = result.name;
  imageInfo.textContent = result.isGif
    ? `GIF importé : ${result.name} — V0.3 affiche la première image (animation V0.4).`
    : `Image importée : ${result.name}`;

  const img = new Image();
  img.onload = () => {
    state.importedImage = img;
    sourceCanvas.width = img.width;
    sourceCanvas.height = img.height;
    drawGridPreview();
  };
  img.src = result.dataUrl;
}

/* ---------------------- DÉCOUPE ---------------------- */

function onSlice() {
  if (!state.importedImage) { alert("Importe d'abord une image."); return; }

  const w = Math.max(1, Number(document.getElementById("frameW").value));
  const h = Math.max(1, Number(document.getElementById("frameH").value));
  const base   = document.getElementById("baseName").value.trim() || "sprite";
  const folder = document.getElementById("folderName").value;
  const usage  = document.getElementById("usageType").value;

  state.frames = [];
  state.selectedFrameId = null;
  framesGrid.innerHTML = "";

  let index = 0;
  const img = state.importedImage;
  for (let y = 0; y + h <= img.height; y += h) {
    for (let x = 0; x + w <= img.width; x += w) {
      const frame = {
        id: index,
        name: `${base}_${String(index).padStart(3, "0")}`,
        folder, usage,
        x, y, w, h,
        edited: false,   /* true si modifié via Sprite Editor */
        pixelsB64: null  /* Uint16Array RGB565 encodé base64 */
      };
      state.frames.push(frame);
      createFrameCard(frame);
      index++;
    }
  }
  refreshUI();
}

/* ---------------------- CARTES FRAMES ---------------------- */

function createFrameCard(frame) {
  const card = document.createElement("div");
  card.className = "frame-card";
  card.dataset.frameId = String(frame.id);

  const canvas = document.createElement("canvas");
  canvas.width = frame.w;
  canvas.height = frame.h;
  paintFrameOnCanvas(frame, canvas);

  const nameInput = document.createElement("input");
  nameInput.value = frame.name;
  nameInput.addEventListener("input", () => { frame.name = nameInput.value; });
  nameInput.addEventListener("click", (e) => e.stopPropagation());

  const usageSelect = document.createElement("select");
  ["frame", "animation", "object_player", "object_enemy", "tile", "portrait", "item"].forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (value === frame.usage) opt.selected = true;
    usageSelect.appendChild(opt);
  });
  usageSelect.addEventListener("change", () => { frame.usage = usageSelect.value; });
  usageSelect.addEventListener("click", (e) => e.stopPropagation());

  /* Sélection au clic */
  card.addEventListener("click", () => selectFrame(frame.id));
  /* Double-clic = ouvrir éditeur */
  card.addEventListener("dblclick", () => {
    selectFrame(frame.id);
    openCurrentInEditor();
  });

  card.appendChild(canvas);
  card.appendChild(nameInput);
  card.appendChild(usageSelect);
  framesGrid.appendChild(card);
}

/** Dessine la frame sur un canvas donné (au format natif w*h) en se basant
 *  sur la source originale OU sur le buffer RGB565 si éditée. */
function paintFrameOnCanvas(frame, canvas) {
  canvas.width = frame.w;
  canvas.height = frame.h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  if (frame.edited && frame.pixelsB64) {
    const buf = base64ToRgb565(frame.pixelsB64);
    const img = rgb565ToImageData(buf, frame.w, frame.h);
    ctx.putImageData(img, 0, 0);
  } else if (state.importedImage) {
    ctx.drawImage(state.importedImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  }
}

/* ---------------------- SÉLECTION + APERÇU ---------------------- */

function selectFrame(id) {
  state.selectedFrameId = id;
  for (const card of framesGrid.querySelectorAll(".frame-card")) {
    card.classList.toggle("selected", Number(card.dataset.frameId) === id);
  }
  drawGridPreview();   /* met en évidence la frame dans la spritesheet */
  drawSelectedPreview();
  refreshUI();
}

function drawSelectedPreview() {
  const frame = getSelectedFrame();
  const wrap = document.getElementById("previewWrap");
  if (!frame) {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    document.getElementById("previewInfo").textContent = "Sélectionne une frame pour l'agrandir.";
    wrap.classList.remove("has-frame");
    return;
  }

  /* Zoom pixel-perfect : on choisit le plus grand multiple entier
     qui rentre dans 256x256 */
  const maxSize = 256;
  const zoom = Math.max(1, Math.floor(Math.min(maxSize / frame.w, maxSize / frame.h)));
  previewCanvas.width  = frame.w * zoom;
  previewCanvas.height = frame.h * zoom;

  /* Petit canvas natif puis mise à l'échelle */
  const tmp = document.createElement("canvas");
  paintFrameOnCanvas(frame, tmp);
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.drawImage(tmp, 0, 0, previewCanvas.width, previewCanvas.height);

  /* Grille pixel-perfect par-dessus si zoom assez grand */
  if (zoom >= 6) {
    previewCtx.strokeStyle = "rgba(95,124,255,0.35)";
    previewCtx.lineWidth = 1;
    for (let x = 0; x <= frame.w; x++) {
      previewCtx.beginPath();
      previewCtx.moveTo(x * zoom + 0.5, 0);
      previewCtx.lineTo(x * zoom + 0.5, frame.h * zoom);
      previewCtx.stroke();
    }
    for (let y = 0; y <= frame.h; y++) {
      previewCtx.beginPath();
      previewCtx.moveTo(0, y * zoom + 0.5);
      previewCtx.lineTo(frame.w * zoom, y * zoom + 0.5);
      previewCtx.stroke();
    }
  }

  document.getElementById("previewInfo").textContent =
    `${frame.name} — ${frame.w}×${frame.h} px · zoom ${zoom}× · ${frame.w * frame.h * 2} o RGB565${frame.edited ? " · éditée" : ""}`;
  wrap.classList.add("has-frame");
}

/* ---------------------- GRILLE SOURCE ---------------------- */

function drawGridPreview() {
  if (!state.importedImage) return;
  const w = Math.max(1, Number(document.getElementById("frameW").value));
  const h = Math.max(1, Number(document.getElementById("frameH").value));

  sourceCanvas.width = state.importedImage.width;
  sourceCanvas.height = state.importedImage.height;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(state.importedImage, 0, 0);

  /* Grille */
  sourceCtx.strokeStyle = "#5f7cff";
  sourceCtx.lineWidth = 1;
  for (let x = 0; x <= state.importedImage.width; x += w) {
    sourceCtx.beginPath();
    sourceCtx.moveTo(x + 0.5, 0);
    sourceCtx.lineTo(x + 0.5, state.importedImage.height);
    sourceCtx.stroke();
  }
  for (let y = 0; y <= state.importedImage.height; y += h) {
    sourceCtx.beginPath();
    sourceCtx.moveTo(0, y + 0.5);
    sourceCtx.lineTo(state.importedImage.width, y + 0.5);
    sourceCtx.stroke();
  }

  /* Mise en évidence de la frame sélectionnée */
  const sel = getSelectedFrame();
  if (sel) {
    sourceCtx.strokeStyle = "#ffe24c";
    sourceCtx.lineWidth = 2;
    sourceCtx.strokeRect(sel.x + 1, sel.y + 1, sel.w - 2, sel.h - 2);
  }
}

/* ---------------------- ACTIONS ---------------------- */

async function onSaveFrames() {
  if (!state.frames.length) { alert("Aucune frame à sauver."); return; }
  const result = await window.lumaAPI.saveFrames(state.frames);
  if (!result.ok) { alert(result.error || "Erreur sauvegarde."); return; }
  alert(`Frames sauvegardées : ${result.path}`);
}

async function onExportLpk() {
  if (!state.frames.length) { alert("Aucune frame à exporter."); return; }

  /* Construit le buffer pixel pour chaque frame */
  const payload = {
    frames: state.frames.map((f) => {
      const tmp = document.createElement("canvas");
      paintFrameOnCanvas(f, tmp);
      const ctx = tmp.getContext("2d");
      const data = ctx.getImageData(0, 0, f.w, f.h);
      const pixels = [];
      for (let i = 0; i < data.data.length; i += 4) {
        const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
        pixels.push(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
      }
      return { name: f.name, w: f.w, h: f.h, rgb565: pixels };
    })
  };

  const result = await window.lumaAPI.writeLpk(payload);
  if (!result.ok) { alert(result.error || "Erreur export .lpk"); return; }
  alert(`Export .lpk OK : ${result.path}\n${result.bytes} octets`);
}

function openCurrentInEditor() {
  const frame = getSelectedFrame();
  if (!frame) { alert("Sélectionne d'abord une frame."); return; }
  state.onOpenSprite?.(frame, state.importedImage);
}

/* ---------------------- API publiques ---------------------- */

export function getSelectedFrame() {
  if (state.selectedFrameId == null) return null;
  return state.frames.find((f) => f.id === state.selectedFrameId) || null;
}

/** Appelé par le Sprite Editor quand il sauvegarde une frame. */
export function commitFrameEdits(frameId, { pixelsB64, w, h }) {
  const f = state.frames.find((x) => x.id === frameId);
  if (!f) return;
  f.pixelsB64 = pixelsB64;
  f.edited    = true;
  if (w && h) { f.w = w; f.h = h; }

  /* Repeindre la carte */
  const card = framesGrid.querySelector(`[data-frame-id="${frameId}"]`);
  if (card) {
    const canvas = card.querySelector("canvas");
    paintFrameOnCanvas(f, canvas);
  }
  drawSelectedPreview();
  refreshUI();
}

/* ---------------------- UI ---------------------- */

function refreshUI() {
  const mem = estimateFramesMemory(state.frames);
  const percent = Math.min(100, Math.round((mem.totalBytes / state.projectLimit) * 100));

  memFrames.textContent  = String(mem.frames);
  memRaw.textContent     = `${formatBytes(mem.pixelBytes)} (+${formatBytes(mem.headerBytes)} hdr)`;
  frameCount.textContent = `${mem.frames} frame${mem.frames > 1 ? "s" : ""}`;
  memBar.style.width = `${percent}%`;
  memBar.style.background = percent > 90 ? "#ff5e57" : percent > 65 ? "#fff25a" : "#4dff77";
  memWarn.textContent =
    percent > 100 ? "⚠ Mémoire dépassée : réduis la taille ou le nombre de frames." :
    percent > 90  ? "⚠ Très proche de la limite projet." :
    mem.frames === 0 ? "Importe une image pour estimer la mémoire." :
                       "Estimation OK (RGB565 + headers .lpk).";

  /* Bouton éditeur actif uniquement si une frame est sélectionnée */
  const hasSel = getSelectedFrame() !== null;
  editBtn.classList.toggle("disabled", !hasSel);
  editBtn.disabled = !hasSel;
  document.getElementById("navSprite").classList.toggle("disabled", !hasSel);
}

function renderPaletteRow() {
  const row = document.getElementById("paletteRow");
  row.innerHTML = "";
  for (const c of PALETTE_ST7735) {
    const s = document.createElement("div");
    s.className = "swatch";
    s.style.background = c.hex;
    s.title = `${c.hex} · RGB565 0x${c.rgb565.toString(16).padStart(4, "0").toUpperCase()}`;
    row.appendChild(s);
  }
}
