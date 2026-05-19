#include "luma_save.h"
#include "luma_config.h"
#include <stdio.h>
#include <string.h>

static void save_path(luma_runtime_t *rt, char *out, int out_len) {
    snprintf(out, out_len, "%s/%s.sav", LUMA_SAVES_DIR, rt->entry.name);
}

bool luma_save_game(luma_runtime_t *rt) {
    char path[LUMA_MAX_PATH];
    save_path(rt, path, sizeof(path));

    FILE *f = fopen(path, "wb");
    if (!f) return false;

    fwrite("LUMASAVE1", 1, 9, f);
    fwrite(&rt->player, sizeof(rt->player), 1, f);
    fwrite(rt->active_scene.id, 1, LUMA_MAX_NAME, f);

    fclose(f);
    return true;
}

bool luma_load_save(luma_runtime_t *rt) {
    char path[LUMA_MAX_PATH];
    save_path(rt, path, sizeof(path));

    FILE *f = fopen(path, "rb");
    if (!f) return false;

    char magic[10] = {0};
    fread(magic, 1, 9, f);
    if (strcmp(magic, "LUMASAVE1") != 0) {
        fclose(f);
        return false;
    }

    fread(&rt->player, sizeof(rt->player), 1, f);
    fclose(f);
    return true;
}
