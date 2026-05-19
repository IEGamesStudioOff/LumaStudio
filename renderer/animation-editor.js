// =============================================================================
// LUMA STUDIO — ANIMATION EDITOR (V1.1)
// =============================================================================
// Une animation = liste de slots {frameId, durationMs?} + speedMs global + loop.
// Si durationMs est défini, il override la vitesse globale pour cette frame.
// Loop modes : forward, ping-pong, once.
// =============================================================================

(function () {
  "use strict";

  const TRANSPARENT = 0xF81F;

  // global animations array shared with renderAll
  if (typeof window.animations === "undefined") window.animations = [];

  const state = {
    selectedAnimId: null,
    isPlaying: false,
    playStart: 0,
    playFrameIdx: 0,
    playDirection: 1,
    previewZoom: 4,
    onionSkin: false,
    rafId: 0
  };

  let panel, animsListEl, slotsEl, poolEl, settingsEl, previewBox, previewMain, previewLuma, statsEl;

  function $$(id) { return document.getElementById(id); }

  function getAnim() {
    return window.animations.find(a => a.id === state.selectedAnimId);
  }

  function findFrameById(id) {
    return frames.find(f => f.id === id);
  }

  // ---------------------------------------------------------------------------
  // RENDER UI
  // ---------------------------------------------------------------------------
  function renderAnimList() {
    if (!animsListEl) return;
    animsListEl.innerHTML = "";
    window.animations.forEach(a => {
      const div = document.createElement("div");
      div.className = "anim-card" + (a.id === state.selectedAnimId ? " selected" : "");
      div.innerHTML = `
        <strong>${a.name || a.id}</strong>
        <span>${(a.slots || []).length} frames · ${a.speedMs}ms · ${a.loop || "forward"}</span>
      `;
      div.onclick = () => {
        state.selectedAnimId = a.id;
        stopPlay();
        renderAll();
      };
      animsListEl.appendChild(div);
    });
  }

  function renderFramePool() {
    if (!poolEl) return;
    poolEl.innerHTML = "";
    frames.forEach((f, i) => {
      const card = document.createElement("div");
      card.className = "anim-pool-frame";
      card.draggable = true;
      const cv = document.createElement("canvas");
      cv.width = f.w; cv.height = f.h;
      drawFrameToCanvas(cv, f);
      card.appendChild(cv);
      const label = document.createElement("span");
      label.textContent = f.name || ("#" + i);
      card.appendChild(label);

      // count d'utilisation
      const used = countFrameUsage(f.id);
      if (used > 0) {
        const badge = document.createElement("div");
        badge.className = "anim-badge";
        badge.textContent = "×" + used;
        card.appendChild(badge);
      }

      card.ondragstart = (e) => {
        e.dataTransfer.setData("application/x-luma-pool", String(f.id));
        e.dataTransfer.effectAllowed = "copy";
      };
      card.ondblclick = () => addFrameToCurrentAnim(f.id);
      poolEl.appendChild(card);
    });
  }

  function countFrameUsage(frameId) {
    let n = 0;
    for (const a of window.animations) {
      for (const s of (a.slots || [])) if (s.frameId === frameId) n++;
    }
    return n;
  }

  function renderSlots() {
    if (!slotsEl) return;
    slotsEl.innerHTML = "";
    const a = getAnim();
    if (!a) {
      slotsEl.innerHTML = `<p class="anim-empty">Sélectionne une animation ou crée-en une.</p>`;
      return;
    }
    a.slots = a.slots || [];
    a.slots.forEach((slot, idx) => {
      const f = findFrameById(slot.frameId);
      const div = document.createElement("div");
      div.className = "anim-slot" + (idx === state.playFrameIdx && state.isPlaying ? " playing" : "");
      div.draggable = true;
      div.dataset.idx = idx;
      const cv = document.createElement("canvas");
      cv.width = f ? f.w : 16;
      cv.height = f ? f.h : 16;
      if (f) drawFrameToCanvas(cv, f);
      div.appendChild(cv);

      const meta = document.createElement("div");
      meta.className = "anim-slot-meta";
      const dur = slot.durationMs ?? a.speedMs;
      meta.innerHTML = `<span>${f ? f.name : "?"}</span><span>${dur}ms</span>`;
      div.appendChild(meta);

      const ctrls = document.createElement("div");
      ctrls.className = "anim-slot-ctrls";

      const upBtn = document.createElement("button");
      upBtn.textContent = "◀";
      upBtn.title = "Déplacer à gauche";
      upBtn.onclick = (e) => { e.stopPropagation(); moveSlot(idx, -1); };
      ctrls.appendChild(upBtn);

      const dnBtn = document.createElement("button");
      dnBtn.textContent = "▶";
      dnBtn.title = "Déplacer à droite";
      dnBtn.onclick = (e) => { e.stopPropagation(); moveSlot(idx, 1); };
      ctrls.appendChild(dnBtn);

      const durBtn = document.createElement("button");
      durBtn.textContent = "⏱";
      durBtn.title = "Durée override pour cette frame (ms, vide=global)";
      durBtn.onclick = (e) => {
        e.stopPropagation();
        const v = prompt("Durée pour cette frame en ms (vide = global) :", slot.durationMs ?? "");
        if (v === null) return;
        if (v === "") { delete slot.durationMs; }
        else { slot.durationMs = Math.max(20, Math.min(2000, Number(v) || a.speedMs)); }
        renderAll();
      };
      ctrls.appendChild(durBtn);

      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.title = "Supprimer ce slot";
      delBtn.onclick = (e) => { e.stopPropagation(); a.slots.splice(idx, 1); renderAll(); };
      ctrls.appendChild(delBtn);

      div.appendChild(ctrls);

      div.ondragstart = (e) => {
        e.dataTransfer.setData("application/x-luma-slot", String(idx));
        e.dataTransfer.effectAllowed = "move";
      };
      div.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes("application/x-luma-pool") ? "copy" : "move";
        div.classList.add("drag-over");
      };
      div.ondragleave = () => div.classList.remove("drag-over");
      div.ondrop = (e) => {
        e.preventDefault();
        div.classList.remove("drag-over");
        const slotIdx = e.dataTransfer.getData("application/x-luma-slot");
        const poolId = e.dataTransfer.getData("application/x-luma-pool");
        if (slotIdx !== "") {
          const fromIdx = parseInt(slotIdx);
          if (fromIdx === idx) return;
          const item = a.slots.splice(fromIdx, 1)[0];
          a.slots.splice(idx, 0, item);
          renderAll();
        } else if (poolId !== "") {
          a.slots.splice(idx, 0, { frameId: Number(poolId) });
          renderAll();
        }
      };

      slotsEl.appendChild(div);
    });

    // Drop zone à la fin pour ajouter
    const dropEnd = document.createElement("div");
    dropEnd.className = "anim-slot-drop-end";
    dropEnd.textContent = "+ glisse une frame ici";
    dropEnd.ondragover = (e) => { e.preventDefault(); dropEnd.classList.add("drag-over"); };
    dropEnd.ondragleave = () => dropEnd.classList.remove("drag-over");
    dropEnd.ondrop = (e) => {
      e.preventDefault();
      dropEnd.classList.remove("drag-over");
      const poolId = e.dataTransfer.getData("application/x-luma-pool");
      const slotIdx = e.dataTransfer.getData("application/x-luma-slot");
      if (poolId !== "") {
        a.slots.push({ frameId: Number(poolId) });
        renderAll();
      } else if (slotIdx !== "") {
        const fromIdx = parseInt(slotIdx);
        const item = a.slots.splice(fromIdx, 1)[0];
        a.slots.push(item);
        renderAll();
      }
    };
    slotsEl.appendChild(dropEnd);
  }

  function moveSlot(idx, dir) {
    const a = getAnim();
    if (!a) return;
    const target = idx + dir;
    if (target < 0 || target >= a.slots.length) return;
    const tmp = a.slots[idx];
    a.slots[idx] = a.slots[target];
    a.slots[target] = tmp;
    renderAll();
  }

  function addFrameToCurrentAnim(frameId) {
    const a = getAnim();
    if (!a) return alert("Sélectionne ou crée d'abord une animation.");
    a.slots = a.slots || [];
    a.slots.push({ frameId });
    renderAll();
  }

  function renderSettings() {
    if (!settingsEl) return;
    const a = getAnim();
    if (!a) {
      settingsEl.innerHTML = `<p class="anim-empty">Aucune animation sélectionnée.</p>`;
      return;
    }
    settingsEl.innerHTML = `
      <label>Nom</label>
      <input id="animName" value="${a.name || ""}" />
      <label>ID</label>
      <input id="animId" value="${a.id}" disabled />
      <label>Vitesse globale (ms/frame) <strong id="animSpeedLbl">${a.speedMs}</strong></label>
      <input id="animSpeed" type="range" min="20" max="500" step="5" value="${a.speedMs}" />
      <label>Loop mode</label>
      <select id="animLoop">
        <option value="forward" ${a.loop === "forward" ? "selected" : ""}>Forward (boucle)</option>
        <option value="pingpong" ${a.loop === "pingpong" ? "selected" : ""}>Ping-pong</option>
        <option value="once" ${a.loop === "once" ? "selected" : ""}>Once (joue une fois)</option>
      </select>
      <label class="anim-check"><input id="animOnion" type="checkbox" ${state.onionSkin ? "checked" : ""}> Onion skin sur timeline</label>
      <h3>Preview</h3>
      <div class="anim-zoom-row">
        <button class="anim-zoom-btn ${state.previewZoom === 1 ? "active" : ""}" data-zoom="1">×1 (console)</button>
        <button class="anim-zoom-btn ${state.previewZoom === 4 ? "active" : ""}" data-zoom="4">×4</button>
        <button class="anim-zoom-btn ${state.previewZoom === 8 ? "active" : ""}" data-zoom="8">×8</button>
      </div>
      <div class="anim-play-row">
        <button class="anim-btn" id="animPlay">${state.isPlaying ? "PAUSE" : "PLAY"}</button>
        <button class="anim-btn" id="animStop">STOP</button>
      </div>
      <h3>Actions</h3>
      <button class="anim-btn" id="animDuplicate">Dupliquer</button>
      <button class="anim-btn anim-danger" id="animDelete">Supprimer</button>
      <h3>Export</h3>
      <div class="anim-export-row">
        <button class="anim-gif-btn" id="animExportGif">📽 GIF (×4)</button>
        <button class="anim-gif-btn" id="animExportGif1">📽 GIF (×1)</button>
      </div>
    `;
    $$("animName").oninput = () => { a.name = $$("animName").value; renderAnimList(); };
    $$("animSpeed").oninput = () => {
      a.speedMs = Number($$("animSpeed").value);
      $$("animSpeedLbl").textContent = a.speedMs;
      renderSlots();
    };
    $$("animLoop").onchange = () => { a.loop = $$("animLoop").value; renderAnimList(); };
    $$("animOnion").onchange = () => { state.onionSkin = $$("animOnion").checked; renderSlots(); };
    settingsEl.querySelectorAll(".anim-zoom-btn").forEach(b => {
      b.onclick = () => { state.previewZoom = Number(b.dataset.zoom); renderSettings(); renderPreview(); };
    });
    $$("animPlay").onclick = togglePlay;
    $$("animStop").onclick = stopPlay;
    $$("animDuplicate").onclick = () => {
      const copy = JSON.parse(JSON.stringify(a));
      copy.id = nextAnimId();
      copy.name = (a.name || a.id) + "_copy";
      window.animations.push(copy);
      state.selectedAnimId = copy.id;
      renderAll();
    };
    $$("animDelete").onclick = () => {
      if (!confirm("Supprimer l'animation " + (a.name || a.id) + " ?")) return;
      window.animations = window.animations.filter(x => x.id !== a.id);
      state.selectedAnimId = window.animations[0]?.id || null;
      stopPlay();
      renderAll();
    };
    $$("animExportGif").onclick = () => exportGif(a, 4);
    $$("animExportGif1").onclick = () => exportGif(a, 1);
  }

  // ---------------------------------------------------------------------------
  // EXPORT GIF (V1.2)
  // ---------------------------------------------------------------------------
  function exportGif(anim, scale) {
    if (!window.LumaGifEncoder) {
      alert("Encoder GIF indisponible.");
      return;
    }
    if (!anim || !anim.slots || !anim.slots.length) {
      alert("Animation vide.");
      return;
    }
    scale = scale || 1;

    // 1) collecter toutes les frames référencées + leurs pixels (composition flat)
    const slotFrames = anim.slots.map(s => findFrameById(s.frameId)).filter(Boolean);
    if (!slotFrames.length) { alert("Aucune frame valide."); return; }

    // Dimensions communes = max w/h (frames pas forcément même taille)
    let maxW = 0, maxH = 0;
    for (const f of slotFrames) { maxW = Math.max(maxW, f.w); maxH = Math.max(maxH, f.h); }
    const gifW = maxW * scale;
    const gifH = maxH * scale;

    // 2) collecter toutes les couleurs uniques (compositions) → palette
    const allPixels = [];
    for (const f of slotFrames) {
      const px = f.pixelsB64 ? window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h) : null;
      allPixels.push({ f, px });
    }

    // Set des couleurs RGB565 utilisées (sans TRANSPARENT)
    const colorSet = new Set();
    for (const { px } of allPixels) {
      if (!px) continue;
      for (let i = 0; i < px.length; i++) {
        if (px[i] !== TRANSPARENT) colorSet.add(px[i]);
      }
    }
    // On garde l'index 0 pour la couleur de fond / transparent.
    // Palette : [transparent placeholder, ...autres couleurs]
    let colorList = Array.from(colorSet).slice(0, 255);
    if (colorList.length > 255) {
      alert("Plus de 255 couleurs uniques dans l'anim — l'export GIF va perdre des détails.");
      colorList = colorList.slice(0, 255);
    }
    // Build palette : index 0 = magenta visible (transparent), 1+ = couleurs réelles
    const palette = [[255, 0, 255]];
    for (const c565 of colorList) {
      const r5 = (c565 >> 11) & 0x1F, g6 = (c565 >> 5) & 0x3F, b5 = c565 & 0x1F;
      palette.push([
        (r5 << 3) | (r5 >> 2),
        (g6 << 2) | (g6 >> 4),
        (b5 << 3) | (b5 >> 2)
      ]);
    }
    const colorToIndex = new Map();
    colorList.forEach((c, i) => colorToIndex.set(c, i + 1));

    // 3) encoder
    const enc = new window.LumaGifEncoder(gifW, gifH);
    enc.setPalette(palette);

    for (let s = 0; s < anim.slots.length; s++) {
      const slot = anim.slots[s];
      const item = allPixels[s];
      if (!item) continue;
      const f = item.f;
      const px = item.px;
      const indices = new Uint8Array(gifW * gifH);
      indices.fill(0); // transparent partout au départ
      if (px) {
        // centrer la frame si plus petite que la taille max
        const offX = Math.floor((maxW - f.w) / 2);
        const offY = Math.floor((maxH - f.h) / 2);
        for (let y = 0; y < f.h; y++) {
          for (let x = 0; x < f.w; x++) {
            const c = px[y * f.w + x];
            if (c === TRANSPARENT) continue;
            const palIdx = colorToIndex.get(c) || 0;
            // upscale par scale
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                const gx = (offX + x) * scale + dx;
                const gy = (offY + y) * scale + dy;
                indices[gy * gifW + gx] = palIdx;
              }
            }
          }
        }
      }
      const dur = slot.durationMs ?? anim.speedMs;
      enc.addFrame(indices, dur, 0); // index 0 = transparent
    }

    const bytes = enc.finish();
    const blob = new Blob([bytes], { type: "image/gif" });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = url;
    a2.download = (anim.name || anim.id) + (scale > 1 ? ("_x" + scale) : "") + ".gif";
    document.body.appendChild(a2);
    a2.click();
    setTimeout(() => { URL.revokeObjectURL(url); a2.remove(); }, 200);
  }

  function nextAnimId() {
    let id = "anim_001";
    let n = 1;
    while (window.animations.some(a => a.id === id)) {
      n++;
      id = "anim_" + String(n).padStart(3, "0");
    }
    return id;
  }

  // ---------------------------------------------------------------------------
  // PREVIEW
  // ---------------------------------------------------------------------------
  function renderPreview() {
    if (!previewMain || !previewLuma) return;
    const a = getAnim();
    drawClear(previewMain);
    drawClear(previewLuma);
    if (!a || !a.slots || !a.slots.length) {
      statsEl.textContent = "—";
      return;
    }
    const slot = a.slots[Math.min(state.playFrameIdx, a.slots.length - 1)];
    const f = findFrameById(slot.frameId);
    if (!f) return;
    drawFrameZoomed(previewMain, f, state.previewZoom);
    // Toujours afficher la frame en ×1 dans le cadre "console"
    drawFrameAtConsoleScale(previewLuma, f);

    let totalMs = 0;
    a.slots.forEach(s => totalMs += (s.durationMs ?? a.speedMs));
    statsEl.textContent = a.slots.length + " frames · " + totalMs + "ms total · "
      + (1000 / Math.max(1, totalMs)).toFixed(2) + " loop/sec";
  }

  function drawClear(cv) {
    const c = cv.getContext("2d");
    c.fillStyle = "#000";
    c.fillRect(0, 0, cv.width, cv.height);
  }

  function drawFrameZoomed(cv, f, zoom) {
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    drawClear(cv);
    const px = f.pixelsB64 && window.LumaSpriteEditor
      ? window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h)
      : null;
    const ox = Math.floor((cv.width - f.w * zoom) / 2);
    const oy = Math.floor((cv.height - f.h * zoom) / 2);
    if (px) {
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          const p = px[y * f.w + x];
          if (p === TRANSPARENT) continue;
          c.fillStyle = window.LumaSpriteEditor.rgb565ToHex(p);
          c.fillRect(ox + x * zoom, oy + y * zoom, zoom, zoom);
        }
      }
    } else if (typeof importedImage !== "undefined" && importedImage) {
      c.drawImage(importedImage, f.x, f.y, f.w, f.h, ox, oy, f.w * zoom, f.h * zoom);
    }
    // border
    c.strokeStyle = "#2141d6";
    c.strokeRect(ox - 0.5, oy - 0.5, f.w * zoom + 1, f.h * zoom + 1);
  }

  function drawFrameAtConsoleScale(cv, f) {
    // dessin pixel pour pixel comme sur la console (160×128)
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    drawClear(cv);
    const px = f.pixelsB64 && window.LumaSpriteEditor
      ? window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h)
      : null;
    // au centre de la zone 160×128
    const ox = Math.floor((cv.width - 160) / 2);
    const oy = Math.floor((cv.height - 128) / 2);
    c.strokeStyle = "#5f7cff";
    c.strokeRect(ox - 0.5, oy - 0.5, 160 + 1, 128 + 1);
    const fx = ox + Math.floor((160 - f.w) / 2);
    const fy = oy + Math.floor((128 - f.h) / 2);
    if (px) {
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          const p = px[y * f.w + x];
          if (p === TRANSPARENT) continue;
          c.fillStyle = window.LumaSpriteEditor.rgb565ToHex(p);
          c.fillRect(fx + x, fy + y, 1, 1);
        }
      }
    } else if (typeof importedImage !== "undefined" && importedImage) {
      c.drawImage(importedImage, f.x, f.y, f.w, f.h, fx, fy, f.w, f.h);
    }
  }

  function drawFrameToCanvas(cv, f) {
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    const px = f.pixelsB64 && window.LumaSpriteEditor
      ? window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h)
      : null;
    if (px) {
      const img = c.createImageData(f.w, f.h);
      for (let p = 0; p < px.length; p++) {
        if (px[p] === TRANSPARENT) {
          img.data[p * 4 + 3] = 0;
        } else {
          const v = px[p];
          const r5 = (v >> 11) & 0x1F, g6 = (v >> 5) & 0x3F, b5 = v & 0x1F;
          img.data[p * 4]     = (r5 << 3) | (r5 >> 2);
          img.data[p * 4 + 1] = (g6 << 2) | (g6 >> 4);
          img.data[p * 4 + 2] = (b5 << 3) | (b5 >> 2);
          img.data[p * 4 + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    } else if (typeof importedImage !== "undefined" && importedImage) {
      c.drawImage(importedImage, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    }
  }

  // ---------------------------------------------------------------------------
  // PLAYBACK
  // ---------------------------------------------------------------------------
  function togglePlay() {
    if (state.isPlaying) stopPlay();
    else startPlay();
  }

  function startPlay() {
    const a = getAnim();
    if (!a || !a.slots || !a.slots.length) return;
    state.isPlaying = true;
    state.playStart = performance.now();
    state.playFrameIdx = 0;
    state.playDirection = 1;
    state.slotStart = performance.now();
    tick();
    renderSettings();
  }

  function stopPlay() {
    state.isPlaying = false;
    state.playFrameIdx = 0;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    renderSettings();
    renderSlots();
    renderPreview();
  }

  function tick() {
    if (!state.isPlaying) return;
    const a = getAnim();
    if (!a || !a.slots || !a.slots.length) { stopPlay(); return; }
    const now = performance.now();
    const slot = a.slots[state.playFrameIdx];
    const dur = slot.durationMs ?? a.speedMs;
    if (now - state.slotStart >= dur) {
      // avance
      if (a.loop === "pingpong") {
        state.playFrameIdx += state.playDirection;
        if (state.playFrameIdx >= a.slots.length - 1) { state.playFrameIdx = a.slots.length - 1; state.playDirection = -1; }
        else if (state.playFrameIdx <= 0) { state.playFrameIdx = 0; state.playDirection = 1; }
      } else if (a.loop === "once") {
        state.playFrameIdx++;
        if (state.playFrameIdx >= a.slots.length) { stopPlay(); return; }
      } else {
        state.playFrameIdx = (state.playFrameIdx + 1) % a.slots.length;
      }
      state.slotStart = now;
      renderSlots();
      renderPreview();
    }
    state.rafId = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------
  function renderAll() {
    renderAnimList();
    renderFramePool();
    renderSlots();
    renderSettings();
    renderPreview();
  }

  // ---------------------------------------------------------------------------
  // PUBLIC INIT
  // ---------------------------------------------------------------------------
  window.LumaAnimEditor = {
    init: initPanel,
    renderAll: renderAll,
    addAnim: () => {
      const id = nextAnimId();
      const a = { id, name: id, slots: [], speedMs: 120, loop: "forward" };
      window.animations.push(a);
      state.selectedAnimId = id;
      renderAll();
    },
    setAnimations: (arr) => {
      window.animations = arr || [];
      if (window.animations.length && !state.selectedAnimId) state.selectedAnimId = window.animations[0].id;
      renderAll();
    },
    getAnimations: () => window.animations,
    refresh: renderAll
  };

  function initPanel() {
    panel = $$("animationPanel");
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = "1";
    panel.innerHTML = `
      <div class="help-box"><strong>Animation Editor :</strong> drag/drop des frames vers la timeline. Vitesse globale + override par frame. Loop forward / ping-pong / once.</div>
      <div class="anim-layout">
        <aside class="tool-panel">
          <h2>Animations</h2>
          <button class="primary full" id="animNew">+ NOUVELLE ANIMATION</button>
          <div class="anim-list" id="animsList"></div>
          <h2>Pool de frames</h2>
          <p class="small-text">Double-clic ou drag vers la timeline.</p>
          <div class="anim-pool" id="animPool"></div>
        </aside>
        <main class="anim-workspace">
          <h2>Timeline</h2>
          <div class="anim-timeline" id="animSlots"></div>
          <h2>Preview</h2>
          <div class="anim-preview-row">
            <div class="anim-preview-box">
              <h3>Zoom</h3>
              <canvas id="animPreview" width="320" height="320"></canvas>
            </div>
            <div class="anim-preview-box">
              <h3>Écran Luma 160×128</h3>
              <canvas id="animPreviewLuma" width="200" height="160"></canvas>
            </div>
          </div>
          <p class="anim-stats" id="animStats">—</p>
        </main>
        <aside class="tool-panel">
          <h2>Réglages</h2>
          <div id="animSettings"></div>
        </aside>
      </div>
    `;
    animsListEl = $$("animsList");
    poolEl = $$("animPool");
    slotsEl = $$("animSlots");
    settingsEl = $$("animSettings");
    previewMain = $$("animPreview");
    previewLuma = $$("animPreviewLuma");
    statsEl = $$("animStats");

    $$("animNew").onclick = () => window.LumaAnimEditor.addAnim();
    renderAll();
  }

  // initialise dès qu'on entre dans le panel
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      if (btn.dataset.panel === "animationPanel") {
        btn.addEventListener("click", () => setTimeout(initPanel, 30));
      }
    });
  });
})();
