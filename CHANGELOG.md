# CHANGELOG

## V1.2 — Layers, GIF & ESP32 sprite rendering

### Nouveautés majeures

**Sprite Editor — Layers multi-pile** :
- Refonte du state : `state.layers[]` au lieu d'un seul `pixels`. Chaque
  layer = `{id, name, visible, opacity, pixels}`. `state.pixels` reste
  un alias vers le buffer actif pour minimiser le diff sur le code de
  dessin.
- `compositeAllLayers()` : combine tous les layers visibles en un seul
  Uint16Array. Le canvas, le preview et les stats utilisent la composition.
- `addLayer / deleteLayer / moveLayer / mergeLayerDown / setActiveLayer
  / toggleLayerVisibility / setLayerOpacity / renameLayer` : API complète.
- Panel layers dans la sidebar droite avec contrôles ●/○, slider opacity,
  ▲▼ move, ⬇ merge down, × delete.
- `pushHistory` et `restoreSnapshot` snapshot tous les layers.
- Frame ops (flip H/V, rotate 90°, resize) itèrent sur tous les layers.
- `loadFrameLayers` : compat V1.1 — `pixelsB64` top-level devient layer "Base".
- `commitFramePixels` sérialise tous les layers ET la composition flat
  (`pixelsB64`) pour rétrocompat et animation editor.
- Pipette lit la composition, pas juste le layer actif.

**Export GIF animé** :
- `renderer/gif-encoder.js` : encoder GIF89a complet (~240 lignes).
  ByteStream, BitWriter (LSB-first), lzwEncode (codes variable-length,
  reset dictionnaire à 4096), Netscape 2.0 loop extension, sub-blocks.
- API `LumaGifEncoder(w, h)` : `setPalette`, `addFrame(indices, delayMs, transparentIdx)`, `finish()`.
- Bouton `📽 GIF (×4)` et `📽 GIF (×1)` dans l'animation editor.
- Build dynamique de la palette (max 255 couleurs uniques + index 0 =
  transparent). Centrage des frames de tailles différentes. Download
  via Blob.
- Validé avec PIL : magic GIF89a, frames lues correctement, loop infini,
  durées per-frame respectées.

**Rendu sprite RGB565 sur ESP32** :
- `main.js` :
  - `buildSpriteFile(frame)` : encode `[2B w LE | 2B h LE | w*h*2 bytes pixels BE]`
    avec byte-swap intégré pour ST7735.
  - `makeLPK` : injecte automatiquement `sprites/<frame_id>.spr` pour
    chaque frame du projet ayant un pixelsB64.
- `luma_lpk.h/.c` : ajout `luma_lpk_read_sprite(lpk, name, *w, *h, pixels, max_pixels)`
  qui décode le format binaire et byte-swap BE→LE en RAM ESP32.
- `luma_render.h/.c` : ajout `luma_render_blit_rgb565(x, y, w, h, pixels, transparent)`.
  Implémentation ligne par ligne avec regroupement des segments contigus
  opaques en un seul `lcd_set_addr + lcd_data` (minimise les appels SPI).
  Clipping automatique aux bords de l'écran. Byte-swap LE→BE intégré.
- `luma_types.h` : ajout `LUMA_MAX_SPRITE_DIM 64`, `LUMA_MAX_SPRITE_PIXELS`,
  et champs `player_sprite_loaded/w/h/pixels[]` dans `luma_runtime_t`
  (8 Ko en plus dans la struct, OK pour ESP32).
- `main.c` : précharge le premier sprite trouvé dans le LPK comme sprite
  joueur après `luma_runtime_init`.
- `luma_runtime.c` : `player_size(rt)` utilise la dim du sprite chargé ;
  fallback `PLAYER_DEFAULT_SIZE 12`. `luma_runtime_init` initialise les
  nouveaux champs.
- `luma_render.c` : `luma_render_runtime` utilise `luma_render_blit_rgb565`
  pour le joueur si sprite chargé, fallback sur rect jaune sinon.

**Roundtrip pixels validé** :
- JS Uint16Array LE → buildSpriteFile (swap LE→BE) → décode ESP32 (swap
  BE→LE) → match parfait sur tous les pixels.
- GIF encoder validé avec PIL sur palette 4 couleurs (2 frames) ET 16
  couleurs (5 frames).

### Version bumps

- `package.json` 1.1.0 → 1.2.0
- `lumaStudioVersion` et manifest → 1.2.0
- `LUMA_VERSION` C → 1.2.0
- Titre fenêtre + splash → v1.2

### Aucune régression V1.1

Tous les fixes V1.0.1 + features V1.1 (sprite editor, animation editor,
color ramps, onion skin, mirror, pixel-perfect, undo/redo 100, palette
DB32) sont conservés et fonctionnent au-dessus du nouveau système de layers.

---

## V1.1 — Sprite Editor & Animation Editor

Ajout du sprite editor pixel-art (overlay plein écran) et de l'animation
editor (timeline drag/drop). Voir CHANGELOG V1.1 dans une version
antérieure pour le détail.

## V1.0.1 — Patch correctif (15 bugs)

Voir CHANGELOG V1.0.1 dans une version antérieure pour le détail.
