// =============================================================================
// LUMA STUDIO — LIBRARY BROWSER (V1.4) — Explorateur permanent
// =============================================================================
// Panneau permanent visible à gauche qui liste toutes les ressources du jeu
// par catégorie. Drag-and-drop vers les éditeurs, renommer, dupliquer, suppr.
// =============================================================================

(function () {
  "use strict";

  const TRANSPARENT = 0xF81F;

  const CATEGORIES = [
    { id: "sprites",    label: "🎨 Sprites",    icon: "🎨" },
    { id: "animations", label: "🎬 Animations", icon: "🎬" },
    { id: "objects",    label: "📦 Objets",     icon: "📦" },
    { id: "music",      label: "🎵 Musique",    icon: "🎵" },
    { id: "dialogues",  label: "💬 Dialogues",  icon: "💬" },
    { id: "maps",       label: "🗺 Maps",       icon: "🗺" },
    { id: "cutscenes",  label: "🎬 Cutscenes",  icon: "🎬" },
    { id: "events",     label: "⚡ Events",     icon: "⚡" }
  ];

  const state = {
    expandedCats: new Set(["sprites", "animations", "objects"]),
    searchQuery: ""
  };

  let panel, contentEl, searchInput;

  // ---------------------------------------------------------------------------
  // BUILD UI
  // ---------------------------------------------------------------------------
  function buildPanel() {
    if (panel) return;
    panel = document.createElement("aside");
    panel.id = "lumaLibrary";
    panel.className = "luma-library";
    panel.innerHTML = `
      <div class="lib-header">
        <h2>📚 BIBLIOTHÈQUE</h2>
        <input type="text" id="libSearch" placeholder="🔍 Rechercher..." />
      </div>
      <div class="lib-content" id="libContent"></div>
    `;
    // Insère dans .app-shell avant la sidebar
    const shell = document.querySelector("#studio .app-shell");
    if (shell) {
      shell.insertBefore(panel, shell.firstChild);
    } else {
      document.body.appendChild(panel);
    }
    contentEl = document.getElementById("libContent");
    searchInput = document.getElementById("libSearch");
    searchInput.oninput = (e) => { state.searchQuery = e.target.value.toLowerCase(); refresh(); };

    refresh();
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function refresh() {
    if (!contentEl) return;
    contentEl.innerHTML = "";
    for (const cat of CATEGORIES) {
      const items = collectItems(cat.id);
      const filtered = state.searchQuery
        ? items.filter(it => (it.label || "").toLowerCase().includes(state.searchQuery))
        : items;

      const sec = document.createElement("section");
      sec.className = "lib-cat" + (state.expandedCats.has(cat.id) ? " expanded" : "");
      const expanded = state.expandedCats.has(cat.id);
      sec.innerHTML = `
        <header class="lib-cat-head">
          <span class="lib-cat-arrow">${expanded ? "▼" : "▶"}</span>
          <span class="lib-cat-label">${cat.label}</span>
          <span class="lib-cat-count">${items.length}</span>
        </header>
        <div class="lib-cat-body" style="display:${expanded ? "block" : "none"}"></div>
      `;
      sec.querySelector(".lib-cat-head").onclick = () => {
        if (state.expandedCats.has(cat.id)) state.expandedCats.delete(cat.id);
        else state.expandedCats.add(cat.id);
        refresh();
      };
      const body = sec.querySelector(".lib-cat-body");
      if (filtered.length === 0) {
        body.innerHTML = `<p class="lib-empty">${state.searchQuery ? "Aucun résultat" : "(vide)"}</p>`;
      } else {
        for (const it of filtered) body.appendChild(buildItem(cat.id, it));
      }
      contentEl.appendChild(sec);
    }
  }

  function buildItem(catId, item) {
    const row = document.createElement("div");
    row.className = "lib-item";
    row.draggable = true;
    row.dataset.cat = catId;
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="lib-item-thumb"><canvas width="20" height="20"></canvas></div>
      <span class="lib-item-name" title="${item.label}">${item.label}</span>
      <span class="lib-item-meta">${item.meta || ""}</span>
      <div class="lib-item-actions">
        <button class="lib-act-rename" title="Renommer">✎</button>
        <button class="lib-act-dup" title="Dupliquer">⎘</button>
        <button class="lib-act-del" title="Supprimer">×</button>
      </div>
    `;
    // Draw thumb
    drawThumb(row.querySelector("canvas"), catId, item);
    // Click → ouvrir éditeur correspondant
    row.querySelector(".lib-item-name").onclick = () => openItem(catId, item);
    row.querySelector(".lib-item-thumb").onclick = () => openItem(catId, item);
    // Drag pour map editor
    row.ondragstart = (e) => {
      const mimeMap = {
        sprites: "application/x-luma-frame",
        animations: "application/x-luma-anim",
        objects: "application/x-luma-object"
      };
      const mime = mimeMap[catId];
      if (mime) e.dataTransfer.setData(mime, String(item.id));
      e.dataTransfer.effectAllowed = "copy";
    };
    // Actions
    row.querySelector(".lib-act-rename").onclick = (e) => { e.stopPropagation(); renameItem(catId, item); };
    row.querySelector(".lib-act-dup").onclick = (e) => { e.stopPropagation(); duplicateItem(catId, item); };
    row.querySelector(".lib-act-del").onclick = (e) => { e.stopPropagation(); deleteItem(catId, item); };
    return row;
  }

  // ---------------------------------------------------------------------------
  // COLLECT DATA
  // ---------------------------------------------------------------------------
  function collectItems(catId) {
    switch (catId) {
      case "sprites":
        return (typeof frames !== "undefined" ? frames : []).map(f => ({
          id: f.id, label: f.name, meta: `${f.w}×${f.h}`, raw: f
        }));
      case "animations":
        return (window.animations || []).map(a => ({
          id: a.id, label: a.name || a.id, meta: `${(a.slots || []).length} f`, raw: a
        }));
      case "objects":
        return (typeof objects !== "undefined" ? objects : []).map(o => ({
          id: o.id, label: o.name, meta: o.type, raw: o
        }));
      case "music":
        if (typeof music === "undefined") return [];
        return [{ id: "main", label: music.name || "theme_01", meta: `${music.tempo || 120} BPM`, raw: music }];
      case "dialogues":
        return (typeof dialogues !== "undefined" ? dialogues : []).map(d => ({
          id: d.id, label: d.id, meta: d.speaker || "", raw: d
        }));
      case "maps":
        return (typeof maps !== "undefined" ? maps : []).map(m => ({
          id: m.id, label: m.id, meta: `${m.width}×${m.height}`, raw: m
        }));
      case "cutscenes":
        return (typeof cutscenes !== "undefined" ? cutscenes : []).map(c => ({
          id: c.id, label: c.id, meta: `${(c.steps || []).length} step`, raw: c
        }));
      case "events":
        return (typeof events !== "undefined" ? events : []).map(e => ({
          id: e.id, label: e.name, meta: e.condition, raw: e
        }));
    }
    return [];
  }

  function drawThumb(cv, catId, item) {
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#02061a";
    ctx.fillRect(0, 0, cv.width, cv.height);

    if (catId === "sprites") {
      const f = item.raw;
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
          const tmp = document.createElement("canvas");
          tmp.width = f.w; tmp.height = f.h;
          tmp.getContext("2d").putImageData(img, 0, 0);
          ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
        } catch (e) {}
      }
    } else if (catId === "objects" && window.LumaObjectEditor) {
      window.LumaObjectEditor.drawObjectThumb(cv, item.raw);
    } else if (catId === "animations") {
      const a = item.raw;
      if (a && a.slots && a.slots.length > 0 && typeof frames !== "undefined") {
        const slot = a.slots[0];
        const f = frames.find(fr => fr.id === slot.frameId);
        if (f) drawThumb(cv, "sprites", { raw: f });
      }
    } else {
      // emoji-style centered glyph
      const cat = CATEGORIES.find(c => c.id === catId);
      if (cat) {
        ctx.fillStyle = "#fff";
        ctx.font = "14px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cat.icon, cv.width / 2, cv.height / 2);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------------------
  function openItem(catId, item) {
    switch (catId) {
      case "sprites":
        if (window.LumaSpriteEditor) {
          const idx = frames.findIndex(f => f.id === item.id);
          if (idx >= 0) window.LumaSpriteEditor.open(idx);
        }
        break;
      case "objects":
        document.querySelectorAll(".nav-btn").forEach(b => {
          if (b.dataset.panel === "logicPanel") b.click();
        });
        setTimeout(() => {
          if (window.LumaObjectEditor) {
            // sélectionne dans l'object editor
            const o = objects.find(o => o.id === item.id);
            if (o) {
              // Pas d'API directe pour selectedId, on simule en cliquant la card
              const card = document.querySelector(`.oe-card.selected`);
              if (card) card.click();
              // Pour vraiment sélectionner, refresh + accès direct au state interne (limité)
              window.LumaObjectEditor.refresh();
            }
          }
        }, 100);
        break;
      case "animations":
        document.querySelectorAll(".nav-btn").forEach(b => {
          if (b.dataset.panel === "animationPanel") b.click();
        });
        break;
      case "music":
        document.querySelectorAll(".nav-btn").forEach(b => {
          if (b.dataset.panel === "musicPanel") b.click();
        });
        break;
      case "maps":
        document.querySelectorAll(".nav-btn").forEach(b => {
          if (b.dataset.panel === "scenePanel") b.click();
        });
        break;
      case "dialogues":
      case "cutscenes":
      case "events":
        document.querySelectorAll(".nav-btn").forEach(b => {
          if (b.dataset.panel === "narrativePanel" || b.dataset.panel === "logicPanel") b.click();
        });
        break;
    }
  }

  function renameItem(catId, item) {
    const newName = prompt("Nouveau nom :", item.label);
    if (!newName) return;
    if (catId === "sprites") {
      const f = frames.find(fr => fr.id === item.id);
      if (f) f.name = newName;
    } else if (catId === "animations") {
      const a = window.animations.find(a => a.id === item.id);
      if (a) a.name = newName;
    } else if (catId === "objects") {
      const o = objects.find(o => o.id === item.id);
      if (o) o.name = newName;
    } else if (catId === "music") {
      music.name = newName;
    }
    refreshAll();
  }

  function duplicateItem(catId, item) {
    if (catId === "sprites") {
      const f = frames.find(fr => fr.id === item.id);
      if (!f) return;
      const copy = JSON.parse(JSON.stringify(f));
      copy.id = Date.now() + Math.floor(Math.random() * 1000);
      copy.name = f.name + "_copy";
      frames.push(copy);
    } else if (catId === "animations") {
      if (!window.LumaAnimEditor) return;
      const a = window.animations.find(a => a.id === item.id);
      if (!a) return;
      const copy = JSON.parse(JSON.stringify(a));
      // génère nouvel ID
      let n = 1; let nid = "anim_001";
      while (window.animations.some(x => x.id === nid)) { n++; nid = "anim_" + String(n).padStart(3, "0"); }
      copy.id = nid;
      copy.name = (a.name || a.id) + "_copy";
      window.animations.push(copy);
    } else if (catId === "objects") {
      const o = objects.find(o => o.id === item.id);
      if (!o) return;
      const copy = JSON.parse(JSON.stringify(o));
      copy.id = nextObjectId++;
      copy.name = o.name + "_copy";
      objects.push(copy);
    }
    refreshAll();
  }

  function deleteItem(catId, item) {
    if (!confirm("Supprimer « " + item.label + " » ?")) return;
    if (catId === "sprites") {
      const idx = frames.findIndex(f => f.id === item.id);
      if (idx >= 0) frames.splice(idx, 1);
    } else if (catId === "animations") {
      const idx = window.animations.findIndex(a => a.id === item.id);
      if (idx >= 0) window.animations.splice(idx, 1);
    } else if (catId === "objects") {
      const idx = objects.findIndex(o => o.id === item.id);
      if (idx >= 0) objects.splice(idx, 1);
    } else if (catId === "dialogues") {
      const idx = dialogues.findIndex(d => d.id === item.id);
      if (idx >= 0) dialogues.splice(idx, 1);
    } else if (catId === "maps") {
      const idx = maps.findIndex(m => m.id === item.id);
      if (idx >= 0) maps.splice(idx, 1);
    } else if (catId === "events") {
      const idx = events.findIndex(e => e.id === item.id);
      if (idx >= 0) events.splice(idx, 1);
    }
    refreshAll();
  }

  function refreshAll() {
    refresh();
    if (typeof renderAll === "function") renderAll();
    if (typeof updateMemory === "function") updateMemory();
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  window.LumaLibrary = {
    init: buildPanel,
    refresh: refresh
  };

  document.addEventListener("DOMContentLoaded", () => {
    // Init quand on entre dans le studio
    const studio = document.getElementById("studio");
    if (studio) {
      const obs = new MutationObserver(() => {
        if (studio.classList.contains("active") && !panel) {
          setTimeout(buildPanel, 50);
        }
      });
      obs.observe(studio, { attributes: true, attributeFilter: ["class"] });
      // Si déjà actif (open project automatique)
      if (studio.classList.contains("active")) setTimeout(buildPanel, 100);
    }
  });
})();
