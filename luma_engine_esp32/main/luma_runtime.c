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

    int speed = 2;
    if (!rt->dialogue_active) {
        // Bug #5 fix: sliding X/Y séparés, test des 4 coins via can_stand_at
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

    // V1.5.9 — Tick le runtime events (collisions, hold inputs, timers, dialogue)
    luma_events_tick(rt, 33); // ~30 FPS = 33ms par frame

    // V1.6.0 — Tick les behaviors d'instances (Patrol, Bounce, FollowPlayer) +
    // contact handlers (Pickup, Damage, Door, Dialogue)
    luma_behaviors_tick(rt);
    luma_behaviors_handle_contacts(rt);

    if (in.a && !rt->dialogue_active) {
        rt->dialogue_active = true;
        strncpy(rt->dialogue_text, "LUMA ENGINE 1.5.9", LUMA_MAX_DIALOGUE - 1);
        luma_audio_beep(0, 880, 40);
    } else if (in.b && rt->dialogue_active) {
        rt->dialogue_active = false;
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
