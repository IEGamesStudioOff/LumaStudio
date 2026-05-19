// =============================================================================
// LUMA STUDIO — GIF89a ENCODER (V1.2)
// =============================================================================
// Encoder GIF89a complet avec compression LZW (variable-length codes, LSB first).
// Suffit pour exporter des animations Luma : palette globale 256 couleurs max,
// transparence par index, délai par frame, loop infini.
// Reference: GIF89a spec (https://www.w3.org/Graphics/GIF/spec-gif89a.txt)
// =============================================================================

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // ByteStream : append-only Uint8Array dynamique
  // ---------------------------------------------------------------------------
  function ByteStream() {
    this.bytes = [];
  }
  ByteStream.prototype.u8 = function (v) { this.bytes.push(v & 0xff); };
  ByteStream.prototype.u16le = function (v) { this.bytes.push(v & 0xff, (v >> 8) & 0xff); };
  ByteStream.prototype.str = function (s) { for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i)); };
  ByteStream.prototype.bytesArr = function (arr) { for (let i = 0; i < arr.length; i++) this.bytes.push(arr[i] & 0xff); };
  ByteStream.prototype.toUint8Array = function () { return new Uint8Array(this.bytes); };

  // ---------------------------------------------------------------------------
  // BitWriter : écrit des codes de taille variable en LSB-first (format GIF LZW)
  // ---------------------------------------------------------------------------
  function BitWriter() {
    this.acc = 0;
    this.nbits = 0;
    this.bytes = [];
  }
  BitWriter.prototype.write = function (code, codeLen) {
    this.acc |= (code & ((1 << codeLen) - 1)) << this.nbits;
    this.nbits += codeLen;
    while (this.nbits >= 8) {
      this.bytes.push(this.acc & 0xff);
      this.acc >>>= 8;
      this.nbits -= 8;
    }
  };
  BitWriter.prototype.flush = function () {
    if (this.nbits > 0) {
      this.bytes.push(this.acc & 0xff);
      this.acc = 0;
      this.nbits = 0;
    }
  };

  // ---------------------------------------------------------------------------
  // LZW encoding pour GIF
  // pixels : Uint8Array (indices palette, valeurs 0..palSize-1)
  // minCodeSize : log2(palSize), au moins 2
  // ---------------------------------------------------------------------------
  function lzwEncode(pixels, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eofCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eofCode + 1;
    // Dictionary : prefix sequence → code. Représenté par une Map<string, number>
    // (clés = "code,pixel" ou "" pour le départ).
    const dict = new Map();
    const writer = new BitWriter();

    writer.write(clearCode, codeSize);

    function resetDict() {
      dict.clear();
      // pas besoin d'initialiser les codes "singleton" car on les émet
      // directement par leur valeur de pixel
      nextCode = eofCode + 1;
      codeSize = minCodeSize + 1;
    }

    let prefixCode = pixels[0]; // premier "string" = juste un pixel
    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = prefixCode + "," + k;
      if (dict.has(key)) {
        prefixCode = dict.get(key);
      } else {
        writer.write(prefixCode, codeSize);
        // Ajoute la nouvelle séquence au dictionnaire (sauf si dict full)
        if (nextCode < 4096) {
          dict.set(key, nextCode);
          nextCode++;
          // augmente la taille de code si on déborde
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          // dictionnaire saturé : on émet ClearCode et on repart
          writer.write(clearCode, codeSize);
          resetDict();
        }
        prefixCode = k;
      }
    }
    writer.write(prefixCode, codeSize);
    writer.write(eofCode, codeSize);
    writer.flush();
    return writer.bytes;
  }

  // ---------------------------------------------------------------------------
  // Découpe une suite d'octets LZW en sub-blocks (chaque ≤ 255 octets) pour
  // le format GIF, terminée par un block de longueur 0.
  // ---------------------------------------------------------------------------
  function writeSubBlocks(out, data) {
    let i = 0;
    while (i < data.length) {
      const chunk = Math.min(255, data.length - i);
      out.u8(chunk);
      for (let j = 0; j < chunk; j++) out.u8(data[i + j]);
      i += chunk;
    }
    out.u8(0); // terminator
  }

  // ---------------------------------------------------------------------------
  // GifEncoder — API publique
  // ---------------------------------------------------------------------------
  function GifEncoder(width, height) {
    this.w = width;
    this.h = height;
    this.frames = []; // { indices: Uint8Array, delayCs, transparentIdx }
    this.palette = null; // Uint8Array (palette globale RGB)
    this.paletteBits = 0; // log2(taille effective)
    this.loop = true;
  }

  // Définit la palette globale. rgbArray : array de [r, g, b] triplets.
  // La palette sera padded à la puissance de 2 supérieure (jusqu'à 256).
  GifEncoder.prototype.setPalette = function (rgbArray) {
    if (rgbArray.length > 256) throw new Error("Palette > 256 couleurs.");
    // taille effective = puissance de 2 ≥ rgbArray.length (min 2)
    let size = 2;
    while (size < rgbArray.length) size *= 2;
    this.paletteBits = Math.max(1, Math.log2(size));
    const pal = new Uint8Array(size * 3);
    for (let i = 0; i < size; i++) {
      const c = rgbArray[i] || [0, 0, 0];
      pal[i * 3]     = c[0];
      pal[i * 3 + 1] = c[1];
      pal[i * 3 + 2] = c[2];
    }
    this.palette = pal;
  };

  // Ajoute une frame.
  //  indices : Uint8Array(w*h) des indices dans la palette globale
  //  delayMs : durée en ms (sera arrondie à la centième de seconde)
  //  transparentIdx : -1 si pas de transparence, sinon index palette
  GifEncoder.prototype.addFrame = function (indices, delayMs, transparentIdx) {
    if (indices.length !== this.w * this.h) {
      throw new Error("Frame size mismatch (" + indices.length + " vs " + (this.w * this.h) + ")");
    }
    this.frames.push({
      indices: indices,
      delayCs: Math.max(2, Math.round((delayMs || 100) / 10)),
      transparentIdx: (typeof transparentIdx === "number" && transparentIdx >= 0) ? transparentIdx : -1
    });
  };

  GifEncoder.prototype.finish = function () {
    if (!this.palette) throw new Error("Palette manquante.");
    if (this.frames.length === 0) throw new Error("Aucune frame.");
    const out = new ByteStream();

    // Header
    out.str("GIF89a");

    // Logical Screen Descriptor
    out.u16le(this.w);
    out.u16le(this.h);
    // Packed: GCT flag (1) | color resolution (3 bits, palBits-1) | sort (1) | size of GCT (3, palBits-1)
    const palBits = Math.max(1, this.paletteBits) | 0;
    const packed = 0x80 | ((palBits - 1) << 4) | (palBits - 1);
    out.u8(packed);
    out.u8(0);    // background color index
    out.u8(0);    // pixel aspect ratio

    // Global Color Table
    out.bytesArr(this.palette);

    // Netscape 2.0 application extension : loop infini
    if (this.loop) {
      out.u8(0x21);
      out.u8(0xff);
      out.u8(0x0b);
      out.str("NETSCAPE2.0");
      out.u8(0x03);
      out.u8(0x01);
      out.u16le(0); // 0 = loop forever
      out.u8(0x00);
    }

    // Frames
    for (const f of this.frames) {
      // Graphic Control Extension
      out.u8(0x21);
      out.u8(0xf9);
      out.u8(0x04);
      const disposal = 2; // restore to background (utile pour transparence)
      const transFlag = f.transparentIdx >= 0 ? 1 : 0;
      out.u8((disposal << 2) | transFlag);
      out.u16le(f.delayCs);
      out.u8(f.transparentIdx >= 0 ? f.transparentIdx : 0);
      out.u8(0x00);

      // Image Descriptor
      out.u8(0x2c);
      out.u16le(0); // left
      out.u16le(0); // top
      out.u16le(this.w);
      out.u16le(this.h);
      out.u8(0x00); // local color table flag = 0 (use GCT)

      // LZW minimum code size
      const minCodeSize = Math.max(2, this.paletteBits);
      out.u8(minCodeSize);

      // LZW-encoded image data
      const lzwBytes = lzwEncode(f.indices, minCodeSize);
      writeSubBlocks(out, lzwBytes);
    }

    // Trailer
    out.u8(0x3b);

    return out.toUint8Array();
  };

  // ---------------------------------------------------------------------------
  // EXPORT API
  // ---------------------------------------------------------------------------
  window.LumaGifEncoder = GifEncoder;
})();
