const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

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
    "dialogues",
    "cutscenes",
    "triggers",
    "scenes",
    "objects",
    "events",
    "music",
    "build",
    "exports"
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
    triggers: readJsonSafe(path.join(projectDir, "triggers", "triggers.json"), [])
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

  fs.writeFileSync(path.join(currentProjectPath, "exports", "narrative_preview.luma"), preview, "utf8");

  return { ok: true, path: path.join(currentProjectPath, "exports", "narrative_preview.luma") };
});
