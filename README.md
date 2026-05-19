# Luma Studio v1.0.1

Éditeur rétro Electron + base runtime ESP32 pour créer des jeux Luma.

## Nouveautés V1.0.1 — patch correctif

15 bugs corrigés depuis la V1.0 (cf. CHANGELOG.md pour le détail). Points
importants :

- **Sauvegarde projet** : `narrative_preview.luma` et `scene_preview.luma`
  sont maintenant écrits dans `<projet>/exports/` (au lieu de planter sur un
  chemin corrompu).
- **Collisions joueur** : test des 4 coins du joueur + glissement le long
  des murs (X et Y séparés), côté éditeur ET côté moteur ESP32.
- **Caméra** : clampée sur les 4 bords de la map.
- **Rendu ESP32** : dessine les vraies tiles `floor` et `decor` chargées
  depuis le `game.luma` (au lieu d'un damier statique).
- **Audio ESP32** : non-bloquant, 2 timers indépendants → les 2 buzzers
  peuvent jouer 2 fréquences différentes en parallèle.
- **Code mort retiré** : `renderer/modules/` (11 modules ES6 jamais chargés)
  supprimé pour clarifier la base.
- **Save game FAT-safe** : sanitization du nom du fichier `.sav` sur SD.
- **Sauvegarde unifiée** : le bouton « SAUVEGARDER » sauve maintenant aussi
  maps & scenes.

## Côté PC / Electron

Luma Studio conserve les fonctions :
- V0.4 Project Manager
- V0.5 Object & Event Database
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

Base ESP-IDF du moteur console :

- launcher `/sdcard/jeux/`
- lecture `manifest.json`
- lecture `game.luma` (couches floor/decor/collision en RAM)
- **collision réelle joueur ↔ tiles**
- ouverture du `.lpk` d'assets
- runtime scène + clamp caméra
- input buttons
- rendu ST7735 — vraies tiles map
- audio piezo 2 canaux **non-bloquant**, 2 timers indépendants
- sauvegarde `/sdcard/sauvegardes/` (nom FAT-safe)

## Limitations connues

- Le rendu ESP32 utilise toujours une palette « tile ID → couleur »
  simplifiée : la liaison avec de vrais sprites RGB565 issus du LPK
  arrivera en V1.1.
- Le mode `secure` du LPK est ignoré côté console (sera ajouté avec un
  vrai déchiffreur SHA-256 + XOR).
- L'éditeur de sprite pixel-art (V0.3) et l'animation editor (V0.4) ne
  sont pas re-câblés dans le monolithe V1. Si tu veux les retrouver dans
  une V1.1, on peut réintroduire le chargement ES6 modules.
