#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#include "globals.h"

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length);
void sendHeartbeat();
decode_type_t strToType(const String& name);

#endif
