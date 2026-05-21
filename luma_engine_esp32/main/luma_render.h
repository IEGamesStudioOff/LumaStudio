#pragma once
#include "luma_types.h"
#include <stdint.h>

void luma_render_init(void);
void luma_render_clear(uint16_t color);
void luma_render_rect(int x, int y, int w, int h, uint16_t color);
void luma_render_text(int x, int y, const char *text, uint16_t color);
// V1.2 : blit un sprite RGB565 stocké en RAM (pixels = uint16_t[w*h]).
// Pixels égaux à 'transparent' ne sont pas dessinés.
// Clipping automatique aux bords de l'écran.
void luma_render_blit_rgb565(int x, int y, int w, int h,
                             const uint16_t *pixels, uint16_t transparent);

// V1.5.4 — Blit une tuile depuis un tileset préchargé en RAM.
// tile_idx : 0-based dans le tileset (valeur du layer - 1, car 0 = vide).
// Retourne false si l'index est hors range → caller fait fallback.
bool luma_render_blit_tile(int x, int y, int tile_idx, const luma_tileset_t *ts);

void luma_render_runtime(luma_runtime_t *rt);
