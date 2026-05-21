// =============================================================================
// LUMA STUDIO V1.5 — Orchestrateur
// =============================================================================
// Garde le layout V1.5 (topbar + 4 colonnes + bottombar façon Construct 3)
// et branche dessus les modules V1.4 fonctionnels :
//  - sprite-editor.js  (overlay pixel-art)
//  - music-editor.js   (piano roll dans #musicPanel)
//  - animation-editor.js (timeline dans #animationPanel)
//  - object-editor.js  (constructeur visuel dans #logicPanel)
//  - simulator.js      (overlay console sur ▶ PLAY)
//  - library-browser.js (peuple les listes droite + library)
//  - gif-encoder.js    (export GIF des anims)
// =============================================================================

// State global (partagé via script-scope)
let selectedSize = "550ko";
let projectLimitBytes = 550 * 1024;
let importedImage = null;
let frames = [];
let animations = [];
let objects = [];
let events = [];
let nextObjectId = 1;
let nextEventId = 1;
let music = {
  name: "theme_01", tempo: 120, steps: 16,
  loopA: true, loopB: false, preset: "blank",
  grid: { A: new Array(16).fill(null), B: new Array(16).fill(null) },
  tracks: { A: [], B: [] }
};
let dialogues = [];
let cutscenes = [];
let triggers = [];
let maps = [];
let scenes = [];
let currentMap = null;
let currentScene = null;
let currentMode = "scene";
let showCameraFrame = true;
let camera = { x: 0, y: 0, w: 160, h: 128 };
let testPlayer = { x: 32, y: 32, size: 12, active: false };
let currentCutSteps = [];

// V1.5.3 — Tilesets et outils de peinture
let tilesets = [];                  // [{id, name, dataUrl, tileSize, cols, rows, tileCount}]
let selectedTilesetId = null;        // tileset utilisé pour la map active
let selectedTileIndex = 0;           // tuile choisie dans le tileset
let currentPaintTool = "pencil";     // pencil | bucket | rect | circle | eraser
const _tilesetImageCache = new Map(); // id → HTMLImageElement chargé
let _pendingTilesetImage = null;     // image en cours d'import (avant Save)
let _pendingTilesetDataUrl = null;
let _shapeStart = null;              // {tx, ty} pour outils rect/circle (drag)

const OBJECT_TYPES = [
  { id: "PLAYER",     label: "🧍 Player",     color: "#fff25a" },
  { id: "ENEMY",      label: "👾 Enemy",      color: "#ff5e57" },
  { id: "NPC",        label: "💬 NPC",        color: "#5fffaa" },
  { id: "ITEM",       label: "🎁 Item",       color: "#5bd6ff" },
  { id: "PROJECTILE", label: "⚡ Projectile", color: "#ffaa55" },
  { id: "DECOR",      label: "🌿 Décor",      color: "#aa88ff" },
  { id: "TRIGGER",    label: "🎯 Trigger",    color: "#888888" },
  { id: "DOOR",       label: "🚪 Door",       color: "#cccccc" }
];

const OBJECT_BEHAVIORS = [
  { id: "None",               label: "Aucun (statique)" },
  { id: "PlatformerMovement", label: "🏃 Plateforme (jump+gravity)" },
  { id: "TopDownMovement",    label: "🎮 Top-Down (4 directions)" },
  { id: "FollowPlayer",       label: "👣 Suit le joueur" },
  { id: "Patrol",             label: "↔ Patrouille horizontale" },
  { id: "PatrolVertical",     label: "↕ Patrouille verticale" },
  { id: "Bounce",             label: "🏀 Rebondit" },
  { id: "Spinner",            label: "🔄 Tourne sur place" },
  { id: "Pickup",             label: "💰 Ramassable" },
  { id: "DialogueOnTouch",    label: "💬 Dialogue au contact" },
  { id: "DamageOnTouch",      label: "💥 Inflige des dégâts" },
  { id: "Door",               label: "🚪 Téléporte vers scène" }
];

const $ = (id) => document.getElementById(id);
const screens = { splash: $("splash"), project: $("project"), studio: $("studio") };
const mapCanvas = $("mapCanvas");
const mapCtx = mapCanvas.getContext("2d");
const spriteCanvas = $("spriteCanvas");
const spriteCtx = spriteCanvas.getContext("2d");
const spritePreview = $("spritePreview");
const spritePreviewCtx = spritePreview.getContext("2d");
const lumaCtx = $("lumaPreviewCanvas").getContext("2d");

setTimeout(() => showScreen("project"), 700);

function showScreen(name) {
  Object.values(screens).forEach(s => s && s.classList.remove("active"));
  if (screens[name]) screens[name].classList.add("active");
}

// ---------------------------------------------------------------------------
// PROJECT
// ---------------------------------------------------------------------------
$("createProject").addEventListener("click", async () => {
  const project = {
    name: $("projectName").value.trim() || "MonProjet",
    editor: $("editorName").value.trim() || "I.E.Games_Studio",
    size: $("projectSize") ? $("projectSize").value : "550ko"
  };
  $("status").textContent = "Création du projet…";
  try {
    const result = await window.lumaAPI.createProject(project);
    if (result.canceled) { $("status").textContent = "Création annulée."; return; }
    if (!result.ok) { $("status").textContent = result.error || "Erreur."; return; }
    selectedSize = project.size;
    projectLimitBytes = sizeToBytes(project.size);
    enterStudio(result.path);
  } catch (err) {
    $("status").textContent = "Erreur Electron : " + err.message;
  }
});

$("openProject").addEventListener("click", async () => {
  try {
    const result = await window.lumaAPI.openProject();
    if (result.canceled) return;
    if (!result.ok) return alert(result.error || "Erreur ouverture projet.");
    enterStudio(result.path, result.projectData);
  } catch (err) {
    alert("Erreur Electron : " + err.message);
  }
});

function sizeToBytes(s) {
  if (s === "200ko") return 200 * 1024;
  if (s === "1mo")   return 1024 * 1024;
  if (s === "2mo")   return 2 * 1024 * 1024;
  return 550 * 1024;
}

function enterStudio(path, data = null) {
  $("projectPath").textContent = path || "Projet actif";
  if (data) {
    frames = data.frames || [];
    animations = data.animations || [];
    window.animations = animations;
    objects = data.objects || [];
    events = data.events || [];
    tilesets = data.tilesets || [];
    nextObjectId = Math.max(0, ...objects.map(o => Number(o.id) || 0)) + 1;
    nextEventId = Math.max(0, ...events.map(e => Number(e.id) || 0)) + 1;
    if (data.music && data.music.grid) music = data.music;
    else if (data.music && data.music.tracks) music = { ...music, ...data.music };
    dialogues = data.dialogues || [];
    cutscenes = data.cutscenes || [];
    triggers = data.triggers || [];
    maps = data.maps || [];
    scenes = data.scenes || [];
    if (maps.length) currentMap = maps[0];
    if (scenes.length) currentScene = scenes[0];
    if (currentMap && currentMap.tilesetId) selectedTilesetId = currentMap.tilesetId;
    if (data.config && data.config.limitBytes) projectLimitBytes = data.config.limitBytes;
  }
  showScreen("studio");
  setMode("scene");
  setTimeout(() => {
    if (window.LumaMusicEditor)  window.LumaMusicEditor.init();
    if (window.LumaObjectEditor) window.LumaObjectEditor.init();
    // V1.5.1 — LumaLibrary désactivé : la library est gérée par populateLibrary()
    // qui peuple directement les divs statiques du HTML.
    refreshAllLists();
    updateCapacityBar();
    if (currentMap && currentScene) renderSceneEditor();
  }, 50);
}

// ---------------------------------------------------------------------------
// MODE SWITCH
// ---------------------------------------------------------------------------
document.querySelectorAll(".left-section").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".left-section").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === mode));
  document.querySelectorAll(".workspace").forEach(w => w.classList.remove("active"));
  const target = $(`${mode}Workspace`);
  if (target) target.classList.add("active");
  refreshTabs();
  if (mode === "scene" && currentMap && currentScene) {
    renderSceneEditor();
    updateSceneHint();
  }
  if (mode === "sprite") drawSpriteWorkspace();
  if (mode === "tileset") drawTilesetWorkspace();
  if (mode === "music"  && window.LumaMusicEditor)  window.LumaMusicEditor.init();
  if (mode === "objects" && window.LumaObjectEditor) window.LumaObjectEditor.init();
}

// V1.5.5 — Hint contextuel selon layer actif + outil
function updateSceneHint() {
  const layer = $("sceneLayer") ? $("sceneLayer").value : "floor";
  const hints = {
    floor:     "💡 Layer Floor — peint des tuiles de sol. Outil 🖊/🪣/⬜/⭕ + tuile sélectionnée.",
    decor:     "💡 Layer Decor — peint par-dessus le sol (objets visuels, herbe, etc).",
    collision: "💡 Layer Collision — clic = barrière invisible. La gomme l'enlève.",
    objects:   "💡 Layer Objects — clic = place l'objet du menu. Tag 'solid' = collision auto !"
  };
  if ($("hint")) $("hint").textContent = hints[layer] || "Choisis un layer dans Scene Setup.";
}

function refreshTabs() {
  const tabs = $("workspaceTabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  const labels = {
    scene: "🗺 Scène", sprite: "🎨 Asset Lab", tileset: "🧱 Tileset Editor",
    music: "🎵 Piano Roll", objects: "📦 Objects / Events", build: "🚀 Build"
  };
  const lab = labels[currentMode] || currentMode;
  const t = document.createElement("button");
  t.className = "tab active";
  t.textContent = lab;
  tabs.appendChild(t);
}

// ---------------------------------------------------------------------------
// TOPBAR
// ---------------------------------------------------------------------------
$("resetMap").addEventListener("click", () => {
  if (!currentMap) return alert("Pas de map à reset. Crée une scène d'abord.");
  if (!confirm("Reset la map active ? Tiles + objets placés seront vidés.")) return;
  const w = currentMap.width, h = currentMap.height;
  currentMap.layers.floor = new Array(w * h).fill(0);
  currentMap.layers.decor = new Array(w * h).fill(0);
  currentMap.layers.collision = new Array(w * h).fill(0);
  if (currentScene) currentScene.objects = [];
  renderSceneEditor();
  updateCapacityBar();
  $("hint").textContent = "Map et objets placés réinitialisés.";
});

$("btnPlay").addEventListener("click", () => {
  if (!currentMap || !currentScene) {
    $("hint").textContent = "⚠ Crée une scène d'abord avant de lancer la simulation.";
    return;
  }
  if (window.LumaSimulator) window.LumaSimulator.open();
});

$("saveAll").addEventListener("click", async () => {
  try {
    if (window.LumaMusicEditor) window.LumaMusicEditor.rebuildTracksFromGrid();
    await window.lumaAPI.saveFrames(frames);
    if (window.lumaAPI.saveAnimations) await window.lumaAPI.saveAnimations(animations);
    if (window.lumaAPI.saveTilesets) await window.lumaAPI.saveTilesets(tilesets);
    await window.lumaAPI.saveLogic({ objects, events, variables: [] });
    await window.lumaAPI.saveMusic(music);
    await window.lumaAPI.saveNarrative({ dialogues, cutscenes, triggers });
    if (currentMap && currentScene) {
      await window.lumaAPI.saveSceneData({ maps, scenes });
    }
    $("hint").textContent = "✅ Projet sauvegardé.";
  } catch (err) {
    $("hint").textContent = "⚠ Sauvegarde partielle : " + err.message;
  }
});

// ---------------------------------------------------------------------------
// CREATE / RESET MAP
// ---------------------------------------------------------------------------
$("createScene").addEventListener("click", () => {
  const w = Math.max(10, Number($("mapW").value) || 20);
  const h = Math.max(8,  Number($("mapH").value) || 15);
  const tileSize = Math.max(8, Number($("gridSize").value) || 16);
  const mapId = $("mapId").value || "map_001";

  currentMap = {
    id: mapId, width: w, height: h, tileSize,
    layers: {
      floor: new Array(w * h).fill(0),
      decor: new Array(w * h).fill(0),
      collision: new Array(w * h).fill(0)
    }
  };
  currentScene = {
    id: $("sceneName").value || "scene_001",
    name: $("sceneName").value || "Scene 001",
    mapId,
    music: music.name || "theme_01",
    cameraMode: $("cameraMode").value,
    playerSpawn: { x: 32, y: 32 },
    objects: [], triggers: []
  };
  maps = [currentMap];
  scenes = [currentScene];

  camera = { x: 0, y: 0, w: 160, h: 128 };
  testPlayer = { x: 32, y: 32, size: 12, active: false };
  setMode("scene");
  renderSceneEditor();
  refreshAllLists();
  updateCapacityBar();
  $("hint").textContent = `✅ Map ${w}×${h} créée (${w * h} tiles).`;
});

$("showGrid").addEventListener("change", () => renderSceneEditor());
$("bgColor").addEventListener("input", () => renderSceneEditor());
// V1.5.5 — hint contextuel quand on change de layer
if ($("sceneLayer")) {
  $("sceneLayer").addEventListener("change", () => updateSceneHint());
}

$("toggleCamera").addEventListener("click", () => {
  showCameraFrame = !showCameraFrame;
  renderSceneEditor();
});

$("centerCamera").addEventListener("click", () => {
  if (!currentScene || !currentMap) return;
  centerCameraOnSpawn();
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
  $("hint").textContent = testPlayer.active
    ? "Test joueur ON — flèches pour bouger."
    : "Test joueur OFF.";
});

function centerCameraOnSpawn() {
  const mapPxW = currentMap.width * currentMap.tileSize;
  const mapPxH = currentMap.height * currentMap.tileSize;
  camera.x = Math.max(0, Math.min(Math.max(0, mapPxW - camera.w),
                                  currentScene.playerSpawn.x - camera.w / 2));
  camera.y = Math.max(0, Math.min(Math.max(0, mapPxH - camera.h),
                                  currentScene.playerSpawn.y - camera.h / 2));
}

function centerCameraOnPlayer() {
  if (!currentMap) return;
  const mapPxW = currentMap.width * currentMap.tileSize;
  const mapPxH = currentMap.height * currentMap.tileSize;
  const maxX = Math.max(0, mapPxW - camera.w);
  const maxY = Math.max(0, mapPxH - camera.h);
  camera.x = Math.max(0, Math.min(maxX, testPlayer.x + testPlayer.size / 2 - camera.w / 2));
  camera.y = Math.max(0, Math.min(maxY, testPlayer.y + testPlayer.size / 2 - camera.h / 2));
}

// ---------------------------------------------------------------------------
// MAP CANVAS : peindre / placer / drag-drop
// ---------------------------------------------------------------------------
let painting = false;

mapCanvas.addEventListener("mousedown", (e) => {
  if (!currentMap || !currentScene) return;
  painting = true;
  // V1.5.3 — outils rect/circle : on enregistre le point de départ
  const pt = pixelToTile(e);
  if (pt && (currentPaintTool === "rect" || currentPaintTool === "circle")) {
    _shapeStart = pt;
    return;
  }
  handleMapClick(e);
});
mapCanvas.addEventListener("mousemove", (e) => {
  if (!painting) return;
  const tool = $("mapTool").value;
  // Drag : pencil/eraser appliquent en continu sur paint mode
  if (tool === "paint" && (currentPaintTool === "pencil" || currentPaintTool === "eraser")) {
    handleMapClick(e);
  }
});
mapCanvas.addEventListener("mouseup", (e) => {
  if (!painting) { _shapeStart = null; return; }
  // V1.5.3 — Si rect/circle, on dessine la forme finale au relâchement
  if (_shapeStart && (currentPaintTool === "rect" || currentPaintTool === "circle")) {
    const pt = pixelToTile(e);
    if (pt) {
      const val = currentPaintTool === "rect" || currentPaintTool === "circle" ? getPaintValue() : 0;
      const drawVal = (val === 0) ? 1 : val; // toujours quelque chose
      if (currentPaintTool === "rect") drawRectTiles(_shapeStart.tx, _shapeStart.ty, pt.tx, pt.ty, drawVal);
      else drawCircleTiles(_shapeStart.tx, _shapeStart.ty, pt.tx, pt.ty, drawVal);
      renderSceneEditor();
      updateCapacityBar();
    }
    _shapeStart = null;
  }
  painting = false;
});
mapCanvas.addEventListener("mouseleave", () => { painting = false; });

// V1.5.3 — Helper : convertit pixel coord → tile coord
function pixelToTile(event) {
  if (!currentMap) return null;
  const rect = mapCanvas.getBoundingClientRect();
  const sX = mapCanvas.width / rect.width;
  const sY = mapCanvas.height / rect.height;
  const px = Math.floor((event.clientX - rect.left) * sX);
  const py = Math.floor((event.clientY - rect.top) * sY);
  const tx = Math.floor(px / currentMap.tileSize);
  const ty = Math.floor(py / currentMap.tileSize);
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return null;
  return { px, py, tx, ty };
}

function handleMapClick(event) {
  const pt = pixelToTile(event);
  if (!pt) return;
  const { px, py, tx, ty } = pt;

  const tool = $("mapTool").value;
  const idx = ty * currentMap.width + tx;
  const layer = $("sceneLayer") ? $("sceneLayer").value : "floor";

  if (tool === "paint") {
    // V1.5.5 — Le layer actif pilote ce qu'on dessine
    if (currentPaintTool === "pencil") {
      if (layer === "objects") {
        placeObjectAt(tx, ty);
      } else {
        paintTileAt(tx, ty, getPaintValue());
      }
    } else if (currentPaintTool === "eraser") {
      if (layer === "objects") {
        eraseObjectsAtTile(tx, ty);
      } else {
        paintTileAt(tx, ty, 0);
      }
    } else if (currentPaintTool === "bucket") {
      if (layer !== "objects") floodFill(tx, ty, getPaintValue());
      else $("hint").textContent = "ℹ Le seau ne fonctionne pas sur le layer Objects.";
    }
    // rect/circle gérés au mouseup
  } else if (tool === "spawn") {
    currentScene.playerSpawn.x = tx * currentMap.tileSize;
    currentScene.playerSpawn.y = ty * currentMap.tileSize;
  } else if (tool === "camera") {
    const mapPxW = currentMap.width * currentMap.tileSize;
    const mapPxH = currentMap.height * currentMap.tileSize;
    camera.x = Math.max(0, Math.min(Math.max(0, mapPxW - camera.w), px - camera.w / 2));
    camera.y = Math.max(0, Math.min(Math.max(0, mapPxH - camera.h), py - camera.h / 2));
  } else if (tool === "trigger") {
    currentScene.triggers.push({
      id: "trigger_" + Date.now(),
      x: tx * currentMap.tileSize, y: ty * currentMap.tileSize,
      w: currentMap.tileSize, h: currentMap.tileSize,
      action: "Start Dialogue", target: ""
    });
  }
  renderSceneEditor();
  updateCapacityBar();
}

// V1.5.5 — Place l'objet du picker au tile (tx,ty). Auto-collision si tag "solid".
function placeObjectAt(tx, ty) {
  const picker = $("sceneObjectPicker");
  const pickedId = picker ? picker.value : "";
  if (!pickedId) {
    $("hint").textContent = "⚠ Choisis un objet dans le menu déroulant pour le placer (Layer = Objects).";
    return;
  }
  const o = objects.find(o => String(o.id) === String(pickedId));
  if (!o) { $("hint").textContent = "⚠ Objet introuvable."; return; }
  const f = frames.find(fr => fr.id === o.spriteFrameId);
  const inst = {
    objectId: o.id,
    instanceName: `${o.name}_${currentScene.objects.length + 1}`,
    x: tx * currentMap.tileSize, y: ty * currentMap.tileSize,
    layer: "objects", enabled: true, variables: {},
    w: f ? f.w : currentMap.tileSize, h: f ? f.h : currentMap.tileSize
  };
  currentScene.objects.push(inst);
  // Auto-collision si tag "solid"
  if (o.tags && o.tags.includes("solid")) {
    setObjectCollisionTiles(inst, true);
    $("hint").textContent = `✅ ${o.name} placé en (${tx},${ty}) + collision auto (tag solid).`;
  } else {
    $("hint").textContent = `✅ ${o.name} placé en (${tx},${ty}).`;
  }
}

// V1.5.5 — Efface les objets dont le tile (tx,ty) est inclus dans leur bounding box.
// Si l'objet était "solid", on retire la collision auto, mais SEULEMENT si aucun
// autre objet solid restant n'occupe ce tile (la collision manuelle est préservée).
function eraseObjectsAtTile(tx, ty) {
  if (!currentScene || !currentMap) return;
  const ts = currentMap.tileSize;
  const toRemove = currentScene.objects.filter(inst => tileInInstance(inst, tx, ty, ts));
  if (toRemove.length === 0) {
    $("hint").textContent = "Aucun objet sur ce tile.";
    return;
  }
  // Désactive d'abord la collision auto de ceux qui partent
  for (const inst of toRemove) {
    const obj = objects.find(o => o.id === inst.objectId);
    if (obj && obj.tags && obj.tags.includes("solid")) {
      setObjectCollisionTiles(inst, false, toRemove);
    }
  }
  currentScene.objects = currentScene.objects.filter(inst => !toRemove.includes(inst));
  $("hint").textContent = `🗑 ${toRemove.length} objet(s) retiré(s) du tile (${tx},${ty}).`;
}

function tileInInstance(inst, tx, ty, ts) {
  const startTx = Math.floor(inst.x / ts);
  const startTy = Math.floor(inst.y / ts);
  const endTx = Math.floor((inst.x + (inst.w || ts) - 1) / ts);
  const endTy = Math.floor((inst.y + (inst.h || ts) - 1) / ts);
  return tx >= startTx && tx <= endTx && ty >= startTy && ty <= endTy;
}

// V1.5.5 — Marque/démarque la collision sous une instance d'objet solid.
// Quand on démarque (on = false), vérifie qu'aucun AUTRE objet solid n'occupe
// encore ce tile avant de retirer la collision (pour ne pas casser la collision
// d'objets superposés).
function setObjectCollisionTiles(inst, on, excludeList) {
  if (!currentMap) return;
  const ts = currentMap.tileSize;
  const startTx = Math.floor(inst.x / ts);
  const startTy = Math.floor(inst.y / ts);
  const endTx = Math.floor((inst.x + (inst.w || ts) - 1) / ts);
  const endTy = Math.floor((inst.y + (inst.h || ts) - 1) / ts);
  excludeList = excludeList || [];
  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) continue;
      const idx = ty * currentMap.width + tx;
      if (on) {
        currentMap.layers.collision[idx] = 1;
      } else {
        // Vérifie si un autre objet solid occupe encore ce tile
        const stillSolid = currentScene.objects.some(other => {
          if (other === inst || excludeList.includes(other)) return false;
          const oobj = objects.find(o => o.id === other.objectId);
          if (!oobj || !oobj.tags || !oobj.tags.includes("solid")) return false;
          return tileInInstance(other, tx, ty, ts);
        });
        if (!stillSolid) currentMap.layers.collision[idx] = 0;
      }
    }
  }
}

// Drag-and-drop depuis library
mapCanvas.addEventListener("dragover", (e) => {
  if (!currentMap) return;
  const types = e.dataTransfer.types;
  if (types.includes("application/x-luma-object")
   || types.includes("application/x-luma-frame")
   || types.includes("text/luma-object")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    mapCanvas.classList.add("drag-over");
  }
});
mapCanvas.addEventListener("dragleave", () => mapCanvas.classList.remove("drag-over"));
mapCanvas.addEventListener("drop", (event) => {
  event.preventDefault();
  mapCanvas.classList.remove("drag-over");
  if (!currentMap || !currentScene) return;

  const rect = mapCanvas.getBoundingClientRect();
  const sX = mapCanvas.width / rect.width;
  const sY = mapCanvas.height / rect.height;
  const px = Math.floor((event.clientX - rect.left) * sX);
  const py = Math.floor((event.clientY - rect.top) * sY);
  const tileSize = currentMap.tileSize;
  const tx = Math.floor(px / tileSize);
  const ty = Math.floor(py / tileSize);
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return;

  const objId = event.dataTransfer.getData("application/x-luma-object")
             || event.dataTransfer.getData("text/luma-object");
  if (objId) {
    const o = objects.find(o => String(o.id) === String(objId));
    if (o) {
      const f = frames.find(fr => fr.id === o.spriteFrameId);
      const inst = {
        objectId: o.id,
        instanceName: `${o.name}_${currentScene.objects.length + 1}`,
        x: tx * tileSize, y: ty * tileSize,
        layer: "objects", enabled: true, variables: {},
        w: f ? f.w : 16, h: f ? f.h : 16
      };
      currentScene.objects.push(inst);
      // V1.5.5 — auto-collision si tag "solid"
      if (o.tags && o.tags.includes("solid")) {
        setObjectCollisionTiles(inst, true);
      }
      renderSceneEditor();
      refreshAllLists();
      updateCapacityBar();
      selectObject(o);
    }
    return;
  }
  const frameId = event.dataTransfer.getData("application/x-luma-frame");
  if (frameId) {
    const f = frames.find(fr => String(fr.id) === String(frameId));
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
      const inst = {
        objectId: obj.id,
        instanceName: `${obj.name}_${currentScene.objects.length + 1}`,
        x: tx * tileSize, y: ty * tileSize,
        layer: "objects", enabled: true, variables: {},
        w: f.w, h: f.h
      };
      currentScene.objects.push(inst);
      if (obj.tags && obj.tags.includes("solid")) {
        setObjectCollisionTiles(inst, true);
      }
      renderSceneEditor();
      refreshAllLists();
      updateCapacityBar();
    }
  }
});

// ---------------------------------------------------------------------------
// SCENE RENDERING
// ---------------------------------------------------------------------------
const TILE_HEX = ["#000000", "#1842ff", "#5b7fff", "#00fc77", "#ffff58",
                  "#ff5256", "#00ffff", "#ff00ff"];

function renderSceneEditor() {
  if (!currentMap || !currentScene) {
    $("mapInfo").textContent = "Pas de map. Clique sur CRÉER / RESET MAP.";
    mapCtx.fillStyle = $("bgColor").value || "#0a1326";
    mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    return;
  }
  const ts = currentMap.tileSize;
  mapCanvas.width  = currentMap.width  * ts;
  mapCanvas.height = currentMap.height * ts;
  mapCtx.imageSmoothingEnabled = false;

  mapCtx.fillStyle = $("bgColor").value || "#0a1326";
  mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

  drawTileLayer("floor");
  drawTileLayer("decor", true);
  drawCollision();
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
  if ($("showGrid").checked) drawGrid();

  $("mapInfo").textContent = `${currentScene.id} · ${currentMap.width}×${currentMap.height} tiles · écran 160×128`;
  renderLumaPreview();
  renderSceneMemory();
}

function drawTileLayer(name, decor) {
  const layer = currentMap.layers[name];
  const ts = currentMap.tileSize;
  // V1.5.3 — si la map a un tileset, on rend les vraies tuiles
  const tileset = currentMap.tilesetId
    ? tilesets.find(t => t.id === currentMap.tilesetId) : null;
  const img = tileset ? getTilesetImage(tileset) : null;

  for (let y = 0; y < currentMap.height; y++) {
    for (let x = 0; x < currentMap.width; x++) {
      const v = layer[y * currentMap.width + x];
      if (!v) continue;
      if (tileset && img && img.complete) {
        // v = index_de_tuile + 1 (0 = vide). Décodage : col/row dans le tileset.
        const tileIdx = v - 1;
        if (tileIdx < 0 || tileIdx >= tileset.tileCount) continue;
        const col = tileIdx % tileset.cols;
        const row = Math.floor(tileIdx / tileset.cols);
        mapCtx.imageSmoothingEnabled = false;
        mapCtx.drawImage(img,
          col * tileset.tileSize, row * tileset.tileSize, tileset.tileSize, tileset.tileSize,
          x * ts, y * ts, ts, ts);
      } else {
        // Fallback : couleurs solides palette TILE_HEX
        const idx = decor ? ((v + 2) & 7) : (v & 7);
        mapCtx.fillStyle = TILE_HEX[idx];
        mapCtx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }
}

function drawCollision() {
  const layer = currentMap.layers.collision;
  const ts = currentMap.tileSize;
  mapCtx.fillStyle = "rgba(255, 0, 80, 0.4)";
  for (let y = 0; y < currentMap.height; y++) {
    for (let x = 0; x < currentMap.width; x++) {
      if (layer[y * currentMap.width + x]) {
        mapCtx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }
}

function drawGrid() {
  const ts = currentMap.tileSize;
  mapCtx.strokeStyle = "rgba(255,255,255,0.18)";
  mapCtx.lineWidth = 1;
  for (let x = 0; x <= currentMap.width; x++) {
    mapCtx.beginPath();
    mapCtx.moveTo(x * ts + 0.5, 0);
    mapCtx.lineTo(x * ts + 0.5, mapCanvas.height);
    mapCtx.stroke();
  }
  for (let y = 0; y <= currentMap.height; y++) {
    mapCtx.beginPath();
    mapCtx.moveTo(0, y * ts + 0.5);
    mapCtx.lineTo(mapCanvas.width, y * ts + 0.5);
    mapCtx.stroke();
  }
}

function drawSpawn() {
  if (!currentScene) return;
  mapCtx.fillStyle = "#4dff77";
  mapCtx.fillRect(currentScene.playerSpawn.x, currentScene.playerSpawn.y, 12, 12);
  mapCtx.fillStyle = "#000";
  mapCtx.font = "10px monospace";
  mapCtx.fillText("P", currentScene.playerSpawn.x + 3, currentScene.playerSpawn.y + 10);
}

function drawTriggers() {
  if (!currentScene || !currentScene.triggers) return;
  for (const t of currentScene.triggers) {
    mapCtx.strokeStyle = "rgba(255, 230, 0, 0.8)";
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([4, 2]);
    mapCtx.strokeRect(t.x, t.y, t.w, t.h);
    mapCtx.setLineDash([]);
  }
}

const _spritePixelCache = new Map();
function getCachedSpritePixels(frame) {
  if (!frame || !frame.pixelsB64) return null;
  const key = frame.id + ":" + (frame.editedAt || 0);
  if (_spritePixelCache.has(key)) return _spritePixelCache.get(key);
  if (!window.LumaSpriteEditor) return null;
  try {
    const px = window.LumaSpriteEditor.base64ToPixels(frame.pixelsB64, frame.w * frame.h);
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
    const objDef = objects.find(o => o.id === obj.objectId);
    let drawn = false;
    if (objDef) {
      const frame = frames.find(f => f.id === objDef.spriteFrameId);
      const cv = getCachedSpritePixels(frame);
      if (cv && frame) {
        mapCtx.imageSmoothingEnabled = false;
        mapCtx.drawImage(cv, obj.x, obj.y, frame.w, frame.h);
        if (objDef.type === "PLAYER") {
          mapCtx.strokeStyle = "rgba(255,242,90,0.8)";
          mapCtx.lineWidth = 1;
          mapCtx.strokeRect(obj.x + 0.5, obj.y + 0.5, frame.w - 1, frame.h - 1);
        }
        // V1.5.5 — Indicateur visuel : tag "solid" → coin rouge en haut-droite
        if (objDef.tags && objDef.tags.includes("solid")) {
          mapCtx.fillStyle = "rgba(255,0,80,0.85)";
          mapCtx.fillRect(obj.x + frame.w - 4, obj.y, 4, 4);
        }
        drawn = true;
      }
    }
    if (!drawn) {
      const typeInfo = objDef ? OBJECT_TYPES.find(t => t.id === objDef.type) : null;
      mapCtx.fillStyle = typeInfo ? typeInfo.color : "#5fffaa";
      const w = (obj.w || 14), h = (obj.h || 14);
      mapCtx.fillRect(obj.x, obj.y, w, h);
      mapCtx.fillStyle = "#000";
      mapCtx.font = "8px monospace";
      mapCtx.fillText(objDef ? objDef.name.substring(0, 3).toUpperCase() : "?", obj.x + 1, obj.y + 10);
      if (objDef && objDef.tags && objDef.tags.includes("solid")) {
        mapCtx.fillStyle = "rgba(255,0,80,0.85)";
        mapCtx.fillRect(obj.x + w - 4, obj.y, 4, 4);
      }
    }
  }
}

function renderLumaPreview() {
  lumaCtx.imageSmoothingEnabled = false;
  lumaCtx.fillStyle = "#000";
  lumaCtx.fillRect(0, 0, 160, 128);
  const sx = Math.max(0, Math.min(mapCanvas.width - 1, camera.x));
  const sy = Math.max(0, Math.min(mapCanvas.height - 1, camera.y));
  const sw = Math.min(160, mapCanvas.width - sx);
  const sh = Math.min(128, mapCanvas.height - sy);
  if (sw > 0 && sh > 0) lumaCtx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
}

function renderSceneMemory() {
  if (!currentMap || !currentScene) return;
  const tileBytes = currentMap.width * currentMap.height * 2;
  const collisionBytes = currentMap.width * currentMap.height;
  const objectBytes = currentScene.objects.length * 16;
  const triggerBytes = currentScene.triggers.length * 20;
  $("sceneTilesMem").textContent = formatBytes(tileBytes);
  $("sceneCollisionMem").textContent = formatBytes(collisionBytes);
  $("sceneObjectsMem").textContent = formatBytes(objectBytes);
  $("sceneTriggersMem").textContent = formatBytes(triggerBytes);
  $("sceneTotalMem").textContent = formatBytes(tileBytes + collisionBytes + objectBytes + triggerBytes);
}

window.addEventListener("keydown", (e) => {
  if (!testPlayer.active || !currentMap || currentMode !== "scene") return;
  const speed = 4;
  let dx = 0, dy = 0;
  if (e.key === "ArrowLeft")  dx = -speed;
  if (e.key === "ArrowRight") dx = speed;
  if (e.key === "ArrowUp")    dy = -speed;
  if (e.key === "ArrowDown")  dy = speed;
  if (dx === 0 && dy === 0) return;
  e.preventDefault();
  if (dx !== 0 && canStandAt(testPlayer.x + dx, testPlayer.y, testPlayer.size))
    testPlayer.x += dx;
  if (dy !== 0 && canStandAt(testPlayer.x, testPlayer.y + dy, testPlayer.size))
    testPlayer.y += dy;
  if (currentScene.cameraMode === "follow_player") centerCameraOnPlayer();
  renderSceneEditor();
});

function canStandAt(px, py, size) {
  return !isSolidAt(px, py)
    && !isSolidAt(px + size - 1, py)
    && !isSolidAt(px, py + size - 1)
    && !isSolidAt(px + size - 1, py + size - 1);
}
function isSolidAt(px, py) {
  if (!currentMap) return true;
  const t = currentMap.tileSize;
  const tx = Math.floor(px / t), ty = Math.floor(py / t);
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return true;
  return currentMap.layers.collision[ty * currentMap.width + tx] > 0;
}

// ---------------------------------------------------------------------------
// SPRITE WORKSPACE : import + slice + Edit pixel
// ---------------------------------------------------------------------------
$("importImage").addEventListener("click", async () => {
  try {
    const result = await window.lumaAPI.importImage();
    if (result.canceled) return;
    if (!result.ok) return alert(result.error || "Erreur import image.");
    const img = new Image();
    img.onload = () => {
      importedImage = img;
      $("spriteName").value = result.name.replace(/\.[^.]+$/, "") || "imported";
      $("spriteWidth").value = img.width;
      $("spriteHeight").value = img.height;
      $("spriteMemory").value = formatBytes(img.width * img.height * 2);
      drawSpriteWorkspace();
      $("hint").textContent = `Image importée ${img.width}×${img.height}. Découpe en grille ou Ajoute en frame unique.`;
    };
    img.src = result.dataUrl;
  } catch (err) { alert("Erreur import : " + err.message); }
});

$("sliceFromImage").addEventListener("click", () => {
  if (!importedImage) return alert("Importe d'abord une image.");
  const cellW = Math.max(4, Number($("spriteWidth").value) || 16);
  const cellH = Math.max(4, Number($("spriteHeight").value) || 16);
  const cols = Math.floor(importedImage.width / cellW);
  const rows = Math.floor(importedImage.height / cellH);
  if (cols < 1 || rows < 1) return alert("Image trop petite pour ce découpage.");
  const baseName = $("spriteName").value || "sprite";
  let added = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const f = {
        id: Date.now() + Math.floor(Math.random() * 10000) + added,
        name: `${baseName}_${String(added + 1).padStart(2, "0")}`,
        folder: "sprites", usage: 0,
        x: c * cellW, y: r * cellH, w: cellW, h: cellH,
        rgb565Bytes: cellW * cellH * 2
      };
      const tmp = document.createElement("canvas");
      tmp.width = cellW; tmp.height = cellH;
      const tctx = tmp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(importedImage, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      const data = tctx.getImageData(0, 0, f.w, f.h).data;
      const arr = new Uint16Array(f.w * f.h);
      for (let i = 0; i < arr.length; i++) {
        const a = data[i * 4 + 3];
        if (a < 128) arr[i] = 0xF81F;
        else arr[i] = ((data[i*4] >> 3) << 11) | ((data[i*4+1] >> 2) << 5) | (data[i*4+2] >> 3);
      }
      if (window.LumaSpriteEditor) f.pixelsB64 = window.LumaSpriteEditor.pixelsToBase64(arr);
      frames.push(f);
      added++;
    }
  }
  drawSpriteWorkspace();
  refreshAllLists();
  updateCapacityBar();
  $("hint").textContent = `✅ ${added} frames créées (${cols}×${rows}).`;
});

$("addSpriteAsObject").addEventListener("click", () => {
  if (!importedImage && frames.length === 0)
    return alert("Importe une image ou découpe d'abord.");
  const w = Math.max(4, Number($("spriteWidth").value) || 16);
  const h = Math.max(4, Number($("spriteHeight").value) || 16);
  const name = $("spriteName").value || "sprite";

  let frame;
  if (importedImage) {
    frame = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name, folder: "sprites", usage: 0,
      x: 0, y: 0, w, h, rgb565Bytes: w * h * 2
    };
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(importedImage, 0, 0, importedImage.width, importedImage.height, 0, 0, w, h);
    const data = tctx.getImageData(0, 0, w, h).data;
    const arr = new Uint16Array(w * h);
    for (let i = 0; i < arr.length; i++) {
      const a = data[i * 4 + 3];
      if (a < 128) arr[i] = 0xF81F;
      else arr[i] = ((data[i*4] >> 3) << 11) | ((data[i*4+1] >> 2) << 5) | (data[i*4+2] >> 3);
    }
    if (window.LumaSpriteEditor) frame.pixelsB64 = window.LumaSpriteEditor.pixelsToBase64(arr);
    frames.push(frame);
  } else {
    frame = frames[frames.length - 1];
  }

  const obj = {
    id: nextObjectId++, name, type: "DECOR", behavior: "None",
    tags: [], spriteFrameId: frame.id, animationId: null, solid: false,
    hp: 0, speed: 0, properties: {}
  };
  objects.push(obj);
  refreshAllLists();
  updateCapacityBar();
  $("hint").textContent = `✅ Objet « ${obj.name} » créé. Va dans Objects pour configurer son comportement.`;
});

function drawSpriteWorkspace() {
  spriteCtx.fillStyle = "#dcdcdc";
  spriteCtx.fillRect(0, 0, spriteCanvas.width, spriteCanvas.height);
  spritePreviewCtx.fillStyle = "#000";
  spritePreviewCtx.fillRect(0, 0, spritePreview.width, spritePreview.height);
  if (importedImage) {
    spriteCtx.imageSmoothingEnabled = false;
    spritePreviewCtx.imageSmoothingEnabled = false;
    const scale = Math.min(spriteCanvas.width / importedImage.width, spriteCanvas.height / importedImage.height, 4);
    const w = importedImage.width * scale, h = importedImage.height * scale;
    spriteCtx.drawImage(importedImage, (spriteCanvas.width - w) / 2, (spriteCanvas.height - h) / 2, w, h);
    const ps = Math.min(spritePreview.width / importedImage.width, spritePreview.height / importedImage.height, 1);
    spritePreviewCtx.drawImage(importedImage, 0, 0, importedImage.width, importedImage.height,
      (spritePreview.width - importedImage.width * ps) / 2,
      (spritePreview.height - importedImage.height * ps) / 2,
      importedImage.width * ps, importedImage.height * ps);
  }
  drawFramesGrid();
}

function drawFramesGrid() {
  const grid = $("framesGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const card = document.createElement("div");
    card.className = "frame-card";
    card.innerHTML = `
      <canvas width="${f.w}" height="${f.h}"></canvas>
      <span class="frame-card-name">${f.name}</span>
      <span class="frame-card-meta">${f.w}×${f.h}</span>
      <button class="frame-card-edit">EDIT</button>
    `;
    const cv = card.querySelector("canvas");
    const cctx = cv.getContext("2d");
    cctx.imageSmoothingEnabled = false;
    if (f.pixelsB64 && window.LumaSpriteEditor) {
      try {
        const px = window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h);
        const img = cctx.createImageData(f.w, f.h);
        for (let p = 0; p < px.length; p++) {
          const c = px[p];
          if (c === 0xF81F) { img.data[p * 4 + 3] = 0; continue; }
          const r5 = (c >> 11) & 0x1F, g6 = (c >> 5) & 0x3F, b5 = c & 0x1F;
          img.data[p * 4]     = (r5 << 3) | (r5 >> 2);
          img.data[p * 4 + 1] = (g6 << 2) | (g6 >> 4);
          img.data[p * 4 + 2] = (b5 << 3) | (b5 >> 2);
          img.data[p * 4 + 3] = 255;
        }
        cctx.putImageData(img, 0, 0);
      } catch (e) {}
    } else if (importedImage) {
      cctx.drawImage(importedImage, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    }
    card.querySelector(".frame-card-edit").onclick = (ev) => {
      ev.stopPropagation();
      if (window.LumaSpriteEditor) window.LumaSpriteEditor.open(i);
    };
    grid.appendChild(card);
  }
  $("framesCount").textContent = `${frames.length} frame${frames.length > 1 ? "s" : ""}`;
  $("memFrames").textContent = frames.length;
  $("memRaw").textContent = formatBytes(frames.reduce((s, f) => s + (f.rgb565Bytes || 0), 0));
  $("frameCount").textContent = frames.length;
  const totalBytes = frames.reduce((s, f) => s + (f.rgb565Bytes || 0), 0);
  $("memBar").style.width = Math.min(100, Math.round((totalBytes / projectLimitBytes) * 100)) + "%";
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------
$("buildGame").addEventListener("click", async () => {
  const log = $("buildLog");
  log.textContent = "Build en cours…\n";
  try {
    const key = $("secureKey").value || null;
    if (window.LumaMusicEditor) window.LumaMusicEditor.rebuildTracksFromGrid();
    await window.lumaAPI.saveFrames(frames);
    if (window.lumaAPI.saveAnimations) await window.lumaAPI.saveAnimations(animations);
    await window.lumaAPI.saveLogic({ objects, events, variables: [] });
    await window.lumaAPI.saveMusic(music);
    if (currentMap && currentScene) await window.lumaAPI.saveSceneData({ maps, scenes });
    log.textContent += "✓ Sources sauvegardées\n";
    if (window.lumaAPI.buildGame) {
      const result = await window.lumaAPI.buildGame({ secureKey: key });
      if (result.ok) {
        log.textContent += `✓ Build terminé\n${result.buildDir || ""}`;
      } else {
        log.textContent += "✗ " + (result.error || "Erreur build");
      }
    } else {
      log.textContent += "ℹ Pipeline build complet non exposé. Sauvegarde OK.";
    }
  } catch (err) { log.textContent += "✗ " + err.message; }
});

// ---------------------------------------------------------------------------
// LISTS — library + object picker (plus de right-inspector)
// ---------------------------------------------------------------------------
function refreshAllLists() {
  refreshObjectPicker();
  refreshMusicPicker();
  refreshTilesetSelectors();
  drawTilesetSelectorGrid();
  populateLibrary();
}

// V1.5.1 — Peuple les divs library statiques du HTML
function populateLibrary() {
  populateLibSection("libSprites", "libSpritesCount", frames, (f) => {
    const btn = document.createElement("button");
    btn.textContent = `${String(f.id).slice(-4)} · ${f.name} (${f.w}×${f.h})`;
    btn.draggable = true;
    btn.title = "Drag vers la map ou un objet · click pour éditer";
    btn.ondragstart = (e) => e.dataTransfer.setData("application/x-luma-frame", String(f.id));
    btn.onclick = () => {
      if (window.LumaSpriteEditor) {
        const idx = frames.indexOf(f);
        if (idx >= 0) window.LumaSpriteEditor.open(idx);
      }
    };
    return btn;
  }, "Aucun sprite. Importe une image dans Sprite Editor.", (f) => deleteFrame(f));

  populateLibSection("libObjects", "libObjectsCount", objects, (o) => {
    const btn = document.createElement("button");
    const typeInfo = OBJECT_TYPES.find(t => t.id === o.type);
    const icon = typeInfo ? typeInfo.label.split(" ")[0] : "📦";
    btn.textContent = `${icon} #${String(o.id).padStart(2,"0")} ${o.name}`;
    btn.draggable = true;
    btn.title = `Drag vers la map pour placer · click pour éditer`;
    btn.ondragstart = (e) => e.dataTransfer.setData("application/x-luma-object", String(o.id));
    btn.onclick = () => setMode("objects");
    return btn;
  }, "Aucun objet. Crée-en un dans Objects/Events.", (o) => deleteObjectFromLib(o));

  // V1.5.3 — Tilesets dans la library
  populateLibSection("libTilesets", "libTilesetsCount", tilesets, (ts) => {
    const btn = document.createElement("button");
    btn.textContent = `🧱 ${ts.name} (${ts.tileSize}px · ${ts.tileCount})`;
    btn.title = "Click pour assigner à la map active";
    btn.onclick = () => {
      selectedTilesetId = ts.id;
      if (currentMap) currentMap.tilesetId = ts.id;
      selectedTileIndex = 0;
      refreshTilesetSelectors();
      drawTilesetSelectorGrid();
      if (currentMap && currentScene) renderSceneEditor();
      $("hint").textContent = `✓ Tileset « ${ts.name} » assigné.`;
    };
    return btn;
  }, "Aucun tileset.");

  populateLibSection("libMaps", "libMapsCount", maps, (m) => {
    const btn = document.createElement("button");
    btn.textContent = `🗺 ${m.id} (${m.width}×${m.height})`;
    btn.onclick = () => { currentMap = m; renderSceneEditor(); };
    return btn;
  }, "Aucune map.");

  populateLibSection("libMusic", "libMusicCount", [music], (m) => {
    const btn = document.createElement("button");
    btn.textContent = `🎵 ${m.name || "theme_01"} · ${m.tempo || 120}BPM`;
    btn.onclick = () => setMode("music");
    return btn;
  }, "");

  populateLibSection("libDialogues", "libDialoguesCount", dialogues, (d) => {
    const btn = document.createElement("button");
    btn.textContent = `💬 ${d.id || "dlg"}`;
    return btn;
  }, "Aucun dialogue.");

  populateLibSection("libEvents", "libEventsCount", events, (e) => {
    const btn = document.createElement("button");
    btn.textContent = `⚡ ${e.name || "event"}`;
    return btn;
  }, "Aucun event.");
}

function populateLibSection(divId, countId, items, makeBtn, emptyText, deleteFn) {
  const el = $(divId);
  if (!el) return;
  el.innerHTML = "";
  if (items.length === 0) {
    el.className = "lib-list empty";
    el.textContent = emptyText;
  } else {
    el.className = "lib-list";
    for (const item of items) {
      if (deleteFn) {
        // V1.5.2 — Wrapper avec bouton × pour suppression
        const row = document.createElement("div");
        row.className = "lib-item-row";
        const btn = makeBtn(item);
        const del = document.createElement("button");
        del.className = "lib-item-del";
        del.textContent = "×";
        del.title = "Supprimer";
        del.onclick = (ev) => {
          ev.stopPropagation();
          deleteFn(item);
        };
        row.appendChild(btn);
        row.appendChild(del);
        el.appendChild(row);
      } else {
        el.appendChild(makeBtn(item));
      }
    }
  }
  const c = $(countId);
  if (c) c.textContent = items.length;
}

// V1.5.2 — Suppression sprite + détachement des objets qui le référencent
function deleteFrame(f) {
  const refsCount = objects.filter(o => o.spriteFrameId === f.id).length;
  const msg = refsCount > 0
    ? `Supprimer le sprite « ${f.name} » ? ${refsCount} objet(s) le référencent et perdront leur sprite.`
    : `Supprimer le sprite « ${f.name} » ?`;
  if (!confirm(msg)) return;
  // Détache des objets
  for (const o of objects) if (o.spriteFrameId === f.id) o.spriteFrameId = null;
  // Retire du cache de rendu
  for (const key of _spritePixelCache.keys()) {
    if (key.startsWith(f.id + ":")) _spritePixelCache.delete(key);
  }
  const idx = frames.indexOf(f);
  if (idx >= 0) frames.splice(idx, 1);
  refreshAllLists();
  updateCapacityBar();
  drawFramesGrid();
  if (window.LumaObjectEditor) window.LumaObjectEditor.refresh();
  if (currentMap && currentScene) renderSceneEditor();
  $("hint").textContent = `🗑 Sprite supprimé (${refsCount} objet(s) détaché(s)).`;
}

// V1.5.2 — Suppression objet depuis la library
function deleteObjectFromLib(o) {
  const refsInScene = currentScene && currentScene.objects
    ? currentScene.objects.filter(i => i.objectId === o.id).length : 0;
  const msg = refsInScene > 0
    ? `Supprimer l'objet « ${o.name} » ? ${refsInScene} instance(s) placée(s) dans la scène seront aussi supprimées.`
    : `Supprimer l'objet « ${o.name} » ?`;
  if (!confirm(msg)) return;
  const idx = objects.indexOf(o);
  if (idx >= 0) objects.splice(idx, 1);
  if (currentScene && currentScene.objects) {
    currentScene.objects = currentScene.objects.filter(i => i.objectId !== o.id);
  }
  refreshAllLists();
  updateCapacityBar();
  if (window.LumaObjectEditor) window.LumaObjectEditor.refresh();
  if (currentMap && currentScene) renderSceneEditor();
  $("hint").textContent = `🗑 Objet supprimé.`;
}

// Peuple le menu déroulant "Objet à placer" dans la scene toolbar
function refreshObjectPicker() {
  const picker = $("sceneObjectPicker");
  if (!picker) return;
  const prev = picker.value;
  picker.innerHTML = '<option value="">— Aucun objet —</option>';
  for (const o of objects) {
    const opt = document.createElement("option");
    opt.value = String(o.id);
    const typeInfo = OBJECT_TYPES.find(t => t.id === o.type);
    const typeLabel = typeInfo ? typeInfo.label.split(" ")[0] : "";
    opt.textContent = `${typeLabel} ${o.name} (#${String(o.id).padStart(2,"0")})`;
    picker.appendChild(opt);
  }
  if (prev && objects.find(o => String(o.id) === prev)) picker.value = prev;
}

function refreshMusicPicker() {
  const sel = $("sceneMusic");
  if (!sel) return;
  sel.innerHTML = `<option value="${music.name || "theme_01"}">${music.name || "theme_01"}</option>`;
}

function selectObject(o) {
  if (!o) return;
  const f = frames.find(fr => fr.id === o.spriteFrameId);
  $("hint").textContent = `🎯 ${o.name} (#${String(o.id).padStart(2,"0")}) — ${o.type} — sprite: ${f ? f.name : "aucun"} — behavior: ${o.behavior || "None"}`;
}

// ---------------------------------------------------------------------------
// CAPACITY BAR
// ---------------------------------------------------------------------------
function updateCapacityBar() {
  let sprites = 0;
  for (const f of frames) sprites += f.rgb565Bytes || 0;
  let audio = window.LumaMusicEditor ? window.LumaMusicEditor.getByteSize() : 0;
  let maps_b = 0;
  for (const m of maps) maps_b += (m.width || 0) * (m.height || 0) * 3;
  let code = objects.length * 64 + events.length * 96 +
             dialogues.reduce((a, d) => a + (d.text || "").length + 64, 0) +
             animations.reduce((a, an) => a + ((an.slots || []).length * 16) + 64, 0);
  const total = sprites + audio + maps_b + code;
  const pct = Math.min(100, Math.round((total / projectLimitBytes) * 100));

  const txt = $("capacityText");
  const fill = $("capacityBarFill");
  const br = $("capacityBreakdown");
  if (txt) txt.textContent = `Capacité projet ${formatBytes(total)} / ${formatBytes(projectLimitBytes)} (${pct}%)`;
  if (fill) {
    fill.style.width = pct + "%";
    if (pct > 95) fill.style.background = "linear-gradient(90deg,#ff304e,#ff7a8a)";
    else if (pct > 80) fill.style.background = "linear-gradient(90deg,#ffaa00,#fff25a)";
    else fill.style.background = "linear-gradient(90deg,#1fa84a,#4dff77)";
  }
  if (br) br.textContent = `🎨 ${formatBytes(sprites)} · 🎵 ${formatBytes(audio)} · 🗺 ${formatBytes(maps_b)} · ⚙ ${formatBytes(code)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

// ---------------------------------------------------------------------------
// COMPAT V1.4 modules
// ---------------------------------------------------------------------------
function renderObjects() { if (window.LumaObjectEditor) window.LumaObjectEditor.refresh(); }
function renderEvents()  { if (window.LumaObjectEditor) window.LumaObjectEditor.refresh(); }
function renderDialogues() {}
function renderCutscenes() {}
function renderTriggers() {}
function renderAll() {
  renderObjects(); renderEvents();
  if (currentMap && currentScene) renderSceneEditor();
  if (window.LumaMusicEditor) window.LumaMusicEditor.refresh();
  refreshAllLists();
  updateCapacityBar();
}
function updateMemory() {
  drawFramesGrid();
  refreshAllLists();
  updateCapacityBar();
}

// =============================================================================
// V1.5.3 — TILESETS : import, gestion, preview, sélection, rendu
// =============================================================================

// Cache de chargement des images de tileset
function getTilesetImage(ts) {
  if (!ts) return null;
  if (_tilesetImageCache.has(ts.id)) return _tilesetImageCache.get(ts.id);
  const img = new Image();
  img.onload = () => {
    // Force un re-render quand l'image est prête
    if (currentMode === "scene") renderSceneEditor();
    drawTilesetSelectorGrid();
    drawTilesetWorkspace();
  };
  img.src = ts.dataUrl;
  _tilesetImageCache.set(ts.id, img);
  return img;
}

// IMPORT — étape 1 : choisir une image (réutilise le handler IPC asset:import-image)
$("importTileset").addEventListener("click", async () => {
  try {
    const result = await window.lumaAPI.importImage();
    if (result.canceled) return;
    if (!result.ok) return alert(result.error || "Erreur import.");
    const img = new Image();
    img.onload = () => {
      _pendingTilesetImage = img;
      _pendingTilesetDataUrl = result.dataUrl;
      $("tilesetName").value = (result.name || "tileset").replace(/\.[^.]+$/, "");
      $("saveTileset").disabled = false;
      $("tilesetImportInfo").textContent =
        `Image chargée : ${img.width}×${img.height}px. Choisis un format puis Ajoute.`;
      drawTilesetWorkspace();
    };
    img.src = result.dataUrl;
  } catch (err) { alert("Erreur import : " + err.message); }
});

// IMPORT — étape 2 : confirmer et ajouter à la bibliothèque
$("saveTileset").addEventListener("click", () => {
  if (!_pendingTilesetImage) return alert("Importe d'abord une image.");
  const tileSize = Number($("tilesetSize").value) || 16;
  const name = ($("tilesetName").value || "tileset").trim();
  const cols = Math.floor(_pendingTilesetImage.width / tileSize);
  const rows = Math.floor(_pendingTilesetImage.height / tileSize);
  if (cols < 1 || rows < 1) {
    return alert(`L'image (${_pendingTilesetImage.width}×${_pendingTilesetImage.height}) est trop petite pour des tuiles ${tileSize}×${tileSize}.`);
  }
  const ts = {
    id: "ts_" + Date.now(),
    name, dataUrl: _pendingTilesetDataUrl,
    tileSize, cols, rows,
    tileCount: cols * rows,
    width: _pendingTilesetImage.width,
    height: _pendingTilesetImage.height
  };
  tilesets.push(ts);
  // Pré-charge dans le cache
  _tilesetImageCache.set(ts.id, _pendingTilesetImage);
  // Si pas de tileset actif, on prend celui-ci
  if (!selectedTilesetId) {
    selectedTilesetId = ts.id;
    if (currentMap) currentMap.tilesetId = ts.id;
  }
  _pendingTilesetImage = null;
  _pendingTilesetDataUrl = null;
  $("saveTileset").disabled = true;
  $("tilesetImportInfo").textContent = `✅ Tileset « ${name} » ajouté (${cols}×${rows} tuiles, ${tileSize}×${tileSize}px).`;
  refreshAllLists();
  refreshTilesetSelectors();
  drawTilesetWorkspace();
  drawTilesetSelectorGrid();
  if (currentMap && currentScene) renderSceneEditor();
});

// TILESET LIST dans le workspace
function renderTilesetList() {
  const el = $("tilesetList");
  if (!el) return;
  if (tilesets.length === 0) {
    el.innerHTML = '<p class="empty">Aucun tileset. Importe une image pour commencer.</p>';
    return;
  }
  el.innerHTML = "";
  for (const ts of tilesets) {
    const row = document.createElement("div");
    row.className = "tileset-row" + (ts.id === selectedTilesetId ? " active" : "");
    row.innerHTML = `
      <div class="tileset-row-thumb"><canvas width="48" height="48"></canvas></div>
      <div class="tileset-row-body">
        <strong>${ts.name}</strong>
        <span>${ts.cols}×${ts.rows} tuiles · ${ts.tileSize}px</span>
      </div>
      <button class="tileset-row-use" title="Utiliser pour la map active">✓</button>
      <button class="tileset-row-del" title="Supprimer">×</button>
    `;
    const cv = row.querySelector("canvas");
    drawTilesetThumb(cv, ts);
    row.querySelector(".tileset-row-use").onclick = () => {
      selectedTilesetId = ts.id;
      if (currentMap) currentMap.tilesetId = ts.id;
      selectedTileIndex = 0;
      refreshTilesetSelectors();
      drawTilesetSelectorGrid();
      renderTilesetList();
      if (currentMap && currentScene) renderSceneEditor();
      $("hint").textContent = `✓ Tileset « ${ts.name} » assigné à la map.`;
    };
    row.querySelector(".tileset-row-del").onclick = () => {
      if (!confirm(`Supprimer le tileset « ${ts.name} » ? Les maps qui l'utilisent perdront leur affichage.`)) return;
      const idx = tilesets.indexOf(ts);
      if (idx >= 0) tilesets.splice(idx, 1);
      _tilesetImageCache.delete(ts.id);
      // Détache des maps
      for (const m of maps) if (m.tilesetId === ts.id) m.tilesetId = null;
      if (selectedTilesetId === ts.id) selectedTilesetId = tilesets.length ? tilesets[0].id : null;
      refreshAllLists();
      refreshTilesetSelectors();
      drawTilesetSelectorGrid();
      renderTilesetList();
      if (currentMap && currentScene) renderSceneEditor();
    };
    el.appendChild(row);
  }
}

function drawTilesetThumb(cv, ts) {
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const img = getTilesetImage(ts);
  if (img && img.complete) {
    const scale = Math.min(cv.width / img.width, cv.height / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }
}

// TILESET IMPORT canvas preview
function drawTilesetWorkspace() {
  const cv = $("tilesetImportCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#dcdcdc";
  ctx.fillRect(0, 0, cv.width, cv.height);

  const img = _pendingTilesetImage;
  if (img) {
    const tileSize = Number($("tilesetSize").value) || 16;
    const scale = Math.min(cv.width / img.width, cv.height / img.height, 4);
    const dw = img.width * scale, dh = img.height * scale;
    const ox = Math.floor((cv.width - dw) / 2);
    const oy = Math.floor((cv.height - dh) / 2);
    ctx.drawImage(img, ox, oy, dw, dh);
    // grille des tuiles
    ctx.strokeStyle = "rgba(255,0,255,0.5)";
    ctx.lineWidth = 1;
    const cols = Math.floor(img.width / tileSize);
    const rows = Math.floor(img.height / tileSize);
    for (let i = 0; i <= cols; i++) {
      const x = Math.floor(ox + i * tileSize * scale) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + dh); ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = Math.floor(oy + j * tileSize * scale) + 0.5;
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + dw, y); ctx.stroke();
    }
  }
  renderTilesetList();
}

// Recalcule la preview quand on change le format
$("tilesetSize").addEventListener("change", drawTilesetWorkspace);

// SCENE SETUP — sélecteur tileset + grille de tuiles cliquables
function refreshTilesetSelectors() {
  const sel = $("sceneTileset");
  if (sel) {
    sel.innerHTML = '<option value="">— Aucun (couleurs) —</option>';
    for (const ts of tilesets) {
      const opt = document.createElement("option");
      opt.value = ts.id;
      opt.textContent = `${ts.name} (${ts.tileSize}px · ${ts.tileCount} tuiles)`;
      if (selectedTilesetId === ts.id) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

$("sceneTileset").addEventListener("change", (e) => {
  selectedTilesetId = e.target.value || null;
  if (currentMap) currentMap.tilesetId = selectedTilesetId;
  selectedTileIndex = 0;
  drawTilesetSelectorGrid();
  if (currentMap && currentScene) renderSceneEditor();
});

// Dessine la grille de tuiles cliquable dans Scene Setup
function drawTilesetSelectorGrid() {
  const el = $("tilesetPreview");
  if (!el) return;
  const ts = tilesets.find(t => t.id === selectedTilesetId);
  if (!ts) {
    el.innerHTML = '<p class="empty">Aucun tileset sélectionné.</p>';
    $("selectedTileLabel").textContent = "—";
    return;
  }
  const img = getTilesetImage(ts);
  // Cellule de 24px dans le preview (taille fixe pour rester lisible)
  const cellSize = 24;
  el.innerHTML = "";
  el.style.gridTemplateColumns = `repeat(${ts.cols}, ${cellSize}px)`;
  el.style.display = "grid";

  for (let r = 0; r < ts.rows; r++) {
    for (let c = 0; c < ts.cols; c++) {
      const idx = r * ts.cols + c;
      const cell = document.createElement("div");
      cell.className = "tile-cell" + (idx === selectedTileIndex ? " selected" : "");
      cell.title = `Tuile ${idx}`;
      cell.dataset.idx = idx;
      const cv = document.createElement("canvas");
      cv.width = cellSize; cv.height = cellSize;
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      if (img && img.complete) {
        ctx.drawImage(img,
          c * ts.tileSize, r * ts.tileSize, ts.tileSize, ts.tileSize,
          0, 0, cellSize, cellSize);
      } else {
        ctx.fillStyle = "#444";
        ctx.fillRect(0, 0, cellSize, cellSize);
      }
      cell.appendChild(cv);
      cell.onclick = () => {
        selectedTileIndex = idx;
        $("selectedTileLabel").textContent = `#${idx} (col ${c}, row ${r})`;
        el.querySelectorAll(".tile-cell").forEach(c2 => c2.classList.remove("selected"));
        cell.classList.add("selected");
      };
      el.appendChild(cell);
    }
  }
  $("selectedTileLabel").textContent = `#${selectedTileIndex}`;
}

// =============================================================================
// V1.5.3 — OUTILS DE PEINTURE (pencil, bucket, rect, circle, eraser)
// =============================================================================

document.querySelectorAll(".paint-tool").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".paint-tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentPaintTool = btn.dataset.tool;
    _shapeStart = null;
    $("hint").textContent = `Outil sélectionné : ${btn.title}`;
  });
});

// Helper : applique une valeur sur un tile (selon layer actif)
function paintTileAt(tx, ty, value) {
  if (!currentMap) return;
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return;
  const idx = ty * currentMap.width + tx;
  const layer = $("sceneLayer").value;
  if (layer === "floor" || layer === "decor") {
    currentMap.layers[layer][idx] = value;
  } else if (layer === "collision") {
    currentMap.layers.collision[idx] = value > 0 ? 1 : 0;
  }
}

// Flood fill (BFS) — remplit la zone de tiles connectées avec la même valeur
function floodFill(tx, ty, newValue) {
  if (!currentMap) return;
  const layer = $("sceneLayer").value;
  if (layer === "objects") return;
  const w = currentMap.width, h = currentMap.height;
  const target = layer === "collision"
    ? (currentMap.layers.collision[ty * w + tx] || 0)
    : currentMap.layers[layer][ty * w + tx];
  if (target === newValue) return;
  const queue = [[tx, ty]];
  const visited = new Uint8Array(w * h);
  let count = 0;
  while (queue.length && count < 5000) {
    const [x, y] = queue.shift();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (visited[i]) continue;
    visited[i] = 1;
    const cur = layer === "collision" ? currentMap.layers.collision[i] : currentMap.layers[layer][i];
    if (cur !== target) continue;
    paintTileAt(x, y, newValue);
    queue.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
    count++;
  }
}

// Dessine un rectangle entre (x0,y0) et (x1,y1) inclus
function drawRectTiles(x0, y0, x1, y1, value) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++)
      paintTileAt(x, y, value);
}

// Dessine un cercle/ellipse inscrite dans la box (x0,y0)-(x1,y1)
function drawCircleTiles(x0, y0, x1, y1, value) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
  const rx = Math.max(0.5, (xb - xa) / 2), ry = Math.max(0.5, (yb - ya) / 2);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1.05) paintTileAt(x, y, value);
    }
  }
}

// Détermine la valeur à peindre selon contexte
function getPaintValue() {
  const layer = $("sceneLayer").value;
  if (layer === "collision") return 1;
  // Si tileset actif : utiliser selectedTileIndex+1 (0 réservé = vide)
  if (selectedTilesetId) return selectedTileIndex + 1;
  // Fallback couleurs : utiliser tile 1-7 selon une valeur par défaut
  return 1;
}

// Init final
refreshTabs();
refreshAllLists();

