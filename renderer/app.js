let selectedSize = "550ko";
let projectLimitBytes = 550 * 1024;
let importedImage = null;
let frames = [];
let animations = [];
let objects = [];
let events = [];
let nextObjectId = 1;
let nextEventId = 1;

// V1.4 — Listes de référence pour le constructeur d'objets
const OBJECT_TYPES = [
  { id: "PLAYER",   label: "🧍 Player",   color: "#fff25a" },
  { id: "ENEMY",    label: "👾 Enemy",    color: "#ff5e57" },
  { id: "NPC",      label: "💬 NPC",      color: "#5fffaa" },
  { id: "ITEM",     label: "🎁 Item",     color: "#5bd6ff" },
  { id: "PROJECTILE", label: "⚡ Projectile", color: "#ffaa55" },
  { id: "DECOR",    label: "🌿 Décor",    color: "#aa88ff" },
  { id: "TRIGGER",  label: "🎯 Trigger",  color: "#888888" },
  { id: "DOOR",     label: "🚪 Door",     color: "#cccccc" }
];

const OBJECT_BEHAVIORS = [
  { id: "None",              label: "Aucun (statique)" },
  { id: "PlatformerMovement",label: "🏃 Plateforme (jump+gravity)" },
  { id: "TopDownMovement",   label: "🎮 Top-Down (4 directions)" },
  { id: "FollowPlayer",      label: "👣 Suit le joueur" },
  { id: "Patrol",            label: "↔ Patrouille horizontale" },
  { id: "PatrolVertical",    label: "↕ Patrouille verticale" },
  { id: "Bounce",            label: "🏀 Rebondit" },
  { id: "Spinner",           label: "🔄 Tourne sur place" },
  { id: "Pickup",            label: "💰 Ramassable" },
  { id: "DialogueOnTouch",   label: "💬 Dialogue au contact" },
  { id: "DamageOnTouch",     label: "💥 Inflige des dégâts" },
  { id: "Door",              label: "🚪 Téléporte vers scène" }
];
let music = { name: "theme_01", tempo: 120, tracks: { A: [], B: [] } };
let dialogues = [];
let cutscenes = [];
let triggers = [];
let maps = [];
let scenes = [];
let currentMap = null;
let currentScene = null;
let showCameraFrame = true;
let camera = { x: 0, y: 0, w: 160, h: 128 };
let testPlayer = { x: 32, y: 32, size: 12, active: false };
let currentCutSteps = [];
let audioCtx = null;
let playing = false;

const $ = (id) => document.getElementById(id);

const splash = $("splash");
const projectScreen = $("project");
const studio = $("studio");
const dots = $("dots");
const sourceCanvas = $("sourceCanvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const framesGrid = $("framesGrid");

let dotState = 0;
setInterval(() => {
  dotState = (dotState + 1) % 4;
  dots.textContent = ".".repeat(dotState || 3);
}, 350);

setTimeout(() => {
  splash.classList.remove("active");
  projectScreen.classList.add("active");
}, 1000);

function enterStudio(path, data = null) {
  $("projectPath").textContent = path || "Projet actif";
  projectScreen.classList.remove("active");
  studio.classList.add("active");
  if (data) {
    frames = data.frames || [];
    animations = data.animations || [];
    if (typeof window !== "undefined") window.animations = animations;
    objects = data.objects || [];
    events = data.events || [];
    nextObjectId = Math.max(0, ...objects.map(o => Number(o.id) || 0)) + 1;
    nextEventId = Math.max(0, ...events.map(e => Number(e.id) || 0)) + 1;
    music = Array.isArray(data.music) ? { name: "theme_01", tempo: 120, tracks: { A: [], B: [] } } : (data.music || music);
    dialogues = data.dialogues || [];
    cutscenes = data.cutscenes || [];
    triggers = data.triggers || [];
    maps = data.maps || [];
    scenes = data.scenes || [];
    if (maps.length) currentMap = maps[0];
    if (scenes.length) currentScene = scenes[0];
    renderAll();
  }
  // V1.4 — init des modules d'éditeurs visuels
  setTimeout(() => {
    if (window.LumaLibrary) window.LumaLibrary.init();
    if (window.LumaObjectEditor) window.LumaObjectEditor.init();
  }, 50);
}

document.querySelectorAll(".size-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".size-option").forEach((item) => {
      item.classList.remove("selected");
      const cursor = item.querySelector(".cursor");
      if (cursor) cursor.remove();
    });
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "▶";
    button.prepend(cursor);
    button.classList.add("selected");
    selectedSize = button.dataset.size;
    projectLimitBytes = selectedSize === "180ko" ? 180 * 1024 : selectedSize === "2mo" ? 2 * 1024 * 1024 : 550 * 1024;
  });
});

$("createProject").addEventListener("click", async () => {
  const project = {
    name: $("projectName").value.trim() || "MonProjet",
    editor: $("editorName").value.trim() || "I.E.Games_Studio",
    size: selectedSize
  };
  $("status").textContent = "Création du projet...";
  const result = await window.lumaAPI.createProject(project);
  if (result.canceled) return $("status").textContent = "Création annulée.";
  if (!result.ok) return $("status").textContent = result.error || "Erreur.";
  enterStudio(result.path);
});

$("openProject").addEventListener("click", async () => {
  const result = await window.lumaAPI.openProject();
  if (result.canceled) return;
  if (!result.ok) return alert(result.error || "Erreur ouverture projet.");
  enterStudio(result.path, result.projectData);
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.panel).classList.add("active");
    $("workspaceTitle").textContent = btn.textContent;
  });
});

$("presetSize").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value !== "custom") {
    $("frameW").value = value;
    $("frameH").value = value;
  }
});

$("importImage").addEventListener("click", async () => {
  const result = await window.lumaAPI.importImage();
  if (result.canceled) return;
  if (!result.ok) return alert(result.error || "Erreur import image.");

  $("imageInfo").textContent = result.isGif
    ? `GIF importé : ${result.name}. Découpage GIF complet prévu dans une future version.`
    : `Image importée : ${result.name}`;

  const img = new Image();
  img.onload = () => {
    importedImage = img;
    drawGridPreview();
  };
  img.src = result.dataUrl;
});

$("sliceImage").addEventListener("click", () => {
  if (!importedImage) return alert("Importe d'abord une image.");
  const w = Math.max(1, Number($("frameW").value));
  const h = Math.max(1, Number($("frameH").value));
  const base = $("baseName").value.trim() || "sprite";
  const folder = $("folderName").value;
  const usage = $("usageType").value;

  frames = [];
  framesGrid.innerHTML = "";
  let index = 0;
  for (let y = 0; y + h <= importedImage.height; y += h) {
    for (let x = 0; x + w <= importedImage.width; x += w) {
      const frame = { id: index, name: `${base}_${String(index).padStart(3, "0")}`, folder, usage, x, y, w, h, rgb565Bytes: w * h * 2 };
      frames.push(frame);
      createFrameCard(frame);
      index++;
    }
  }
  updateMemory();
  drawGridPreview();
});

$("saveFrames").addEventListener("click", async () => {
  if (!frames.length) return alert("Aucune frame à sauver.");
  const result = await window.lumaAPI.saveFrames(frames);
  if (!result.ok) return alert(result.error || "Erreur sauvegarde frames.");
  alert(`Frames sauvegardées.`);
});

function drawGridPreview() {
  if (!importedImage) return;
  const w = Math.max(1, Number($("frameW").value));
  const h = Math.max(1, Number($("frameH").value));
  sourceCanvas.width = importedImage.width;
  sourceCanvas.height = importedImage.height;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(importedImage, 0, 0);
  sourceCtx.strokeStyle = "#5f7cff";
  sourceCtx.lineWidth = 1;
  for (let x = 0; x <= importedImage.width; x += w) {
    sourceCtx.beginPath(); sourceCtx.moveTo(x + 0.5, 0); sourceCtx.lineTo(x + 0.5, importedImage.height); sourceCtx.stroke();
  }
  for (let y = 0; y <= importedImage.height; y += h) {
    sourceCtx.beginPath(); sourceCtx.moveTo(0, y + 0.5); sourceCtx.lineTo(importedImage.width, y + 0.5); sourceCtx.stroke();
  }
}

function createFrameCard(frame) {
  const card = document.createElement("div");
  card.className = "frame-card";
  const canvas = document.createElement("canvas");
  canvas.width = frame.w; canvas.height = frame.h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(importedImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  const nameInput = document.createElement("input");
  nameInput.value = frame.name;
  nameInput.addEventListener("input", () => frame.name = nameInput.value);
  card.appendChild(canvas); card.appendChild(nameInput);
  framesGrid.appendChild(card);
}

function updateMemory() {
  const totalBytes = frames.reduce((sum, f) => sum + f.rgb565Bytes, 0);
  const percent = Math.min(100, Math.round((totalBytes / projectLimitBytes) * 100));
  $("memFrames").textContent = String(frames.length);
  $("memRaw").textContent = formatBytes(totalBytes);
  $("frameCount").textContent = `${frames.length} frame${frames.length > 1 ? "s" : ""}`;
  $("memBar").style.width = `${percent}%`;
  $("memBar").style.background = percent > 90 ? "#ff5e57" : percent > 65 ? "#fff25a" : "#4dff77";
  updateCapacityBar();
}

// V1.3 — Capacity bar globale dans le header
function updateCapacityBar() {
  const txt = $("capacityText");
  const fill = $("capacityBarFill");
  const breakdown = $("capacityBreakdown");
  if (!txt || !fill) return;

  let sprites = 0;
  for (const f of frames) sprites += f.rgb565Bytes || 0;
  let audio = 0;
  if (window.LumaMusicEditor && typeof music !== "undefined") {
    audio = window.LumaMusicEditor.getByteSize();
  }
  let maps_bytes = 0;
  if (typeof maps !== "undefined") {
    for (const m of maps) {
      const tiles = (m.width || 0) * (m.height || 0);
      maps_bytes += tiles * 3; // 3 layers d'octets
    }
  }
  let code = 0;
  if (typeof objects !== "undefined") code += objects.length * 64;
  if (typeof events !== "undefined") code += events.length * 96;
  if (typeof dialogues !== "undefined") code += dialogues.reduce((a, d) => a + (d.text || "").length + 64, 0);
  if (typeof animations !== "undefined") code += animations.reduce((a, an) => a + (an.slots ? an.slots.length * 16 : 0) + 64, 0);

  const total = sprites + audio + maps_bytes + code;
  const pct = Math.max(0, Math.min(100, (total / projectLimitBytes) * 100));
  txt.textContent = `${formatBytes(total)} / ${formatBytes(projectLimitBytes)} (${Math.round(pct)}%)`;
  fill.style.width = pct + "%";
  if (pct > 95) fill.style.background = "linear-gradient(90deg, #ff5e57, #ff8a80)";
  else if (pct > 80) fill.style.background = "linear-gradient(90deg, #fff25a, #ffd700)";
  else fill.style.background = "linear-gradient(90deg, #4dff77, #5fffaa)";

  if (breakdown) {
    breakdown.textContent = `🎨 ${formatBytes(sprites)} · 🎵 ${formatBytes(audio)} · 🗺 ${formatBytes(maps_bytes)} · ⚙ ${formatBytes(code)}`;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

// V1.4 : tout le UI Object Editor + Events est géré par object-editor.js.
// L'ancien handler addEvent basé sur des inputs texte a été retiré (l'élément
// #addEvent et ses champs associés n'existent plus dans le DOM).

// V0.6 Music
// V1.3 : tout le music UI est géré par music-editor.js (piano roll).
// L'ancien éditeur basé sur boutons addNote/playMusic a été retiré.

// V1.0 Narrative
$("importPortrait").addEventListener("click", async () => {
  const result = await window.lumaAPI.importPortrait();
  if (result.canceled) return;
  if (!result.ok) return alert(result.error || "Erreur import portrait.");
  $("dialogPortrait").value = result.name;
  $("portraitPreview").style.backgroundImage = `url(${result.dataUrl})`;
  $("portraitPreview").style.backgroundSize = "cover";
  $("portraitPreview").textContent = "";
});

$("addDialogue").addEventListener("click", () => {
  const d = {
    id: $("dialogId").value || `dialog_${Date.now()}`,
    speaker: $("dialogSpeaker").value || "NPC",
    portrait: $("dialogPortrait").value || "",
    text: $("dialogText").value || "...",
    next: $("dialogNext").value || "",
    speed: Number($("dialogSpeed").value) || 30
  };
  dialogues.push(d);
  $("previewSpeaker").textContent = d.speaker;
  $("previewText").textContent = d.text;
  renderDialogues();
});

$("addCutStep").addEventListener("click", () => {
  currentCutSteps.push({
    time: Number($("cutTime").value) || 0,
    action: $("cutAction").value,
    target: $("cutTarget").value,
    value: $("cutValue").value
  });
  renderCutSteps();
});

$("addCutscene").addEventListener("click", () => {
  cutscenes.push({
    id: $("cutsceneId").value || `cutscene_${Date.now()}`,
    steps: [...currentCutSteps]
  });
  currentCutSteps = [];
  renderCutSteps();
  renderCutscenes();
});

$("addTrigger").addEventListener("click", () => {
  triggers.push({
    id: $("triggerId").value || `trigger_${Date.now()}`,
    condition: $("triggerCondition").value,
    action: $("triggerAction").value,
    target: $("triggerTarget").value
  });
  renderTriggers();
});

$("saveAll").addEventListener("click", async () => {
  // Sync les anims depuis le module si nécessaire
  if (window.LumaAnimEditor) animations = window.LumaAnimEditor.getAnimations() || animations;
  // V1.3 : reconstruit music.tracks depuis music.grid pour le moteur ESP32
  if (window.LumaMusicEditor) window.LumaMusicEditor.rebuildTracksFromGrid();
  await window.lumaAPI.saveFrames(frames);
  if (window.lumaAPI.saveAnimations) await window.lumaAPI.saveAnimations(animations);
  await window.lumaAPI.saveLogic({ objects, events, variables: [] });
  await window.lumaAPI.saveMusic(music);
  const r1 = await window.lumaAPI.saveNarrative({ dialogues, cutscenes, triggers });
  let r2 = { ok: true };
  if (currentMap && currentScene) {
    r2 = await window.lumaAPI.saveSceneData({ maps, scenes });
  }
  if (!r1.ok || !r2.ok) {
    alert(r1.error || r2.error || "Erreur sauvegarde.");
  } else {
    alert("Projet sauvegardé.");
  }
});

function renderList(id, items, map) {
  const el = $(id);
  if (!el) return;  // V1.4.1 — robuste : on ignore si l'élément a été retiré du DOM
  el.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "data-item";
    div.innerHTML = map(item);
    el.appendChild(div);
  });
}

function renderObjects() {
  // V1.4 : délégué à object-editor.js
  if (window.LumaObjectEditor) window.LumaObjectEditor.refresh();
}
function renderEvents() {
  // V1.4 : eventsList retiré du DOM, désormais affiché dans l'object-editor
  if (window.LumaObjectEditor) window.LumaObjectEditor.refresh();
}
// V1.3 : music rendering géré par music-editor.js
function renderDialogues() { renderList("dialoguesList", dialogues, d => `<strong>${d.id}</strong><br>${d.speaker}: ${d.text}<br>next: ${d.next || "-"}`); }
function renderCutSteps() { renderList("cutSteps", currentCutSteps, s => `<strong>${s.time}s</strong> ${s.action}<br>${s.target} ${s.value}`); }
function renderCutscenes() { renderList("cutscenesList", cutscenes, c => `<strong>${c.id}</strong><br>${c.steps.length} step(s)`); }
function renderTriggers() { renderList("triggersList", triggers, t => `<strong>${t.id}</strong><br>IF ${t.condition}<br>THEN ${t.action} → ${t.target}`); }
function renderAll() {
  renderObjects(); renderEvents(); renderDialogues(); renderCutscenes(); renderTriggers(); renderSceneEditor();
  if (window.LumaAnimEditor) {
    window.animations = animations;
    window.LumaAnimEditor.setAnimations(animations);
  }
  if (window.LumaMusicEditor) window.LumaMusicEditor.refresh();
  if (window.LumaLibrary) window.LumaLibrary.refresh();
  updateCapacityBar();
}



// V1.0 MAP / SCENE EDITOR
const mapCanvas = $("mapCanvas");
const mapCtx = mapCanvas.getContext("2d");
const lumaPreviewCanvas = $("lumaPreviewCanvas");
const lumaCtx = lumaPreviewCanvas.getContext("2d");

lumaPreviewCanvas.width = 160;
lumaPreviewCanvas.height = 128;

function createEmptyLayer(w, h, value = 0) {
  return new Array(w * h).fill(value);
}

function initSceneFromInputs() {
  const w = Math.max(10, Number($("mapW").value) || 20);
  const h = Math.max(8, Number($("mapH").value) || 15);
  const tileSize = Math.max(8, Number($("mapTileSize").value) || 16);
  const mapId = $("mapId").value || "map_001";

  currentMap = {
    id: mapId,
    width: w,
    height: h,
    tileSize,
    layers: {
      floor: createEmptyLayer(w, h, 0),
      decor: createEmptyLayer(w, h, 0),
      collision: createEmptyLayer(w, h, 0)
    }
  };

  currentScene = {
    id: $("sceneId").value || "scene_001",
    name: $("sceneName").value || "Scene 001",
    mapId,
    music: $("sceneMusic").value || "",
    cameraMode: $("cameraMode").value,
    playerSpawn: { x: 32, y: 32 },
    objects: [],
    triggers: []
  };

  maps = [currentMap];
  scenes = [currentScene];

  camera.x = 0;
  camera.y = 0;
  testPlayer.x = currentScene.playerSpawn.x;
  testPlayer.y = currentScene.playerSpawn.y;

  renderSceneEditor();
}

$("createScene").addEventListener("click", initSceneFromInputs);

$("saveScene").addEventListener("click", async () => {
  if (!currentMap || !currentScene) return alert("Crée une scène d'abord.");
  const result = await window.lumaAPI.saveSceneData({ maps, scenes });
  alert(result.ok ? "Scène sauvegardée + exportée." : result.error || "Erreur export scène.");
});

$("toggleCamera").addEventListener("click", () => {
  showCameraFrame = !showCameraFrame;
  renderSceneEditor();
});

$("centerCamera").addEventListener("click", () => {
  if (!currentScene || !currentMap) return;
  const mapPxW = currentMap.width * currentMap.tileSize;
  const mapPxH = currentMap.height * currentMap.tileSize;
  const maxX = Math.max(0, mapPxW - camera.w);
  const maxY = Math.max(0, mapPxH - camera.h);
  camera.x = Math.max(0, Math.min(maxX, currentScene.playerSpawn.x - camera.w / 2));
  camera.y = Math.max(0, Math.min(maxY, currentScene.playerSpawn.y - camera.h / 2));
  renderSceneEditor();
});

$("playScenePreview").addEventListener("click", () => {
  testPlayer.active = !testPlayer.active;
  if (testPlayer.active && currentScene) {
    testPlayer.x = currentScene.playerSpawn.x;
    testPlayer.y = currentScene.playerSpawn.y;
    centerCameraOnPlayer();
  }
  renderSceneEditor();
});

// V1.4 — Drag & drop d'objets depuis la bibliothèque vers la map
mapCanvas.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("application/x-luma-object")
   || e.dataTransfer.types.includes("application/x-luma-frame")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    mapCanvas.classList.add("drop-target");
  }
});

mapCanvas.addEventListener("dragleave", () => {
  mapCanvas.classList.remove("drop-target");
});

mapCanvas.addEventListener("drop", (event) => {
  event.preventDefault();
  mapCanvas.classList.remove("drop-target");
  if (!currentMap || !currentScene) return;

  const rect = mapCanvas.getBoundingClientRect();
  const scaleX = mapCanvas.width / rect.width;
  const scaleY = mapCanvas.height / rect.height;
  const px = Math.floor((event.clientX - rect.left) * scaleX);
  const py = Math.floor((event.clientY - rect.top) * scaleY);
  const tileSize = currentMap.tileSize;
  const tx = Math.floor(px / tileSize);
  const ty = Math.floor(py / tileSize);
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return;

  const objId = event.dataTransfer.getData("application/x-luma-object");
  if (objId) {
    const o = objects.find(o => String(o.id) === objId);
    if (o) {
      const f = frames.find(fr => fr.id === o.spriteFrameId);
      currentScene.objects.push({
        objectId: o.id,
        instanceName: `${o.name}_${currentScene.objects.length + 1}`,
        x: tx * tileSize,
        y: ty * tileSize,
        layer: "objects",
        enabled: true,
        variables: {},
        w: f ? f.w : 16,
        h: f ? f.h : 16
      });
      renderSceneEditor();
    }
    return;
  }
  // Frame seule droppée → on crée un objet minimal lié à cette frame
  const frameId = event.dataTransfer.getData("application/x-luma-frame");
  if (frameId) {
    const f = frames.find(fr => String(fr.id) === frameId);
    if (f) {
      let obj = objects.find(o => o.spriteFrameId === f.id);
      if (!obj) {
        obj = {
          id: nextObjectId++, name: f.name, type: "DECOR", behavior: "None",
          tags: [], spriteFrameId: f.id, animationId: null, solid: false,
          hp: 0, speed: 0, properties: {}
        };
        objects.push(obj);
      }
      currentScene.objects.push({
        objectId: obj.id,
        instanceName: `${obj.name}_${currentScene.objects.length + 1}`,
        x: tx * tileSize, y: ty * tileSize,
        layer: "objects", enabled: true, variables: {},
        w: f.w, h: f.h
      });
      renderSceneEditor();
      if (window.LumaLibrary) window.LumaLibrary.refresh();
    }
  }
});

mapCanvas.addEventListener("mousedown", (event) => {
  if (!currentMap || !currentScene) return;

  const rect = mapCanvas.getBoundingClientRect();
  const scaleX = mapCanvas.width / rect.width;
  const scaleY = mapCanvas.height / rect.height;
  const px = Math.floor((event.clientX - rect.left) * scaleX);
  const py = Math.floor((event.clientY - rect.top) * scaleY);
  const tileSize = currentMap.tileSize;
  const tx = Math.floor(px / tileSize);
  const ty = Math.floor(py / tileSize);
  const index = ty * currentMap.width + tx;

  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return;

  const tool = $("mapTool").value;
  const layer = $("mapLayer").value;
  const tileId = Math.max(0, Math.min(255, Number($("tileId").value) || 0));

  if (tool === "paint") {
    currentMap.layers[layer][index] = tileId;
  } else if (tool === "erase") {
    currentMap.layers[layer][index] = 0;
  } else if (tool === "collision") {
    currentMap.layers.collision[index] = currentMap.layers.collision[index] ? 0 : 1;
  } else if (tool === "spawn") {
    currentScene.playerSpawn = { x: tx * tileSize, y: ty * tileSize };
    testPlayer.x = currentScene.playerSpawn.x;
    testPlayer.y = currentScene.playerSpawn.y;
  } else if (tool === "camera") {
    const mapPxW = currentMap.width * currentMap.tileSize;
    const mapPxH = currentMap.height * currentMap.tileSize;
    const maxX = Math.max(0, mapPxW - camera.w);
    const maxY = Math.max(0, mapPxH - camera.h);
    camera.x = Math.max(0, Math.min(maxX, px - camera.w / 2));
    camera.y = Math.max(0, Math.min(maxY, py - camera.h / 2));
  } else if (tool === "object") {
    const objectId = $("placeObjectId").value || "object";
    currentScene.objects.push({
      objectId,
      instanceName: `${objectId}_${currentScene.objects.length + 1}`,
      x: tx * tileSize,
      y: ty * tileSize,
      layer: "objects",
      enabled: true,
      variables: {}
    });
  } else if (tool === "trigger") {
    currentScene.triggers.push({
      id: `trigger_${currentScene.triggers.length + 1}`,
      x: tx * tileSize,
      y: ty * tileSize,
      w: tileSize * 2,
      h: tileSize * 2,
      action: $("placeTriggerAction").value || "start_dialogue",
      target: $("placeTriggerTarget").value || "intro_radio_01"
    });
  }

  renderSceneEditor();
});

window.addEventListener("keydown", (event) => {
  if (!testPlayer.active || !currentMap) return;

  const speed = 4;
  let dx = 0;
  let dy = 0;

  if (event.key === "ArrowLeft") dx = -speed;
  if (event.key === "ArrowRight") dx = speed;
  if (event.key === "ArrowUp") dy = -speed;
  if (event.key === "ArrowDown") dy = speed;

  if (dx === 0 && dy === 0) return;
  event.preventDefault();

  // Bug #2 fix: test X et Y séparément pour permettre le sliding le long des murs
  if (dx !== 0) {
    const nx = testPlayer.x + dx;
    if (canStandAt(nx, testPlayer.y, testPlayer.size)) {
      testPlayer.x = nx;
    } else {
      // Snap au bord du mur pour éviter le "pixel coincé"
      const t = currentMap.tileSize;
      if (dx > 0) {
        const wallX = Math.floor((testPlayer.x + testPlayer.size + dx) / t) * t;
        testPlayer.x = Math.max(testPlayer.x, wallX - testPlayer.size);
      } else {
        const wallX = (Math.floor((testPlayer.x + dx) / t) + 1) * t;
        testPlayer.x = Math.min(testPlayer.x, wallX);
      }
    }
  }
  if (dy !== 0) {
    const ny = testPlayer.y + dy;
    if (canStandAt(testPlayer.x, ny, testPlayer.size)) {
      testPlayer.y = ny;
    } else {
      const t = currentMap.tileSize;
      if (dy > 0) {
        const wallY = Math.floor((testPlayer.y + testPlayer.size + dy) / t) * t;
        testPlayer.y = Math.max(testPlayer.y, wallY - testPlayer.size);
      } else {
        const wallY = (Math.floor((testPlayer.y + dy) / t) + 1) * t;
        testPlayer.y = Math.min(testPlayer.y, wallY);
      }
    }
  }

  if (currentScene?.cameraMode === "follow_player") {
    centerCameraOnPlayer();
  }

  renderSceneEditor();
});

// Bug #2 fix: teste les 4 coins du joueur, pas seulement 2
function canStandAt(px, py, size) {
  return !isSolidAt(px, py)
    && !isSolidAt(px + size - 1, py)
    && !isSolidAt(px, py + size - 1)
    && !isSolidAt(px + size - 1, py + size - 1);
}

function isSolidAt(px, py) {
  const t = currentMap.tileSize;
  const tx = Math.floor(px / t);
  const ty = Math.floor(py / t);
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return true;
  return currentMap.layers.collision[ty * currentMap.width + tx] > 0;
}

// Bug #3 fix: clamp caméra sur les 4 bords (gauche, haut, droite, bas)
function centerCameraOnPlayer() {
  if (!currentMap) return;
  const mapPxW = currentMap.width * currentMap.tileSize;
  const mapPxH = currentMap.height * currentMap.tileSize;
  const maxX = Math.max(0, mapPxW - camera.w);
  const maxY = Math.max(0, mapPxH - camera.h);
  camera.x = Math.max(0, Math.min(maxX, testPlayer.x + testPlayer.size / 2 - camera.w / 2));
  camera.y = Math.max(0, Math.min(maxY, testPlayer.y + testPlayer.size / 2 - camera.h / 2));
}

function renderSceneEditor() {
  if (!currentMap || !currentScene) {
    $("mapInfo").textContent = "Crée une map pour commencer.";
    return;
  }

  const tileSize = currentMap.tileSize;
  mapCanvas.width = currentMap.width * tileSize;
  mapCanvas.height = currentMap.height * tileSize;
  mapCtx.imageSmoothingEnabled = false;

  mapCtx.fillStyle = "#000000";
  mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

  drawTileLayer("floor");
  drawTileLayer("decor");
  drawCollisionLayer();
  drawPlacedObjects();
  drawTriggers();
  drawSpawn();

  if (testPlayer.active) {
    mapCtx.fillStyle = "#fff25a";
    mapCtx.fillRect(testPlayer.x, testPlayer.y, testPlayer.size, testPlayer.size);
  }

  if (showCameraFrame) {
    mapCtx.strokeStyle = "#ffffff";
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(camera.x, camera.y, camera.w, camera.h);
  }

  drawGrid();

  $("mapInfo").textContent = `${currentScene.id} / ${currentMap.width}x${currentMap.height} tiles / écran Luma 160x128`;
  renderSceneLists();
  renderSceneMemory();
  renderLumaPreview();
}

function drawTileLayer(layerName) {
  const layer = currentMap.layers[layerName];
  const tileSize = currentMap.tileSize;

  for (let y = 0; y < currentMap.height; y++) {
    for (let x = 0; x < currentMap.width; x++) {
      const id = layer[y * currentMap.width + x];
      if (!id) continue;

      mapCtx.fillStyle = tileColor(id, layerName);
      mapCtx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      mapCtx.fillStyle = "#ffffff";
      mapCtx.font = "8px monospace";
      mapCtx.fillText(String(id), x * tileSize + 3, y * tileSize + 10);
    }
  }
}

function drawCollisionLayer() {
  const layer = currentMap.layers.collision;
  const tileSize = currentMap.tileSize;
  mapCtx.fillStyle = "rgba(255, 94, 87, 0.45)";
  for (let y = 0; y < currentMap.height; y++) {
    for (let x = 0; x < currentMap.width; x++) {
      if (layer[y * currentMap.width + x]) {
        mapCtx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }
}

function drawGrid() {
  const tileSize = currentMap.tileSize;
  mapCtx.strokeStyle = "rgba(95,124,255,0.35)";
  mapCtx.lineWidth = 1;
  for (let x = 0; x <= currentMap.width; x++) {
    mapCtx.beginPath();
    mapCtx.moveTo(x * tileSize + 0.5, 0);
    mapCtx.lineTo(x * tileSize + 0.5, mapCanvas.height);
    mapCtx.stroke();
  }
  for (let y = 0; y <= currentMap.height; y++) {
    mapCtx.beginPath();
    mapCtx.moveTo(0, y * tileSize + 0.5);
    mapCtx.lineTo(mapCanvas.width, y * tileSize + 0.5);
    mapCtx.stroke();
  }
}

function drawSpawn() {
  mapCtx.fillStyle = "#4dff77";
  mapCtx.fillRect(currentScene.playerSpawn.x, currentScene.playerSpawn.y, 12, 12);
  mapCtx.fillStyle = "#000";
  mapCtx.font = "8px monospace";
  mapCtx.fillText("P", currentScene.playerSpawn.x + 3, currentScene.playerSpawn.y + 9);
}

// V1.4 : Cache des pixels d'image pour les sprites placés (évite décode répété)
const _spritePixelCache = new Map();
function getCachedSpritePixels(frame) {
  if (!frame || !frame.pixelsB64) return null;
  const key = frame.id + ":" + (frame.editedAt || 0);
  if (_spritePixelCache.has(key)) return _spritePixelCache.get(key);
  if (!window.LumaSpriteEditor) return null;
  try {
    const px = window.LumaSpriteEditor.base64ToPixels(frame.pixelsB64, frame.w * frame.h);
    // Build ImageData
    const img = mapCtx.createImageData(frame.w, frame.h);
    for (let i = 0; i < px.length; i++) {
      const c = px[i];
      if (c === 0xF81F) { img.data[i * 4 + 3] = 0; continue; }
      const r5 = (c >> 11) & 0x1F, g6 = (c >> 5) & 0x3F, b5 = c & 0x1F;
      img.data[i * 4]     = (r5 << 3) | (r5 >> 2);
      img.data[i * 4 + 1] = (g6 << 2) | (g6 >> 4);
      img.data[i * 4 + 2] = (b5 << 3) | (b5 >> 2);
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas");
    tmp.width = frame.w; tmp.height = frame.h;
    tmp.getContext("2d").putImageData(img, 0, 0);
    _spritePixelCache.set(key, tmp);
    return tmp;
  } catch (e) { return null; }
}

function drawPlacedObjects() {
  if (!currentScene || !currentScene.objects) return;
  for (const obj of currentScene.objects) {
    // V1.4 : trouve l'objet définition correspondant pour récupérer son sprite
    const objDef = objects.find(o => o.id === obj.objectId);
    let drawn = false;
    if (objDef) {
      const frame = frames.find(f => f.id === objDef.spriteFrameId);
      const cv = getCachedSpritePixels(frame);
      if (cv && frame) {
        mapCtx.imageSmoothingEnabled = false;
        mapCtx.drawImage(cv, obj.x, obj.y, frame.w, frame.h);
        // Halo de sélection si tag "player"
        if (objDef.type === "PLAYER") {
          mapCtx.strokeStyle = "rgba(255,242,90,0.8)";
          mapCtx.lineWidth = 1;
          mapCtx.strokeRect(obj.x + 0.5, obj.y + 0.5, frame.w - 1, frame.h - 1);
        }
        drawn = true;
      }
    }
    if (!drawn) {
      // Fallback : carré avec ID
      const typeInfo = (typeof OBJECT_TYPES !== "undefined") ? OBJECT_TYPES.find(t => t.id === (objDef && objDef.type)) : null;
      mapCtx.fillStyle = typeInfo ? typeInfo.color : "#fff25a";
      mapCtx.fillRect(obj.x, obj.y, 14, 14);
      mapCtx.fillStyle = "#000";
      mapCtx.font = "8px monospace";
      mapCtx.fillText(objDef ? objDef.name.substring(0, 3).toUpperCase() : "?", obj.x + 1, obj.y + 10);
    }
  }
}

function drawTriggers() {
  for (const trig of currentScene.triggers) {
    mapCtx.strokeStyle = "#ff00ff";
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(trig.x, trig.y, trig.w, trig.h);
    mapCtx.fillStyle = "#ff00ff";
    mapCtx.font = "8px monospace";
    mapCtx.fillText("T", trig.x + 2, trig.y + 9);
  }
}

function renderLumaPreview() {
  lumaCtx.imageSmoothingEnabled = false;
  lumaCtx.fillStyle = "#000000";
  lumaCtx.fillRect(0, 0, 160, 128);
  // Source clamp: jamais en dehors du mapCanvas (sinon Canvas2D ignore le draw)
  const sx = Math.max(0, Math.min(mapCanvas.width - 1, camera.x));
  const sy = Math.max(0, Math.min(mapCanvas.height - 1, camera.y));
  const sw = Math.min(160, mapCanvas.width - sx);
  const sh = Math.min(128, mapCanvas.height - sy);
  if (sw > 0 && sh > 0) {
    lumaCtx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }
}

function tileColor(id, layer) {
  const colors = ["#000000", "#3155ff", "#5f7cff", "#4dff77", "#fff25a", "#ff5e57", "#00ffff", "#ff00ff"];
  if (layer === "decor") return colors[(id + 2) % colors.length];
  return colors[id % colors.length];
}

function renderSceneLists() {
  $("spawnInfo").innerHTML = `<div class="data-item"><strong>player_spawn</strong><br>x:${currentScene.playerSpawn.x} y:${currentScene.playerSpawn.y}</div>`;

  $("placedObjectsList").innerHTML = "";
  currentScene.objects.forEach(o => {
    const div = document.createElement("div");
    div.className = "data-item";
    div.innerHTML = `<strong>${o.instanceName}</strong><br>source: ${o.objectId}<br>x:${o.x} y:${o.y}`;
    $("placedObjectsList").appendChild(div);
  });

  $("placedTriggersList").innerHTML = "";
  currentScene.triggers.forEach(t => {
    const div = document.createElement("div");
    div.className = "data-item";
    div.innerHTML = `<strong>${t.id}</strong><br>${t.action} → ${t.target}<br>x:${t.x} y:${t.y} w:${t.w} h:${t.h}`;
    $("placedTriggersList").appendChild(div);
  });
}

function renderSceneMemory() {
  const tileBytes = currentMap.width * currentMap.height * 2; // floor + decor, 1 byte each
  const collisionBytes = currentMap.width * currentMap.height;
  const objectBytes = currentScene.objects.length * 16;
  const triggerBytes = currentScene.triggers.length * 20;
  const total = tileBytes + collisionBytes + objectBytes + triggerBytes;

  $("sceneTilesMem").textContent = formatBytes(tileBytes);
  $("sceneCollisionMem").textContent = formatBytes(collisionBytes);
  $("sceneObjectsMem").textContent = formatBytes(objectBytes);
  $("sceneTriggersMem").textContent = formatBytes(triggerBytes);
  $("sceneTotalMem").textContent = formatBytes(total);
}



// V1.0 BUILD / EXPORT PIPELINE
const buildStepsText = [
  "Analyse projet...",
  "Conversion sprites RGB565...",
  "Création assets.lpk...",
  "Création game.luma...",
  "Génération manifest.json...",
  "Préparation export SD...",
  "Validation finale..."
];

$("scanDrives").addEventListener("click", async () => {
  const result = await window.lumaAPI.scanDrives();
  if (!result.ok) return alert("Impossible de scanner les lecteurs.");

  const select = $("sdDriveSelect");
  select.innerHTML = `<option value="">Aucun lecteur sélectionné</option>`;

  result.drives.forEach((drive) => {
    const option = document.createElement("option");
    option.value = drive.path;
    option.textContent = `${drive.label || drive.path}${drive.hasJeuxFolder ? " — dossier /jeux détecté" : ""}`;
    select.appendChild(option);
  });

  if (!result.drives.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucun lecteur détecté";
    select.appendChild(option);
  }
});

$("buildMode").addEventListener("change", () => {
  $("buildSecureState").textContent = $("buildMode").value === "secure" ? "ON" : "OFF";
});

$("buildGame").addEventListener("click", async () => {
  resetBuildUI();

  const secureExport = $("buildMode").value === "secure";
  const drivePath = $("sdDriveSelect").value;
  const copyToDrive = !!drivePath;

  $("buildSecureState").textContent = secureExport ? "ON" : "OFF";
  $("crtText").textContent = "BUILD";
  $("floppy").classList.add("insert");

  for (let i = 0; i < buildStepsText.length; i++) {
    await wait(280);
    addBuildStep(buildStepsText[i], "ok");
    $("buildProgressBar").style.width = `${Math.round(((i + 1) / buildStepsText.length) * 80)}%`;
  }

  const result = await window.lumaAPI.buildGame({
    secureExport,
    drivePath,
    copyToDrive,
    forceBuild: true
  });

  if (!result.ok) {
    $("crtText").textContent = "ERROR";
    $("buildProgressBar").style.width = "100%";
    addBuildStep(result.error || "Build failed", "err");
    renderValidation(result.validation || { errors: ["Erreur inconnue"], warnings: [] });
    return;
  }

  await wait(350);
  $("buildProgressBar").style.width = "100%";
  $("crtText").textContent = "SUCCESS";
  $("buildCheck").classList.add("show");

  renderValidation(result.validation);
  renderBuildOutput(result);

  $("buildGameSize").textContent = formatBytes(result.manifest.stats.game.size || 0);
  $("buildAssetSize").textContent = formatBytes(result.manifest.stats.assets.size || 0);
  $("buildTotalSize").textContent = formatBytes(result.manifest.size || 0);
});

function resetBuildUI() {
  $("buildSteps").innerHTML = "";
  $("buildValidation").innerHTML = "";
  $("buildOutput").innerHTML = "";
  $("buildProgressBar").style.width = "0%";
  $("buildCheck").classList.remove("show");
  $("floppy").classList.remove("insert");
  $("crtText").textContent = "READY";
}

function addBuildStep(text, type = "") {
  const div = document.createElement("div");
  div.className = `data-item ${type}`;
  div.textContent = text;
  $("buildSteps").appendChild(div);
  $("buildSteps").scrollTop = $("buildSteps").scrollHeight;
}

function renderValidation(validation) {
  const box = $("buildValidation");
  box.innerHTML = "";

  if (!validation) {
    box.innerHTML = `<div class="data-item warn">Aucune analyse disponible.</div>`;
    return;
  }

  if (!validation.errors?.length && !validation.warnings?.length) {
    box.innerHTML = `<div class="data-item ok">OK : aucun problème détecté.</div>`;
    return;
  }

  for (const error of validation.errors || []) {
    const div = document.createElement("div");
    div.className = "data-item err";
    div.textContent = `ERREUR : ${error}`;
    box.appendChild(div);
  }

  for (const warning of validation.warnings || []) {
    const div = document.createElement("div");
    div.className = "data-item warn";
    div.textContent = `WARNING : ${warning}`;
    box.appendChild(div);
  }
}

function renderBuildOutput(result) {
  const box = $("buildOutput");
  box.innerHTML = "";

  const lines = [
    ["Build folder", result.buildDir],
    ["SD copy", result.sdCopyPath || "Non copié sur SD"],
    ["Entry", result.manifest.entry],
    ["Assets", result.manifest.assets],
    ["Secure", result.manifest.secure ? "Oui" : "Non"],
    ["Signature", result.manifest.signature],
  ];

  if (result.secureKeySaved) {
    lines.push(["Dev key", result.secureKeySaved]);
  }

  for (const [k, v] of lines) {
    const div = document.createElement("div");
    div.className = "data-item";
    div.innerHTML = `<strong>${k}</strong><br>${String(v)}`;
    box.appendChild(div);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
