# Luma Studio v1.0

Éditeur rétro Electron + première base de runtime ESP32 pour créer des jeux Luma.

## Côté PC / Electron

Luma Studio conserve les fonctions :
- V0.4 Project Manager
- V0.5 Object & Event Database
- V0.6 Music Editor 8-bit
- V0.7 Dialogues / Cutscenes
- V0.8 Map / Scene Editor
- V0.9 Build / Export Pipeline

Lancer l’éditeur :

```bash
npm install
npm start
```

## Nouveau en V1.0 : `luma_engine_esp32/`

Première base ESP-IDF du moteur console :

- launcher `/sdcard/jeux/`
- lecture `manifest.json`
- lecture `game.luma`
- début de loader `.lpk`
- runtime scène
- input buttons
- rendu ST7735
- audio piezo 2 canaux
- sauvegarde simple `/sdcard/sauvegardes/`
- squelette pour dialogues/events/cutscenes

## Important

Cette V1.0 est une base moteur. Elle est volontairement simple et doit être testée/adaptée sur ton hardware réel.

Le support sécurisé `.enc` généré en V0.9 est préparé côté Studio, mais le déchiffrement console complet sera ajouté dans une prochaine version.
