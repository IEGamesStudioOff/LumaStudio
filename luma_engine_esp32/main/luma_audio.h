#pragma once
#include <stdint.h>
#include <stdbool.h>

void luma_audio_init(void);
void luma_audio_beep(uint8_t channel, uint16_t freq, uint16_t duration_ms);
void luma_audio_update(void);
