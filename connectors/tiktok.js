const EventEmitter = require('events');
const { TikTokLiveConnection, RouteConfig } = require('tiktok-live-connector');

// Parchear las rutas de EulerStream que requieren plan de pago
// Esto hace que la conexión funcione sin API Key desde cualquier servidor
RouteConfig.fetchRoomGifts = async () => [];
RouteConfig.fetchRoomGiftsFromProvider = async () => ({ data: { gifts: [] } });
RouteConfig.fetchWebcastSignatureFromProvider = async () => ({
  status: 200,
  response: {}
});

class TikTokConnector extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.username = null;
    this.isConnected = false;
    this.viewers = 0;
  }

  async connect(username) {
    if (!username) return false;
    this.disconnect();

    this.username = username.trim().replace(/^@/, '');
    this.emit('status', { status: 'connecting', message: `Conectando a TikTok Live: @${this.username}...` });

    try {
      this.connection = new TikTokLiveConnection(this.username, {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        enableExtendedGiftInfo: false,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 2000
      });

      // Verificar si está en vivo antes de conectar
      let roomId = undefined;
      let roomCheck = null;
      try {
        roomCheck = await this._fetchRoomData(this.connection, this.username);
        if (roomCheck) {
          if (!roomCheck.isLive) {
            throw Object.assign(new Error("El usuario no está en directo"), { name: 'UserOfflineError' });
          }
          roomId = roomCheck.roomId;
        } else {
          const isLive = await this.connection.fetchIsLive().catch(() => false);
          if (!isLive) {
            throw Object.assign(new Error("El usuario no está en directo"), { name: 'UserOfflineError' });
          }
        }
      } catch (checkErr) {
        if (checkErr.name === 'UserOfflineError') throw checkErr;
        // Si falla la verificación previa, intentar conectar de todas formas
      }

      // Escuchar errores para evitar que tumben el proceso Node.js
      this.connection.on('error', (err) => {
        console.warn(`[TikTok Warning] (@${this.username}):`, err?.info || err?.message || err);
      });

      this.connection.on('connected', () => {
        this.isConnected = true;
        console.log(`[TikTok] 🔴 ¡EN VIVO! Conectado a @${this.username}`);
        this.emit('status', {
          status: 'connected',
          message: `Conectado a TikTok Live (@${this.username})`
        });
        if (roomCheck && roomCheck.viewers !== undefined) {
          this.viewers = roomCheck.viewers;
          this.emit('viewers', { platform: 'tiktok', viewers: this.viewers });
        }
      });

      // Actualización de espectadores en tiempo real de TikTok
      this.connection.on('roomUser', (data) => {
        if (data && data.viewerCount !== undefined) {
          this.viewers = Number(data.viewerCount) || 0;
          this.emit('viewers', { platform: 'tiktok', viewers: this.viewers });
        }
      });

      this.connection.on('disconnected', () => {
        this.isConnected = false;
        this.viewers = 0;
        this.emit('viewers', { platform: 'tiktok', viewers: 0 });
        this.emit('status', { status: 'disconnected', message: `Desconectado de TikTok` });
      });

      this.connection.on('streamEnd', () => {
        this.isConnected = false;
        this.viewers = 0;
        this.emit('viewers', { platform: 'tiktok', viewers: 0 });
        this.emit('status', { status: 'offline', message: `El directo de TikTok ha finalizado` });
      });

      // Chat Messages
      this.connection.on('chat', (data) => {
        const user = data.user || {};
        const uniqueId = user.uniqueId || user.displayId || data.uniqueId || 'tiktok_user';
        const nickname = user.nickname || data.nickname || uniqueId;
        const message = (data.content || data.comment || '').trim();
        if (!message) return;

        const avatar = user.profilePicture?.urls?.[0] || data.profilePictureUrl || '';

        const normalizedMessage = {
          id: data.common?.msgId || data.msgId || String(Date.now() + Math.random()),
          platform: 'tiktok',
          user: nickname,
          uniqueId: uniqueId,
          avatar: avatar || null,
          badges: (user.badgeList || data.userBadges || []).map(b => b.name || b.type).filter(Boolean),
          color: '#fe2c55',
          message: message,
          timestamp: Date.now()
        };
        this.emit('chat', normalizedMessage);
      });

      // Regalos (Gifts)
      this.connection.on('gift', (data) => {
        // En TikTok los regalos con racha (streak) solo deben sonar y alertar al terminar la racha
        if (data.giftType === 1 && !data.repeatEnd) return;

        const user = data.user || {};
        const username = user.nickname || user.uniqueId || data.nickname || data.uniqueId || 'Alguien';
        const giftName = data.giftDetails?.giftName || data.giftName || (data.gift && data.gift.name) || 'Regalo';
        const count = Number(data.repeatCount || 1);
        const diamondCount = Number(data.diamondCount || data.giftDetails?.diamondCount || 1);
        const totalDiamonds = diamondCount * count;
        const icon = data.giftPictureUrl || data.giftDetails?.giftImage?.url?.[0] || '';

        const normalizedAlert = {
          id: 'tiktok-gift-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          platform: 'tiktok',
          type: 'gift',
          user: username,
          title: '¡Regalo en TikTok Live!',
          giftName: giftName,
          count: count,
          diamonds: totalDiamonds,
          giftIcon: icon || null,
          details: `envió ${giftName} x${count} (${totalDiamonds} 💎)`,
          sound: true, // SÍ lleva sonido
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Nuevos seguidores
      this.connection.on('follow', (data) => {
        const user = data.user || {};
        const username = user.nickname || user.uniqueId || data.nickname || data.uniqueId || 'Nuevo seguidor';
        const normalizedAlert = {
          id: 'tiktok-follow-' + Date.now(),
          platform: 'tiktok',
          type: 'follow',
          user: username,
          title: '¡Nuevo Seguidor en TikTok!',
          details: `comenzó a seguirte 💖`,
          sound: true, // SÍ lleva sonido
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Suscripción LIVE en TikTok
      this.connection.on('subscribe', (data) => {
        const user = data.user || {};
        const username = user.nickname || user.uniqueId || data.nickname || data.uniqueId || 'Suscriptor';
        const normalizedAlert = {
          id: 'tiktok-sub-' + Date.now(),
          platform: 'tiktok',
          type: 'sub',
          user: username,
          title: '¡Nueva Suscripción LIVE!',
          details: `se ha suscrito al canal ⭐`,
          sound: true, // SÍ lleva sonido
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Compartidos
      this.connection.on('share', (data) => {
        const user = data.user || {};
        const username = user.nickname || user.uniqueId || data.nickname || data.uniqueId || 'Espectador';
        const normalizedAlert = {
          id: 'tiktok-share-' + Date.now(),
          platform: 'tiktok',
          type: 'share',
          user: username,
          title: '¡Compartieron el LIVE!',
          details: `compartió la transmisión 🚀`,
          sound: false, // SILENCIOSO para no saturar
          timestamp: Date.now()
        };
        this.emit('alert', normalizedAlert);
      });

      // Likes (Acumulador inteligente por usuario para evitar spam sonoro de miles de toques)
      const likeBatches = new Map();
      this.connection.on('like', (data) => {
        const user = data.user || {};
        const username = user.nickname || user.uniqueId || data.nickname || data.uniqueId || 'Espectador';
        const count = Number(data.likeCount || 1);

        const current = likeBatches.get(username) || { total: 0, timer: null };
        current.total += count;

        if (current.timer) clearTimeout(current.timer);

        current.timer = setTimeout(() => {
          likeBatches.delete(username);
          if (current.total >= 10) { // Solo notificar si dio 10 o más likes acumulados
            this.emit('alert', {
              id: 'tiktok-like-' + Date.now(),
              platform: 'tiktok',
              type: 'like',
              user: username,
              title: '¡Likes en TikTok!',
              details: `envió ${current.total} likes ❤️`,
              sound: false, // SILENCIOSO (no interrumpe el directo)
              timestamp: Date.now()
            });
          }
        }, 5000);

        likeBatches.set(username, current);
      });

      // Nota: Evento 'member' (alguien entra al directo) omitido intencionalmente
      // para evitar saturar el chat y alertas con miles de notificaciones de entrada.

      // Connect
      await this.connection.connect(roomId);
      return true;
    } catch (err) {
      console.error('[TIKTOK] Error al conectar:', err.message);
      this.isConnected = false;

      const isOffline = (err.name === 'UserOfflineError') ||
        (err.message && (err.message.includes("isn't online") || err.message.includes('offline') || err.message.includes('no está en directo')));

      this.emit('status', {
        status: 'error',
        message: isOffline
          ? `@${this.username} no está en directo en este momento.`
          : `Error TikTok: ${err.message}`
      });
      return false;
    }
  }

  async _fetchRoomData(connector, username) {
    try {
      const cleanUser = (username || '').trim().replace(/^@/, '');
      if (!cleanUser || !connector?.webClient) return null;
      const roomData = await connector.webClient.getJsonObjectFromTikTokApi('api-live/user/room/', {
        ...connector.webClient.clientParams,
        uniqueId: cleanUser,
        sourceType: '54'
      });
      const liveRoom = roomData?.data?.liveRoom;
      if (liveRoom && liveRoom.status !== undefined) {
        const status = Number(liveRoom.status);
        const viewers = Number(liveRoom.liveRoomStats?.userCount ?? liveRoom.user_count ?? 0) || 0;
        return {
          isLive: status === 2,
          status,
          viewers,
          roomId: roomData?.data?.user?.roomId || liveRoom.roomId || ''
        };
      }
    } catch (_) {}
    return null;
  }

  disconnect() {
    if (this.connection) {
      try {
        this.connection.removeAllListeners();
        this.connection.disconnect();
      } catch (e) {}
      this.connection = null;
    }
    this.isConnected = false;
  }
}

module.exports = TikTokConnector;
