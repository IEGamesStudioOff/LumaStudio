/**
 * Rendu d'une frame.
 *
 * Une frame peut avoir deux origines :
 *  - non éditée : on découpe depuis l'image source (x, y, w, h)
 *  - éditée     : on a un buffer RGB565 stocké en base64 dans frame.pixelsB64
 *
 * Ce module centralise la peinture pour qu'asset-lab et animation-editor
 * partagent exactement la même logique.
 */

import { rgb565ToImageData, base64ToRgb565 } from "./rgb565.js";

/** Peint la frame dans `canvas` à sa taille native (w×h).
 *  Le canvas est redimensionné. */
export function paintFrameNative(frame, sourceImage, canvas) {
  canvas.width = frame.w;
  canvas.height = frame.h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  if (frame.edited && frame.pixelsB64) {
    const buf = base64ToRgb565(frame.pixelsB64);
    const img = rgb565ToImageData(buf, frame.w, frame.h);
    ctx.putImageData(img, 0, 0);
    return;
  }

  if (sourceImage) {
    ctx.drawImage(sourceImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  }
}

/** Peint la frame zoomée (nearest-neighbor) dans un canvas cible. */
export function paintFrameZoomed(frame, sourceImage, targetCanvas, targetW, targetH) {
  const tmp = document.createElement("canvas");
  paintFrameNative(frame, sourceImage, tmp);
  targetCanvas.width = targetW;
  targetCanvas.height = targetH;
  const ctx = targetCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(tmp, 0, 0, targetW, targetH);
}

/** Calcule le plus grand zoom entier qui fait tenir la frame dans `maxSize`. */
export function fitZoom(frame, maxSize) {
  return Math.max(1, Math.floor(Math.min(maxSize / frame.w, maxSize / frame.h)));
}
