# CHANGELOG

## V1.1 — Sprite Editor & Animation Editor

### Nouveautés majeures

- **Sprite Editor** (renderer/sprite-editor.js, ~1350 lignes) : éditeur
  pixel-art complet en overlay plein écran. Accessible via le bouton EDIT
  sur chaque frame card de l'Asset Lab. Outils : crayon (avec pixel-perfect
  mode), gomme, pipette, flood fill, ligne, rectangle, ellipse, sélection
  rectangulaire. Brushes 1-4, symétrie H/V/quad. Palette DB32 RGB565 +
  color ramps + custom colors. Zoom molette, pan Espace+drag, onion skin.
  Undo/redo 100 étapes. Tous les raccourcis pros (P/E/I/G/L/R/O/S, ↑↓ ramp,
  X swap, [/] brush, Ctrl+Z/Y/C/V).
- **Animation Editor** (renderer/animation-editor.js, ~570 lignes) :
  timeline horizontale drag/drop, vitesse globale + override per-frame,
  loop modes (forward / ping-pong / once), preview multi-zoom ×1/×4/×8 +
  cadre console 160×128, onion skin, badges d'usage ×N.
- **Format frame étendu** : ajout du champ `pixelsB64` (Uint16Array RGB565
  encodé base64) pour persister les éditions pixel par pixel.
- **Format animation** : `{id, name, slots: [{frameId, durationMs?}], speedMs, loop}`.
- **IPC `asset:save-animations`** : sauvegarde dans
  `<projet>/assets/sprites/animations.json`.
- **`game.luma`** inclut maintenant `frames` (avec leurs pixelsB64) et
  `animations`.

### Version bumps

- `package.json` 1.0.1 → 1.1.0
- `lumaStudioVersion` et version manifest → 1.1.0
- Titre app + splash → v1.1

### Aucune régression V1.0.1

Tous les fixes V1.0.1 sont conservés : chemins de sauvegarde corrects,
collisions 4 coins + sliding, clamp caméra, modules ES6 morts supprimés,
collision ESP32 réelle, rendu tiles ESP32, audio non-bloquant 2 timers,
IDs incrémentaux, save FAT-safe, etc.

---

## V1.0.1 — Patch correctif (15 bugs)

Voir le CHANGELOG V1.0.1 pour le détail. Récap : chemins de sauvegarde
corrigés, collisions 4 coins + sliding, caméra clampée, code mort supprimé,
collision et rendu ESP32 fonctionnels, audio 2 timers non-bloquant, etc.
