#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef struct {
    bool up, down, left, right;
    bool a, b, start;
} luma_input_t;

void luma_input_init(void);
luma_input_t luma_input_read(void);
