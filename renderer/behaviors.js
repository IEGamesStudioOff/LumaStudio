// =============================================================================
// LUMA STUDIO V1.6.0 — Behaviors runtime
// =============================================================================
// Exécute les behaviors d'objet (mouvement + interaction au contact) dans le
// simulator. Appelé chaque frame depuis simulator.update().
//
// API publique :
//   LumaBehaviors.updatePlayer(sim, dt)        — applique behavior du joueur
//   LumaBehaviors.updateInstances(sim, dt)     — applique behavior de chaque NPC
//   LumaBehaviors.handleContacts(sim)          — déclenche les behaviors-contact
//                                                 (Pickup, DamageOnTouch, Door, Dialogue)
//   LumaBehaviors.resetState()                 — vide l'état persistant
// =============================================================================

(function() {
  // État persistant par instance : {x0, y0, dir, oneShotDone, ...}
  const _instState = new WeakMap();

  function st(inst) {
    let s = _instState.get(inst);
    if (!s) { s = {}; _instState.set(inst, s); }
    return s;
  }

  function resetState() {
    // WeakMap se nettoie quand les instances sont GC, mais on peut forcer
    // un nouveau WeakMap pour reset propre lors d'un PLAY.
  }

  // Helper : récupère un property avec fallback default
  function prop(objDef, key, defv) {
    if (!objDef || !objDef.properties) return defv;
    const v = objDef.properties[key];
    return (v !== undefined && v !== null && v !== "") ? v : defv;
  }

  // Vérif tile bloquant à un pixel donné (collision tiles)
  function isBlocked(sim, px, py) {
    if (!sim.map) return false;
    const ts = sim.map.tileSize;
    const tx = Math.floor(px / ts), ty = Math.floor(py / ts);
    if (tx < 0 || ty < 0 || tx >= sim.map.width || ty >= sim.map.height) return true;
    const idx = ty * sim.map.width + tx;
    return sim.map.layers && sim.map.layers.collision
      && sim.map.layers.collision[idx] > 0;
  }

  // Helper : tente de se déplacer en X (séparé pour permettre sliding)
  function moveX(sim, entity, dx, w, h) {
    const nx = entity.x + dx;
    if (!isBlocked(sim, nx, entity.y)
     && !isBlocked(sim, nx + w - 1, entity.y)
     && !isBlocked(sim, nx, entity.y + h - 1)
     && !isBlocked(sim, nx + w - 1, entity.y + h - 1)) {
      entity.x = nx;
      return true;
    }
    return false;
  }
  function moveY(sim, entity, dy, w, h) {
    const ny = entity.y + dy;
    if (!isBlocked(sim, entity.x, ny)
     && !isBlocked(sim, entity.x + w - 1, ny)
     && !isBlocked(sim, entity.x, ny + h - 1)
     && !isBlocked(sim, entity.x + w - 1, ny + h - 1)) {
      entity.y = ny;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // PLAYER BEHAVIORS
  // ---------------------------------------------------------------------------
  function updatePlayer(sim, dt) {
    if (!sim || !sim.scene) return;
    // Cherche l'objet PLAYER dans la scène (premier objet de type PLAYER)
    const objs = window.objects || [];
    const playerDef = objs.find(o => o.type === "PLAYER");
    if (!playerDef) return; // pas de joueur défini → input clavier brut (legacy)

    const beh = playerDef.behavior || "TopDownMovement";
    sim.player.w = sim.player.w || 12;
    sim.player.h = sim.player.h || 14;

    if (beh === "PlatformerMovement") {
      updatePlatformer(sim, playerDef);
    } else if (beh === "TopDownMovement") {
      updateTopDown(sim, playerDef);
    }
    // (Autres player-behaviors potentiels : grid, eight-dir, tank, etc.)
  }

  function updateTopDown(sim, playerDef) {
    const speed = prop(playerDef, "speed", 2.0);
    const diag = prop(playerDef, "diagonal", false);
    let dx = 0, dy = 0;
    if (sim.keys.ArrowLeft || sim.keys.a || sim.keys.q) dx -= speed;
    if (sim.keys.ArrowRight || sim.keys.d) dx += speed;
    if (sim.keys.ArrowUp || sim.keys.w || sim.keys.z) dy -= speed;
    if (sim.keys.ArrowDown || sim.keys.s) dy += speed;
    if (!diag && dx !== 0 && dy !== 0) {
      // Empêche le mouvement diagonal — privilégie X si bouton X pressé en premier
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
    }
    if (dx !== 0) moveX(sim, sim.player, dx, sim.player.w, sim.player.h);
    if (dy !== 0) moveY(sim, sim.player, dy, sim.player.w, sim.player.h);
  }

  function updatePlatformer(sim, playerDef) {
    if (sim.player.vx === undefined) sim.player.vx = 0;
    if (sim.player.vy === undefined) sim.player.vy = 0;
    if (sim.player.grounded === undefined) sim.player.grounded = false;

    const gravity = prop(playerDef, "gravity", 0.4);
    const jumpForce = prop(playerDef, "jumpForce", 5.5);
    const maxSpeedX = prop(playerDef, "maxSpeedX", 2.0);
    const maxFall = prop(playerDef, "maxFallSpeed", 6.0);

    // Inputs horizontaux
    let dx = 0;
    if (sim.keys.ArrowLeft || sim.keys.a || sim.keys.q) dx = -maxSpeedX;
    if (sim.keys.ArrowRight || sim.keys.d) dx = maxSpeedX;
    sim.player.vx = dx;

    // Saut (A bouton ou Z)
    const jumpHeld = sim.keys.z || sim.keys.Z || sim.keys.w;
    if (jumpHeld && sim.player.grounded) {
      sim.player.vy = -jumpForce;
      sim.player.grounded = false;
    }

    // Gravité
    sim.player.vy += gravity;
    if (sim.player.vy > maxFall) sim.player.vy = maxFall;

    // Move X
    moveX(sim, sim.player, sim.player.vx, sim.player.w, sim.player.h);
    // Move Y avec détection sol
    const moved = moveY(sim, sim.player, sim.player.vy, sim.player.w, sim.player.h);
    if (!moved) {
      if (sim.player.vy > 0) sim.player.grounded = true;
      sim.player.vy = 0;
    } else {
      sim.player.grounded = false;
    }
  }

  // ---------------------------------------------------------------------------
  // INSTANCE BEHAVIORS (NPC, ennemis, items animés)
  // ---------------------------------------------------------------------------
  function updateInstances(sim, dt) {
    if (!sim || !sim.scene || !sim.scene.objects) return;
    const objs = window.objects || [];
    for (const inst of sim.scene.objects) {
      if (inst.enabled === false) continue;
      const def = objs.find(o => o.id === inst.objectId);
      if (!def || !def.behavior || def.behavior === "None") continue;
      updateOneInstance(sim, inst, def, dt);
    }
  }

  function updateOneInstance(sim, inst, def, dt) {
    const beh = def.behavior;
    const s = st(inst);
    const w = inst.w || 16, h = inst.h || 16;

    if (beh === "FollowPlayer") {
      const speed = prop(def, "speed", 1.0);
      const range = prop(def, "detectionRange", 80);
      const stop  = prop(def, "stopRange", 8);
      const ddx = sim.player.x - inst.x;
      const ddy = sim.player.y - inst.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < range && dist > stop) {
        const nx = (ddx / dist) * speed;
        const ny = (ddy / dist) * speed;
        moveX(sim, inst, nx, w, h);
        moveY(sim, inst, ny, w, h);
      }

    } else if (beh === "Patrol") {
      const speed = prop(def, "speed", 1.0);
      const dist = prop(def, "distance", 48);
      if (s.x0 === undefined) { s.x0 = inst.x; s.dir = 1; }
      const nx = speed * s.dir;
      const ok = moveX(sim, inst, nx, w, h);
      if (!ok || inst.x - s.x0 > dist || inst.x - s.x0 < -dist) {
        s.dir *= -1;
      }

    } else if (beh === "PatrolVertical") {
      const speed = prop(def, "speed", 1.0);
      const dist = prop(def, "distance", 48);
      if (s.y0 === undefined) { s.y0 = inst.y; s.dir = 1; }
      const ny = speed * s.dir;
      const ok = moveY(sim, inst, ny, w, h);
      if (!ok || inst.y - s.y0 > dist || inst.y - s.y0 < -dist) {
        s.dir *= -1;
      }

    } else if (beh === "Bounce") {
      if (s.vx === undefined) { s.vx = prop(def, "speedX", 1.5); s.vy = prop(def, "speedY", 1.5); }
      if (!moveX(sim, inst, s.vx, w, h)) s.vx *= -1;
      if (!moveY(sim, inst, s.vy, w, h)) s.vy *= -1;

    } else if (beh === "Spinner") {
      if (s.angle === undefined) s.angle = 0;
      s.angle = (s.angle + prop(def, "rotationSpeed", 4)) % 360;
      inst.spinAngle = s.angle; // optionnel : utilisé par le renderer pour pivoter le sprite
    }
    // Pickup, DialogueOnTouch, DamageOnTouch, Door → traités dans handleContacts
  }

  // ---------------------------------------------------------------------------
  // CONTACT BEHAVIORS (déclenchés au contact joueur-instance)
  // ---------------------------------------------------------------------------
  function handleContacts(sim) {
    if (!sim || !sim.scene || !sim.scene.objects) return;
    const objs = window.objects || [];
    const px = sim.player.x, py = sim.player.y;
    const pw = sim.player.w || 12, ph = sim.player.h || 14;
    const toRemove = [];

    for (const inst of sim.scene.objects) {
      if (inst.enabled === false) continue;
      const def = objs.find(o => o.id === inst.objectId);
      if (!def) continue;
      const iw = inst.w || 16, ih = inst.h || 16;
      const touches = px < inst.x + iw && px + pw > inst.x
                   && py < inst.y + ih && py + ph > inst.y;
      if (!touches) continue;

      const beh = def.behavior;
      const s = st(inst);

      if (beh === "Pickup") {
        const reward = Number(prop(def, "scoreReward", 10));
        const varName = prop(def, "scoreVariable", "score");
        if (window.LumaEventSheet) {
          const cur = Number(window.LumaEventSheet.runtime.variables[varName] || 0);
          window.LumaEventSheet.runtime.variables[varName] = cur + reward;
        }
        playBehaviorSound(sim, prop(def, "sound", "pickup"));
        toRemove.push(inst);

      } else if (beh === "DialogueOnTouch") {
        const oneShot = prop(def, "oneShot", true);
        if (oneShot && s.oneShotDone) continue;
        sim.dialogue = String(prop(def, "text", "..."));
        s.oneShotDone = true;
        setTimeout(() => { if (sim.dialogue === prop(def, "text", "...")) sim.dialogue = null; }, 2500);

      } else if (beh === "DamageOnTouch") {
        const dmg = Number(prop(def, "damage", 1));
        const knock = Number(prop(def, "knockback", 6));
        const hpVar = prop(def, "hpVariable", "hp");
        // Cooldown : 600ms entre 2 dégâts
        if (s.lastDmgT && performance.now() - s.lastDmgT < 600) continue;
        s.lastDmgT = performance.now();
        if (window.LumaEventSheet) {
          const cur = Number(window.LumaEventSheet.runtime.variables[hpVar] || 100);
          window.LumaEventSheet.runtime.variables[hpVar] = cur - dmg;
        }
        // Knockback : projette le joueur dans la direction opposée à l'instance
        const dxK = sim.player.x - inst.x;
        const dyK = sim.player.y - inst.y;
        const distK = Math.max(1, Math.sqrt(dxK * dxK + dyK * dyK));
        sim.player.x += (dxK / distK) * knock;
        sim.player.y += (dyK / distK) * knock;
        // Camera shake feedback
        sim._shake = { remaining: 200, intensity: 3 };
        playBehaviorSound(sim, "hit");

      } else if (beh === "Door") {
        const sid = prop(def, "sceneId", "");
        const requiresKey = prop(def, "requiresKey", "");
        if (requiresKey && window.LumaEventSheet) {
          const v = window.LumaEventSheet.runtime.variables[requiresKey];
          if (!v || v === "0" || v === 0 || v === false || v === "false") {
            // Pas la clé : dialogue d'indice
            if (!s.dialogShown) {
              sim.dialogue = `Verrouillé. Il faut « ${requiresKey} ».`;
              s.dialogShown = true;
              setTimeout(() => { sim.dialogue = null; s.dialogShown = false; }, 1500);
            }
            continue;
          }
        }
        if (sid && window.LumaEventSheet) {
          // Trigger un change_scene différé via le runtime events
          window.LumaEventSheet.runtime.pendingSceneSwitch = { sceneId: sid };
          // Pour le spawn dans nouvelle scène : on stocke dans sim
          sim._doorSpawn = {
            x: Number(prop(def, "spawnX", 80)),
            y: Number(prop(def, "spawnY", 64))
          };
          playBehaviorSound(sim, "door");
        }
      }
    }
    // Retire les pickups consommés
    if (toRemove.length) {
      sim.scene.objects = sim.scene.objects.filter(i => !toRemove.includes(i));
    }
  }

  function playBehaviorSound(sim, name) {
    if (!sim.audioCtx) return;
    const freqs = {
      beep_short: 880, beep_long: 440, jump: 660, shoot: 1320,
      hit: 220, pickup: 988, death: 110, door: 330, level_up: 1760
    };
    const f = freqs[name] || 440;
    const dur = name === "beep_long" ? 0.18 : 0.06;
    const osc = sim.audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const g = sim.audioCtx.createGain();
    g.gain.value = 0.10;
    osc.connect(g); g.connect(sim.audioCtx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, sim.audioCtx.currentTime + dur);
    osc.stop(sim.audioCtx.currentTime + dur + 0.02);
  }

  // Expose
  window.LumaBehaviors = {
    updatePlayer,
    updateInstances,
    handleContacts,
    resetState
  };
})();
