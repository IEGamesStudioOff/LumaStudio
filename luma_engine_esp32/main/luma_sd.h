#pragma once
#include "luma_types.h"
#include <stdbool.h>

bool luma_sd_mount(void);
void luma_sd_unmount(void);
int luma_scan_games(luma_game_entry_t *games, int max_games);
bool luma_read_text_file(const char *path, char **out_text, long *out_size);
