#include "luma_audio.h"
#include "luma_config.h"
#include "driver/ledc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"

// Bug #7 fix: deux timers indépendants pour que les buzzers A et B puissent
// jouer des fréquences différentes en parallèle.
// Bug #7 fix bis: beep non-bloquant — on arme un end_us et `audio_update`
// coupe le son quand le moment est venu, sans `vTaskDelay`.

typedef struct {
    ledc_channel_t channel;
    ledc_timer_t timer;
    int gpio;
    int64_t end_us;     // 0 = pas de son actif
    bool active;
} audio_ch_t;

static audio_ch_t s_channels[2];

static void setup_channel(audio_ch_t *c, ledc_channel_t ch, ledc_timer_t timer, int gpio) {
    c->channel = ch;
    c->timer = timer;
    c->gpio = gpio;
    c->end_us = 0;
    c->active = false;

    ledc_timer_config_t tcfg = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = timer,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz = 440,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&tcfg);

    ledc_channel_config_t ccfg = {
        .gpio_num = gpio,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = ch,
        .timer_sel = timer,
        .duty = 0
    };
    ledc_channel_config(&ccfg);
}

void luma_audio_init(void) {
    setup_channel(&s_channels[0], LEDC_CHANNEL_0, LEDC_TIMER_0, LUMA_BUZZER_A);
    setup_channel(&s_channels[1], LEDC_CHANNEL_1, LEDC_TIMER_1, LUMA_BUZZER_B);
}

void luma_audio_beep(uint8_t channel, uint16_t freq, uint16_t duration_ms) {
    if (channel > 1) return;
    audio_ch_t *c = &s_channels[channel];
    if (freq < 20) freq = 20;
    ledc_set_freq(LEDC_LOW_SPEED_MODE, c->timer, freq);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, c->channel, 256); // ~25% duty (square audible)
    ledc_update_duty(LEDC_LOW_SPEED_MODE, c->channel);
    c->end_us = esp_timer_get_time() + ((int64_t)duration_ms * 1000);
    c->active = true;
}

void luma_audio_update(void) {
    int64_t now = esp_timer_get_time();
    for (int i = 0; i < 2; i++) {
        audio_ch_t *c = &s_channels[i];
        if (c->active && now >= c->end_us) {
            ledc_set_duty(LEDC_LOW_SPEED_MODE, c->channel, 0);
            ledc_update_duty(LEDC_LOW_SPEED_MODE, c->channel);
            c->active = false;
            c->end_us = 0;
        }
    }
}
