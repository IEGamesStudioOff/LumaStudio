#include "luma_runtime.h"
#include "luma_input.h"
#include "luma_render.h"
#include "luma_audio.h"
#include "luma_save.h"
#include <string.h>

void luma_runtime_init(luma_runtime_t *rt) {
    rt->camera_x = 0;
    rt->camera_y = 0;
    rt->running = true;
}

void luma_runtime_update(luma_runtime_t *rt) {
    luma_input_t in = luma_input_read();

    int speed = 2;
    if (!rt->dialogue_active) {
        if (in.left) rt->player.x -= speed;
        if (in.right) rt->player.x += speed;
        if (in.up) rt->player.y -= speed;
        if (in.down) rt->player.y += speed;
    }

    if (in.a && !rt->dialogue_active) {
        rt->dialogue_active = true;
        strncpy(rt->dialogue_text, "LUMA ENGINE 1.0", LUMA_MAX_DIALOGUE - 1);
        luma_audio_beep(0, 880, 40);
    } else if (in.b && rt->dialogue_active) {
        rt->dialogue_active = false;
    }

    if (in.start) {
        luma_save_game(rt);
    }

    rt->camera_x = rt->player.x - (LUMA_LCD_WIDTH / 2);
    rt->camera_y = rt->player.y - (LUMA_LCD_HEIGHT / 2);
    if (rt->camera_x < 0) rt->camera_x = 0;
    if (rt->camera_y < 0) rt->camera_y = 0;

    luma_audio_update();
}

void luma_runtime_draw(luma_runtime_t *rt) {
    luma_render_runtime(rt);
}
