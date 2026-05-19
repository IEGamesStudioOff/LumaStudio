# CHANGELOG

## V1.0.1 — Patch correctif

### Critique
- **Bug #1** — `main.js` : `path.join(currentProjectPath, "exports",
  "exports/builds", "exports/secure", "narrative_preview.luma")` produisait
  un chemin inexistant qui faisait crasher `saveNarrative` et `saveSceneData`.
  Corrigé en écrivant dans `<projet>/exports/narrative_preview.luma` et
  `<projet>/exports/scene_preview.luma`.

### Majeur
- **Bug #2** — `app.js` : la détection de collision ne testait que 2 coins
  sur 4 du joueur, permettant de passer à travers les murs en diagonale.
  Refonte avec `canStandAt()` qui teste les 4 coins (offset `size - 1`) +
  test X/Y séparés pour permettre le glissement le long des murs.
- **Bug #3** — `app.js` : caméra non clampée à droite/bas, révélait du
  noir aux bords. Ajout d'une fonction `centerCameraOnPlayer()` qui clamp
  sur les 4 bords, appliquée partout (keyboard, centerCamera, click outil).
- **Bug #4** — `renderer/modules/` : 11 modules ES6 (~100 Ko) jamais
  chargés par `index.html` (script classique, pas `type="module"`). Code
  mort supprimé.
- **Bug #5** — `luma_runtime.c` (ESP32) : aucune détection de collision,
  le joueur traversait les murs. Ajout d'`is_solid_tile()` et
  `can_stand_at()`, mouvement X/Y séparé.
- **Bug #6** — `luma_render.c` (ESP32) : rendu d'un damier statique au
  lieu des vraies tiles. Lecture des couches `layer_floor` et `layer_decor`
  depuis le runtime + parsing dans `luma_game.c`. Ouverture du LPK dans
  `main.c`.
- **Bug #7** — `luma_audio.c` (ESP32) : 2 buzzers sur le même timer +
  `vTaskDelay` bloquant. Refonte avec 2 timers indépendants + tracking
  `end_us` pour stop non-bloquant via `audio_update`.

### Mineur
- **Bug #8** — `app.js` : `id: Date.now()` pour objets/events causait des
  collisions d'ID dans la même milliseconde. Remplacé par compteurs
  `nextObjectId` / `nextEventId` qui se recalculent au chargement.
- **Bug #9** — versions incohérentes (`0.7.0`, `0.9.0`, `1.0.0`). Toutes
  unifiées sur `1.0.1` (`package.json`, `main.js`, manifest build,
  `LUMA_VERSION`).
- **Bug #10** — `app.js` : joueur 12px dans tiles 16px laissait 4px de
  marge → chevauchait visuellement les murs. Résolu en même temps que
  bug #2 via `size - 1` dans les coins.
- **Bug #11** — `luma_save.c` (ESP32) : nom du `.sav` non sanitizé pour
  FAT (espaces, accents). Ajout d'un helper `safe_name()`.
- **Bug #12** — `luma_runtime.c` (ESP32) : caméra non clampée à droite/bas.
  Résolu via `clamp_camera()`.
- **Bug #13** — `luma_config.h` : commentaire trompeur sur GPIO34.
  Vérifié : `LUMA_BUZZER_A = 25`, `LUMA_BUZZER_B = 26`, `LUMA_BTN_RIGHT = 27`
  — tous output-capable. Pas d'action requise.
- **Bug #14** — `app.js` : les 2 pistes musicales étaient désynchronisées
  (`setTimeout 20ms`). Refonte avec `scheduleTrack(track, baseTime)` qui
  utilise la même base de temps `audioCtx.currentTime + 0.05` pour A et B,
  + stop propre via `activeOscillators`.
- **Bug #15** — `app.js` : `saveAll` n'appelait pas `saveSceneData` →
  perte de map/scenes au reload. Ajout de l'appel.
