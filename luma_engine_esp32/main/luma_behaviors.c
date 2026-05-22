// =============================================================================
// LUMA V1.6.0 — Behaviors runtime ESP32
// =============================================================================
#include "luma_behaviors.h"
#include "luma_config.h"
#include "luma_audio.h"
#include "luma_events.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <string.h>
#include <stdlib.h>

static const char *TAG = "LUMA_BEH";

// Helper : ms-clock simple
static inline uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

// Collision tile : un pixel est-il bloquant ?
static bool is_blocked_px(const luma_runtime_t *rt, int px, int py) {
    int ts = rt->active_map.tile_size > 0 ? rt->active_map.tile_size : 16;
    int tx = px / ts, ty = py / ts;
    if (tx < 0 || ty < 0 || tx >= rt->active_map.width || ty >= rt->active_map.height) return true;
    int idx = ty * rt->active_map.width + tx;
    if (idx < 0 || idx >= LUMA_MAX_MAP_TILES) return true;
    return rt->layer_collision[idx] > 0;
}

static bool try_move_x(const luma_runtime_t *rt, luma_object_instance_t *inst, int dx) {
    int nx = inst->x + dx;
    int w = inst->w > 0 ? inst->w : 16, h = inst->h > 0 ? inst->h : 16;
    if (is_blocked_px(rt, nx, inst->y) || is_blocked_px(rt, nx + w - 1, inst->y)
     || is_blocked_px(rt, nx, inst->y + h - 1) || is_blocked_px(rt, nx + w - 1, inst->y + h - 1))
        return false;
    inst->x = nx;
    return true;
}

static bool try_move_y(const luma_runtime_t *rt, luma_object_instance_t *inst, int dy) {
    int ny = inst->y + dy;
    int w = inst->w > 0 ? inst->w : 16, h = inst->h > 0 ? inst->h : 16;
    if (is_blocked_px(rt, inst->x, ny) || is_blocked_px(rt, inst->x + w - 1, ny)
     || is_blocked_px(rt, inst->x, ny + h - 1) || is_blocked_px(rt, inst->x + w - 1, ny + h - 1))
        return false;
    inst->y = ny;
    return true;
}

// =============================================================================
// TICK : update les behaviors de mouvement (Patrol, Bounce, FollowPlayer, Spinner)
// =============================================================================
void luma_behaviors_tick(luma_runtime_t *rt) {
    if (!rt) return;
    for (int i = 0; i < rt->object_count; i++) {
        luma_object_instance_t *inst = &rt->objects[i];
        if (!inst->enabled) continue;
        const char *beh = inst->behavior;
        if (!beh[0] || strcmp(beh, "None") == 0) continue;

        if (strcmp(beh, "FollowPlayer") == 0) {
            int speed10 = inst->prop_a > 0 ? inst->prop_a : 10;     // *10
            int range = inst->prop_c > 0 ? inst->prop_c : 80;
            int stop  = inst->prop_d > 0 ? inst->prop_d : 8;
            int ddx = rt->player.x - inst->x;
            int ddy = rt->player.y - inst->y;
            int dist2 = ddx * ddx + ddy * ddy;
            if (dist2 < range * range && dist2 > stop * stop) {
                // Approx : normalise grossièrement via dx/abs(dx+dy)
                int absdx = ddx < 0 ? -ddx : ddx;
                int absdy = ddy < 0 ? -ddy : ddy;
                int sum = absdx + absdy;
                if (sum > 0) {
                    int nx = (ddx * speed10) / (sum * 10);
                    int ny = (ddy * speed10) / (sum * 10);
                    if (nx) try_move_x(rt, inst, nx);
                    if (ny) try_move_y(rt, inst, ny);
                }
            }

        } else if (strcmp(beh, "Patrol") == 0) {
            if (inst->spawn_x == 0 && inst->spawn_y == 0) {
                inst->spawn_x = inst->x; inst->spawn_y = inst->y;
            }
            int speed = inst->prop_a > 0 ? (inst->prop_a / 10) : 1;
            if (speed < 1) speed = 1;
            int distance = inst->prop_b > 0 ? inst->prop_b : 48;
            if (inst->dir == 0) inst->dir = 1;
            int dx = speed * inst->dir;
            int ok = try_move_x(rt, inst, dx);
            int delta = inst->x - inst->spawn_x;
            if (!ok || delta > distance || delta < -distance) {
                inst->dir = -inst->dir;
            }

        } else if (strcmp(beh, "PatrolVertical") == 0) {
            if (inst->spawn_x == 0 && inst->spawn_y == 0) {
                inst->spawn_x = inst->x; inst->spawn_y = inst->y;
            }
            int speed = inst->prop_a > 0 ? (inst->prop_a / 10) : 1;
            if (speed < 1) speed = 1;
            int distance = inst->prop_b > 0 ? inst->prop_b : 48;
            if (inst->dir == 0) inst->dir = 1;
            int dy = speed * inst->dir;
            int ok = try_move_y(rt, inst, dy);
            int delta = inst->y - inst->spawn_y;
            if (!ok || delta > distance || delta < -distance) {
                inst->dir = -inst->dir;
            }

        } else if (strcmp(beh, "Bounce") == 0) {
            if (inst->vx == 0 && inst->vy == 0) {
                inst->vx = inst->prop_a > 0 ? (inst->prop_a / 10) : 1;
                inst->vy = inst->prop_b > 0 ? (inst->prop_b / 10) : 1;
            }
            if (!try_move_x(rt, inst, inst->vx)) inst->vx = -inst->vx;
            if (!try_move_y(rt, inst, inst->vy)) inst->vy = -inst->vy;
        }
        // Spinner : géré côté renderer (rotation visuelle), pas de mouvement
    }
}

// =============================================================================
// HANDLE CONTACTS : Pickup, DamageOnTouch, Door, DialogueOnTouch
// =============================================================================
void luma_behaviors_handle_contacts(luma_runtime_t *rt) {
    if (!rt) return;
    int px = rt->player.x, py = rt->player.y;
    int pw = 12, ph = 14;
    uint32_t now = now_ms();

    // On marque les pickups à retirer
    int to_remove_indices[LUMA_MAX_OBJECTS];
    int to_remove_n = 0;

    for (int i = 0; i < rt->object_count; i++) {
        luma_object_instance_t *inst = &rt->objects[i];
        if (!inst->enabled) continue;
        int iw = inst->w > 0 ? inst->w : 16;
        int ih = inst->h > 0 ? inst->h : 16;
        bool touches = px < inst->x + iw && px + pw > inst->x
                    && py < inst->y + ih && py + ph > inst->y;
        if (!touches) continue;

        const char *beh = inst->behavior;
        if (!beh[0]) continue;

        if (strcmp(beh, "Pickup") == 0) {
            int reward = inst->prop_a > 0 ? inst->prop_a : 10;
            const char *var = inst->prop_target[0] ? inst->prop_target : "score";
            int cur = luma_events_get_var_int(rt, var);
            char buf[24]; snprintf(buf, sizeof(buf), "%d", cur + reward);
            luma_events_set_var(rt, var, buf);
            luma_audio_beep(0, 988, 60); // pickup
            if (to_remove_n < LUMA_MAX_OBJECTS) to_remove_indices[to_remove_n++] = i;

        } else if (strcmp(beh, "DamageOnTouch") == 0) {
            if (now - inst->last_dmg_ms < 600) continue;
            inst->last_dmg_ms = now;
            int dmg = inst->prop_a > 0 ? inst->prop_a : 1;
            int knock = inst->prop_b > 0 ? inst->prop_b : 6;
            const char *var = inst->prop_target[0] ? inst->prop_target : "hp";
            int cur = luma_events_get_var_int(rt, var);
            if (cur == 0) cur = 100; // bootstrap si jamais set
            char buf[24]; snprintf(buf, sizeof(buf), "%d", cur - dmg);
            luma_events_set_var(rt, var, buf);
            // Knockback simple
            int dxK = rt->player.x - inst->x;
            int dyK = rt->player.y - inst->y;
            int adx = dxK < 0 ? -dxK : dxK, ady = dyK < 0 ? -dyK : dyK;
            int sum = adx + ady;
            if (sum > 0) {
                rt->player.x += (dxK * knock) / sum;
                rt->player.y += (dyK * knock) / sum;
            }
            luma_audio_beep(0, 220, 60); // hit

        } else if (strcmp(beh, "Door") == 0) {
            // Door : déclenche un pending_scene_switch (utilise le runtime events)
            const char *sid = inst->prop_target;
            if (sid[0]) {
                strncpy(rt->pending_scene_switch, sid, LUMA_MAX_NAME - 1);
                rt->pending_scene_switch[LUMA_MAX_NAME - 1] = '\0';
                luma_audio_beep(0, 330, 100); // door sound
                ESP_LOGI(TAG, "Door touch → scene %s", sid);
            }

        } else if (strcmp(beh, "DialogueOnTouch") == 0) {
            if (!inst->one_shot_done) {
                // Note : prop_target stocke le texte court ici (max LUMA_MAX_NAME)
                strncpy(rt->dialogue_text, inst->prop_target,
                        sizeof(rt->dialogue_text) - 1);
                rt->dialogue_text[sizeof(rt->dialogue_text) - 1] = '\0';
                rt->dialogue_active = true;
                rt->dialogue_remaining_ms = 2500;
                inst->one_shot_done = true;
            }
        }
    }

    // Swap-remove des pickups (de la fin vers le début pour ne pas casser les indices)
    for (int k = to_remove_n - 1; k >= 0; k--) {
        int idx = to_remove_indices[k];
        for (int j = idx; j < rt->object_count - 1; j++) {
            rt->objects[j] = rt->objects[j + 1];
        }
        rt->object_count--;
    }
}
