/**
 * Estimation mémoire d'un projet Luma ciblant le ST7735.
 *
 * Pour chaque frame :
 *   - pixel data : w * h * 2 octets (RGB565)
 *   - header LPK : 24 octets (nom 16 + w 2 + h 2 + offset 4)
 *
 * On ajoute aussi le header global du fichier .lpk (8 octets).
 */

export const HEADER_GLOBAL    = 8;
export const HEADER_PER_FRAME = 24;

/* Format d'animation .lpk (préliminaire) :
 *   header animation : name[16] + speedMs uint16 + loop uint8 + count uint16
 *                      + reserved 3  =  24 octets
 *   suivi de : count * uint16 (indices vers frames) */
export const HEADER_PER_ANIM    = 24;
export const BYTES_PER_ANIM_REF = 2;

export const PROJECT_LIMITS = {
  "180ko": 180 * 1024,
  "550ko": 550 * 1024,
  "2mo":   2 * 1024 * 1024
};

export function getProjectLimit(sizeKey) {
  return PROJECT_LIMITS[sizeKey] || PROJECT_LIMITS["550ko"];
}

export function estimateFramesMemory(frames) {
  let pixelBytes  = 0;
  let headerBytes = HEADER_GLOBAL;
  for (const f of frames) {
    pixelBytes  += f.w * f.h * 2;
    headerBytes += HEADER_PER_FRAME;
  }
  return {
    frames: frames.length,
    pixelBytes,
    headerBytes,
    totalBytes: pixelBytes + headerBytes
  };
}

/** Mémoire d'une animation : header + indices vers frames (pas de pixels dupliqués). */
export function estimateAnimationMemory(animation) {
  const refs = (animation.frameIds || []).length;
  return HEADER_PER_ANIM + refs * BYTES_PER_ANIM_REF;
}

/** Mémoire totale d'une liste d'animations. */
export function estimateAnimationsMemory(animations) {
  let total = 0;
  for (const a of animations) total += estimateAnimationMemory(a);
  return total;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}
