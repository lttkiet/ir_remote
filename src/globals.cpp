#include "globals.h"

IRsend irsend(kIrLed);
IRGreeAC ac(kIrLed);
WebSocketsClient webSocket;
unsigned long lastHeartbeat = 0;
