// =============================================================================
// LUMA STUDIO V1.5.7 — Event Sheet
// =============================================================================
// Système no-code visuel : Déclencheur → Conditions (0+) → Actions (1+)
// Format event :
// {
//   id: 1, name: "Player shoots", enabled: true,
//   trigger: { type, params },
//   conditions: [{ type, params }, ...],
//   actions: [{ type, params }, ...]
// }
// Sauvegardé dans events.json via window.lumaAPI.saveLogic.
// Le simulator interprète les events les plus simples (V1.5.7 : input→create/
// destroy/play_sound/set_variable/wait). Le reste est enregistré mais pas
// encore exécuté côté moteur — le pipeline ESP32 ignore les events pour l'instant.
// =============================================================================

(function() {
  const TAG_TRIGGER = "trigger";
  const TAG_CONDITION = "condition";
  const TAG_ACTION = "action";

  // ---------------------------------------------------------------------------
  // CATALOGUES
  // ---------------------------------------------------------------------------

  const TRIGGERS = [
    {
      type: "on_scene_start",
      label: "📍 Au démarrage de la scène",
      advLabel: "scene_start",
      desc: "Une seule fois quand la scène se charge.",
      params: []
    },
    {
      type: "on_input_press",
      label: "🎮 Quand un bouton est pressé",
      advLabel: "input_pressed",
      desc: "Se déclenche au moment où le joueur appuie sur le bouton.",
      params: [
        { key: "button", label: "Bouton", type: "enum",
          options: ["UP","DOWN","LEFT","RIGHT","A","B","START"] }
      ]
    },
    {
      type: "on_input_hold",
      label: "🎮 Quand un bouton est maintenu",
      advLabel: "input_hold",
      desc: "Tant que le bouton reste enfoncé (à chaque frame).",
      params: [
        { key: "button", label: "Bouton", type: "enum",
          options: ["UP","DOWN","LEFT","RIGHT","A","B","START"] }
      ]
    },
    {
      type: "on_collision",
      label: "💥 Quand un objet en touche un autre",
      advLabel: "collision",
      desc: "Détecte le contact entre deux objets/types.",
      params: [
        { key: "objectA", label: "Objet A", type: "object_ref" },
        { key: "objectB", label: "Objet B", type: "object_ref" }
      ]
    },
    {
      type: "every_seconds",
      label: "⏱ Toutes les X secondes",
      advLabel: "timer",
      desc: "Se déclenche en boucle à intervalle régulier.",
      params: [
        { key: "seconds", label: "Intervalle (s)", type: "number", default: 1, min: 0.05, max: 999 }
      ]
    },
    {
      type: "on_object_destroyed",
      label: "💀 Quand un objet est détruit",
      advLabel: "object_destroyed",
      desc: "Se déclenche dès que l'objet (ou un objet de ce type) est retiré.",
      params: [
        { key: "object", label: "Objet", type: "object_ref" }
      ]
    },
    {
      type: "on_variable_change",
      label: "🔁 Quand une variable change",
      advLabel: "variable_changed",
      desc: "Quand la variable globale est modifiée.",
      params: [
        { key: "variable", label: "Variable", type: "string", default: "score" }
      ]
    }
  ];

  const CONDITIONS = [
    {
      type: "variable_eq",
      label: "Variable égale à valeur",
      advLabel: "var ==",
      params: [
        { key: "variable", label: "Variable", type: "string", default: "score" },
        { key: "value", label: "Valeur", type: "string", default: "0" }
      ]
    },
    {
      type: "variable_gt",
      label: "Variable supérieure à",
      advLabel: "var >",
      params: [
        { key: "variable", label: "Variable", type: "string", default: "score" },
        { key: "value", label: "Valeur", type: "number", default: 0 }
      ]
    },
    {
      type: "variable_lt",
      label: "Variable inférieure à",
      advLabel: "var <",
      params: [
        { key: "variable", label: "Variable", type: "string", default: "hp" },
        { key: "value", label: "Valeur", type: "number", default: 0 }
      ]
    },
    {
      type: "object_exists",
      label: "Si l'objet existe dans la scène",
      advLabel: "exists",
      params: [
        { key: "object", label: "Objet", type: "object_ref" }
      ]
    },
    {
      type: "object_has_tag",
      label: "Si l'objet a un tag",
      advLabel: "has_tag",
      params: [
        { key: "object", label: "Objet", type: "object_ref" },
        { key: "tag", label: "Tag", type: "enum",
          options: ["player","enemy","npc","item","solid","collectible","harmful","destructible","trigger","door","key"] }
      ]
    },
    {
      type: "random_chance",
      label: "Avec X% de chance",
      advLabel: "rand",
      params: [
        { key: "percent", label: "%", type: "number", default: 50, min: 0, max: 100 }
      ]
    }
  ];

  const ACTIONS = [
    {
      type: "create_object",
      label: "✨ Créer un objet",
      advLabel: "create",
      params: [
        { key: "object", label: "Objet", type: "object_ref" },
        { key: "x", label: "X (px)", type: "number", default: 80 },
        { key: "y", label: "Y (px)", type: "number", default: 64 }
      ]
    },
    {
      type: "destroy_object",
      label: "🗑 Détruire un objet",
      advLabel: "destroy",
      params: [
        { key: "object", label: "Objet", type: "object_ref" }
      ]
    },
    {
      type: "set_variable",
      label: "📝 Définir variable",
      advLabel: "var =",
      params: [
        { key: "variable", label: "Variable", type: "string", default: "score" },
        { key: "value", label: "Valeur", type: "string", default: "0" }
      ]
    },
    {
      type: "add_variable",
      label: "➕ Ajouter à variable",
      advLabel: "var +=",
      params: [
        { key: "variable", label: "Variable", type: "string", default: "score" },
        { key: "value", label: "Valeur", type: "number", default: 1 }
      ]
    },
    {
      type: "play_sound",
      label: "🔊 Jouer un son",
      advLabel: "play_sound",
      params: [
        { key: "sound", label: "Son", type: "enum",
          options: ["beep_short","beep_long","jump","shoot","hit","pickup","death","door","level_up"] }
      ]
    },
    {
      type: "play_music",
      label: "🎵 Lancer la musique",
      advLabel: "play_music",
      params: [
        { key: "name", label: "Musique", type: "string", default: "theme_01" }
      ]
    },
    {
      type: "change_scene",
      label: "🚪 Aller à une scène",
      advLabel: "change_scene",
      params: [
        { key: "scene", label: "Scène ID", type: "scene_ref" }
      ]
    },
    {
      type: "player_move",
      label: "🏃 Déplacer le joueur",
      advLabel: "move_player",
      params: [
        { key: "direction", label: "Direction", type: "enum",
          options: ["up","down","left","right"] },
        { key: "speed", label: "Vitesse (px)", type: "number", default: 2, min: 1, max: 16 }
      ]
    },
    {
      type: "damage_object",
      label: "💢 Infliger des dégâts",
      advLabel: "damage",
      params: [
        { key: "object", label: "Objet", type: "object_ref" },
        { key: "amount", label: "HP perdus", type: "number", default: 1 }
      ]
    },
    {
      type: "camera_shake",
      label: "📷 Secouer la caméra",
      advLabel: "shake",
      params: [
        { key: "duration", label: "Durée (s)", type: "number", default: 0.3, min: 0.05, max: 5 },
        { key: "intensity", label: "Intensité (px)", type: "number", default: 4, min: 1, max: 32 }
      ]
    },
    {
      type: "show_dialogue",
      label: "💬 Afficher dialogue",
      advLabel: "dialogue",
      params: [
        { key: "text", label: "Texte", type: "string", default: "Hello world!" }
      ]
    },
    {
      type: "wait",
      label: "⏸ Attendre",
      advLabel: "wait",
      params: [
        { key: "seconds", label: "Secondes", type: "number", default: 0.5, min: 0.05, max: 30 }
      ]
    },
    {
      type: "log_debug",
      label: "🐞 Log console",
      advLabel: "log",
      params: [
        { key: "text", label: "Message", type: "string", default: "debug" }
      ]
    }
  ];

  // Index par type pour lookup rapide
  const ALL_BY_TYPE = {};
  for (const t of TRIGGERS) ALL_BY_TYPE[t.type] = { ...t, _kind: TAG_TRIGGER };
  for (const c of CONDITIONS) ALL_BY_TYPE[c.type] = { ...c, _kind: TAG_CONDITION };
  for (const a of ACTIONS) ALL_BY_TYPE[a.type] = { ...a, _kind: TAG_ACTION };

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const state = {
    selectedEventId: null,
    advancedMode: false,
    panel: null
  };

  // ---------------------------------------------------------------------------
  // INIT — monte le DOM dans #eventSheetPanel (créé par index.html)
  // ---------------------------------------------------------------------------
  function init() {
    state.panel = document.getElementById("eventSheetPanel");
    if (!state.panel) return;
    if (state.panel.dataset.built === "1") {
      refresh();
      return;
    }
    state.panel.dataset.built = "1";
    state.panel.innerHTML = `
      <div class="es-toolbar">
        <button class="btn blue es-new" id="esNewEvent">+ Nouvel event</button>
        <label class="es-toggle">
          <input type="checkbox" id="esAdvanced">
          Mode avancé (noms techniques)
        </label>
        <span class="es-counter" id="esCounter">0 event</span>
      </div>
      <div class="es-layout">
        <aside class="es-list-col">
          <h3>📋 Events du projet</h3>
          <div id="esList" class="es-list"></div>
        </aside>
        <section class="es-edit-col">
          <div id="esEdit" class="es-edit">
            <p class="es-placeholder">Sélectionne un event à gauche ou crée-en un nouveau.</p>
          </div>
        </section>
      </div>
    `;
    state.panel.querySelector("#esNewEvent").onclick = createNewEvent;
    state.panel.querySelector("#esAdvanced").onchange = (e) => {
      state.advancedMode = e.target.checked;
      refresh();
    };
    refresh();
  }

  // ---------------------------------------------------------------------------
  // CREATE NEW EVENT
  // ---------------------------------------------------------------------------
  function createNewEvent() {
    const arr = window.events || [];
    const nextId = (arr.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0)) + 1;
    const ev = {
      id: nextId,
      name: "Event " + nextId,
      enabled: true,
      trigger: { type: "on_scene_start", params: {} },
      conditions: [],
      actions: [{ type: "log_debug", params: { text: "Nouvel event !" } }]
    };
    arr.push(ev);
    if (typeof window.setEvents === "function") window.setEvents(arr);
    state.selectedEventId = ev.id;
    refresh();
    if (typeof window.updateCapacityBar === "function") window.updateCapacityBar();
    if (typeof window.populateLibrary === "function") window.populateLibrary();
  }

  function deleteEvent(ev) {
    if (!confirm(`Supprimer l'event « ${ev.name} » ?`)) return;
    const arr = window.events || [];
    const i = arr.indexOf(ev);
    if (i >= 0) arr.splice(i, 1);
    if (state.selectedEventId === ev.id) state.selectedEventId = arr[0] ? arr[0].id : null;
    refresh();
    if (typeof window.updateCapacityBar === "function") window.updateCapacityBar();
    if (typeof window.populateLibrary === "function") window.populateLibrary();
  }

  function duplicateEvent(ev) {
    const arr = window.events || [];
    const nextId = (arr.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0)) + 1;
    const copy = JSON.parse(JSON.stringify(ev));
    copy.id = nextId;
    copy.name = ev.name + " (copie)";
    arr.push(copy);
    state.selectedEventId = copy.id;
    refresh();
  }

  // ---------------------------------------------------------------------------
  // VALIDATION : retourne {ok, warnings: [...]} pour un event
  // ---------------------------------------------------------------------------
  function validateEvent(ev) {
    const warnings = [];
    const objects = window.objects || [];
    const scenes = window.scenes || [];

    function checkBlock(block, kind) {
      if (!block) { warnings.push(`Bloc ${kind} manquant`); return; }
      const spec = ALL_BY_TYPE[block.type];
      if (!spec) {
        warnings.push(`Type inconnu "${block.type}" dans ${kind}`);
        return;
      }
      for (const p of (spec.params || [])) {
        const v = block.params ? block.params[p.key] : undefined;
        if (v == null || v === "") {
          warnings.push(`${kind} "${spec.label}" : paramètre "${p.label}" vide`);
          continue;
        }
        if (p.type === "object_ref") {
          if (!objects.find(o => String(o.id) === String(v))) {
            warnings.push(`${kind} "${spec.label}" : objet #${v} introuvable`);
          }
        } else if (p.type === "scene_ref") {
          if (!scenes.find(s => s.id === v)) {
            warnings.push(`${kind} "${spec.label}" : scène "${v}" introuvable`);
          }
        }
      }
    }

    checkBlock(ev.trigger, "Déclencheur");
    for (const c of (ev.conditions || [])) checkBlock(c, "Condition");
    if (!ev.actions || ev.actions.length === 0) warnings.push("Aucune action — l'event ne fera rien");
    for (const a of (ev.actions || [])) checkBlock(a, "Action");
    return { ok: warnings.length === 0, warnings };
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function refresh() {
    if (!state.panel) return;
    renderList();
    renderEdit();
    const events = window.events || [];
    const counter = state.panel.querySelector("#esCounter");
    if (counter) counter.textContent = events.length + " event" + (events.length > 1 ? "s" : "");
  }

  function renderList() {
    const el = state.panel.querySelector("#esList");
    const events = window.events || [];
    el.innerHTML = "";
    if (events.length === 0) {
      el.innerHTML = '<p class="empty">Aucun event. Clique sur + Nouvel event.</p>';
      return;
    }
    for (const ev of events) {
      const card = document.createElement("div");
      const valid = validateEvent(ev);
      const cls = valid.ok ? "ok" : "warn";
      card.className = "es-card es-card-" + cls
                     + (ev.id === state.selectedEventId ? " selected" : "")
                     + (ev.enabled === false ? " disabled" : "");
      const trigSpec = ALL_BY_TYPE[ev.trigger ? ev.trigger.type : ""];
      card.innerHTML = `
        <div class="es-card-head">
          <span class="es-status">${valid.ok ? "✓" : "⚠"}</span>
          <strong>${escape(ev.name)}</strong>
          <span class="es-id">#${ev.id}</span>
        </div>
        <div class="es-card-trigger">${trigSpec ? trigSpec.label : "?"}</div>
        <div class="es-card-meta">${(ev.conditions || []).length} cond · ${(ev.actions || []).length} actions</div>
      `;
      card.onclick = () => {
        state.selectedEventId = ev.id;
        refresh();
      };
      el.appendChild(card);
    }
  }

  function renderEdit() {
    const el = state.panel.querySelector("#esEdit");
    const events = window.events || [];
    const ev = events.find(e => e.id === state.selectedEventId);
    if (!ev) {
      el.innerHTML = '<p class="es-placeholder">Sélectionne un event à gauche ou crée-en un nouveau.</p>';
      return;
    }
    const valid = validateEvent(ev);
    el.innerHTML = `
      <div class="es-edit-head">
        <input id="esName" class="es-name-input" value="${escapeAttr(ev.name)}" placeholder="Nom de l'event">
        <label class="es-check">
          <input type="checkbox" id="esEnabled" ${ev.enabled !== false ? "checked" : ""}>
          Activé
        </label>
        <button class="btn tiny" id="esDup">📋 Dupliquer</button>
        <button class="btn tiny es-danger" id="esDel">🗑 Supprimer</button>
      </div>
      ${valid.ok
        ? '<div class="es-status-banner es-ok">✓ Event valide, prêt à fonctionner.</div>'
        : `<div class="es-status-banner es-warn">⚠ ${valid.warnings.length} problème(s) :<ul>${valid.warnings.map(w => "<li>" + escape(w) + "</li>").join("")}</ul></div>`
      }
      <div class="es-section">
        <div class="es-section-head es-trigger-head">📍 ${state.advancedMode ? "TRIGGER" : "QUAND"}</div>
        <div id="esTrigger"></div>
      </div>
      <div class="es-section">
        <div class="es-section-head es-cond-head">
          ❓ ${state.advancedMode ? "CONDITIONS" : "SI (optionnel)"}
          <button class="es-add-btn" id="esAddCond">+ Ajouter condition</button>
        </div>
        <div id="esConds"></div>
      </div>
      <div class="es-section">
        <div class="es-section-head es-action-head">
          ⚡ ${state.advancedMode ? "ACTIONS" : "ALORS"}
          <button class="es-add-btn" id="esAddAct">+ Ajouter action</button>
        </div>
        <div id="esActs"></div>
      </div>
    `;
    el.querySelector("#esName").oninput = (e) => { ev.name = e.target.value; renderList(); persistAndUpdate(); };
    el.querySelector("#esEnabled").onchange = (e) => { ev.enabled = e.target.checked; renderList(); persistAndUpdate(); };
    el.querySelector("#esDup").onclick = () => duplicateEvent(ev);
    el.querySelector("#esDel").onclick = () => deleteEvent(ev);
    el.querySelector("#esAddCond").onclick = () => {
      ev.conditions = ev.conditions || [];
      ev.conditions.push({ type: CONDITIONS[0].type, params: defaultParams(CONDITIONS[0]) });
      refresh();
      persistAndUpdate();
    };
    el.querySelector("#esAddAct").onclick = () => {
      ev.actions = ev.actions || [];
      ev.actions.push({ type: ACTIONS[0].type, params: defaultParams(ACTIONS[0]) });
      refresh();
      persistAndUpdate();
    };

    renderBlock(el.querySelector("#esTrigger"), ev, ev.trigger, TAG_TRIGGER, TRIGGERS, (nv) => { ev.trigger = nv; });

    const condsEl = el.querySelector("#esConds");
    if (!ev.conditions || ev.conditions.length === 0) {
      condsEl.innerHTML = '<p class="es-placeholder small">Aucune condition (l\'event se déclenche toujours).</p>';
    } else {
      for (let i = 0; i < ev.conditions.length; i++) {
        const wrap = document.createElement("div");
        condsEl.appendChild(wrap);
        const idx = i;
        renderBlock(wrap, ev, ev.conditions[idx], TAG_CONDITION, CONDITIONS, (nv) => {
          ev.conditions[idx] = nv;
        }, () => {
          ev.conditions.splice(idx, 1);
          refresh();
          persistAndUpdate();
        });
      }
    }

    const actsEl = el.querySelector("#esActs");
    if (!ev.actions || ev.actions.length === 0) {
      actsEl.innerHTML = '<p class="es-placeholder small">Aucune action — l\'event ne fera rien.</p>';
    } else {
      for (let i = 0; i < ev.actions.length; i++) {
        const wrap = document.createElement("div");
        actsEl.appendChild(wrap);
        const idx = i;
        renderBlock(wrap, ev, ev.actions[idx], TAG_ACTION, ACTIONS, (nv) => {
          ev.actions[idx] = nv;
        }, () => {
          ev.actions.splice(idx, 1);
          refresh();
          persistAndUpdate();
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER BLOCK : un déclencheur, une condition ou une action
  // ---------------------------------------------------------------------------
  function renderBlock(container, ev, block, kind, catalog, onChange, onRemove) {
    if (!block.params) block.params = {};
    const card = document.createElement("div");
    card.className = "es-block es-block-" + kind;
    const sel = document.createElement("select");
    sel.className = "es-block-type";
    for (const item of catalog) {
      const opt = document.createElement("option");
      opt.value = item.type;
      opt.textContent = state.advancedMode ? item.advLabel : item.label;
      if (item.type === block.type) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => {
      const newSpec = catalog.find(x => x.type === sel.value);
      const newBlock = { type: sel.value, params: defaultParams(newSpec) };
      onChange(newBlock);
      refresh();
      persistAndUpdate();
    };
    card.appendChild(sel);

    if (onRemove) {
      const rm = document.createElement("button");
      rm.className = "es-block-del";
      rm.textContent = "×";
      rm.title = "Retirer";
      rm.onclick = onRemove;
      card.appendChild(rm);
    }

    const spec = ALL_BY_TYPE[block.type];
    if (spec && spec.params && spec.params.length) {
      const grid = document.createElement("div");
      grid.className = "es-params";
      for (const p of spec.params) {
        const row = document.createElement("label");
        row.className = "es-param";
        const lbl = document.createElement("span");
        lbl.textContent = p.label;
        const input = makeInput(p, block.params[p.key]);
        input.oninput = input.onchange = () => {
          let val = input.value;
          if (p.type === "number") val = Number(val);
          block.params[p.key] = val;
          // Re-render uniquement la list pour màj validation, pas tout le form
          renderList();
          persistAndUpdate();
        };
        row.appendChild(lbl);
        row.appendChild(input);
        grid.appendChild(row);
      }
      card.appendChild(grid);
    }

    if (!state.advancedMode && spec && spec.desc) {
      const desc = document.createElement("div");
      desc.className = "es-desc";
      desc.textContent = "💡 " + spec.desc;
      card.appendChild(desc);
    }

    container.appendChild(card);
  }

  function defaultParams(spec) {
    const p = {};
    if (!spec || !spec.params) return p;
    for (const param of spec.params) {
      if (param.default !== undefined) p[param.key] = param.default;
      else if (param.type === "enum") p[param.key] = param.options[0];
      else if (param.type === "number") p[param.key] = 0;
      else if (param.type === "object_ref") {
        const objs = window.objects || [];
        p[param.key] = objs[0] ? String(objs[0].id) : "";
      } else if (param.type === "scene_ref") {
        const scs = window.scenes || [];
        p[param.key] = scs[0] ? scs[0].id : "";
      } else p[param.key] = "";
    }
    return p;
  }

  function makeInput(p, value) {
    if (p.type === "enum") {
      const sel = document.createElement("select");
      for (const opt of p.options) {
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        if (String(value) === String(opt)) o.selected = true;
        sel.appendChild(o);
      }
      return sel;
    }
    if (p.type === "object_ref") {
      const sel = document.createElement("select");
      const empty = document.createElement("option");
      empty.value = ""; empty.textContent = "— Choisir —";
      sel.appendChild(empty);
      for (const o of (window.objects || [])) {
        const opt = document.createElement("option");
        opt.value = String(o.id);
        opt.textContent = `#${o.id} ${o.name} (${o.type})`;
        if (String(value) === String(o.id)) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }
    if (p.type === "scene_ref") {
      const sel = document.createElement("select");
      const empty = document.createElement("option");
      empty.value = ""; empty.textContent = "— Choisir —";
      sel.appendChild(empty);
      for (const s of (window.scenes || [])) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name || s.id;
        if (value === s.id) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }
    if (p.type === "number") {
      const i = document.createElement("input");
      i.type = "number";
      if (p.min != null) i.min = p.min;
      if (p.max != null) i.max = p.max;
      i.step = "any";
      i.value = value != null ? value : (p.default != null ? p.default : 0);
      return i;
    }
    // string
    const i = document.createElement("input");
    i.type = "text";
    i.value = value != null ? value : "";
    return i;
  }

  function escape(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escape(s).replace(/"/g, "&quot;");
  }

  function persistAndUpdate() {
    if (typeof window.requestFullRefresh === "function") window.requestFullRefresh();
    else {
      if (typeof window.updateCapacityBar === "function") window.updateCapacityBar();
      if (typeof window.populateLibrary === "function") window.populateLibrary();
    }
  }

  // ---------------------------------------------------------------------------
  // EXÉCUTION (simulator) — V1.5.7 : sous-ensemble exécutable
  // Le simulator appelle window.LumaEventSheet.runTriggers(...) pour faire
  // tourner les events au boot / sur input / etc.
  // ---------------------------------------------------------------------------
  const _runtime = {
    waitingTimers: new Map(),  // event id → ms restantes
    everyTimers: new Map(),    // event id → ms accumulés
    runningWait: new Set(),    // event id qui attend (wait action)
    variables: {}              // variables globales du jeu
  };

  function resetRuntime() {
    _runtime.waitingTimers.clear();
    _runtime.everyTimers.clear();
    _runtime.runningWait.clear();
    _runtime.variables = {};
  }

  // Évalue un bloc de conditions. Retourne true si toutes passent.
  function evalConditions(conds, sim) {
    if (!conds || conds.length === 0) return true;
    for (const c of conds) {
      const p = c.params || {};
      if (c.type === "variable_eq") {
        if (String(_runtime.variables[p.variable]) !== String(p.value)) return false;
      } else if (c.type === "variable_gt") {
        if (!(Number(_runtime.variables[p.variable] || 0) > Number(p.value))) return false;
      } else if (c.type === "variable_lt") {
        if (!(Number(_runtime.variables[p.variable] || 0) < Number(p.value))) return false;
      } else if (c.type === "object_exists") {
        const exists = (sim.scene.objects || []).some(o => String(o.objectId) === String(p.object));
        if (!exists) return false;
      } else if (c.type === "random_chance") {
        if (Math.random() * 100 > Number(p.percent || 50)) return false;
      } else if (c.type === "object_has_tag") {
        const inst = (sim.scene.objects || []).find(o => String(o.objectId) === String(p.object));
        if (!inst) return false;
        const objDef = (window.objects || []).find(o => o.id === inst.objectId);
        if (!objDef || !(objDef.tags || []).includes(p.tag)) return false;
      }
    }
    return true;
  }

  // Exécute une liste d'actions séquentiellement. Renvoie true si tout est exécuté
  // immédiatement, false si une "wait" est rencontrée (à reprendre plus tard).
  function runActions(actions, sim) {
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const p = a.params || {};
      if (a.type === "create_object") {
        const o = (window.objects || []).find(o => String(o.id) === String(p.object));
        if (!o || !sim.scene) continue;
        const f = (window.frames || []).find(fr => fr.id === o.spriteFrameId);
        const inst = {
          objectId: o.id,
          instanceName: `${o.name}_${Date.now()}`,
          x: Number(p.x) || 0, y: Number(p.y) || 0,
          layer: "objects", enabled: true, variables: {},
          w: f ? f.w : 16, h: f ? f.h : 16
        };
        sim.scene.objects.push(inst);
        // précharge le sprite dans le cache simulator
        if (f && f.pixelsB64 && window.LumaSpriteEditor
            && sim.objectSpriteCache && !sim.objectSpriteCache.has(o.spriteFrameId)) {
          try {
            const px = window.LumaSpriteEditor.base64ToPixels(f.pixelsB64, f.w * f.h);
            sim.objectSpriteCache.set(o.spriteFrameId, { w: f.w, h: f.h, pixels: px });
          } catch (e) {}
        }
      } else if (a.type === "destroy_object") {
        sim.scene.objects = (sim.scene.objects || []).filter(inst => String(inst.objectId) !== String(p.object));
      } else if (a.type === "set_variable") {
        _runtime.variables[p.variable] = p.value;
      } else if (a.type === "add_variable") {
        _runtime.variables[p.variable] = (Number(_runtime.variables[p.variable] || 0)) + Number(p.value);
      } else if (a.type === "play_sound") {
        if (sim.audioCtx) playBeep(sim.audioCtx, p.sound);
      } else if (a.type === "log_debug") {
        console.log("[Event Sheet]", p.text);
      } else if (a.type === "camera_shake") {
        sim._shake = { remaining: Number(p.duration || 0.3) * 1000, intensity: Number(p.intensity || 4) };
      } else if (a.type === "wait") {
        // Différé : on stocke un timer + continuation pour les actions suivantes
        const remaining = Number(p.seconds || 0.5) * 1000;
        const continuation = actions.slice(i + 1);
        return { wait: true, remaining, continuation };
      }
      // Les autres actions (change_scene, player_move, damage, show_dialogue,
      // play_music) sont enregistrées dans le projet mais pas encore exécutées
      // par le simulator V1.5.7. Elles seront traitées dans une version future.
    }
    return { wait: false };
  }

  function playBeep(ctx, name) {
    // Mapping simple : chaque "son" devient un bip square wave court
    const freqs = {
      beep_short: 880, beep_long: 440, jump: 660, shoot: 1320,
      hit: 220, pickup: 988, death: 110, door: 330, level_up: 1760
    };
    const f = freqs[name] || 440;
    const dur = name === "beep_long" ? 0.18 : 0.06;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.10;
    osc.connect(g); g.connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  // ---------------------------------------------------------------------------
  // API publique pour simulator
  // ---------------------------------------------------------------------------
  function runTriggersOfType(triggerType, sim, matchFn) {
    const events = window.events || [];
    const fired = [];
    for (const ev of events) {
      if (ev.enabled === false) continue;
      if (!ev.trigger || ev.trigger.type !== triggerType) continue;
      if (matchFn && !matchFn(ev.trigger.params || {})) continue;
      if (evalConditions(ev.conditions, sim)) {
        const res = runActions(ev.actions || [], sim);
        if (res && res.wait) {
          // Programme la suite après wait
          setTimeout(() => {
            if (evalConditions(ev.conditions, sim)) runActions(res.continuation, sim);
          }, res.remaining);
        }
        fired.push(ev.name);
      }
    }
    return fired;
  }

  function tickTimers(sim, deltaMs) {
    const events = window.events || [];
    for (const ev of events) {
      if (ev.enabled === false) continue;
      if (!ev.trigger || ev.trigger.type !== "every_seconds") continue;
      const intervalMs = Number(ev.trigger.params.seconds || 1) * 1000;
      let acc = (_runtime.everyTimers.get(ev.id) || 0) + deltaMs;
      if (acc >= intervalMs) {
        acc -= intervalMs;
        if (evalConditions(ev.conditions, sim)) {
          const res = runActions(ev.actions || [], sim);
          if (res && res.wait) {
            setTimeout(() => {
              if (evalConditions(ev.conditions, sim)) runActions(res.continuation, sim);
            }, res.remaining);
          }
        }
      }
      _runtime.everyTimers.set(ev.id, acc);
    }
  }

  // Expose
  window.LumaEventSheet = {
    init,
    refresh,
    validateEvent,
    runTriggersOfType,
    tickTimers,
    resetRuntime,
    runtime: _runtime,
    TRIGGERS, CONDITIONS, ACTIONS
  };
})();
