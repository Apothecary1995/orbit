const WS_BASE = 'ws://localhost:8080/ws';

const Socket = {
  _ws:          null,
  _reconnectMs: 1000,
  _handlers:    {},
  _pendingJoins: [],

  connect() {
    if (!Store.isLoggedIn()) return;
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE}?user_id=${Store.user.id}`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      console.log('WS bağlandı');
      this._reconnectMs = 1000;
      this._emit('connected');

      // Bekleyen join'leri gönder
      const pending = [...this._pendingJoins];
      this._pendingJoins = [];
      pending.forEach(convId => this.joinConv(convId));

      // Store'daki sohbetlere katıl
      const convs = Store.conversations || [];
      convs.forEach(conv => this.joinConv(conv.id));
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch (e) {
        console.error('WS parse hatası:', e);
      }
    };

    this._ws.onclose = () => {
      console.log(`WS kapandı, ${this._reconnectMs}ms sonra bağlanıyor...`);
      this._emit('disconnected');
      setTimeout(() => this.connect(), this._reconnectMs);
      this._reconnectMs = Math.min(this._reconnectMs * 2, 30000);
    };

    this._ws.onerror = (err) => {
      console.error('WS hatası:', err);
    };
  },

  joinConv(convId) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this.send('join_conv', { conversation_id: convId });
      console.log('join_conv gönderildi:', convId);
    } else {
      // WS hazır değil — beklet
      if (!this._pendingJoins.includes(convId)) {
        this._pendingJoins.push(convId);
      }
    }
  },

  send(type, payload) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type, payload }));
    }
  },

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

  _handleMessage(msg) {
    console.log('WS mesaj:', msg);
    switch (msg.type) {
      case 'new_message':
        Store.addMessage(msg.payload.conversation_id, msg.payload);
        this._emit('new_message', msg.payload);
        break;
      case 'connected':
        console.log('WS onaylandı');
        break;
      case 'typing':
        this._emit('typing', msg.payload);
        break;
      case 'presence':
        if (msg.payload.online) Store.setOnline(msg.payload.user_id);
        else Store.setOffline(msg.payload.user_id);
        this._emit('presence', msg.payload);
        break;
      case 'online_users':
        Store.setOnlineUsers(msg.payload.user_ids || []);
        this._emit('online_users', msg.payload);
        break;
        case 'call_signal':
  this._emit('call_signal', msg.payload);
  break;
    }
  },

  disconnect() {
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
      this._ws = null;
    }
  },
};