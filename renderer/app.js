/**
 * Luma Studio - orchestrateur principal.
 *
 * Charge en modules : navigation, asset-lab, sprite-editor.
 * Gère uniquement :
 *  - le splash
 *  - le formulaire de création de projet
 *  - le passage Asset Lab <-> Sprite Editor
 */

import { showScreen } from "./modules/navigation.js";
import { initAssetLab, setProjectSize, commitFrameEdits } from "./modules/asset-lab.js";
import { initSpriteEditor, openSpriteEditor }            from "./modules/sprite-editor.js";

let selectedSize = "550ko";

/* ---------------------- SPLASH ---------------------- */

const dots = document.getElementById("dots");
let dotState = 0;
setInterval(() => {
  dotState = (dotState + 1) % 4;
  dots.textContent = ".".repeat(dotState || 3);
}, 350);

setTimeout(() => {
  showScreen("project");
}, 1000);

/* ---------------------- PROJET ---------------------- */

const statusText = document.getElementById("status");

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
    statusText.textContent = `Taille sélectionnée : ${selectedSize}`;
  });
});

document.getElementById("createProject").addEventListener("click", async () => {
  const project = {
    name:   document.getElementById("projectName").value.trim() || "MonProjet",
    editor: document.getElementById("editorName").value.trim() || "I.E.Games_Studio",
    size:   selectedSize
  };

  statusText.textContent = "Création du projet...";
  const result = await window.lumaAPI.createProject(project);

  if (result.canceled) { statusText.textContent = "Création annulée."; return; }
  if (!result.ok)      { statusText.textContent = result.error || "Erreur lors de la création."; return; }

  document.getElementById("projectPath").textContent = result.path;
  document.getElementById("memLimit").textContent    = selectedSize;
  setProjectSize(selectedSize);
  showScreen("assetLab");
});

/* ---------------------- ASSET LAB <-> SPRITE EDITOR ---------------------- */

initAssetLab({
  onOpenSpriteEditor: (frame, sourceImage) => {
    openSpriteEditor(frame, sourceImage);
  }
});

initSpriteEditor({
  onCommit: (frameId, payload) => {
    commitFrameEdits(frameId, payload);
  }
});

/* Bouton sidebar SPRITE EDITOR depuis Asset Lab */
document.getElementById("navSprite").addEventListener("click", (e) => {
  if (e.currentTarget.classList.contains("disabled")) return;
  document.getElementById("openSpriteEditor").click();
});

/* Bouton sidebar ASSET LAB depuis Sprite Editor */
document.getElementById("navAssetFromSprite").addEventListener("click", () => {
  showScreen("assetLab");
});
