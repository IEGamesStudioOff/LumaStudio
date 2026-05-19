#include "luma_runtime.h"
#include "luma_input.h"
#include "luma_render.h"
#include "luma_audio.h"
#include "luma_save.h"
#include <string.h>

#define PLAYER_SIZE 12

void luma_runtime_init(luma_runtime_t *rt) {
    rt->camera_x = 0;
    rt->camera_y = 0;
    rt->running = true;
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
    int s = PLAYER_SIZE;
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

    if (in.a && !rt->dialogue_active) {
        rt->dialogue_active = true;
        strncpy(rt->dialogue_text, "LUMA ENGINE 1.0.1", LUMA_MAX_DIALOGUE - 1);
        // Bug #7 fix: bip non-bloquant (start + audio_update se charge du stop)
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
