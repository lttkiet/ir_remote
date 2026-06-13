const fs = require('fs');
const path = require('path');

const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');

let schedules = [];
let nextId = 0;
let fireFn = null;
let broadcastFn = null;
const firedToday = {};

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
    tzOffset: data.tzOffset || 0,
  };
  if (data.acState) entry.acState = data.acState;
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
  if (data.tzOffset !== undefined) schedules[idx].tzOffset = data.tzOffset;
  save();
  if (broadcastFn) broadcastFn(schedules);
  return true;
}

function check() {
  const now = Date.now();

  for (const s of schedules) {
    if (!s.active) continue;

    const tzMs = (s.tzOffset || 0) * 60000;
    const localNow = new Date(now + tzMs);
    const timeStr = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}`;
    const dayBit = 1 << localNow.getDay();
    const dateKey = `${localNow.getFullYear()}-${localNow.getMonth()}-${localNow.getDate()}`;

    if ((s.dayMask & dayBit) === 0) continue;

    const sTime = s.time.length >= 5 ? s.time.substring(0, 5) : s.time;
    if (sTime !== timeStr) continue;

    const fireKey = `${dateKey}_${s.id}`;
    if (firedToday[fireKey]) continue;

    firedToday[fireKey] = true;
    const ok = fireFn(s.actionId, s.acState || null);
    console.log(`[Scheduler] Fired "${s.actionName}" at ${timeStr} — ${ok ? 'sent' : 'ESP offline'}`);
  }
}

function startChecker(intervalMs) {
  setInterval(check, intervalMs || 30000);
  setTimeout(check, 1000);
}

module.exports = { init, getAll, add, remove, update, startChecker };