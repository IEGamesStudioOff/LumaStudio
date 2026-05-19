#include "luma_game.h"
#include "luma_sd.h"
#include "esp_log.h"
#include "cJSON.h"
#include <string.h>
#include <stdlib.h>

static const char *TAG = "LUMA_GAME";
static cJSON *s_game_json = NULL;

static const cJSON *get_array(const char *name) {
    if (!s_game_json) return NULL;
    return cJSON_GetObjectItem(s_game_json, name);
}

bool luma_game_load(luma_runtime_t *rt, const luma_game_entry_t *entry) {
    memset(rt, 0, sizeof(*rt));
    memcpy(&rt->entry, entry, sizeof(*entry));

    if (entry->secure) {
        ESP_LOGW(TAG, "Secure game is not supported yet in runtime 1.0 skeleton.");
        return false;
    }

    char *text = NULL;
    long size = 0;
    if (!luma_read_text_file(entry->game_path, &text, &size)) {
        ESP_LOGE(TAG, "Cannot read game file: %s", entry->game_path);
        return false;
    }

    s_game_json = cJSON_Parse(text);
    free(text);

    if (!s_game_json) {
        ESP_LOGE(TAG, "Invalid game.luma JSON container.");
        return false;
    }

    rt->running = true;
    return luma_game_load_first_scene(rt);
}

bool luma_game_load_first_scene(luma_runtime_t *rt) {
    const cJSON *scenes = get_array("scenes");
    const cJSON *maps = get_array("maps");

    if (!cJSON_IsArray(scenes) || cJSON_GetArraySize(scenes) == 0) {
        ESP_LOGW(TAG, "No scenes in game. Using empty test scene.");
        strcpy(rt->active_scene.id, "empty_scene");
        strcpy(rt->active_scene.name, "Empty Scene");
        rt->active_scene.spawn_x = 32;
        rt->active_scene.spawn_y = 32;
        rt->player.x = 32;
        rt->player.y = 32;
        return true;
    }

    const cJSON *scene = cJSON_GetArrayItem(scenes, 0);
    const cJSON *sid = cJSON_GetObjectItem(scene, "id");
    const cJSON *sname = cJSON_GetObjectItem(scene, "name");
    const cJSON *mapId = cJSON_GetObjectItem(scene, "mapId");
    const cJSON *music = cJSON_GetObjectItem(scene, "music");
    const cJSON *cameraMode = cJSON_GetObjectItem(scene, "cameraMode");
    const cJSON *spawn = cJSON_GetObjectItem(scene, "playerSpawn");

    if (cJSON_IsString(sid)) strncpy(rt->active_scene.id, sid->valuestring, LUMA_MAX_NAME - 1);
    if (cJSON_IsString(sname)) strncpy(rt->active_scene.name, sname->valuestring, LUMA_MAX_NAME - 1);
    if (cJSON_IsString(mapId)) strncpy(rt->active_scene.map_id, mapId->valuestring, LUMA_MAX_NAME - 1);
    if (cJSON_IsString(music)) strncpy(rt->active_scene.music, music->valuestring, LUMA_MAX_NAME - 1);
    if (cJSON_IsString(cameraMode)) strncpy(rt->active_scene.camera_mode, cameraMode->valuestring, 23);

    if (spawn) {
        const cJSON *x = cJSON_GetObjectItem(spawn, "x");
        const cJSON *y = cJSON_GetObjectItem(spawn, "y");
        rt->active_scene.spawn_x = cJSON_IsNumber(x) ? x->valueint : 32;
        rt->active_scene.spawn_y = cJSON_IsNumber(y) ? y->valueint : 32;
    } else {
        rt->active_scene.spawn_x = 32;
        rt->active_scene.spawn_y = 32;
    }

    rt->player.x = rt->active_scene.spawn_x;
    rt->player.y = rt->active_scene.spawn_y;
    rt->player.hp = 3;

    // Load map metadata from game JSON
    if (cJSON_IsArray(maps)) {
        for (int i = 0; i < cJSON_GetArraySize(maps); i++) {
            const cJSON *map = cJSON_GetArrayItem(maps, i);
            const cJSON *id = cJSON_GetObjectItem(map, "id");
            if (cJSON_IsString(id) && strcmp(id->valuestring, rt->active_scene.map_id) == 0) {
                const cJSON *w = cJSON_GetObjectItem(map, "width");
                const cJSON *h = cJSON_GetObjectItem(map, "height");
                const cJSON *tile = cJSON_GetObjectItem(map, "tileSize");
                strncpy(rt->active_map.id, id->valuestring, LUMA_MAX_NAME - 1);
                rt->active_map.width = cJSON_IsNumber(w) ? w->valueint : 20;
                rt->active_map.height = cJSON_IsNumber(h) ? h->valueint : 15;
                rt->active_map.tile_size = cJSON_IsNumber(tile) ? tile->valueint : 16;
                break;
            }
        }
    }

    if (rt->active_map.tile_size == 0) {
        rt->active_map.width = 20;
        rt->active_map.height = 15;
        rt->active_map.tile_size = 16;
    }

    ESP_LOGI(TAG, "Loaded scene: %s", rt->active_scene.id);
    return true;
}

void luma_game_unload(luma_runtime_t *rt) {
    if (s_game_json) {
        cJSON_Delete(s_game_json);
        s_game_json = NULL;
    }
    memset(rt, 0, sizeof(*rt));
}
