const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const AC_MODE_LABELS = ['Auto', 'Cool', 'Dry', 'Heat', 'Fan'];

let ws = null;
let devices = [];
let schedules = [];
let editingId = null;
let acScheduling = false;

let acState = {
  power: false,
  mode: 1,
  temp: 25,
  fan: 0,
  turbo: false,
  light: false,
  sleep: false,
  swingVAuto: false,
  swingVPos: 0,
  dispTemp: 0,
};

// --- DOM refs ---

const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const statusRssi = document.getElementById('statusRssi');
const devicesEl = document.getElementById('devices');
const acPanel = document.getElementById('acPanel');
const scheduleList = document.getElementById('scheduleList');
const scheduleEmpty = document.getElementById('scheduleEmpty');
const addScheduleBtn = document.getElementById('addScheduleBtn');
const modal = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const scheduleForm = document.getElementById('scheduleForm');
const formTime = document.getElementById('formTime');
const formAction = document.getElementById('formAction');
const modalCancel = document.getElementById('modalCancel');
const formAcStateInfo = document.getElementById('formAcStateInfo');
const customIrInput = document.getElementById('customIrInput');
const customIrProtocol = document.getElementById('customIrProtocol');
const customIrNbits = document.getElementById('customIrNbits');
const customIrBtn = document.getElementById('customIrBtn');

// --- WebSocket ---

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/`);

  ws.onopen = () => console.log('WS connected');

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  };

  ws.onclose = () => {
    statusDot.className = 'dot offline';
    statusLabel.textContent = 'Disconnected';
    statusRssi.textContent = '';
    setTimeout(connectWs, 3000);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'esp_status':
      statusDot.className = `dot ${msg.connected ? 'online' : 'offline'}`;
      statusLabel.textContent = msg.connected ? 'Connected' : 'Disconnected';
      statusRssi.textContent = msg.connected ? ` ${msg.rssi} dBm` : '';
      break;
    case 'devices':
      devices = msg.devices || [];
      renderDevices();
      populateActionSelect();
      if (devices.some((d) => d.type === 'ac')) {
        initAcPanel();
      }
      break;
    case 'schedules':
      schedules = msg.schedules || [];
      renderSchedules();
      break;
    case 'ac_state_persisted':
      acState = { ...acState, ...msg.state };
      renderAcUi();
      break;
    case 'command_result':
      flashFeedback(msg.success ? `${msg.actionName || 'Command'} sent` : msg.error || 'Failed');
      break;
  }
}

function sendMsg(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// --- Feedback toast ---

function flashFeedback(text) {
  let el = document.getElementById('feedback');
  if (!el) {
    el = document.createElement('div');
    el.id = 'feedback';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:200;transition:opacity 0.3s';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

// --- Devices ---

function renderDevices() {
  devicesEl.innerHTML = devices
    .filter((d) => d.type !== 'ac')
    .map((device) => {
      const isOpen = localStorage.getItem(`collapse:${device.id}`) !== 'closed';
      return `
      <div class="device-card">
        <div class="card-header" data-device="${device.id}">
          <h3>${escapeHtml(device.name)}</h3>
          <span class="collapse-icon">${isOpen ? '▾' : '▸'}</span>
        </div>
        <div class="card-body ${isOpen ? '' : 'collapsed'}">
          <div class="action-grid">
            ${device.actions.map((a) => `
              <button class="action-btn" data-device="${device.id}" data-action="${a.id}">
                ${escapeHtml(a.name)}
              </button>
            `).join('')}
          </div>
        </div>
      </div>`;
    }).join('');

  devicesEl.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendMsg({ type: 'command', actionId: `${btn.dataset.device}:${btn.dataset.action}` });
    });
  });

  devicesEl.querySelectorAll('.card-header').forEach((hdr) => {
    hdr.addEventListener('click', () => {
      const devId = hdr.dataset.device;
      const body = hdr.nextElementSibling;
      const icon = hdr.querySelector('.collapse-icon');
      const isCollapsed = body.classList.toggle('collapsed');
      icon.textContent = isCollapsed ? '▸' : '▾';
      localStorage.setItem(`collapse:${devId}`, isCollapsed ? 'closed' : 'open');
    });
  });
}

// --- Custom IR ---

customIrInput.addEventListener('input', () => {
  customIrBtn.disabled = customIrInput.value.trim() === '';
});

customIrInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !customIrBtn.disabled) customIrBtn.click();
});

customIrBtn.addEventListener('click', () => {
  const raw = customIrInput.value.trim();
  const protocol = customIrProtocol.value;
  const nbitsVal = customIrNbits.value.trim();
  const nbits = nbitsVal !== '' ? parseInt(nbitsVal) : undefined;
  sendMsg({ type: 'custom_ir', code: raw, protocol, nbits });
  flashFeedback('Custom IR sent');
});

// --- AC Panel ---

function acSendNow() {
  sendMsg({ type: 'ac_state', state: { ...acState } });
}

function initAcPanel() {
  acPanel.classList.remove('hidden');

  const hdr = acPanel.querySelector('.card-header');
  const body = acPanel.querySelector('.card-body');
  const icon = hdr.querySelector('.collapse-icon');
  const isOpen = localStorage.getItem('collapse:ac') !== 'closed';

  body.classList.toggle('collapsed', !isOpen);
  icon.textContent = isOpen ? '▾' : '▸';

  hdr.addEventListener('click', () => {
    const collapsed = body.classList.toggle('collapsed');
    icon.textContent = collapsed ? '▸' : '▾';
    localStorage.setItem('collapse:ac', collapsed ? 'closed' : 'open');
  });

  attachAcListeners();
}

function acLabel() {
  return `AC — ${acState.power ? 'ON' : 'OFF'} ${AC_MODE_LABELS[acState.mode]} ${acState.temp}°C`;
}

function renderAcUi() {
  const powerBtn = document.getElementById('acPower');
  powerBtn.textContent = acState.power ? 'ON' : 'OFF';
  powerBtn.className = `toggle-btn ${acState.power ? 'on' : 'off'}`;

  document.querySelectorAll('#acMode .mode-btn').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.value) === acState.mode);
  });

  document.getElementById('acTempValue').textContent = `${acState.temp}°C`;

  document.querySelectorAll('#acFan .fan-btn').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.value) === acState.fan);
  });

  document.getElementById('acTurbo').checked = acState.turbo;
  document.getElementById('acLight').checked = acState.light;
  document.getElementById('acSleep').checked = acState.sleep;
  document.getElementById('acSwingAuto').checked = acState.swingVAuto;
  document.getElementById('acSwingPos').value = acState.swingVPos;
  document.getElementById('acDispTemp').value = acState.dispTemp;
}

// --- AC Panel ---

function attachAcListeners() {
  document.getElementById('acPower').addEventListener('click', () => {
    acState.power = !acState.power;
    renderAcUi();
  });

  document.querySelectorAll('#acMode .mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      acState.mode = parseInt(btn.dataset.value);
      renderAcUi();
    });
  });

  document.getElementById('acTempDown').addEventListener('click', () => {
    if (acState.temp > 16) { acState.temp--; renderAcUi(); }
  });

  document.getElementById('acTempUp').addEventListener('click', () => {
    if (acState.temp < 30) { acState.temp++; renderAcUi(); }
  });

  document.querySelectorAll('#acFan .fan-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      acState.fan = parseInt(btn.dataset.value);
      renderAcUi();
    });
  });

  document.getElementById('acTurbo').addEventListener('change', (e) => {
    acState.turbo = e.target.checked;
    renderAcUi();
  });
  document.getElementById('acLight').addEventListener('change', (e) => {
    acState.light = e.target.checked;
    renderAcUi();
  });
  document.getElementById('acSleep').addEventListener('change', (e) => {
    acState.sleep = e.target.checked;
    renderAcUi();
  });

  document.getElementById('acSwingAuto').addEventListener('change', (e) => {
    acState.swingVAuto = e.target.checked;
    renderAcUi();
  });
  document.getElementById('acSwingPos').addEventListener('change', (e) => {
    acState.swingVPos = parseInt(e.target.value);
    renderAcUi();
  });
  document.getElementById('acDispTemp').addEventListener('change', (e) => {
    acState.dispTemp = parseInt(e.target.value);
    renderAcUi();
  });

  document.getElementById('acSendBtn').addEventListener('click', acSendNow);
  document.getElementById('acScheduleBtn').addEventListener('click', () => {
    acScheduling = true;
    openModal(null);
  });
}

// --- Schedules ---

function formatDayMask(mask) {
  const days = DAY_NAMES.filter((_, i) => mask & (1 << i));
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'Never';
  return days.join(', ');
}

function renderSchedules() {
  if (schedules.length === 0) {
    scheduleList.innerHTML = '';
    scheduleEmpty.style.display = '';
    return;
  }
  scheduleEmpty.style.display = 'none';
  scheduleList.innerHTML = schedules.map((s) => `
    <li class="schedule-item">
      <span class="schedule-time">${escapeHtml(s.time)}</span>
      <span class="schedule-action">${escapeHtml(s.actionName || s.actionId)}</span>
      <span class="schedule-days">${formatDayMask(s.dayMask)}</span>
      <button class="schedule-del" data-id="${s.id}" title="Delete">&times;</button>
    </li>
  `).join('');

  scheduleList.querySelectorAll('.schedule-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendMsg({ type: 'schedule_remove', id: parseInt(btn.dataset.id) });
    });
  });
}

// --- Modal ---

function populateActionSelect() {
  formAction.innerHTML = devices.map((device) => {
    if (device.type === 'ac') {
      return `<option value="ac:set_state">Air Conditioner — Set State</option>`;
    }
    return device.actions.map((a) => {
      const val = `${device.id}:${a.id}`;
      return `<option value="${val}">${escapeHtml(device.name)} — ${escapeHtml(a.name)}</option>`;
    }).join('');
  }).join('');
}

function openModal(entry) {
  editingId = entry ? entry.id : null;
  modalTitle.textContent = editingId !== null ? 'Edit Schedule' : 'Add Schedule';

  formTime.value = entry ? entry.time : '12:00';
  document.querySelectorAll('#dayCheckboxes input').forEach((cb) => {
    cb.checked = entry ? !!(entry.dayMask & (1 << parseInt(cb.value))) : true;
  });

  formAction.value = entry ? entry.actionId : (acScheduling ? 'ac:set_state' : devices[0] ? `${devices[0].id}:${devices[0].actions[0].id}` : '');
  if (entry) formAction.value = entry.actionId;

  updateAcStateInfo();
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
  editingId = null;
  acScheduling = false;
}

function updateAcStateInfo() {
  if (formAction.value === 'ac:set_state') {
    formAcStateInfo.classList.remove('hidden');
  } else {
    formAcStateInfo.classList.add('hidden');
  }
}

formAction.addEventListener('change', updateAcStateInfo);

addScheduleBtn.addEventListener('click', () => openModal(null));
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

scheduleForm.addEventListener('submit', (e) => {
  e.preventDefault();

  let dayMask = 0;
  document.querySelectorAll('#dayCheckboxes input:checked').forEach((cb) => {
    dayMask |= 1 << parseInt(cb.value);
  });

  const data = {
    time: formTime.value,
    dayMask,
    actionId: formAction.value,
    actionName: formAction.options[formAction.selectedIndex].text,
    tzOffset: -new Date().getTimezoneOffset(),
  };

  if (formAction.value === 'ac:set_state') {
    data.acState = { ...acState };
  }

  if (editingId !== null) {
    sendMsg({ type: 'schedule_update', id: editingId, schedule: data });
  } else {
    sendMsg({ type: 'schedule_add', schedule: data });
  }
  closeModal();
});

// --- Util ---

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Hex Lookup ---

function buildHexData() {
  const rows = [];
  for (const device of devices) {
    if (device.type === 'ac') continue;
    for (const action of device.actions) {
      if (action.code === undefined) continue;
      const hexStr = action.protocol === 'SONY'
        ? `0x${action.code.toString(16).toUpperCase()}`
        : `0x${action.code.toString(16).toUpperCase().padStart(8, '0')}`;
      rows.push({
        device: device.name,
        command: action.name,
        hex: hexStr,
        code: action.code,
        protocol: action.protocol || 'NEC',
        nbits: action.nbits,
        actionId: `${device.id}:${action.id}`,
      });
    }
  }
  return rows;
}

function renderHexTable(filter) {
  const rows = buildHexData();
  const tbody = document.getElementById('hexTableBody');
  const empty = document.getElementById('hexEmpty');
  const q = (filter || '').toLowerCase();

  const filtered = q
    ? rows.filter(r => r.device.toLowerCase().includes(q) || r.command.toLowerCase().includes(q) || r.hex.toLowerCase().includes(q) || r.protocol.toLowerCase().includes(q) || (r.nbits != null && String(r.nbits).includes(q)))
    : rows;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = filtered.map(r => `
    <tr class="hex-row" data-action="${r.actionId}" data-code="${r.code}">
      <td>${escapeHtml(r.device)}</td>
      <td>${escapeHtml(r.command)}</td>
      <td class="hex-cell">${r.hex}</td>
      <td>${r.protocol}</td>
      <td class="bits-cell">${r.nbits != null ? r.nbits : '-'}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.hex-row').forEach(row => {
    row.addEventListener('click', () => {
      sendMsg({ type: 'command', actionId: row.dataset.action });
    });
  });
}

const hexLookupBtn = document.getElementById('hexLookupBtn');
const hexModalOverlay = document.getElementById('hexModalOverlay');
const hexModalClose = document.getElementById('hexModalClose');
const hexSearch = document.getElementById('hexSearch');

hexLookupBtn.addEventListener('click', () => {
  hexModalOverlay.classList.remove('hidden');
  renderHexTable(hexSearch.value);
});

hexModalClose.addEventListener('click', () => {
  hexModalOverlay.classList.add('hidden');
});

hexModalOverlay.addEventListener('click', (e) => {
  if (e.target === hexModalOverlay) hexModalOverlay.classList.add('hidden');
});

hexSearch.addEventListener('input', () => renderHexTable(hexSearch.value));

// --- Init ---

connectWs();
