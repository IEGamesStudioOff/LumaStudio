# Luma Studio v0.3

Éditeur rétro no-code pour la console **Luma** (cible matérielle : écran LCD ST7735, RGB565).
Inspiration : NESmaker × Aseprite × Construct.

## Démarrer
```bash
npm install
npm start
```

## Nouveautés v0.3

### Architecture modulaire (ES6)
Le renderer est désormais découpé proprement, fini le mono-fichier.

```
renderer/
├── app.js                 # orchestrateur principal
├── index.html
├── style.css
└── modules/
    ├── navigation.js      # gestion des écrans
    ├── palette.js         # palette ST7735 (32 couleurs DB32 quantifiées)
    ├── rgb565.js          # conversions RGB888 ↔ RGB565
    ├── memory.js          # estimation mémoire (pixels + headers)
    ├── history.js         # pile undo/redo générique
    ├── asset-lab.js       # logique Asset Lab étendue
    └── sprite-editor.js   # éditeur pixel complet
```

### Asset Lab amélioré
- ✔ sélection active d'une frame (clic carte, contour jaune)
- ✔ preview agrandie pixel-perfect dans son panneau
- ✔ grille de découpe sur la spritesheet
- ✔ frame sélectionnée mise en évidence sur la source
- ✔ double-clic → ouvre direct dans le Sprite Editor

### Sprite Editor (nouveau)
- ✔ canvas zoom + canvas overlay (grille / curseur)
- ✔ aperçu réel taille native (ce que le ST7735 affichera)
- ✔ palette ST7735 cliquable (32 couleurs)
- ✔ outils : **crayon · gomme · pipette · remplissage**
- ✔ transformes : **flip H/V · resize nearest-neighbor · clear**
- ✔ **undo/redo** (Ctrl+Z / Ctrl+Y, 60 étapes)
- ✔ tracé continu (Bresenham) pour ne pas perdre de pixels en mouvement rapide
- ✔ sauvegarde → commit dans la frame d'origine (le pixel data devient autoritatif)
- ✔ export PNG
- ✔ raccourcis : `P/B` crayon · `E` gomme · `I` pipette · `G` remplissage

### Pipeline Luma
- ✔ buffer image : `Uint16Array` RGB565 (encodé base64 dans JSON)
- ✔ conversion **vraie** RGB888 ↔ RGB565 avec bit-replication (couleur fidèle écran)
- ✔ estimation mémoire réaliste : pixel data + headers LPK
- ✔ **export .LPK** binaire dans `build/sprites.lpk` :

```
[0..3]   magic "LPK1"
[4..5]   version uint16 LE
[6..7]   count   uint16 LE
[8..]    table d'index (24 o / frame) :
           name[16]  ASCII
           w uint16 LE
           h uint16 LE
           offset uint32 LE
puis pixel data : w*h * uint16 LE RGB565
```

## Roadmap

### v0.4
- Animation Editor (timeline, vitesse, loop, ping-pong)
- Découpe GIF multi-frames automatique
- Sélection rectangulaire dans le Sprite Editor
- Copier/coller entre frames

### v0.5
- Map Editor (tilemap, layers, collisions)

### v0.6
- Object Editor (entité = sprite + animations + propriétés + comportements)

### v0.7
- Events / scripting visuel type Construct (sans code)

### v1.0
- Build d'un binaire `.LUMA` exécutable sur la console Luma cible
