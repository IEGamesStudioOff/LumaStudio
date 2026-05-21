#include "luma_render.h"
#include "luma_config.h"
#include "luma_lpk.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "LUMA_RENDER";

// V1.4 — Le LPK est ouvert dans main.c (s_assets). On y accède via cette
// référence externe pour blitter les sprites d'objets à la volée.
extern luma_lpk_t s_assets;
extern bool s_assets_open;

// Buffer temporaire pour décoder un sprite d'objet (max 32×32 = 2 Ko).
// Au-delà : fallback rect coloré.
#define OBJ_SPRITE_MAX_PIXELS 1024
static uint16_t s_obj_sprite_buf[OBJ_SPRITE_MAX_PIXELS];
static spi_device_handle_t s_lcd = NULL;

static void lcd_cmd(uint8_t cmd) {
    spi_transaction_t t = {0};
    t.length = 8;
    t.tx_buffer = &cmd;
    gpio_set_level(LUMA_PIN_LCD_DC, 0);
    spi_device_transmit(s_lcd, &t);
}

static void lcd_data(const void *data, int len) {
    if (len <= 0) return;
    spi_transaction_t t = {0};
    t.length = len * 8;
    t.tx_buffer = data;
    gpio_set_level(LUMA_PIN_LCD_DC, 1);
    spi_device_transmit(s_lcd, &t);
}

static void lcd_set_addr(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1) {
    uint8_t data[4];

    lcd_cmd(0x2A);
    data[0] = x0 >> 8; data[1] = x0 & 0xFF;
    data[2] = x1 >> 8; data[3] = x1 & 0xFF;
    lcd_data(data, 4);

    lcd_cmd(0x2B);
    data[0] = y0 >> 8; data[1] = y0 & 0xFF;
    data[2] = y1 >> 8; data[3] = y1 & 0xFF;
    lcd_data(data, 4);

    lcd_cmd(0x2C);
}

void luma_render_init(void) {
    gpio_config_t io = {
        .pin_bit_mask = (1ULL << LUMA_PIN_LCD_DC) | (1ULL << LUMA_PIN_LCD_RST),
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&io);

    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = 26 * 1000 * 1000,
        .mode = 0,
        .spics_io_num = LUMA_PIN_LCD_CS,
        .queue_size = 4,
    };

    esp_err_t ret = spi_bus_add_device(LUMA_LCD_HOST, &devcfg, &s_lcd);
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "spi_bus_add_device failed");
        return;
    }

    gpio_set_level(LUMA_PIN_LCD_RST, 0);
    vTaskDelay(pdMS_TO_TICKS(50));
    gpio_set_level(LUMA_PIN_LCD_RST, 1);
    vTaskDelay(pdMS_TO_TICKS(50));

    lcd_cmd(0x01); // SWRESET
    vTaskDelay(pdMS_TO_TICKS(150));
    lcd_cmd(0x11); // SLPOUT
    vTaskDelay(pdMS_TO_TICKS(120));

    uint8_t colmod = 0x05;
    lcd_cmd(0x3A);
    lcd_data(&colmod, 1);

    uint8_t madctl = 0xA0; // landscape-ish, adjust if needed
    lcd_cmd(0x36);
    lcd_data(&madctl, 1);

    lcd_cmd(0x29); // DISPON
    luma_render_clear(LUMA_BLACK);
}

void luma_render_clear(uint16_t color) {
    luma_render_rect(0, 0, LUMA_LCD_WIDTH, LUMA_LCD_HEIGHT, color);
}

void luma_render_rect(int x, int y, int w, int h, uint16_t color) {
    if (w <= 0 || h <= 0) return;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > LUMA_LCD_WIDTH) w = LUMA_LCD_WIDTH - x;
    if (y + h > LUMA_LCD_HEIGHT) h = LUMA_LCD_HEIGHT - y;
    if (w <= 0 || h <= 0) return;

    lcd_set_addr(x, y, x + w - 1, y + h - 1);

    uint16_t line[160];
    uint16_t be = (color >> 8) | (color << 8);
    for (int i = 0; i < w; i++) line[i] = be;

    for (int row = 0; row < h; row++) {
        lcd_data(line, w * 2);
    }
}

// Minimal placeholder text: draws tiny blocks per character.
// Later: replace with real 5x7 font.
void luma_render_text(int x, int y, const char *text, uint16_t color) {
    int cx = x;
    while (*text) {
        if (*text == '\n') {
            cx = x;
            y += 8;
        } else {
            luma_render_rect(cx, y, 4, 6, color);
            cx += 6;
        }
        text++;
    }
}

// V1.2 : blit un sprite RGB565 stocké en RAM avec transparence par couleur.
// Pour éviter de pousser tout le sprite d'un coup (jusqu'à 64x64x2 = 8 Ko stack),
// on dessine ligne par ligne avec un buffer fixe.
// Le ST7735 attend du big-endian, on swap pendant la copie.
void luma_render_blit_rgb565(int x, int y, int w, int h,
                             const uint16_t *pixels, uint16_t transparent) {
    if (!pixels || w <= 0 || h <= 0) return;

    for (int row = 0; row < h; row++) {
        int py = y + row;
        if (py < 0 || py >= LUMA_LCD_HEIGHT) continue;

        // On regroupe les segments contigus de pixels opaques pour minimiser
        // le nombre d'appels SPI. Une ligne max = 160 pixels.
        int col = 0;
        while (col < w) {
            // skip transparents
            while (col < w && pixels[row * w + col] == transparent) col++;
            if (col >= w) break;
            int start = col;
            while (col < w && pixels[row * w + col] != transparent) col++;
            int segLen = col - start;

            int px = x + start;
            int segPx = segLen;
            // clip horizontal
            int srcStart = 0;
            if (px < 0) { srcStart = -px; segPx += px; px = 0; }
            if (px + segPx > LUMA_LCD_WIDTH) segPx = LUMA_LCD_WIDTH - px;
            if (segPx <= 0) continue;

            uint16_t line[160];
            for (int i = 0; i < segPx; i++) {
                uint16_t c = pixels[row * w + start + srcStart + i];
                line[i] = (c >> 8) | (c << 8); // LE → BE pour ST7735
            }
            lcd_set_addr(px, py, px + segPx - 1, py);
            lcd_data(line, segPx * 2);
        }
    }
}

// Bug #6 fix: palette simple par ID de tile (8 entrées) — alignée sur l'éditeur.
static const uint16_t TILE_PALETTE[8] = {
    0x0000, // 0 = transparent / vide
    0x18FF, // 1 = bleu primaire
    0x5BFF, // 2 = bleu clair
    0x07EE, // 3 = vert
    0xFFEB, // 4 = jaune
    0xF2AE, // 5 = rouge
    0x07FF, // 6 = cyan
    0xF81F  // 7 = magenta
};

static uint16_t tile_color(uint8_t id, bool decor) {
    if (id == 0) return TILE_PALETTE[0];
    uint8_t shifted = decor ? (uint8_t)((id + 2) & 0x07) : (uint8_t)(id & 0x07);
    return TILE_PALETTE[shifted];
}

// V1.5.4 — Blit une tuile depuis le tileset préchargé (active_tileset.pixels).
// tile_idx : index dans le tileset (0-based). Le mapping côté Studio est
// valeur_de_layer = tile_idx + 1 (0 réservé = vide).
// Retourne false si l'index est invalide → caller peut faire fallback.
bool luma_render_blit_tile(int x, int y, int tile_idx, const luma_tileset_t *ts) {
    if (!ts || !ts->loaded || tile_idx < 0) return false;
    int total = (int)ts->cols * (int)ts->rows;
    if (tile_idx >= total) return false;

    int tsize = ts->tile_size;
    if (tsize <= 0 || tsize > 64) return false;

    // Offset du premier pixel de cette tuile dans le buffer linéaire
    uint32_t base = (uint32_t)tile_idx * tsize * tsize;

    for (int row = 0; row < tsize; row++) {
        int py = y + row;
        if (py < 0 || py >= LUMA_LCD_HEIGHT) continue;

        // Recherche des segments opaques pour grouper en un seul push SPI
        int col = 0;
        while (col < tsize) {
            while (col < tsize && ts->pixels[base + row * tsize + col] == LUMA_TILESET_TRANSPARENT) col++;
            if (col >= tsize) break;
            int start = col;
            while (col < tsize && ts->pixels[base + row * tsize + col] != LUMA_TILESET_TRANSPARENT) col++;
            int segLen = col - start;

            int px = x + start;
            int segPx = segLen;
            int srcStart = 0;
            if (px < 0) { srcStart = -px; segPx += px; px = 0; }
            if (px + segPx > LUMA_LCD_WIDTH) segPx = LUMA_LCD_WIDTH - px;
            if (segPx <= 0) continue;

            uint16_t line[64];
            for (int i = 0; i < segPx; i++) {
                uint16_t c = ts->pixels[base + row * tsize + start + srcStart + i];
                line[i] = (c >> 8) | (c << 8); // LE → BE pour ST7735
            }
            lcd_set_addr(px, py, px + segPx - 1, py);
            lcd_data(line, segPx * 2);
        }
    }
    return true;
}

void luma_render_runtime(luma_runtime_t *rt) {
    luma_render_clear(LUMA_BLACK);

    int tile = rt->active_map.tile_size ? rt->active_map.tile_size : 16;
    int map_w = rt->active_map.width;
    int map_h = rt->active_map.height;

    int start_x = rt->camera_x / tile;
    int start_y = rt->camera_y / tile;
    int end_x = start_x + (LUMA_LCD_WIDTH / tile) + 2;
    int end_y = start_y + (LUMA_LCD_HEIGHT / tile) + 2;
    if (start_x < 0) start_x = 0;
    if (start_y < 0) start_y = 0;
    if (end_x > map_w) end_x = map_w;
    if (end_y > map_h) end_y = map_h;

    // V1.5.4 — Si un tileset est préchargé pour cette map, on blit les vraies
    // tuiles depuis active_tileset.pixels. Sinon, fallback couleurs unies (V1.4).
    bool has_tileset = rt->active_tileset.loaded
        && rt->active_tileset.tile_size > 0
        && rt->active_tileset.cols > 0;

    for (int ty = start_y; ty < end_y; ty++) {
        for (int tx = start_x; tx < end_x; tx++) {
            int idx = ty * map_w + tx;
            if (idx < 0 || idx >= LUMA_MAX_MAP_TILES) continue;

            int px = tx * tile - rt->camera_x;
            int py = ty * tile - rt->camera_y;

            uint8_t f = rt->layer_floor[idx];
            if (f) {
                if (has_tileset) {
                    if (!luma_render_blit_tile(px, py, (int)f - 1, &rt->active_tileset)) {
                        luma_render_rect(px, py, tile, tile, tile_color(f, false));
                    }
                } else {
                    luma_render_rect(px, py, tile, tile, tile_color(f, false));
                }
            }

            uint8_t d = rt->layer_decor[idx];
            if (d) {
                if (has_tileset) {
                    if (!luma_render_blit_tile(px, py, (int)d - 1, &rt->active_tileset)) {
                        luma_render_rect(px, py, tile, tile, tile_color(d, true));
                    }
                } else {
                    luma_render_rect(px, py, tile, tile, tile_color(d, true));
                }
            }
        }
    }

    // V1.4 — Objets placés : blit du sprite depuis le LPK si dispo
    for (int i = 0; i < rt->object_count; i++) {
        const luma_object_instance_t *o = &rt->objects[i];
        if (!o->enabled) continue;
        int ox = o->x - rt->camera_x;
        int oy = o->y - rt->camera_y;
        if (ox <= -32 || ox >= LUMA_LCD_WIDTH || oy <= -32 || oy >= LUMA_LCD_HEIGHT) continue;

        bool drawn = false;
        if (s_assets_open && o->sprite_name[0] != 0
            && (uint32_t)(o->sprite_w * o->sprite_h) <= OBJ_SPRITE_MAX_PIXELS) {
            uint16_t w, h;
            if (luma_lpk_read_sprite(&s_assets, o->sprite_name, &w, &h,
                                     s_obj_sprite_buf, OBJ_SPRITE_MAX_PIXELS)) {
                luma_render_blit_rgb565(ox, oy, w, h, s_obj_sprite_buf, 0xF81F);
                drawn = true;
            }
        }
        if (!drawn) {
            luma_render_rect(ox, oy, 14, 14, LUMA_CYAN);
        }
    }

    // V1.2 : Player rendu avec sprite RGB565 si chargé depuis le LPK,
    // sinon fallback sur le rect jaune.
    int psx = rt->player.x - rt->camera_x;
    int psy = rt->player.y - rt->camera_y;
    if (rt->player_sprite_loaded && rt->player_sprite_w > 0 && rt->player_sprite_h > 0) {
        luma_render_blit_rgb565(psx, psy,
                                rt->player_sprite_w, rt->player_sprite_h,
                                rt->player_sprite_pixels,
                                0xF81F /* magenta = transparent */);
    } else {
        luma_render_rect(psx, psy, 12, 12, LUMA_YELLOW);
    }

    // UI
    luma_render_rect(0, 0, 160, 12, LUMA_BLUE);
    luma_render_text(4, 3, rt->entry.name, LUMA_WHITE);

    if (rt->dialogue_active) {
        luma_render_rect(4, 82, 152, 42, LUMA_BLACK);
        luma_render_rect(6, 84, 148, 38, LUMA_BLUE);
        luma_render_text(12, 92, rt->dialogue_text, LUMA_WHITE);
    }
}
