#pragma once
#include "luma_types.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

typedef struct {
    char name[LUMA_MAX_PATH];
    char type[16];
    uint32_t offset;
    uint32_t size;
} luma_asset_entry_t;

typedef struct {
    FILE *file;
    luma_asset_entry_t assets[LUMA_MAX_ASSETS];
    uint16_t asset_count;
    uint32_t data_start;
    bool secure;
} luma_lpk_t;

bool luma_lpk_open(luma_lpk_t *pack, const char *path);
void luma_lpk_close(luma_lpk_t *pack);
const luma_asset_entry_t *luma_lpk_find(luma_lpk_t *pack, const char *name);
bool luma_lpk_read_asset(luma_lpk_t *pack, const char *name, uint8_t *buffer, uint32_t max_size, uint32_t *out_size);

// V1.2 : lit un sprite compilé (format: 2B w LE, 2B h LE, w*h*2 bytes pixels BE).
// Retourne true et remplit *out_w, *out_h, pixels (jusqu'à max_pixels valeurs).
// Le buffer pixels doit être un uint16_t[]. Endianness ST7735 (BE) gardée.
bool luma_lpk_read_sprite(luma_lpk_t *pack, const char *name,
                          uint16_t *out_w, uint16_t *out_h,
                          uint16_t *pixels, uint32_t max_pixels);
