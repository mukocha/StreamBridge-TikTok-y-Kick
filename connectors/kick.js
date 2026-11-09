const WebSocket = require('ws');
const EventEmitter = require('events');
const { execFile } = require('child_process');

function fetchWithCurl(url) {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  return new Promise((resolve, reject) => {
    execFile(curlCmd, [
      '-s', '-L', '--max-time', '8',
      url,
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '-H', 'Accept: application/json'
    ], (err, stdout) => {
      if (!err && stdout) {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed) return resolve(parsed);
        } catch (_) {}
      }
      reject(err || new Error('curl empty response'));
    });
  });
}

class KickConnector extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.channelSlug = null;
    this.chatroomId = null;
    this.channelId = null;
    this.isConnected = false;
    this.pingInterval = null;
    this.viewerPollInterval = null;
    this.viewers = 0;
    // Current working Kick Pusher credentials
    this.pusherKey = '34bf7a0ff419a2a775b9';
    this.pusherCluster = 'us2';
  }

  async connect(channelInput) {
    if (!channelInput) return false;
    this.disconnect();
    
    const cleanInput = String(channelInput).trim().toLowerCase().replace(/^@/, '');
    this.channelSlug = cleanInput;

    // Known channels dictionary
    const knownChannels = {
      'chamukoi': { chatroomId: 6823990, channelId: 6884630 },
      '6823990': { chatroomId: 6823990, channelId: 6884630 },
      'westcol': { chatroomId: 669512, channelId: 669746 },
      'xqc': { chatroomId: 668, channelId: 668 }
    };

    if (knownChannels[cleanInput]) {
      this.chatroomId = knownChannels[cleanInput].chatroomId;
      this.channelId = knownChannels[cleanInput].channelId;
      this.emit('status', {
        status: 'connecting',
        message: `Canal ${cleanInput} reconocido (Chatroom ${this.chatroomId}). Conectando...`
      });
      this._initWebSocket();
      return true;
    }

    // Layer 1: If input is already numeric ID, connect directly without hitting kick.com
    if (/^\d+$/.test(cleanInput)) {
      this.chatroomId = cleanInput;
      this.channelId = cleanInput;
      this.emit('status', {
        status: 'connecting',
        message: `Conectando directamente con Chatroom ID: ${this.chatroomId}...`
      });
      this._initWebSocket();
      return true;
    }

    try {
      this.emit('status', { status: 'connecting', message: `Buscando canal de Kick: ${this.channelSlug}...` });

      // Layer 2: Try curl (bypasses Cloudflare on Alpine / Railway)
      let resolvedChatroomId = null;
      let resolvedChannelId = null;

      try {
        const curlV2 = await fetchWithCurl(`https://kick.com/api/v2/channels/${this.channelSlug}/chatroom`);
        if (curlV2 && curlV2.id) {
          resolvedChatroomId = curlV2.id;
        }
      } catch (_) {}

      if (!resolvedChatroomId) {
        try {
          const curlV1 = await fetchWithCurl(`https://kick.com/api/v1/channels/${this.channelSlug}`);
          if (curlV1 && (curlV1.chatroom?.id || curlV1.id)) {
            resolvedChatroomId = curlV1.chatroom?.id || curlV1.id;
            resolvedChannelId = curlV1.id;
          }
        } catch (_) {}
      }

      // Layer 3: Try native fetch if curl did not succeed
      if (!resolvedChatroomId) {
        try {
          const resV2 = await fetch(`https://kick.com/api/v2/channels/${this.channelSlug}/chatroom`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            }
          });
          if (resV2.ok) {
            const dataV2 = await resV2.json();
            if (dataV2 && dataV2.id) {
              resolvedChatroomId = dataV2.id;
            }
          }
        } catch (err) {}
      }

      if (!resolvedChatroomId) {
        try {
          const resV1 = await fetch(`https://kick.com/api/v1/channels/${this.channelSlug}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            }
          });
          if (resV1.ok) {
            const dataV1 = await resV1.json();
            resolvedChatroomId = dataV1?.chatroom?.id;
            resolvedChannelId = dataV1?.id;
          }
        } catch (err) {}
      }

      if (!resolvedChatroomId) {
        throw new Error(`Cloudflare bloqueó la búsqueda automática. Abre el enlace "Ver Chatroom ID" abajo, copia el número y pégalo aquí.`);
      }

      this.chatroomId = resolvedChatroomId;
      this.channelId = resolvedChannelId || resolvedChatroomId;

      this.emit('status', {
        status: 'connecting',
        message: `Chatroom ID encontrado (${this.chatroomId}). Conectando a Pusher...`
      });

      this._initWebSocket();
      return true;
    } catch (err) {
      console.error('[KICK] Error al conectar:', err.message);
      this.emit('status', { status: 'error', message: err.message });
      return false;
    }
  }

  _initWebSocket() {
    const wsUrl = `wss://ws-${this.pusherCluster}.pusher.com/app/${this.pusherKey}?protocol=7&client=js&version=7.6.0&flash=false`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
        }
      }, 30000);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handlePusherMessage(msg);
      } catch (e) {}
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this._clearIntervals();
      this.emit('status', { status: 'disconnected', message: 'Desconectado de Kick' });
    });

    this.ws.on('error', (err) => {
      console.error('[KICK] WebSocket error:', err.message);
      this.emit('status', { status: 'error', message: err.message });
    });
  }

  _handlePusherMessage(msg) {
    const { event, data } = msg;

    if (event === 'pusher:connection_established') {
      this.isConnected = true;
      this.emit('status', { status: 'connected', message: `Conectado a Kick (${this.channelSlug})` });

      // Iniciar sondeo de espectadores de Kick
      this._startViewerPolling();

      // Subscribe to chatroom
      this.ws.send(JSON.stringify({
        event: 'pusher:subscribe',
        data: { auth: '', channel: `chatrooms.${this.chatroomId}.v2` }
      }));

      // Subscribe to channel events
      if (this.channelId) {
        this.ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { auth: '', channel: `channel.${this.channelId}` }
        }));
      }
    }

    // Chat Message Event
    if (event === 'App\\Events\\ChatMessageEvent') {
      try {
        const chat = typeof data === 'string' ? JSON.parse(data) : data;
        const badges = [];
        if (chat.sender?.identity?.badges) {
          chat.sender.identity.badges.forEach(b => {
            if (b.type) badges.push(b.type);
          });
        }

        const normalizedMessage = {
          id: chat.id || String(Date.now()),
          platform: 'kick',
          user: chat.sender?.username || 'Anónimo',
          userId: chat.sender?.id,
          avatar: chat.sender?.profile_pic || null,
          badges: badges,
          color: chat.sender?.identity?.color || '#53fc18',
          message: chat.content || '',
          timestamp: Date.now()
        };

        this.emit('chat', normalizedMessage);

        // Detección de nuevo seguidor anunciado en el chat por bots (KickBot, BotRix, System, etc.)
        const senderLower = (normalizedMessage.user || '').toLowerCase();
        const msgText = (normalizedMessage.message || '').trim();
        const followMatch = msgText.match(/(?:thanks\s+for\s+(?:the\s+)?follow(?:ing)?|gracias\s+por\s+seguir(?:nos)?|now\s+following)\s+@?([a-zA-Z0-9_\-\.]+)/i);
        const isBot = ['kickbot', 'botrix', 'system'].includes(senderLower) || senderLower.includes('bot') || msgText.toLowerCase().startsWith('thanks for the follow');

        if (followMatch && isBot) {
          const followerName = followMatch[1];
          this.emit('alert', {
            id: 'kick-follow-' + Date.now(),
            platform: 'kick',
            type: 'follow',
            user: followerName,
            title: '¡Nuevo Seguidor en Kick!',
            details: `comenzó a seguirte en Kick 🟢`,
            sound: true,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        console.error('[KICK] Error parsing chat message:', e);
      }
    }

    // 1. Follower event (Pusher)
    if (event === 'App\\Events\\FollowersUpdated' || (event && event.toLowerCase().includes('follower'))) {
      try {
        const followData = typeof data === 'string' ? JSON.parse(data) : data;
        if (followData.followed === false) return; // Dejó de seguir
        const username = followData.username || followData.follower?.username || 'Nuevo seguidor';
        const normalizedAlert = {
          id: 'kick-follow-' + Date.now(),
          platform: 'kick',
          type: 'follow',
          user: username,
          title: '¡Nuevo Seguidor en Kick!',
          details: `comenzó a seguirte en Kick 🟢`,
          sound: true,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }

    // 2. Suscripción y Renovación
    if (event === 'App\\Events\\SubscriptionEvent') {
      try {
        const subData = typeof data === 'string' ? JSON.parse(data) : data;
        const username = subData.username || 'Suscriptor';
        const months = Number(subData.months || 1);
        const isRenewal = months > 1;

        const normalizedAlert = {
          id: 'kick-sub-' + Date.now(),
          platform: 'kick',
          type: isRenewal ? 'resub' : 'sub',
          user: username,
          title: isRenewal ? '¡Renovación en Kick!' : '¡Nueva Suscripción en Kick!',
          months: months,
          details: isRenewal
            ? `renovó su suscripción (${months} meses) ⭐`
            : `se ha suscrito al canal ⭐`,
          sound: true,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }

    // 3. Subs regaladas
    if (event === 'App\\Events\\GiftedSubscriptionsEvent') {
      try {
        const giftData = typeof data === 'string' ? JSON.parse(data) : data;
        const gifter = giftData.gifter_username || giftData.username || 'Benefactor';
        const count = giftData.gifted_usernames ? giftData.gifted_usernames.length : (giftData.count || 1);
        const normalizedAlert = {
          id: 'kick-gift-sub-' + Date.now(),
          platform: 'kick',
          type: 'gift_sub',
          user: gifter,
          title: '¡Suscripciones Regaladas!',
          count: count,
          details: `regaló ${count} suscripción${count > 1 ? 'es' : ''} en Kick 🎁`,
          sound: true,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }

    // 4. KICKs / Donaciones
    if (event.includes('Kicks') || event.includes('Donation') || event.includes('Gift')) {
      try {
        const kData = typeof data === 'string' ? JSON.parse(data) : data;
        const username = kData.sender?.username || kData.username || 'Donador';
        const amount = kData.amount || kData.kicks || 100;
        this.emit('alert', {
          id: 'kick-kicks-' + Date.now(),
          platform: 'kick',
          type: 'kicks',
          user: username,
          title: '¡Donación de KICKs!',
          details: `envió ${amount} KICKs 🪙`,
          sound: true,
          timestamp: Date.now()
        });
      } catch (e) {}
    }

    // 5. Host & Raid en Kick
    if (event === 'App\\Events\\StreamHostEvent' || event.includes('Raid') || event === 'App\\Events\\StreamRaidEvent') {
      try {
        const hostData = typeof data === 'string' ? JSON.parse(data) : data;
        const hoster = hostData.host_username || hostData.hoster_username || hostData.raider_username || hostData.username || 'Streamer';
        const viewers = hostData.number_viewers || hostData.viewers || 0;
        const isRaid = event.toLowerCase().includes('raid');
        const normalizedAlert = {
          id: 'kick-host-' + Date.now(),
          platform: 'kick',
          type: 'host',
          user: hoster,
          title: isRaid ? '¡Raid en Kick!' : '¡Host en Kick!',
          viewers: viewers,
          details: viewers > 0
            ? `te está ${isRaid ? 'raideando' : 'hosteando'} con ${viewers} espectadores 📡`
            : `te está ${isRaid ? 'raideando' : 'hosteando'} en Kick 📡`,
          sound: true,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }
  }

  _startViewerPolling() {
    this._stopViewerPolling();
    const poll = async () => {
      if (!this.isConnected || !this.channelSlug) return;
      try {
        const res = await fetch(`https://kick.com/api/v1/channels/${this.channelSlug}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.livestream) {
            this.viewers = Number(data.livestream.viewer_count) || 0;
          } else {
            this.viewers = 0;
          }
          this.emit('viewers', { platform: 'kick', viewers: this.viewers });
        }
      } catch (_) {}
    };
    poll();
    this.viewerPollInterval = setInterval(poll, 20000);
  }

  _stopViewerPolling() {
    if (this.viewerPollInterval) {
      clearInterval(this.viewerPollInterval);
      this.viewerPollInterval = null;
    }
  }

  _clearIntervals() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this._stopViewerPolling();
  }

  disconnect() {
    this._clearIntervals();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.chatroomId = null;
    this.channelId = null;
  }
}

module.exports = KickConnector;
