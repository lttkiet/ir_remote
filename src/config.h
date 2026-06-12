#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <IRsend.h>
#include <WebSocketsClient.h>
#include <ir_Gree.h>

#define OTA_PASSWORD "smartir"

constexpr uint16_t kIrLed = 14;

// EEPROM layout for WS server config
constexpr int EEPROM_WS_MAGIC = 0;
constexpr int EEPROM_WS_HOST = 1;
constexpr int EEPROM_WS_HOST_SIZE = 64;
constexpr int EEPROM_WS_PORT = EEPROM_WS_HOST + EEPROM_WS_HOST_SIZE;
constexpr uint8_t EEPROM_WS_MAGIC_VAL = 0xDA;

#endif
