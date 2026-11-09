const EventEmitter = require('events');
const { TikTokLiveConnection } = require('tiktok-live-connector');

class TikTokConnector extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.username = null;
    this.isConnected = false;
  }

  async connect(username, options = {}) {
    if (!username) return false;
    this.disconnect();

    this.username = username.trim().replace(/^@/, '');
    this.emit('status', { status: 'connecting', message: `Conectando a TikTok Live: @${this.username}...` });

    try {
      const signApiKey = options.signApiKey || process.env.TIKTOK_SIGN_API_KEY || undefined;
      
      const connOptions = {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        requestPollingIntervalMs: 1500,
        ...options
      };

      if (signApiKey) {
        connOptions.signApiKey = signApiKey;
      }

      this.connection = new TikTokLiveConnection(this.username, connOptions);

      this.connection.on('connected', (state) => {
        this.isConnected = true;
        this.emit('status', {
          status: 'connected',
          message: `Conectado a TikTok Live (@${this.username})`,
          roomId: state.roomId
        });
      });

      this.connection.on('disconnected', (reason) => {
        this.isConnected = false;
        this.emit('status', { status: 'disconnected', message: `Desconectado de TikTok: ${reason || ''}` });
      });

      this.connection.on('streamEnd', () => {
        this.isConnected = false;
        this.emit('status', { status: 'offline', message: `El directo de TikTok ha finalizado` });
      });

      // Chat Messages
      this.connection.on('chat', (data) => {
        const normalizedMessage = {
          id: data.msgId || String(Date.now() + Math.random()),
          platform: 'tiktok',
          user: data.nickname || data.uniqueId || 'Anónimo',
          uniqueId: data.uniqueId,
          avatar: data.profilePictureUrl || null,
          badges: data.userBadges ? data.userBadges.map(b => b.name || b.type).filter(Boolean) : [],
          color: '#fe2c55', // TikTok iconic magenta/red
          message: data.comment || '',
          timestamp: Date.now()
        };
        this.emit('chat', normalizedMessage);
      });

      // Gifts
      this.connection.on('gift', (data) => {
        // Only trigger alert on streak finish or non-streak gifts (repeatEnd or repeatCount)
        if (data.giftType === 1 && !data.repeatEnd) {
          // Streak gift in progress, still counting
          return;
        }

        const count = data.repeatCount || 1;
        const normalizedAlert = {
          id: 'tiktok-gift-' + Date.now(),
          platform: 'tiktok',
          type: 'gift',
          user: data.nickname || data.uniqueId || 'Anónimo',
          giftName: data.giftName || 'Regalo',
          count: count,
          diamonds: (data.diamondCount || 1) * count,
          giftIcon: data.giftPictureUrl || null,
          details: `¡Envió ${data.giftName || 'Regalo'} x${count}!`,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Followers
      this.connection.on('follow', (data) => {
        const normalizedAlert = {
          id: 'tiktok-follow-' + Date.now(),
          platform: 'tiktok',
          type: 'follow',
          user: data.nickname || data.uniqueId || 'Nuevo seguidor',
          details: `¡Comenzó a seguirte en TikTok!`,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Shares
      this.connection.on('share', (data) => {
        const normalizedAlert = {
          id: 'tiktok-share-' + Date.now(),
          platform: 'tiktok',
          type: 'share',
          user: data.nickname || data.uniqueId || 'Espectador',
          details: `¡Compartió el directo de TikTok!`,
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Connect to TikTok Live
      await this.connection.connect();
      return true;
    } catch (err) {
      console.error('[TIKTOK] Error al conectar:', err.message);
      this.isConnected = false;
      this.emit('status', {
        status: 'error',
        message: err.message.includes('LIVE has ended') || err.message.includes('offline')
          ? `El usuario @${this.username} no está en directo en este momento.`
          : `Error TikTok: ${err.message}`
      });
      return false;
    }
  }

  disconnect() {
    if (this.connection) {
      try {
        this.connection.disconnect();
      } catch (e) {}
      this.connection = null;
    }
    this.isConnected = false;
  }
}

module.exports = TikTokConnector;
