const socket = io();

// DOM Elements
const kickInput = document.getElementById('kick-user-input');
const kickIdHelper = document.getElementById('kick-id-helper');
const kickConnectBtn = document.getElementById('kick-connect-btn');
const kickDisconnectBtn = document.getElementById('kick-disconnect-btn');

function updateKickHelperLink() {
  const val = kickInput.value.trim().toLowerCase().replace(/^@/, '');
  if (val && !/^\d+$/.test(val)) {
    kickIdHelper.href = `https://kick.com/api/v1/channels/${val}`;
    kickIdHelper.textContent = `Ver Chatroom ID de "${val}"`;
  } else {
    kickIdHelper.href = 'https://kick.com';
    kickIdHelper.textContent = 'Ver mi Chatroom ID en Kick';
  }
}

kickInput.addEventListener('input', updateKickHelperLink);
updateKickHelperLink();
const kickDot = document.getElementById('kick-status-dot');
const kickText = document.getElementById('kick-status-text');
const kickMsg = document.getElementById('kick-status-msg');

const tiktokInput = document.getElementById('tiktok-user-input');
const tiktokConnectBtn = document.getElementById('tiktok-connect-btn');
const tiktokDisconnectBtn = document.getElementById('tiktok-disconnect-btn');
const tiktokDot = document.getElementById('tiktok-status-dot');
const tiktokText = document.getElementById('tiktok-status-text');
const tiktokMsg = document.getElementById('tiktok-status-msg');

const previewBox = document.getElementById('preview-messages');
const toast = document.getElementById('toast');

// Auto populate URLs with current host
document.addEventListener('DOMContentLoaded', () => {
  const origin = window.location.origin;
  document.getElementById('link-chat').textContent = `${origin}/chat`;
  document.getElementById('link-alerts').textContent = `${origin}/alerts`;
  document.getElementById('link-viewers').textContent = `${origin}/viewers`;
  document.getElementById('link-dock').textContent = `${origin}/dock`;
});

const panelKickViewers = document.getElementById('panel-viewers-kick');
const panelTikTokViewers = document.getElementById('panel-viewers-tiktok');
const panelTotalViewers = document.getElementById('panel-viewers-total');

function updatePanelViewers(v) {
  if (!v) return;
  if (panelKickViewers) panelKickViewers.textContent = (v.kick || 0).toLocaleString();
  if (panelTikTokViewers) panelTikTokViewers.textContent = (v.tiktok || 0).toLocaleString();
  if (panelTotalViewers) panelTotalViewers.textContent = (v.total || 0).toLocaleString();
}

// Socket Events
socket.on('init', ({ state, recentMessages }) => {
  if (state.viewers) {
    updatePanelViewers(state.viewers);
  }
  if (state.settings) {
    applySettingsUI(state.settings);
  }
  if (state.kick) {
    kickInput.value = state.kick.user || '';
    updateKickHelperLink();
    updatePlatformUI('kick', state.kick.status, state.kick.message);
  }
  if (state.tiktok) {
    tiktokInput.value = state.tiktok.user || '';
    updatePlatformUI('tiktok', state.tiktok.status, state.tiktok.message);
  }
  if (Array.isArray(recentMessages)) {
    previewBox.innerHTML = '';
    recentMessages.forEach(addPreviewMessage);
  }
});

socket.on('settings:update', (newSettings) => {
  applySettingsUI(newSettings);
});

socket.on('status:update', (data) => {
  updatePlatformUI(data.platform, data.status, data.message);
});

socket.on('viewers:update', (viewers) => {
  updatePanelViewers(viewers);
});

socket.on('chat:message', (msg) => {
  addPreviewMessage(msg);
});

function updatePlatformUI(platform, status, message) {
  const isKick = platform === 'kick';
  const dot = isKick ? kickDot : tiktokDot;
  const text = isKick ? kickText : tiktokText;
  const msgEl = isKick ? kickMsg : tiktokMsg;
  const btnConnect = isKick ? kickConnectBtn : tiktokConnectBtn;
  const btnDisconnect = isKick ? kickDisconnectBtn : tiktokDisconnectBtn;

  dot.className = `status-dot ${status}`;
  text.textContent = status === 'connected' ? 'En Vivo' : status === 'connecting' ? 'Conectando...' : 'Desconectado';
  msgEl.textContent = message || '';

  if (status === 'connected') {
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-block';
  } else {
    btnConnect.style.display = 'inline-block';
    btnDisconnect.style.display = 'none';
  }
}

socket.on('connect', () => {
  console.log('✅ Conectado al servidor');
});

socket.on('disconnect', () => {
  console.warn('⚠️ Desconectado del servidor');
  showToast('Reconectando con el servidor...');
});

// Connect / Disconnect Handlers
kickConnectBtn.addEventListener('click', () => {
  const user = kickInput.value.trim();
  if (!user) return alert('Por favor introduce el nombre de tu canal en Kick');
  updatePlatformUI('kick', 'connecting', 'Conectando con Kick...');
  socket.emit('channel:connect', { platform: 'kick', username: user });
  showToast('Enviando solicitud de conexión...');
});

kickDisconnectBtn.addEventListener('click', () => {
  updatePlatformUI('kick', 'disconnected', 'Desconectando...');
  socket.emit('channel:disconnect', { platform: 'kick' });
});

tiktokConnectBtn.addEventListener('click', () => {
  const user = tiktokInput.value.trim();
  if (!user) return alert('Por favor introduce tu usuario de TikTok (@usuario)');
  updatePlatformUI('tiktok', 'connecting', 'Conectando con TikTok...');
  socket.emit('channel:connect', { platform: 'tiktok', username: user });
  showToast('Enviando solicitud de conexión...');
});

tiktokDisconnectBtn.addEventListener('click', () => {
  updatePlatformUI('tiktok', 'disconnected', 'Desconectando...');
  socket.emit('channel:disconnect', { platform: 'tiktok' });
});

// Simulator Functions
function testAlert(type) {
  socket.emit('test:alert', type);
  showToast(`Alerta de prueba enviada: ${type}`);
}

function testChat(platform) {
  socket.emit('test:chat', platform);
  showToast(`Mensaje simulado enviado a ${platform}`);
}

function formatChatMessage(text) {
  if (!text) return '';
  let safe = escapeHtml(text);
  return safe.replace(/\[emote:(\d+):([^\]]+)\]/g, (match, id, name) => {
    return `<img class="chat-emote" style="height: 20px; vertical-align: middle; margin: 0 2px;" src="https://files.kick.com/emotes/${id}/fullsize" alt="${name}" title="${name}" loading="lazy">`;
  });
}

function addPreviewMessage(msg) {
  const item = document.createElement('div');
  item.style.fontSize = '13px';
  item.style.marginBottom = '6px';
  item.style.padding = '4px 8px';
  item.style.borderRadius = '6px';
  item.style.background = 'rgba(255,255,255,0.03)';
  item.style.borderLeft = msg.platform === 'kick' ? '3px solid #53fc18' : '3px solid #fe2c55';

  const badgeColor = msg.platform === 'kick' ? '#53fc18' : '#fe2c55';
  const badgeText = msg.platform.toUpperCase();

  item.innerHTML = `
    <span style="font-size: 10px; font-weight: bold; background: ${badgeColor}; color: #000; padding: 2px 4px; border-radius: 3px; margin-right: 6px;">${badgeText}</span>
    <strong style="color: #cbd5e1;">${escapeHtml(msg.user)}:</strong>
    <span style="color: #94a3b8;">${formatChatMessage(msg.message)}</span>
  `;

  previewBox.appendChild(item);
  previewBox.scrollTop = previewBox.scrollHeight;
}

function copyUrl(elementId) {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('¡Enlace copiado al portapapeles!');
  });
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// Configuracion de Sonido de Alertas y Velocidad de Chat
// -------------------------------------------------------------
let currentSettings = {
  customSoundUrl: '',
  alertVolume: 0.8,
  slowMode: false
};

function applySettingsUI(s) {
  if (!s) return;
  currentSettings = { ...currentSettings, ...s };

  // Sonido
  const isCustom = Boolean(currentSettings.customSoundUrl);
  const btnDef = document.getElementById('btn-sound-default');
  const btnCust = document.getElementById('btn-sound-custom');
  const customBox = document.getElementById('custom-sound-box');
  const soundUrlInput = document.getElementById('sound-url-input');

  if (btnDef && btnCust && customBox) {
    if (isCustom) {
      btnCust.style.background = '#3b82f6';
      btnCust.style.color = '#fff';
      btnDef.style.background = '#334155';
      btnDef.style.color = '#f1f5f9';
      customBox.style.display = 'block';
      if (soundUrlInput) soundUrlInput.value = currentSettings.customSoundUrl;
    } else {
      btnDef.style.background = '#3b82f6';
      btnDef.style.color = '#fff';
      btnCust.style.background = '#334155';
      btnCust.style.color = '#f1f5f9';
      customBox.style.display = 'none';
    }
  }

  // Volumen
  const slider = document.getElementById('sound-volume-slider');
  const label = document.getElementById('sound-volume-label');
  if (slider && currentSettings.alertVolume !== undefined) {
    const pct = Math.round(currentSettings.alertVolume * 100);
    slider.value = pct;
    if (label) label.textContent = `${pct}%`;
  }

  // Modo Lento
  const btnNorm = document.getElementById('btn-panel-mode-normal');
  const btnSlow = document.getElementById('btn-panel-mode-slow');
  if (btnNorm && btnSlow) {
    if (currentSettings.slowMode) {
      btnSlow.style.background = '#f59e0b';
      btnSlow.style.color = '#000';
      btnNorm.style.background = '#334155';
      btnNorm.style.color = '#f1f5f9';
    } else {
      btnNorm.style.background = '#3b82f6';
      btnNorm.style.color = '#fff';
      btnSlow.style.background = '#334155';
      btnSlow.style.color = '#f1f5f9';
    }
  }
}

function selectSoundMode(mode) {
  if (mode === 'default') {
    currentSettings.customSoundUrl = '';
    socket.emit('settings:update', { customSoundUrl: '' });
    applySettingsUI({ customSoundUrl: '' });
    showToast('Sonido predeterminado activado');
  } else {
    document.getElementById('custom-sound-box').style.display = 'block';
    const btnCust = document.getElementById('btn-sound-custom');
    const btnDef = document.getElementById('btn-sound-default');
    btnCust.style.background = '#3b82f6';
    btnCust.style.color = '#fff';
    btnDef.style.background = '#334155';
    btnDef.style.color = '#f1f5f9';
  }
}

function saveCustomSoundUrl() {
  const url = document.getElementById('sound-url-input').value.trim();
  if (!url) return alert('Por favor introduce la URL de tu audio');
  socket.emit('settings:update', { customSoundUrl: url });
  showToast('Sonido personalizado guardado');
}

function handleAudioUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('sound-file-status');
  statusEl.textContent = 'Subiendo audio...';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const res = await fetch('/api/upload-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: e.target.result })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById('sound-url-input').value = data.url;
        statusEl.textContent = '✅ Subido con éxito!';
        showToast('Sonido subido y activado');
      } else {
        statusEl.textContent = '❌ Error: ' + data.error;
      }
    } catch (err) {
      statusEl.textContent = '❌ Error de red';
    }
  };
  reader.readAsDataURL(file);
}

function updateSoundVolume(val) {
  const vol = Number(val) / 100;
  document.getElementById('sound-volume-label').textContent = `${val}%`;
  socket.emit('settings:update', { alertVolume: vol });
}

function setPanelChatMode(slowMode) {
  socket.emit('settings:update', { slowMode: Boolean(slowMode) });
  showToast(slowMode ? 'Modo lento activado (1.5s)' : 'Modo normal activado');
}

function testCurrentSound() {
  const slider = document.getElementById('sound-volume-slider');
  const vol = (slider ? Number(slider.value) : 80) / 100;
  const url = document.getElementById('sound-url-input')?.value.trim() || '/sounds/alert.wav';

  try {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, vol));
    a.play().catch(() => playDefaultChime(vol));
  } catch (_) {
    playDefaultChime(vol);
  }
}

function playDefaultChime(vol) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.24);
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.36);

    gain.gain.setValueAtTime(vol * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.9);
  } catch (_) {}
}
