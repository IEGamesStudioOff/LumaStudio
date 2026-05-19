# Luma Studio v1.1

Éditeur rétro Electron + base runtime ESP32 pour créer des jeux Luma.

## Nouveautés V1.1

### Sprite Editor (réintégré et améliorée)
Pixel-art editor pro orienté ST7735 RGB565. Accès via le bouton **✎ EDIT**
sur chaque frame de l'Asset Lab. S'ouvre en overlay plein écran.

**Outils** : crayon, gomme, pipette, flood fill, ligne, rectangle, ellipse,
sélection rectangulaire avec déplacement / copier / coller.

**Pixel-perfect mode** sur le crayon : élimine automatiquement les coins en L
sur les diagonales (signature Aseprite).

**Brushes** 1×1 à 4×4. **Symétrie** H, V, ou quad (4 quadrants miroirs).

**Palette** : 32 couleurs DB32 quantifiées RGB565 + 4 color ramps navigables
au clavier (↑/↓) pour shader rapidement + slot custom illimité avec color
picker quantifié.

**Vue** : zoom molette pixel-perfect, pan Espace+drag, grille 8×8, pixel
grid auto-affichée ≥6× zoom, **onion skin** (frame précédente en rouge,
suivante en vert).

**History** : undo/redo 100 étapes (Ctrl+Z / Ctrl+Y), liste cliquable pour
sauter à n'importe quel état.

**Frame ops** : flip H/V, rotate 90°, clear, resize nearest-neighbor.

**Stats live** : couleurs uniques utilisées, octets RGB565, % de la limite
projet — un dev console doit toujours voir où il en est.

**Raccourcis** : P/E/I/G/L/R/O/S (outils), X (swap colors), [/] (brush size),
↑/↓ (ramp navigation), Alt+←/→ (frame nav), Ctrl+C/V (copy/paste frame),
Espace+drag (pan), ESC (fermer).

### Animation Editor
Accessible via la sidebar **ANIMATIONS**.

**Timeline horizontale** drag/drop : depuis le pool de frames vers la
timeline, ou réorganisation par drag entre slots. Double-clic sur une frame
du pool pour l'ajouter à la fin.

**Vitesse globale** (20-500ms) + **vitesse override par-frame** : pour
qu'une frame "tenue" puisse rester affichée plus longtemps que les autres.

**Loop modes** : forward (boucle), ping-pong (aller-retour), once
(joue une fois et s'arrête).

**Preview multi-zoom** : ×1 (rendu pixel-perfect), ×4, ×8 + **cadre console
160×128** qui montre exactement comment la frame apparaîtra sur le hardware.

**Stats** : nombre de slots, durée totale, fréquence de boucle.

**Badge ×N** : indique combien de fois chaque frame du pool est utilisée
à travers toutes les animations (références, pas duplication).

### Autres
- Fichier `assets/sprites/animations.json` créé automatiquement.
- Le bouton SAUVEGARDER inclut maintenant les animations.
- `game.luma` export inclut les frames (avec pixelsB64) et les animations.

## Côté PC / Electron

- V0.4 Project Manager
- V0.5 Object & Event Database
- **V1.1 Sprite Editor pixel-art + Animation Editor**
- V0.6 Music Editor 8-bit
- V1.0 Dialogues / Cutscenes
- V1.0 Map / Scene Editor
- V1.0 Build / Export Pipeline

Lancer l'éditeur :

```bash
npm install
npm start
```

## Moteur ESP32 — `luma_engine_esp32/`

Identique à la V1.0.1, à savoir :

- launcher `/sdcard/jeux/` + lecture `manifest.json`
- chargement `game.luma` (couches floor/decor/collision en RAM)
- collision réelle joueur ↔ tiles + clamp caméra sur les 4 bords
- ouverture `.lpk` d'assets
- audio piezo 2 canaux **non-bloquant**, 2 timers indépendants
- save FAT-safe

La consommation des animations par le runtime ESP32 sera ajoutée en V1.2
(actuellement game.luma les contient déjà mais le moteur ne les rend pas).

## Limitations connues

- Le rendu ESP32 utilise toujours une palette « tile ID → couleur » simple
  pour les tiles ; le rendu de sprites RGB565 depuis frames.pixelsB64
  arrive en V1.2.
- Pas d'export GIF des animations (à voir si pertinent).
- Pas de layers multi-pile (1 frame = 1 plan unique).
