let espConnection = null;
let espConnected = false;
let espRssi = 0;
let onStatusChange = null;

function init(espWss, statusCallback) {
  onStatusChange = statusCallback;

  espWss.on('connection', (ws) => {
    if (espConnection) {
      espConnection.close();
    }
    espConnection = ws;
    espConnected = true;
    espRssi = 0;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'heartbeat') {
          espRssi = msg.rssi;
          if (onStatusChange) onStatusChange(true, espRssi);
        }
      } catch {
        // ignore non-JSON messages
      }
    });

    ws.on('close', () => {
      if (espConnection === ws) {
        espConnection = null;
        espConnected = false;
        espRssi = 0;
        if (onStatusChange) onStatusChange(false, 0);
      }
    });
  });
}

function sendIr(code, protocol, nbits) {
  if (espConnection && espConnected) {
    const p = (protocol || 'NEC').toUpperCase();
    const hex = `0x${code.toString(16).toUpperCase()}`;
    const msg = nbits != null ? `IR:${p}:${hex}:${nbits}` : `IR:${p}:${hex}`;
    espConnection.send(msg);
    return true;
  }
  return false;
}

function sendAcState(state) {
  if (!espConnection || !espConnected) return false;
  const msg = `AC:STATE:${state.power ? 1 : 0}:${state.mode}:${state.temp}:${state.fan}:${state.turbo ? 1 : 0}:${state.light ? 1 : 0}:${state.sleep ? 1 : 0}:${state.swingVAuto ? 1 : 0}:${state.swingVPos}:${state.dispTemp}`;
  espConnection.send(msg);
  return true;
}

function getStatus() {
  return { connected: espConnected, rssi: espRssi };
}

module.exports = { init, sendIr, sendAcState, getStatus };
