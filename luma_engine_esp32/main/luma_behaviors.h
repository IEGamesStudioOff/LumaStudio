#pragma once
#include "luma_types.h"
#include <stdbool.h>
#include <stdint.h>

// V1.6.0 — Behaviors runtime ESP32
// Implémenté côté C : Pickup, DamageOnTouch, Door, Patrol, PatrolVertical,
//                     Bounce, FollowPlayer, Spinner (état seulement)
// PlatformerMovement et TopDownMovement pour le joueur sont gérés dans
// luma_runtime.c (suffisamment proches du legacy).
//
// Pas encore implémenté côté C :
//   - DialogueOnTouch oneShot persistant (besoin d'un Set par instance)
//   - Spinner avec rendu pivoté (besoin d'extension renderer)

void luma_behaviors_tick(luma_runtime_t *rt);
void luma_behaviors_handle_contacts(luma_runtime_t *rt);
