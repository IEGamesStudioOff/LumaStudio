
import { showScreen } from "./navigation.js";

const NOTES = ["REST", "C", "D", "E", "F", "G", "A", "B"];
const OCTAVES = [2, 3, 4, 5, 6];
const DURATIONS = [1, 2, 4, 8]; // unité logique : 1=double-croche, 2=croche, 4=noire, 8=blanche

let songs = [];
let currentId = null;
let audioCtx = null;
let timers = [];

function uid(prefix = "song") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultNote() {
  return { note: "REST", octave: 4, duration: 1, effect: 0 };
}

function createSong(name = "theme_001", tempo = 120, steps = 32) {
  return {
    id: uid("music"),
    name,
    tempo: Number(tempo),
    steps: Number(steps),
    tracks: {
      A: Array.from({ length: Number(steps) }, defaultNote),
      B: Array.from({ length: Number(steps) }, defaultNote)
    }
  };
}

function ensureSongShape(song) {
  song.steps = Number(song.steps || 32);
  song.tempo = Number(song.tempo || 120);
  song.tracks ||= {};
  for (const t of ["A", "B"]) {
    song.tracks[t] ||= [];
    while (song.tracks[t].length < song.steps) song.tracks[t].push(defaultNote());
    if (song.tracks[t].length > song.steps) song.tracks[t].length = song.steps;
  }
  return song;
}

export function initMusicEditor() {
  const back = document.getElementById("musicBack");
  const backAsset = document.getElementById("musicBackAsset");
  if (!back) return;

  back.addEventListener("click", () => showScreen("assetLab"));
  backAsset.addEventListener("click", () => showScreen("assetLab"));

  document.getElementById("musicNew").addEventListener("click", () => {
    const s = createSong(`theme_${String(songs.length + 1).padStart(3, "0")}`, 120, 32);
    songs.push(s);
    currentId = s.id;
    renderAll();
  });

  document.getElementById("musicDelete").addEventListener("click", () => {
    if (!currentId) return;
    songs = songs.filter(s => s.id !== currentId);
    currentId = songs[0]?.id || null;
    renderAll();
  });

  document.getElementById("musicApply").addEventListener("click", applySettings);
  document.getElementById("songSteps").addEventListener("change", applySettings);

  document.getElementById("musicPlay").addEventListener("click", playCurrentSong);
  document.getElementById("musicStop").addEventListener("click", stopPlayback);

  document.getElementById("musicLoad").addEventListener("click", async () => {
    const result = await window.lumaAPI.loadMusic();
    if (!result.ok) return alert(result.error || "Erreur chargement musique.");
    songs = (result.songs || []).map(ensureSongShape);
    if (!songs.length) songs = [createSong()];
    currentId = songs[0].id;
    renderAll();
  });

  document.getElementById("musicSave").addEventListener("click", async () => {
    applySettings(false);
    const result = await window.lumaAPI.saveMusic(songs);
    if (!result.ok) return alert(result.error || "Erreur sauvegarde musique.");
    alert(`Musique sauvegardée : ${result.path}`);
  });

  document.getElementById("musicExport").addEventListener("click", async () => {
    applySettings(false);
    const result = await window.lumaAPI.exportMusic(songs);
    if (!result.ok) return alert(result.error || "Erreur export musique.");
    alert(`Export créé :\n${result.textPath}\n${result.binaryPath}\n${formatBytes(result.bytes)}`);
  });

  songs = [createSong()];
  currentId = songs[0].id;
  renderAll();
}

export function openMusicEditor() {
  if (!songs.length) {
    songs = [createSong()];
    currentId = songs[0].id;
  }
  renderAll();
  showScreen("musicEditor");
}

function getCurrentSong() {
  return ensureSongShape(songs.find(s => s.id === currentId) || songs[0]);
}

function applySettings(doRender = true) {
  const song = getCurrentSong();
  if (!song) return;
  song.name = document.getElementById("songName").value.trim() || "theme_001";
  song.tempo = Math.max(40, Math.min(240, Number(document.getElementById("songTempo").value || 120)));
  const newSteps = Number(document.getElementById("songSteps").value || 32);
  if (newSteps !== song.steps) {
    song.steps = newSteps;
    ensureSongShape(song);
  }
  if (doRender) renderAll();
}

function renderAll() {
  renderSongList();
  renderSettings();
  renderGrid();
  updateMemory();
}

function renderSongList() {
  const list = document.getElementById("musicList");
  if (!list) return;
  list.innerHTML = "";
  songs.forEach(song => {
    const item = document.createElement("div");
    item.className = `music-item ${song.id === currentId ? "active" : ""}`;
    item.innerHTML = `<strong>${escapeHtml(song.name)}</strong><span>${song.tempo} BPM · ${song.steps} steps</span>`;
    item.addEventListener("click", () => { currentId = song.id; renderAll(); });
    list.appendChild(item);
  });
}

function renderSettings() {
  const song = getCurrentSong();
  if (!song) return;
  document.getElementById("songName").value = song.name;
  document.getElementById("songTempo").value = song.tempo;
  document.getElementById("songSteps").value = String(song.steps);
}

function renderGrid() {
  const song = getCurrentSong();
  const grid = document.getElementById("musicGrid");
  if (!grid || !song) return;
  grid.innerHTML = "";

  for (let i = 0; i < song.steps; i++) {
    const tr = document.createElement("tr");
    tr.appendChild(cell(`#${String(i).padStart(2, "0")}`, "step-cell"));

    for (const trackName of ["A", "B"]) {
      const note = song.tracks[trackName][i];
      tr.appendChild(selectCell(NOTES, note.note, (v) => { note.note = v; updateMemory(); }));
      tr.appendChild(selectCell(OCTAVES, String(note.octave), (v) => { note.octave = Number(v); }));
      tr.appendChild(selectCell(DURATIONS, String(note.duration), (v) => { note.duration = Number(v); updateMemory(); }));
    }
    grid.appendChild(tr);
  }
}

function cell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function selectCell(values, selected, onChange) {
  const td = document.createElement("td");
  const sel = document.createElement("select");
  values.forEach(value => {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = String(value);
    if (String(value) === String(selected)) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => onChange(sel.value));
  td.appendChild(sel);
  return td;
}

function updateMemory() {
  const totalSteps = songs.reduce((sum, s) => sum + (Number(s.steps || 32) * 2), 0);
  const bytes = 8 + songs.reduce((sum, s) => sum + 16 + 2 + 2 + (Number(s.steps || 32) * 2 * 4), 0);
  document.getElementById("musicCount").textContent = String(songs.length);
  document.getElementById("musicStepsInfo").textContent = String(totalSteps);
  document.getElementById("musicBytes").textContent = formatBytes(bytes);
  const pct = Math.min(100, Math.round((bytes / (32 * 1024)) * 100));
  const bar = document.getElementById("musicMemBar");
  if (bar) bar.style.width = `${pct}%`;
}

function noteFrequency(note, octave) {
  if (note === "REST") return 0;
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const a4 = 440;
  const n = semis[note] + (Number(octave) - 4) * 12;
  return a4 * Math.pow(2, n / 12);
}

function playCurrentSong() {
  stopPlayback();
  const song = getCurrentSong();
  if (!song) return;
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const beatMs = 60000 / song.tempo;
  const unitMs = beatMs / 4; // duration=4 vaut environ une noire
  let timelineMs = 0;

  for (let i = 0; i < song.steps; i++) {
    const durationUnits = Math.max(song.tracks.A[i].duration || 1, song.tracks.B[i].duration || 1);
    const startMs = timelineMs;
    for (const trackName of ["A", "B"]) {
      const n = song.tracks[trackName][i];
      const freq = noteFrequency(n.note, n.octave);
      if (freq > 0) {
        timers.push(setTimeout(() => beep(freq, Math.max(40, (n.duration || 1) * unitMs * 0.9), trackName), startMs));
      }
    }
    timelineMs += durationUnits * unitMs;
  }
}

function stopPlayback() {
  timers.forEach(t => clearTimeout(t));
  timers = [];
}

function beep(freq, ms, trackName) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.value = trackName === "A" ? 0.08 : 0.05;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + ms / 1000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
