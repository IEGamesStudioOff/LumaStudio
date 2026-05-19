# Luma Engine ESP32 v1.0

## But

Ce dossier contient le premier moteur console ESP-IDF pour Luma.

Il lit les jeux exportés par Luma Studio dans :

```txt
/sdcard/jeux/NomDuJeu/
  manifest.json
  game.luma
  assets.lpk
```

## Compilation

Ouvre ce dossier avec ESP-IDF puis :

```bash
idf.py set-target esp32
idf.py build
idf.py flash monitor
```

## Câblage attendu

ST7735 :
- SCK 18
- MOSI 23
- MISO 19
- DC 2
- RST 4
- CS 5

SD :
- CS 15

Boutons :
- UP 32
- DOWN 33
- RIGHT 27
- LEFT 14
- A 12
- B 13
- START 21

Audio :
- Buzzer A 25
- Buzzer B 26

## Notes

GPIO34 ne peut pas piloter un buzzer sur ESP32 classique car c’est une entrée uniquement.
La V1.0 utilise donc 25 et 26 comme pins audio par défaut.
