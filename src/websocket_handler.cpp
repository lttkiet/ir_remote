#include "websocket_handler.h"

#include <IRutils.h>

static void handleIrCommand(const String& msg);
static void handleAcStateCommand(const String& msg);

static void handleAcStateCommand(const String& msg) {
  if (!msg.startsWith("AC:STATE:"))
    return;

  String params = msg.substring(9);
  int p1 = params.indexOf(':');
  int p2 = params.indexOf(':', p1 + 1);
  int p3 = params.indexOf(':', p2 + 1);
  int p4 = params.indexOf(':', p3 + 1);
  int p5 = params.indexOf(':', p4 + 1);
  int p6 = params.indexOf(':', p5 + 1);
  int p7 = params.indexOf(':', p6 + 1);
  int p8 = params.indexOf(':', p7 + 1);
  int p9 = params.indexOf(':', p8 + 1);
  if (p1 < 0 || p2 < 0 || p3 < 0 || p4 < 0 || p5 < 0 || p6 < 0 || p7 < 0 || p8 < 0 || p9 < 0)
    return;

  bool acPower = params.substring(0, p1).toInt() != 0;
  uint8_t acMode = params.substring(p1 + 1, p2).toInt();
  uint8_t acTemp = constrain(params.substring(p2 + 1, p3).toInt(), 16, 30);
  uint8_t acFan = params.substring(p3 + 1, p4).toInt();
  bool acTurbo = params.substring(p4 + 1, p5).toInt() != 0;
  bool acLight = params.substring(p5 + 1, p6).toInt() != 0;
  bool acSleep = params.substring(p6 + 1, p7).toInt() != 0;
  bool acSwingVAuto = params.substring(p7 + 1, p8).toInt() != 0;
  uint8_t acSwingVPos = params.substring(p8 + 1, p9).toInt();
  uint8_t acDispTemp = params.substring(p9 + 1).toInt();

  ac.setPower(acPower);
  ac.setMode(acMode);
  ac.setTemp(acTemp);
  ac.setFan(acFan);
  ac.setTurbo(acTurbo);
  ac.setLight(acLight);
  ac.setSleep(acSleep);
  ac.setEcono(false);
  ac.setXFan(false);
  ac.setIFeel(false);
  ac.setWiFi(false);
  ac.setTimer(0);
  ac.setDisplayTempSource(acDispTemp);
  ac.setSwingVertical(acSwingVAuto, acSwingVPos);
  ac.send();
  Serial.printf("AC: power=%d mode=%d temp=%d fan=%d turbo=%d light=%d sleep=%d swingVAuto=%d swingVPos=%d disp=%d\n",
                acPower, acMode, acTemp, acFan, acTurbo, acLight, acSleep, acSwingVAuto, acSwingVPos, acDispTemp);
}

decode_type_t strToType(const String& name) {
  if (name == "NEC")
    return NEC;
  if (name == "NEC_LIKE")
    return NEC_LIKE;
  if (name == "SONY")
    return SONY;
  if (name == "SONY_38K")
    return SONY_38K;
  if (name == "RC5")
    return RC5;
  if (name == "RC5X")
    return RC5X;
  if (name == "RC6")
    return RC6;
  if (name == "RCMM")
    return RCMM;
  if (name == "SAMSUNG")
    return SAMSUNG;
  if (name == "SAMSUNG36")
    return SAMSUNG36;
  if (name == "LG")
    return LG;
  if (name == "LG2")
    return LG2;
  if (name == "JVC")
    return JVC;
  if (name == "PANASONIC")
    return PANASONIC;
  if (name == "SHARP")
    return SHARP;
  if (name == "DENON")
    return DENON;
  if (name == "DISH")
    return DISH;
  if (name == "WHYNTER")
    return WHYNTER;
  if (name == "COOLIX")
    return COOLIX;
  if (name == "MIDEA")
    return MIDEA;
  if (name == "TECO")
    return TECO;
  if (name == "PIONEER")
    return PIONEER;
  if (name == "SHERWOOD")
    return SHERWOOD;
  if (name == "MITSUBISHI")
    return MITSUBISHI;
  if (name == "MITSUBISHI2")
    return MITSUBISHI2;
  if (name == "NIKAI")
    return NIKAI;
  if (name == "BOSE")
    return BOSE;
  if (name == "KELON")
    return KELON;
  if (name == "AIWA_RC_T501")
    return AIWA_RC_T501;
  if (name == "SANYO_LC7461")
    return SANYO_LC7461;
  if (name == "GREE")
    return GREE;
  return UNKNOWN;
}

static void handleIrCommand(const String& msg) {
  if (msg.startsWith("IR:CODE:") || msg.startsWith("IR:NEC:")) {
    String hexPart = msg.substring(msg.indexOf(':', 3) + 1);
    int colonPos = hexPart.indexOf(':');
    if (colonPos > 0)
      hexPart = hexPart.substring(0, colonPos);
    uint64_t code = strtoull(hexPart.c_str(), nullptr, 16);
    if (code != 0) {
      irsend.sendNEC(code, 32);
      Serial.printf("Sent NEC: 0x%08llX\n", code);
    }
    return;
  }

  if (!msg.startsWith("IR:"))
    return;
  String rest = msg.substring(3);
  int colon1 = rest.indexOf(':');
  if (colon1 < 0)
    return;

  String protocol = rest.substring(0, colon1);
  rest = rest.substring(colon1 + 1);

  int colon2 = rest.indexOf(':');
  String hexPart;
  uint16_t nbits = 0;

  if (colon2 < 0) {
    hexPart = rest;
  } else {
    hexPart = rest.substring(0, colon2);
    nbits = (uint16_t) rest.substring(colon2 + 1).toInt();
  }

  uint64_t code = strtoull(hexPart.c_str(), nullptr, 16);
  if (code == 0)
    return;

  decode_type_t type = strToType(protocol);
  if (type == UNKNOWN) {
    Serial.printf("Unknown protocol: %s\n", protocol.c_str());
    return;
  }

  if (nbits == 0)
    nbits = IRsend::defaultBits(type);

  bool ok = irsend.send(type, code, nbits);
  if (ok) {
    Serial.printf("Sent %s: 0x%llX (%d bits)\n", protocol.c_str(), code, nbits);
  } else {
    Serial.printf("Failed %s: 0x%llX\n", protocol.c_str(), code);
  }
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.print("WS: Disconnected");
      if (payload && length > 0) {
        Serial.print(" (");
        for (size_t i = 0; i < length; i++)
          Serial.print((char) payload[i]);
        Serial.print(")");
      }
      Serial.println();
      break;
    case WStype_CONNECTED:
      Serial.printf("WS: Connected to %s\n", (const char*) payload);
      break;
    case WStype_TEXT:
      if (payload != nullptr && length > 0) {
        String msg;
        msg.reserve(length);
        for (size_t i = 0; i < length; i++)
          msg += static_cast<char>(payload[i]);
        if (msg.startsWith("AC:STATE:"))
          handleAcStateCommand(msg);
        else
          handleIrCommand(msg);
      }
      break;
    default:
      break;
  }
}

void sendHeartbeat() {
  String json = "{\"type\":\"heartbeat\",\"rssi\":";
  json += WiFi.RSSI();
  json += "}";
  webSocket.sendTXT(json);
}