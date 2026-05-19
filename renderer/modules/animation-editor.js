/**
 * ANIMATION EDITOR
 *
 * Une animation = liste ordonnée d'indices de frames + vitesse + loop.
 * Pas de duplication pixel : on stocke uniquement des références.
 *
 * Modèle :
 *   {
 *     id: 0,
 *     name: "player_walk_down",
 *     frameIds: [0, 1, 2, 3],
 *     speedMs: 120,
 *     loop: true
 *   }
 *
 * Sauvegarde : <projet>/assets/sprites/animations.json
 *
 * Drag & drop :
 *   - depuis le pool de frames (panneau droite) vers la timeline
 *   - réorganisation à l'intérieur de la timeline
 *   - drop n'importe où dans la timeline = append
 *   - drop sur un slot existant = insert avant ce slot
 */

import { showScreen } from "./navigation.js";
import { paintFrameNative, paintFrameZoomed, fitZoom } from "./frame-renderer.js";
import { estimateAnimationMemory, estimateAnimationsMemory, formatBytes } from "./memory.js";

const state = {
  animations:   [],
  selectedId:   null,
  nextId:       0,
  getFrames:    null,    /* () => Frame[] */
  getSource:    null,    /* () => HTMLImageElement|null */
  /* Lecture */
  playing:      false,
  rafId:        null,
  playIndex:    0,
  lastFrameTs:  0
};

let listEl, nameInput, speedInput, speedValueEl, loopCheckbox;
let timelineEl, framePoolEl, previewCanvas, previewCtx;
let playBtn, pauseBtn, stopBtn, deleteAnimBtn, animMemEl, totalMemEl;
let initialized = false;

export function initAnimationEditor({ getFrames, getSourceImage }) {
  if (initialized) return;
  initialized = true;
  state.getFrames = getFrames;
  state.getSource = getSourceImage;

  listEl         = document.getElementById("animList");
  nameInput      = document.getElementById("animName");
  speedInput     = document.getElementById("animSpeed");
  speedValueEl   = document.getElementById("animSpeedValue");
  loopCheckbox   = document.getElementById("animLoop");
  timelineEl     = document.getElementById("animTimeline");
  framePoolEl    = document.getElementById("animFramePool");
  previewCanvas  = document.getElementById("animPreview");
  previewCtx     = previewCanvas.getContext("2d");
  playBtn        = document.getElementById("animPlay");
  pauseBtn       = document.getElementById("animPause");
  stopBtn        = document.getElementById("animStop");
  deleteAnimBtn  = document.getElementById("animDelete");
  animMemEl      = document.getElementById("animMem");
  totalMemEl     = document.getElementById("animsTotalMem");

  /* Header */
  document.getElementById("animNew").addEventListener("click", createAnimation);
  document.getElementById("animSave").addEventListener("click", save);
  document.getElementById("animClose").addEventListener("click", () => {
    stop();
    showScreen("assetLab");
  });
  document.getElementById("navAssetFromAnim").addEventListener("click", () => {
    stop();
    showScreen("assetLab");
  });

  /* Détails */
  nameInput.addEventListener("input", () => {
    const a = current(); if (!a) return;
    a.name = nameInput.value;
    renderList();
  });
  speedInput.addEventListener("input", () => {
    const a = current(); if (!a) return;
    a.speedMs = Number(speedInput.value);
    speedValueEl.textContent = `${a.speedMs} ms`;
  });
  loopCheckbox.addEventListener("change", () => {
    const a = current(); if (!a) return;
    a.loop = loopCheckbox.checked;
  });

  /* Playback */
  playBtn.addEventListener("click", play);
  pauseBtn.addEventListener("click", pause);
  stopBtn.addEventListener("click", stop);
  deleteAnimBtn.addEventListener("click", deleteCurrent);

  /* Timeline est un drop target global */
  timelineEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    timelineEl.classList.add("drag-over");
  });
  timelineEl.addEventListener("dragleave", () => {
    timelineEl.classList.remove("drag-over");
  });
  timelineEl.addEventListener("drop", (e) => {
    e.preventDefault();
    timelineEl.classList.remove("drag-over");
    handleDrop(e, /*targetSlotIndex=*/ -1);
  });
}

/** À appeler à chaque ouverture de l'écran (pour rafraîchir le pool). */
export function openAnimationEditor() {
  if (state.animations.length === 0) createAnimation();
  refreshPool();
  renderList();
  renderDetails();
  showScreen("animationEditor");
}

/* ---------------------- CRUD animations ---------------------- */

function createAnimation() {
  const id = state.nextId++;
  const anim = {
    id,
    name: `anim_${String(id).padStart(3, "0")}`,
    frameIds: [],
    speedMs: 120,
    loop: true
  };
  state.animations.push(anim);
  state.selectedId = id;
  renderList();
  renderDetails();
}

function deleteCurrent() {
  const a = current(); if (!a) return;
  if (!confirm(`Supprimer "${a.name}" ?`)) return;
  state.animations = state.animations.filter((x) => x.id !== a.id);
  state.selectedId = state.animations[0]?.id ?? null;
  stop();
  renderList();
  renderDetails();
}

function current() {
  return state.animations.find((a) => a.id === state.selectedId) || null;
}

/* ---------------------- Liste d'animations ---------------------- */

function renderList() {
  listEl.innerHTML = "";
  for (const a of state.animations) {
    const row = document.createElement("button");
    row.className = "anim-row" + (a.id === state.selectedId ? " selected" : "");
    row.innerHTML = `
      <span class="anim-row-name">${escapeHtml(a.name)}</span>
      <span class="anim-row-meta">${a.frameIds.length}f · ${a.speedMs}ms${a.loop ? " · loop" : ""}</span>`;
    row.addEventListener("click", () => {
      stop();
      state.selectedId = a.id;
      renderList();
      renderDetails();
    });
    listEl.appendChild(row);
  }
  totalMemEl.textContent = formatBytes(estimateAnimationsMemory(state.animations));
}

/* ---------------------- Détails animation courante ---------------------- */

function renderDetails() {
  const a = current();
  const hasA = a !== null;

  /* État des contrôles */
  [nameInput, speedInput, loopCheckbox, playBtn, pauseBtn, stopBtn, deleteAnimBtn]
    .forEach((el) => { if (el) el.disabled = !hasA; });

  if (!hasA) {
    nameInput.value = "";
    speedValueEl.textContent = "—";
    timelineEl.innerHTML = "<div class='timeline-empty'>Crée une animation</div>";
    animMemEl.textContent = "0 o";
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    return;
  }

  nameInput.value = a.name;
  speedInput.value = a.speedMs;
  speedValueEl.textContent = `${a.speedMs} ms`;
  loopCheckbox.checked = a.loop;
  animMemEl.textContent = formatBytes(estimateAnimationMemory(a));
  renderTimeline();
  refreshPool();
  renderPreviewFrame(0);
}

/* ---------------------- Timeline ---------------------- */

function renderTimeline() {
  const a = current();
  timelineEl.innerHTML = "";
  if (!a || a.frameIds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "timeline-empty";
    empty.textContent = "Drag des frames depuis la droite →";
    timelineEl.appendChild(empty);
    return;
  }
  const frames = state.getFrames();
  const source = state.getSource();

  a.frameIds.forEach((fid, slotIndex) => {
    const f = frames.find((x) => x.id === fid);
    const slot = document.createElement("div");
    slot.className = "timeline-slot";
    slot.draggable = true;
    slot.dataset.slotIndex = String(slotIndex);

    const canvas = document.createElement("canvas");
    if (f) paintFrameNative(f, source, canvas);
    slot.appendChild(canvas);

    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = `#${slotIndex} · ${f ? f.name : "??"}`;
    slot.appendChild(label);

    const close = document.createElement("button");
    close.className = "slot-close";
    close.textContent = "×";
    close.title = "Retirer de la timeline";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      a.frameIds.splice(slotIndex, 1);
      renderTimeline();
      renderList();
      refreshPool();
      animMemEl.textContent = formatBytes(estimateAnimationMemory(a));
    });
    slot.appendChild(close);

    /* Clic = afficher dans la preview */
    slot.addEventListener("click", () => renderPreviewFrame(slotIndex));

    /* Drag source : déplacer ce slot */
    slot.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-luma-slot", String(slotIndex));
      e.dataTransfer.effectAllowed = "move";
      slot.classList.add("dragging");
    });
    slot.addEventListener("dragend", () => slot.classList.remove("dragging"));

    /* Drop target : insérer avant ce slot */
    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.add("drop-target");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drop-target"));
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove("drop-target");
      handleDrop(e, slotIndex);
    });

    timelineEl.appendChild(slot);
  });
}

function handleDrop(e, targetSlotIndex) {
  const a = current(); if (!a) return;
  const slotFromStr = e.dataTransfer.getData("application/x-luma-slot");
  const frameFromStr = e.dataTransfer.getData("application/x-luma-frame");

  if (slotFromStr !== "") {
    /* Réorganisation interne */
    const from = parseInt(slotFromStr, 10);
    let to = targetSlotIndex < 0 ? a.frameIds.length : targetSlotIndex;
    if (from === to || from === to - 1) return;
    const [item] = a.frameIds.splice(from, 1);
    if (to > from) to--;
    a.frameIds.splice(to, 0, item);
  } else if (frameFromStr !== "") {
    /* Ajout depuis le pool */
    const fid = parseInt(frameFromStr, 10);
    if (!Number.isFinite(fid)) return;
    const insertAt = targetSlotIndex < 0 ? a.frameIds.length : targetSlotIndex;
    a.frameIds.splice(insertAt, 0, fid);
  } else {
    return;
  }

  renderTimeline();
  renderList();
  refreshPool();
  animMemEl.textContent = formatBytes(estimateAnimationMemory(a));
  renderPreviewFrame(0);
}

/* ---------------------- Pool de frames disponibles ---------------------- */

function refreshPool() {
  const frames = state.getFrames();
  const source = state.getSource();
  const a = current();
  const usageMap = new Map();
  if (a) {
    for (const fid of a.frameIds) usageMap.set(fid, (usageMap.get(fid) || 0) + 1);
  }

  framePoolEl.innerHTML = "";
  if (!frames.length) {
    const msg = document.createElement("div");
    msg.className = "pool-empty";
    msg.textContent = "Aucune frame. Retourne dans Asset Lab pour en découper.";
    framePoolEl.appendChild(msg);
    return;
  }

  for (const f of frames) {
    const card = document.createElement("div");
    card.className = "pool-card";
    card.draggable = true;
    card.dataset.frameId = String(f.id);

    const canvas = document.createElement("canvas");
    paintFrameNative(f, source, canvas);
    card.appendChild(canvas);

    const label = document.createElement("span");
    label.className = "pool-label";
    label.textContent = f.name;
    card.appendChild(label);

    const used = usageMap.get(f.id) || 0;
    if (used > 0) {
      const badge = document.createElement("span");
      badge.className = "pool-badge";
      badge.textContent = `×${used}`;
      card.appendChild(badge);
    }

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-luma-frame", String(f.id));
      e.dataTransfer.effectAllowed = "copy";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    /* Double-clic = append rapide */
    card.addEventListener("dblclick", () => {
      const a2 = current(); if (!a2) return;
      a2.frameIds.push(f.id);
      renderTimeline();
      renderList();
      refreshPool();
      animMemEl.textContent = formatBytes(estimateAnimationMemory(a2));
    });

    framePoolEl.appendChild(card);
  }
}

/* ---------------------- Preview / playback ---------------------- */

function renderPreviewFrame(slotIndex) {
  const a = current(); if (!a || a.frameIds.length === 0) {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    return;
  }
  const frames = state.getFrames();
  const source = state.getSource();
  const idx = Math.max(0, Math.min(slotIndex, a.frameIds.length - 1));
  state.playIndex = idx;
  const f = frames.find((x) => x.id === a.frameIds[idx]);
  if (!f) return;
  const maxDim = 320;
  const zoom = fitZoom(f, maxDim);
  paintFrameZoomed(f, source, previewCanvas, f.w * zoom, f.h * zoom);
}

function play() {
  const a = current(); if (!a || a.frameIds.length === 0) return;
  if (state.playing) return;
  state.playing = true;
  state.lastFrameTs = performance.now();
  state.rafId = requestAnimationFrame(tick);
}

function pause() {
  state.playing = false;
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
}

function stop() {
  pause();
  state.playIndex = 0;
  renderPreviewFrame(0);
}

function tick(ts) {
  if (!state.playing) return;
  const a = current(); if (!a) { pause(); return; }
  const elapsed = ts - state.lastFrameTs;
  if (elapsed >= a.speedMs) {
    state.playIndex++;
    if (state.playIndex >= a.frameIds.length) {
      if (a.loop) {
        state.playIndex = 0;
      } else {
        state.playIndex = a.frameIds.length - 1;
        renderPreviewFrame(state.playIndex);
        pause();
        return;
      }
    }
    renderPreviewFrame(state.playIndex);
    state.lastFrameTs = ts;
  }
  state.rafId = requestAnimationFrame(tick);
}

/* ---------------------- Sauvegarde ---------------------- */

async function save() {
  /* Garde uniquement les champs sérialisables (pas state interne) */
  const payload = state.animations.map((a) => ({
    id: a.id,
    name: a.name,
    frameIds: a.frameIds.slice(),
    speedMs: a.speedMs,
    loop: a.loop
  }));
  const result = await window.lumaAPI.saveAnimations(payload);
  if (!result.ok) { alert(result.error || "Erreur sauvegarde animations"); return; }
  alert(`Animations sauvegardées : ${result.path}`);
}

/* ---------------------- Utils ---------------------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
