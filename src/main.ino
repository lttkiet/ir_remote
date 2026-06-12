#include <ArduinoOTA.h>
#include <WiFiManager.h>

#include "globals.h"
#include "websocket_handler.h"

void setup() {
  Serial.begin(115200);

  irsend.begin();

  EEPROM.begin(512);

  char wsHost[EEPROM_WS_HOST_SIZE] = "";
  uint16_t wsPort = 81;
  bool wsConfigured = (EEPROM.read(EEPROM_WS_MAGIC) == EEPROM_WS_MAGIC_VAL);
  if (wsConfigured) {
    for (int i = 0; i < EEPROM_WS_HOST_SIZE; i++) {
      char c = EEPROM.read(EEPROM_WS_HOST + i);
      wsHost[i] = c;
      if (c == '\0')
        break;
    }
    wsHost[EEPROM_WS_HOST_SIZE - 1] = '\0';
    EEPROM.get(EEPROM_WS_PORT, wsPort);
  }

  char wsPortStr[8];
  snprintf(wsPortStr, sizeof(wsPortStr), "%u", wsPort);

  WiFiManagerParameter custom_ws_host("ws_host", "WebSocket Server IP", wsHost, EEPROM_WS_HOST_SIZE);
  WiFiManagerParameter custom_ws_port("ws_port", "WebSocket Port", wsPortStr, 6);

  WiFiManager wifiManager;
  wifiManager.addParameter(&custom_ws_host);
  wifiManager.addParameter(&custom_ws_port);

  if (!wsConfigured) {
    Serial.println("WS config not found in EEPROM — forcing setup portal");
    wifiManager.resetSettings();
  }

  if (!wifiManager.autoConnect("SmartHub_Setup")) {
    Serial.println("WiFiManager: Failed to connect. Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());

  String newHost = custom_ws_host.getValue();
  uint16_t newPort = (uint16_t) atoi(custom_ws_port.getValue());

  if (!wsConfigured || newHost != String(wsHost) || newPort != wsPort) {
    EEPROM.write(EEPROM_WS_MAGIC, EEPROM_WS_MAGIC_VAL);
    int len = min((int) newHost.length(), EEPROM_WS_HOST_SIZE - 1);
    for (int i = 0; i < len; i++) {
      EEPROM.write(EEPROM_WS_HOST + i, newHost[i]);
    }
    EEPROM.write(EEPROM_WS_HOST + len, '\0');
    EEPROM.put(EEPROM_WS_PORT, newPort);
    EEPROM.commit();
    Serial.printf("Saved WS config: %s:%u\n", newHost.c_str(), newPort);
  }

  ArduinoOTA.setHostname("SmartHub");
  ArduinoOTA.setPassword(OTA_PASSWORD);
  ArduinoOTA.onStart([]() { Serial.println("OTA: Starting..."); });
  ArduinoOTA.onEnd([]() { Serial.println("OTA: Complete."); });
  ArduinoOTA.onProgress(
      [](unsigned int progress, unsigned int total) { Serial.printf("OTA: %u%%\r", (progress * 100) / total); });
  ArduinoOTA.onError([](ota_error_t error) { Serial.printf("OTA: Error %u\n", error); });
  ArduinoOTA.begin();
  Serial.println("OTA ready");

  webSocket.beginSSL(newHost.c_str(), newPort, "/esp");
  webSocket.onEvent(webSocketEvent);
  Serial.printf("WebSocket client connecting to wss://%s:%u/esp\n", newHost.c_str(), newPort);
}

void loop() {
  webSocket.loop();
  ArduinoOTA.handle();

  if (millis() - lastHeartbeat > 10000) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }
}
