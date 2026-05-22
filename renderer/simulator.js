// =============================================================================
// LUMA STUDIO — CONSOLE SIMULATOR (V1.3)
// =============================================================================
// Simulation haute fidélité de la console Luma. Reproduit fidèlement les
// contraintes hardware sans émuler le binaire ESP32 :
//   - Écran ST7735 160×128 RGB565 pixel-perfect (scale ×4 par défaut)
//   - 2 buzzers piézo monophoniques en square wave (vraie forme d'onde)
//   - 30 FPS (= vTaskDelay(33) du moteur)
//   - Logique de collision identique au moteur (can_stand_at 4 coins)
//   - Tile palette identique (TILE_PALETTE C)
//   - Inputs mappés clavier (Flèches + Z=A, X=B, Entrée=Start, Shift=Select)
// =============================================================================

(function () {
  "use strict";

  const SCREEN_W = 160;
  const SCREEN_H = 128;
  const SCALE = 4; // affichage 640×512
  const FPS = 30;
  const TICK_MS = 1000 / FPS;
  const TRANSPARENT = 0xF81F;

  // Palette tiles identique à luma_render.c (C source)
  const TILE_PALETTE = [
    0x0000, 0x18FF, 0x5BFF, 0x07EE, 0xFFEB, 0xF2AE, 0x07FF, 0xF81F
  ];

  // Fréquences notes octave 4 (Hz) — identique à music-editor
  const NOTE_FREQ_O4 = {
    "C":  261.63, "C#": 277.18, "D":  293.66, "D#": 311.13,
    "E":  329.63, "F":  349.23, "F#": 369.99, "G":  392.00,
    "G#": 415.30, "A":  440.00, "A#": 466.16, "B":  493.88
  };

  function noteFreq(note, octave) {
    const base = NOTE_FREQ_O4[note];
    if (!base) return 0;
    return base * Math.pow(2, octave - 4);
  }

  // V1.5.3 — Charge l'image du tileset, décode chaque tuile en RGB565
  // dans un cache. Le rendu lit ce cache pour blitter pixel-perfect.
  function loadTilesetForSim(ts) {
    sim.tilesetReady = false;
    sim.tilePixelCache = new Map();
    const img = new Image();
    img.onload = () => {
      try {
        const tmp = document.createElement("canvas");
        tmp.width = img.width;
        tmp.height = img.height;
        const tctx = tmp.getContext("2d");
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(img, 0, 0);
        const tileSize = ts.tileSize;
        for (let row = 0; row < ts.rows; row++) {
          for (let col = 0; col < ts.cols; col++) {
            const tileIdx = row * ts.cols + col;
            const data = tctx.getImageData(col * tileSize, row * tileSize, tileSize, tileSize).data;
            const px = new Uint16Array(tileSize * tileSize);
            for (let i = 0; i < tileSize * tileSize; i++) {
              const a = data[i * 4 + 3];
              if (a < 128) {
                px[i] = 0xF81F; // transparent magenta
              } else {
                const r5 = data[i * 4]     >> 3;
                const g6 = data[i * 4 + 1] >> 2;
                const b5 = data[i * 4 + 2] >> 3;
                px[i] = (r5 << 11) | (g6 << 5) | b5;
              }
            }
            sim.tilePixelCache.set(tileIdx, px);
          }
        }
        sim.tilesetReady = true;
      } catch (e) {
        console.warn("Tileset decode failed:", e);
      }
    };
    img.src = ts.dataUrl;
  }

  // V1.5.3 — Blit une tuile du tileset à (x,y), avec transparence et clipping
  function blitTileFromTileset(x, y, tileSize, tileIdx) {
    if (!sim.tilePixelCache) return false;
    const px = sim.tilePixelCache.get(tileIdx);
    if (!px) return false;
    for (let row = 0; row < tileSize; row++) {
      const py = y + row;
      if (py < 0 || py >= SCREEN_H) continue;
      for (let col = 0; col < tileSize; col++) {
        const tx = x + col;
        if (tx < 0 || tx >= SCREEN_W) continue;
        const c = px[row * tileSize + col];
        if (c === 0xF81F) continue;
        sim.fb[py * SCREEN_W + tx] = c;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const sim = {
    open: false,
    overlay: null,
    canvas: null,
    ctx: null,
    imgData: null,    // ImageData(160×128) pour le framebuffer logique
    fb: null,         // Uint16Array(160*128) RGB565 framebuffer "console"
    rafId: 0,
    lastTick: 0,
    // jeu state
    map: null,
    scene: null,
    player: { x: 32, y: 32, size: 12 },
    camera: { x: 0, y: 0 },
    sprite: null,     // { w, h, pixels } premier sprite trouvé
    // V1.5.3 — Tileset support
    tileset: null,
    tilePixelCache: null,
    tilesetReady: false,
    // V1.5.5 — Cache des sprites RGB565 des objets placés (frameId → {w,h,pixels})
    objectSpriteCache: null,
    dialogue: null,
    // input
    keys: {},
    // audio
    audioCtx: null,
    voices: { A: null, B: null },
    // musique playback
    musicStart: 0,
    lastStepA: -1,
    lastStepB: -1,
    statsEl: null,
    fpsCount: 0,
    fpsLast: 0,
    fpsLabel: 0
  };

  function $$(id) { return document.getElementById(id); }

  function cloneData(data) {
    try {
      if (typeof structuredClone === "function") return structuredClone(data);
    } catch (e) {}
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      return data;
    }
  }

  function ensureSceneSnapshots() {
    if (!sim._sceneSnapshots) sim._sceneSnapshots = new Map();
    if (typeof scenes === "undefined") return;
    for (const sc of scenes) {
      if (!sc || sc.id == null || sim._sceneSnapshots.has(sc.id)) continue;
      sim._sceneSnapshots.set(sc.id, {
        objects: cloneData(sc.objects || []),
        playerSpawn: cloneData(sc.playerSpawn || null),
        mapId: sc.mapId
      });
    }
  }

  function restoreSceneInitialState(sc) {
    if (!sc) return;
    ensureSceneSnapshots();
    const snap = sim._sceneSnapshots && sim._sceneSnapshots.get(sc.id);
    if (!snap) return;
    sc.objects = cloneData(snap.objects || []);
    sc.playerSpawn = cloneData(snap.playerSpawn || null);
    sc.mapId = snap.mapId;
  }

  function resetPlayerForScene(sc) {
    if (!sim.player) return;
    sim.player.dead = false;
    sim.player.visible = true;
    sim.player.vx = 0;
    sim.player.vy = 0;
    sim.player.subX = 0;
    sim.player.subY = 0;
    sim.player.grounded = false;
    sim.player.jumpPrev = false;
    if (sim._doorSpawn) {
      sim.player.x = sim._doorSpawn.x;
      sim.player.y = sim._doorSpawn.y;
      sim._doorSpawn = null;
    } else if (sc && sc.playerSpawn) {
      sim.player.x = sc.playerSpawn.x;
      sim.player.y = sc.playerSpawn.y;
    } else {
      sim.player.x = 32;
      sim.player.y = 32;
    }
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------
  function open() {
    if (!sim.overlay) buildOverlay();
    sim.open = true;
    sim.overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    // Snapshot de départ pour pouvoir redémarrer une scène proprement.
    ensureSceneSnapshots();

    // Charge la première scène/map du projet
    if (typeof scenes !== "undefined" && scenes.length > 0) {
      sim.scene = scenes[0];
    }
    if (typeof maps !== "undefined" && maps.length > 0) {
      sim.map = sim.scene ? maps.find(m => m.id === sim.scene.mapId) || maps[0] : maps[0];
    }
    // Init player
    if (sim.scene && sim.scene.playerSpawn) {
      sim.player.x = sim.scene.playerSpawn.x;
      sim.player.y = sim.scene.playerSpawn.y;
    } else {
      sim.player.x = 32; sim.player.y = 32;
    }
    // V1.6.1 — Init complète player (hitbox + état platformer)
    sim.player.w = 12;
    sim.player.h = 14;
    sim.player.size = 12; // compat legacy
    sim.player.vx = 0;
    sim.player.vy = 0;
    sim.player.subX = 0;
    sim.player.subY = 0;
    sim.player.grounded = false;
    sim.player.jumpPrev = false;
    // Trouve le 1er sprite avec pixelsB64
    sim.sprite = null;
    if (typeof frames !== "undefined") {
      for (const f of frames) {
        if (f.pixelsB64 && window.LumaSpriteEditor) {
          try {
            const px = window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h);
            sim.sprite = { w: f.w, h: f.h, pixels: px };
            // V1.6.1 — Adapte hitbox au sprite (avec marge pour passer dans 1 tile)
            sim.player.w = Math.min(f.w, 14);
            sim.player.h = Math.min(f.h, 14);
            sim.player.size = Math.min(f.w, f.h);
            break;
          } catch (e) {}
        }
      }
    }

    // V1.5.3 — Charge le tileset assigné à la map
    sim.tileset = null;
    sim.tilePixelCache = null;
    sim.tilesetReady = false;
    if (sim.map && sim.map.tilesetId && typeof tilesets !== "undefined") {
      const ts = tilesets.find(t => t.id === sim.map.tilesetId);
      if (ts && ts.dataUrl) {
        sim.tileset = ts;
        loadTilesetForSim(ts);
      }
    }

    // V1.5.5 — Précharge les sprites RGB565 des objets placés dans la scène.
    // Pour chaque instance d'objet → trouve l'objet définition → trouve sa frame
    // → décode pixelsB64 → cache. Le rendu peut alors blitter chaque objet.
    sim.objectSpriteCache = new Map();
    if (sim.scene && Array.isArray(sim.scene.objects)
        && typeof objects !== "undefined" && typeof frames !== "undefined"
        && window.LumaSpriteEditor) {
      for (const inst of sim.scene.objects) {
        const objDef = objects.find(o => o.id === inst.objectId);
        if (!objDef || objDef.spriteFrameId == null) continue;
        if (sim.objectSpriteCache.has(objDef.spriteFrameId)) continue;
        const frame = frames.find(f => f.id === objDef.spriteFrameId);
        if (!frame || !frame.pixelsB64) continue;
        try {
          const px = window.LumaSpriteEditor.base64ToPixels(frame.pixelsB64, frame.w * frame.h);
          sim.objectSpriteCache.set(objDef.spriteFrameId, {
            w: frame.w, h: frame.h, pixels: px
          });
        } catch (e) { /* skip frame illisible */ }
      }
    }

    // Boot audio
    if (!sim.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      sim.audioCtx = new Ctx();
    }
    sim.musicStart = performance.now();
    sim.lastStepA = -1;
    sim.lastStepB = -1;

    centerCamera();
    drawBootSplash();

    // V1.5.7 — Expose sim globalement pour event-sheet runtime
    window._lumaSim = sim;
    if (window.LumaEventSheet) {
      window.LumaEventSheet.resetRuntime();
    }
    // V1.5.9 — Set des boutons console tenus (pour on_input_hold)
    sim.heldButtons = new Set();

    // Démarre la boucle après le splash
    setTimeout(() => {
      sim.lastTick = performance.now();
      sim.fpsLast = sim.lastTick;
      // V1.5.7 — Déclenche les events on_scene_start
      if (window.LumaEventSheet) {
        const fired = window.LumaEventSheet.runTriggersOfType("on_scene_start", sim);
        if (fired.length) console.log("[Sim] on_scene_start →", fired);
      }
      sim.rafId = requestAnimationFrame(loop);
    }, 800);
  }

  function close() {
    sim.open = false;
    sim.overlay.classList.remove("active");
    document.body.style.overflow = "";
    if (sim.rafId) cancelAnimationFrame(sim.rafId);
    stopAllVoices();
  }

  function drawBootSplash() {
    fillFramebuffer(0x0000);
    drawText(16, 50, "LUMA ENGINE 1.3", 0xFFFF);
    drawText(20, 64, "BOOTING...", 0x07FF);
    drawText(8, 100, "Sim. fidelity HW console", 0x5BFF);
    flush();
  }

  // ---------------------------------------------------------------------------
  // MAIN LOOP — cadence 30 FPS comme vTaskDelay(33ms) côté ESP32
  // ---------------------------------------------------------------------------
  function loop(t) {
    if (!sim.open) return;
    if (t - sim.lastTick >= TICK_MS) {
      const dt = t - sim.lastTick;
      sim.lastTick = t;
      update();
      // V1.5.7 — Events timer (every_seconds) + camera shake
      if (window.LumaEventSheet) window.LumaEventSheet.tickTimers(sim, dt);
      // V1.5.9 — Si une action change_scene a été émise, switche la scène ici
      if (window.LumaEventSheet) {
        const pending = window.LumaEventSheet.consumePendingSceneSwitch();
        if (pending && pending.sceneId != null && typeof scenes !== "undefined") {
          const sc = scenes.find(s => String(s.id) === String(pending.sceneId));
          if (sc) {
            if (pending.restart) {
              console.log("[Sim] restart_scene →", sc.id);
              restoreSceneInitialState(sc);
            } else {
              console.log("[Sim] change_scene →", sc.id);
            }
            sim.scene = sc;
            sim.map = (typeof maps !== "undefined") ? (maps.find(m => m.id === sc.mapId) || sim.map) : sim.map;
            resetPlayerForScene(sc);
            sim.dialogue = null;
            sim._shake = null;
            sim._shakeOffset = null;
            // reset runtime collisions + re-fire on_scene_start
            window.LumaEventSheet.runtime.activeCollisions.clear();
            window.LumaEventSheet.runtime.everyTimers.clear();
            window.LumaEventSheet.runTriggersOfType("on_scene_start", sim);
          } else {
            console.warn("[Sim] change_scene/restart_scene : scène introuvable", pending.sceneId);
          }
        }
      }
      if (sim._shake && sim._shake.remaining > 0) {
        sim._shake.remaining -= dt;
        const i = sim._shake.intensity;
        sim._shakeOffset = {
          x: (Math.random() - 0.5) * 2 * i,
          y: (Math.random() - 0.5) * 2 * i
        };
        if (sim._shake.remaining <= 0) { sim._shake = null; sim._shakeOffset = null; }
      }
      render();
      flush();

      // FPS counter
      sim.fpsCount++;
      if (t - sim.fpsLast >= 1000) {
        sim.fpsLabel = sim.fpsCount;
        sim.fpsCount = 0;
        sim.fpsLast = t;
        if (sim.statsEl) sim.statsEl.textContent =
          `${sim.fpsLabel} FPS · pos (${sim.player.x|0},${sim.player.y|0}) · cam (${sim.camera.x|0},${sim.camera.y|0})`;
      }

      // Audio tick (synchronisé au render pour éviter glitch)
      updateMusic();
    }
    sim.rafId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // UPDATE — copie de luma_runtime.c (collision 4 coins + sliding X/Y)
  // ---------------------------------------------------------------------------
  function update() {
    if (!sim.map) return;
    // V1.6.0 — Si un objet de type PLAYER a un behavior, on délègue à LumaBehaviors.
    const objs = window.objects || [];
    const playerDef = objs.find(o => o.type === "PLAYER");
    const useBehaviorPlayer = playerDef && playerDef.behavior && playerDef.behavior !== "None"
                              && window.LumaBehaviors;

    if (useBehaviorPlayer) {
      window.LumaBehaviors.updatePlayer(sim, TICK_MS);
    } else {
      // Legacy : TopDown libre 4 directions
      const speed = 2;
      let dx = 0, dy = 0;
      if (sim.keys.ArrowLeft || sim.keys.q || sim.keys.a) dx = -speed;
      if (sim.keys.ArrowRight || sim.keys.d) dx = speed;
      if (sim.keys.ArrowUp || sim.keys.z || sim.keys.w) dy = -speed;
      if (sim.keys.ArrowDown || sim.keys.s) dy = speed;
      if (dx !== 0) {
        const nx = sim.player.x + dx;
        if (canStandAt(nx, sim.player.y)) sim.player.x = nx;
      }
      if (dy !== 0) {
        const ny = sim.player.y + dy;
        if (canStandAt(sim.player.x, ny)) sim.player.y = ny;
      }
    }

    // V1.6.0 — Update les behaviors d'instances (FollowPlayer, Patrol, Bounce, Spinner)
    if (window.LumaBehaviors) {
      window.LumaBehaviors.updateInstances(sim, TICK_MS);
      window.LumaBehaviors.handleContacts(sim);
    }

    // Boutons d'action legacy (Z = A pour le mode sans player behavior)
    if (!useBehaviorPlayer) {
      if (sim.keys.z && !sim.lastZ) {
        sim.dialogue = "LUMA ENGINE 1.6.0";
        playBeep("A", 880, 60);
      }
      sim.lastZ = !!sim.keys.z;
    }
    if (sim.keys.x && sim.dialogue) sim.dialogue = null;

    centerCamera();

    // V1.6.0 — Door behavior peut déclencher un change_scene avec spawn custom
    if (sim._doorSpawn && window.LumaEventSheet
        && window.LumaEventSheet.runtime.pendingSceneSwitch) {
      // Le simulator.loop consommera le pending et appliquera _doorSpawn comme position
    }
  }

  function isSolidAt(px, py) {
    if (!sim.map) return false;
    const t = sim.map.tileSize;
    const tx = Math.floor(px / t), ty = Math.floor(py / t);
    if (tx < 0 || ty < 0 || tx >= sim.map.width || ty >= sim.map.height) return true;
    return sim.map.layers.collision[ty * sim.map.width + tx] > 0;
  }

  function canStandAt(px, py) {
    const s = sim.player.size;
    return !isSolidAt(px, py)
      && !isSolidAt(px + s - 1, py)
      && !isSolidAt(px, py + s - 1)
      && !isSolidAt(px + s - 1, py + s - 1);
  }

  function centerCamera() {
    if (!sim.map) return;
    const mapW = sim.map.width * sim.map.tileSize;
    const mapH = sim.map.height * sim.map.tileSize;
    const maxX = Math.max(0, mapW - SCREEN_W);
    const maxY = Math.max(0, mapH - SCREEN_H);
    sim.camera.x = Math.max(0, Math.min(maxX, sim.player.x + sim.player.size / 2 - SCREEN_W / 2));
    sim.camera.y = Math.max(0, Math.min(maxY, sim.player.y + sim.player.size / 2 - SCREEN_H / 2));
  }

  // ---------------------------------------------------------------------------
  // RENDER — copie fidèle de luma_render_runtime (C)
  // ---------------------------------------------------------------------------
  function render() {
    fillFramebuffer(0x0000);
    if (!sim.map) {
      drawText(16, 50, "NO MAP / SCENE", 0xF800);
      drawText(8, 64, "Crée une scène d'abord", 0x07FF);
      return;
    }

    const tile = sim.map.tileSize;
    const startX = Math.floor(sim.camera.x / tile);
    const startY = Math.floor(sim.camera.y / tile);
    const endX = Math.min(sim.map.width, startX + Math.ceil(SCREEN_W / tile) + 2);
    const endY = Math.min(sim.map.height, startY + Math.ceil(SCREEN_H / tile) + 2);

    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const idx = ty * sim.map.width + tx;
        const px = tx * tile - sim.camera.x;
        const py = ty * tile - sim.camera.y;
        const f = sim.map.layers.floor[idx] | 0;
        const d = sim.map.layers.decor[idx] | 0;
        // V1.5.3 — si tileset chargé, blit les vraies tuiles (index = valeur - 1)
        if (sim.tilesetReady && sim.tileset) {
          if (f) {
            if (!blitTileFromTileset(px, py, tile, f - 1)) {
              // fallback si l'index est hors range
              drawRect(px, py, tile, tile, TILE_PALETTE[f & 7]);
            }
          }
          if (d) {
            if (!blitTileFromTileset(px, py, tile, d - 1)) {
              drawRect(px, py, tile, tile, TILE_PALETTE[(d + 2) & 7]);
            }
          }
        } else {
          // Pas de tileset : couleurs solides palette
          if (f) drawRect(px, py, tile, tile, TILE_PALETTE[f & 7]);
          if (d) drawRect(px, py, tile, tile, TILE_PALETTE[(d + 2) & 7]);
        }
      }
    }

    // V1.5.5 — Dessine les objets placés dans la scène. Pour chaque instance :
    // - si sprite en cache → blit pixel-perfect avec transparence magenta
    // - sinon → rect coloré selon type (fallback identique au scene editor)
    if (sim.scene && Array.isArray(sim.scene.objects) && typeof objects !== "undefined") {
      for (const inst of sim.scene.objects) {
        if (inst.enabled === false) continue;
        const ox = (inst.x | 0) - sim.camera.x;
        const oy = (inst.y | 0) - sim.camera.y;
        // Cull off-screen
        if (ox <= -64 || ox >= SCREEN_W || oy <= -64 || oy >= SCREEN_H) continue;

        const objDef = objects.find(o => o.id === inst.objectId);
        let drawn = false;
        if (objDef && objDef.spriteFrameId != null) {
          const sp = sim.objectSpriteCache && sim.objectSpriteCache.get(objDef.spriteFrameId);
          if (sp) {
            blitSprite(ox, oy, sp.w, sp.h, sp.pixels);
            drawn = true;
          }
        }
        if (!drawn) {
          // fallback rect typé (cyan = générique, jaune = player, rouge = enemy…)
          const w = inst.w || 14, h = inst.h || 14;
          let color = 0x07FF; // cyan
          if (objDef) {
            if      (objDef.type === "PLAYER")     color = 0xFFE0; // jaune
            else if (objDef.type === "ENEMY")      color = 0xF800; // rouge
            else if (objDef.type === "NPC")        color = 0x07E0; // vert
            else if (objDef.type === "ITEM")       color = 0x5BFF; // bleu clair
            else if (objDef.type === "PROJECTILE") color = 0xFD20; // orange
            else if (objDef.type === "DECOR")      color = 0xAAFF; // violet
          }
          drawRect(ox, oy, w, h, color);
        }
      }
    }

    // Player : sprite RGB565 si chargé, sinon rect jaune
    const psx = sim.player.x - sim.camera.x;
    const psy = sim.player.y - sim.camera.y;
    if (sim.sprite) {
      blitSprite(psx, psy, sim.sprite.w, sim.sprite.h, sim.sprite.pixels);
    } else {
      drawRect(psx, psy, 12, 12, 0xFFE0);
    }

    // UI bar
    drawRect(0, 0, 160, 12, 0x18FF);
    drawText(4, 3, "LUMA ENGINE 1.3", 0xFFFF);

    if (sim.dialogue) {
      drawRect(4, 82, 152, 42, 0x0000);
      drawRect(6, 84, 148, 38, 0x18FF);
      drawText(12, 92, sim.dialogue, 0xFFFF);
    }
  }

  // ---------------------------------------------------------------------------
  // FRAMEBUFFER PRIMITIVES — opèrent sur sim.fb (Uint16Array 160*128)
  // ---------------------------------------------------------------------------
  function fillFramebuffer(color) {
    sim.fb.fill(color);
  }

  function drawRect(x, y, w, h, color) {
    x = x | 0; y = y | 0; w = w | 0; h = h | 0;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > SCREEN_W) w = SCREEN_W - x;
    if (y + h > SCREEN_H) h = SCREEN_H - y;
    if (w <= 0 || h <= 0) return;
    for (let row = 0; row < h; row++) {
      const off = (y + row) * SCREEN_W + x;
      for (let i = 0; i < w; i++) sim.fb[off + i] = color;
    }
  }

  // Police 4×6 simplifiée (5 colonnes de 7 pixels) — imite le placeholder C
  function drawText(x, y, text, color) {
    let cx = x;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 10) { cx = x; y += 8; continue; }
      drawChar(cx, y, ch, color);
      cx += 6;
    }
  }

  // Mini-font 4×6 minimaliste (chaque charset = bitmap 4 bits × 6 lignes)
  const FONT_4x6 = (() => {
    // Encodé en hexa : 6 lignes de 4 bits = 24 bits = 6 hex chars
    // (cuisinier mini, on a juste alphabet + chiffres + qq symboles)
    const f = {};
    // L'idée : 1 = pixel allumé. Format : 6 nibbles, du haut vers le bas
    f["A"] = [0x6,0x9,0xF,0x9,0x9,0x9];
    f["B"] = [0xE,0x9,0xE,0x9,0x9,0xE];
    f["C"] = [0x6,0x9,0x8,0x8,0x9,0x6];
    f["D"] = [0xE,0x9,0x9,0x9,0x9,0xE];
    f["E"] = [0xF,0x8,0xE,0x8,0x8,0xF];
    f["F"] = [0xF,0x8,0xE,0x8,0x8,0x8];
    f["G"] = [0x6,0x9,0x8,0xB,0x9,0x6];
    f["H"] = [0x9,0x9,0xF,0x9,0x9,0x9];
    f["I"] = [0xE,0x4,0x4,0x4,0x4,0xE];
    f["J"] = [0x1,0x1,0x1,0x1,0x9,0x6];
    f["K"] = [0x9,0xA,0xC,0xA,0x9,0x9];
    f["L"] = [0x8,0x8,0x8,0x8,0x8,0xF];
    f["M"] = [0x9,0xF,0xF,0x9,0x9,0x9];
    f["N"] = [0x9,0xD,0xB,0x9,0x9,0x9];
    f["O"] = [0x6,0x9,0x9,0x9,0x9,0x6];
    f["P"] = [0xE,0x9,0xE,0x8,0x8,0x8];
    f["Q"] = [0x6,0x9,0x9,0xB,0xA,0x5];
    f["R"] = [0xE,0x9,0xE,0xA,0x9,0x9];
    f["S"] = [0x7,0x8,0x6,0x1,0x9,0x6];
    f["T"] = [0xE,0x4,0x4,0x4,0x4,0x4];
    f["U"] = [0x9,0x9,0x9,0x9,0x9,0x6];
    f["V"] = [0x9,0x9,0x9,0x9,0x6,0x6];
    f["W"] = [0x9,0x9,0x9,0xF,0xF,0x9];
    f["X"] = [0x9,0x9,0x6,0x6,0x9,0x9];
    f["Y"] = [0x9,0x9,0x6,0x4,0x4,0x4];
    f["Z"] = [0xF,0x1,0x2,0x4,0x8,0xF];
    f["0"] = [0x6,0x9,0xB,0xD,0x9,0x6];
    f["1"] = [0x2,0x6,0x2,0x2,0x2,0x7];
    f["2"] = [0x6,0x9,0x1,0x2,0x4,0xF];
    f["3"] = [0xE,0x1,0x6,0x1,0x1,0xE];
    f["4"] = [0x2,0x6,0xA,0xF,0x2,0x2];
    f["5"] = [0xF,0x8,0xE,0x1,0x9,0x6];
    f["6"] = [0x6,0x8,0xE,0x9,0x9,0x6];
    f["7"] = [0xF,0x1,0x2,0x2,0x4,0x4];
    f["8"] = [0x6,0x9,0x6,0x9,0x9,0x6];
    f["9"] = [0x6,0x9,0x9,0x7,0x1,0x6];
    f[" "] = [0,0,0,0,0,0];
    f["."] = [0,0,0,0,0,0x4];
    f[","] = [0,0,0,0,0x4,0x8];
    f[":"] = [0,0x4,0,0,0x4,0];
    f["-"] = [0,0,0,0xF,0,0];
    f["/"] = [0x1,0x1,0x2,0x4,0x8,0x8];
    f["("] = [0x2,0x4,0x4,0x4,0x4,0x2];
    f[")"] = [0x4,0x2,0x2,0x2,0x2,0x4];
    f["!"] = [0x4,0x4,0x4,0x4,0,0x4];
    f["?"] = [0x6,0x9,0x1,0x2,0,0x2];
    f["'"] = [0x4,0x4,0,0,0,0];
    f["#"] = [0xA,0xF,0xA,0xA,0xF,0xA];
    return f;
  })();

  function drawChar(x, y, code, color) {
    const ch = String.fromCharCode(code).toUpperCase();
    const glyph = FONT_4x6[ch];
    if (!glyph) {
      // unknown char = small box
      drawRect(x, y + 2, 3, 3, color);
      return;
    }
    for (let row = 0; row < 6; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 4; col++) {
        if (bits & (1 << (3 - col))) {
          const px = x + col, py = y + row;
          if (px >= 0 && px < SCREEN_W && py >= 0 && py < SCREEN_H) {
            sim.fb[py * SCREEN_W + px] = color;
          }
        }
      }
    }
  }

  function blitSprite(x, y, w, h, pixels) {
    for (let row = 0; row < h; row++) {
      const py = y + row;
      if (py < 0 || py >= SCREEN_H) continue;
      for (let col = 0; col < w; col++) {
        const px = x + col;
        if (px < 0 || px >= SCREEN_W) continue;
        const c = pixels[row * w + col];
        if (c === TRANSPARENT) continue;
        sim.fb[py * SCREEN_W + px] = c;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // FLUSH FRAMEBUFFER → CANVAS (avec scaling × SCALE)
  // ---------------------------------------------------------------------------
  function flush() {
    // Convertit RGB565 LE → RGBA32 dans l'imgData base 160×128, puis on
    // ré-affiche via drawImage scale en désactivant le smoothing.
    const data = sim.imgData.data;
    for (let i = 0; i < sim.fb.length; i++) {
      const c = sim.fb[i];
      const r5 = (c >> 11) & 0x1F;
      const g6 = (c >> 5) & 0x3F;
      const b5 = c & 0x1F;
      data[i * 4] = (r5 << 3) | (r5 >> 2);
      data[i * 4 + 1] = (g6 << 2) | (g6 >> 4);
      data[i * 4 + 2] = (b5 << 3) | (b5 >> 2);
      data[i * 4 + 3] = 255;
    }
    // On dessine d'abord sur un canvas tampon natif 160×128, puis on scale.
    const tmp = sim._tmpCanvas;
    tmp.getContext("2d").putImageData(sim.imgData, 0, 0);
    sim.ctx.imageSmoothingEnabled = false;
    sim.ctx.clearRect(0, 0, sim.canvas.width, sim.canvas.height);
    sim.ctx.drawImage(tmp, 0, 0, SCREEN_W * SCALE, SCREEN_H * SCALE);
    // Effet "LCD" : léger overlay de lignes horizontales pour suggérer
    // la matrice ST7735. Très discret pour ne pas gêner la lecture.
    sim.ctx.save();
    sim.ctx.globalAlpha = 0.08;
    sim.ctx.fillStyle = "#000";
    for (let y = 0; y < SCREEN_H * SCALE; y += SCALE) {
      sim.ctx.fillRect(0, y + SCALE - 1, SCREEN_W * SCALE, 1);
    }
    sim.ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // AUDIO — Web Audio square waves (forme d'onde piézo passif)
  // ---------------------------------------------------------------------------
  function playBeep(channel, freq, durMs) {
    if (!sim.audioCtx) return;
    stopVoice(channel);
    const osc = sim.audioCtx.createOscillator();
    const gain = sim.audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(sim.audioCtx.destination);
    osc.start();
    osc.stop(sim.audioCtx.currentTime + durMs / 1000);
    sim.voices[channel] = osc;
  }

  function stopVoice(channel) {
    if (sim.voices[channel]) {
      try { sim.voices[channel].stop(); } catch (_) {}
      sim.voices[channel] = null;
    }
  }

  function stopAllVoices() {
    stopVoice("A"); stopVoice("B");
  }

  // Joue la musique du projet en suivant music.grid + tempo + loop A/B
  function updateMusic() {
    if (typeof music === "undefined" || !music.grid) return;
    const beatMs = 60000 / music.tempo / 4;
    const elapsed = performance.now() - sim.musicStart;
    const step = Math.floor(elapsed / beatMs);

    const stepA = music.loopA ? step % music.steps : step;
    const stepB = music.loopB ? step % music.steps : step;

    if (stepA !== sim.lastStepA && stepA < (music.loopA ? music.steps : music.steps)) {
      const cell = music.grid.A[stepA];
      if (cell) playBeep("A", noteFreq(cell.note, cell.octave), beatMs * 0.9);
      else stopVoice("A");
      sim.lastStepA = stepA;
    }
    if (stepB !== sim.lastStepB && stepB < (music.loopB ? music.steps : music.steps)) {
      const cell = music.grid.B[stepB];
      if (cell) playBeep("B", noteFreq(cell.note, cell.octave), beatMs * 0.9);
      else stopVoice("B");
      sim.lastStepB = stepB;
    }
  }

  // ---------------------------------------------------------------------------
  // INPUT
  // ---------------------------------------------------------------------------
  function onKeyDown(e) {
    if (!sim.open) return;
    const wasDown = sim.keys[e.key];
    sim.keys[e.key] = true;
    if (e.key === "Escape") close();
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    // V1.5.7 — Déclenche les events on_input_press (seulement au premier press, pas auto-repeat)
    const btn = keyToButton(e.key);
    if (btn) {
      // V1.5.9 — maintenir le set des boutons tenus
      if (!sim.heldButtons) sim.heldButtons = new Set();
      sim.heldButtons.add(btn);
      if (!wasDown && window.LumaEventSheet) {
        window.LumaEventSheet.runTriggersOfType("on_input_press", sim, (p) => p.button === btn);
      }
    }
  }

  // Mapping clavier → bouton console Luma
  function keyToButton(key) {
    if (key === "ArrowUp")    return "UP";
    if (key === "ArrowDown")  return "DOWN";
    if (key === "ArrowLeft")  return "LEFT";
    if (key === "ArrowRight") return "RIGHT";
    if (key === "z" || key === "Z" || key === "w") return "A";
    if (key === "x" || key === "X") return "B";
    if (key === "Enter") return "START";
    return null;
  }

  function onKeyUp(e) {
    if (!sim.open) return;
    sim.keys[e.key] = false;
    const btn = keyToButton(e.key);
    if (btn && sim.heldButtons) sim.heldButtons.delete(btn);
  }

  // ---------------------------------------------------------------------------
  // BUILD OVERLAY
  // ---------------------------------------------------------------------------
  function buildOverlay() {
    sim.overlay = document.createElement("div");
    sim.overlay.id = "simulatorOverlay";
    sim.overlay.innerHTML = `
      <div class="sim-bar">
        <span class="sim-brand">▶ LUMA CONSOLE — Simulation HW</span>
        <span id="simStats" class="sim-stats">— FPS</span>
        <span class="sim-hint">⬅⬇⬆➡ : déplacer · Z : action A · X : action B · ESC : quitter</span>
        <button id="simCloseBtn" class="sim-close">FERMER</button>
      </div>
      <div class="sim-body">
        <div class="sim-bezel">
          <canvas id="simCanvas" width="${SCREEN_W * SCALE}" height="${SCREEN_H * SCALE}"></canvas>
        </div>
        <div class="sim-pad">
          <div class="sim-pad-row">
            <div class="sim-dpad">
              <button class="sim-btn sim-up" data-k="ArrowUp">▲</button>
              <button class="sim-btn sim-left" data-k="ArrowLeft">◀</button>
              <button class="sim-btn sim-right" data-k="ArrowRight">▶</button>
              <button class="sim-btn sim-down" data-k="ArrowDown">▼</button>
            </div>
            <div class="sim-actions">
              <button class="sim-btn sim-b" data-k="x">B</button>
              <button class="sim-btn sim-a" data-k="z">A</button>
            </div>
          </div>
          <div class="sim-meta">
            <p>ST7735 · 160×128 · RGB565 (×${SCALE} scale)</p>
            <p>2× piezo buzzers · Web Audio square wave</p>
            <p>30 FPS · ESP32 WROOM logic mirror</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(sim.overlay);

    sim.canvas = $$("simCanvas");
    sim.ctx = sim.canvas.getContext("2d");
    sim.statsEl = $$("simStats");

    // Canvas tampon natif pour le scaling
    sim._tmpCanvas = document.createElement("canvas");
    sim._tmpCanvas.width = SCREEN_W;
    sim._tmpCanvas.height = SCREEN_H;
    sim.imgData = sim._tmpCanvas.getContext("2d").createImageData(SCREEN_W, SCREEN_H);
    sim.fb = new Uint16Array(SCREEN_W * SCREEN_H);

    $$("simCloseBtn").onclick = close;

    // Pad buttons (touch/click)
    sim.overlay.querySelectorAll(".sim-btn").forEach(b => {
      const k = b.dataset.k;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        sim.keys[k] = true;
        // V1.5.9 — propage au système d'events (input_press + heldButtons)
        const btn = keyToButton(k);
        if (btn) {
          if (!sim.heldButtons) sim.heldButtons = new Set();
          sim.heldButtons.add(btn);
          if (window.LumaEventSheet) {
            window.LumaEventSheet.runTriggersOfType("on_input_press", sim, (p) => p.button === btn);
          }
        }
      });
      b.addEventListener("pointerup", () => {
        sim.keys[k] = false;
        const btn = keyToButton(k);
        if (btn && sim.heldButtons) sim.heldButtons.delete(btn);
      });
      b.addEventListener("pointerleave", () => {
        sim.keys[k] = false;
        const btn = keyToButton(k);
        if (btn && sim.heldButtons) sim.heldButtons.delete(btn);
      });
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC
  // ---------------------------------------------------------------------------
  window.LumaSimulator = { open, close };

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnSimulate");
    if (btn) btn.addEventListener("click", () => window.LumaSimulator.open());
  });
})();
