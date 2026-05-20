# CHANGELOG

## V1.4 — Refonte ergonomique majeure (Library + Object Editor visuel + Drag-and-drop)

### Nouveaux modules

- **`renderer/library-browser.js`** (380 lignes) : explorateur de ressources
  permanent à gauche du studio. 8 catégories (sprites, animations, objets,
  musique, dialogues, maps, cutscenes, events) avec :
  - Thumbnails RGB565 réelles décodées depuis pixelsB64.
  - Sections repliables avec compteurs.
  - Actions par item : ✎ renommer, ⎘ dupliquer, × supprimer.
  - Drag handles avec MIME types `application/x-luma-object`,
    `application/x-luma-frame`, `application/x-luma-anim`.
  - Click sur item ouvre l'éditeur correspondant.
  - Search bar avec filtre instantané toutes catégories.
  - Inséré dans `.app-shell` avant la sidebar via MutationObserver.

- **`renderer/object-editor.js`** (534 lignes) : constructeur visuel
  d'objets en 3 colonnes :
  - **Liste** : cards avec thumbnail, status ✓/⚠/✖, ID auto en badge.
  - **Form** : dropdowns auto-remplis depuis OBJECT_TYPES, OBJECT_BEHAVIORS,
    frames[] et animations[]. ID readonly. Tags chips. Switch solide.
    HP/vitesse number inputs.
  - **Preview** : canvas 160×160 avec damier transparent, sprite animé
    via requestAnimationFrame (utilise speedMs de l'animation choisie),
    hitbox rouge si solide, banner validation, liste issues, tableau détails.
  - Validation live : sprite manquant, animation supprimée, behavior inconnu.
  - CRUD complet : add (next ID), duplicate, delete, rename.
  - Section Events compacte en bas, repliable.

### Modifications

- **`renderer/app.js`** :
  - Constantes `OBJECT_TYPES[]` (8 types avec icônes et couleurs) et
    `OBJECT_BEHAVIORS[]` (12 behaviors prédéfinis) en variables globales.
  - `ensureObjectShape()` migre les anciens objets vers le nouveau format
    avec `spriteFrameId`, `animationId`, `solid`, `hp`, `speed`, `properties`.
  - Handlers `dragover` / `dragleave` / `drop` sur `mapCanvas` qui acceptent
    `application/x-luma-object` et `application/x-luma-frame`.
  - `drawPlacedObjects()` réécrit : utilise `getCachedSpritePixels()` qui
    cache les ImageData par `frameId:editedAt`, blit les vrais sprites
    RGB565 décodés, outline jaune pour les PLAYER, fallback type-coloré
    avec 3 lettres du nom si pas de sprite.
  - Suppression du handler `addObject` legacy (basé sur inputs texte).
  - `renderObjects()` délègue à `LumaObjectEditor.refresh()`.
  - `renderAll()` appelle aussi `LumaLibrary.refresh()`.
  - `enterStudio()` force init de Library + ObjectEditor après ouverture.

- **`renderer/index.html`** :
  - `<section id="logicPanel">` vidé pour remplissage par object-editor.
  - Scripts `object-editor.js` et `library-browser.js` ajoutés.

- **`renderer/style.css`** : +650 lignes pour bibliothèque (`.luma-library`,
  `.lib-cat`, `.lib-item`), object editor (`.oe-layout`, `.oe-card`,
  `.oe-form-grid`, `.oe-preview-canvas-wrap`, `.oe-status-banner`, etc.),
  drop target visual (`#mapCanvas.drop-target` outline glow vert).
  Adaptation de `.app-shell` en flex container pour accueillir la library
  à gauche, sidebar au centre, workspace à droite.

- **`main.js`** : `makeGameLuma` enrichit chaque `scenes[].objects[]`
  instance avec `spriteName` (= `sprites/<frame_id>.spr`), `spriteW`,
  `spriteH`, plus `type`, `behavior`, `solid`, `hp`, `speed`, `animationId`
  copiés depuis l'objet définition. Le moteur ESP32 lit ces champs
  directement sans double-lookup.

### Moteur ESP32

- **`luma_types.h`** : `luma_object_instance_t` étendu avec
  `sprite_name[LUMA_MAX_NAME]`, `sprite_w`, `sprite_h`.

- **`luma_game.c`** : parse `scenes[i].objects[]` JSON, remplit
  `rt->objects[]` avec `object_id`, `instance_name`, `x`, `y`, `enabled`,
  `sprite_name`, `sprite_w`, `sprite_h`. Limite `LUMA_MAX_OBJECTS = 32`.
  Log "Loaded scene: ... (N objects)".

- **`luma_render.c`** : nouvelle loop d'objets qui blit le sprite depuis
  le LPK via `luma_lpk_read_sprite()` avec buffer partagé
  `s_obj_sprite_buf[1024]` (32×32 max = 2 Ko). Skip clipping global avant
  lecture LPK. Fallback rect cyan si sprite > 32×32 ou non trouvé.

- **`main.c`** : `s_assets` et `s_assets_open` passés de `static` à
  `extern`-able pour être lus depuis luma_render.c. Commentaire explicatif.

### Version bumps

- `package.json` 1.3.0 → 1.4.0
- `lumaStudioVersion` et manifest → 1.4.0
- `LUMA_VERSION` C → 1.4.0
- Titre fenêtre + splash → v1.4

### Rétrocompat préservée

Format `objects.json` étendu mais conserve les anciens champs (id, name,
type, tags, behavior). `ensureObjectShape()` migre automatiquement les
projets V1.3 au chargement. Format `music`, `scenes`, `maps`, `frames`
inchangés. Les jeux V1.3 chargent et s'exécutent sans modification.

### Aucune régression

Tous les fixes V1.0.1, features V1.1-1.3 sont conservés. Tests `node -c`
passent sur 10/10 fichiers JS. Tests `gcc -fsyntax-only` passent sur 7/7
fichiers C modifiés avec stubs ESP-IDF.

---

## V1.3 — Music Piano Roll, Simulator, Capacity Bar
Voir CHANGELOG V1.3 dans archive antérieure.

## V1.2 — Layers, GIF & ESP32 sprite rendering
Voir CHANGELOG V1.2 dans archive antérieure.

## V1.1 — Sprite Editor & Animation Editor
Voir CHANGELOG V1.1 dans archive antérieure.

## V1.0.1 — Patch correctif (15 bugs)
Voir CHANGELOG V1.0.1 dans archive antérieure.
