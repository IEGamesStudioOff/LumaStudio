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
