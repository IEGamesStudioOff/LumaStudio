#include "luma_render.h"
#include "luma_config.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "LUMA_RENDER";
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

    // Bug #6 fix: dessine les vraies tiles depuis layer_floor puis layer_decor
    for (int ty = start_y; ty < end_y; ty++) {
        for (int tx = start_x; tx < end_x; tx++) {
            int idx = ty * map_w + tx;
            if (idx < 0 || idx >= LUMA_MAX_MAP_TILES) continue;

            int px = tx * tile - rt->camera_x;
            int py = ty * tile - rt->camera_y;

            uint8_t f = rt->layer_floor[idx];
            if (f) luma_render_rect(px, py, tile, tile, tile_color(f, false));

            uint8_t d = rt->layer_decor[idx];
            if (d) luma_render_rect(px, py, tile, tile, tile_color(d, true));
        }
    }

    // Objets placés (rendu sommaire en attendant la liaison sprite/frame)
    for (int i = 0; i < rt->object_count; i++) {
        const luma_object_instance_t *o = &rt->objects[i];
        if (!o->enabled) continue;
        int ox = o->x - rt->camera_x;
        int oy = o->y - rt->camera_y;
        if (ox > -16 && ox < LUMA_LCD_WIDTH && oy > -16 && oy < LUMA_LCD_HEIGHT) {
            luma_render_rect(ox, oy, 14, 14, LUMA_CYAN);
        }
    }

    // Player
    luma_render_rect(rt->player.x - rt->camera_x, rt->player.y - rt->camera_y, 12, 12, LUMA_YELLOW);

    // UI
    luma_render_rect(0, 0, 160, 12, LUMA_BLUE);
    luma_render_text(4, 3, rt->entry.name, LUMA_WHITE);

    if (rt->dialogue_active) {
        luma_render_rect(4, 82, 152, 42, LUMA_BLACK);
        luma_render_rect(6, 84, 148, 38, LUMA_BLUE);
        luma_render_text(12, 92, rt->dialogue_text, LUMA_WHITE);
    }
}
