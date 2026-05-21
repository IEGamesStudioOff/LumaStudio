// =============================================================================
// LUMA STUDIO — MUSIC EDITOR (V1.3) — Piano Roll
// =============================================================================
// Refonte complète : grille piano roll, 2 tracks (Buzzer A + Buzzer B),
// playhead animé, presets sonores, loop indépendant par track, stats live.
// Contrainte hardware : 2 buzzers piézo monophoniques sur ESP32 (LEDC PWM).
// =============================================================================

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------------
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SHARPS = [false, true, false, true, false, false, true, false, true, false, true, false];

  // Fréquences pour octave 4 (Hz), seront *2 pour octave +1, /2 pour -1
  const NOTE_FREQ_O4 = {
    "C":  261.63, "C#": 277.18, "D":  293.66, "D#": 311.13,
    "E":  329.63, "F":  349.23, "F#": 369.99, "G":  392.00,
    "G#": 415.30, "A":  440.00, "A#": 466.16, "B":  493.88
  };

  // Octaves visibles : 3 octaves (C3 → B5). Le buzzer piézo monte mal en C2.
  const OCTAVE_LOW = 3;
  const OCTAVE_HIGH = 5;
  const TOTAL_ROWS = (OCTAVE_HIGH - OCTAVE_LOW + 1) * 12; // 36 lignes

  // Presets pensés Luma : utilisent un tempo et un nb de steps cohérents.
  const PRESETS = {
    main_theme: {
      label: "🎶 Main Theme",
      tempo: 120, steps: 32, loopA: true, loopB: true,
      seed: { A: [["C",4],["E",4],["G",4],["C",5],null,["G",4],["E",4],["C",4]], B: [["C",3],null,["G",3],null,["C",3],null,["G",3],null] }
    },
    boss_theme: {
      label: "👹 Boss Theme",
      tempo: 160, steps: 32, loopA: true, loopB: true,
      seed: { A: [["D",4],["F",4],["A",4],["F",4],["D",4],["F",4],["A",4],["C",5]], B: [["D",3],["D",3],null,["A",2] ] }
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

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const state = {
    isPlaying: false,
    playStart: 0,
    playhead: 0,    // step en cours
    audioCtx: null,
    activeOsc: { A: null, B: null }, // oscillateur en cours par track
    rafId: 0
  };

  // ---------------------------------------------------------------------------
  // MUSIC DATA MODEL (partagé avec app.js via global `music`)
  //   music = {
  //     name, tempo, steps, loopA, loopB, preset,
  //     grid: { A: [step → {note, octave} | null], B: [...] }
  //   }
  // Pour rétrocompat : on sauvegarde aussi `tracks: { A: [{note, octave, duration}], B: [...] }`
  // ---------------------------------------------------------------------------
  function ensureModel() {
    if (typeof music === "undefined") return;
    if (!music.steps) music.steps = 16;
    if (!music.grid) {
      music.grid = { A: new Array(music.steps).fill(null), B: new Array(music.steps).fill(null) };
      // migration depuis l'ancien format tracks → grid si possible
      if (music.tracks && Array.isArray(music.tracks.A)) {
        let pos = 0;
        for (const note of music.tracks.A) {
          if (pos >= music.steps) break;
          if (note.note !== "REST") music.grid.A[pos] = { note: note.note, octave: note.octave };
          pos++;
        }
      }
    }
    if (typeof music.loopA !== "boolean") music.loopA = true;
    if (typeof music.loopB !== "boolean") music.loopB = false;
    if (!music.preset) music.preset = "blank";
    // resize grids si steps a changé
    syncGridLength(music.steps);
  }

  function syncGridLength(steps) {
    ["A", "B"].forEach(tr => {
      const g = music.grid[tr];
      if (g.length < steps) {
        while (g.length < steps) g.push(null);
      } else if (g.length > steps) {
        g.length = steps;
      }
    });
  }

  // Reconstruit music.tracks (format ESP32) depuis music.grid
  function rebuildTracksFromGrid() {
    const beatMs = 60000 / music.tempo / 4; // 1 step = 1/16ème de noir
    ["A", "B"].forEach(tr => {
      music.tracks[tr] = [];
      let i = 0;
      while (i < music.steps) {
        const cell = music.grid[tr][i];
        // Trouve la longueur de hold (cellules vides après une note non vide en V1.3 simple = on émet chaque cellule comme 1 step)
        if (cell) {
          music.tracks[tr].push({ note: cell.note, octave: cell.octave, duration: Math.round(beatMs) });
        } else {
          music.tracks[tr].push({ note: "REST", octave: 4, duration: Math.round(beatMs) });
        }
        i++;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // PRESET APPLY
  // ---------------------------------------------------------------------------
  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    music.tempo = p.tempo;
    music.steps = p.steps;
    music.loopA = p.loopA;
    music.loopB = p.loopB;
    music.preset = name;
    music.grid = { A: new Array(p.steps).fill(null), B: new Array(p.steps).fill(null) };
    ["A", "B"].forEach(tr => {
      if (!p.seed[tr]) return;
      for (let i = 0; i < p.seed[tr].length && i < p.steps; i++) {
        const s = p.seed[tr][i];
        if (s) music.grid[tr][i] = { note: s[0], octave: s[1] };
      }
    });
    renderAll();
    rebuildTracksFromGrid();
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  let panel, gridAEl, gridBEl, headerEl, statsEl, playheadEl;

  function $$(id) { return document.getElementById(id); }

  function buildPanel() {
    panel = $$("musicPanel");
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = "1";
    panel.innerHTML = `
      <div class="help-box">
        <strong>Music Editor V1.3 :</strong> piano roll pour 2 buzzers piézo. Clique sur une case
        pour activer/désactiver une note. Aiguille de lecture en temps réel.
      </div>
      <div class="me-controls">
        <div class="me-ctrl-group">
          <label>Nom</label>
          <input id="meName" value="${music.name || "theme_01"}" />
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
        <div class="me-ctrl-group me-loop">
          <label class="me-check"><input id="meLoopA" type="checkbox" ${music.loopA ? "checked" : ""}> 🔁 Loop A</label>
          <label class="me-check"><input id="meLoopB" type="checkbox" ${music.loopB ? "checked" : ""}> 🔁 Loop B</label>
        </div>
        <div class="me-ctrl-group">
          <button id="mePlay" class="primary me-play">▶ PLAY</button>
          <button id="meStop" class="secondary me-stop">■ STOP</button>
          <button id="meRewind" class="secondary">⏮</button>
          <button id="meClear" class="secondary me-danger">🗑 Clear A+B</button>
        </div>
      </div>
      <div class="me-tracks">
        <div class="me-track-box">
          <div class="me-track-head">
            <h3>🔊 BUZZER A (mélodie)</h3>
            <span class="me-track-status" id="meStatusA">—</span>
          </div>
          <div class="me-grid-wrap">
            <div class="me-piano" id="mePianoA"></div>
            <div class="me-grid-scroll">
              <div class="me-grid" id="meGridA"></div>
              <div class="me-playhead" id="mePlayheadA"></div>
            </div>
          </div>
        </div>
        <div class="me-track-box">
          <div class="me-track-head">
            <h3>🔉 BUZZER B (basse / harmonie)</h3>
            <span class="me-track-status" id="meStatusB">—</span>
          </div>
          <div class="me-grid-wrap">
            <div class="me-piano" id="mePianoB"></div>
            <div class="me-grid-scroll">
              <div class="me-grid" id="meGridB"></div>
              <div class="me-playhead" id="mePlayheadB"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="me-stats" id="meStats"></div>
    `;

    // wire events
    $$("meName").oninput = (e) => { music.name = e.target.value; updateStats(); };
    $$("mePreset").onchange = (e) => applyPreset(e.target.value);
    $$("meTempo").oninput = (e) => {
      music.tempo = Number(e.target.value);
      $$("meTempoLbl").textContent = music.tempo;
      rebuildTracksFromGrid();
      updateStats();
    };
    $$("meSteps").oninput = (e) => {
      music.steps = Number(e.target.value);
      $$("meStepsLbl").textContent = music.steps;
      syncGridLength(music.steps);
      renderGrids();
      rebuildTracksFromGrid();
      updateStats();
    };
    $$("meLoopA").onchange = (e) => { music.loopA = e.target.checked; };
    $$("meLoopB").onchange = (e) => { music.loopB = e.target.checked; };
    $$("mePlay").onclick = togglePlay;
    $$("meStop").onclick = stopPlay;
    $$("meRewind").onclick = () => { state.playhead = 0; updatePlayhead(); };
    $$("meClear").onclick = () => {
      if (!confirm("Effacer les 2 tracks ?")) return;
      music.grid.A = new Array(music.steps).fill(null);
      music.grid.B = new Array(music.steps).fill(null);
      renderGrids();
      rebuildTracksFromGrid();
      updateStats();
    };

    renderAll();
  }

  function renderAll() {
    renderPianoLabels("A");
    renderPianoLabels("B");
    renderGrids();
    updatePlayhead();
    updateStats();
  }

  function renderPianoLabels(track) {
    const el = $$("mePiano" + track);
    if (!el) return;
    el.innerHTML = "";
    // Du haut (octave HIGH, B) vers le bas (octave LOW, C)
    for (let oct = OCTAVE_HIGH; oct >= OCTAVE_LOW; oct--) {
      for (let n = 11; n >= 0; n--) {
        const key = document.createElement("div");
        key.className = "me-key" + (SHARPS[n] ? " sharp" : "");
        // labels uniquement sur les C et octave change
        if (n === 0) key.textContent = NOTE_NAMES[n] + oct;
        el.appendChild(key);
      }
    }
  }

  function renderGrids() {
    renderGrid("A");
    renderGrid("B");
  }

  function renderGrid(track) {
    const el = $$("meGrid" + track);
    if (!el) return;
    el.innerHTML = "";
    el.style.gridTemplateColumns = `repeat(${music.steps}, 22px)`;
    // largeur fixe pour le scroll
    el.style.width = (music.steps * 22) + "px";
    const playheadEl = $$("mePlayhead" + track);
    if (playheadEl) playheadEl.style.height = (TOTAL_ROWS * 14) + "px";

    // Construction top-down (B5 → C3)
    for (let oct = OCTAVE_HIGH; oct >= OCTAVE_LOW; oct--) {
      for (let n = 11; n >= 0; n--) {
        for (let step = 0; step < music.steps; step++) {
          const cell = document.createElement("div");
          cell.className = "me-cell";
          if (SHARPS[n]) cell.classList.add("sharp-row");
          if (step % 4 === 0) cell.classList.add("beat-line");
          if (step % 16 === 0 && step > 0) cell.classList.add("bar-line");

          const noteName = NOTE_NAMES[n];
          const active = music.grid[track][step];
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
    const cur = music.grid[track][step];
    if (cur && cur.note === note && cur.octave === octave) {
      music.grid[track][step] = null;
    } else {
      music.grid[track][step] = { note, octave };
      // bip court de feedback
      if (state.audioCtx) playPreviewNote(track, note, octave, 80);
    }
    renderGrid(track);
    rebuildTracksFromGrid();
    updateStats();
    // V1.5.6 — sync la barre de capacité globale
    if (typeof window.updateCapacityBar === "function") window.updateCapacityBar();
  }

  function updatePlayhead() {
    const pa = $$("mePlayheadA"), pb = $$("mePlayheadB");
    if (!pa || !pb) return;
    const x = state.playhead * 22;
    pa.style.left = x + "px";
    pb.style.left = x + "px";
    // scroll auto
    const wraps = panel.querySelectorAll(".me-grid-scroll");
    wraps.forEach(w => {
      const visible = w.scrollLeft + w.clientWidth;
      if (x > visible - 60) w.scrollLeft = x - w.clientWidth + 60;
      if (x < w.scrollLeft) w.scrollLeft = x;
    });
  }

  function updateStats() {
    if (!$$("meStats")) return;
    const notesA = music.grid.A.filter(c => c).length;
    const notesB = music.grid.B.filter(c => c).length;
    const beatMs = 60000 / music.tempo / 4;
    const totalMs = music.steps * beatMs;
    // Taille : chaque note = ~6 octets dans le binaire compilé (note u8, octave u8, dur u16, flags u16)
    const bytes = (notesA + notesB) * 6 + 16; // + header
    const m = Math.floor(totalMs / 60000);
    const s = ((totalMs % 60000) / 1000).toFixed(1);

    $$("meStats").innerHTML = `
      <span><strong>A :</strong> ${notesA} notes</span>
      <span><strong>B :</strong> ${notesB} notes</span>
      <span><strong>Durée :</strong> ${m > 0 ? m + "m " : ""}${s}s</span>
      <span><strong>Steps :</strong> ${music.steps}</span>
      <span><strong>BPM :</strong> ${music.tempo}</span>
      <span><strong>Taille :</strong> ${bytes} o</span>
      <span><strong>Loop A :</strong> ${music.loopA ? "🔁" : "→"}</span>
      <span><strong>Loop B :</strong> ${music.loopB ? "🔁" : "→"}</span>
    `;
    // notifie la capacity bar
    if (typeof updateCapacityBar === "function") updateCapacityBar();
  }

  // ---------------------------------------------------------------------------
  // AUDIO PLAYBACK — Web Audio square waves (vraie forme buzzer piézo)
  // ---------------------------------------------------------------------------
  function ensureAudio() {
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new Ctx();
    }
    return state.audioCtx;
  }

  function noteFreqOf(note, octave) {
    const base = NOTE_FREQ_O4[note];
    if (!base) return 0;
    const diff = octave - 4;
    return base * Math.pow(2, diff);
  }

  function playPreviewNote(track, note, octave, ms) {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = noteFreqOf(note, octave);
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + ms / 1000);
  }

  function togglePlay() {
    if (state.isPlaying) stopPlay();
    else startPlay();
  }

  function startPlay() {
    const ctx = ensureAudio();
    state.isPlaying = true;
    state.playStart = performance.now();
    state.playhead = 0;
    $$("mePlay").textContent = "⏸ PAUSE";
    tick();
  }

  function stopPlay() {
    state.isPlaying = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    // stop tous les oscillateurs en cours
    if (state.audioCtx) {
      ["A", "B"].forEach(tr => {
        if (state.activeOsc[tr]) {
          try { state.activeOsc[tr].osc.stop(); } catch (_) {}
          state.activeOsc[tr] = null;
        }
      });
    }
    if ($$("mePlay")) $$("mePlay").textContent = "▶ PLAY";
    if ($$("meStatusA")) $$("meStatusA").textContent = "—";
    if ($$("meStatusB")) $$("meStatusB").textContent = "—";
  }

  let lastStep = -1;
  function tick() {
    if (!state.isPlaying) return;
    const ctx = state.audioCtx;
    const beatMs = 60000 / music.tempo / 4;
    const elapsed = performance.now() - state.playStart;
    const step = Math.floor(elapsed / beatMs);

    // Gestion fin de séquence avec loop indépendant
    const maxSteps = music.steps;
    const playA_step = music.loopA ? step % maxSteps : step;
    const playB_step = music.loopB ? step % maxSteps : step;
    const aDone = !music.loopA && playA_step >= maxSteps;
    const bDone = !music.loopB && playB_step >= maxSteps;
    if (aDone && bDone) { stopPlay(); return; }

    // ne déclenche le son que sur changement de step
    if (step !== lastStep) {
      lastStep = step;
      state.playhead = music.loopA ? playA_step : Math.min(playA_step, maxSteps - 1);

      // TRACK A
      handleTrackStep("A", playA_step, aDone);
      // TRACK B
      handleTrackStep("B", playB_step, bDone);

      updatePlayhead();
      // highlight la cellule courante
      highlightCurrentStep();
    }

    state.rafId = requestAnimationFrame(tick);
  }

  function handleTrackStep(track, step, done) {
    if (done) return;
    const ctx = state.audioCtx;
    const cell = music.grid[track][step];
    const status = $$("meStatus" + track);

    // Coupe l'oscillateur précédent
    if (state.activeOsc[track]) {
      try { state.activeOsc[track].osc.stop(ctx.currentTime + 0.01); } catch (_) {}
      state.activeOsc[track] = null;
    }

    if (cell) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = noteFreqOf(cell.note, cell.octave);
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      state.activeOsc[track] = { osc, gain };
      if (status) status.textContent = cell.note + cell.octave;
    } else {
      if (status) status.textContent = "·";
    }
  }

  function highlightCurrentStep() {
    panel.querySelectorAll(".me-cell.playing").forEach(c => c.classList.remove("playing"));
    const step = state.playhead;
    panel.querySelectorAll(`.me-cell[data-step="${step}"]`).forEach(c => c.classList.add("playing"));
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  window.LumaMusicEditor = {
    init: () => { ensureModel(); buildPanel(); },
    refresh: renderAll,
    stop: stopPlay,
    rebuildTracksFromGrid: rebuildTracksFromGrid,
    getByteSize: () => {
      ensureModel();
      const notesA = music.grid.A.filter(c => c).length;
      const notesB = music.grid.B.filter(c => c).length;
      return (notesA + notesB) * 6 + 16;
    }
  };

  // Initialise quand on entre dans le panel
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      if (btn.dataset.panel === "musicPanel") {
        btn.addEventListener("click", () => setTimeout(() => window.LumaMusicEditor.init(), 30));
      }
    });
  });
})();
