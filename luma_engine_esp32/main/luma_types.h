#pragma once

#include "luma_config.h"
#include <stdint.h>
#include <stdbool.h>

typedef struct {
    char name[LUMA_MAX_NAME];
    char editor[LUMA_MAX_NAME];
    char manifest_path[LUMA_MAX_PATH];
    char game_path[LUMA_MAX_PATH];
    char assets_path[LUMA_MAX_PATH];
    bool secure;
    uint32_t size_bytes;
} luma_game_entry_t;

typedef struct {
    char id[LUMA_MAX_NAME];
    uint16_t width;
    uint16_t height;
    uint8_t tile_size;
    uint32_t floor_offset;
    uint32_t decor_offset;
    uint32_t collision_offset;
} luma_map_t;

typedef struct {
    char id[LUMA_MAX_NAME];
    char name[LUMA_MAX_NAME];
    char map_id[LUMA_MAX_NAME];
    char music[LUMA_MAX_NAME];
    int16_t spawn_x;
    int16_t spawn_y;
    char camera_mode[24];
} luma_scene_t;

typedef struct {
    char object_id[LUMA_MAX_NAME];
    char instance_name[LUMA_MAX_NAME];
    int16_t x;
    int16_t y;
    uint8_t layer;
    bool enabled;
} luma_object_instance_t;

typedef struct {
    char id[LUMA_MAX_NAME];
    int16_t x;
    int16_t y;
    int16_t w;
    int16_t h;
    char action[LUMA_MAX_NAME];
    char target[LUMA_MAX_NAME];
} luma_trigger_t;

typedef struct {
    int16_t x;
    int16_t y;
    int16_t vx;
    int16_t vy;
    uint8_t hp;
    uint8_t facing;
} luma_player_t;

typedef struct {
    luma_game_entry_t entry;
    luma_scene_t active_scene;
    luma_map_t active_map;
    // Bug #5/#6 fix: couches de tiles chargées en RAM pour rendu et collision
    uint8_t layer_floor[LUMA_MAX_MAP_TILES];
    uint8_t layer_decor[LUMA_MAX_MAP_TILES];
    uint8_t layer_collision[LUMA_MAX_MAP_TILES];
    luma_player_t player;
    luma_object_instance_t objects[LUMA_MAX_OBJECTS];
    luma_trigger_t triggers[LUMA_MAX_TRIGGERS];
    uint8_t object_count;
    uint8_t trigger_count;
    int16_t camera_x;
    int16_t camera_y;
    bool running;
    bool dialogue_active;
    char dialogue_text[LUMA_MAX_DIALOGUE];
} luma_runtime_t;
