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
    // V1.5.4 — Tileset assigné (vide si pas de tileset → fallback couleurs)
    char tileset_name[LUMA_MAX_PATH];
    uint16_t tileset_cols;
    uint16_t tileset_rows;
    uint16_t tileset_tile_size;
} luma_map_t;

// V1.5.4 — Tileset chargé en RAM pour la map active.
// Précharge tout le tileset au boot de la scène : décodage RGB565 BE → LE en RAM.
// Blit fait par luma_render_blit_tile() qui lit pixels[tile_idx * tile_size² + ...]
typedef struct {
    char name[LUMA_MAX_PATH];
    uint16_t cols;
    uint16_t rows;
    uint16_t tile_size;
    uint32_t total_pixels;
    bool loaded;
    uint16_t pixels[LUMA_MAX_TILESET_PIXELS]; // RGB565 LE (host-endian) en RAM
} luma_tileset_t;

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
    // V1.4 — référence directe au sprite à afficher (résolue au build LPK)
    // Si vide ou non-trouvé dans le LPK, on tombe sur un placeholder coloré.
    char sprite_name[LUMA_MAX_NAME];
    uint16_t sprite_w;
    uint16_t sprite_h;
    // V1.5.9 — Pour le runtime events (collisions AABB, dégâts)
    uint8_t w;     // largeur hitbox (défaut sprite_w)
    uint8_t h;     // hauteur hitbox (défaut sprite_h)
    int16_t hp;    // points de vie (-1 si non applicable)
    // V1.6.0 — Behavior runtime
    char behavior[24];     // ex: "FollowPlayer", "Patrol", "Pickup"
    int16_t spawn_x;       // pour les patrols : position d'origine
    int16_t spawn_y;
    int8_t dir;            // direction patrol (-1 / +1) ou bounce
    int8_t vy;             // vélocité (bounce)
    int8_t vx;
    uint32_t last_dmg_ms;  // cooldown DamageOnTouch
    bool one_shot_done;    // pour DialogueOnTouch oneShot
    // Properties : on stocke 4 numeric génériques pour gravity/speed/distance/damage
    int16_t prop_a;        // gravity*100 OU speed*10 OU damage OU scoreReward
    int16_t prop_b;        // jumpForce*10 OU distance OU knockback
    int16_t prop_c;        // maxSpeedX*10 OU detectionRange
    int16_t prop_d;        // maxFallSpeed*10 OU stopRange
    char prop_target[LUMA_MAX_NAME]; // sceneId pour Door, requiresKey, scoreVariable
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
    int16_t vx;     // vélocité X ×100 (sub-pixel)
    int16_t vy;     // vélocité Y ×100 (sub-pixel)
    uint8_t hp;
    uint8_t facing;
    // V1.6.1 — État platformer
    int16_t sub_x;        // sub-pixel accumulator X ×100
    int16_t sub_y;        // sub-pixel accumulator Y ×100
    bool grounded;
    bool jump_prev;
    uint8_t w;            // hitbox
    uint8_t h;
} luma_player_t;

// V1.2 : taille max d'un sprite joueur/objet en RAM
#define LUMA_MAX_SPRITE_DIM   64
#define LUMA_MAX_SPRITE_PIXELS (LUMA_MAX_SPRITE_DIM * LUMA_MAX_SPRITE_DIM)

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
    // V1.2 : sprite RGB565 du joueur (chargé depuis le LPK)
    bool player_sprite_loaded;
    uint16_t player_sprite_w;
    uint16_t player_sprite_h;
    uint16_t player_sprite_pixels[LUMA_MAX_SPRITE_PIXELS];
    // V1.5.4 : tileset RGB565 préchargé pour la map active
    luma_tileset_t active_tileset;

    // V1.5.9 — Event Sheet runtime
    // On stocke les events sous forme de pointeurs cJSON ; le runtime parse au boot
    // les types/params via le cJSON. Pas besoin de structs typées explosives.
    void *events_json;            // cJSON* tableau d'events (NULL si vide)
    int event_count;
    // Variables globales
    char var_names[LUMA_MAX_VARIABLES][LUMA_MAX_VAR_NAME];
    char var_values[LUMA_MAX_VARIABLES][LUMA_MAX_VAR_VALUE];
    int var_count;
    // Inputs
    uint8_t held_buttons;         // bitmask LUMA_BTN_*
    uint8_t prev_held_buttons;
    // Timers per-event (ms accumulés pour every_seconds)
    uint32_t event_timers[LUMA_MAX_EVENTS];
    // Collisions actives (pour ne fire qu'à l'entrée)
    uint32_t active_collisions[LUMA_MAX_EVENTS]; // packed: (idA<<16)|idB
    int active_collision_count;
    // Pending scene switch (action change_scene différée)
    char pending_scene_switch[LUMA_MAX_NAME];
    // V1.5.9 — dialogue_remaining_ms drives l'auto-clear de dialogue_text (déjà existant
    // dans la struct au-dessus). On laisse dialogue_active inchangé pour compat.
    uint32_t dialogue_remaining_ms;
    // V1.6.1 — Config du joueur (résolue depuis playerConfig du game.luma au boot scène)
    uint8_t player_behavior;          // 0=TopDown legacy, 1=TopDownMovement, 2=PlatformerMovement
    int16_t pl_gravity_x100;          // gravité ×100 (0.40 → 40)
    int16_t pl_jump_force_x10;        // force saut ×10 (5.5 → 55)
    int16_t pl_max_speed_x_x10;       // vitesse horiz max ×10
    int16_t pl_max_fall_x10;          // vitesse chute max ×10
    bool pl_diagonal;                 // TopDown : diagonal autorisé
} luma_runtime_t;

#define LUMA_PLAYER_BEH_LEGACY     0
#define LUMA_PLAYER_BEH_TOPDOWN    1
#define LUMA_PLAYER_BEH_PLATFORMER 2
