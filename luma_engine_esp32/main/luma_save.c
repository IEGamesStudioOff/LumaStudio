#include "luma_save.h"
#include "luma_config.h"
#include <stdio.h>
#include <string.h>
#include <ctype.h>

// Bug #11 fix: nettoyer le nom pour qu'il soit FAT-safe (pas d'espaces ni accents).
static void safe_name(const char *in, char *out, int out_len) {
    int j = 0;
    for (int i = 0; in[i] && j < out_len - 1; i++) {
        unsigned char c = (unsigned char)in[i];
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
            || c == '_' || c == '-') {
            out[j++] = (char)c;
        } else if (c == ' ' || c == '.') {
            out[j++] = '_';
        }
        // tout autre caractère (accents, /, \, etc.) est ignoré
    }
    if (j == 0) {
        // évite un nom vide
        const char *fallback = "save";
        for (int i = 0; fallback[i] && j < out_len - 1; i++) out[j++] = fallback[i];
    }
    out[j] = '\0';
}

static void save_path(luma_runtime_t *rt, char *out, int out_len) {
    char clean[LUMA_MAX_NAME];
    safe_name(rt->entry.name, clean, sizeof(clean));
    snprintf(out, out_len, "%s/%s.sav", LUMA_SAVES_DIR, clean);
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
