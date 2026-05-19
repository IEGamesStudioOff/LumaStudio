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
function renderAll() { renderObjects(); renderEvents(); renderMusic(); renderDialogues(); renderCutscenes(); renderTriggers(); }
