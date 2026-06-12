const fs = require('fs');
const path = require('path');

const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');

let schedules = [];
let nextId = 0;
let fireFn = null;
let broadcastFn = null;
const firedThisMinute = {};

function load() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      const raw = fs.readFileSync(SCHEDULES_FILE, 'utf8');
      schedules = JSON.parse(raw);
      nextId = schedules.reduce((m, s) => Math.max(m, s.id + 1), 0);
    }
  } catch (err) {
    console.error('Failed to load schedules:', err.message);
  }
}

function save() {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
  } catch (err) {
    console.error('Failed to save schedules:', err.message);
  }
}

function init(fireCb, broadcast) {
  fireFn = fireCb;
  broadcastFn = broadcast;
  load();
}

function getAll() {
  return schedules;
}

function add(data) {
  const entry = {
    id: nextId++,
    time: data.time,
    dayMask: data.dayMask,
    actionId: data.actionId,
    actionName: data.actionName,
    active: data.active !== false,
  };
  if (data.acState) {
    entry.acState = data.acState;
  }
  schedules.push(entry);
  save();
  if (broadcastFn) broadcastFn(schedules);
  return entry;
}

function remove(id) {
  schedules = schedules.filter((s) => s.id !== id);
  save();
  if (broadcastFn) broadcastFn(schedules);
}

function update(id, data) {
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  Object.assign(schedules[idx], data);
  save();
  if (broadcastFn) broadcastFn(schedules);
  return true;
}

function check() {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dayBit = 1 << now.getDay();

  for (const s of schedules) {
    if (!s.active) continue;
    if ((s.dayMask & dayBit) === 0) continue;
    if (s.time !== timeStr) continue;
    if (firedThisMinute[s.id] === timeStr) continue;

    firedThisMinute[s.id] = timeStr;
    const ok = fireFn(s.actionId, s.acState || null);
    console.log(`[Scheduler] Fired "${s.actionName}" at ${timeStr} — ${ok ? 'sent' : 'ESP offline'}`);
  }
}

function startChecker(intervalMs) {
  setInterval(check, intervalMs || 30000);
  check();
}

module.exports = { init, getAll, add, remove, update, startChecker };
