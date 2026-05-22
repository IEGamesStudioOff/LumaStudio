// =============================================================================
// LUMA V1.5.9 — Event Sheet runtime ESP32
// =============================================================================
// Interpréteur d'events compatible avec le format produit par event-sheet.js
// du Studio (sauvegardé dans game.luma).
//
// Triggers exécutés : on_scene_start, on_input_press, on_input_hold,
//                     every_seconds, on_collision, on_object_destroyed
// Actions exécutées : log_debug, set_variable, add_variable, play_sound,
//                     create_object, destroy_object, damage_object,
//                     change_scene, show_dialogue, camera_shake
// Conditions : variable_eq/gt/lt, object_exists, random_chance
//
// Non encore exécutés côté C (mais enregistrés et préservés dans game.luma) :
//   play_music, player_move, wait (avec continuation), object_has_tag,
//   on_variable_change (le set_variable ne propage pas pour éviter la récursion)
// =============================================================================

#include "luma_events.h"
#include "luma_config.h"
#include "luma_audio.h"
#include "esp_log.h"
#include "esp_system.h"      // esp_random()
#include "cJSON.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

static const char *TAG = "LUMA_EVENTS";

// =============================================================================
// HELPERS
// =============================================================================
static const char *json_str(const cJSON *obj, const char *key, const char *defv) {
    if (!obj) return defv;
    const cJSON *it = cJSON_GetObjectItem(obj, key);
    return (cJSON_IsString(it) && it->valuestring) ? it->valuestring : defv;
}
static double json_num(const cJSON *obj, const char *key, double defv) {
    if (!obj) return defv;
    const cJSON *it = cJSON_GetObjectItem(obj, key);
    if (cJSON_IsNumber(it)) return it->valuedouble;
    if (cJSON_IsString(it) && it->valuestring) return atof(it->valuestring);
    return defv;
}

// =============================================================================
// VARIABLES
// =============================================================================
const char *luma_events_get_var(luma_runtime_t *rt, const char *name) {
    if (!rt || !name) return NULL;
    for (int i = 0; i < rt->var_count; i++) {
        if (strncmp(rt->var_names[i], name, LUMA_MAX_VAR_NAME) == 0) {
            return rt->var_values[i];
        }
    }
    return NULL;
}

int luma_events_get_var_int(luma_runtime_t *rt, const char *name) {
    const char *v = luma_events_get_var(rt, name);
    return v ? atoi(v) : 0;
}

void luma_events_set_var(luma_runtime_t *rt, const char *name, const char *value) {
    if (!rt || !name || !value) return;
    for (int i = 0; i < rt->var_count; i++) {
        if (strncmp(rt->var_names[i], name, LUMA_MAX_VAR_NAME) == 0) {
            strncpy(rt->var_values[i], value, LUMA_MAX_VAR_VALUE - 1);
            rt->var_values[i][LUMA_MAX_VAR_VALUE - 1] = '\0';
            return;
        }
    }
    if (rt->var_count >= LUMA_MAX_VARIABLES) {
        ESP_LOGW(TAG, "Variables pleines, '%s' ignorée", name);
        return;
    }
    strncpy(rt->var_names[rt->var_count], name, LUMA_MAX_VAR_NAME - 1);
    rt->var_names[rt->var_count][LUMA_MAX_VAR_NAME - 1] = '\0';
    strncpy(rt->var_values[rt->var_count], value, LUMA_MAX_VAR_VALUE - 1);
    rt->var_values[rt->var_count][LUMA_MAX_VAR_VALUE - 1] = '\0';
    rt->var_count++;
}

// =============================================================================
// CONDITIONS
// =============================================================================
static bool eval_conditions(luma_runtime_t *rt, const cJSON *conditions) {
    if (!conditions || !cJSON_IsArray(conditions)) return true;
    int n = cJSON_GetArraySize(conditions);
    for (int i = 0; i < n; i++) {
        const cJSON *c = cJSON_GetArrayItem(conditions, i);
        const char *type = json_str(c, "type", "");
        const cJSON *p = cJSON_GetObjectItem(c, "params");

        if (strcmp(type, "variable_eq") == 0) {
            const char *cur = luma_events_get_var(rt, json_str(p, "variable", ""));
            const char *val = json_str(p, "value", "");
            if (!cur) cur = "";
            if (strcmp(cur, val) != 0) return false;
        } else if (strcmp(type, "variable_gt") == 0) {
            int cur = luma_events_get_var_int(rt, json_str(p, "variable", ""));
            if (cur <= (int)json_num(p, "value", 0)) return false;
        } else if (strcmp(type, "variable_lt") == 0) {
            int cur = luma_events_get_var_int(rt, json_str(p, "variable", ""));
            if (cur >= (int)json_num(p, "value", 0)) return false;
        } else if (strcmp(type, "random_chance") == 0) {
            int pc = (int)json_num(p, "percent", 50);
            if ((int)(esp_random() % 100) >= pc) return false;
        } else if (strcmp(type, "object_exists") == 0) {
            const char *want = json_str(p, "object", "");
            bool found = false;
            for (int j = 0; j < rt->object_count; j++) {
                if (strcmp(rt->objects[j].object_id, want) == 0) { found = true; break; }
            }
            if (!found) return false;
        }
        // object_has_tag : non implémenté côté C (silencieux = permissif)
    }
    return true;
}

// =============================================================================
// FIRE TRIGGERS (parcours sélectif des events par type)
// =============================================================================
typedef bool (*match_fn_t)(const cJSON *trigger_params, void *user);

static void run_actions(luma_runtime_t *rt, const cJSON *actions);

static void run_triggers_of_type(luma_runtime_t *rt, const char *trigger_type,
                                 match_fn_t matcher, void *user) {
    if (!rt || !rt->events_json) return;
    cJSON *events = (cJSON *)rt->events_json;
    int n = cJSON_GetArraySize(events);
    for (int i = 0; i < n; i++) {
        const cJSON *ev = cJSON_GetArrayItem(events, i);
        const cJSON *enabled_it = cJSON_GetObjectItem(ev, "enabled");
        if (enabled_it && cJSON_IsFalse(enabled_it)) continue;

        const cJSON *trig = cJSON_GetObjectItem(ev, "trigger");
        if (!trig) continue;
        if (strcmp(json_str(trig, "type", ""), trigger_type) != 0) continue;
        if (matcher && !matcher(cJSON_GetObjectItem(trig, "params"), user)) continue;

        if (eval_conditions(rt, cJSON_GetObjectItem(ev, "conditions"))) {
            run_actions(rt, cJSON_GetObjectItem(ev, "actions"));
        }
    }
}

// =============================================================================
// ACTIONS
// =============================================================================
static const char *ap_str(const cJSON *a, const char *k, const char *defv) {
    return json_str(cJSON_GetObjectItem(a, "params"), k, defv);
}
static double ap_num(const cJSON *a, const char *k, double defv) {
    return json_num(cJSON_GetObjectItem(a, "params"), k, defv);
}

static int sound_freq(const char *name, int *dur_ms) {
    if (strcmp(name, "beep_long")  == 0) { *dur_ms = 180; return 440;  }
    if (strcmp(name, "jump")       == 0) { *dur_ms = 60;  return 660;  }
    if (strcmp(name, "shoot")      == 0) { *dur_ms = 60;  return 1320; }
    if (strcmp(name, "hit")        == 0) { *dur_ms = 60;  return 220;  }
    if (strcmp(name, "pickup")     == 0) { *dur_ms = 60;  return 988;  }
    if (strcmp(name, "death")      == 0) { *dur_ms = 180; return 110;  }
    if (strcmp(name, "door")       == 0) { *dur_ms = 100; return 330;  }
    if (strcmp(name, "level_up")   == 0) { *dur_ms = 200; return 1760; }
    *dur_ms = 60; return 880; // beep_short par défaut
}

static void run_actions(luma_runtime_t *rt, const cJSON *actions) {
    if (!actions || !cJSON_IsArray(actions)) return;
    int n = cJSON_GetArraySize(actions);
    for (int i = 0; i < n; i++) {
        const cJSON *a = cJSON_GetArrayItem(actions, i);
        const char *type = json_str(a, "type", "");

        if (strcmp(type, "log_debug") == 0) {
            ESP_LOGI(TAG, "[event] %s", ap_str(a, "text", ""));

        } else if (strcmp(type, "set_variable") == 0) {
            luma_events_set_var(rt, ap_str(a, "variable", ""), ap_str(a, "value", ""));

        } else if (strcmp(type, "add_variable") == 0) {
            const char *var = ap_str(a, "variable", "");
            int delta = (int)ap_num(a, "value", 0);
            int cur = luma_events_get_var_int(rt, var);
            char buf[LUMA_MAX_VAR_VALUE];
            snprintf(buf, sizeof(buf), "%d", cur + delta);
            luma_events_set_var(rt, var, buf);

        } else if (strcmp(type, "play_sound") == 0) {
            int dur = 60;
            int freq = sound_freq(ap_str(a, "sound", "beep_short"), &dur);
            luma_audio_beep(0, freq, dur);

        } else if (strcmp(type, "create_object") == 0) {
            // Création dynamique d'instance (sans sprite ; juste position + id)
            // Le rendu fallback affichera un rect coloré jusqu'à ce que sprite_name
            // soit résolu via le LPK (future amélioration).
            if (rt->object_count < LUMA_MAX_OBJECTS) {
                luma_object_instance_t *inst = &rt->objects[rt->object_count++];
                memset(inst, 0, sizeof(*inst));
                strncpy(inst->object_id, ap_str(a, "object", ""), LUMA_MAX_NAME - 1);
                inst->x = (int16_t)ap_num(a, "x", 0);
                inst->y = (int16_t)ap_num(a, "y", 0);
                inst->enabled = true;
                inst->w = 16; inst->h = 16;
                inst->hp = -1;
            }

        } else if (strcmp(type, "destroy_object") == 0) {
            const char *want = ap_str(a, "object", "");
            int w = 0, removed = 0;
            for (int r = 0; r < rt->object_count; r++) {
                if (strcmp(rt->objects[r].object_id, want) != 0) {
                    if (w != r) rt->objects[w] = rt->objects[r];
                    w++;
                } else {
                    removed++;
                }
            }
            rt->object_count = w;
            if (removed > 0) {
                ESP_LOGI(TAG, "destroy_object %s (%d inst)", want, removed);
                // Fire on_object_destroyed (sans matcher — tous les events de ce type)
                run_triggers_of_type(rt, "on_object_destroyed", NULL, NULL);
            }

        } else if (strcmp(type, "damage_object") == 0) {
            const char *want = ap_str(a, "object", "");
            int amount = (int)ap_num(a, "amount", 1);
            for (int r = 0; r < rt->object_count; r++) {
                if (strcmp(rt->objects[r].object_id, want) == 0) {
                    if (rt->objects[r].hp < 0) rt->objects[r].hp = 1; // bootstrap
                    rt->objects[r].hp -= amount;
                    if (rt->objects[r].hp <= 0) {
                        // remove via swap
                        for (int k = r; k < rt->object_count - 1; k++) {
                            rt->objects[k] = rt->objects[k + 1];
                        }
                        rt->object_count--;
                        run_triggers_of_type(rt, "on_object_destroyed", NULL, NULL);
                        r--;
                    }
                }
            }

        } else if (strcmp(type, "change_scene") == 0) {
            const char *sc = ap_str(a, "scene", "");
            strncpy(rt->pending_scene_switch, sc, LUMA_MAX_NAME - 1);
            rt->pending_scene_switch[LUMA_MAX_NAME - 1] = '\0';
            ESP_LOGI(TAG, "change_scene → %s (différé)", sc);
            return; // stop pour que le main loop voie le pending

        } else if (strcmp(type, "show_dialogue") == 0) {
            const char *txt = ap_str(a, "text", "");
            strncpy(rt->dialogue_text, txt, sizeof(rt->dialogue_text) - 1);
            rt->dialogue_text[sizeof(rt->dialogue_text) - 1] = '\0';
            rt->dialogue_remaining_ms = 3000;
            rt->dialogue_active = true;

        } else if (strcmp(type, "camera_shake") == 0) {
            // Pas encore branché au renderer (V1.6) — silencieux.
            (void)ap_num(a, "duration", 0.3);
            (void)ap_num(a, "intensity", 4);
        }
        // play_music, player_move, wait : V1.6
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================
void luma_events_init(luma_runtime_t *rt, void *events_json) {
    if (!rt) return;
    rt->events_json = events_json;
    rt->event_count = events_json ? cJSON_GetArraySize((cJSON *)events_json) : 0;
    memset(rt->event_timers, 0, sizeof(rt->event_timers));
    rt->active_collision_count = 0;
    rt->held_buttons = 0;
    rt->prev_held_buttons = 0;
    rt->pending_scene_switch[0] = '\0';
    rt->dialogue_text[0] = '\0';
    rt->dialogue_remaining_ms = 0;
    // Pour chaque instance d'objet déjà placée, init hp/w/h par défaut
    for (int i = 0; i < rt->object_count; i++) {
        if (rt->objects[i].w == 0) rt->objects[i].w = rt->objects[i].sprite_w > 0 ? rt->objects[i].sprite_w : 16;
        if (rt->objects[i].h == 0) rt->objects[i].h = rt->objects[i].sprite_h > 0 ? rt->objects[i].sprite_h : 16;
        if (rt->objects[i].hp == 0) rt->objects[i].hp = -1;
    }
    ESP_LOGI(TAG, "Events init : %d event(s)", rt->event_count);
}

void luma_events_reset(luma_runtime_t *rt) {
    if (!rt) return;
    rt->event_count = 0;
    rt->events_json = NULL;
    rt->var_count = 0;
    memset(rt->event_timers, 0, sizeof(rt->event_timers));
    rt->active_collision_count = 0;
    rt->pending_scene_switch[0] = '\0';
    rt->dialogue_text[0] = '\0';
    rt->dialogue_remaining_ms = 0;
    rt->held_buttons = 0;
    rt->prev_held_buttons = 0;
}

void luma_events_on_scene_start(luma_runtime_t *rt) {
    run_triggers_of_type(rt, "on_scene_start", NULL, NULL);
}

// Matcher générique pour params.button == name
static bool match_button(const cJSON *trig_params, void *user) {
    const char *want = (const char *)user;
    return strcmp(json_str(trig_params, "button", ""), want) == 0;
}

static const struct { uint8_t mask; const char *name; } BTNS[] = {
    {LUMA_BTN_UP,    "UP"},
    {LUMA_BTN_DOWN,  "DOWN"},
    {LUMA_BTN_LEFT,  "LEFT"},
    {LUMA_BTN_RIGHT, "RIGHT"},
    {LUMA_BTN_A,     "A"},
    {LUMA_BTN_B,     "B"},
    {LUMA_BTN_START, "START"}
};

void luma_events_on_button_press(luma_runtime_t *rt, uint8_t button_mask) {
    if (!rt) return;
    for (int b = 0; b < 7; b++) {
        if (button_mask & BTNS[b].mask) {
            run_triggers_of_type(rt, "on_input_press", match_button, (void *)BTNS[b].name);
        }
    }
}

void luma_events_tick(luma_runtime_t *rt, uint32_t delta_ms) {
    if (!rt || !rt->events_json) return;
    cJSON *events = (cJSON *)rt->events_json;
    int n = cJSON_GetArraySize(events);

    // every_seconds
    for (int i = 0; i < n && i < LUMA_MAX_EVENTS; i++) {
        const cJSON *ev = cJSON_GetArrayItem(events, i);
        const cJSON *trig = cJSON_GetObjectItem(ev, "trigger");
        if (!trig) continue;
        if (strcmp(json_str(trig, "type", ""), "every_seconds") != 0) continue;
        double secs = json_num(cJSON_GetObjectItem(trig, "params"), "seconds", 1);
        if (secs <= 0) continue;
        uint32_t interval_ms = (uint32_t)(secs * 1000);
        rt->event_timers[i] += delta_ms;
        if (rt->event_timers[i] >= interval_ms) {
            rt->event_timers[i] -= interval_ms;
            if (eval_conditions(rt, cJSON_GetObjectItem(ev, "conditions"))) {
                run_actions(rt, cJSON_GetObjectItem(ev, "actions"));
            }
        }
    }

    // on_input_hold (chaque frame tant que tenu)
    for (int b = 0; b < 7; b++) {
        if (rt->held_buttons & BTNS[b].mask) {
            run_triggers_of_type(rt, "on_input_hold", match_button, (void *)BTNS[b].name);
        }
    }

    // Détecte transitions held (press) pour fire on_input_press depuis luma_input_t
    uint8_t pressed = rt->held_buttons & ~rt->prev_held_buttons;
    if (pressed) luma_events_on_button_press(rt, pressed);
    rt->prev_held_buttons = rt->held_buttons;

    // Dialogue auto-clear
    if (rt->dialogue_remaining_ms > 0) {
        if (rt->dialogue_remaining_ms <= delta_ms) {
            rt->dialogue_text[0] = '\0';
            rt->dialogue_remaining_ms = 0;
            rt->dialogue_active = false;
        } else {
            rt->dialogue_remaining_ms -= delta_ms;
        }
    }

    // Collisions AABB player ↔ instances (one-shot à l'entrée)
    uint32_t new_active[LUMA_MAX_EVENTS];
    int new_count = 0;
    int px = rt->player.x, py = rt->player.y, pw = 12, ph = 14;

    for (int i = 0; i < rt->object_count && new_count < LUMA_MAX_EVENTS; i++) {
        luma_object_instance_t *inst = &rt->objects[i];
        if (!inst->enabled) continue;
        int iw = inst->w > 0 ? inst->w : (inst->sprite_w > 0 ? inst->sprite_w : 16);
        int ih = inst->h > 0 ? inst->h : (inst->sprite_h > 0 ? inst->sprite_h : 16);
        if (px < inst->x + iw && px + pw > inst->x
         && py < inst->y + ih && py + ph > inst->y) {
            // Hash simple sur object_id (XOR sur les chars)
            uint32_t key = 0;
            for (const char *c = inst->object_id; *c; c++) key = key * 31 + *c;
            new_active[new_count++] = key;

            bool was = false;
            for (int k = 0; k < rt->active_collision_count; k++) {
                if (rt->active_collisions[k] == key) { was = true; break; }
            }
            if (!was) {
                // Fire on_collision matchant (player, inst->object_id)
                for (int e = 0; e < n; e++) {
                    const cJSON *ev = cJSON_GetArrayItem(events, e);
                    const cJSON *trig = cJSON_GetObjectItem(ev, "trigger");
                    if (!trig || strcmp(json_str(trig, "type", ""), "on_collision") != 0) continue;
                    const cJSON *pp = cJSON_GetObjectItem(trig, "params");
                    const char *oA = json_str(pp, "objectA", "");
                    const char *oB = json_str(pp, "objectB", "");
                    bool match =
                        (strcmp(oA, "player") == 0 && strcmp(oB, inst->object_id) == 0) ||
                        (strcmp(oB, "player") == 0 && strcmp(oA, inst->object_id) == 0);
                    if (match && eval_conditions(rt, cJSON_GetObjectItem(ev, "conditions"))) {
                        run_actions(rt, cJSON_GetObjectItem(ev, "actions"));
                    }
                }
            }
        }
    }
    if (new_count > 0) memcpy(rt->active_collisions, new_active, sizeof(uint32_t) * new_count);
    rt->active_collision_count = new_count;
}

const char *luma_events_pending_scene(luma_runtime_t *rt) {
    return (rt && rt->pending_scene_switch[0]) ? rt->pending_scene_switch : NULL;
}
void luma_events_clear_pending_scene(luma_runtime_t *rt) {
    if (rt) rt->pending_scene_switch[0] = '\0';
}
