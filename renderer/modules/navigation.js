/** Gestion des écrans (splash, project, assetLab, spriteEditor). */

const SCREENS = ["splash", "project", "assetLab", "spriteEditor"];

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
