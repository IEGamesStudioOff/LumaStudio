// =============================================================================
// LUMA STUDIO — MUSIC EDITOR (V1.4) — Piano Roll multi-tracks
// =============================================================================
// Correction : le champ "Nom" reste éditable, les raccourcis clavier du studio
// ne volent plus le focus, et un bouton permet d'ajouter de nouvelles tracks.
// Compatibilité : A/B restent conservés pour l'ESP32, les tracks C/D/... sont
// sauvegardées aussi dans music.grid + music.tracks pour le simulateur et les exports futurs.
// =============================================================================

(function () {
  "use strict";

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SHARPS = [false, true, false, true, false, false, true, false, true, false, true, false];
  const NOTE_FREQ_O4 = {
    "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13,
    "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00,
    "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88
  };
  const OCTAVE_LOW = 3;
  const OCTAVE_HIGH = 5;
  const TOTAL_ROWS = (OCTAVE_HIGH - OCTAVE_LOW + 1) * 12;
  const TRACK_ORDER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const PRESETS = {
    main_theme: {
      label: "🎶 Main Theme",
      tempo: 120, steps: 32, loopA: true, loopB: true,
      seed: { A: [["C",4],["E",4],["G",4],["C",5],null,["G",4],["E",4],["C",4]], B: [["C",3],null,["G",3],null,["C",3],null,["G",3],null] }
    },
    boss_theme: {
      label: "👹 Boss Theme",
      tempo: 160, steps: 32, loopA: true, loopB: true,
      seed: { A: [["D",4],["F",4],["A",4],["F",4],["D",4],["F",4],["A",4],["C",5]], B: [["D",3],["D",3],null,["A",2]] }
    },
    ambient: {
      label: "🌃 Décor / Ambient",
      tempo: 60, steps: 32, loopA: true, loopB: true,
      seed: { A: [["A",4],null,null,null,["E",4],null,null,null], B: [["A",3],null,null,null,null,null,null,null] }
    },
    blaster: {
      label: "🔫 Blaster SFX",
      tempo: 240, steps: 8, loopA: false, loopB: false,
      seed: { A: [["A",5],["F",5],["D",5],["A",4],null,null,null,null], B: [] }
    },
    explosion: {
      label: "💥 Explosion",
      tempo: 200, steps: 12, loopA: false, loopB: false,
      seed: { A: [["C",5],["A",4],["F",4],["D",4],["C",4],["A",3],["F",3],["D",3]], B: [["G",3],null,["E",3],null,["C",3],null,["A",2],null] }
    },
    coin: {
      label: "🪙 Pickup / Coin",
      tempo: 240, steps: 4, loopA: false, loopB: false,
      seed: { A: [["E",5],["G",5],null,null], B: [] }
    },
    jump: {
      label: "↑ Jump",
      tempo: 240, steps: 6, loopA: false, loopB: false,
      seed: { A: [["C",4],["E",4],["G",4],["C",5],null,null], B: [] }
    },
    hit: {
      label: "⚡ Hit / Damage",
      tempo: 240, steps: 4, loopA: false, loopB: false,
      seed: { A: [["D",3],["A#",2],null,null], B: [] }
    },
    blank: {
      label: "🆕 Vierge",
      tempo: 120, steps: 16, loopA: true, loopB: false,
      seed: { A: [], B: [] }
    }
  };

  const state = {
    isPlaying: false,
    playStart: 0,
    playhead: 0,
    audioCtx: null,
    activeOsc: {},
    rafId: 0,
    lastStep: -1
  };

  let panel = null;

  function $$(id) { return document.getElementById(id); }

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
  }

  function notifyDirty() {
    if (typeof window.markProjectDirty === "function") window.markProjectDirty();
    if (typeof window.updateCapacityBar === "function") window.updateCapacityBar();
  }

  function getTrackIds() {
    if (!music.grid) return ["A", "B"];
    const ids = Object.keys(music.grid);
    if (!ids.includes("A")) ids.push("A");
    if (!ids.includes("B")) ids.push("B");
    return ids.sort((a, b) => TRACK_ORDER.indexOf(a) - TRACK_ORDER.indexOf(b));
  }

  function getTrackLoop(track) {
    if (!music.loops) music.loops = {};
    if (track === "A") return music.loopA !== false;
    if (track === "B") return music.loopB === true;
    return music.loops[track] !== false;
  }

  function setTrackLoop(track, value) {
    if (!music.loops) music.loops = {};
    music.loops[track] = !!value;
    if (track === "A") music.loopA = !!value;
    if (track === "B") music.loopB = !!value;
    notifyDirty();
  }

  function trackLabel(track) {
    if (track === "A") return "🔊 BUZZER A (mélodie)";
    if (track === "B") return "🔉 BUZZER B (basse / harmonie)";
    return `🎼 TRACK ${track}`;
  }

  function ensureModel() {
    if (typeof music === "undefined") return;
    if (!music.name) music.name = "theme_01";
    if (!music.tempo) music.tempo = 120;
    if (!music.steps) music.steps = 16;
    if (!music.grid) music.grid = {};
    if (!music.tracks) music.tracks = {};
    if (!music.loops) music.loops = {};

    if (!Array.isArray(music.grid.A)) music.grid.A = new Array(music.steps).fill(null);
    if (!Array.isArray(music.grid.B)) music.grid.B = new Array(music.steps).fill(null);

    // Migration ancienne version tracks -> grid, track par track.
    for (const tr of Object.keys(music.tracks || {})) {
      if (!Array.isArray(music.grid[tr])) music.grid[tr] = new Array(music.steps).fill(null);
      if (Array.isArray(music.tracks[tr]) && !music.grid[tr].some(Boolean)) {
        for (let i = 0; i < music.tracks[tr].length && i < music.steps; i++) {
          const note = music.tracks[tr][i];
          if (note && note.note && note.note !== "REST") music.grid[tr][i] = { note: note.note, octave: note.octave || 4 };
        }
      }
    }

    if (typeof music.loopA !== "boolean") music.loopA = true;
    if (typeof music.loopB !== "boolean") music.loopB = false;
    music.loops.A = music.loopA;
    music.loops.B = music.loopB;
    if (!music.preset) music.preset = "blank";
    syncGridLength(music.steps);
    rebuildTracksFromGrid();
  }

  function syncGridLength(steps) {
    getTrackIds().forEach(tr => {
      if (!Array.isArray(music.grid[tr])) music.grid[tr] = [];
      const g = music.grid[tr];
      while (g.length < steps) g.push(null);
      if (g.length > steps) g.length = steps;
    });
  }

  function rebuildTracksFromGrid() {
    if (typeof music === "undefined" || !music.grid) return;
    if (!music.tracks) music.tracks = {};
    const beatMs = 60000 / (Number(music.tempo) || 120) / 4;
    getTrackIds().forEach(tr => {
      music.tracks[tr] = [];
      for (let i = 0; i < music.steps; i++) {
        const cell = music.grid[tr][i];
        music.tracks[tr].push(cell ? { note: cell.note, octave: cell.octave, duration: Math.round(beatMs) } : { note: "REST", octave: 4, duration: Math.round(beatMs) });
      }
    });
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    music.tempo = p.tempo;
    music.steps = p.steps;
    music.loopA = p.loopA;
    music.loopB = p.loopB;
    music.loops = { A: p.loopA, B: p.loopB };
    music.preset = name;
    music.grid = { A: new Array(p.steps).fill(null), B: new Array(p.steps).fill(null) };
    ["A", "B"].forEach(tr => {
      if (!p.seed[tr]) return;
      for (let i = 0; i < p.seed[tr].length && i < p.steps; i++) {
        const s = p.seed[tr][i];
        if (s) music.grid[tr][i] = { note: s[0], octave: s[1] };
      }
    });
    rebuildTracksFromGrid();
    buildPanel(true);
    notifyDirty();
  }

  function nextTrackId() {
    const used = new Set(getTrackIds());
    for (const id of TRACK_ORDER) if (!used.has(id)) return id;
    return null;
  }

  function addTrack() {
    const id = nextTrackId();
    if (!id) { alert("Limite atteinte : impossible d'ajouter plus de 26 tracks."); return; }
    music.grid[id] = new Array(music.steps).fill(null);
    if (!music.tracks) music.tracks = {};
    music.tracks[id] = [];
    if (!music.loops) music.loops = {};
    music.loops[id] = true;
    state.activeOsc[id] = null;
    rebuildTracksFromGrid();
    buildPanel(true);
    notifyDirty();
  }

  function deleteTrack(track) {
    if (track === "A" || track === "B") {
      alert("Les tracks A et B sont conservées pour la compatibilité ESP32.");
      return;
    }
    if (!confirm(`Supprimer la track ${track} ?`)) return;
    stopTrack(track);
    delete music.grid[track];
    if (music.tracks) delete music.tracks[track];
    if (music.loops) delete music.loops[track];
    buildPanel(true);
    rebuildTracksFromGrid();
    notifyDirty();
  }

  function buildPanel(force = false) {
    panel = $$("musicPanel");
    if (!panel) return;

    // Correction importante : ne pas reconstruire le DOM quand le champ Nom a le focus.
    // Sinon chaque frappe recrée l'input et l'utilisateur ne peut pas écrire.
    if (!force && panel.dataset.built === "1" && $$("meName")) {
      renderAll();
      return;
    }

    panel.dataset.built = "1";
    const tracksHtml = getTrackIds().map(renderTrackBox).join("");
    panel.innerHTML = `
      <div class="help-box">
        <strong>Music Editor V1.4 :</strong> piano roll multi-tracks. A/B restent les deux buzzers principaux,
        mais tu peux ajouter des tracks C/D/... pour composer plus facilement dans le simulateur.
      </div>
      <div class="me-controls">
        <div class="me-ctrl-group">
          <label>Nom</label>
          <input id="meName" type="text" value="${escapeHtml(music.name || "theme_01")}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="me-ctrl-group">
          <label>Preset</label>
          <select id="mePreset">
            ${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${music.preset === k ? "selected" : ""}>${v.label}</option>`).join("")}
          </select>
        </div>
        <div class="me-ctrl-group">
          <label>Tempo BPM <strong id="meTempoLbl">${music.tempo}</strong></label>
          <input id="meTempo" type="range" min="40" max="280" step="5" value="${music.tempo}" />
        </div>
        <div class="me-ctrl-group">
          <label>Steps <strong id="meStepsLbl">${music.steps}</strong></label>
          <input id="meSteps" type="range" min="4" max="64" step="4" value="${music.steps}" />
        </div>
        <div class="me-ctrl-group">
          <button id="meAddTrack" class="primary me-add-track">➕ Ajouter track</button>
          <button id="mePlay" class="primary me-play">▶ PLAY</button>
          <button id="meStop" class="secondary me-stop">■ STOP</button>
          <button id="meRewind" class="secondary">⏮</button>
          <button id="meClear" class="secondary me-danger">🗑 Clear toutes tracks</button>
        </div>
      </div>
      <div class="me-tracks">${tracksHtml}</div>
      <div class="me-stats" id="meStats"></div>
    `;

    wireEvents();
    renderAll();
  }

  function renderTrackBox(track) {
    const deletable = track !== "A" && track !== "B";
    return `
      <div class="me-track-box" data-track="${track}">
        <div class="me-track-head">
          <h3>${trackLabel(track)}</h3>
          <div class="me-track-tools">
            <label class="me-check"><input class="meLoop" data-track="${track}" type="checkbox" ${getTrackLoop(track) ? "checked" : ""}> 🔁 Loop ${track}</label>
            <span class="me-track-status" id="meStatus${track}">—</span>
            ${deletable ? `<button class="secondary me-delete-track" data-track="${track}" title="Supprimer cette track">✕</button>` : ""}
          </div>
        </div>
        <div class="me-grid-wrap">
          <div class="me-piano" id="mePiano${track}"></div>
          <div class="me-grid-scroll">
            <div class="me-grid" id="meGrid${track}"></div>
            <div class="me-playhead" id="mePlayhead${track}"></div>
          </div>
        </div>
      </div>
    `;
  }

  function wireEvents() {
    const nameInput = $$("meName");
    if (nameInput) {
      // Correction : stopPropagation empêche les raccourcis clavier globaux du studio
      // de capturer les touches pendant que l'utilisateur écrit le nom.
      ["keydown", "keypress", "keyup", "input", "click", "mousedown"].forEach(evt => {
        nameInput.addEventListener(evt, e => e.stopPropagation());
      });
      nameInput.addEventListener("input", e => {
        music.name = e.target.value;
        updateStats();
        notifyDirty();
      });
    }

    const preset = $$("mePreset");
    if (preset) preset.onchange = e => applyPreset(e.target.value);

    const tempo = $$("meTempo");
    if (tempo) tempo.oninput = e => {
      music.tempo = Number(e.target.value);
      const lbl = $$("meTempoLbl");
      if (lbl) lbl.textContent = music.tempo;
      rebuildTracksFromGrid();
      updateStats();
      notifyDirty();
    };

    const steps = $$("meSteps");
    if (steps) steps.oninput = e => {
      music.steps = Number(e.target.value);
      const lbl = $$("meStepsLbl");
      if (lbl) lbl.textContent = music.steps;
      syncGridLength(music.steps);
      renderGrids();
      rebuildTracksFromGrid();
      updateStats();
      notifyDirty();
    };

    panel.querySelectorAll(".meLoop").forEach(cb => {
      cb.onchange = e => setTrackLoop(e.target.dataset.track, e.target.checked);
    });
    panel.querySelectorAll(".me-delete-track").forEach(btn => {
      btn.onclick = () => deleteTrack(btn.dataset.track);
    });

    const add = $$("meAddTrack");
    if (add) add.onclick = addTrack;
    const play = $$("mePlay");
    if (play) play.onclick = togglePlay;
    const stop = $$("meStop");
    if (stop) stop.onclick = stopPlay;
    const rewind = $$("meRewind");
    if (rewind) rewind.onclick = () => { state.playhead = 0; updatePlayhead(); };
    const clear = $$("meClear");
    if (clear) clear.onclick = () => {
      if (!confirm("Effacer toutes les tracks ?")) return;
      getTrackIds().forEach(tr => { music.grid[tr] = new Array(music.steps).fill(null); });
      renderGrids();
      rebuildTracksFromGrid();
      updateStats();
      notifyDirty();
    };
  }

  function renderAll() {
    getTrackIds().forEach(renderPianoLabels);
    renderGrids();
    updatePlayhead();
    updateStats();
  }

  function renderPianoLabels(track) {
    const el = $$("mePiano" + track);
    if (!el) return;
    el.innerHTML = "";
    for (let oct = OCTAVE_HIGH; oct >= OCTAVE_LOW; oct--) {
      for (let n = 11; n >= 0; n--) {
        const key = document.createElement("div");
        key.className = "me-key" + (SHARPS[n] ? " sharp" : "");
        if (n === 0) key.textContent = NOTE_NAMES[n] + oct;
        el.appendChild(key);
      }
    }
  }

  function renderGrids() { getTrackIds().forEach(renderGrid); }

  function renderGrid(track) {
    const el = $$("meGrid" + track);
    if (!el) return;
    el.innerHTML = "";
    el.style.gridTemplateColumns = `repeat(${music.steps}, 22px)`;
    el.style.width = (music.steps * 22) + "px";
    const playheadEl = $$("mePlayhead" + track);
    if (playheadEl) playheadEl.style.height = (TOTAL_ROWS * 14) + "px";

    for (let oct = OCTAVE_HIGH; oct >= OCTAVE_LOW; oct--) {
      for (let n = 11; n >= 0; n--) {
        for (let step = 0; step < music.steps; step++) {
          const cell = document.createElement("div");
          cell.className = "me-cell";
          if (SHARPS[n]) cell.classList.add("sharp-row");
          if (step % 4 === 0) cell.classList.add("beat-line");
          if (step % 16 === 0 && step > 0) cell.classList.add("bar-line");
          const noteName = NOTE_NAMES[n];
          const active = music.grid[track] && music.grid[track][step];
          if (active && active.note === noteName && active.octave === oct) {
            cell.classList.add("active");
            cell.classList.add("active-" + track);
          }
          cell.dataset.step = step;
          cell.dataset.note = noteName;
          cell.dataset.octave = oct;
          cell.onclick = () => toggleCell(track, step, noteName, oct);
          el.appendChild(cell);
        }
      }
    }
  }

  function toggleCell(track, step, note, octave) {
    if (!music.grid[track]) music.grid[track] = new Array(music.steps).fill(null);
    const cur = music.grid[track][step];
    if (cur && cur.note === note && cur.octave === octave) music.grid[track][step] = null;
    else {
      music.grid[track][step] = { note, octave };
      if (state.audioCtx) playPreviewNote(track, note, octave, 80);
    }
    renderGrid(track);
    rebuildTracksFromGrid();
    updateStats();
    notifyDirty();
  }

  function updatePlayhead() {
    if (!panel) return;
    const x = state.playhead * 22;
    getTrackIds().forEach(tr => {
      const ph = $$("mePlayhead" + tr);
      if (ph) ph.style.left = x + "px";
    });
    panel.querySelectorAll(".me-grid-scroll").forEach(w => {
      const visible = w.scrollLeft + w.clientWidth;
      if (x > visible - 60) w.scrollLeft = x - w.clientWidth + 60;
      if (x < w.scrollLeft) w.scrollLeft = x;
    });
  }

  function updateStats() {
    const box = $$("meStats");
    if (!box || typeof music === "undefined") return;
    const ids = getTrackIds();
    let totalNotes = 0;
    const notesByTrack = ids.map(tr => {
      const count = (music.grid[tr] || []).filter(Boolean).length;
      totalNotes += count;
      return `<span><strong>${tr} :</strong> ${count} notes</span>`;
    }).join("");
    const beatMs = 60000 / music.tempo / 4;
    const totalMs = music.steps * beatMs;
    const bytes = totalNotes * 6 + 16;
    const m = Math.floor(totalMs / 60000);
    const s = ((totalMs % 60000) / 1000).toFixed(1);
    box.innerHTML = `
      <span><strong>Nom :</strong> ${escapeHtml(music.name || "theme_01")}</span>
      ${notesByTrack}
      <span><strong>Durée :</strong> ${m > 0 ? m + "m " : ""}${s}s</span>
      <span><strong>Steps :</strong> ${music.steps}</span>
      <span><strong>BPM :</strong> ${music.tempo}</span>
      <span><strong>Tracks :</strong> ${ids.length}</span>
      <span><strong>Taille :</strong> ${bytes} o</span>
    `;
    if (typeof updateCapacityBar === "function") updateCapacityBar();
  }

  function ensureAudio() {
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new Ctx();
    }
    if (state.audioCtx && state.audioCtx.state === "suspended") state.audioCtx.resume().catch(() => {});
    return state.audioCtx;
  }

  function noteFreqOf(note, octave) {
    const base = NOTE_FREQ_O4[note];
    if (!base) return 0;
    return base * Math.pow(2, octave - 4);
  }

  function playPreviewNote(track, note, octave, ms) {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = noteFreqOf(note, octave);
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + ms / 1000);
  }

  function togglePlay() { state.isPlaying ? stopPlay() : startPlay(); }

  function startPlay() {
    ensureAudio();
    state.isPlaying = true;
    state.playStart = performance.now();
    state.playhead = 0;
    state.lastStep = -1;
    const btn = $$("mePlay");
    if (btn) btn.textContent = "⏸ PAUSE";
    tick();
  }

  function stopTrack(track) {
    if (state.activeOsc[track]) {
      try { state.activeOsc[track].osc.stop(); } catch (_) {}
      state.activeOsc[track] = null;
    }
  }

  function stopPlay() {
    state.isPlaying = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    getTrackIds().forEach(stopTrack);
    const btn = $$("mePlay");
    if (btn) btn.textContent = "▶ PLAY";
    getTrackIds().forEach(tr => {
      const status = $$("meStatus" + tr);
      if (status) status.textContent = "—";
    });
  }

  function tick() {
    if (!state.isPlaying) return;
    const beatMs = 60000 / music.tempo / 4;
    const elapsed = performance.now() - state.playStart;
    const rawStep = Math.floor(elapsed / beatMs);
    const ids = getTrackIds();
    const allDone = ids.every(tr => !getTrackLoop(tr) && rawStep >= music.steps);
    if (allDone) { stopPlay(); return; }

    if (rawStep !== state.lastStep) {
      state.lastStep = rawStep;
      state.playhead = rawStep % music.steps;
      ids.forEach(tr => {
        const done = !getTrackLoop(tr) && rawStep >= music.steps;
        const step = getTrackLoop(tr) ? rawStep % music.steps : rawStep;
        handleTrackStep(tr, step, done, beatMs);
      });
      updatePlayhead();
      highlightCurrentStep();
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function handleTrackStep(track, step, done, beatMs) {
    if (done || step < 0 || step >= music.steps) return;
    const ctx = state.audioCtx;
    const cell = music.grid[track] && music.grid[track][step];
    const status = $$("meStatus" + track);
    stopTrack(track);
    if (cell) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = noteFreqOf(cell.note, cell.octave);
      gain.gain.value = 0.045;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      try { osc.stop(ctx.currentTime + (beatMs * 0.9) / 1000); } catch (_) {}
      state.activeOsc[track] = { osc, gain };
      if (status) status.textContent = cell.note + cell.octave;
    } else if (status) status.textContent = "·";
  }

  function highlightCurrentStep() {
    if (!panel) return;
    panel.querySelectorAll(".me-cell.playing").forEach(c => c.classList.remove("playing"));
    panel.querySelectorAll(`.me-cell[data-step="${state.playhead}"]`).forEach(c => c.classList.add("playing"));
  }

  window.LumaMusicEditor = {
    init: () => { ensureModel(); buildPanel(false); },
    refresh: () => { ensureModel(); renderAll(); },
    stop: stopPlay,
    rebuildTracksFromGrid,
    addTrack,
    getByteSize: () => {
      ensureModel();
      const notes = getTrackIds().reduce((sum, tr) => sum + (music.grid[tr] || []).filter(Boolean).length, 0);
      return notes * 6 + 16;
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      if (btn.dataset.panel === "musicPanel") {
        btn.addEventListener("click", () => setTimeout(() => window.LumaMusicEditor.init(), 30));
      }
    });
  });
})();
