let selectedSize = "550ko";
let projectLimitBytes = 550 * 1024;
let importedImage = null;
let frames = [];
let objects = [];
let events = [];
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
    objects = data.objects || [];
    events = data.events || [];
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
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

// V0.5 Logic
$("addObject").addEventListener("click", () => {
  objects.push({
    id: Date.now(),
    name: $("objName").value || "object",
    type: $("objType").value,
    tags: $("objTags").value.split(",").map(t => t.trim()).filter(Boolean),
    behavior: $("objBehavior").value || "None"
  });
  renderObjects();
});

$("addEvent").addEventListener("click", () => {
  events.push({
    id: Date.now(),
    name: $("eventName").value || "event",
    condition: $("eventCondition").value,
    action: $("eventAction").value,
    target: $("eventTarget").value
  });
  renderEvents();
});

// V0.6 Music
$("addNote").addEventListener("click", () => {
  music.name = $("songName").value || "theme_01";
  music.tempo = Number($("songTempo").value) || 120;
  const track = $("trackSelect").value;
  music.tracks[track].push({
    note: $("noteSelect").value,
    octave: Number($("octaveSelect").value),
    duration: Number($("durationSelect").value)
  });
  renderMusic();
});

$("playMusic").addEventListener("click", () => {
  if (playing) { playing = false; return; }
  playing = true;
  playTrack("A");
  setTimeout(() => playTrack("B"), 20);
});

function playTrack(trackName) {
  if (!audioCtx) audioCtx = new AudioContext();
  let time = audioCtx.currentTime;
  const track = music.tracks[trackName];
  for (const n of track) {
    if (!playing) break;
    const dur = n.duration / 1000;
    if (n.note !== "REST") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = noteFreq(n.note, n.octave);
      gain.gain.value = 0.05;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + dur);
    }
    time += dur;
  }
  setTimeout(() => playing = false, Math.max(100, (time - audioCtx.currentTime) * 1000));
}

function noteFreq(note, octave) {
  const semis = { C:-9, D:-7, E:-5, F:-4, G:-2, A:0, B:2 };
  return 440 * Math.pow(2, (semis[note] + (octave - 4) * 12) / 12);
}

// V0.7 Narrative
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
  await window.lumaAPI.saveFrames(frames);
  await window.lumaAPI.saveLogic({ objects, events, variables: [] });
  await window.lumaAPI.saveMusic(music);
  const result = await window.lumaAPI.saveNarrative({ dialogues, cutscenes, triggers });
  alert(result.ok ? "Projet sauvegardé." : result.error || "Erreur sauvegarde.");
});

function renderList(id, items, map) {
  const el = $(id);
  el.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "data-item";
    div.innerHTML = map(item);
    el.appendChild(div);
  });
}

function renderObjects() { renderList("objectsList", objects, o => `<strong>${o.name}</strong><br>${o.type}<br>Behavior: ${o.behavior}<br>Tags: ${o.tags.join(", ")}`); }
function renderEvents() { renderList("eventsList", events, e => `<strong>${e.name}</strong><br>IF ${e.condition}<br>THEN ${e.action} → ${e.target}`); }
function renderMusic() {
  renderList("trackA", music.tracks.A, n => `<strong>${n.note}${n.note !== "REST" ? n.octave : ""}</strong> — ${n.duration}ms`);
  renderList("trackB", music.tracks.B, n => `<strong>${n.note}${n.note !== "REST" ? n.octave : ""}</strong> — ${n.duration}ms`);
}
function renderDialogues() { renderList("dialoguesList", dialogues, d => `<strong>${d.id}</strong><br>${d.speaker}: ${d.text}<br>next: ${d.next || "-"}`); }
function renderCutSteps() { renderList("cutSteps", currentCutSteps, s => `<strong>${s.time}s</strong> ${s.action}<br>${s.target} ${s.value}`); }
function renderCutscenes() { renderList("cutscenesList", cutscenes, c => `<strong>${c.id}</strong><br>${c.steps.length} step(s)`); }
function renderTriggers() { renderList("triggersList", triggers, t => `<strong>${t.id}</strong><br>IF ${t.condition}<br>THEN ${t.action} → ${t.target}`); }
function renderAll() { renderObjects(); renderEvents(); renderMusic(); renderDialogues(); renderCutscenes(); renderTriggers(); renderSceneEditor(); }



// V0.8 MAP / SCENE EDITOR
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
  if (!currentScene) return;
  camera.x = Math.max(0, currentScene.playerSpawn.x - 80);
  camera.y = Math.max(0, currentScene.playerSpawn.y - 64);
  renderSceneEditor();
});

$("playScenePreview").addEventListener("click", () => {
  testPlayer.active = !testPlayer.active;
  if (testPlayer.active && currentScene) {
    testPlayer.x = currentScene.playerSpawn.x;
    testPlayer.y = currentScene.playerSpawn.y;
    camera.x = Math.max(0, testPlayer.x - 80);
    camera.y = Math.max(0, testPlayer.y - 64);
  }
  renderSceneEditor();
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
    camera.x = Math.max(0, px - 80);
    camera.y = Math.max(0, py - 64);
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
  let nx = testPlayer.x;
  let ny = testPlayer.y;

  if (event.key === "ArrowLeft") nx -= speed;
  if (event.key === "ArrowRight") nx += speed;
  if (event.key === "ArrowUp") ny -= speed;
  if (event.key === "ArrowDown") ny += speed;

  if (!isSolidAt(nx, ny) && !isSolidAt(nx + testPlayer.size, ny + testPlayer.size)) {
    testPlayer.x = nx;
    testPlayer.y = ny;
  }

  if (currentScene?.cameraMode === "follow_player") {
    camera.x = Math.max(0, testPlayer.x - 80);
    camera.y = Math.max(0, testPlayer.y - 64);
  }

  renderSceneEditor();
});

function isSolidAt(px, py) {
  const t = currentMap.tileSize;
  const tx = Math.floor(px / t);
  const ty = Math.floor(py / t);
  if (tx < 0 || ty < 0 || tx >= currentMap.width || ty >= currentMap.height) return true;
  return currentMap.layers.collision[ty * currentMap.width + tx] > 0;
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

function drawPlacedObjects() {
  for (const obj of currentScene.objects) {
    mapCtx.fillStyle = "#fff25a";
    mapCtx.fillRect(obj.x, obj.y, 14, 14);
    mapCtx.fillStyle = "#000";
    mapCtx.font = "8px monospace";
    mapCtx.fillText("O", obj.x + 4, obj.y + 10);
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
  lumaCtx.clearRect(0, 0, 160, 128);
  lumaCtx.drawImage(mapCanvas, camera.x, camera.y, 160, 128, 0, 0, 160, 128);
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



// V0.9 BUILD / EXPORT PIPELINE
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
