const WS_BASE = 'wss://orbit.ahmetcengiz.dev/ws';

const Socket = {
  _ws:          null,
  _reconnectMs: 1000,
  _handlers:    {},
  _pendingJoins: [],

  connect() {
    if (!Store.isLoggedIn()) return;
    if (!Store.accessToken) return; // Token yokken bağlanma — router zaten refresh ediyor
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE}?token=${encodeURIComponent(Store.accessToken)}`;
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

    this._ws.onclose = (event) => {
      console.log(`WS kapandı (code=${event.code}), ${this._reconnectMs}ms sonra bağlanıyor...`);
      this._emit('disconnected');
      // 4401 = sunucu tarafından token geçersiz olarak reddedildi
      if (event.code === 4401) {
        Store.clearAuth();
        if (typeof Router !== 'undefined') Router.navigate('login');
        return;
      }
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
      case 'new_message': {
        const p = msg.payload;
        if (!p || !p.conversation_id) break;
        Store.addMessage(p.conversation_id, p);
        Store.setLastMessage(p.conversation_id, p);

        if (p.conversation_id === Store.activeConvId) {
          const isSelf = p.sender_id === Store.user?.id;
          if (isSelf) {
            const tempEl = document.querySelector('[data-id^="temp-"]');
            if (tempEl) {
              // WS önce geldi: temp → gerçek ID
              tempEl.dataset.id = p.id;
              if (typeof updateMessageStatusIcon === 'function') {
                updateMessageStatusIcon(p.id, 'sent');
              }
            } else if (!document.querySelector(`[data-id="${p.id}"]`)) {
              // HTTP önce geldi VE element mevcut değil → başka cihaz/sekme
              if (typeof appendMessage === 'function') appendMessage(p);
            }
            // else: HTTP zaten temp'i gerçek ID'ye çevirdi → element DOM'da, atla
          } else if (typeof appendMessage === 'function') {
            appendMessage(p);
          }
        } else {
          Store.incrementUnread(p.conversation_id);
        }
        if (typeof renderConvList === 'function') renderConvList(Store.conversations);
        this._emit('new_message', p);
        break;
      }
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
      case 'message_edited':
        Store.updateMessage(msg.payload.message_id, { content: msg.payload.content, edited_at: msg.payload.edited_at });
        this._emit('message_edited', msg.payload);
        break;
      case 'message_deleted':
        Store.updateMessage(msg.payload.message_id, { deleted: true });
        this._emit('message_deleted', msg.payload);
        break;
      case 'call_signal':
        this._emit('call_signal', msg.payload);
        break;
      // ── Sesli kanal ──────────────────────────────────────
      case 'voice_participants':
        this._emit('voice_participants', msg.payload);
        break;
      case 'voice_user_joined':
        this._emit('voice_user_joined', msg.payload);
        break;
      case 'voice_user_left':
        this._emit('voice_user_left', msg.payload);
        break;
      case 'voice_signal':
        this._emit('voice_signal', msg.payload);
        break;
      case 'new_conversation':
        this._emit('new_conversation', msg.payload);
        break;
      case 'friend_request':
        this._emit('friend_request', msg.payload);
        break;
      case 'friend_accepted':
        this._emit('friend_accepted', msg.payload);
        break;
      case 'read_receipt':
        this._emit('read_receipt', msg.payload);
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