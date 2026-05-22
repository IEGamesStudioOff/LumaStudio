// =============================================================================
// LUMA STUDIO — OBJECT EDITOR (V1.4) — Constructeur visuel
// =============================================================================
// Refonte complète : 3 colonnes (liste objets / formulaire / preview live).
// Plus d'IDs manuels — tout en dropdowns dynamiquement remplis depuis
// frames, animations, behaviors. Preview affiche le sprite animé en temps réel.
// =============================================================================

(function () {
  "use strict";

  const TRANSPARENT = 0xF81F;

  // V1.5.1 — Tags prédéfinis (chips toggleables au lieu d'input libre)
  const PREDEFINED_TAGS = [
    "player", "enemy", "boss", "npc",
    "solid", "collectible", "harmful", "destructible",
    "movable", "interactive", "trigger", "checkpoint",
    "door", "key", "switch", "spawn",
    "decoration", "background", "foreground", "ui"
  ];

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const state = {
    selectedId: null,
    previewFrameIdx: 0,
    previewLastTime: 0,
    rafId: 0,
    eventsExpanded: false
  };

  let panel, listEl, formEl, previewEl, eventsEl;

  function $$(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------------------
  // OBJECT MODEL
  //   { id, name, type, behavior, tags[], spriteFrameId, animationId, solid, hp, speed, properties }
  // Compat V1.3 : `behavior` (string), `tags` (string[]), `type` (string)
  // ---------------------------------------------------------------------------
  function ensureObjectShape(o) {
    if (!Array.isArray(o.tags)) o.tags = (o.tags ? String(o.tags).split(",").map(t => t.trim()).filter(Boolean) : []);
    if (typeof o.spriteFrameId === "undefined") o.spriteFrameId = null;
    if (typeof o.animationId === "undefined") o.animationId = null;
    if (typeof o.solid === "undefined") o.solid = (o.type === "PLAYER" || o.type === "ENEMY");
    if (typeof o.hp === "undefined") o.hp = (o.type === "PLAYER" ? 3 : o.type === "ENEMY" ? 1 : 0);
    if (typeof o.speed === "undefined") o.speed = 2;
    if (typeof o.properties === "undefined") o.properties = {};
  }

  function getSelected() {
    if (state.selectedId == null) return null;
    return objects.find(o => o.id === state.selectedId);
  }

  function findFrameById(id) {
    if (id == null) return null;
    return frames.find(f => f.id === id);
  }

  function findAnimationById(id) {
    if (id == null) return null;
    return window.animations ? window.animations.find(a => a.id === id) : null;
  }

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------
  function validateObject(o) {
    const issues = [];
    if (!o.name || !o.name.trim()) issues.push({ level: "error", msg: "Nom manquant" });
    if (!o.type) issues.push({ level: "error", msg: "Type manquant" });

    const hasSprite = o.spriteFrameId != null && findFrameById(o.spriteFrameId);
    const hasAnim = o.animationId != null && findAnimationById(o.animationId);
    if (!hasSprite && !hasAnim) {
      issues.push({ level: "warn", msg: "Aucun sprite ni animation associé" });
    }
    if (o.spriteFrameId != null && !hasSprite) {
      issues.push({ level: "error", msg: "Sprite introuvable (frame supprimée ?)" });
    }
    if (o.animationId != null && !hasAnim) {
      issues.push({ level: "error", msg: "Animation introuvable (supprimée ?)" });
    }
    if (o.behavior && o.behavior !== "None") {
      const known = OBJECT_BEHAVIORS.find(b => b.id === o.behavior);
      if (!known) issues.push({ level: "warn", msg: "Behavior inconnu" });
    }
    return issues;
  }

  function estimateObjectBytes(o) {
    // Approx : 12 octets header + tags(8 par tag) + propriétés
    return 12 + (o.tags ? o.tags.length * 8 : 0) + (o.name ? o.name.length : 0);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------
  function addObject() {
    const o = {
      id: nextObjectId++,
      name: "object_" + nextObjectId,
      type: "DECOR",
      behavior: "None",
      tags: [],
      spriteFrameId: frames.length > 0 ? frames[0].id : null,
      animationId: null,
      solid: false,
      hp: 0,
      speed: 2,
      properties: {},
      _justCreated: true  // V1.5.7+ : pour le flash dans la library
    };
    objects.push(o);
    state.selectedId = o.id;
    refresh();
  }

  function duplicateObject(o) {
    const copy = JSON.parse(JSON.stringify(o));
    copy.id = nextObjectId++;
    copy.name = o.name + "_copy";
    objects.push(copy);
    state.selectedId = copy.id;
    refresh();
  }

  function deleteObject(o) {
    if (!confirm("Supprimer l'objet « " + o.name + " » ?")) return;
    const idx = objects.indexOf(o);
    if (idx >= 0) objects.splice(idx, 1);
    if (state.selectedId === o.id) {
      state.selectedId = objects.length > 0 ? objects[0].id : null;
    }
    refresh();
  }

  function renameObject(o, name) {
    o.name = name.trim() || ("object_" + o.id);
    refresh();
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function buildPanel() {
    panel = $$("logicPanel");
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = "1";
    panel.innerHTML = `
      <div class="help-box">
        <strong>Object Editor V1.4 :</strong> constructeur visuel d'objets. Sélectionne un sprite,
        une animation, un comportement — tout est en dropdowns, plus besoin de retenir des IDs.
      </div>
      <div class="oe-layout">
        <aside class="oe-list-col">
          <div class="oe-list-head">
            <h2>📦 Objets du jeu</h2>
            <button class="primary oe-btn-add" id="oeAdd">+ AJOUTER</button>
          </div>
          <div class="oe-list" id="oeList"></div>
          <h2 style="margin-top:16px">⚡ Events</h2>
          <button class="oe-events-toggle" id="oeEventsToggle">Afficher events ▼</button>
          <div class="oe-events" id="oeEvents" style="display:none"></div>
        </aside>
        <main class="oe-form-col" id="oeForm">
          <p class="oe-empty">Sélectionne ou crée un objet à gauche pour commencer.</p>
        </main>
        <aside class="oe-preview-col" id="oePreview">
          <p class="oe-empty">—</p>
        </aside>
      </div>
    `;
    listEl = $$("oeList");
    formEl = $$("oeForm");
    previewEl = $$("oePreview");
    eventsEl = $$("oeEvents");
    $$("oeAdd").onclick = addObject;
    $$("oeEventsToggle").onclick = () => {
      state.eventsExpanded = !state.eventsExpanded;
      eventsEl.style.display = state.eventsExpanded ? "block" : "none";
      $$("oeEventsToggle").textContent = state.eventsExpanded ? "Masquer events ▲" : "Afficher events ▼";
      renderEventsBlock();
    };

    refresh();
    startPreviewLoop();
  }

  function refresh() {
    if (!panel) return;
    objects.forEach(ensureObjectShape);
    if (state.selectedId == null && objects.length > 0) state.selectedId = objects[0].id;
    renderList();
    renderForm();
    renderPreview();
    if (state.eventsExpanded) renderEventsBlock();
    // V1.5.7+ — Resync solide via requestFullRefresh (rafraîchit library + capacity + scene)
    if (typeof window.requestFullRefresh === "function") {
      window.requestFullRefresh();
    } else {
      if (typeof refreshObjectPicker === "function") refreshObjectPicker();
      if (typeof populateLibrary === "function") populateLibrary();
      if (typeof updateCapacityBar === "function") updateCapacityBar();
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    if (objects.length === 0) {
      listEl.innerHTML = `<p class="oe-empty">Aucun objet. Clique sur AJOUTER pour commencer.</p>`;
      return;
    }
    for (const o of objects) {
      const issues = validateObject(o);
      const errorCount = issues.filter(i => i.level === "error").length;
      const warnCount = issues.filter(i => i.level === "warn").length;
      const status = errorCount > 0 ? "✖" : warnCount > 0 ? "⚠" : "✓";
      const statusCls = errorCount > 0 ? "err" : warnCount > 0 ? "warn" : "ok";
      const typeInfo = OBJECT_TYPES.find(t => t.id === o.type) || { label: o.type, color: "#888" };

      const card = document.createElement("div");
      card.className = "oe-card" + (o.id === state.selectedId ? " selected" : "");
      card.draggable = true;
      card.innerHTML = `
        <div class="oe-card-thumb" style="background:${typeInfo.color}22">
          <canvas width="24" height="24"></canvas>
        </div>
        <div class="oe-card-body">
          <strong>${o.name}</strong>
          <span class="oe-card-type" style="color:${typeInfo.color}">${typeInfo.label}</span>
          <span class="oe-card-id">ID ${String(o.id).padStart(2, "0")}</span>
        </div>
        <span class="oe-status oe-status-${statusCls}" title="${issues.map(i => i.msg).join(", ") || "Objet valide"}">${status}</span>
        <button class="oe-card-del" title="Supprimer cet objet">×</button>
      `;
      card.onclick = () => { state.selectedId = o.id; refresh(); };
      card.ondragstart = (e) => {
        e.dataTransfer.setData("application/x-luma-object", String(o.id));
        e.dataTransfer.effectAllowed = "copy";
      };
      // V1.5.2 — Accept drop d'un sprite depuis la library pour assigner spriteFrameId
      card.ondragover = (e) => {
        if (e.dataTransfer.types.includes("application/x-luma-frame")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          card.classList.add("oe-card-droptarget");
        }
      };
      card.ondragleave = () => card.classList.remove("oe-card-droptarget");
      card.ondrop = (e) => {
        card.classList.remove("oe-card-droptarget");
        const frameId = e.dataTransfer.getData("application/x-luma-frame");
        if (!frameId) return;
        e.preventDefault();
        const num = Number(frameId);
        o.spriteFrameId = isNaN(num) ? frameId : num;
        state.selectedId = o.id;
        refresh();
      };
      // Bouton suppression directe sur la card (sans passer par le formulaire)
      const delBtn = card.querySelector(".oe-card-del");
      delBtn.onclick = (ev) => {
        ev.stopPropagation();
        deleteObject(o);
      };
      drawCardThumb(card.querySelector("canvas"), o);
      listEl.appendChild(card);
    }
  }

  function drawCardThumb(cv, o) {
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const f = findFrameById(o.spriteFrameId);
    if (f && f.pixelsB64 && window.LumaSpriteEditor) {
      try {
        const px = window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h);
        const img = ctx.createImageData(f.w, f.h);
        for (let i = 0; i < px.length; i++) {
          const c = px[i];
          if (c === TRANSPARENT) { img.data[i * 4 + 3] = 0; continue; }
          const r5 = (c >> 11) & 0x1F, g6 = (c >> 5) & 0x3F, b5 = c & 0x1F;
          img.data[i * 4]     = (r5 << 3) | (r5 >> 2);
          img.data[i * 4 + 1] = (g6 << 2) | (g6 >> 4);
          img.data[i * 4 + 2] = (b5 << 3) | (b5 >> 2);
          img.data[i * 4 + 3] = 255;
        }
        // dessin sur canvas tampon puis scale
        const tmp = document.createElement("canvas");
        tmp.width = f.w; tmp.height = f.h;
        tmp.getContext("2d").putImageData(img, 0, 0);
        ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
      } catch (e) {}
    }
  }

  function renderForm() {
    const o = getSelected();
    if (!o) {
      formEl.innerHTML = `<p class="oe-empty">Sélectionne ou crée un objet à gauche pour commencer.</p>`;
      return;
    }

    const typeOptions = OBJECT_TYPES.map(t =>
      `<option value="${t.id}" ${o.type === t.id ? "selected" : ""}>${t.label}</option>`).join("");
    const behOptions = OBJECT_BEHAVIORS.map(b =>
      `<option value="${b.id}" ${o.behavior === b.id ? "selected" : ""}>${b.label}</option>`).join("");
    const frameOptions = `<option value="">(aucun)</option>` + frames.map(f =>
      `<option value="${f.id}" ${o.spriteFrameId === f.id ? "selected" : ""}>${f.name} (${f.w}×${f.h})</option>`).join("");
    const anims = window.animations || [];
    const animOptions = `<option value="">(aucune)</option>` + anims.map(a =>
      `<option value="${a.id}" ${o.animationId === a.id ? "selected" : ""}>${a.name || a.id} (${(a.slots || []).length} frames)</option>`).join("");

    formEl.innerHTML = `
      <div class="oe-form-head">
        <h2>🎯 ${o.name}</h2>
        <div class="oe-form-actions">
          <button class="oe-btn-secondary" id="oeDuplicate">⎘ Dupliquer</button>
          <button class="oe-btn-danger" id="oeDelete">🗑 Supprimer</button>
        </div>
      </div>
      <div class="oe-form-grid">
        <label>Nom</label>
        <input type="text" id="oeName" value="${o.name}" />

        <label>ID (auto)</label>
        <input type="text" id="oeId" value="${String(o.id).padStart(2, "0")}" readonly class="oe-readonly" />

        <label>Type</label>
        <select id="oeType">${typeOptions}</select>

        <label>Behavior</label>
        <select id="oeBehavior">${behOptions}</select>

        <label>🎨 Sprite (frame)</label>
        <select id="oeSprite">${frameOptions}</select>

        <label>🎬 Animation</label>
        <select id="oeAnim">${animOptions}</select>

        <label>Tags <span class="oe-hint">(clique pour activer/désactiver)</span></label>
        <div id="oeTagsChips" class="oe-tags-chips">
          ${PREDEFINED_TAGS.map(t =>
            `<span class="oe-tag-chip${o.tags.includes(t) ? " active" : ""}" data-tag="${t}">${t}</span>`
          ).join("")}
        </div>

        <label>Solide (collision)</label>
        <div><label class="oe-switch"><input type="checkbox" id="oeSolid" ${o.solid ? "checked" : ""}/> <span>Collision activée</span></label></div>

        <label>HP <span class="oe-hint">(0 = immortel)</span></label>
        <input type="number" id="oeHp" value="${o.hp}" min="0" max="999" />

        <label>Vitesse <span class="oe-hint">(pixels/tick)</span></label>
        <input type="number" id="oeSpeed" value="${o.speed}" min="0" max="16" step="1" />
      </div>
    `;

    $$("oeName").oninput = (e) => renameObject(o, e.target.value);
    $$("oeType").onchange = (e) => { o.type = e.target.value; refresh(); };
    $$("oeBehavior").onchange = (e) => { o.behavior = e.target.value; refresh(); };
    $$("oeSprite").onchange = (e) => {
      const v = e.target.value;
      o.spriteFrameId = v ? (isNaN(Number(v)) ? v : Number(v)) : null;
      if (v && !isNaN(Number(v))) o.spriteFrameId = Number(v);
      else if (v) o.spriteFrameId = v;
      refresh();
    };
    $$("oeAnim").onchange = (e) => { o.animationId = e.target.value || null; refresh(); };
    // V1.5.1 — tags chips
    $$("oeTagsChips").querySelectorAll(".oe-tag-chip").forEach(chip => {
      chip.onclick = () => {
        const tag = chip.dataset.tag;
        const idx = o.tags.indexOf(tag);
        if (idx >= 0) o.tags.splice(idx, 1);
        else o.tags.push(tag);
        chip.classList.toggle("active");
        renderPreview();
      };
    });
    $$("oeSolid").onchange = (e) => { o.solid = e.target.checked; renderPreview(); };
    $$("oeHp").oninput = (e) => { o.hp = Math.max(0, Number(e.target.value) || 0); renderPreview(); };
    $$("oeSpeed").oninput = (e) => { o.speed = Math.max(0, Number(e.target.value) || 0); renderPreview(); };
    $$("oeDuplicate").onclick = () => duplicateObject(o);
    $$("oeDelete").onclick = () => deleteObject(o);
  }

  function renderPreview() {
    const o = getSelected();
    if (!o) {
      previewEl.innerHTML = `<p class="oe-empty">—</p>`;
      return;
    }
    const issues = validateObject(o);
    const errorCount = issues.filter(i => i.level === "error").length;
    const warnCount = issues.filter(i => i.level === "warn").length;
    const valid = errorCount === 0 && warnCount === 0;
    const status = errorCount > 0 ? "✖ INVALIDE" : warnCount > 0 ? "⚠ ATTENTION" : "✓ VALIDE";
    const statusCls = errorCount > 0 ? "err" : warnCount > 0 ? "warn" : "ok";
    const typeInfo = OBJECT_TYPES.find(t => t.id === o.type) || { label: o.type, color: "#888" };
    const behInfo = OBJECT_BEHAVIORS.find(b => b.id === o.behavior) || { label: o.behavior };
    const f = findFrameById(o.spriteFrameId);
    const a = findAnimationById(o.animationId);

    previewEl.innerHTML = `
      <h2>👁 PREVIEW</h2>
      <div class="oe-preview-canvas-wrap">
        <canvas id="oePreviewCanvas" width="160" height="160"></canvas>
      </div>
      <div class="oe-status-banner oe-status-${statusCls}">${status}</div>
      ${issues.length ? `<ul class="oe-issues">${issues.map(i =>
        `<li class="oe-issue-${i.level}">${i.level === "error" ? "✖" : "⚠"} ${i.msg}</li>`).join("")}</ul>` : ""}

      <h3>📋 Détails</h3>
      <table class="oe-details">
        <tr><th>ID</th><td>${String(o.id).padStart(2, "0")}</td></tr>
        <tr><th>Nom</th><td>${o.name}</td></tr>
        <tr><th>Type</th><td style="color:${typeInfo.color}">${typeInfo.label}</td></tr>
        <tr><th>Behavior</th><td>${behInfo.label}</td></tr>
        <tr><th>Sprite</th><td>${f ? `${f.name} (${f.w}×${f.h})` : "<em>aucun</em>"}</td></tr>
        <tr><th>Animation</th><td>${a ? `${a.name || a.id} (${(a.slots || []).length} frames)` : "<em>aucune</em>"}</td></tr>
        <tr><th>Solide</th><td>${o.solid ? "Oui" : "Non"}</td></tr>
        <tr><th>HP</th><td>${o.hp || "—"}</td></tr>
        <tr><th>Vitesse</th><td>${o.speed} px/tick</td></tr>
        <tr><th>Tags</th><td>${o.tags.length ? o.tags.map(t => `<span class="oe-tag">${t}</span>`).join(" ") : "<em>aucun</em>"}</td></tr>
        <tr><th>Mémoire</th><td>~${estimateObjectBytes(o)} o</td></tr>
      </table>
    `;
  }

  // Loop d'animation du preview
  function startPreviewLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.previewLastTime = performance.now();
    tickPreview();
  }

  function tickPreview() {
    const o = getSelected();
    const cv = $$("oePreviewCanvas");
    if (cv && o) drawPreview(cv, o);
    state.rafId = requestAnimationFrame(tickPreview);
  }

  function drawPreview(cv, o) {
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Checkerboard background
    for (let y = 0; y < cv.height; y += 16) {
      for (let x = 0; x < cv.width; x += 16) {
        ctx.fillStyle = ((x + y) / 16) % 2 === 0 ? "#0d1326" : "#1a1f33";
        ctx.fillRect(x, y, 16, 16);
      }
    }

    // Choisir frame source : animation > sprite
    let frame = null;
    const a = findAnimationById(o.animationId);
    if (a && a.slots && a.slots.length > 0) {
      const speed = a.speedMs || 120;
      const slotIdx = Math.floor((performance.now() / speed)) % a.slots.length;
      const slot = a.slots[slotIdx];
      frame = findFrameById(slot.frameId);
    }
    if (!frame) frame = findFrameById(o.spriteFrameId);

    if (frame && frame.pixelsB64 && window.LumaSpriteEditor) {
      try {
        const px = window.LumaSpriteEditor.base64ToPixels(frame.pixelsB64, frame.w * frame.h);
        // scale auto pour remplir 80% du canvas
        const targetSize = 128;
        const zoom = Math.max(1, Math.floor(targetSize / Math.max(frame.w, frame.h)));
        const off_x = Math.floor((cv.width - frame.w * zoom) / 2);
        const off_y = Math.floor((cv.height - frame.h * zoom) / 2);
        for (let y = 0; y < frame.h; y++) {
          for (let x = 0; x < frame.w; x++) {
            const c = px[y * frame.w + x];
            if (c === TRANSPARENT) continue;
            const r5 = (c >> 11) & 0x1F, g6 = (c >> 5) & 0x3F, b5 = c & 0x1F;
            ctx.fillStyle = `rgb(${(r5 << 3) | (r5 >> 2)},${(g6 << 2) | (g6 >> 4)},${(b5 << 3) | (b5 >> 2)})`;
            ctx.fillRect(off_x + x * zoom, off_y + y * zoom, zoom, zoom);
          }
        }
        // Hitbox si solide
        if (o.solid) {
          ctx.strokeStyle = "rgba(255, 94, 87, 0.6)";
          ctx.lineWidth = 1;
          ctx.strokeRect(off_x + 0.5, off_y + 0.5, frame.w * zoom - 1, frame.h * zoom - 1);
        }
      } catch (e) {}
    } else {
      // Placeholder texte
      ctx.fillStyle = "#ff5e57";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("(no sprite)", cv.width / 2, cv.height / 2);
    }
  }

  // ---------------------------------------------------------------------------
  // EVENTS BLOCK (compact)
  // ---------------------------------------------------------------------------
  function renderEventsBlock() {
    if (!eventsEl) return;
    eventsEl.innerHTML = `
      <div class="oe-events-form">
        <input id="oeEvName" placeholder="open_red_door" />
        <select id="oeEvCond">
          <option>On Start Scene</option><option>On Button Pressed</option><option>On Collision</option>
          <option>On Interact</option><option>On Variable Equals</option><option>On Timer</option>
          <option>On Dialogue Finished</option><option>On Enter Zone</option>
        </select>
        <select id="oeEvAction">
          <option>Start Dialogue</option><option>Change Scene</option><option>Give Item</option>
          <option>Set Variable</option><option>Spawn Object</option><option>Destroy Object</option>
          <option>Play Sound</option><option>Play Cutscene</option>
        </select>
        <input id="oeEvTarget" placeholder="target" />
        <button class="primary" id="oeEvAdd">+ AJOUTER EVENT</button>
      </div>
      <div class="oe-events-list" id="oeEvList"></div>
    `;
    $$("oeEvAdd").onclick = () => {
      events.push({
        id: nextEventId++,
        name: $$("oeEvName").value || ("event_" + nextEventId),
        condition: $$("oeEvCond").value,
        action: $$("oeEvAction").value,
        target: $$("oeEvTarget").value
      });
      $$("oeEvName").value = "";
      $$("oeEvTarget").value = "";
      renderEventsList();
    };
    renderEventsList();
  }

  function renderEventsList() {
    const list = $$("oeEvList");
    if (!list) return;
    list.innerHTML = "";
    for (const ev of events) {
      const div = document.createElement("div");
      div.className = "oe-event-row";
      div.innerHTML = `
        <strong>${ev.name}</strong>
        <span>IF ${ev.condition} → THEN ${ev.action} → ${ev.target || "—"}</span>
        <button class="oe-btn-danger oe-btn-small">×</button>
      `;
      div.querySelector("button").onclick = () => {
        const idx = events.indexOf(ev);
        if (idx >= 0) events.splice(idx, 1);
        renderEventsList();
      };
      list.appendChild(div);
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  window.LumaObjectEditor = {
    init: buildPanel,
    refresh: () => { if (panel) refresh(); },
    findFrameById: findFrameById,
    findAnimationById: findAnimationById,
    selectObject: (id) => { state.selectedId = id; if (panel) refresh(); },
    OBJECT_TYPES: typeof OBJECT_TYPES !== "undefined" ? OBJECT_TYPES : [],
    drawObjectThumb: (cv, o) => drawCardThumb(cv, o)
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      if (btn.dataset.panel === "logicPanel") {
        btn.addEventListener("click", () => setTimeout(buildPanel, 30));
      }
    });
  });
})();
