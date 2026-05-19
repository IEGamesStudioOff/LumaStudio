const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let currentProjectPath = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "Luma Studio v0.6",
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function safeName(name) {
  return String(name || "MonProjet")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "MonProjet";
}

/* ---------------------- PROJET ---------------------- */

ipcMain.handle("project:create", async (_event, project) => {
  const result = await dialog.showOpenDialog({
    title: "Choisir le dossier où créer le projet Luma",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }

  const baseDir = result.filePaths[0];
  const projectName = safeName(project.name);
  const projectDir = path.join(baseDir, projectName);

  if (fs.existsSync(projectDir)) {
    return { ok: false, error: "Un dossier avec ce nom existe déjà." };
  }

  const folders = [
    "assets",
    "assets/sprites",
    "assets/tilesets",
    "assets/audio",
    "assets/portraits",
    "maps",
    "dialogues",
    "scenes",
    "objects",
    "events",
    "variables",
    "music",
    "build",
    "exports"
  ];

  fs.mkdirSync(projectDir, { recursive: true });
  for (const folder of folders) fs.mkdirSync(path.join(projectDir, folder), { recursive: true });

  const config = {
    lumaStudioVersion: "0.6.0",
    projectName: project.name,
    editorName: project.editor,
    gameSize: project.size,
    createdAt: new Date().toISOString(),
    target: {
      screenWidth: 160,
      screenHeight: 128,
      tileSize: 16,
      colorFormat: "RGB565",
      format: "LUMA",
      driver: "ST7735"
    }
  };

  fs.writeFileSync(path.join(projectDir, "config.json"), JSON.stringify(config, null, 2), "utf8");

  fs.writeFileSync(path.join(projectDir, "game.luma"),
`# LUMA GAME FILE
# Projet: ${project.name}
# Editeur: ${project.editor}
# Taille cible: ${project.size}

GAME "${project.name}"
EDITOR "${project.editor}"
SCREEN 160 128
COLOR_FORMAT RGB565
TILESIZE 16
START_SCENE "scene_001"
`,
    "utf8"
  );

  fs.writeFileSync(path.join(projectDir, "assets", "sprites", "frames.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "assets", "sprites", "animations.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "objects", "objects.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "events", "events.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "variables", "variables.json"), JSON.stringify({ global: [], scene: [], object: [] }, null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "music", "music.json"), JSON.stringify([], null, 2), "utf8");

  currentProjectPath = projectDir;
  return { ok: true, path: projectDir };
});

ipcMain.handle("project:get-current", async () => {
  return { ok: true, path: currentProjectPath };
});

/* ---------------------- ASSETS ---------------------- */

ipcMain.handle("asset:import-image", async () => {
  const result = await dialog.showOpenDialog({
    title: "Importer une image ou spritesheet",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  let importedPath = null;
  if (currentProjectPath) {
    importedPath = path.join(currentProjectPath, "assets", "sprites", name);
    fs.copyFileSync(filePath, importedPath);
  }

  const imageBuffer = fs.readFileSync(filePath);
  const dataUrl = `data:image/${ext.replace(".", "").replace("jpg", "jpeg")};base64,${imageBuffer.toString("base64")}`;

  return {
    ok: true,
    name,
    originalPath: filePath,
    projectPath: importedPath,
    dataUrl,
    isGif: ext === ".gif"
  };
});

ipcMain.handle("asset:save-frames", async (_event, frames) => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }

  const framesPath = path.join(currentProjectPath, "assets", "sprites", "frames.json");
  fs.writeFileSync(framesPath, JSON.stringify(frames, null, 2), "utf8");

  return { ok: true, path: framesPath };
});

ipcMain.handle("animation:save", async (_event, animations) => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }
  const animsPath = path.join(currentProjectPath, "assets", "sprites", "animations.json");
  fs.writeFileSync(animsPath, JSON.stringify(animations, null, 2), "utf8");
  return { ok: true, path: animsPath };
});

ipcMain.handle("animation:load", async () => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }
  const animsPath = path.join(currentProjectPath, "assets", "sprites", "animations.json");
  if (!fs.existsSync(animsPath)) return { ok: true, animations: [] };
  const raw = fs.readFileSync(animsPath, "utf8");
  return { ok: true, animations: JSON.parse(raw) };
});

/* Sauvegarde du PNG d'une frame éditée (export visuel pour le user) */
ipcMain.handle("asset:save-frame-png", async (_event, { name, dataUrl }) => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }
  const safe = safeName(name) + ".png";
  const outPath = path.join(currentProjectPath, "assets", "sprites", safe);

  const base64 = dataUrl.split(",")[1];
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));

  return { ok: true, path: outPath };
});


/* ---------------------- OBJECT / EVENT DATABASE ---------------------- */

function ensureProjectFile(relPath, fallback) {
  if (!currentProjectPath) return null;
  const full = path.join(currentProjectPath, ...relPath.split("/"));
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(full)) fs.writeFileSync(full, JSON.stringify(fallback, null, 2), "utf8");
  return full;
}

ipcMain.handle("database:load", async () => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }

  const objectsPath = ensureProjectFile("objects/objects.json", []);
  const eventsPath = ensureProjectFile("events/events.json", []);
  const variablesPath = ensureProjectFile("variables/variables.json", { global: [], scene: [], object: [] });

  return {
    ok: true,
    objects: JSON.parse(fs.readFileSync(objectsPath, "utf8")),
    events: JSON.parse(fs.readFileSync(eventsPath, "utf8")),
    variables: JSON.parse(fs.readFileSync(variablesPath, "utf8"))
  };
});

ipcMain.handle("database:save", async (_event, payload) => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }

  const objectsPath = ensureProjectFile("objects/objects.json", []);
  const eventsPath = ensureProjectFile("events/events.json", []);
  const variablesPath = ensureProjectFile("variables/variables.json", { global: [], scene: [], object: [] });

  fs.writeFileSync(objectsPath, JSON.stringify(payload.objects || [], null, 2), "utf8");
  fs.writeFileSync(eventsPath, JSON.stringify(payload.events || [], null, 2), "utf8");
  fs.writeFileSync(variablesPath, JSON.stringify(payload.variables || { global: [], scene: [], object: [] }, null, 2), "utf8");

  return { ok: true, objectsPath, eventsPath, variablesPath };
});

ipcMain.handle("database:export-luma", async (_event, payload) => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }

  const outPath = path.join(currentProjectPath, "build", "logic_preview.luma");
  if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const objects = payload.objects || [];
  const events = payload.events || [];
  const variables = payload.variables || { global: [], scene: [], object: [] };

  let text = "# LUMA LOGIC PREVIEW - V0.5\\n";
  text += "# Ce fichier est un aperçu lisible. La compilation binaire viendra plus tard.\\n\\n";

  text += "[VARIABLES]\\n";
  for (const scope of ["global", "scene", "object"]) {
    for (const v of (variables[scope] || [])) {
      text += `VAR ${scope} ${v.name} ${v.type} ${JSON.stringify(v.defaultValue)}\\n`;
    }
  }

  text += "\\n[OBJECTS]\\n";
  for (const o of objects) {
    text += `OBJECT ${o.id} "${o.name}" TYPE ${o.type}\\n`;
    text += `  SPRITE ${o.spriteIdle || "none"}\\n`;
    text += `  HITBOX ${o.hitbox.x} ${o.hitbox.y} ${o.hitbox.w} ${o.hitbox.h}\\n`;
    text += `  STATS speed=${o.speed} hp=${o.health} damage=${o.damage}\\n`;
    text += `  TAGS ${(o.tags || []).join(",")}\\n`;
    text += `  BEHAVIORS ${(o.behaviors || []).map(b => b.name).join(",")}\\n`;
  }

  text += "\\n[EVENTS]\\n";
  for (const e of events) {
    text += `EVENT ${e.id} "${e.name}" ENABLED ${e.enabled ? 1 : 0}\\n`;
    for (const c of (e.conditions || [])) text += `  IF ${c.type} ${JSON.stringify(c.params || {})}\\n`;
    for (const a of (e.actions || [])) text += `  THEN ${a.type} ${JSON.stringify(a.params || {})}\\n`;
  }

  fs.writeFileSync(outPath, text, "utf8");
  return { ok: true, path: outPath };
});


/* ---------------------- MUSIC EDITOR V0.6 ---------------------- */

ipcMain.handle("music:load", async () => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };
  const musicPath = ensureProjectFile("music/music.json", []);
  if (!musicPath) return { ok: false, error: "Aucun projet actif." };
  try {
    const raw = fs.readFileSync(musicPath, "utf8");
    return { ok: true, songs: JSON.parse(raw || "[]") };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("music:save", async (_event, songs) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };
  const musicPath = ensureProjectFile("music/music.json", []);
  fs.writeFileSync(musicPath, JSON.stringify(Array.isArray(songs) ? songs : [], null, 2), "utf8");
  return { ok: true, path: musicPath };
});

ipcMain.handle("music:export", async (_event, songs) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };
  const buildDir = path.join(currentProjectPath, "build");
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const list = Array.isArray(songs) ? songs : [];

  // Export texte lisible : parfait pour vérifier avant le vrai binaire Luma.
  let text = "# LUMA MUSIC PREVIEW - V0.6\n";
  text += "# 2 pistes: BUZZER_A / BUZZER_B. REST = silence.\n\n";

  for (const song of list) {
    text += `SONG ${song.id} \"${song.name}\" TEMPO ${song.tempo} STEPS ${song.steps}\n`;
    for (const trackName of ["A", "B"]) {
      text += `  TRACK_${trackName}\n`;
      const track = (song.tracks && song.tracks[trackName]) || [];
      for (let i = 0; i < track.length; i++) {
        const n = track[i] || { note: "REST", octave: 4, duration: 1 };
        text += `    STEP ${String(i).padStart(2, "0")} ${n.note}${n.note === "REST" ? "" : n.octave} DUR ${n.duration}\n`;
      }
    }
    text += "\n";
  }

  const txtPath = path.join(buildDir, "music_preview.lmus");
  fs.writeFileSync(txtPath, text, "utf8");

  // Export binaire préliminaire LMU1 : compact, facile à relire côté ESP32 plus tard.
  // Header: LMU1, version uint16, songCount uint16
  // Song: name[16], tempo uint16, steps uint16, puis 2 tracks * steps * 4 bytes
  // Note code: REST=0, C=1,D=2,E=3,F=4,G=5,A=6,B=7 ; octave ; duration ; effect
  const NOTE = { REST: 0, C: 1, D: 2, E: 3, F: 4, G: 5, A: 6, B: 7 };
  let total = 8;
  for (const song of list) total += 16 + 2 + 2 + (2 * (song.steps || 32) * 4);
  const buf = Buffer.alloc(total);
  buf.write("LMU1", 0, "ascii");
  buf.writeUInt16LE(1, 4);
  buf.writeUInt16LE(list.length, 6);
  let cur = 8;
  for (const song of list) {
    const nameBuf = Buffer.alloc(16);
    nameBuf.write(String(song.name || "song").slice(0, 15), "ascii");
    nameBuf.copy(buf, cur); cur += 16;
    buf.writeUInt16LE(Number(song.tempo || 120), cur); cur += 2;
    buf.writeUInt16LE(Number(song.steps || 32), cur); cur += 2;
    for (const trackName of ["A", "B"]) {
      const track = (song.tracks && song.tracks[trackName]) || [];
      for (let i = 0; i < Number(song.steps || 32); i++) {
        const n = track[i] || { note: "REST", octave: 4, duration: 1, effect: 0 };
        buf.writeUInt8(NOTE[n.note] ?? 0, cur++);
        buf.writeUInt8(Number(n.octave || 4), cur++);
        buf.writeUInt8(Number(n.duration || 1), cur++);
        buf.writeUInt8(Number(n.effect || 0), cur++);
      }
    }
  }
  const binPath = path.join(buildDir, "music.lmusbin");
  fs.writeFileSync(binPath, buf);

  return { ok: true, textPath: txtPath, binaryPath: binPath, bytes: total };
});


/* ---------------------- PIPELINE LPK ---------------------- */

/**
 * Reçoit un payload { frames: [{name, w, h, rgb565: number[]}] }
 * Écrit un fichier .lpk binaire dans build/sprites.lpk
 *
 * Format LPK1 (préliminaire, V0.3) :
 *   [0..3]   magic "LPK1"
 *   [4..5]   version uint16 LE
 *   [6..7]   count   uint16 LE (nombre de frames)
 *   [8..]    table d'index, par frame :
 *              name[16]  ASCII zéro-paddé
 *              w  uint16 LE
 *              h  uint16 LE
 *              offset uint32 LE (depuis début pixel data)
 *   puis pixel data : pour chaque frame, w*h * uint16 LE RGB565
 */
ipcMain.handle("pipeline:write-lpk", async (_event, payload) => {
  if (!currentProjectPath) {
    return { ok: false, error: "Aucun projet actif." };
  }

  const frames = Array.isArray(payload && payload.frames) ? payload.frames : [];
  if (!frames.length) return { ok: false, error: "Aucune frame à exporter." };

  const HEADER_SIZE = 8;
  const ENTRY_SIZE  = 16 /*name*/ + 2 + 2 + 4; /* = 24 octets par entrée */
  const indexSize   = ENTRY_SIZE * frames.length;
  let pixelSize     = 0;
  for (const f of frames) pixelSize += f.w * f.h * 2;

  const total = HEADER_SIZE + indexSize + pixelSize;
  const buf = Buffer.alloc(total);

  /* Header */
  buf.write("LPK1", 0, "ascii");
  buf.writeUInt16LE(1, 4);
  buf.writeUInt16LE(frames.length, 6);

  /* Table d'index */
  let cursor = HEADER_SIZE;
  let pixelOffset = 0;
  for (const f of frames) {
    const nameBuf = Buffer.alloc(16);
    nameBuf.write(String(f.name || "frame").slice(0, 15), "ascii");
    nameBuf.copy(buf, cursor);
    buf.writeUInt16LE(f.w, cursor + 16);
    buf.writeUInt16LE(f.h, cursor + 18);
    buf.writeUInt32LE(pixelOffset, cursor + 20);
    cursor += ENTRY_SIZE;
    pixelOffset += f.w * f.h * 2;
  }

  /* Pixel data RGB565 LE */
  let dataCursor = HEADER_SIZE + indexSize;
  for (const f of frames) {
    const px = f.rgb565 || [];
    for (let i = 0; i < f.w * f.h; i++) {
      buf.writeUInt16LE(px[i] || 0, dataCursor);
      dataCursor += 2;
    }
  }

  const buildDir = path.join(currentProjectPath, "build");
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
  const outPath = path.join(buildDir, "sprites.lpk");
  fs.writeFileSync(outPath, buf);

  return { ok: true, path: outPath, bytes: total };
});
