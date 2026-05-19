#pragma once
#include "luma_types.h"
#include <stdint.h>

void luma_render_init(void);
void luma_render_clear(uint16_t color);
void luma_render_rect(int x, int y, int w, int h, uint16_t color);
void luma_render_text(int x, int y, const char *text, uint16_t color);
void luma_render_runtime(luma_runtime_t *rt);
