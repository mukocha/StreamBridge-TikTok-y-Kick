const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { saveAudioUpload } = require('./lib/upload');
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

// Configuración persistente (config.json o variables de entorno)
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  const defaults = {
    kickUser: process.env.KICK_USER || '',
    tiktokUser: process.env.TIKTOK_USER || '',
    autoConnect: true
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return {
        ...defaults,
        ...data,
        kickUser: process.env.KICK_USER || data.kickUser || '',
        tiktokUser: process.env.TIKTOK_USER || data.tiktokUser || ''
      };
    }
  } catch (err) {
    console.warn('[Config] Error leyendo config.json:', err.message);
  }
  return defaults;
}

function saveConfig(cfg) {
  try {
    const current = loadConfig();
    const updated = { ...current, ...cfg };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    console.log('[Config] Configuración guardada en config.json');
    return updated;
  } catch (err) {
    console.error('[Config] Error guardando config.json:', err.message);
  }
}

const config = loadConfig();

// State
const state = {
  kick: {
    user: config.kickUser || '',
    status: 'disconnected',
    message: 'No conectado'
  },
  tiktok: {
    user: config.tiktokUser || '',
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
    soundEnabled: true,
    customSoundUrl: '', // URL personalizado (vació = usa predeterminado)
    slowMode: false,    // Modo lento de chat (false = normal, true = lento)
    slowModeInterval: 1500 // Intervalo en ms para modo lento
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

// Middleware y archivos estáticos (con cabeceras no-cache para OBS Studio)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Endpoint para subir sonido personalizado
app.post('/api/upload-sound', (req, res) => {
  try {
    const result = saveAudioUpload(req.body, path.join(__dirname, 'public', 'uploads'));
    if (result.error) return res.status(result.status || 400).json({ ok: false, error: result.error });
    state.settings.customSoundUrl = result.url;
    io.emit('settings:update', state.settings);
    res.json({ ok: true, url: result.url });
  } catch (err) {
    console.error('Error subiendo audio:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Routes shortcuts
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/alerts', (req, res) => res.sendFile(path.join(__dirname, 'public', 'alerts.html')));
app.get('/dock', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dock.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/viewers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'viewers.html')));

// Endpoint para limpiar historial de chat y alertas
app.post('/api/clear', (req, res) => {
  recentMessages.length = 0;
  alertHistory.length = 0;
  io.emit('chat:cleared');
  res.json({ ok: true, message: 'Chat limpiado con éxito' });
});

// Manejadores y Watchers de conexión persistente
let kickManualDisconnect = false;
let tiktokWatcherTimer = null;
let tiktokManualDisconnect = false;

async function connectKick(username) {
  if (!username) return;
  const clean = username.trim().replace(/^@/, '');
  state.kick.user = clean;
  kickManualDisconnect = false;
  await kick.connect(clean);
}

async function checkAndConnectTikTok(username) {
  if (tiktokManualDisconnect) return;
  if (!username) return;
  if (tiktok.isConnected) return;

  const clean = username.trim().replace(/^@/, '');
  try {
    const liveInfo = await tiktok.checkIsLive(clean);
    if (liveInfo && liveInfo.isLive) {
      console.log(`[TikTok Watcher] 🔴 ¡Directo detectado en @${clean}! Conectando automáticamente...`);
      state.tiktok.status = 'connecting';
      state.tiktok.message = `Directo detectado. Conectando a @${clean}...`;
      io.emit('status:update', { platform: 'tiktok', ...state.tiktok });
      await tiktok.connect(clean);
    } else {
      if (state.tiktok.status !== 'offline') {
        state.tiktok.status = 'offline';
        state.tiktok.message = `@${clean} no está en directo. Esperando transmisión...`;
        io.emit('status:update', { platform: 'tiktok', ...state.tiktok });
      }
    }
  } catch (err) {
    console.warn('[TikTok Watcher] Comprobación:', err.message);
  }
}

function startTikTokWatcher(username) {
  stopTikTokWatcher();
  if (!username) return;
  tiktokManualDisconnect = false;
  state.tiktok.user = username.trim().replace(/^@/, '');

  checkAndConnectTikTok(state.tiktok.user);

  // Comprobar cada 20 segundos si el streamer inició directo
  tiktokWatcherTimer = setInterval(() => {
    if (!tiktok.isConnected && !tiktokManualDisconnect && state.tiktok.user) {
      checkAndConnectTikTok(state.tiktok.user);
    }
  }, 20000);
}

function stopTikTokWatcher() {
  tiktokManualDisconnect = true;
  if (tiktokWatcherTimer) {
    clearInterval(tiktokWatcherTimer);
    tiktokWatcherTimer = null;
  }
}

// Kick events
kick.on('status', (info) => {
  state.kick.status = info.status;
  state.kick.message = info.message;
  io.emit('status:update', { platform: 'kick', ...info });

  if (info.status === 'disconnected' && !kickManualDisconnect && state.kick.user) {
    console.log('[Kick] Desconexión detectada. Reintentando en 10s...');
    setTimeout(() => {
      if (!kick.isConnected && !kickManualDisconnect && state.kick.user) {
        connectKick(state.kick.user);
      }
    }, 10000);
  }
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

  if ((info.status === 'offline' || info.status === 'disconnected') && !tiktokManualDisconnect && state.tiktok.user) {
    setTimeout(() => {
      if (!tiktok.isConnected && !tiktokManualDisconnect) {
        state.tiktok.status = 'offline';
        state.tiktok.message = `@${state.tiktok.user} no está en directo. Esperando transmisión...`;
        io.emit('status:update', { platform: 'tiktok', ...state.tiktok });
      }
    }, 5000);
  }
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
  socket.on('channel:connect', async ({ platform, username }) => {
    if (platform === 'kick') {
      const clean = (username || '').trim().replace(/^@/, '');
      if (clean) {
        state.kick.user = clean;
        saveConfig({ kickUser: clean });
        connectKick(clean);
      }
    } else if (platform === 'tiktok') {
      const clean = (username || '').trim().replace(/^@/, '');
      if (clean) {
        state.tiktok.user = clean;
        saveConfig({ tiktokUser: clean });
        startTikTokWatcher(clean);
      }
    }
  });

  // Disconnect request
  socket.on('channel:disconnect', ({ platform }) => {
    if (platform === 'kick') {
      kickManualDisconnect = true;
      kick.disconnect();
      state.kick.status = 'disconnected';
      state.kick.message = 'Desconectado manualmente';
      state.viewers.kick = 0;
      state.viewers.total = (state.viewers.tiktok || 0);
      io.emit('viewers:update', state.viewers);
      io.emit('status:update', { platform: 'kick', status: 'disconnected', message: 'Desconectado' });
    } else if (platform === 'tiktok') {
      stopTikTokWatcher();
      tiktok.disconnect();
      state.tiktok.status = 'disconnected';
      state.tiktok.message = 'Desconectado manualmente';
      state.viewers.tiktok = 0;
      state.viewers.total = (state.viewers.kick || 0);
      io.emit('viewers:update', state.viewers);
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

  // Limpiar chat y alertas en servidor y en todas las pantallas/docks
  socket.on('chat:clear', () => {
    recentMessages.length = 0;
    alertHistory.length = 0;
    io.emit('chat:cleared');
    console.log('[Chat] Historial limpiado por el streamer (recientes y alertas reseteados).');
  });
});

// Auto-conectar al iniciar el servidor con los canales guardados
if (config.kickUser) {
  console.log(`[Inicio] Auto-conectando a Kick: ${config.kickUser}`);
  connectKick(config.kickUser);
}
if (config.tiktokUser) {
  console.log(`[Inicio] Activando monitor automático para TikTok: @${config.tiktokUser}`);
  startTikTokWatcher(config.tiktokUser);
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
