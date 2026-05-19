# Luma Studio v1.2

Éditeur rétro Electron + base runtime ESP32 pour créer des jeux Luma.

## Nouveautés V1.2

### 🎨 Sprite Editor — Layers multi-pile
Le sprite editor V1.1 gagne un système de layers complet façon Photoshop /
Aseprite. Chaque frame peut contenir **N layers** superposés :

- **Add / Delete / Move up-down / Merge down** un layer.
- **Visibility** togglable par layer (●/○).
- **Opacité 0-100%** par layer (rendu en damier 50% pour les valeurs
  intermédiaires, vu les contraintes 32 couleurs).
- **Renommage** par double-clic sur le nom.
- **Composition automatique** : le canvas affiche tous les layers visibles,
  l'édition se fait sur le layer actif (highlight bleu).
- **Pipette intelligente** : pique la couleur visible (de la composition),
  pas celle du layer actif sous-jacent.
- **Frame ops globales** : flip H/V, rotate 90°, resize → appliqués à tous
  les layers en cohérence.
- **Migration auto V1.1 → V1.2** : les frames avec `pixelsB64` deviennent
  un seul layer "Base".

Workflow typique : 1 layer outline + 1 layer fill + 1 layer shading.
Les color ramps + onion skin V1.1 fonctionnent en plus des layers.

### 📽 Export GIF animé
Bouton **📽 GIF (×4)** et **📽 GIF (×1)** dans les settings de
l'animation editor. Encoder GIF89a complet implémenté en JS pur :

- **Compression LZW** standard (codes de taille variable, LSB-first).
- **Palette globale dynamique** (jusqu'à 255 couleurs uniques + index 0
  pour la transparence).
- **Durées per-frame** respectées (override par-slot inclus).
- **Loop infini** (Netscape 2.0 extension).
- **Upscale** ×1 ou ×4 (×1 = rendu console, ×4 = lisible pour réseaux).
- **Centrage automatique** si les frames d'une anim n'ont pas toutes la
  même taille.

Téléchargement direct via blob, nom de fichier = `<anim_name>.gif`
ou `<anim_name>_x4.gif`. Validé avec PIL pour la conformité.

### 🎮 Rendu sprite RGB565 sur ESP32 (le gros morceau)
Le moteur console rend maintenant les **vrais sprites** dessinés dans le
studio, plus seulement des rectangles colorés.

**Pipeline complet** :

1. **Build studio** : lors de l'export `assets.lpk`, chaque frame avec
   `pixelsB64` est compilée en fichier binaire
   `sprites/<frame_id>.spr` au format :
   `[2B w LE | 2B h LE | w*h*2 bytes pixels BE]`. L'endianness ST7735
   (big-endian) est appliquée à l'encodage pour un blit direct.
2. **ESP32 boot** : ouverture du LPK puis recherche du premier asset de
   type `sprite`, chargement en RAM dans `runtime.player_sprite_pixels[]`
   (max 64×64 = 8 Ko par sprite).
3. **Runtime** : la collision joueur utilise la dimension du sprite ;
   le rendu utilise `luma_render_blit_rgb565()` à la position joueur.
4. **Rendu** : ligne par ligne, segments contigus opaques regroupés en
   un seul appel SPI pour minimiser le bus, byte-swap LE→BE intégré.

Si aucun sprite n'est trouvé dans le LPK, fallback sur le rect jaune.

API C ajoutée :
- `luma_lpk_read_sprite(lpk, name, *w, *h, pixels, max_pixels)` — décode
  un sprite depuis le LPK avec byte-swap automatique.
- `luma_render_blit_rgb565(x, y, w, h, pixels, transparent_color)` —
  blit avec transparence par couleur (magenta 0xF81F par convention).

## Côté PC / Electron

- V0.4 Project Manager
- V0.5 Object & Event Database
- **V1.1 Sprite Editor pixel-art** + **V1.2 Layers**
- **V1.1 Animation Editor** + **V1.2 Export GIF**
- V0.6 Music Editor 8-bit
- V1.0 Dialogues / Cutscenes
- V1.0 Map / Scene Editor
- V1.0 Build / Export Pipeline + **V1.2 LPK sprite-aware**

Lancer l'éditeur :

```bash
npm install
npm start
```

## Moteur ESP32 — `luma_engine_esp32/`

- launcher `/sdcard/jeux/` + lecture `manifest.json`
- chargement `game.luma` (couches floor/decor/collision en RAM)
- collision joueur ↔ tiles + clamp caméra 4 bords
- ouverture LPK + **lecture sprites RGB565** (V1.2)
- **rendu sprite joueur depuis LPK** (V1.2)
- audio piezo 2 canaux non-bloquant
- save FAT-safe

## Limitations connues V1.2

- **Un seul sprite chargé en RAM** côté ESP32 (le premier trouvé devient
  le sprite joueur). Le mapping `objet ↔ sprite ↔ animation` arrive en V1.3.
- **Pas de cache disque LRU** : si on veut multiplier les sprites en RAM,
  il faudra ajouter un système de slot ou streaming depuis le LPK.
- Les opacités partielles dans le sprite editor sont affichées en damier
  (32 couleurs limitées ne permettent pas un vrai alpha blend pertinent).
- L'export GIF utilise une palette globale unique pour toutes les frames
  de l'anim — au-delà de 255 couleurs uniques, troncation.
