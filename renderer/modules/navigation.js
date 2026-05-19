/** Gestion des écrans (splash, project, assetLab, spriteEditor, musicEditor). */

const SCREENS = ["splash", "project", "assetLab", "spriteEditor", "animationEditor", "objectEventDb", "musicEditor"];

export function showScreen(id) {
  for (const s of SCREENS) {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("active", s === id);
  }
}

export function getActiveScreen() {
  for (const s of SCREENS) {
    const el = document.getElementById(s);
    if (el && el.classList.contains("active")) return s;
  }
  return null;
}
