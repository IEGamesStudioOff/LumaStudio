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

// V1.2 : lit un sprite RGB565 compilé depuis le LPK.
// Format de l'asset : 2B w (LE), 2B h (LE), w*h*2 bytes pixels (BE pour ST7735).
// On reconvertit en uint16_t natif (l'endianness CPU = LE sur ESP32, donc on
// swap le BE du fichier vers LE en RAM).
bool luma_lpk_read_sprite(luma_lpk_t *pack, const char *name,
                          uint16_t *out_w, uint16_t *out_h,
                          uint16_t *pixels, uint32_t max_pixels) {
    const luma_asset_entry_t *asset = luma_lpk_find(pack, name);
    if (!asset || !pack->file) return false;
    if (asset->size < 4) return false;

    fseek(pack->file, pack->data_start + asset->offset, SEEK_SET);
    uint8_t hdr[4];
    if (fread(hdr, 1, 4, pack->file) != 4) return false;

    uint16_t w = (uint16_t)hdr[0] | ((uint16_t)hdr[1] << 8);
    uint16_t h = (uint16_t)hdr[2] | ((uint16_t)hdr[3] << 8);
    uint32_t need = (uint32_t)w * (uint32_t)h;
    if (need == 0 || need > max_pixels) return false;
    if (asset->size < 4 + need * 2) return false;

    // Lit les pixels en bloc et byte-swap BE → LE
    uint8_t buf[64];
    uint32_t read_pixels = 0;
    while (read_pixels < need) {
        uint32_t chunk = need - read_pixels;
        if (chunk > sizeof(buf) / 2) chunk = sizeof(buf) / 2;
        if (fread(buf, 1, chunk * 2, pack->file) != chunk * 2) return false;
        for (uint32_t i = 0; i < chunk; i++) {
            // fichier en BE : hi byte d'abord
            uint16_t hi = buf[i * 2];
            uint16_t lo = buf[i * 2 + 1];
            pixels[read_pixels + i] = (hi << 8) | lo;
        }
        read_pixels += chunk;
    }

    if (out_w) *out_w = w;
    if (out_h) *out_h = h;
    return true;
}

// V1.5.4 — Lit un tileset compilé depuis le LPK.
// Format binaire : "LTS1" magic (4B) | cols u16 LE | rows u16 LE | tileSize u16 LE
//                 | cols*rows*tileSize*tileSize*2 bytes RGB565 BE
bool luma_lpk_read_tileset(luma_lpk_t *pack, const char *name, luma_tileset_t *out) {
    if (!out) return false;
    out->loaded = false;
    const luma_asset_entry_t *asset = luma_lpk_find(pack, name);
    if (!asset || !pack->file) return false;
    if (asset->size < 10) return false;

    fseek(pack->file, pack->data_start + asset->offset, SEEK_SET);
    uint8_t hdr[10];
    if (fread(hdr, 1, 10, pack->file) != 10) return false;

    // Vérif magic "LTS1"
    if (hdr[0] != 'L' || hdr[1] != 'T' || hdr[2] != 'S' || hdr[3] != '1') return false;

    uint16_t cols      = (uint16_t)hdr[4] | ((uint16_t)hdr[5] << 8);
    uint16_t rows      = (uint16_t)hdr[6] | ((uint16_t)hdr[7] << 8);
    uint16_t tile_size = (uint16_t)hdr[8] | ((uint16_t)hdr[9] << 8);
    uint32_t total = (uint32_t)cols * rows * tile_size * tile_size;
    if (total == 0 || total > LUMA_MAX_TILESET_PIXELS) return false;
    if (asset->size < 10 + total * 2) return false;

    // Lecture pixels en bloc avec byte-swap BE → LE (ST7735 attendra du BE
    // mais on stocke en host endianness ; le swap final se fait au push SPI)
    uint8_t buf[128];
    uint32_t read = 0;
    while (read < total) {
        uint32_t chunk = total - read;
        if (chunk > sizeof(buf) / 2) chunk = sizeof(buf) / 2;
        if (fread(buf, 1, chunk * 2, pack->file) != chunk * 2) return false;
        for (uint32_t i = 0; i < chunk; i++) {
            uint16_t hi = buf[i * 2];
            uint16_t lo = buf[i * 2 + 1];
            out->pixels[read + i] = (hi << 8) | lo;
        }
        read += chunk;
    }

    // Copie le nom (avec troncage safe)
    size_t nlen = strlen(name);
    if (nlen >= LUMA_MAX_PATH) nlen = LUMA_MAX_PATH - 1;
    memcpy(out->name, name, nlen);
    out->name[nlen] = '\0';

    out->cols = cols;
    out->rows = rows;
    out->tile_size = tile_size;
    out->total_pixels = total;
    out->loaded = true;
    return true;
}
