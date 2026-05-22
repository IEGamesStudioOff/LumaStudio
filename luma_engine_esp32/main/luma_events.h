#pragma once
#include "luma_types.h"
#include <stdbool.h>
#include <stdint.h>

// V1.5.9 — Event Sheet runtime ESP32
// Couvre un sous-ensemble du système éditeur côté simulator JS :
// - Triggers exécutés : on_scene_start, on_input_press, on_input_hold, every_seconds,
//   on_collision, on_object_destroyed, on_variable_change
// - Actions exécutées : set_variable, add_variable, play_sound, log_debug,
//   create_object, destroy_object, change_scene, camera_shake, damage_object
// - Conditions évaluées : variable_eq, variable_gt, variable_lt, object_exists,
//   random_chance, object_has_tag
// - PAS encore exécuté côté C : show_dialogue (rendu à faire), play_music,
//   player_move (juste lib), wait (continuation différée).

// Initialise le runtime events au chargement de la scène (parse events JSON).
void luma_events_init(luma_runtime_t *rt, void *events_json);

// Libère / reset le runtime events (à chaque scene switch).
void luma_events_reset(luma_runtime_t *rt);

// Tick par frame : every_seconds + on_input_hold + on_collision (AABB).
// `delta_ms` = temps écoulé depuis la dernière frame.
void luma_events_tick(luma_runtime_t *rt, uint32_t delta_ms);

// Appelé sur appui de bouton (transition 0→1) ; fire les events on_input_press.
void luma_events_on_button_press(luma_runtime_t *rt, uint8_t button_mask);

// Appelé une fois après le chargement de scène ; fire les events on_scene_start.
void luma_events_on_scene_start(luma_runtime_t *rt);

// Helpers variables (utilisables hors événements aussi)
const char *luma_events_get_var(luma_runtime_t *rt, const char *name);
void luma_events_set_var(luma_runtime_t *rt, const char *name, const char *value);
int luma_events_get_var_int(luma_runtime_t *rt, const char *name);

// Renvoie le pending scene_id à charger (string), ou NULL si rien.
// L'appelant doit charger la scène puis vider via clear_pending.
const char *luma_events_pending_scene(luma_runtime_t *rt);
void luma_events_clear_pending_scene(luma_runtime_t *rt);
