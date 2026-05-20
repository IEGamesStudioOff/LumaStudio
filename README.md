# Luma Studio v1.5 — Layout pro hybride

Refonte UI complète : **layout V1.5 façon Construct 3 / GameMaker 8** branché
sur tous les **modules V1.4 fonctionnels** (sprite editor pixel-art, piano roll,
animation editor, object editor visuel, simulator console, library permanente).

## Layout (inspiré de tes dessins préparatoires)

**Topbar gris/clair** :
- Logo + version
- `reset map` (tiny) · `▶ PLAY` (vert) · `▣ Save` (bleu)
- **Capacity bar live** avec marker 80%, breakdown 🎨 sprites · 🎵 audio · 🗺 maps · ⚙ code

**Layout 4 colonnes** :
1. **Left-nav** (165px) : Scene Setup avec grille de paramètres (Name, Map ID,
   Grid, BG color, Map W×H, Caméra), puis sections Sprite / Music / Animation /
   Objects / Build cliquables
2. **Center** : onglets + workspace actif
3. **Right-inspector** (200px) : listes Sprites + Music + contrôles Caméra/Layer
   + preview de l'objet sélectionné
4. **Library** (140px) : 7 catégories repliables (Sprites / Animations / Objects /
   Maps / Musique / Dialogues / Events) avec drag handles

**Bottombar** : hint contextuel + version

## Modules V1.4 branchés

| Mode | Module | Comportement |
|---|---|---|
| **Scene** | rendu natif app.js | Map editor avec peindre/effacer/collision/spawn/camera/trigger/objet, **drag-drop** depuis la library, vrais sprites RGB565 affichés, mini-preview console 160×128 en bas |
| **Sprite** | `sprite-editor.js` en overlay | Asset Lab (import + slice) + bouton **EDIT** sur chaque frame → ouvre l'éditeur pixel-art V1.4 (layers, palette DB32, mirror, color ramps, onion skin, undo 100, raccourcis P/E/I/G/L/R/O/S) |
| **Music** | `music-editor.js` injecté | Piano roll V1.3 complet : 36 lignes × 4-64 steps, 2 tracks loop A/B, 9 presets, aiguille animée, square waves piézo |
| **Animation** | `animation-editor.js` injecté | Timeline drag/drop, vitesse per-frame, loop forward/pingpong/once, preview ×1/×4/×8, export GIF |
| **Objects** | `object-editor.js` injecté | Constructeur visuel 3 colonnes : liste avec status ✓/⚠/✖, formulaire dropdowns (8 types × 12 behaviors), preview animé live |
| **Build** | natif | Sauvegarde + pipeline `buildGame` IPC |

## Bouton ▶ PLAY

Lance `simulator.js` en overlay : canvas 160×128 RGB565 pixel-perfect ×4 scale,
30 FPS, 2 buzzers piézo square wave, logique collision miroir du moteur ESP32,
sprite joueur RGB565 si édité, musique du projet jouée en boucle, D-pad virtuel +
inputs clavier (flèches, Z=A, X=B, ESC=quit).

## Lancer

```bash
npm install
npm start
```

## Architecture des fichiers

```
LumaStudio_v1_5/
├── main.js              # Electron main + 9 handlers IPC (V1.4)
├── preload.js           # Pont contextBridge V1.4
├── renderer/
│   ├── index.html       # Layout V1.5 (topbar + 4 colonnes) 301 lignes
│   ├── style.css        # Look gris/clair pro + overrides modules 964 lignes
│   ├── app.js           # Orchestrateur 1016 lignes
│   ├── sprite-editor.js # V1.4 pixel-art overlay 1608 lignes
│   ├── animation-editor.js # V1.4 timeline 684 lignes
│   ├── music-editor.js  # V1.3 piano roll 557 lignes
│   ├── object-editor.js # V1.4 constructeur visuel 534 lignes
│   ├── library-browser.js # V1.4 navigation ressources 380 lignes
│   ├── simulator.js     # V1.3 console émulée 584 lignes
│   └── gif-encoder.js   # V1.2 GIF89a LZW 238 lignes
└── luma_engine_esp32/   # Moteur C (inchangé V1.4)
```

## Workflow

1. **Ouvrir/créer un projet** dans la boîte de dialogue
2. **Scene Setup** (gauche) : régler nom, taille map, BG, caméra → **CRÉER / RESET MAP**
3. **Asset Lab** : importer image → découper en grille → cliquer **EDIT** pour dessiner
4. **Objects** : créer un objet, lui assigner sprite + animation + behavior, valider ✓
5. **Map** : drag les objets/sprites de la library droite sur le canvas
6. **Music** : composer dans le piano roll, choisir loop A/B
7. **▶ PLAY** : tester sur la console virtuelle
8. **Save** puis **Build / Export** pour le `.luma` final

## Différences avec V1.4

- **Look** : passage du sombre/bleu/jaune rétro arcade au gris/clair pro façon
  outil de dev (Construct 3, GameMaker 8). Les overlays sprite-editor et
  simulator restent dark pour le mode focus.
- **Layout** : 4 colonnes pixel-perfect d'après les dessins du user (topbar +
  left-nav + center + right-inspector + library + bottombar).
- **Capacity bar** : déplacée dans la topbar, plus visible en permanence.
- **Modes** : la left-nav remplace les nav-btn de la sidebar V1.4.

## Aucune régression V1.4

Tous les modules fonctionnels V1.1→V1.4 sont conservés et chargés. Le bug
orphelin `addEvent` de V1.4 est corrigé (pas d'élément référencé dans app.js
qui n'existe pas dans index.html, vérifié par audit automatique).
