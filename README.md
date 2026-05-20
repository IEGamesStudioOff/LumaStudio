# Luma Studio v1.4

Éditeur rétro Electron + base runtime ESP32 pour créer des jeux Luma.

## Nouveautés V1.4 — Refonte ergonomique majeure

Le système Objects/Events était trop abstrait pour des créateurs débutants.
V1.4 le transforme en un véritable outil visuel inspiré de Construct 3,
NESmaker, RPG Maker et Game Builder Garage.

### 📚 Bibliothèque permanente (gauche)

Un explorateur de ressources visible en permanence affiche toutes les
catégories du jeu :

- 🎨 Sprites
- 🎬 Animations
- 📦 Objets
- 🎵 Musique
- 💬 Dialogues
- 🗺 Maps
- 🎬 Cutscenes
- ⚡ Events

Chaque catégorie est repliable, avec un compteur d'éléments. Chaque item
affiche une **thumbnail RGB565 réelle** (pas un placeholder), son nom, et
des métadonnées (dimensions, BPM, frame count selon le type).

**Actions disponibles** sur chaque item :
- ✎ Renommer
- ⎘ Dupliquer
- × Supprimer
- Drag handle pour drag-and-drop
- Click sur le nom = ouvre l'éditeur correspondant

**Search bar** en haut filtre instantanément toutes les catégories.

### 🎯 Object Editor — constructeur visuel 3 colonnes

Plus aucun ID manuel à retenir. Plus de noms d'animations à recopier.

**Colonne gauche — Liste des objets** :
- Thumbnail RGB565 réelle de chaque objet
- Badge de status ✓ valide / ⚠ attention / ✖ invalide
- ID auto-incrémenté affiché (01, 02, 03...)
- Bouton + AJOUTER en haut
- Section Events compacte en bas (toggleable)

**Colonne centrale — Formulaire de l'objet** :
- Nom (input)
- ID auto (readonly)
- Type (dropdown : 🧍 Player / 👾 Enemy / 💬 NPC / 🎁 Item / ⚡ Projectile / 🌿 Décor / 🎯 Trigger / 🚪 Door)
- Behavior (dropdown : Aucun / 🏃 Plateforme / 🎮 Top-Down / 👣 Suit le joueur / ↔ Patrol / ↕ PatrolVertical / 🏀 Bounce / 🔄 Spinner / 💰 Pickup / 💬 DialogueOnTouch / 💥 DamageOnTouch / 🚪 Door)
- 🎨 Sprite (dropdown des frames existantes avec dimensions)
- 🎬 Animation (dropdown des animations existantes avec frame count)
- Tags (input avec hint)
- ☑ Solide / collision
- HP (number)
- Vitesse (number)

Tout est **lié visuellement** : choisir un sprite met à jour la preview
instantanément, choisir un behavior met à jour le banner de validation.

**Colonne droite — Preview live** :
- Canvas 160×160 avec damier de transparence
- **Sprite animé en temps réel** si une animation est associée
- Hitbox rouge si l'objet est solide
- Banner status global ✓ VALIDE / ⚠ ATTENTION / ✖ INVALIDE
- Liste des issues détectées (sprite manquant, animation supprimée, etc.)
- Tableau de détails : ID, Nom, Type, Behavior, Sprite, Animation, Solide, HP, Vitesse, Tags, Mémoire estimée

### 🗺 Drag-and-drop dans le Map Editor

Plus de placeholders carrés. Plus d'IDs à taper manuellement.

- Glisse un objet depuis la bibliothèque (ou depuis la liste de l'object editor) directement sur la map
- Le **vrai sprite RGB565** apparaît immédiatement à la position du drop, snappé sur la grille de tiles
- Glisse aussi des sprites bruts : un objet « décor » est créé automatiquement à partir du sprite
- Feedback visuel pendant le drag : outline vert pulsant sur la map
- Outline jaune autour des objets de type PLAYER pour repérage immédiat

### ⚙ Moteur ESP32 mis à jour

Le format `luma_object_instance_t` côté C est étendu avec `sprite_name`,
`sprite_w`, `sprite_h`. Le binding objet ↔ sprite est résolu côté Studio
au moment du build (`makeGameLuma`), donc le moteur ESP32 lit directement
le nom du sprite à blitter et n'a pas à faire de double-lookup.

- `luma_game.c` parse `scenes[].objects[]` et remplit `rt->objects[]`
- `luma_render.c` blit le sprite de chaque objet depuis le LPK avec un
  buffer temporaire de 32×32 max (= 2 Ko partagés)
- Fallback rect cyan si le sprite n'existe pas ou est trop gros

## Fonctionnalités cumulatives

- V0.4 Project Manager
- **V1.4 Library Browser permanent + Object Editor visuel + Drag-and-drop map**
- V1.1 Sprite Editor pixel-art + V1.2 Layers
- V1.1 Animation Editor + V1.2 Export GIF
- V1.3 Music Editor Piano Roll
- V1.0 Dialogues / Cutscenes
- V1.0 Map / Scene Editor + **V1.4 sprites réels affichés**
- V1.0 Build / Export Pipeline + V1.2 LPK sprite-aware + V1.4 binding auto
- V1.3 Console Simulator
- V1.3 Capacity Bar live

Lancer l'éditeur :

```bash
npm install
npm start
```

## Workflow type V1.4

1. Importer une image dans **Asset Lab**, la découper en frames
2. Ouvrir une frame dans le **Sprite Editor** (bouton ✎ EDIT sur la card) et la dessiner pixel par pixel
3. Aller dans **Animations**, créer une animation avec plusieurs frames
4. Aller dans **OBJECTS / EVENTS**, cliquer **+ AJOUTER** : un objet vide
5. Lui donner un nom, un type, choisir le sprite + l'animation dans les dropdowns, configurer behavior + tags + solide
6. Le preview à droite valide l'objet en live
7. Aller dans **Map / Scene Editor**, **glisser l'objet** depuis la bibliothèque vers la map
8. Cliquer **▶ SIMULER** pour tester sur la console virtuelle
9. **SAUVEGARDER** puis exporter le `.luma` final pour la console réelle

## Limitations connues V1.4

- L'animation d'objet sur ESP32 (frame-by-frame depuis un `animationId`) est
  préparée côté C mais le runtime n'avance pas encore le timing — viendra
  en V1.5.
- Pas encore de **rotation** ou **scale** des objets placés (V1.5).
- Pas encore d'**aimant aux tiles** ni d'**alignement précis sub-tile** —
  le drop snap sur la grille du tilesize.
- Buffer sprite ESP32 limité à 32×32 par objet (= 2 Ko). Au-delà : fallback
  rect cyan. Suffisant pour 90% des cas, mais un système de cache LRU
  permettrait des sprites 64×64 en V1.5.
