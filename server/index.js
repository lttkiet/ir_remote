const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const config = require('./config');
const espClient = require('./esp-client');
const scheduler = require('./scheduler');

// --- HTTP ---

const app = express();

if (config.authPassword) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="IR Remote"');
      return res.status(401).send('Authentication required');
    }
    const decoded = Buffer.from(auth.slice(6), 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (pass !== config.authPassword) {
      res.set('WWW-Authenticate', 'Basic realm="IR Remote"');
      return res.status(401).send('Authentication required');
    }
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// --- WebSocket ---

const browserWss = new WebSocketServer({ noServer: true });
const espWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url === config.espPath) {
    espWss.handleUpgrade(request, socket, head, (ws) => {
      espWss.emit('connection', ws, request);
    });
  } else {
    if (config.authPassword) {
      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Basic ')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="IR Remote"\r\n\r\n');
        socket.destroy();
        return;
      }
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      const [, pass] = decoded.split(':');
      if (pass !== config.authPassword) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="IR Remote"\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    browserWss.handleUpgrade(request, socket, head, (ws) => {
      browserWss.emit('connection', ws, request);
    });
  }
});

// --- Helpers ---

const browserClients = new Set();

function broadcastToBrowsers(data) {
  const json = JSON.stringify(data);
  for (const ws of browserClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(json);
    }
  }
}

function findAction(actionId) {
  for (const device of config.devices) {
    for (const action of device.actions) {
      if (`${device.id}:${action.id}` === actionId) return action;
    }
  }
  return null;
}

function isAcDevice(actionId) {
  const [devId] = actionId.split(':');
  const dev = config.devices.find((d) => d.id === devId);
  return dev && dev.type === 'ac';
}

// --- ESP client ---

espClient.init(espWss, (connected, rssi) => {
  broadcastToBrowsers({ type: 'esp_status', connected, rssi });
});

function handleSendCommand(actionId) {
  const action = findAction(actionId);
  if (!action) return { success: false, error: 'Unknown action' };
  const ok = espClient.sendIr(action.code, action.protocol, action.nbits);
  return { success: ok, actionName: action.name, error: ok ? null : 'ESP not connected' };
}

let lastAcState = null;

function handleAcState(state) {
  lastAcState = state;
  const ok = espClient.sendAcState(state);
  return { success: ok, error: ok ? null : 'ESP not connected' };
}

// --- Scheduler ---

scheduler.init(
  (actionId, acState) => {
    if (acState) return espClient.sendAcState(acState);
    const action = findAction(actionId);
    if (!action) return false;
    return espClient.sendIr(action.code, action.protocol, action.nbits);
  },
  (schedules) => broadcastToBrowsers({ type: 'schedules', schedules })
);
scheduler.startChecker(30000);

// --- Browser WS ---

browserWss.on('connection', (ws) => {
  browserClients.add(ws);

  // Send initial state
  ws.send(JSON.stringify({ type: 'esp_status', ...espClient.getStatus() }));
  ws.send(JSON.stringify({ type: 'schedules', schedules: scheduler.getAll() }));
  ws.send(JSON.stringify({ type: 'devices', devices: config.devices }));
  if (lastAcState) {
    ws.send(JSON.stringify({ type: 'ac_state_persisted', state: lastAcState }));
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'command': {
        const result = handleSendCommand(msg.actionId);
        ws.send(JSON.stringify({ type: 'command_result', ...result }));
        break;
      }
      case 'ac_state': {
        const result = handleAcState(msg.state);
        ws.send(JSON.stringify({ type: 'command_result', ...result, actionName: 'AC' }));
        break;
      }
      case 'schedule_add':
        scheduler.add(msg.schedule);
        break;
      case 'schedule_remove':
        scheduler.remove(msg.id);
        break;
      case 'schedule_update':
        scheduler.update(msg.id, msg.schedule);
        break;
      case 'custom_ir': {
        const code = parseInt(msg.code, 16);
        if (!isNaN(code) && code > 0) {
          const protocol = msg.protocol || 'NEC';
          const nbits = msg.nbits != null ? msg.nbits : undefined;
          const ok = espClient.sendIr(code, protocol, nbits);
          ws.send(JSON.stringify({ type: 'command_result', success: ok, actionName: 'Custom', error: ok ? null : 'ESP not connected' }));
        }
        break;
      }
    }
  });

  ws.on('close', () => browserClients.delete(ws));
});

// --- Start ---

server.listen(config.port, () => {
  console.log(`IR Remote Server running on http://localhost:${config.port}`);
  console.log(`ESP WebSocket path: ws://host:${config.port}${config.espPath}`);
  console.log(`Configured devices: ${config.devices.map((d) => d.name).join(', ')}`);
});
