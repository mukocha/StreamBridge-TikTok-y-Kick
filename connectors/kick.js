const WebSocket = require('ws');
const EventEmitter = require('events');

class KickConnector extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.channelSlug = null;
    this.chatroomId = null;
    this.channelId = null;
    this.isConnected = false;
    this.pingInterval = null;
    // Current working Kick Pusher credentials
    this.pusherKey = '34bf7a0ff419a2a775b9';
    this.pusherCluster = 'us2';
  }

  async connect(channelInput) {
    if (!channelInput) return false;
    this.disconnect();
    
    const cleanInput = String(channelInput).trim().toLowerCase().replace(/^@/, '');
    this.channelSlug = cleanInput;

    // Cache / Known channels dictionary
    const knownChannels = {
      'chamukoi': { chatroomId: 6823990, channelId: 6884630 },
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

      // Layer 2: Try v2 /chatroom endpoint
      let resolvedChatroomId = null;
      let resolvedChannelId = null;

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

      // Layer 3: Try v1 /channels endpoint if v2 did not return id
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
        throw new Error(`Cloudflare bloqueó la búsqueda en la nube. Introduce directamente tu Chatroom ID numérico (ej: 669512).`);
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
      } catch (e) {
        console.error('[KICK] Error parsing chat message:', e);
      }
    }

    // Follower event
    if (event === 'App\\Events\\FollowersUpdated') {
      try {
        const followData = typeof data === 'string' ? JSON.parse(data) : data;
        const normalizedAlert = {
          id: 'kick-follow-' + Date.now(),
          platform: 'kick',
          type: 'follow',
          user: followData.username || 'Nuevo seguidor',
          details: '¡Comenzó a seguir en Kick!',
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }

    // Subscription Event
    if (event === 'App\\Events\\SubscriptionEvent') {
      try {
        const subData = typeof data === 'string' ? JSON.parse(data) : data;
        const normalizedAlert = {
          id: 'kick-sub-' + Date.now(),
          platform: 'kick',
          type: 'subscription',
          user: subData.username || 'Suscriptor',
          months: subData.months || 1,
          details: `¡Se suscribió en Kick (${subData.months || 1} mes${subData.months > 1 ? 'es' : ''})!`,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }

    // Gifted Subscriptions Event
    if (event === 'App\\Events\\GiftedSubscriptionsEvent') {
      try {
        const giftData = typeof data === 'string' ? JSON.parse(data) : data;
        const count = giftData.gifted_usernames ? giftData.gifted_usernames.length : (giftData.count || 1);
        const normalizedAlert = {
          id: 'kick-gift-sub-' + Date.now(),
          platform: 'kick',
          type: 'gift_sub',
          user: giftData.gifter_username || 'Benefactor',
          count: count,
          details: `¡Regaló ${count} suscripción${count > 1 ? 'es' : ''} en Kick!`,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }

    // Stream host event
    if (event === 'App\\Events\\StreamHostEvent') {
      try {
        const hostData = typeof data === 'string' ? JSON.parse(data) : data;
        const normalizedAlert = {
          id: 'kick-host-' + Date.now(),
          platform: 'kick',
          type: 'host',
          user: hostData.host_username || 'Host',
          viewers: hostData.number_viewers || 0,
          details: `¡Hospedó la transmisión con ${hostData.number_viewers || 0} espectadores!`,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      } catch (e) {}
    }
  }

  _clearIntervals() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
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
