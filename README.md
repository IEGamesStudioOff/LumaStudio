# Luma Studio v0.4

Éditeur rétro no-code pour la console **Luma** (cible matérielle : écran LCD ST7735, RGB565).
Inspiration : NESmaker × Aseprite × Construct.

## Démarrer
```bash
npm install
npm start
```

## Nouveautés v0.4 — Animation Editor

```
frames  ───►  animations
```

Un nouvel écran complet pour composer des animations à partir des frames du projet.
Aucun pixel n'est dupliqué : une animation = une liste ordonnée d'**indices** de frames + vitesse + loop.

### Fonctionnalités
- ✔ créer une animation (`anim_001`, renommable en `player_walk_down`...)
- ✔ **drag & drop des frames** depuis le pool (panneau droite) vers la timeline
- ✔ **réorganisation** par drag interne dans la timeline
- ✔ vitesse animation : slider 20–500 ms (par défaut 120 ms)
- ✔ loop on/off
- ✔ preview **play / pause / stop**
- ✔ clic sur un slot → frame visible dans la preview (utile en pause)
- ✔ double-clic sur une frame du pool → ajout rapide en fin de timeline
- ✔ badge `×N` sur les frames du pool indiquant combien de fois elles sont utilisées
- ✔ suppression d'animation
- ✔ export `animations.json`
- ✔ estimation mémoire animation (header 24 o + 2 o / frame référencée)
- ✔ estimation mémoire totale des animations

### Format d'une animation
```json
{
  "id": 0,
  "name": "player_walk_down",
  "frameIds": [0, 1, 2, 3],
  "speedMs": 120,
  "loop": true
}
```

Stocké dans `<projet>/assets/sprites/animations.json`.

### Modèle mémoire ciblé (futur format binaire)
```
animation entry (24 o) :
  name[16]    ASCII
  speedMs     uint16 LE
  loop        uint8
  count       uint16
  reserved    3 octets
puis : count × uint16 LE (indices vers frames)
```

## Architecture

```
renderer/
├── app.js                        # orchestrateur principal
├── index.html
├── style.css
└── modules/
    ├── navigation.js             # gestion des écrans
    ├── palette.js                # palette ST7735 (32 couleurs DB32)
    ├── rgb565.js                 # conversions RGB888 ↔ RGB565
    ├── memory.js                 # estimation mémoire (frames + animations)
    ├── history.js                # undo/redo générique
    ├── frame-renderer.js         # peinture d'une frame (source ou édité) ★ NEW
    ├── asset-lab.js              # logique Asset Lab
    ├── sprite-editor.js          # éditeur pixel
    └── animation-editor.js       # éditeur d'animations ★ NEW
```

## Flow utilisateur

```
splash
   ↓
project (taille, nom)
   ↓
ASSET LAB ────► importer / découper / sélectionner frames
   │
   ├──► SPRITE EDITOR (clic frame puis OUVRIR ÉDITEUR / double-clic)
   │       crayon · gomme · pipette · remplissage
   │       flip H/V · resize · undo/redo
   │       palette ST7735 · sauvegarde commit
   │
   └──► ANIMATIONS (au moins 1 frame requise)
           créer / nommer
           drag des frames vers timeline
           vitesse + loop
           play/pause/stop
           sauvegarde animations.json
```

## Raccourcis

### Sprite Editor
| Raccourci          | Action       |
|--------------------|--------------|
| `P` ou `B`         | Crayon       |
| `E`                | Gomme        |
| `I`                | Pipette      |
| `G`                | Remplissage  |
| `Ctrl + Z`         | Undo         |
| `Ctrl + Y` ou `Ctrl + Shift + Z` | Redo |

## Roadmap

### v0.6
- Découpe GIF multi-frames automatique
- Sélection rectangulaire dans le Sprite Editor
- Copier/coller entre frames
- Onion-skin dans le preview animation

### v0.6
- Map Editor (tilemap, layers, collisions)

### v0.7
- Object Editor (entité = sprites + animations + propriétés + comportements)

### v0.8
- Events / scripting visuel type Construct

### v1.0
- Build d'un binaire `.LUMA` exécutable sur la console Luma cible


## V0.6 — Object / Event Database

- Base de données d'objets (`objects/objects.json`)
- Base de données d'events IF / THEN (`events/events.json`)
- Variables globales, scène et objet (`variables/variables.json`)
- Behaviors préfabriqués : TopDownMovement, EnemyPatrol, DoorTransition, DialogNPC, etc.
- Analyseur de projet : objets sans sprite, events vides, portes sans destination, variables doublons
- Export lisible `build/logic_preview.luma`

Cette version pose le cerveau logique du moteur Luma avant le Map Editor.


## V0.6 - Music Editor 8-bit

Ajouts :

- Music Editor pour deux piezo buzzers
- 2 pistes audio : Buzzer A / Buzzer B
- Notes : REST, C, D, E, F, G, A, B
- Octaves 2 à 6
- Durées 1 / 2 / 4 / 8
- Tempo BPM
- Lecture PC avec oscillateurs carrés WebAudio
- Sauvegarde `music/music.json`
- Export lisible `build/music_preview.lmus`
- Export binaire préliminaire `build/music.lmusbin`

Le principe reste léger : pas de MP3/WAV, seulement des commandes de notes.
