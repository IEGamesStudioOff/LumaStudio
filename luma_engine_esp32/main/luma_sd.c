#include "luma_sd.h"
#include "luma_config.h"

#include "esp_log.h"
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"
#include "driver/sdspi_host.h"
#include "driver/spi_common.h"
#include "cJSON.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>

static const char *TAG = "LUMA_SD";
static sdmmc_card_t *s_card = NULL;

bool luma_sd_mount(void) {
    ESP_LOGI(TAG, "Mounting SD card...");

    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    host.slot = SPI2_HOST;

    spi_bus_config_t bus_cfg = {
        .mosi_io_num = LUMA_PIN_MOSI,
        .miso_io_num = LUMA_PIN_MISO,
        .sclk_io_num = LUMA_PIN_SCLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 4096,
    };

    esp_err_t ret = spi_bus_initialize(host.slot, &bus_cfg, SDSPI_DEFAULT_DMA);
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "spi_bus_initialize failed: %s", esp_err_to_name(ret));
        return false;
    }

    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT();
    slot_config.gpio_cs = LUMA_PIN_SD_CS;
    slot_config.host_id = host.slot;

    esp_vfs_fat_sdmmc_mount_config_t mount_config = {
        .format_if_mount_failed = false,
        .max_files = 8,
        .allocation_unit_size = 32 * 1024
    };

    ret = esp_vfs_fat_sdspi_mount(LUMA_SD_MOUNT, &host, &slot_config, &mount_config, &s_card);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to mount SD: %s", esp_err_to_name(ret));
        return false;
    }

    mkdir(LUMA_GAMES_DIR, 0777);
    mkdir(LUMA_SAVES_DIR, 0777);

    ESP_LOGI(TAG, "SD mounted.");
    return true;
}

void luma_sd_unmount(void) {
    if (s_card) {
        esp_vfs_fat_sdcard_unmount(LUMA_SD_MOUNT, s_card);
        s_card = NULL;
    }
}

bool luma_read_text_file(const char *path, char **out_text, long *out_size) {
    FILE *f = fopen(path, "rb");
    if (!f) return false;

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    rewind(f);

    char *buf = calloc(1, size + 1);
    if (!buf) {
        fclose(f);
        return false;
    }

    fread(buf, 1, size, f);
    fclose(f);

    *out_text = buf;
    if (out_size) *out_size = size;
    return true;
}

static bool parse_manifest(const char *manifest_path, luma_game_entry_t *entry) {
    char *text = NULL;
    long size = 0;
    if (!luma_read_text_file(manifest_path, &text, &size)) return false;

    cJSON *root = cJSON_Parse(text);
    free(text);

    if (!root) return false;

    const cJSON *name = cJSON_GetObjectItem(root, "name");
    const cJSON *editor = cJSON_GetObjectItem(root, "editor");
    const cJSON *entry_file = cJSON_GetObjectItem(root, "entry");
    const cJSON *assets_file = cJSON_GetObjectItem(root, "assets");
    const cJSON *secure = cJSON_GetObjectItem(root, "secure");
    const cJSON *size_json = cJSON_GetObjectItem(root, "size");

    if (!cJSON_IsString(name) || !cJSON_IsString(entry_file) || !cJSON_IsString(assets_file)) {
        cJSON_Delete(root);
        return false;
    }

    strncpy(entry->name, name->valuestring, LUMA_MAX_NAME - 1);
    if (cJSON_IsString(editor)) strncpy(entry->editor, editor->valuestring, LUMA_MAX_NAME - 1);
    strncpy(entry->manifest_path, manifest_path, LUMA_MAX_PATH - 1);

    char folder[LUMA_MAX_PATH] = {0};
    strncpy(folder, manifest_path, sizeof(folder) - 1);
    char *last_slash = strrchr(folder, '/');
    if (last_slash) *last_slash = '\0';

    snprintf(entry->game_path, LUMA_MAX_PATH, "%s/%s", folder, entry_file->valuestring);
    snprintf(entry->assets_path, LUMA_MAX_PATH, "%s/%s", folder, assets_file->valuestring);
    entry->secure = cJSON_IsTrue(secure);
    entry->size_bytes = cJSON_IsNumber(size_json) ? (uint32_t)size_json->valuedouble : 0;

    cJSON_Delete(root);
    return true;
}

int luma_scan_games(luma_game_entry_t *games, int max_games) {
    DIR *dir = opendir(LUMA_GAMES_DIR);
    if (!dir) {
        ESP_LOGW(TAG, "No /jeux directory found.");
        return 0;
    }

    int count = 0;
    struct dirent *ent;

    while ((ent = readdir(dir)) != NULL && count < max_games) {
        if (ent->d_name[0] == '.') continue;

        char manifest[LUMA_MAX_PATH];
        snprintf(manifest, sizeof(manifest), "%s/%s/manifest.json", LUMA_GAMES_DIR, ent->d_name);

        struct stat st;
        if (stat(manifest, &st) == 0) {
            if (parse_manifest(manifest, &games[count])) {
                ESP_LOGI(TAG, "Found game: %s", games[count].name);
                count++;
            }
        }
    }

    closedir(dir);
    return count;
}
