
/**
 * OBJECT / EVENT DATABASE - V0.5
 *
 * Object Database = fiches gameplay.
 * Event Database  = règles IF / THEN.
 * Variables       = globales, scène, objet.
 *
 * Les données sont sauvegardées dans :
 *   objects/objects.json
 *   events/events.json
 *   variables/variables.json
 */

import { showScreen } from "./navigation.js";

const BEHAVIORS = [
  "TopDownMovement",
  "EnemyPatrol",
  "EnemyFollowPlayer",
  "ProjectileMove",
  "DoorTransition",
  "CollectibleItem",
  "DialogNPC",
  "DamageOnTouch",
  "PushableBlock",
  "SavePoint",
  "TriggerZone"
];

const CONDITION_TYPES = [
  "OnStartScene",
  "OnButtonPressed",
  "OnCollision",
  "OnInteract",
  "OnVariableEquals",
  "OnObjectDestroyed",
  "OnTimer",
  "OnDialogueFinished",
  "OnItemCollected",
  "OnEnemyDead",
  "OnEnterZone"
];

const ACTION_TYPES = [
  "MoveObject",
  "SetAnimation",
  "DestroyObject",
  "SpawnObject",
  "PlaySound",
  "StartDialogue",
  "ChangeScene",
  "GiveItem",
  "RemoveItem",
  "SetVariable",
  "AddVariable",
  "OpenDoor",
  "SaveGame",
  "ShakeScreen",
  "ShowMessage"
];

const state = {
  objects: [],
  events: [],
  variables: { global: [], scene: [], object: [] },
  selectedObjectId: null,
  selectedEventId: null,
  initialized: false
};

let objectList, eventList, behaviorChecks;

export function initObjectEventDb() {
  if (state.initialized) return;
  state.initialized = true;

  objectList = document.getElementById("objectList");
  eventList = document.getElementById("eventList");
  behaviorChecks = document.getElementById("behaviorChecks");

  buildBehaviorChecks();
  bindTabs();
  bindObjects();
  bindEvents();
  bindVariables();
  bindHeader();
  renderAll();
}

export function openObjectEventDb() {
  showScreen("objectEventDb");
  loadDatabase();
}

function bindHeader() {
  const back = document.getElementById("dbBack");
  const back2 = document.getElementById("navAssetFromDb");
  if (back) back.addEventListener("click", () => showScreen("assetLab"));
  if (back2) back2.addEventListener("click", () => showScreen("assetLab"));

  document.getElementById("dbLoad").addEventListener("click", loadDatabase);
  document.getElementById("dbSave").addEventListener("click", saveDatabase);
  document.getElementById("dbExport").addEventListener("click", exportLogic);
  document.getElementById("runAnalyzer").addEventListener("click", runAnalyzer);
}

function bindTabs() {
  document.querySelectorAll(".db-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.dbTab;
      document.querySelectorAll(".db-tab").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".db-page").forEach(p => p.classList.remove("active"));
      document.getElementById("db" + cap(tab)).classList.add("active");
    });
  });
}

function bindObjects() {
  document.getElementById("newObject").addEventListener("click", () => {
    const obj = makeDefaultObject();
    state.objects.push(obj);
    state.selectedObjectId = obj.id;
    renderObjects();
    loadObjectToForm(obj);
  });

  document.getElementById("saveObject").addEventListener("click", () => {
    const obj = getSelectedObject() || makeDefaultObject();
    fillObjectFromForm(obj);
    if (!state.objects.find(o => o.id === obj.id)) state.objects.push(obj);
    state.selectedObjectId = obj.id;
    renderObjects();
  });

  document.getElementById("deleteObject").addEventListener("click", () => {
    if (!state.selectedObjectId) return;
    state.objects = state.objects.filter(o => o.id !== state.selectedObjectId);
    state.selectedObjectId = state.objects[0]?.id || null;
    renderObjects();
    if (state.selectedObjectId) loadObjectToForm(getSelectedObject());
    else clearObjectForm();
  });
}

function bindEvents() {
  document.getElementById("newEvent").addEventListener("click", () => {
    const ev = makeDefaultEvent();
    state.events.push(ev);
    state.selectedEventId = ev.id;
    renderEvents();
    loadEventToForm(ev);
  });

  document.getElementById("saveEvent").addEventListener("click", () => {
    const ev = getSelectedEvent() || makeDefaultEvent();
    fillEventFromForm(ev);
    if (!state.events.find(e => e.id === ev.id)) state.events.push(ev);
    state.selectedEventId = ev.id;
    renderEvents();
  });

  document.getElementById("deleteEvent").addEventListener("click", () => {
    if (!state.selectedEventId) return;
    state.events = state.events.filter(e => e.id !== state.selectedEventId);
    state.selectedEventId = state.events[0]?.id || null;
    renderEvents();
    if (state.selectedEventId) loadEventToForm(getSelectedEvent());
    else clearEventForm();
  });

  document.getElementById("addCondition").addEventListener("click", () => {
    addRuleRow(document.getElementById("conditionsList"), "condition", {
      type: "OnInteract",
      params: { object: "player", target: "npc" }
    });
  });

  document.getElementById("addAction").addEventListener("click", () => {
    addRuleRow(document.getElementById("actionsList"), "action", {
      type: "StartDialogue",
      params: { dialogue: "intro_01" }
    });
  });
}

function bindVariables() {
  document.getElementById("addVariable").addEventListener("click", () => {
    const scope = document.getElementById("varScope").value;
    const type = document.getElementById("varType").value;
    const name = sanitizeId(document.getElementById("varName").value || "variable");
    const defaultValue = parseDefaultValue(document.getElementById("varDefault").value, type);

    state.variables[scope].push({
      id: uid("var"),
      name,
      type,
      defaultValue
    });

    document.getElementById("varName").value = "";
    document.getElementById("varDefault").value = "";
    renderVariables();
  });
}

/* ---------------------- OBJECTS ---------------------- */

function makeDefaultObject() {
  const n = state.objects.length + 1;
  return {
    id: uid("obj"),
    name: "object_" + String(n).padStart(2, "0"),
    type: "ENEMY",
    spriteIdle: "",
    animations: [],
    hitbox: { x: 0, y: 0, w: 16, h: 16 },
    speed: 1,
    health: 1,
    damage: 0,
    solid: true,
    visible: true,
    active: true,
    layer: 1,
    tags: ["enemy"],
    variables: [],
    behaviors: [{ name: "EnemyPatrol", params: { direction: "horizontal", distance: 48, speed: 1 } }]
  };
}

function getSelectedObject() {
  return state.objects.find(o => o.id === state.selectedObjectId) || null;
}

function renderObjects() {
  objectList.innerHTML = "";
  for (const obj of state.objects) {
    const item = document.createElement("button");
    item.className = "db-item" + (obj.id === state.selectedObjectId ? " active" : "");
    item.innerHTML = `<strong>${escapeHtml(obj.name)}</strong><span>${obj.type} · ${obj.tags.join(", ")}</span>`;
    item.addEventListener("click", () => {
      state.selectedObjectId = obj.id;
      renderObjects();
      loadObjectToForm(obj);
    });
    objectList.appendChild(item);
  }
}

function loadObjectToForm(obj) {
  document.getElementById("objName").value = obj.name || "";
  document.getElementById("objType").value = obj.type || "ENEMY";
  document.getElementById("objSprite").value = obj.spriteIdle || "";
  document.getElementById("objAnimations").value = (obj.animations || []).join(", ");
  document.getElementById("hitX").value = obj.hitbox?.x ?? 0;
  document.getElementById("hitY").value = obj.hitbox?.y ?? 0;
  document.getElementById("hitW").value = obj.hitbox?.w ?? 16;
  document.getElementById("hitH").value = obj.hitbox?.h ?? 16;
  document.getElementById("objSpeed").value = obj.speed ?? 1;
  document.getElementById("objHealth").value = obj.health ?? 1;
  document.getElementById("objDamage").value = obj.damage ?? 0;
  document.getElementById("objSolid").value = String(obj.solid ?? true);
  document.getElementById("objTags").value = (obj.tags || []).join(", ");
  document.getElementById("objVars").value = (obj.variables || []).map(v => `${v.name}:${v.type}=${v.defaultValue}`).join(", ");

  const names = new Set((obj.behaviors || []).map(b => b.name));
  behaviorChecks.querySelectorAll("input[type=checkbox]").forEach(chk => {
    chk.checked = names.has(chk.value);
  });
}

function fillObjectFromForm(obj) {
  obj.name = sanitizeId(document.getElementById("objName").value || "object");
  obj.type = document.getElementById("objType").value;
  obj.spriteIdle = document.getElementById("objSprite").value.trim();
  obj.animations = splitCsv(document.getElementById("objAnimations").value);
  obj.hitbox = {
    x: num("hitX", 0), y: num("hitY", 0), w: num("hitW", 16), h: num("hitH", 16)
  };
  obj.speed = num("objSpeed", 1);
  obj.health = num("objHealth", 1);
  obj.damage = num("objDamage", 0);
  obj.solid = document.getElementById("objSolid").value === "true";
  obj.tags = splitCsv(document.getElementById("objTags").value);
  obj.variables = parseObjectVars(document.getElementById("objVars").value);
  obj.behaviors = [...behaviorChecks.querySelectorAll("input[type=checkbox]:checked")].map(chk => ({
    name: chk.value,
    params: defaultBehaviorParams(chk.value)
  }));
}

function clearObjectForm() {
  document.getElementById("objName").value = "";
  document.getElementById("objSprite").value = "";
  document.getElementById("objAnimations").value = "";
}

/* ---------------------- EVENTS ---------------------- */

function makeDefaultEvent() {
  const n = state.events.length + 1;
  return {
    id: uid("evt"),
    name: "event_" + String(n).padStart(2, "0"),
    enabled: true,
    conditions: [{ type: "OnInteract", params: { object: "player", target: "npc" } }],
    actions: [{ type: "StartDialogue", params: { dialogue: "dialog_01" } }]
  };
}

function getSelectedEvent() {
  return state.events.find(e => e.id === state.selectedEventId) || null;
}

function renderEvents() {
  eventList.innerHTML = "";
  for (const ev of state.events) {
    const item = document.createElement("button");
    item.className = "db-item" + (ev.id === state.selectedEventId ? " active" : "");
    item.innerHTML = `<strong>${escapeHtml(ev.name)}</strong><span>${ev.conditions.length} IF · ${ev.actions.length} THEN · ${ev.enabled ? "ON" : "OFF"}</span>`;
    item.addEventListener("click", () => {
      state.selectedEventId = ev.id;
      renderEvents();
      loadEventToForm(ev);
    });
    eventList.appendChild(item);
  }
}

function loadEventToForm(ev) {
  document.getElementById("eventName").value = ev.name || "";
  document.getElementById("eventEnabled").value = String(ev.enabled ?? true);

  const cList = document.getElementById("conditionsList");
  const aList = document.getElementById("actionsList");
  cList.innerHTML = "";
  aList.innerHTML = "";

  for (const c of (ev.conditions || [])) addRuleRow(cList, "condition", c);
  for (const a of (ev.actions || [])) addRuleRow(aList, "action", a);
}

function fillEventFromForm(ev) {
  ev.name = sanitizeId(document.getElementById("eventName").value || "event");
  ev.enabled = document.getElementById("eventEnabled").value === "true";
  ev.conditions = readRuleRows(document.getElementById("conditionsList"));
  ev.actions = readRuleRows(document.getElementById("actionsList"));
}

function clearEventForm() {
  document.getElementById("eventName").value = "";
  document.getElementById("conditionsList").innerHTML = "";
  document.getElementById("actionsList").innerHTML = "";
}

function addRuleRow(parent, kind, rule) {
  const row = document.createElement("div");
  row.className = "rule-row";
  const options = (kind === "condition" ? CONDITION_TYPES : ACTION_TYPES)
    .map(t => `<option value="${t}" ${t === rule.type ? "selected" : ""}>${t}</option>`)
    .join("");

  row.innerHTML = `
    <select class="rule-type">${options}</select>
    <input class="rule-params" value='${escapeAttr(JSON.stringify(rule.params || {}))}' title='Paramètres JSON simples' />
    <button class="danger tiny">×</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  parent.appendChild(row);
}

function readRuleRows(parent) {
  return [...parent.querySelectorAll(".rule-row")].map(row => {
    let params = {};
    try {
      params = JSON.parse(row.querySelector(".rule-params").value || "{}");
    } catch {
      params = { raw: row.querySelector(".rule-params").value };
    }
    return {
      type: row.querySelector(".rule-type").value,
      params
    };
  });
}

/* ---------------------- VARIABLES ---------------------- */

function renderVariables() {
  renderVarScope("global", document.getElementById("varsGlobal"));
  renderVarScope("scene", document.getElementById("varsScene"));
  renderVarScope("object", document.getElementById("varsObject"));
}

function renderVarScope(scope, el) {
  el.innerHTML = "";
  for (const v of state.variables[scope] || []) {
    const item = document.createElement("div");
    item.className = "var-chip";
    item.innerHTML = `<strong>${escapeHtml(v.name)}</strong><span>${v.type} = ${escapeHtml(String(v.defaultValue))}</span><button class="danger tiny">×</button>`;
    item.querySelector("button").addEventListener("click", () => {
      state.variables[scope] = state.variables[scope].filter(x => x.id !== v.id);
      renderVariables();
    });
    el.appendChild(item);
  }
}

/* ---------------------- ANALYSE / SAVE ---------------------- */

async function loadDatabase() {
  const res = await window.lumaAPI.loadDatabase();
  if (!res.ok) {
    showAnalyzerMessage(res.error || "Impossible de charger la base.");
    return;
  }
  state.objects = res.objects || [];
  state.events = res.events || [];
  state.variables = res.variables || { global: [], scene: [], object: [] };
  state.selectedObjectId = state.objects[0]?.id || null;
  state.selectedEventId = state.events[0]?.id || null;
  renderAll();
}

async function saveDatabase() {
  const res = await window.lumaAPI.saveDatabase({
    objects: state.objects,
    events: state.events,
    variables: state.variables
  });
  showAnalyzerMessage(res.ok ? `Sauvegardé : objects.json / events.json / variables.json` : (res.error || "Erreur sauvegarde."));
}

async function exportLogic() {
  const res = await window.lumaAPI.exportLogicLuma({
    objects: state.objects,
    events: state.events,
    variables: state.variables
  });
  showAnalyzerMessage(res.ok ? `Export lisible créé : ${res.path}` : (res.error || "Erreur export."));
}

function runAnalyzer() {
  const warnings = [];

  const names = new Set();
  for (const o of state.objects) {
    if (!o.name) warnings.push("Objet sans nom.");
    if (names.has(o.name)) warnings.push(`Nom d'objet dupliqué : ${o.name}`);
    names.add(o.name);
    if (!o.spriteIdle && !["TRIGGER", "DOOR", "SAVE_POINT"].includes(o.type)) {
      warnings.push(`Objet "${o.name}" sans sprite idle.`);
    }
    if (!o.hitbox || o.hitbox.w <= 0 || o.hitbox.h <= 0) {
      warnings.push(`Objet "${o.name}" avec hitbox invalide.`);
    }
    if (o.type === "DOOR" && !(o.behaviors || []).some(b => b.name === "DoorTransition")) {
      warnings.push(`Porte "${o.name}" sans behavior DoorTransition.`);
    }
  }

  for (const e of state.events) {
    if (!e.name) warnings.push("Event sans nom.");
    if (!e.conditions || e.conditions.length === 0) warnings.push(`Event "${e.name}" sans condition.`);
    if (!e.actions || e.actions.length === 0) warnings.push(`Event "${e.name}" sans action.`);
  }

  for (const scope of ["global", "scene", "object"]) {
    const seen = new Set();
    for (const v of state.variables[scope] || []) {
      if (seen.has(v.name)) warnings.push(`Variable ${scope} dupliquée : ${v.name}`);
      seen.add(v.name);
    }
  }

  const summary = [
    `Objets : ${state.objects.length}`,
    `Events : ${state.events.length}`,
    `Variables : ${(state.variables.global||[]).length + (state.variables.scene||[]).length + (state.variables.object||[]).length}`,
    `Warnings : ${warnings.length}`
  ];

  showAnalyzerMessage(summary.join("\n") + "\n\n" + (warnings.length ? warnings.map(w => "⚠ " + w).join("\n") : "✅ Aucun problème critique détecté."));
}

function showAnalyzerMessage(text) {
  document.getElementById("analyzerOutput").textContent = text;
}

function renderAll() {
  renderObjects();
  renderEvents();
  renderVariables();
  if (state.selectedObjectId) loadObjectToForm(getSelectedObject());
  if (state.selectedEventId) loadEventToForm(getSelectedEvent());
}

function buildBehaviorChecks() {
  behaviorChecks.innerHTML = "";
  for (const b of BEHAVIORS) {
    const label = document.createElement("label");
    label.className = "checkbox-row behavior";
    label.innerHTML = `<input type="checkbox" value="${b}" /> <span>${b}</span>`;
    behaviorChecks.appendChild(label);
  }
}

/* ---------------------- HELPERS ---------------------- */

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeId(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "item";
}

function splitCsv(value) {
  return String(value || "").split(",").map(s => s.trim()).filter(Boolean);
}

function num(id, fallback) {
  const v = Number(document.getElementById(id).value);
  return Number.isFinite(v) ? v : fallback;
}

function parseObjectVars(value) {
  return splitCsv(value).map(raw => {
    const [left, def = "0"] = raw.split("=");
    const [name, type = "number"] = left.split(":");
    return { id: uid("ovar"), name: sanitizeId(name), type, defaultValue: parseDefaultValue(def, type) };
  });
}

function parseDefaultValue(value, type) {
  if (type === "bool") return String(value).toLowerCase() === "true";
  if (type === "number") return Number(value) || 0;
  return String(value || "");
}

function defaultBehaviorParams(name) {
  const table = {
    TopDownMovement: { speed: 1.2, buttons: "DPAD" },
    EnemyPatrol: { direction: "horizontal", distance: 48, speed: 1 },
    EnemyFollowPlayer: { range: 64, speed: 0.7 },
    ProjectileMove: { speed: 2.5, lifetimeMs: 1200 },
    DoorTransition: { targetScene: "scene_002", spawnX: 16, spawnY: 64 },
    CollectibleItem: { item: "item_01", amount: 1 },
    DialogNPC: { dialogue: "dialog_01" },
    DamageOnTouch: { damage: 1, cooldownMs: 600 },
    PushableBlock: { grid: 16 },
    SavePoint: { slot: 0 },
    TriggerZone: { event: "event_01" }
  };
  return table[name] || {};
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
