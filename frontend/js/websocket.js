// ── Cengsta Paradise — WebSocket ─────────────────────────

const WS_BASE = 'ws://localhost:8080/ws';

const Socket = {
  _ws:          null,
  _reconnectMs: 1000,
  _handlers:    {},

  // ── Bağlan ────────────────────────────────────────────
  connect() {
    if (!Store.isLoggedIn()) return;

    const url = `${WS_BASE}?user_id=${Store.user.id}`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      console.log('WS bağlandı');
      this._reconnectMs = 1000;
      this._emit('connected');
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch (e) {
        console.error('WS mesaj parse hatası:', e);
      }
    };

    this._ws.onclose = () => {
      console.log(`WS kapandı, ${this._reconnectMs}ms sonra yeniden bağlanıyor...`);
      this._emit('disconnected');
      setTimeout(() => this.connect(), this._reconnectMs);
      this._reconnectMs = Math.min(this._reconnectMs * 2, 30000); // max 30s
    };

    this._ws.onerror = (err) => {
      console.error('WS hatası:', err);
    };
  },

  // ── Mesaj gönder ──────────────────────────────────────
  send(type, payload) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type, payload }));
    }
  },

  // ── Event sistemi ─────────────────────────────────────
  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  },

  off(event, handler) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(h => h !== handler);
  },

  _emit(event, data) {
    (this._handlers[event] || []).forEach(h => h(data));
  },

  // ── Gelen mesajları yönet ─────────────────────────────
  _handleMessage(msg) {
    switch (msg.type) {
      case 'new_message':
        Store.addMessage(msg.payload.conversation_id, msg.payload);
        this._emit('new_message', msg.payload);
        break;

      case 'user_online':
        Store.setOnline(msg.payload.user_id);
        this._emit('user_online', msg.payload);
        break;

      case 'user_offline':
        Store.setOffline(msg.payload.user_id);
        this._emit('user_offline', msg.payload);
        break;

      case 'message_read':
        this._emit('message_read', msg.payload);
        break;

      case 'typing':
        this._emit('typing', msg.payload);
        break;

      default:
        console.log('Bilinmeyen WS mesaj tipi:', msg.type);
    }
  },

  disconnect() {
    if (this._ws) {
      this._ws.onclose = null; // reconnect'i engelle
      this._ws.close();
      this._ws = null;
    }
  },
};