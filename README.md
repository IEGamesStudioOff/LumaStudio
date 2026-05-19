# Luma Studio v0.9

Éditeur rétro Electron pour créer des jeux Luma.

## Lancer

```bash
npm install
npm start
```

## Nouveautés V0.9

### Build / Export Pipeline

- Bouton `BUILD GAME`
- Animation rétro : vieux PC + disquette
- Coche verte de validation en cas de succès
- Analyse projet : erreurs / warnings
- Génération :
  - `game.luma`
  - `assets.lpk`
  - `manifest.json`
  - `save_template.dat`
- Export SD-ready dans :
  - `exports/builds/NomDuJeu/`

### Option SD

- Recherche des lecteurs disponibles
- Copie automatique vers :
  - `/jeux/NomDuJeu/`

### Option Export sécurisé

- `game.luma.enc`
- `assets.lpk.enc`
- signature dans `manifest.json`
- clé développeur générée dans :
  - `exports/secure/*_dev_key.txt`

Important : le chiffrement V0.9 est une protection anti-dump simple. Le lecteur sécurisé côté console sera fait plus tard.

## Versions incluses

- V0.4 Project Manager
- V0.5 Object & Event Database
- V0.6 Music Editor 8-bit
- V0.7 Dialogues / Cutscenes
- V0.8 Map / Scene Editor
- V0.9 Build Compiler
