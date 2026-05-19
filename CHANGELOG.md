# CHANGELOG

## V1.3 — Music Piano Roll, Simulator, Capacity Bar

### Nouveautés majeures

**Music Editor V1.3 — Piano Roll** (`renderer/music-editor.js`, 557 lignes) :
- Refonte complète, remplace l'ancien UI basé sur boutons sequentiels.
- Grille piano roll 36 lignes (C3 → B5) × 4-64 steps configurables.
- 2 tracks parallèles (Buzzer A vert / Buzzer B jaune) avec loop indépendant.
- 9 presets sonores avec seeds (main theme, boss, ambient, blaster, explosion,
  coin, jump, hit, blank).
- Aiguille de lecture animée + scroll horizontal auto.
- Audio Web Audio square waves (forme d'onde piézo authentique).
- Pré-écoute au clic sur une cellule.
- Stats live : notes par track, durée, BPM, steps, octets.
- Indicateur de note en cours pendant le play (`Status A: G4`).
- Model `music.grid[track][step] = {note, octave} | null` avec rebuild
  automatique de `music.tracks` (format ESP32) pour rétrocompat moteur.

**Simulator console** (`renderer/simulator.js`, 584 lignes) :
- Bouton `▶ SIMULER` vert dans le header (visible en permanence).
- Overlay full-screen avec bezel console + canvas 160×128 scale ×4.
- Framebuffer Uint16Array 160×128 RGB565, flush → ImageData → canvas.
- Effet LCD striping horizontal subtil (8% alpha).
- 30 FPS via requestAnimationFrame + timing TICK_MS 33ms.
- Logique miroir du moteur ESP32 :
  - `canStandAt()` 4 coins + sliding X/Y séparé
  - `centerCamera()` clamp 4 bords
  - `isSolidAt()` lecture `map.layers.collision`
  - rendu tiles palette identique (TILE_PALETTE 8 couleurs)
  - blit sprite RGB565 si premier frame édité disponible
- Audio Web Audio square waves monophoniques par buzzer (vraie forme piézo).
- Mini-font 4×6 pour le texte UI (alphabet + chiffres + symboles).
- Inputs clavier (flèches, ZQSD/WASD, Z=A, X=B, ESC=quit).
- D-pad virtuel à l'écran (pointerdown/up) pour test tactile.
- Lecture musique projet en boucle synchronisée sur step + loop A/B.
- FPS counter + position joueur/caméra live.

**Capacity Bar live** (`renderer/app.js` updateCapacityBar) :
- Grand rectangle bleu sticky en haut de chaque panneau du studio.
- Affichage `XXX.X Ko / YYY Ko (NN%)` + barre de progression.
- Gradient vert (<80%) → jaune (80-95%) → rouge (>95%).
- Marker rouge à 80% pour alerte visuelle.
- Breakdown live : 🎨 sprites · 🎵 audio · 🗺 maps · ⚙ code.
- Appelée automatiquement depuis `updateMemory()` et `renderAll()`,
  + à chaque modif du music editor via `LumaMusicEditor.getByteSize()`.

### Modifications techniques

- `index.html` :
  - Bouton `#btnSimulate` ajouté dans `.workspace-header > .header-left`.
  - Bloc `.capacity-bar-wrap` inséré entre header et `.panel`.
  - `<section id="musicPanel">` vidé pour remplissage par music-editor.js.
  - Scripts `music-editor.js` et `simulator.js` chargés après animation-editor.
- `app.js` :
  - Suppression du code legacy music (addNote, playMusic, scheduleTrack,
    activeOscillators, noteFreq, renderMusic).
  - `saveAll` appelle `LumaMusicEditor.rebuildTracksFromGrid()` avant save.
  - `renderAll` appelle `LumaMusicEditor.refresh()` et `updateCapacityBar()`.
  - Nouvelle fonction `updateCapacityBar()` qui calcule sprites + audio +
    maps + code et met à jour la barre.
- `style.css` : +450 lignes pour piano roll, simulator, capacity bar.

### Version bumps

- `package.json` 1.2.0 → 1.3.0
- `lumaStudioVersion` et manifest → 1.3.0
- `LUMA_VERSION` C → 1.3.0
- Titre fenêtre + splash → v1.3

### Aucune régression V1.2

Tous les fixes V1.0.1 + features V1.1 (sprite editor, animation editor) +
V1.2 (layers, GIF, sprite RGB565 ESP32) sont conservés et fonctionnels.
Format `music.tracks` legacy reconstruit automatiquement à la sauvegarde
pour compat avec le moteur ESP32.

---

## V1.2 — Layers, GIF & ESP32 sprite rendering

Voir CHANGELOG V1.2 dans archive antérieure.

## V1.1 — Sprite Editor & Animation Editor

Voir CHANGELOG V1.1 dans archive antérieure.

## V1.0.1 — Patch correctif (15 bugs)

Voir CHANGELOG V1.0.1 dans archive antérieure.
