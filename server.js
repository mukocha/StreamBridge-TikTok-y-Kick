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
    user: process.env.KICK_USER || '',
    status: 'disconnected',
    message: 'No conectado'
  },
  tiktok: {
    user: process.env.TIKTOK_USER || '',
    status: 'disconnected',
    message: 'No conectado'
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
  io.emit('alert:event', alert);
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
  io.emit('alert:event', alert);
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
    recentMessages
  });

  // Connect request from panel
  socket.on('channel:connect', async ({ platform, username }) => {
    if (platform === 'kick') {
      state.kick.user = username;
      await kick.connect(username);
    } else if (platform === 'tiktok') {
      state.tiktok.user = username;
      await tiktok.connect(username);
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

    if (type === 'tiktok-gift') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'gift',
        user: 'UsuarioFan_99',
        giftName: 'Rosa Galáctica',
        count: 5,
        diamonds: 50,
        giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/resource/gift_rose.png~tplv-obj.png',
        details: '¡Envió Rosa Galáctica x5! 💎',
        timestamp: Date.now()
      };
    } else if (type === 'tiktok-follow') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'follow',
        user: 'GamerTikToker',
        details: '¡Comenzó a seguirte en TikTok! 🌟',
        timestamp: Date.now()
      };
    } else if (type === 'kick-sub') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'subscription',
        user: 'KickSubMaster',
        months: 3,
        details: '¡Se suscribió en Kick (3 meses)! 🚀',
        timestamp: Date.now()
      };
    } else if (type === 'kick-gift') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'gift_sub',
        user: 'ReyDonador',
        count: 5,
        details: '¡Regaló 5 suscripciones en Kick! 🎁',
        timestamp: Date.now()
      };
    } else if (type === 'kick-follow') {
      mockAlert = {
        id: 'test-' + Date.now(),
        platform: 'kick',
        type: 'follow',
        user: 'NuevoEspectadorKick',
        details: '¡Te sigue en Kick! 🔥',
        timestamp: Date.now()
      };
    }

    if (mockAlert) {
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
