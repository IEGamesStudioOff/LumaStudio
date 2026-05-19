# Luma Studio v1.3

Éditeur rétro Electron + base runtime ESP32 pour créer des jeux Luma.

## Nouveautés V1.3

### 🎹 Music Editor refondu — Piano Roll
Refonte complète de l'éditeur musique. Plus de boutons "addNote" séquentiels —
maintenant tu composes visuellement sur une grille piano.

**Grille piano roll** :
- **3 octaves visibles** (C3 → B5), 36 lignes (touches blanches et noires
  alternées comme un vrai piano).
- **4 à 64 steps** ajustables au slider (1 step = 1/16ème de noir).
- **Click sur une case** = active/désactive la note correspondante. Avec
  pré-écoute audio courte au clic pour entendre ce que tu poses.
- **Lignes de beat** (toutes les 4 steps) et **lignes de bar** (toutes
  les 16 steps) pour repérage visuel.

**Deux pistes parallèles** (BUZZER A mélodie + BUZZER B basse/harmonie),
chacune avec :
- Couleur de notes propre (vert pour A, jaune pour B).
- **Checkbox 🔁 Loop A / Loop B** indépendantes — tu peux jouer une boucle
  d'ambiance en A pendant que B joue un one-shot.
- Indicateur de note en cours pendant la lecture.

**Aiguille de lecture animée** : un trait vertical rouge avance step par
step pendant le play, scroll horizontal automatique si la séquence est plus
large que l'écran.

**9 presets sonores** :
- 🎶 Main Theme (120 BPM, 32 steps, loop)
- 👹 Boss Theme (160 BPM, 32 steps, loop)
- 🌃 Décor / Ambient (60 BPM, 32 steps, loop)
- 🔫 Blaster SFX (240 BPM, 8 steps, once)
- 💥 Explosion (200 BPM, 12 steps, once)
- 🪙 Pickup / Coin (240 BPM, 4 steps, once)
- ↑ Jump (240 BPM, 6 steps, once)
- ⚡ Hit / Damage (240 BPM, 4 steps, once)
- 🆕 Vierge

Chaque preset pose un canevas de notes pour démarrer, à toi de modifier.

**Contrôles** :
- ▶ PLAY / ⏸ PAUSE
- ■ STOP
- ⏮ Rewind (retour début)
- 🗑 Clear A+B

**Stats live** : nombre de notes par track, durée totale, taille en octets
estimée, BPM, steps, loop status.

**Audio** : Web Audio API avec **oscillateurs square wave** (forme d'onde
authentique d'un buzzer piézo passif, pas un sinus lisse). Chaque buzzer
est strictement monophonique comme sur le hardware.

### ▶ Simulateur console (bouton vert en haut à gauche)
Un bouton **▶ SIMULER** visible en permanence dans le header lance une
simulation haute fidélité de la console Luma.

**Ce que ça reproduit fidèlement** :
- **Écran ST7735 160×128 RGB565** rendu pixel-perfect (×4 scale visuel,
  aucun antialiasing, palette identique au moteur C).
- **Effet matrice LCD** : léger striping horizontal pour suggérer la
  structure subpixel du panneau ST7735.
- **30 FPS stable** (= `vTaskDelay(33ms)` du moteur ESP32).
- **2 buzzers piézo** en square wave Web Audio (vraie forme d'onde
  électroniquement carrée, harmoniques impaires incluses), strictement
  monophoniques.
- **Logique runtime miroir du moteur ESP32** : collision 4 coins avec
  sliding X/Y séparé, caméra clampée 4 bords, rendu tile palette identique.
- **Sprite RGB565** du joueur si tu en as édité un dans le sprite editor
  (premier sprite trouvé = sprite joueur, comme côté ESP32).
- **Musique du projet** jouée en boucle avec loop A/B indépendants.

**Inputs** :
- ⬅⬇⬆➡ (ou ZQSD/WASD) : déplacement
- Z : bouton A (dialogue)
- X : bouton B (fermer dialogue)
- ESC : quitter le simulateur

**Honest disclaimer** : ce n'est pas une émulation cycle-accurate du
binaire ESP32 (ça demanderait QEMU/Renode). C'est une simulation qui
fait tourner la même logique JS du studio en respectant fidèlement les
contraintes hardware. Le rendu visuel et le comportement sont identiques
à ce que tu verras sur la console réelle.

**Padd virtuel à l'écran** (cliquable / tactile) pour tester sans clavier.

**FPS counter + position joueur + position caméra** affichés en live dans
la barre verte du haut.

### 📦 Capacity Bar live
Un grand rectangle bleu en haut de chaque panneau affiche en permanence :
- **Taille actuelle / taille max** du projet (ex: "234.5 Ko / 550 Ko (43%)").
- **Barre de progression** verte / jaune / rouge selon le pourcentage.
- **Marker rouge à 80%** pour alerte visuelle.
- **Breakdown live** : 🎨 sprites · 🎵 audio · 🗺 maps · ⚙ code.

Mise à jour en temps réel à chaque action : édition d'une frame, ajout
d'une note de musique, création d'une map, etc.

## Côté PC / Electron — fonctionnalités cumulatives

- V0.4 Project Manager
- V0.5 Object & Event Database
- V1.1 Sprite Editor pixel-art + V1.2 Layers
- V1.1 Animation Editor + V1.2 Export GIF
- **V1.3 Music Editor Piano Roll** (refonte complète)
- V1.0 Dialogues / Cutscenes
- V1.0 Map / Scene Editor
- V1.0 Build / Export Pipeline + V1.2 LPK sprite-aware
- **V1.3 Console Simulator** (bouton ▶ SIMULER en haut à gauche)
- **V1.3 Capacity Bar live** dans le header

Lancer l'éditeur :

```bash
npm install
npm start
```

## Moteur ESP32 — `luma_engine_esp32/`

Inchangé depuis V1.2 :
- launcher `/sdcard/jeux/` + lecture `manifest.json`
- chargement `game.luma` (couches floor/decor/collision en RAM)
- collision joueur ↔ tiles + clamp caméra 4 bords
- ouverture LPK + lecture sprites RGB565
- rendu sprite joueur depuis LPK
- audio piezo 2 canaux non-bloquant (2 timers LEDC indépendants)
- save FAT-safe

## Limitations connues V1.3

- Le simulateur n'exécute pas le binaire ESP-IDF ; il reproduit la logique
  du moteur en JS. Pour une émulation cycle-accurate, il faudrait QEMU
  ou Renode (hors scope studio).
- Le music editor utilise une "duration = 1 step" simple (pas encore de
  notes tenues sur plusieurs cellules). Une V1.4 pourrait ajouter ça.
- Le breakdown de la capacity bar est estimatif (les fichiers réels
  binaires post-compilation peuvent varier de ±10%).
