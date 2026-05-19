const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Luma Studio",
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
    return {
      ok: false,
      error: "Un dossier avec ce nom existe déjà."
    };
  }

  const folders = [
    "assets",
    "assets/sprites",
    "assets/tilesets",
    "assets/audio",
    "maps",
    "dialogues",
    "scenes",
    "build",
    "exports"
  ];

  fs.mkdirSync(projectDir, { recursive: true });
  for (const folder of folders) {
    fs.mkdirSync(path.join(projectDir, folder), { recursive: true });
  }

  const config = {
    lumaStudioVersion: "0.1.0",
    projectName: project.name,
    editorName: project.editor,
    gameSize: project.size,
    createdAt: new Date().toISOString(),
    target: {
      screenWidth: 160,
      screenHeight: 128,
      tileSize: 16,
      format: "LUMA"
    },
    limits: {
      small_180ko: project.size === "180ko",
      standard_550ko: project.size === "550ko",
      large_2mo: project.size === "2mo"
    }
  };

  fs.writeFileSync(
    path.join(projectDir, "config.json"),
    JSON.stringify(config, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(projectDir, "game.luma"),
`# LUMA GAME FILE
# Projet: ${project.name}
# Editeur: ${project.editor}
# Taille cible: ${project.size}

GAME "${project.name}"
EDITOR "${project.editor}"
SCREEN 160 128
TILESIZE 16
START_SCENE "scene_001"
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(projectDir, "README.txt"),
`Projet Luma Studio
=================

Nom du projet : ${project.name}
Editeur       : ${project.editor}
Taille cible  : ${project.size}

Dossiers :
- assets/sprites  : sprites et spritesheets
- assets/tilesets : tilesets
- assets/audio    : sons et musiques
- maps            : maps en tiles
- dialogues       : textes et dialogues
- scenes          : scènes du jeu
- build           : fichiers temporaires
- exports         : fichiers .luma / .lpk exportés
`,
    "utf8"
  );

  return { ok: true, path: projectDir };
});
