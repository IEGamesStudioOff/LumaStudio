#include "luma_audio.h"
#include "luma_config.h"
#include "driver/ledc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void luma_audio_init(void) {
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz = 440,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&timer);

    ledc_channel_config_t ch0 = {
        .gpio_num = LUMA_BUZZER_A,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0
    };
    ledc_channel_config(&ch0);

    ledc_channel_config_t ch1 = {
        .gpio_num = LUMA_BUZZER_B,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_1,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0
    };
    ledc_channel_config(&ch1);
}

void luma_audio_beep(uint8_t channel, uint16_t freq, uint16_t duration_ms) {
    ledc_channel_t ch = channel == 0 ? LEDC_CHANNEL_0 : LEDC_CHANNEL_1;
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_0, freq);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, ch, 256);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, ch);
    vTaskDelay(pdMS_TO_TICKS(duration_ms));
    ledc_set_duty(LEDC_LOW_SPEED_MODE, ch, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, ch);
}

void luma_audio_update(void) {
    // Future: non-blocking two-track music player from music.lmus/music JSON.
}
