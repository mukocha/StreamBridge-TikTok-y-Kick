const socket = io();
const chatContainer = document.getElementById('chat-container');

let settings = {
  fontSize: 16,
  chatFadeDelay: 0,
  showBadges: true,
  showAvatars: true
};

socket.on('init', ({ state, recentMessages }) => {
  if (state.settings) {
    applySettings(state.settings);
  }
  if (Array.isArray(recentMessages)) {
    recentMessages.forEach(msg => addMessage(msg, false));
  }
});

socket.on('settings:update', (newSettings) => {
  applySettings(newSettings);
});

socket.on('chat:message', (msg) => {
  addMessage(msg, true);
});

function applySettings(newSettings) {
  settings = { ...settings, ...newSettings };
  document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
}

function addMessage(msg, autoScroll = true) {
  const div = document.createElement('div');
  div.className = `chat-message ${msg.platform}-msg`;
  div.id = `msg-${msg.id}`;

  const isKick = msg.platform === 'kick';
  const initial = (msg.user || '?')[0].toUpperCase();

  // Avatar or placeholder
  let avatarHtml = '';
  if (settings.showAvatars) {
    if (msg.avatar) {
      avatarHtml = `<img class="avatar" src="${escapeHtml(msg.avatar)}" alt="${escapeHtml(msg.user)}" onerror="this.outerHTML='<div class=\\'avatar-placeholder ${msg.platform}\\'>${initial}</div>'">`;
    } else {
      avatarHtml = `<div class="avatar-placeholder ${msg.platform}">${initial}</div>`;
    }
  }

  // Platform badge
  const badgeHtml = settings.showBadges
    ? `<span class="platform-badge badge-${msg.platform}">${isKick ? 'KICK' : 'TIKTOK'}</span>`
    : '';

  div.innerHTML = `
    ${avatarHtml}
    <div class="content-box">
      <div class="meta-row">
        ${badgeHtml}
        <span class="username ${msg.platform}-user" style="${msg.color ? `color: ${escapeHtml(msg.color)}` : ''}">
          ${escapeHtml(msg.user)}
        </span>
      </div>
      <div class="message-text">${escapeHtml(msg.message)}</div>
    </div>
  `;

  chatContainer.appendChild(div);

  // Auto clean old DOM messages if too many
  while (chatContainer.children.length > 50) {
    chatContainer.removeChild(chatContainer.children[0]);
  }

  // Scroll to bottom
  if (autoScroll) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Fade out delay if configured
  if (settings.chatFadeDelay > 0) {
    setTimeout(() => {
      div.classList.add('fade-out');
      setTimeout(() => div.remove(), 600);
    }, settings.chatFadeDelay * 1000);
  }
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
