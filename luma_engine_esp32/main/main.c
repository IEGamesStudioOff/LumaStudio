#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include <string.h>

#include "luma_config.h"
#include "luma_types.h"
#include "luma_sd.h"
#include "luma_game.h"
#include "luma_runtime.h"
#include "luma_render.h"
#include "luma_input.h"
#include "luma_audio.h"
#include "luma_lpk.h"

static const char *TAG = "LUMA_MAIN";

static luma_game_entry_t games[LUMA_MAX_GAMES];
static luma_runtime_t runtime;
// V1.4 — s_assets et s_assets_open non-static pour permettre l'accès
// depuis luma_render.c (extern) pour blitter les sprites d'objets.
luma_lpk_t s_assets;
bool s_assets_open = false;

static void draw_launcher(int game_count, int selected) {
    luma_render_clear(LUMA_BLACK);
    luma_render_rect(0, 0, 160, 16, LUMA_BLUE);
    luma_render_text(6, 5, "LUMA ENGINE 1.0.1", LUMA_WHITE);

    if (game_count <= 0) {
        luma_render_text(12, 42, "NO GAME FOUND", LUMA_RED);
        luma_render_text(12, 58, "/sdcard/jeux/", LUMA_WHITE);
        return;
    }

    for (int i = 0; i < game_count && i < 6; i++) {
        uint16_t color = (i == selected) ? LUMA_YELLOW : LUMA_WHITE;
        luma_render_text(12, 28 + i * 14, games[i].name, color);
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Starting Luma Engine 1.0.1");

    nvs_flash_init();
    luma_input_init();
    luma_audio_init();

    if (!luma_sd_mount()) {
        ESP_LOGE(TAG, "SD mount failed.");
    }

    // Render init must happen after SPI bus has been initialized by SD.
    luma_render_init();

    int game_count = luma_scan_games(games, LUMA_MAX_GAMES);
    int selected = 0;
    bool in_launcher = true;

    draw_launcher(game_count, selected);

    while (in_launcher) {
        luma_input_t input = luma_input_read();

        if (input.down && game_count > 0) {
            selected = (selected + 1) % game_count;
            draw_launcher(game_count, selected);
            vTaskDelay(pdMS_TO_TICKS(180));
        }

        if (input.up && game_count > 0) {
            selected = (selected + game_count - 1) % game_count;
            draw_launcher(game_count, selected);
            vTaskDelay(pdMS_TO_TICKS(180));
        }

        if (input.a && game_count > 0) {
            in_launcher = false;
            break;
        }

        vTaskDelay(pdMS_TO_TICKS(30));
    }

    if (game_count > 0) {
        // Bug #6 corollaire fix: ouvrir le LPK d'assets pour la phase suivante
        // (rendu sprites, sons). Pour l'instant on log les assets trouvés.
        if (luma_lpk_open(&s_assets, games[selected].assets_path)) {
            s_assets_open = true;
            ESP_LOGI(TAG, "Assets pack open: %s (%u assets)",
                     games[selected].assets_path, s_assets.asset_count);
        } else {
            ESP_LOGW(TAG, "No assets pack loaded for %s", games[selected].name);
        }

        if (luma_game_load(&runtime, &games[selected])) {
            luma_runtime_init(&runtime);

            // V1.2 : précharger le premier sprite trouvé comme sprite joueur.
            // C'est minimaliste mais ça démontre le rendu RGB565 fonctionnel.
            // Une V1.3 permettra de mapper sprite ↔ objet via le studio.
            runtime.player_sprite_loaded = false;
            if (s_assets_open) {
                for (int i = 0; i < s_assets.asset_count; i++) {
                    if (strcmp(s_assets.assets[i].type, "sprite") == 0) {
                        if (luma_lpk_read_sprite(&s_assets, s_assets.assets[i].name,
                                                 &runtime.player_sprite_w,
                                                 &runtime.player_sprite_h,
                                                 runtime.player_sprite_pixels,
                                                 LUMA_MAX_SPRITE_PIXELS)) {
                            runtime.player_sprite_loaded = true;
                            ESP_LOGI(TAG, "Player sprite: %s (%dx%d)",
                                     s_assets.assets[i].name,
                                     runtime.player_sprite_w,
                                     runtime.player_sprite_h);
                            break;
                        }
                    }
                }
            }

            while (runtime.running) {
                luma_runtime_update(&runtime);
                luma_runtime_draw(&runtime);
                vTaskDelay(pdMS_TO_TICKS(33)); // ~30 FPS
            }

            luma_game_unload(&runtime);
        } else {
            luma_render_clear(LUMA_BLACK);
            luma_render_text(20, 50, "LOAD FAILED", LUMA_RED);
        }

        if (s_assets_open) {
            luma_lpk_close(&s_assets);
            s_assets_open = false;
        }
    }

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
