#include "luma_runtime.h"
#include "luma_input.h"
#include "luma_render.h"
#include "luma_audio.h"
#include "luma_save.h"
#include "luma_events.h"
#include "luma_behaviors.h"
#include "luma_config.h"
#include <string.h>

#define PLAYER_DEFAULT_SIZE 12

static int player_size(luma_runtime_t *rt) {
    if (rt->player_sprite_loaded && rt->player_sprite_w > 0) {
        // utilise la plus petite dimension pour la hitbox carrée
        int s = rt->player_sprite_w < rt->player_sprite_h ? rt->player_sprite_w : rt->player_sprite_h;
        return s > 0 ? s : PLAYER_DEFAULT_SIZE;
    }
    return PLAYER_DEFAULT_SIZE;
}

void luma_runtime_init(luma_runtime_t *rt) {
    rt->camera_x = 0;
    rt->camera_y = 0;
    rt->running = true;
    rt->player_sprite_loaded = false;
    rt->player_sprite_w = 0;
    rt->player_sprite_h = 0;
}

// Bug #5 fix: vraie détection de collision côté ESP32
static bool is_solid_tile(luma_runtime_t *rt, int tx, int ty) {
    if (tx < 0 || ty < 0 || tx >= rt->active_map.width || ty >= rt->active_map.height) return true;
    int idx = ty * rt->active_map.width + tx;
    if (idx < 0 || idx >= LUMA_MAX_MAP_TILES) return true;
    return rt->layer_collision[idx] > 0;
}

static bool can_stand_at(luma_runtime_t *rt, int px, int py) {
    int t = rt->active_map.tile_size ? rt->active_map.tile_size : 16;
    int s = player_size(rt);
    if (px < 0 || py < 0) return false;
    int x0 = px / t;
    int y0 = py / t;
    int x1 = (px + s - 1) / t;
    int y1 = (py + s - 1) / t;
    if (is_solid_tile(rt, x0, y0)) return false;
    if (is_solid_tile(rt, x1, y0)) return false;
    if (is_solid_tile(rt, x0, y1)) return false;
    if (is_solid_tile(rt, x1, y1)) return false;
    return true;
}

// Bug #12 fix: clamp caméra sur les 4 bords
static void clamp_camera(luma_runtime_t *rt) {
    int t = rt->active_map.tile_size ? rt->active_map.tile_size : 16;
    int map_w = rt->active_map.width * t;
    int map_h = rt->active_map.height * t;
    int max_x = map_w - LUMA_LCD_WIDTH;
    int max_y = map_h - LUMA_LCD_HEIGHT;
    if (max_x < 0) max_x = 0;
    if (max_y < 0) max_y = 0;
    if (rt->camera_x < 0) rt->camera_x = 0;
    if (rt->camera_y < 0) rt->camera_y = 0;
    if (rt->camera_x > max_x) rt->camera_x = max_x;
    if (rt->camera_y > max_y) rt->camera_y = max_y;
}

// V1.6.1 — Platformer movement pour le joueur. Subpixel ×100 pour gravité fine.
static void update_player_platformer(luma_runtime_t *rt, luma_input_t in) {
    // Inputs horizontaux : flèches G/D seulement (pas A qui = saut)
    int input_x = 0;
    if (in.left)  input_x = -1;
    if (in.right) input_x = 1;
    // vx = input_x * maxSpeedX (en ×100 pour subpixel)
    rt->player.vx = input_x * rt->pl_max_speed_x_x10 * 10; // ×100

    // Saut : edge-detect bouton A (transition press)
    bool jump_now = in.a || in.up;
    bool jump_just_pressed = jump_now && !rt->player.jump_prev;
    if (jump_just_pressed && rt->player.grounded) {
        // vy en unités/100. jumpForce × -10 = vitesse négative montante
        rt->player.vy = -rt->pl_jump_force_x10 * 10;
        rt->player.grounded = false;
    }
    rt->player.jump_prev = jump_now;

    // Variable jump height : si on relâche en montant, coupe vy de moitié
    if (!jump_now && rt->player.vy < -100) {
        rt->player.vy /= 2;
    }

    // Gravité
    rt->player.vy += rt->pl_gravity_x100;
    int16_t max_fall = rt->pl_max_fall_x10 * 10;
    if (rt->player.vy > max_fall) rt->player.vy = max_fall;

    // Sub-pixel accumulator (×100)
    rt->player.sub_x += rt->player.vx;
    rt->player.sub_y += rt->player.vy;
    int step_x = rt->player.sub_x / 100;
    int step_y = rt->player.sub_y / 100;
    rt->player.sub_x -= step_x * 100;
    rt->player.sub_y -= step_y * 100;

    // Mouvement X (pixel par pixel, sliding contre murs)
    if (step_x != 0) {
        int dir = step_x > 0 ? 1 : -1;
        int rem = step_x > 0 ? step_x : -step_x;
        while (rem > 0) {
            int nx = rt->player.x + dir;
            if (can_stand_at(rt, nx, rt->player.y)) {
                rt->player.x = nx;
                rem--;
            } else {
                rt->player.vx = 0;
                rt->player.sub_x = 0;
                break;
            }
        }
    }

    // Mouvement Y (pixel par pixel avec détection sol/plafond)
    if (step_y != 0) {
        int dir = step_y > 0 ? 1 : -1;
        int rem = step_y > 0 ? step_y : -step_y;
        bool blocked = false;
        while (rem > 0) {
            int ny = rt->player.y + dir;
            if (can_stand_at(rt, rt->player.x, ny)) {
                rt->player.y = ny;
                rem--;
            } else {
                blocked = true;
                break;
            }
        }
        if (blocked) {
            if (rt->player.vy > 0) rt->player.grounded = true;
            rt->player.vy = 0;
            rt->player.sub_y = 0;
        } else if (rt->player.vy > rt->pl_gravity_x100 * 2) {
            rt->player.grounded = false;
        }
    } else if (rt->player.vy > 0) {
        // Vitesse positive mais step=0 (sub pas plein) → vérif si toujours au sol
        if (can_stand_at(rt, rt->player.x, rt->player.y + 1)) {
            rt->player.grounded = false;
        } else {
            rt->player.grounded = true;
        }
    }
}

// V1.6.1 — TopDownMovement param-driven (utilise pl_max_speed_x_x10 comme speed)
static void update_player_topdown(luma_runtime_t *rt, luma_input_t in) {
    int speed = rt->pl_max_speed_x_x10 / 10;
    if (speed < 1) speed = 2;
    int dx = 0, dy = 0;
    if (in.left)  dx = -speed;
    if (in.right) dx = speed;
    if (in.up)    dy = -speed;
    if (in.down)  dy = speed;
    if (!rt->pl_diagonal && dx != 0 && dy != 0) {
        // Privilégie axe avec plus de magnitude → ici on prend X
        dy = 0;
    }
    if (dx != 0) {
        int nx = rt->player.x + dx;
        if (can_stand_at(rt, nx, rt->player.y)) rt->player.x = nx;
    }
    if (dy != 0) {
        int ny = rt->player.y + dy;
        if (can_stand_at(rt, rt->player.x, ny)) rt->player.y = ny;
    }
}

void luma_runtime_update(luma_runtime_t *rt) {
    luma_input_t in = luma_input_read();

    // V1.5.9 — Bitmask boutons pour event runtime
    uint8_t held = 0;
    if (in.up)    held |= LUMA_BTNMASK_UP;
    if (in.down)  held |= LUMA_BTNMASK_DOWN;
    if (in.left)  held |= LUMA_BTNMASK_LEFT;
    if (in.right) held |= LUMA_BTNMASK_RIGHT;
    if (in.a)     held |= LUMA_BTNMASK_A;
    if (in.b)     held |= LUMA_BTNMASK_B;
    if (in.start) held |= LUMA_BTNMASK_START;
    rt->held_buttons = held;

    if (!rt->dialogue_active) {
        // V1.6.1 — Branch selon behavior du joueur configuré au boot
        if (rt->player_behavior == LUMA_PLAYER_BEH_PLATFORMER) {
            update_player_platformer(rt, in);
        } else if (rt->player_behavior == LUMA_PLAYER_BEH_TOPDOWN) {
            update_player_topdown(rt, in);
        } else {
            // LEGACY TopDown (compat V1.5.x)
            int speed = 2;
            if (in.left) {
                int nx = rt->player.x - speed;
                if (can_stand_at(rt, nx, rt->player.y)) rt->player.x = nx;
            }
            if (in.right) {
                int nx = rt->player.x + speed;
                if (can_stand_at(rt, nx, rt->player.y)) rt->player.x = nx;
            }
            if (in.up) {
                int ny = rt->player.y - speed;
                if (can_stand_at(rt, rt->player.x, ny)) rt->player.y = ny;
            }
            if (in.down) {
                int ny = rt->player.y + speed;
                if (can_stand_at(rt, rt->player.x, ny)) rt->player.y = ny;
            }
        }
    }

    // V1.5.9 — Tick le runtime events (collisions, hold inputs, timers, dialogue)
    luma_events_tick(rt, 33);

    // V1.6.0 — Tick les behaviors d'instances (Patrol, Bounce, FollowPlayer) +
    // contact handlers (Pickup, Damage, Door, Dialogue)
    luma_behaviors_tick(rt);
    luma_behaviors_handle_contacts(rt);

    // Bouton A : déclenche dialogue/action SEULEMENT en mode legacy
    // (en Platformer, A = saut, on ne veut pas qu'il ouvre un dialogue par accident)
    if (rt->player_behavior == LUMA_PLAYER_BEH_LEGACY) {
        if (in.a && !rt->dialogue_active) {
            rt->dialogue_active = true;
            strncpy(rt->dialogue_text, "LUMA ENGINE 1.6.1", LUMA_MAX_DIALOGUE - 1);
            luma_audio_beep(0, 880, 40);
        } else if (in.b && rt->dialogue_active) {
            rt->dialogue_active = false;
        }
    } else {
        // En mode behavior, B ferme le dialogue
        if (in.b && rt->dialogue_active) {
            rt->dialogue_active = false;
        }
    }

    if (in.start) {
        luma_save_game(rt);
    }

    rt->camera_x = rt->player.x - (LUMA_LCD_WIDTH / 2);
    rt->camera_y = rt->player.y - (LUMA_LCD_HEIGHT / 2);
    clamp_camera(rt);

    luma_audio_update();
}

void luma_runtime_draw(luma_runtime_t *rt) {
    luma_render_runtime(rt);
}
