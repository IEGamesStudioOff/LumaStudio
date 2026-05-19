#include "luma_lpk.h"
#include "esp_log.h"
#include "cJSON.h"
#include <string.h>
#include <stdlib.h>

static const char *TAG = "LUMA_LPK";

bool luma_lpk_open(luma_lpk_t *pack, const char *path) {
    memset(pack, 0, sizeof(*pack));

    FILE *f = fopen(path, "rb");
    if (!f) {
        ESP_LOGE(TAG, "Cannot open LPK: %s", path);
        return false;
    }

    char magic[5] = {0};
    fread(magic, 1, 4, f);

    if (strcmp(magic, "LPK1") != 0) {
        ESP_LOGW(TAG, "Unsupported/secure LPK for now: %s", magic);
        fclose(f);
        return false;
    }

    uint32_t header_size = 0;
    fread(&header_size, 4, 1, f);

    char *header = calloc(1, header_size + 1);
    if (!header) {
        fclose(f);
        return false;
    }

    fread(header, 1, header_size, f);
    pack->data_start = 4 + 4 + header_size;

    cJSON *root = cJSON_Parse(header);
    free(header);

    if (!root) {
        fclose(f);
        return false;
    }

    const cJSON *asset_count = cJSON_GetObjectItem(root, "assetCount");
    const cJSON *table = cJSON_GetObjectItem(root, "table");

    pack->asset_count = cJSON_IsNumber(asset_count) ? asset_count->valueint : 0;
    if (pack->asset_count > LUMA_MAX_ASSETS) pack->asset_count = LUMA_MAX_ASSETS;

    for (uint16_t i = 0; i < pack->asset_count; i++) {
        const cJSON *item = cJSON_GetArrayItem(table, i);
        if (!item) continue;

        const cJSON *name = cJSON_GetObjectItem(item, "name");
        const cJSON *type = cJSON_GetObjectItem(item, "type");
        const cJSON *offset = cJSON_GetObjectItem(item, "offset");
        const cJSON *size = cJSON_GetObjectItem(item, "size");

        if (cJSON_IsString(name)) strncpy(pack->assets[i].name, name->valuestring, LUMA_MAX_PATH - 1);
        if (cJSON_IsString(type)) strncpy(pack->assets[i].type, type->valuestring, 15);
        if (cJSON_IsNumber(offset)) pack->assets[i].offset = offset->valueint;
        if (cJSON_IsNumber(size)) pack->assets[i].size = size->valueint;
    }

    cJSON_Delete(root);
    pack->file = f;

    ESP_LOGI(TAG, "LPK opened: %u assets", pack->asset_count);
    return true;
}

void luma_lpk_close(luma_lpk_t *pack) {
    if (pack->file) fclose(pack->file);
    memset(pack, 0, sizeof(*pack));
}

const luma_asset_entry_t *luma_lpk_find(luma_lpk_t *pack, const char *name) {
    for (uint16_t i = 0; i < pack->asset_count; i++) {
        if (strcmp(pack->assets[i].name, name) == 0) return &pack->assets[i];
    }
    return NULL;
}

bool luma_lpk_read_asset(luma_lpk_t *pack, const char *name, uint8_t *buffer, uint32_t max_size, uint32_t *out_size) {
    const luma_asset_entry_t *asset = luma_lpk_find(pack, name);
    if (!asset || !pack->file) return false;
    if (asset->size > max_size) return false;

    fseek(pack->file, pack->data_start + asset->offset, SEEK_SET);
    fread(buffer, 1, asset->size, pack->file);
    if (out_size) *out_size = asset->size;
    return true;
}
