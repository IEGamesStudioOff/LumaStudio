#pragma once

#include <stdint.h>
#include <stdbool.h>

#define LUMA_VERSION "1.0.0"

// Screen
#define LUMA_LCD_WIDTH   160
#define LUMA_LCD_HEIGHT  128

// ST7735 pins, based on your current Luma wiring
#define LUMA_LCD_HOST    SPI2_HOST
#define LUMA_PIN_MOSI    23
#define LUMA_PIN_MISO    19
#define LUMA_PIN_SCLK    18
#define LUMA_PIN_LCD_CS  5
#define LUMA_PIN_LCD_DC  2
#define LUMA_PIN_LCD_RST 4

// SD SPI
#define LUMA_PIN_SD_CS   15

// Buttons
#define LUMA_BTN_UP      32
#define LUMA_BTN_DOWN    33
#define LUMA_BTN_RIGHT   27
#define LUMA_BTN_LEFT    14
#define LUMA_BTN_A       12
#define LUMA_BTN_B       13
#define LUMA_BTN_START   21

// Audio pins
// WARNING: GPIO34 is input-only on classic ESP32.
// Move buzzer A/B to output-capable pins on real hardware.
#define LUMA_BUZZER_A    25
#define LUMA_BUZZER_B    26

// Paths
#define LUMA_SD_MOUNT        "/sdcard"
#define LUMA_GAMES_DIR       "/sdcard/jeux"
#define LUMA_SAVES_DIR       "/sdcard/sauvegardes"

#define LUMA_MAX_GAMES       32
#define LUMA_MAX_PATH        192
#define LUMA_MAX_NAME        48
#define LUMA_MAX_OBJECTS     32
#define LUMA_MAX_TRIGGERS    32
#define LUMA_MAX_SCENES      32
#define LUMA_MAX_ASSETS      256
#define LUMA_MAX_DIALOGUE    256

// RGB565 colors
#define LUMA_BLACK   0x0000
#define LUMA_WHITE   0xFFFF
#define LUMA_BLUE    0x001F
#define LUMA_RED     0xF800
#define LUMA_GREEN   0x07E0
#define LUMA_YELLOW  0xFFE0
#define LUMA_CYAN    0x07FF
#define LUMA_MAGENTA 0xF81F
#define LUMA_GRAY    0x8410
