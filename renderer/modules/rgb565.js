/**
 * Conversion RGB888 <-> RGB565 (format natif ST7735, 16 bits par pixel).
 *
 * RGB565 = RRRRR GGGGGG BBBBB  (5/6/5 bits)
 *
 * Quand on reconvertit RGB565 -> RGB888 pour l'aperçu écran, on utilise la
 * "bit-replication" : on recopie les bits de poids fort dans les bits de poids
 * faible. Ça donne EXACTEMENT la couleur que le ST7735 affichera.
 *  ex: 5 bits 11111 -> 8 bits 11111111 (255), pas 11111000 (248).
 */

export function rgbToRgb565(r, g, b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

export function rgb565ToRgb(value) {
  const r5 = (value >> 11) & 0x1F;
  const g6 = (value >> 5)  & 0x3F;
  const b5 = value         & 0x1F;
  return {
    r: (r5 << 3) | (r5 >> 2),
    g: (g6 << 2) | (g6 >> 4),
    b: (b5 << 3) | (b5 >> 2)
  };
}

export function rgb565ToHex(value) {
  const { r, g, b } = rgb565ToRgb(value);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function hexToRgb565(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return rgbToRgb565(r, g, b);
}

/** "Quantize" une couleur RGB888 en passant par RGB565 puis bit-rep.
 *  Renvoie la couleur RGB888 visible sur l'écran cible. */
export function quantizeToScreen(r, g, b) {
  return rgb565ToRgb(rgbToRgb565(r, g, b));
}

/** ImageData -> Uint16Array RGB565 (pixels w*h). Alpha ignoré. */
export function imageDataToRgb565(imageData) {
  const { data, width, height } = imageData;
  const out = new Uint16Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = rgbToRgb565(data[i], data[i + 1], data[i + 2]);
  }
  return out;
}

/** Uint16Array RGB565 -> ImageData (alpha = 255 partout). */
export function rgb565ToImageData(buffer, width, height) {
  const img = new ImageData(width, height);
  for (let i = 0, j = 0; i < buffer.length; i++, j += 4) {
    const { r, g, b } = rgb565ToRgb(buffer[i]);
    img.data[j] = r;
    img.data[j + 1] = g;
    img.data[j + 2] = b;
    img.data[j + 3] = 255;
  }
  return img;
}

/** Encode Uint16Array en base64 (pour sérialisation JSON compacte). */
export function rgb565ToBase64(buffer) {
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToRgb565(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}
