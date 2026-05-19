#pragma once
#include "luma_types.h"
#include <stdbool.h>

bool luma_game_load(luma_runtime_t *rt, const luma_game_entry_t *entry);
bool luma_game_load_first_scene(luma_runtime_t *rt);
void luma_game_unload(luma_runtime_t *rt);
