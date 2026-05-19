/**
 * Palette ST7735 par défaut.
 *
 * 32 couleurs inspirées de la palette DB32 (DawnBringer, CC0), choisies
 * pour rester lisibles après quantification en RGB565. Chaque couleur est
 * pré-quantifiée : c'est exactement ce que le ST7735 affichera.
 */

import { rgbToRgb565, rgb565ToRgb, rgb565ToHex } from "./rgb565.js";

const RAW_HEX = [
  "#000000", "#222034", "#45283c", "#663931", "#8f563b", "#df7126", "#d9a066", "#eec39a",
  "#fbf236", "#99e550", "#6abe30", "#37946e", "#4b692f", "#524b24", "#323c39", "#3f3f74",
  "#306082", "#5b6ee1", "#639bff", "#5fcde4", "#cbdbfc", "#ffffff", "#9badb7", "#847e87",
  "#696a6a", "#595652", "#76428a", "#ac3232", "#d95763", "#d77bba", "#8f974a", "#8a6f30"
];

function buildEntry(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const rgb565 = rgbToRgb565(r, g, b);
  const quant  = rgb565ToRgb(rgb565); // couleur réellement visible sur ST7735
  return {
    rgb565,
    hex: rgb565ToHex(rgb565),
    r: quant.r,
    g: quant.g,
    b: quant.b
  };
}

export const PALETTE_ST7735 = RAW_HEX.map(buildEntry);

/** Cherche la couleur de palette la plus proche d'un (r,g,b) donné. */
export function findClosestPaletteColor(r, g, b) {
  let bestIndex = 0;
  let bestDist  = Infinity;
  for (let i = 0; i < PALETTE_ST7735.length; i++) {
    const c = PALETTE_ST7735[i];
    const dr = c.r - r, dg = c.g - g, db = c.b - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; bestIndex = i; }
  }
  return bestIndex;
}

/** Trouve l'index palette d'une valeur RGB565 exacte (ou -1). */
export function indexOfRgb565(value) {
  for (let i = 0; i < PALETTE_ST7735.length; i++) {
    if (PALETTE_ST7735[i].rgb565 === value) return i;
  }
  return -1;
}
