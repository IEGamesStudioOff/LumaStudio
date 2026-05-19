#include "luma_input.h"
#include "luma_config.h"
#include "driver/gpio.h"

static bool read_btn(gpio_num_t pin) {
    return gpio_get_level(pin) == 0;
}

void luma_input_init(void) {
    gpio_config_t io = {
        .pin_bit_mask =
            (1ULL << LUMA_BTN_UP) |
            (1ULL << LUMA_BTN_DOWN) |
            (1ULL << LUMA_BTN_LEFT) |
            (1ULL << LUMA_BTN_RIGHT) |
            (1ULL << LUMA_BTN_A) |
            (1ULL << LUMA_BTN_B) |
            (1ULL << LUMA_BTN_START),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&io);
}

luma_input_t luma_input_read(void) {
    luma_input_t in = {
        .up = read_btn(LUMA_BTN_UP),
        .down = read_btn(LUMA_BTN_DOWN),
        .left = read_btn(LUMA_BTN_LEFT),
        .right = read_btn(LUMA_BTN_RIGHT),
        .a = read_btn(LUMA_BTN_A),
        .b = read_btn(LUMA_BTN_B),
        .start = read_btn(LUMA_BTN_START)
    };
    return in;
}
