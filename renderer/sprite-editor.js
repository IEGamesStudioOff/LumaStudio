// =============================================================================
// LUMA STUDIO — SPRITE EDITOR (V1.1)
// =============================================================================
// Conçu comme un éditeur pixel-art pro orienté ST7735 (RGB565).
// Outils : crayon (avec pixel-perfect mode), gomme, pipette, flood fill, ligne,
// rectangle, ellipse, sélection rectangulaire.
// Brush 1-4, mirror H/V/quad, onion skin, undo/redo 100 étapes.
// Palette DB32 quantifiée RGB565 + color ramps pour shading rapide.
// =============================================================================

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // PALETTE DB32 (DawnBringer 32, CC0) quantifiée RGB565
  // Organisée en 8 colonnes × 4 rangées pour une grille palette propre.
  // Chaque rangée forme une "ramp" (ombre → lumière) navigable au clavier.
  // ---------------------------------------------------------------------------
  const DB32_RGB888 = [
    // Rangée 0 — gris/contour
    [0,0,0],         [34,32,52],      [69,40,60],      [102,57,49],
    [143,86,59],     [223,113,38],    [217,160,102],   [238,195,154],
    // Rangée 1 — chair/jaune
    [251,242,54],    [153,229,80],    [106,190,48],    [55,148,110],
    [75,105,47],     [82,75,36],      [50,60,57],      [63,63,116],
    // Rangée 2 — bleus
    [48,96,130],     [91,110,225],    [99,155,255],    [95,205,228],
    [203,219,252],   [255,255,255],   [155,173,183],   [132,126,135],
    // Rangée 3 — violet/rouge
    [105,106,106],   [89,86,82],      [118,66,138],    [172,50,50],
    [217,87,99],     [215,123,186],   [143,151,74],    [138,111,48]
  ];

  function rgb888To565(r, g, b) {
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  }

  function rgb565ToRgb888(c) {
    const r5 = (c >> 11) & 0x1F;
    const g6 = (c >> 5) & 0x3F;
    const b5 = c & 0x1F;
    // bit replication pour rester fidèle au rendu console
    return [
      (r5 << 3) | (r5 >> 2),
      (g6 << 2) | (g6 >> 4),
      (b5 << 3) | (b5 >> 2)
    ];
  }

  function rgb565ToHex(c) {
    if (c === 0xF81F) return "#ff00ff"; // marqueur transparent
    const [r, g, b] = rgb565ToRgb888(c);
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  }

  // 0xF81F = magenta = couleur "transparente" pour le sprite editor.
  // Aucun pixel "vrai" ne sera magenta — il sera affiché transparent.
  const TRANSPARENT = 0xF81F;

  const PALETTE_DB32 = DB32_RGB888.map(([r, g, b]) => rgb888To565(r, g, b));
  // On insère le "transparent" en première position pour servir de gomme
  // au clic palette, sans casser la rampe DB32 (qu'on garde aux indices 1+).
  const PALETTE = [TRANSPARENT, ...PALETTE_DB32];

  // Ramps : 4 rangées DB32, indexées dans PALETTE (offset +1 à cause du transparent).
  const RAMPS = [
    [1, 2, 3, 4, 5, 6, 7, 8],     // gris→peau
    [9, 10, 11, 12, 13, 14, 15, 16], // jaune→vert→sombre→bleu
    [17, 18, 19, 20, 21, 22, 23, 24], // bleus→blanc
    [25, 26, 27, 28, 29, 30, 31, 32]  // gris→rose→jaune-vert
  ];

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const state = {
    open: false,
    frameIndex: -1,
    w: 16,
    h: 16,
    pixels: null,         // Uint16Array(w*h) RGB565, TRANSPARENT pour vide

    tool: "pencil",       // pencil|eraser|picker|fill|line|rect|ellipse|select
    brushSize: 1,
    pixelPerfect: true,
    mirror: "none",       // none|h|v|quad
    rectFill: false,
    ellipseFill: false,

    primary: PALETTE[1],
    secondary: TRANSPARENT,
    rampIndex: 0,
    rampPos: 0,
    customColors: [],     // user-added RGB565

    zoom: 16,             // pixels écran par pixel sprite
    panX: 0, panY: 0,
    showGrid: true,
    showPixelGrid: true,
    showCheckerboard: true,
    onionSkin: false,

    isDrawing: false,
    drawStart: null,      // {x, y} en coords sprite
    drawPath: [],         // pour pixel-perfect (liste de points dessinés)
    isPanning: false,
    panStart: null,

    selection: null,      // {x, y, w, h, buffer: Uint16Array} ou null
    selectionDrag: null,  // {originX, originY, mode:'move'|'create'}
    selectionBuffer: null,// floating selection en cours de move

    historyStack: [],
    historyIdx: -1,
    historyLimit: 100
  };

  // ---------------------------------------------------------------------------
  // DOM references (lazy)
  // ---------------------------------------------------------------------------
  let overlay, canvas, ctx, gridCanvas, gridCtx, prevCanvas, prevCtx;
  let titleEl, sizeEl, statsColorsEl, statsBytesEl, statsPctEl;
  let paletteEl, customPaletteEl, rampsEl, primaryEl, secondaryEl;
  let toolsEl, brushSizeEl, mirrorEl, pixelPerfectEl, rectFillEl, ellipseFillEl;
  let historyListEl, frameNavLabel;

  function $$(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------------------
  // FRAME I/O — décode/encode pixels Base64 ⇄ Uint16Array RGB565
  // ---------------------------------------------------------------------------
  function pixelsToBase64(pixels) {
    const bytes = new Uint8Array(pixels.buffer);
    let str = "";
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str);
  }

  function base64ToPixels(b64, expectedLen) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const arr = new Uint16Array(bytes.buffer);
    if (arr.length !== expectedLen) {
      // taille incohérente, on tronque ou complète
      const safe = new Uint16Array(expectedLen);
      const min = Math.min(arr.length, expectedLen);
      for (let i = 0; i < min; i++) safe[i] = arr[i];
      return safe;
    }
    return arr;
  }

  // Bootstrap d'une frame en chargeant pixelsB64 si présent, sinon en lisant
  // les pixels de l'image source via canvas tampon.
  function loadFramePixels(frame) {
    const len = frame.w * frame.h;
    if (frame.pixelsB64) {
      try { return base64ToPixels(frame.pixelsB64, len); } catch (e) {}
    }
    // Fallback : on lit depuis importedImage (global défini dans app.js).
    const pixels = new Uint16Array(len);
    if (typeof importedImage !== "undefined" && importedImage) {
      const tmp = document.createElement("canvas");
      tmp.width = frame.w;
      tmp.height = frame.h;
      const tctx = tmp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(importedImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      const data = tctx.getImageData(0, 0, frame.w, frame.h).data;
      for (let i = 0; i < len; i++) {
        const a = data[i * 4 + 3];
        if (a < 128) {
          pixels[i] = TRANSPARENT;
        } else {
          pixels[i] = rgb888To565(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        }
      }
    } else {
      pixels.fill(TRANSPARENT);
    }
    return pixels;
  }

  function commitFramePixels() {
    if (state.frameIndex < 0) return;
    const f = frames[state.frameIndex];
    if (!f) return;
    f.pixelsB64 = pixelsToBase64(state.pixels);
    f.w = state.w; f.h = state.h;
    f.rgb565Bytes = state.w * state.h * 2;
    f.editedAt = Date.now();
    // Mettre à jour la frame card dans Asset Lab si possible.
    if (typeof updateMemory === "function") updateMemory();
    refreshAssetLabFrameCards();
  }

  // ---------------------------------------------------------------------------
  // HISTORY (snapshot-based, suffisant pour 16×16 → 32×32)
  // ---------------------------------------------------------------------------
  function pushHistory(label) {
    if (state.historyIdx < state.historyStack.length - 1) {
      state.historyStack.length = state.historyIdx + 1;
    }
    state.historyStack.push({
      label, w: state.w, h: state.h,
      pixels: new Uint16Array(state.pixels)
    });
    if (state.historyStack.length > state.historyLimit) {
      state.historyStack.shift();
    }
    state.historyIdx = state.historyStack.length - 1;
    renderHistory();
  }

  function undo() {
    if (state.historyIdx <= 0) return;
    state.historyIdx--;
    const snap = state.historyStack[state.historyIdx];
    state.w = snap.w; state.h = snap.h;
    state.pixels = new Uint16Array(snap.pixels);
    fitView();
    render();
    renderHistory();
  }

  function redo() {
    if (state.historyIdx >= state.historyStack.length - 1) return;
    state.historyIdx++;
    const snap = state.historyStack[state.historyIdx];
    state.w = snap.w; state.h = snap.h;
    state.pixels = new Uint16Array(snap.pixels);
    fitView();
    render();
    renderHistory();
  }

  function renderHistory() {
    if (!historyListEl) return;
    historyListEl.innerHTML = "";
    const start = Math.max(0, state.historyStack.length - 25);
    for (let i = start; i < state.historyStack.length; i++) {
      const div = document.createElement("div");
      div.className = "spe-history-item" + (i === state.historyIdx ? " active" : "");
      div.textContent = (i + 1) + ". " + state.historyStack[i].label;
      div.onclick = () => {
        state.historyIdx = i;
        const snap = state.historyStack[i];
        state.w = snap.w; state.h = snap.h;
        state.pixels = new Uint16Array(snap.pixels);
        render();
        renderHistory();
      };
      historyListEl.appendChild(div);
    }
    historyListEl.scrollTop = historyListEl.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // DRAWING PRIMITIVES (sur state.pixels)
  // ---------------------------------------------------------------------------
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < state.w && y < state.h; }
  function getPixel(x, y) { return inBounds(x, y) ? state.pixels[y * state.w + x] : 0; }
  function setPixelRaw(x, y, c) { if (inBounds(x, y)) state.pixels[y * state.w + x] = c; }

  function setPixelMirrored(x, y, c) {
    paintBrush(x, y, c);
    if (state.mirror === "h" || state.mirror === "quad") paintBrush(state.w - 1 - x, y, c);
    if (state.mirror === "v" || state.mirror === "quad") paintBrush(x, state.h - 1 - y, c);
    if (state.mirror === "quad") paintBrush(state.w - 1 - x, state.h - 1 - y, c);
  }

  function paintBrush(cx, cy, c) {
    const r = state.brushSize;
    if (r <= 1) { setPixelRaw(cx, cy, c); return; }
    // Brush "square" centré, r est la taille du côté
    const half = Math.floor((r - 1) / 2);
    for (let dy = -half; dy <= r - 1 - half; dy++) {
      for (let dx = -half; dx <= r - 1 - half; dx++) {
        setPixelRaw(cx + dx, cy + dy, c);
      }
    }
  }

  function lineBresenham(x0, y0, x1, y1, c) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      setPixelMirrored(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Pixel-perfect : retire les "L-corners" en supprimant le pixel central
  // quand 3 pixels consécutifs forment un coin. Appliqué sur state.drawPath.
  function applyPixelPerfectCleanup(path, color) {
    if (path.length < 3) return;
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      // si b est un coin (a et c en diagonale via b)
      const isCorner =
        (Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 0 &&
         Math.abs(c.x - b.x) === 0 && Math.abs(c.y - b.y) === 1) ||
        (Math.abs(a.x - b.x) === 0 && Math.abs(a.y - b.y) === 1 &&
         Math.abs(c.x - b.x) === 1 && Math.abs(c.y - b.y) === 0);
      if (isCorner) {
        // efface le pixel coin si sa couleur correspond
        if (getPixel(b.x, b.y) === color) {
          setPixelRaw(b.x, b.y, TRANSPARENT);
          if (state.mirror === "h" || state.mirror === "quad") setPixelRaw(state.w - 1 - b.x, b.y, TRANSPARENT);
          if (state.mirror === "v" || state.mirror === "quad") setPixelRaw(b.x, state.h - 1 - b.y, TRANSPARENT);
          if (state.mirror === "quad") setPixelRaw(state.w - 1 - b.x, state.h - 1 - b.y, TRANSPARENT);
        }
      }
    }
  }

  function rectStroke(x0, y0, x1, y1, c, fill) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    if (fill) {
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) setPixelMirrored(x, y, c);
      }
    } else {
      for (let x = xa; x <= xb; x++) {
        setPixelMirrored(x, ya, c);
        setPixelMirrored(x, yb, c);
      }
      for (let y = ya; y <= yb; y++) {
        setPixelMirrored(xa, y, c);
        setPixelMirrored(xb, y, c);
      }
    }
  }

  function ellipseStroke(x0, y0, x1, y1, c, fill) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const a = Math.abs(x1 - x0) / 2, b = Math.abs(y1 - y0) / 2;
    if (a < 0.5 || b < 0.5) { setPixelMirrored(Math.round(cx), Math.round(cy), c); return; }
    if (fill) {
      const a2 = a * a, b2 = b * b;
      for (let y = Math.floor(cy - b); y <= Math.ceil(cy + b); y++) {
        for (let x = Math.floor(cx - a); x <= Math.ceil(cx + a); x++) {
          const dx = x - cx, dy = y - cy;
          if ((dx * dx) / a2 + (dy * dy) / b2 <= 1) setPixelMirrored(x, y, c);
        }
      }
    } else {
      // outline midpoint ellipse
      let x = 0, y = Math.round(b);
      const a2 = a * a, b2 = b * b;
      let d1 = b2 - a2 * b + 0.25 * a2;
      while (b2 * x <= a2 * y) {
        plot4(cx, cy, x, y, c);
        if (d1 < 0) { x++; d1 += b2 * (2 * x + 1); }
        else { x++; y--; d1 += b2 * (2 * x + 1) - 2 * a2 * y; }
      }
      let d2 = b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2;
      while (y >= 0) {
        plot4(cx, cy, x, y, c);
        if (d2 > 0) { y--; d2 -= 2 * a2 * y - a2; }
        else { y--; x++; d2 += 2 * b2 * x - 2 * a2 * y - a2; }
      }
    }
  }

  function plot4(cx, cy, x, y, c) {
    setPixelMirrored(Math.round(cx + x), Math.round(cy + y), c);
    setPixelMirrored(Math.round(cx - x), Math.round(cy + y), c);
    setPixelMirrored(Math.round(cx + x), Math.round(cy - y), c);
    setPixelMirrored(Math.round(cx - x), Math.round(cy - y), c);
  }

  function floodFill(x, y, target, replacement) {
    if (target === replacement) return;
    if (!inBounds(x, y)) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!inBounds(cx, cy)) continue;
      if (state.pixels[cy * state.w + cx] !== target) continue;
      state.pixels[cy * state.w + cx] = replacement;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  // ---------------------------------------------------------------------------
  // FRAME OPS
  // ---------------------------------------------------------------------------
  function clearFrame() {
    pushHistory("Clear");
    state.pixels.fill(TRANSPARENT);
    commitFramePixels();
    render();
  }

  function flipH() {
    pushHistory("Flip H");
    const next = new Uint16Array(state.pixels.length);
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        next[y * state.w + x] = state.pixels[y * state.w + (state.w - 1 - x)];
      }
    }
    state.pixels = next;
    commitFramePixels();
    render();
  }

  function flipV() {
    pushHistory("Flip V");
    const next = new Uint16Array(state.pixels.length);
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        next[y * state.w + x] = state.pixels[(state.h - 1 - y) * state.w + x];
      }
    }
    state.pixels = next;
    commitFramePixels();
    render();
  }

  function rotate90() {
    pushHistory("Rotate 90°");
    const nw = state.h, nh = state.w;
    const next = new Uint16Array(nw * nh);
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        next[x * nw + (nh - 1 - y)] = state.pixels[y * state.w + x];
      }
    }
    state.pixels = next;
    state.w = nw; state.h = nh;
    fitView();
    commitFramePixels();
    render();
  }

  function resizeFrame(nw, nh) {
    pushHistory("Resize " + nw + "×" + nh);
    const next = new Uint16Array(nw * nh);
    next.fill(TRANSPARENT);
    // nearest neighbor
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const sx = Math.floor(x * state.w / nw);
        const sy = Math.floor(y * state.h / nh);
        next[y * nw + x] = state.pixels[sy * state.w + sx];
      }
    }
    state.w = nw; state.h = nh;
    state.pixels = next;
    fitView();
    commitFramePixels();
    render();
  }

  function copyFrameToClipboard() {
    state.selection = {
      x: 0, y: 0, w: state.w, h: state.h,
      buffer: new Uint16Array(state.pixels)
    };
  }

  function pasteFromClipboard() {
    if (!state.selection || !state.selection.buffer) return;
    pushHistory("Paste");
    const sel = state.selection;
    for (let y = 0; y < sel.h; y++) {
      for (let x = 0; x < sel.w; x++) {
        const c = sel.buffer[y * sel.w + x];
        if (c !== TRANSPARENT) setPixelRaw(x, y, c);
      }
    }
    commitFramePixels();
    render();
  }

  // ---------------------------------------------------------------------------
  // VIEW
  // ---------------------------------------------------------------------------
  function fitView() {
    if (!canvas) return;
    const maxW = canvas.width, maxH = canvas.height;
    const zoomFit = Math.floor(Math.min(maxW / state.w, maxH / state.h) * 0.85);
    state.zoom = Math.max(1, Math.min(64, zoomFit));
    state.panX = Math.floor((maxW - state.w * state.zoom) / 2);
    state.panY = Math.floor((maxH - state.h * state.zoom) / 2);
  }

  function screenToSprite(sx, sy) {
    const x = Math.floor((sx - state.panX) / state.zoom);
    const y = Math.floor((sy - state.panY) / state.zoom);
    return { x, y };
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function render() {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#02040d";
    ctx.fillRect(0, 0, W, H);

    const z = state.zoom;
    const x0 = state.panX, y0 = state.panY;

    // checkerboard
    if (state.showCheckerboard) {
      const cs = Math.max(2, Math.floor(z / 2));
      for (let y = 0; y < state.h; y++) {
        for (let x = 0; x < state.w; x++) {
          if (state.pixels[y * state.w + x] === TRANSPARENT) {
            ctx.fillStyle = ((x + y) & 1) ? "#1a1f33" : "#0d1326";
            ctx.fillRect(x0 + x * z, y0 + y * z, z, z);
          }
        }
      }
    }

    // pixels
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const c = state.pixels[y * state.w + x];
        if (c === TRANSPARENT) continue;
        ctx.fillStyle = rgb565ToHex(c);
        ctx.fillRect(x0 + x * z, y0 + y * z, z, z);
      }
    }

    // onion skin
    if (state.onionSkin && state.frameIndex >= 0) {
      drawOnionSkin();
    }

    // selection floating buffer
    if (state.selectionBuffer) {
      const sb = state.selectionBuffer;
      for (let y = 0; y < sb.h; y++) {
        for (let x = 0; x < sb.w; x++) {
          const c = sb.buffer[y * sb.w + x];
          if (c === TRANSPARENT) continue;
          ctx.fillStyle = rgb565ToHex(c);
          ctx.fillRect(x0 + (sb.x + x) * z, y0 + (sb.y + y) * z, z, z);
        }
      }
    }

    // grids
    if (state.showGrid) drawGrid();
    if (state.showPixelGrid && z >= 6) drawPixelGrid();

    // selection rect
    if (state.selection && !state.selectionBuffer) {
      const s = state.selection;
      ctx.strokeStyle = "#fff25a";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x0 + s.x * z + 1, y0 + s.y * z + 1, s.w * z - 2, s.h * z - 2);
      ctx.setLineDash([]);
    }

    // mirror axes
    if (state.mirror !== "none") drawMirrorAxes();
    
    // border autour de la zone sprite
    ctx.strokeStyle = "#5f7cff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 1, y0 - 1, state.w * z + 2, state.h * z + 2);

    updateStats();
    renderPreview();
  }

  function drawGrid() {
    const z = state.zoom;
    const x0 = state.panX, y0 = state.panY;
    ctx.strokeStyle = "rgba(95,124,255,0.35)";
    ctx.lineWidth = 1;
    // grille 8×8 visible et grille 4×4 plus discrète si zoom permet
    for (let x = 0; x <= state.w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x0 + x * z + 0.5, y0);
      ctx.lineTo(x0 + x * z + 0.5, y0 + state.h * z);
      ctx.stroke();
    }
    for (let y = 0; y <= state.h; y += 8) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + y * z + 0.5);
      ctx.lineTo(x0 + state.w * z, y0 + y * z + 0.5);
      ctx.stroke();
    }
  }

  function drawPixelGrid() {
    const z = state.zoom;
    const x0 = state.panX, y0 = state.panY;
    ctx.strokeStyle = "rgba(143,180,255,0.18)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.w; x++) {
      ctx.beginPath();
      ctx.moveTo(x0 + x * z + 0.5, y0);
      ctx.lineTo(x0 + x * z + 0.5, y0 + state.h * z);
      ctx.stroke();
    }
    for (let y = 0; y <= state.h; y++) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + y * z + 0.5);
      ctx.lineTo(x0 + state.w * z, y0 + y * z + 0.5);
      ctx.stroke();
    }
  }

  function drawMirrorAxes() {
    const z = state.zoom;
    const x0 = state.panX, y0 = state.panY;
    ctx.strokeStyle = "#ff5e57";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (state.mirror === "h" || state.mirror === "quad") {
      const xm = x0 + (state.w / 2) * z;
      ctx.beginPath(); ctx.moveTo(xm, y0); ctx.lineTo(xm, y0 + state.h * z); ctx.stroke();
    }
    if (state.mirror === "v" || state.mirror === "quad") {
      const ym = y0 + (state.h / 2) * z;
      ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x0 + state.w * z, ym); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawOnionSkin() {
    const prev = frames[state.frameIndex - 1];
    const next = frames[state.frameIndex + 1];
    ctx.globalAlpha = 0.35;
    if (prev) drawFrameAt(prev, "#ff5e57");
    if (next) drawFrameAt(next, "#4dff77");
    ctx.globalAlpha = 1.0;
  }

  function drawFrameAt(frame, tint) {
    if (!frame) return;
    const px = frame.pixelsB64 ? base64ToPixels(frame.pixelsB64, frame.w * frame.h) : null;
    if (!px) return;
    const z = state.zoom;
    const x0 = state.panX, y0 = state.panY;
    for (let y = 0; y < frame.h && y < state.h; y++) {
      for (let x = 0; x < frame.w && x < state.w; x++) {
        const c = px[y * frame.w + x];
        if (c === TRANSPARENT) continue;
        ctx.fillStyle = tint;
        ctx.fillRect(x0 + x * z, y0 + y * z, z, z);
      }
    }
  }

  function renderPreview() {
    if (!prevCtx) return;
    const PW = prevCanvas.width, PH = prevCanvas.height;
    prevCtx.fillStyle = "#000";
    prevCtx.fillRect(0, 0, PW, PH);
    // 3 previews : 1×, 2×, 4× (taille console réelle)
    const pads = 6;
    const zooms = [1, 2, 4];
    let xOff = pads;
    for (const z of zooms) {
      for (let y = 0; y < state.h; y++) {
        for (let x = 0; x < state.w; x++) {
          const c = state.pixels[y * state.w + x];
          if (c === TRANSPARENT) continue;
          prevCtx.fillStyle = rgb565ToHex(c);
          prevCtx.fillRect(xOff + x * z, pads + y * z, z, z);
        }
      }
      prevCtx.strokeStyle = "#2141d6";
      prevCtx.strokeRect(xOff - 0.5, pads - 0.5, state.w * z + 1, state.h * z + 1);
      xOff += state.w * z + pads * 2;
    }
  }

  function updateStats() {
    if (!statsColorsEl) return;
    const used = new Set();
    for (let i = 0; i < state.pixels.length; i++) {
      const c = state.pixels[i];
      if (c !== TRANSPARENT) used.add(c);
    }
    statsColorsEl.textContent = used.size + " / 65536";
    const bytes = state.w * state.h * 2;
    statsBytesEl.textContent = bytes + " o (RGB565)";
    if (typeof projectLimitBytes !== "undefined") {
      const pct = Math.round((bytes / projectLimitBytes) * 100);
      statsPctEl.textContent = pct + "% du projet (1 frame)";
    }
    sizeEl.textContent = state.w + " × " + state.h;
    titleEl.textContent = state.frameIndex >= 0 && frames[state.frameIndex]
      ? frames[state.frameIndex].name
      : "Pas de frame";
    if (frameNavLabel) {
      frameNavLabel.textContent = state.frameIndex >= 0
        ? (state.frameIndex + 1) + " / " + frames.length
        : "—";
    }
  }

  // ---------------------------------------------------------------------------
  // INPUT EVENTS
  // ---------------------------------------------------------------------------
  function onMouseDown(e) {
    e.preventDefault();
    if (e.button === 1 || e.shiftKey && e.button === 0 && state.spaceDown) {
      // middle click = pan
      state.isPanning = true;
      state.panStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
      return;
    }
    if (state.spaceDown) {
      state.isPanning = true;
      state.panStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const p = screenToSprite(sx, sy);
    state.isDrawing = true;
    state.drawStart = p;
    state.drawPath = [p];

    const color = e.button === 2 ? state.secondary : state.primary;

    if (state.tool === "pencil") {
      pushHistory("Pencil");
      setPixelMirrored(p.x, p.y, color);
      render();
    } else if (state.tool === "eraser") {
      pushHistory("Eraser");
      setPixelMirrored(p.x, p.y, TRANSPARENT);
      render();
    } else if (state.tool === "picker") {
      const c = getPixel(p.x, p.y);
      if (c !== undefined) {
        if (e.button === 2) state.secondary = c; else state.primary = c;
        updateColorIndicators();
      }
      state.isDrawing = false;
    } else if (state.tool === "fill") {
      pushHistory("Fill");
      floodFill(p.x, p.y, getPixel(p.x, p.y), color);
      render();
      state.isDrawing = false;
      commitFramePixels();
    } else if (state.tool === "select") {
      if (state.selection && !state.selectionBuffer
          && p.x >= state.selection.x && p.x < state.selection.x + state.selection.w
          && p.y >= state.selection.y && p.y < state.selection.y + state.selection.h) {
        // float la sélection : on lift les pixels et on s'apprête à les déplacer
        liftSelection();
        state.selectionDrag = { originX: p.x, originY: p.y, mode: "move" };
      } else {
        state.selection = { x: p.x, y: p.y, w: 1, h: 1, buffer: null };
        state.selectionDrag = { originX: p.x, originY: p.y, mode: "create" };
        state.selectionBuffer = null;
      }
      render();
    }
  }

  function liftSelection() {
    const s = state.selection;
    const buf = new Uint16Array(s.w * s.h);
    pushHistory("Lift selection");
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        buf[y * s.w + x] = state.pixels[(s.y + y) * state.w + (s.x + x)];
        state.pixels[(s.y + y) * state.w + (s.x + x)] = TRANSPARENT;
      }
    }
    state.selectionBuffer = { x: s.x, y: s.y, w: s.w, h: s.h, buffer: buf };
  }

  function dropSelectionBuffer() {
    const sb = state.selectionBuffer;
    if (!sb) return;
    pushHistory("Drop selection");
    for (let y = 0; y < sb.h; y++) {
      for (let x = 0; x < sb.w; x++) {
        const c = sb.buffer[y * sb.w + x];
        if (c === TRANSPARENT) continue;
        setPixelRaw(sb.x + x, sb.y + y, c);
      }
    }
    state.selection = { x: sb.x, y: sb.y, w: sb.w, h: sb.h, buffer: new Uint16Array(sb.buffer) };
    state.selectionBuffer = null;
    commitFramePixels();
  }

  function onMouseMove(e) {
    if (state.isPanning) {
      state.panX = state.panStart.panX + (e.clientX - state.panStart.x);
      state.panY = state.panStart.panY + (e.clientY - state.panStart.y);
      render();
      return;
    }
    if (!state.isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const p = screenToSprite(sx, sy);
    const color = e.buttons === 2 ? state.secondary : state.primary;

    if (state.tool === "pencil") {
      const last = state.drawPath[state.drawPath.length - 1];
      if (last.x !== p.x || last.y !== p.y) {
        lineBresenham(last.x, last.y, p.x, p.y, color);
        state.drawPath.push(p);
      }
      render();
    } else if (state.tool === "eraser") {
      const last = state.drawPath[state.drawPath.length - 1];
      if (last.x !== p.x || last.y !== p.y) {
        lineBresenham(last.x, last.y, p.x, p.y, TRANSPARENT);
        state.drawPath.push(p);
      }
      render();
    } else if (state.tool === "line" || state.tool === "rect" || state.tool === "ellipse") {
      // preview overlay : on rerender depuis l'undo le plus récent
      const snap = state.historyStack[state.historyIdx];
      if (snap) state.pixels = new Uint16Array(snap.pixels);
      if (state.tool === "line") lineBresenham(state.drawStart.x, state.drawStart.y, p.x, p.y, color);
      else if (state.tool === "rect") rectStroke(state.drawStart.x, state.drawStart.y, p.x, p.y, color, state.rectFill);
      else if (state.tool === "ellipse") ellipseStroke(state.drawStart.x, state.drawStart.y, p.x, p.y, color, state.ellipseFill);
      render();
    } else if (state.tool === "select" && state.selectionDrag) {
      if (state.selectionDrag.mode === "create") {
        const x0 = state.selectionDrag.originX, y0 = state.selectionDrag.originY;
        const xa = Math.max(0, Math.min(x0, p.x));
        const ya = Math.max(0, Math.min(y0, p.y));
        const xb = Math.min(state.w - 1, Math.max(x0, p.x));
        const yb = Math.min(state.h - 1, Math.max(y0, p.y));
        state.selection = { x: xa, y: ya, w: xb - xa + 1, h: yb - ya + 1, buffer: null };
      } else if (state.selectionDrag.mode === "move" && state.selectionBuffer) {
        const dx = p.x - state.selectionDrag.originX;
        const dy = p.y - state.selectionDrag.originY;
        state.selectionBuffer.x = state.selection.x + dx;
        state.selectionBuffer.y = state.selection.y + dy;
      }
      render();
    }
  }

  function onMouseUp() {
    if (state.isPanning) { state.isPanning = false; return; }
    if (!state.isDrawing) return;
    state.isDrawing = false;
    if (state.tool === "pencil" && state.pixelPerfect) {
      applyPixelPerfectCleanup(state.drawPath, state.primary);
      render();
    }
    if (state.tool === "select" && state.selectionDrag) {
      if (state.selectionDrag.mode === "move" && state.selectionBuffer) {
        // on garde la sélection flottante visible jusqu'à action Drop
      }
      state.selectionDrag = null;
    }
    commitFramePixels();
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const before = screenToSprite(sx, sy);
    const oldZoom = state.zoom;
    state.zoom = Math.max(1, Math.min(64, state.zoom + (e.deltaY < 0 ? 1 : -1)));
    // ajuster pan pour zoom au curseur
    state.panX -= (before.x * state.zoom - before.x * oldZoom);
    state.panY -= (before.y * state.zoom - before.y * oldZoom);
    render();
  }

  // ---------------------------------------------------------------------------
  // PALETTE / RAMPS UI
  // ---------------------------------------------------------------------------
  function renderPalette() {
    paletteEl.innerHTML = "";
    PALETTE.forEach((c, i) => {
      const sw = document.createElement("div");
      sw.className = "spe-swatch";
      if (c === TRANSPARENT) {
        sw.classList.add("transparent");
        sw.title = "Transparent (eraser)";
      } else {
        sw.style.background = rgb565ToHex(c);
        sw.title = "RGB565 0x" + c.toString(16).toUpperCase() + " — clic = primaire, clic-droit = secondaire";
      }
      sw.onclick = (e) => {
        e.preventDefault();
        state.primary = c;
        // update ramp/pos pour navigation flèches
        for (let r = 0; r < RAMPS.length; r++) {
          const p = RAMPS[r].indexOf(i);
          if (p >= 0) { state.rampIndex = r; state.rampPos = p; break; }
        }
        updateColorIndicators();
      };
      sw.oncontextmenu = (e) => {
        e.preventDefault();
        state.secondary = c;
        updateColorIndicators();
      };
      paletteEl.appendChild(sw);
    });

    rampsEl.innerHTML = "";
    RAMPS.forEach((ramp, ri) => {
      const row = document.createElement("div");
      row.className = "spe-ramp";
      ramp.forEach((idx, pi) => {
        const sw = document.createElement("div");
        sw.className = "spe-ramp-swatch";
        sw.style.background = rgb565ToHex(PALETTE[idx]);
        sw.title = "Ramp " + (ri + 1) + " stop " + (pi + 1);
        sw.onclick = () => {
          state.primary = PALETTE[idx];
          state.rampIndex = ri;
          state.rampPos = pi;
          updateColorIndicators();
        };
        row.appendChild(sw);
      });
      rampsEl.appendChild(row);
    });
  }

  function renderCustomPalette() {
    customPaletteEl.innerHTML = "";
    state.customColors.forEach((c, i) => {
      const sw = document.createElement("div");
      sw.className = "spe-swatch";
      sw.style.background = rgb565ToHex(c);
      sw.title = "Custom — clic = primaire, clic-droit = supprimer";
      sw.onclick = () => { state.primary = c; updateColorIndicators(); };
      sw.oncontextmenu = (e) => {
        e.preventDefault();
        state.customColors.splice(i, 1);
        renderCustomPalette();
      };
      customPaletteEl.appendChild(sw);
    });
    const add = document.createElement("div");
    add.className = "spe-swatch spe-add";
    add.textContent = "+";
    add.title = "Ajouter une couleur custom (sera quantifiée en RGB565)";
    add.onclick = () => {
      const input = document.createElement("input");
      input.type = "color";
      input.value = "#5f7cff";
      input.oninput = () => {
        const hex = input.value.substring(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const c = rgb888To565(r, g, b);
        if (!state.customColors.includes(c)) state.customColors.push(c);
        state.primary = c;
        renderCustomPalette();
        updateColorIndicators();
      };
      input.click();
    };
    customPaletteEl.appendChild(add);
  }

  function updateColorIndicators() {
    if (!primaryEl) return;
    primaryEl.style.background = state.primary === TRANSPARENT ? "transparent" : rgb565ToHex(state.primary);
    primaryEl.classList.toggle("transparent", state.primary === TRANSPARENT);
    secondaryEl.style.background = state.secondary === TRANSPARENT ? "transparent" : rgb565ToHex(state.secondary);
    secondaryEl.classList.toggle("transparent", state.secondary === TRANSPARENT);
  }

  function rampNavigate(dir) {
    const ramp = RAMPS[state.rampIndex];
    state.rampPos = Math.max(0, Math.min(ramp.length - 1, state.rampPos + dir));
    state.primary = PALETTE[ramp[state.rampPos]];
    updateColorIndicators();
  }

  // ---------------------------------------------------------------------------
  // FRAME NAV
  // ---------------------------------------------------------------------------
  function openFrame(index) {
    if (index < 0 || index >= frames.length) return;
    state.frameIndex = index;
    const f = frames[index];
    state.w = f.w; state.h = f.h;
    state.pixels = loadFramePixels(f);
    state.historyStack = [];
    state.historyIdx = -1;
    pushHistory("Initial");
    state.selection = null;
    state.selectionBuffer = null;
    fitView();
    render();
  }

  function prevFrame() { if (state.frameIndex > 0) openFrame(state.frameIndex - 1); }
  function nextFrame() { if (state.frameIndex < frames.length - 1) openFrame(state.frameIndex + 1); }

  // ---------------------------------------------------------------------------
  // OUVRIR / FERMER L'OVERLAY
  // ---------------------------------------------------------------------------
  function openOverlay(frameIndex) {
    if (!overlay) buildOverlay();
    state.open = true;
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
    openFrame(frameIndex);
  }

  function closeOverlay() {
    if (state.selectionBuffer) dropSelectionBuffer();
    commitFramePixels();
    state.open = false;
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  // ---------------------------------------------------------------------------
  // KEYBOARD
  // ---------------------------------------------------------------------------
  function onKeyDown(e) {
    if (!state.open) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.key === " " && !state.spaceDown) {
      state.spaceDown = true;
      canvas.style.cursor = "grab";
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); copyFrameToClipboard(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); pasteFromClipboard(); return; }

    switch (e.key.toLowerCase()) {
      case "p": setTool("pencil"); break;
      case "e": setTool("eraser"); break;
      case "i": setTool("picker"); break;
      case "g": setTool("fill"); break;
      case "l": setTool("line"); break;
      case "r": setTool("rect"); break;
      case "o": setTool("ellipse"); break;
      case "s": setTool("select"); break;
      case "x":
        { const tmp = state.primary; state.primary = state.secondary; state.secondary = tmp; updateColorIndicators(); }
        break;
      case "[": state.brushSize = Math.max(1, state.brushSize - 1); if (brushSizeEl) brushSizeEl.value = state.brushSize; break;
      case "]": state.brushSize = Math.min(4, state.brushSize + 1); if (brushSizeEl) brushSizeEl.value = state.brushSize; break;
      case "arrowup": e.preventDefault(); rampNavigate(-1); break;
      case "arrowdown": e.preventDefault(); rampNavigate(1); break;
      case "arrowleft": if (e.altKey) { e.preventDefault(); prevFrame(); } break;
      case "arrowright": if (e.altKey) { e.preventDefault(); nextFrame(); } break;
      case "escape": closeOverlay(); break;
      case "delete":
      case "backspace":
        if (state.selectionBuffer) {
          pushHistory("Delete selection");
          state.selectionBuffer = null;
          state.selection = null;
          commitFramePixels();
          render();
        } else if (state.selection) {
          pushHistory("Clear selection");
          const s = state.selection;
          for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) setPixelRaw(s.x + x, s.y + y, TRANSPARENT);
          commitFramePixels();
          render();
        }
        break;
    }
  }

  function onKeyUp(e) {
    if (e.key === " ") {
      state.spaceDown = false;
      if (canvas) canvas.style.cursor = "crosshair";
    }
  }

  function setTool(tool) {
    if (state.tool === "select" && tool !== "select" && state.selectionBuffer) dropSelectionBuffer();
    state.tool = tool;
    toolsEl.querySelectorAll(".spe-tool").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
    if (tool === "select") canvas.style.cursor = "cell"; else canvas.style.cursor = "crosshair";
    render();
  }

  function setMirror(mode) {
    state.mirror = mode;
    mirrorEl.querySelectorAll(".spe-mirror-btn").forEach(b => b.classList.toggle("active", b.dataset.mirror === mode));
    render();
  }

  // ---------------------------------------------------------------------------
  // ASSET LAB INTEGRATION — ajoute un bouton EDIT sur chaque frame card
  // ---------------------------------------------------------------------------
  function refreshAssetLabFrameCards() {
    const grid = document.getElementById("framesGrid");
    if (!grid) return;
    Array.from(grid.children).forEach((card, i) => {
      if (!card.querySelector(".frame-edit-btn")) {
        const btn = document.createElement("button");
        btn.className = "frame-edit-btn";
        btn.textContent = "✎ EDIT";
        btn.onclick = (e) => { e.stopPropagation(); openOverlay(i); };
        card.appendChild(btn);
      }
      // si la frame a été éditée, redessine le canvas card avec les pixels
      const f = frames[i];
      if (f && f.pixelsB64) {
        const c = card.querySelector("canvas");
        if (c) {
          c.width = f.w; c.height = f.h;
          const cctx = c.getContext("2d");
          cctx.imageSmoothingEnabled = false;
          const px = base64ToPixels(f.pixelsB64, f.w * f.h);
          const img = cctx.createImageData(f.w, f.h);
          for (let p = 0; p < px.length; p++) {
            if (px[p] === TRANSPARENT) {
              img.data[p * 4 + 3] = 0;
            } else {
              const [r, g, b] = rgb565ToRgb888(px[p]);
              img.data[p * 4] = r;
              img.data[p * 4 + 1] = g;
              img.data[p * 4 + 2] = b;
              img.data[p * 4 + 3] = 255;
            }
          }
          cctx.putImageData(img, 0, 0);
        }
      }
    });
  }

  // Observer pour ajouter le bouton EDIT après chaque slice
  function watchAssetLab() {
    const grid = document.getElementById("framesGrid");
    if (!grid) return;
    const mo = new MutationObserver(() => refreshAssetLabFrameCards());
    mo.observe(grid, { childList: true });
  }

  // ---------------------------------------------------------------------------
  // BUILD UI OVERLAY
  // ---------------------------------------------------------------------------
  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "spriteEditorOverlay";
    overlay.innerHTML = `
      <div class="spe-titlebar">
        <button class="spe-nav" id="spePrev" title="Frame précédente (Alt+←)">◀</button>
        <span id="speFrameNav" class="spe-frame-nav">—</span>
        <button class="spe-nav" id="speNext" title="Frame suivante (Alt+→)">▶</button>
        <span class="spe-title" id="speTitle">—</span>
        <span class="spe-size" id="speSize">—</span>
        <button id="speCloseBtn" class="spe-close">FERMER (ESC)</button>
      </div>
      <div class="spe-body">
        <aside class="spe-left">
          <h3>Outils</h3>
          <div class="spe-tools" id="speTools">
            <button class="spe-tool active" data-tool="pencil" title="Crayon (P)">✎</button>
            <button class="spe-tool" data-tool="eraser" title="Gomme (E)">⌫</button>
            <button class="spe-tool" data-tool="picker" title="Pipette (I)">⊙</button>
            <button class="spe-tool" data-tool="fill" title="Remplir (G)">▣</button>
            <button class="spe-tool" data-tool="line" title="Ligne (L)">╱</button>
            <button class="spe-tool" data-tool="rect" title="Rectangle (R)">▢</button>
            <button class="spe-tool" data-tool="ellipse" title="Ellipse (O)">◯</button>
            <button class="spe-tool" data-tool="select" title="Sélection (S)">⤒</button>
          </div>
          <h3>Pinceau</h3>
          <label>Taille (1-4)</label>
          <input id="speBrushSize" type="number" min="1" max="4" value="1" />
          <label class="spe-check"><input id="spePixelPerfect" type="checkbox" checked> Pixel-perfect (crayon)</label>
          <label class="spe-check"><input id="speRectFill" type="checkbox"> Rectangle rempli</label>
          <label class="spe-check"><input id="speEllipseFill" type="checkbox"> Ellipse remplie</label>
          <h3>Symétrie</h3>
          <div class="spe-mirror" id="speMirror">
            <button class="spe-mirror-btn active" data-mirror="none">Off</button>
            <button class="spe-mirror-btn" data-mirror="h">H</button>
            <button class="spe-mirror-btn" data-mirror="v">V</button>
            <button class="spe-mirror-btn" data-mirror="quad">Quad</button>
          </div>
          <h3>Affichage</h3>
          <label class="spe-check"><input id="speGrid" type="checkbox" checked> Grille 8×8</label>
          <label class="spe-check"><input id="spePixelGrid" type="checkbox" checked> Pixel grid (zoom)</label>
          <label class="spe-check"><input id="speOnion" type="checkbox"> Onion skin</label>
          <h3>Frame</h3>
          <button class="spe-btn" id="speFlipH">Flip H</button>
          <button class="spe-btn" id="speFlipV">Flip V</button>
          <button class="spe-btn" id="speRotate">Rotate 90°</button>
          <button class="spe-btn" id="speClear">Clear</button>
          <button class="spe-btn" id="speResize">Resize...</button>
          <button class="spe-btn" id="speCopy">Copy (Ctrl+C)</button>
          <button class="spe-btn" id="spePaste">Paste (Ctrl+V)</button>
        </aside>
        <main class="spe-center">
          <canvas id="speCanvas" tabindex="0"></canvas>
          <div class="spe-bottom">
            <div class="spe-preview-box">
              <h4>Preview ×1 / ×2 / ×4</h4>
              <canvas id="spePreview" width="320" height="80"></canvas>
            </div>
            <div class="spe-stats-box">
              <h4>Stats</h4>
              <p><span>Couleurs uniques :</span><strong id="speStatsColors">0</strong></p>
              <p><span>Taille :</span><strong id="speStatsBytes">0 o</strong></p>
              <p><span>Mémoire :</span><strong id="speStatsPct">0%</strong></p>
              <p class="spe-hint">↑↓ ramp · X swap colors · [ ] brush · Espace+drag = pan · Molette = zoom</p>
            </div>
          </div>
        </main>
        <aside class="spe-right">
          <h3>Couleurs actives</h3>
          <div class="spe-colors-row">
            <div id="spePrimary" class="spe-color-indicator" title="Primaire (clic gauche)"></div>
            <div id="speSecondary" class="spe-color-indicator" title="Secondaire (clic droit)"></div>
          </div>
          <h3>Palette DB32 RGB565</h3>
          <div class="spe-palette" id="spePalette"></div>
          <h3>Color Ramps</h3>
          <div class="spe-ramps" id="speRamps"></div>
          <h3>Custom (RGB565)</h3>
          <div class="spe-palette" id="speCustomPalette"></div>
          <h3>Historique</h3>
          <div class="spe-history" id="speHistory"></div>
        </aside>
      </div>
    `;
    document.body.appendChild(overlay);

    canvas = $$("speCanvas");
    ctx = canvas.getContext("2d");
    prevCanvas = $$("spePreview");
    prevCtx = prevCanvas.getContext("2d");
    titleEl = $$("speTitle");
    sizeEl = $$("speSize");
    statsColorsEl = $$("speStatsColors");
    statsBytesEl = $$("speStatsBytes");
    statsPctEl = $$("speStatsPct");
    paletteEl = $$("spePalette");
    customPaletteEl = $$("speCustomPalette");
    rampsEl = $$("speRamps");
    primaryEl = $$("spePrimary");
    secondaryEl = $$("speSecondary");
    toolsEl = $$("speTools");
    brushSizeEl = $$("speBrushSize");
    mirrorEl = $$("speMirror");
    pixelPerfectEl = $$("spePixelPerfect");
    rectFillEl = $$("speRectFill");
    ellipseFillEl = $$("speEllipseFill");
    historyListEl = $$("speHistory");
    frameNavLabel = $$("speFrameNav");

    // size to viewport
    function fitCanvasSize() {
      canvas.width = canvas.parentElement.clientWidth - 4;
      canvas.height = canvas.parentElement.clientHeight - 100;
      fitView();
      render();
    }
    window.addEventListener("resize", () => { if (state.open) fitCanvasSize(); });
    setTimeout(fitCanvasSize, 50);

    // events
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("wheel", onWheel, { passive: false });

    toolsEl.querySelectorAll(".spe-tool").forEach(b => {
      b.onclick = () => setTool(b.dataset.tool);
    });
    mirrorEl.querySelectorAll(".spe-mirror-btn").forEach(b => {
      b.onclick = () => setMirror(b.dataset.mirror);
    });

    brushSizeEl.oninput = () => state.brushSize = Math.max(1, Math.min(4, Number(brushSizeEl.value) || 1));
    pixelPerfectEl.onchange = () => state.pixelPerfect = pixelPerfectEl.checked;
    rectFillEl.onchange = () => state.rectFill = rectFillEl.checked;
    ellipseFillEl.onchange = () => state.ellipseFill = ellipseFillEl.checked;
    $$("speGrid").onchange = () => { state.showGrid = $$("speGrid").checked; render(); };
    $$("spePixelGrid").onchange = () => { state.showPixelGrid = $$("spePixelGrid").checked; render(); };
    $$("speOnion").onchange = () => { state.onionSkin = $$("speOnion").checked; render(); };

    $$("speFlipH").onclick = flipH;
    $$("speFlipV").onclick = flipV;
    $$("speRotate").onclick = rotate90;
    $$("speClear").onclick = clearFrame;
    $$("speResize").onclick = () => {
      const v = prompt("Nouvelle taille (ex: 32x32) :", state.w + "x" + state.h);
      if (!v) return;
      const m = v.match(/^(\d+)\s*[x×]\s*(\d+)$/);
      if (!m) return alert("Format attendu: 16x16");
      const nw = Math.max(1, Math.min(128, parseInt(m[1])));
      const nh = Math.max(1, Math.min(128, parseInt(m[2])));
      resizeFrame(nw, nh);
    };
    $$("speCopy").onclick = copyFrameToClipboard;
    $$("spePaste").onclick = pasteFromClipboard;
    $$("speCloseBtn").onclick = closeOverlay;
    $$("spePrev").onclick = prevFrame;
    $$("speNext").onclick = nextFrame;

    renderPalette();
    renderCustomPalette();
    updateColorIndicators();

    // global keyboard
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // ---------------------------------------------------------------------------
  // EXPORT API
  // ---------------------------------------------------------------------------
  window.LumaSpriteEditor = {
    open: openOverlay,
    close: closeOverlay,
    rgb565ToHex: rgb565ToHex,
    base64ToPixels: base64ToPixels,
    pixelsToBase64: pixelsToBase64,
    loadFramePixels: loadFramePixels,
    TRANSPARENT: TRANSPARENT,
    refreshAssetLabFrameCards: refreshAssetLabFrameCards
  };

  // Branche l'observer dès que le DOM est prêt
  document.addEventListener("DOMContentLoaded", watchAssetLab);
  // au cas où ça arrive après le load
  setTimeout(watchAssetLab, 500);
})();
