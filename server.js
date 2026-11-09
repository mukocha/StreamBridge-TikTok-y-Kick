const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const KickConnector = require('./connectors/kick');
const TikTokConnector = require('./connectors/tiktok');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// State
const state = {
  kick: {
    user: process.env.KICK_USER || 'chamukoi',
    status: 'disconnected',
    message: 'No conectado'
  },
  tiktok: {
    user: process.env.TIKTOK_USER || '',
    status: 'disconnected',
    message: 'No conectado'
  },
  viewers: {
    kick: 0,
    tiktok: 0,
    total: 0
  },
  settings: {
    theme: 'modern-dark',
    fontSize: 16,
    chatFadeDelay: 0, // 0 = never hide, or seconds
    showBadges: true,
    showAvatars: true,
    alertDuration: 5000,
    alertVolume: 0.8,
    soundEnabled: true
  }
};

const recentMessages = [];
const MAX_RECENT_MESSAGES = 40;

const alertHistory = [];
const MAX_ALERT_HISTORY = 50;

function addAlertToHistory(alert) {
  alertHistory.unshift(alert);
  if (alertHistory.length > MAX_ALERT_HISTORY) {
    alertHistory.pop();
  }
}

// Connectors
const kick = new KickConnector();
const tiktok = new TikTokConnector();

// Route files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes shortcuts
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/alerts', (req, res) => res.sendFile(path.join(__dirname, 'public', 'alerts.html')));
app.get('/dock', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dock.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/viewers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'viewers.html')));

// Kick events
kick.on('status', (info) => {
  state.kick.status = info.status;
  state.kick.message = info.message;
  io.emit('status:update', { platform: 'kick', ...info });
});

kick.on('chat', (message) => {
  addRecentMessage(message);
  io.emit('chat:message', message);
});

kick.on('alert', (alert) => {
  addAlertToHistory(alert);
  io.emit('alert:event', alert);
});

kick.on('viewers', ({ viewers }) => {
  state.viewers.kick = viewers;
  state.viewers.total = (state.viewers.kick || 0) + (state.viewers.tiktok || 0);
  io.emit('viewers:update', state.viewers);
});

// TikTok events
tiktok.on('status', (info) => {
  state.tiktok.status = info.status;
  state.tiktok.message = info.message;
  io.emit('status:update', { platform: 'tiktok', ...info });
});

tiktok.on('chat', (message) => {
  addRecentMessage(message);
  io.emit('chat:message', message);
});

tiktok.on('alert', (alert) => {
  addAlertToHistory(alert);
  io.emit('alert:event', alert);
});

tiktok.on('viewers', ({ viewers }) => {
  state.viewers.tiktok = viewers;
  state.viewers.total = (state.viewers.kick || 0) + (state.viewers.tiktok || 0);
  io.emit('viewers:update', state.viewers);
});

function addRecentMessage(msg) {
  recentMessages.push(msg);
  if (recentMessages.length > MAX_RECENT_MESSAGES) {
    recentMessages.shift();
  }
}

// Socket.IO
io.on('connection', (socket) => {
  // Send initial data to client
  socket.emit('init', {
    state,
    recentMessages,
    alertHistory
  });

  // Connect request from panel
  socket.on('channel:connect', async ({ platform, username, apiKey }) => {
    if (platform === 'kick') {
      state.kick.user = username;
      await kick.connect(username);
    } else if (platform === 'tiktok') {
      state.tiktok.user = username;
      await tiktok.connect(username, { signApiKey: apiKey || process.env.TIKTOK_SIGN_API_KEY });
    }
  });

  // Disconnect request
  socket.on('channel:disconnect', ({ platform }) => {
    if (platform === 'kick') {
      kick.disconnect();
      state.kick.status = 'disconnected';
      state.kick.message = 'Desconectado manualmente';
      io.emit('status:update', { platform: 'kick', status: 'disconnected', message: 'Desconectado' });
    } else if (platform === 'tiktok') {
      tiktok.disconnect();
      state.tiktok.status = 'disconnected';
      state.tiktok.message = 'Desconectado manualmente';
      io.emit('status:update', { platform: 'tiktok', status: 'disconnected', message: 'Desconectado' });
    }
  });

  // Simulation test for OBS
  socket.on('test:alert', (type) => {
    let mockAlert = null;

    // TIKTOK EVENTS
    if (type === 'tiktok-gift') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'gift',
        user: 'UsuarioFan_99',
        title: '¡Regalo en TikTok Live!',
        giftName: 'León Galáctico',
        count: 1,
        diamonds: 29999,
        giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/resource/gift_rose.png~tplv-obj.png',
        details: 'envió León Galáctico x1 (29999 💎)',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'tiktok-follow') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'follow',
        user: 'GamerTikToker',
        title: '¡Nuevo Seguidor en TikTok!',
        details: 'comenzó a seguirte 💖',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'tiktok-sub') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'sub',
        user: 'VIP_TikToker',
        title: '¡Nueva Suscripción LIVE!',
        details: 'se ha suscrito al canal ⭐',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'tiktok-like') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'like',
        user: 'FanaticoDeLikes',
        title: '¡Likes en TikTok!',
        details: 'envió 50 likes ❤️',
        sound: false, // Silencioso
        timestamp: Date.now()
      };
    } else if (type === 'tiktok-share') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'share',
        user: 'AmigoStreamer',
        title: '¡Compartieron el LIVE!',
        details: 'compartió la transmisión 🚀',
        sound: false,
        timestamp: Date.now()
      };
    } else if (type === 'tiktok-member') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'member',
        user: 'NuevoEspectador_42',
        title: 'Nuevo espectador',
        details: 'se unió al directo 👋',
        sound: false,
        timestamp: Date.now()
      };
    }

    // KICK EVENTS
    else if (type === 'kick-follow') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'follow',
        user: 'NuevoSeguidorKick',
        title: '¡Nuevo Seguidor en Kick!',
        details: 'comenzó a seguirte en Kick 🟢',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'kick-sub') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'sub',
        user: 'KickSubMaster',
        title: '¡Nueva Suscripción en Kick!',
        months: 1,
        details: 'se ha suscrito al canal ⭐',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'kick-resub') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'resub',
        user: 'VeteranoKick',
        title: '¡Renovación en Kick!',
        months: 6,
        details: 'renovó su suscripción (6 meses) ⭐',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'kick-gift') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'gift_sub',
        user: 'ReyDonador',
        title: '¡Suscripciones Regaladas!',
        count: 5,
        details: 'regaló 5 suscripciones en Kick 🎁',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'kick-kicks') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'kicks',
        user: 'DonadorVIP',
        title: '¡Donación de KICKs!',
        details: 'envió 500 KICKs 🪙',
        sound: true,
        timestamp: Date.now()
      };
    } else if (type === 'kick-host') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'host',
        user: 'StreamerAmigo',
        title: '¡Host en Kick!',
        viewers: 45,
        details: 'te está hosteando con 45 espectadores 📡',
        sound: true,
        timestamp: Date.now()
      };
    }

    if (mockAlert) {
      addAlertToHistory(mockAlert);
      io.emit('alert:event', mockAlert);
    }
  });

  socket.on('test:chat', (platform) => {
    const mockMsg = {
      id: 'test-msg-' + Date.now(),
      platform: platform || 'kick',
      user: platform === 'tiktok' ? 'TikToker_Cool' : 'Kick_Legend',
      avatar: null,
      badges: ['vip', 'moderator'],
      color: platform === 'tiktok' ? '#fe2c55' : '#53fc18',
      message: platform === 'tiktok'
        ? '¡Hola streamer! Probando el chat unificado desde TikTok 🎉'
        : '¡Buenas gente! Probando el chat directo desde Kick 🟢',
      timestamp: Date.now()
    };
    addRecentMessage(mockMsg);
    io.emit('chat:message', mockMsg);
  });

  socket.on('settings:update', (newSettings) => {
    state.settings = { ...state.settings, ...newSettings };
    io.emit('settings:update', state.settings);
  });
});

// Auto-connect if environment variables are supplied
if (state.kick.user) {
  kick.connect(state.kick.user);
}
if (state.tiktok.user) {
  tiktok.connect(state.tiktok.user);
}

server.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Servidor de Chat y Alertas listo`);
  console.log(`👉 Panel de control: http://localhost:${PORT}/`);
  console.log(`👉 OBS Chat Overlay: http://localhost:${PORT}/chat`);
  console.log(`👉 OBS Alertas:       http://localhost:${PORT}/alerts`);
  console.log(`👉 OBS Dock Panel:   http://localhost:${PORT}/dock`);
  console.log(`=================================================\n`);
});
