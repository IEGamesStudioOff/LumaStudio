const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");

let currentProjectPath = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "Luma Studio v0.7",
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

function ensureProjectFolders(projectDir) {
  const folders = [
    "assets",
    "assets/sprites",
    "assets/tilesets",
    "assets/audio",
    "assets/portraits",
    "maps",
    "maps/bin",
    "dialogues",
    "cutscenes",
    "triggers",
    "scenes",
    "objects",
    "events",
    "music",
    "build",
    "exports",
    "exports/builds",
    "exports/secure"
  ];

  for (const folder of folders) {
    fs.mkdirSync(path.join(projectDir, folder), { recursive: true });
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

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

  fs.mkdirSync(projectDir, { recursive: true });
  ensureProjectFolders(projectDir);

  const config = {
    lumaStudioVersion: "0.7.0",
    projectName: project.name,
    editorName: project.editor,
    gameSize: project.size,
    createdAt: new Date().toISOString(),
    target: {
      screenWidth: 160,
      screenHeight: 128,
      tileSize: 16,
      colorFormat: "RGB565",
      format: "LUMA"
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
  fs.writeFileSync(path.join(projectDir, "objects", "objects.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "events", "events.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "music", "music.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "dialogues", "dialogues.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "cutscenes", "cutscenes.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "triggers", "triggers.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "maps", "maps.json"), JSON.stringify([], null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "scenes", "scenes.json"), JSON.stringify([], null, 2), "utf8");

  currentProjectPath = projectDir;
  return { ok: true, path: projectDir, config };
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Ouvrir un projet Luma",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }

  const projectDir = result.filePaths[0];
  const configPath = path.join(projectDir, "config.json");

  if (!fs.existsSync(configPath)) {
    return { ok: false, error: "Ce dossier ne contient pas de config.json Luma." };
  }

  ensureProjectFolders(projectDir);
  currentProjectPath = projectDir;

  const config = readJsonSafe(configPath, {});
  const projectData = {
    config,
    frames: readJsonSafe(path.join(projectDir, "assets", "sprites", "frames.json"), []),
    objects: readJsonSafe(path.join(projectDir, "objects", "objects.json"), []),
    events: readJsonSafe(path.join(projectDir, "events", "events.json"), []),
    music: readJsonSafe(path.join(projectDir, "music", "music.json"), []),
    dialogues: readJsonSafe(path.join(projectDir, "dialogues", "dialogues.json"), []),
    cutscenes: readJsonSafe(path.join(projectDir, "cutscenes", "cutscenes.json"), []),
    triggers: readJsonSafe(path.join(projectDir, "triggers", "triggers.json"), []),
    maps: readJsonSafe(path.join(projectDir, "maps", "maps.json"), []),
    scenes: readJsonSafe(path.join(projectDir, "scenes", "scenes.json"), [])
  };

  return { ok: true, path: projectDir, projectData };
});

ipcMain.handle("project:get-current", async () => {
  return { ok: true, path: currentProjectPath };
});

ipcMain.handle("asset:import-image", async () => {
  const result = await dialog.showOpenDialog({
    title: "Importer une image ou spritesheet",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
  });

  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  let importedPath = null;
  if (currentProjectPath) {
    importedPath = path.join(currentProjectPath, "assets", "sprites", name);
    fs.copyFileSync(filePath, importedPath);
  }

  const imageBuffer = fs.readFileSync(filePath);
  const mime = ext === ".jpg" ? "jpeg" : ext.replace(".", "");
  const dataUrl = `data:image/${mime};base64,${imageBuffer.toString("base64")}`;

  return { ok: true, name, originalPath: filePath, projectPath: importedPath, dataUrl, isGif: ext === ".gif" };
});

ipcMain.handle("portrait:import", async () => {
  const result = await dialog.showOpenDialog({
    title: "Importer un portrait",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });

  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  let importedPath = null;
  if (currentProjectPath) {
    importedPath = path.join(currentProjectPath, "assets", "portraits", name);
    fs.copyFileSync(filePath, importedPath);
  }

  const imageBuffer = fs.readFileSync(filePath);
  const mime = ext === ".jpg" ? "jpeg" : ext.replace(".", "");
  const dataUrl = `data:image/${mime};base64,${imageBuffer.toString("base64")}`;

  return { ok: true, name, path: importedPath, dataUrl };
});

ipcMain.handle("asset:save-frames", async (_event, frames) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };
  const framesPath = path.join(currentProjectPath, "assets", "sprites", "frames.json");
  fs.writeFileSync(framesPath, JSON.stringify(frames, null, 2), "utf8");
  return { ok: true, path: framesPath };
});

ipcMain.handle("logic:save-v05", async (_event, data) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };

  fs.writeFileSync(path.join(currentProjectPath, "objects", "objects.json"), JSON.stringify(data.objects || [], null, 2), "utf8");
  fs.writeFileSync(path.join(currentProjectPath, "events", "events.json"), JSON.stringify(data.events || [], null, 2), "utf8");
  fs.writeFileSync(path.join(currentProjectPath, "events", "variables.json"), JSON.stringify(data.variables || [], null, 2), "utf8");

  return { ok: true };
});

ipcMain.handle("music:save", async (_event, music) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };
  fs.writeFileSync(path.join(currentProjectPath, "music", "music.json"), JSON.stringify(music, null, 2), "utf8");
  return { ok: true };
});

ipcMain.handle("narrative:save", async (_event, data) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };

  fs.writeFileSync(path.join(currentProjectPath, "dialogues", "dialogues.json"), JSON.stringify(data.dialogues || [], null, 2), "utf8");
  fs.writeFileSync(path.join(currentProjectPath, "cutscenes", "cutscenes.json"), JSON.stringify(data.cutscenes || [], null, 2), "utf8");
  fs.writeFileSync(path.join(currentProjectPath, "triggers", "triggers.json"), JSON.stringify(data.triggers || [], null, 2), "utf8");

  let preview = `# LUMA NARRATIVE PREVIEW\n\n`;
  preview += `# DIALOGUES\n`;
  for (const d of data.dialogues || []) {
    preview += `DIALOG ${d.id} SPEAKER "${d.speaker}" PORTRAIT "${d.portrait}" SPEED ${d.speed}\n`;
    preview += `TEXT "${String(d.text || "").replace(/"/g, "'")}"\n`;
    if (d.next) preview += `NEXT ${d.next}\n`;
    preview += `END_DIALOG\n\n`;
  }

  preview += `# CUTSCENES\n`;
  for (const c of data.cutscenes || []) {
    preview += `CUTSCENE ${c.id}\n`;
    for (const step of c.steps || []) {
      preview += `AT ${step.time} ${step.action} ${step.target || ""} ${step.value || ""}\n`;
    }
    preview += `END_CUTSCENE\n\n`;
  }

  preview += `# TRIGGERS\n`;
  for (const t of data.triggers || []) {
    preview += `TRIGGER ${t.id} IF ${t.condition} THEN ${t.action} ${t.target}\n`;
  }

  fs.writeFileSync(path.join(currentProjectPath, "exports",
    "exports/builds",
    "exports/secure", "narrative_preview.luma"), preview, "utf8");

  return { ok: true, path: path.join(currentProjectPath, "exports",
    "exports/builds",
    "exports/secure", "narrative_preview.luma") };
});


ipcMain.handle("scene:save-v08", async (_event, data) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };

  const maps = data.maps || [];
  const scenes = data.scenes || [];

  fs.writeFileSync(path.join(currentProjectPath, "maps", "maps.json"), JSON.stringify(maps, null, 2), "utf8");
  fs.writeFileSync(path.join(currentProjectPath, "scenes", "scenes.json"), JSON.stringify(scenes, null, 2), "utf8");

  let preview = `# LUMA SCENE PREVIEW\n\n`;

  for (const map of maps) {
    preview += `MAP ${map.id} ${map.width} ${map.height} TILESIZE ${map.tileSize}\n`;
    preview += `LAYER_FLOOR ${map.layers.floor.join(",")}\n`;
    preview += `LAYER_DECOR ${map.layers.decor.join(",")}\n`;
    preview += `LAYER_COLLISION ${map.layers.collision.join(",")}\n`;
    preview += `END_MAP\n\n`;
  }

  for (const scene of scenes) {
    preview += `SCENE ${scene.id}\n`;
    preview += `NAME "${scene.name}"\n`;
    preview += `MAP ${scene.mapId}\n`;
    preview += `MUSIC ${scene.music || "none"}\n`;
    preview += `SPAWN ${scene.playerSpawn.x} ${scene.playerSpawn.y}\n`;
    preview += `CAMERA ${scene.cameraMode}\n`;

    for (const object of scene.objects || []) {
      preview += `OBJECT ${object.objectId} INSTANCE ${object.instanceName} X ${object.x} Y ${object.y} LAYER ${object.layer}\n`;
    }

    for (const trigger of scene.triggers || []) {
      preview += `TRIGGER ${trigger.id} X ${trigger.x} Y ${trigger.y} W ${trigger.w} H ${trigger.h} ACTION ${trigger.action} TARGET ${trigger.target}\n`;
    }

    preview += `END_SCENE\n\n`;
  }

  fs.writeFileSync(path.join(currentProjectPath, "exports",
    "exports/builds",
    "exports/secure", "scene_preview.luma"), preview, "utf8");

  // First simple binary map export: width u16, height u16, then tile indices as bytes
  for (const map of maps) {
    const bytes = [];
    bytes.push(map.width & 255, (map.width >> 8) & 255);
    bytes.push(map.height & 255, (map.height >> 8) & 255);
    bytes.push(...map.layers.floor.map(v => Number(v) & 255));
    bytes.push(...map.layers.decor.map(v => Number(v) & 255));
    bytes.push(...map.layers.collision.map(v => Number(v) & 255));
    fs.writeFileSync(path.join(currentProjectPath, "maps", "bin", `${map.id}.lmapbin`), Buffer.from(bytes));
  }

  return {
    ok: true,
    path: path.join(currentProjectPath, "exports",
    "exports/builds",
    "exports/secure", "scene_preview.luma")
  };
});


function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function xorCryptBuffer(buffer, keyBuffer) {
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] ^ keyBuffer[i % keyBuffer.length];
  return out;
}

function makeLPK(projectDir, outputPath, secureKey = null) {
  const assetsDir = path.join(projectDir, "assets");
  const files = [];

  function walk(dir, prefix = "") {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.join(prefix, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) walk(full, rel);
      else files.push({ full, rel, size: fs.statSync(full).size });
    }
  }

  walk(assetsDir);

  const table = [];
  const chunks = [];
  let offset = 0;

  for (const f of files) {
    const data = fs.readFileSync(f.full);
    table.push({ name: f.rel, offset, size: data.length, type: path.extname(f.rel).replace(".", "") || "bin" });
    chunks.push(data);
    offset += data.length;
  }

  const header = Buffer.from(JSON.stringify({
    magic: "LUMA_LPK_V1",
    secure: !!secureKey,
    assetCount: table.length,
    table
  }), "utf8");

  const headerSize = Buffer.alloc(4);
  headerSize.writeUInt32LE(header.length, 0);

  let pack = Buffer.concat([Buffer.from("LPK1"), headerSize, header, ...chunks]);

  if (secureKey) {
    const key = crypto.createHash("sha256").update(secureKey).digest();
    pack = Buffer.concat([Buffer.from("LPKE"), xorCryptBuffer(pack, key)]);
  }

  fs.writeFileSync(outputPath, pack);
  return { assetCount: table.length, size: pack.length };
}

function makeGameLuma(projectDir, outputPath, secureKey = null) {
  const config = readJsonSafe(path.join(projectDir, "config.json"), {});
  const objects = readJsonSafe(path.join(projectDir, "objects", "objects.json"), []);
  const events = readJsonSafe(path.join(projectDir, "events", "events.json"), []);
  const music = readJsonSafe(path.join(projectDir, "music", "music.json"), {});
  const dialogues = readJsonSafe(path.join(projectDir, "dialogues", "dialogues.json"), []);
  const cutscenes = readJsonSafe(path.join(projectDir, "cutscenes", "cutscenes.json"), []);
  const triggers = readJsonSafe(path.join(projectDir, "triggers", "triggers.json"), []);
  const maps = readJsonSafe(path.join(projectDir, "maps", "maps.json"), []);
  const scenes = readJsonSafe(path.join(projectDir, "scenes", "scenes.json"), []);

  const gameData = {
    magic: "LUMA_GAME_V1",
    config,
    objects,
    events,
    music,
    dialogues,
    cutscenes,
    triggers,
    maps,
    scenes
  };

  let data = Buffer.from(JSON.stringify(gameData, null, 2), "utf8");

  if (secureKey) {
    const key = crypto.createHash("sha256").update(secureKey).digest();
    data = Buffer.concat([Buffer.from("LUME"), xorCryptBuffer(data, key)]);
  }

  fs.writeFileSync(outputPath, data);
  return { size: data.length, scenes: scenes.length, objects: objects.length, events: events.length };
}

function validateProject(projectDir) {
  const warnings = [];
  const errors = [];

  const config = readJsonSafe(path.join(projectDir, "config.json"), null);
  const scenes = readJsonSafe(path.join(projectDir, "scenes", "scenes.json"), []);
  const maps = readJsonSafe(path.join(projectDir, "maps", "maps.json"), []);
  const objects = readJsonSafe(path.join(projectDir, "objects", "objects.json"), []);
  const dialogues = readJsonSafe(path.join(projectDir, "dialogues", "dialogues.json"), []);
  const triggers = readJsonSafe(path.join(projectDir, "triggers", "triggers.json"), []);

  if (!config) errors.push("config.json introuvable.");
  if (!scenes.length) warnings.push("Aucune scène créée. Le jeu exportera un squelette vide.");
  if (!maps.length) warnings.push("Aucune map créée.");
  for (const scene of scenes) {
    if (!scene.playerSpawn) errors.push(`Scene ${scene.id}: spawn joueur manquant.`);
    if (!maps.find(m => m.id === scene.mapId)) errors.push(`Scene ${scene.id}: map ${scene.mapId} introuvable.`);
  }

  const dialogueIds = new Set(dialogues.map(d => d.id));
  for (const t of triggers) {
    if (String(t.action || "").includes("dialogue") && t.target && !dialogueIds.has(t.target)) {
      warnings.push(`Trigger ${t.id}: dialogue cible "${t.target}" non trouvé.`);
    }
  }

  const assetSpriteDir = path.join(projectDir, "assets", "sprites");
  if (!fs.existsSync(assetSpriteDir)) warnings.push("Dossier assets/sprites introuvable.");

  return { errors, warnings, ok: errors.length === 0 };
}

function getDriveCandidates() {
  if (process.platform === "win32") {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const drive = `${String.fromCharCode(i)}:\\`;
      if (fs.existsSync(drive)) {
        drives.push({
          path: drive,
          label: drive,
          hasJeuxFolder: fs.existsSync(path.join(drive, "jeux"))
        });
      }
    }
    return drives;
  }

  const candidates = ["/Volumes", "/media", "/mnt"];
  const drives = [];
  for (const base of candidates) {
    if (fs.existsSync(base)) {
      for (const entry of fs.readdirSync(base)) {
        const p = path.join(base, entry);
        try {
          if (fs.statSync(p).isDirectory()) drives.push({ path: p, label: entry, hasJeuxFolder: fs.existsSync(path.join(p, "jeux")) });
        } catch {}
      }
    }
  }
  return drives;
}

ipcMain.handle("build:scan-drives", async () => {
  return { ok: true, drives: getDriveCandidates() };
});

ipcMain.handle("build:game-v09", async (_event, options) => {
  if (!currentProjectPath) return { ok: false, error: "Aucun projet actif." };

  const validation = validateProject(currentProjectPath);
  if (!validation.ok && !options.forceBuild) {
    return { ok: false, validation };
  }

  const config = readJsonSafe(path.join(currentProjectPath, "config.json"), {});
  const gameName = safeName(config.projectName || options.gameName || "LumaGame");
  const buildDir = path.join(currentProjectPath, "exports", "builds", gameName);
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  const secure = !!options.secureExport;
  const secureKey = secure ? crypto.randomBytes(32).toString("hex") : null;

  const gameFile = secure ? "game.luma.enc" : "game.luma";
  const assetsFile = secure ? "assets.lpk.enc" : "assets.lpk";

  const gameInfo = makeGameLuma(currentProjectPath, path.join(buildDir, gameFile), secureKey);
  const packInfo = makeLPK(currentProjectPath, path.join(buildDir, assetsFile), secureKey);

  const manifest = {
    name: config.projectName || gameName,
    editor: config.editorName || "Unknown",
    version: "0.9.0",
    type: "luma_game",
    entry: gameFile,
    assets: assetsFile,
    secure,
    signature: "",
    size: gameInfo.size + packInfo.size,
    buildAt: new Date().toISOString(),
    stats: {
      game: gameInfo,
      assets: packInfo,
      warnings: validation.warnings,
      errors: validation.errors
    }
  };

  const manifestDataForSignature = JSON.stringify({ ...manifest, signature: "" });
  manifest.signature = crypto.createHash("sha256").update(manifestDataForSignature + (secureKey || "LUMA_PUBLIC")).digest("hex").toUpperCase();

  fs.writeFileSync(path.join(buildDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(path.join(buildDir, "save_template.dat"), Buffer.from("LUMA_SAVE_V1\0", "utf8"));

  if (secure) {
    fs.writeFileSync(path.join(currentProjectPath, "exports", "secure", `${gameName}_dev_key.txt`),
`LUMA SECURE EXPORT DEV KEY
==========================

Game: ${gameName}
Key: ${secureKey}

Important:
- Cette clé est nécessaire pour le futur lecteur console.
- Ne la publie pas avec le jeu final.
- La sécurité est une protection anti-dump simple, pas une protection invincible.
`,
      "utf8"
    );
  }

  let sdCopyPath = null;
  if (options.copyToDrive && options.drivePath) {
    const jeuxDir = path.join(options.drivePath, "jeux");
    fs.mkdirSync(jeuxDir, { recursive: true });
    sdCopyPath = path.join(jeuxDir, gameName);
    fs.rmSync(sdCopyPath, { recursive: true, force: true });
    copyDirRecursive(buildDir, sdCopyPath);
  }

  return {
    ok: true,
    buildDir,
    sdCopyPath,
    manifest,
    validation,
    secureKeySaved: secure ? path.join(currentProjectPath, "exports", "secure", `${gameName}_dev_key.txt`) : null
  };
});
