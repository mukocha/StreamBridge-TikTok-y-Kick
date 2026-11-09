const socket = io();

// DOM Elements
const kickInput = document.getElementById('kick-user-input');
const kickIdHelper = document.getElementById('kick-id-helper');
const kickConnectBtn = document.getElementById('kick-connect-btn');
const kickDisconnectBtn = document.getElementById('kick-disconnect-btn');

kickInput.addEventListener('input', () => {
  const val = kickInput.value.trim().toLowerCase().replace(/^@/, '');
  if (val && !/^\d+$/.test(val)) {
    kickIdHelper.href = `https://kick.com/api/v2/channels/${val}/chatroom`;
    kickIdHelper.textContent = `Ver Chatroom ID de "${val}"`;
  } else {
    kickIdHelper.href = 'https://kick.com';
    kickIdHelper.textContent = 'Ver mi Chatroom ID en Kick';
  }
});
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
  document.getElementById('link-dock').textContent = `${origin}/dock`;
});

// Socket Events
socket.on('init', ({ state, recentMessages }) => {
  if (state.kick) {
    kickInput.value = state.kick.user || '';
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

socket.on('status:update', (data) => {
  updatePlatformUI(data.platform, data.status, data.message);
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

// Connect / Disconnect Handlers
kickConnectBtn.addEventListener('click', () => {
  const user = kickInput.value.trim();
  if (!user) return alert('Por favor introduce el nombre de tu canal en Kick');
  socket.emit('channel:connect', { platform: 'kick', username: user });
});

kickDisconnectBtn.addEventListener('click', () => {
  socket.emit('channel:disconnect', { platform: 'kick' });
});

tiktokConnectBtn.addEventListener('click', () => {
  const user = tiktokInput.value.trim();
  if (!user) return alert('Por favor introduce tu usuario de TikTok (@usuario)');
  socket.emit('channel:connect', { platform: 'tiktok', username: user });
});

tiktokDisconnectBtn.addEventListener('click', () => {
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
    <span style="color: #94a3b8;">${escapeHtml(msg.message)}</span>
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
