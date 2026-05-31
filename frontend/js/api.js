// ── Cengsta Paradise — API Client ────────────────────────

const API_BASE = 'http://localhost:8080/api/v1';

const Api = {
  // ── Temel fetch wrapper ────────────────────────────────
  async _request(method, path, body = null, auth = true) {
    const headers = { 'Content-Type': 'application/json' };

    if (auth && Store.accessToken) {
      headers['Authorization'] = `Bearer ${Store.accessToken}`;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${path}`, opts);

      // Token süresi dolmuşsa refresh dene
      if (res.status === 401 && Store.refreshToken) {
        const refreshed = await this.refresh();
        if (refreshed) {
          return this._request(method, path, body, auth);
        } else {
          Store.clearAuth();
          Router.navigate('login');
          return null;
        }
      }

      let data;
      try {
        data = await res.json();
      } catch {
        if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`);
        throw new Error('Sunucu yanıtı okunamadı');
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Bir hata oluştu');
      }

      return data;
    } catch (err) {
      console.error(`API hatası [${method} ${path}]:`, err);
      throw err;
    }
  },

  get(path, auth = true)         { return this._request('GET', path, null, auth); },
  post(path, body, auth = true)  { return this._request('POST', path, body, auth); },
  put(path, body, auth = true)   { return this._request('PUT', path, body, auth); },
  delete(path, auth = true)      { return this._request('DELETE', path, null, auth); },

  // ── Auth endpoint'leri ─────────────────────────────────
  async register(username, phone, password) {
    return this.post('/auth/register', {
      username,
      phone,
      password,
      device_name: navigator.userAgent.substring(0, 50),
      public_key:  'placeholder-key', // E2EE ileride
    }, false);
  },

  async login(phone, password) {
    return this.post('/auth/login', {
      phone,
      password,
      device_name: navigator.userAgent.substring(0, 50),
      public_key:  'placeholder-key',
    }, false);
  },

  async refresh() {
    try {
      const data = await this.post('/auth/refresh', {
        refresh_token: Store.refreshToken,
      }, false);
      if (data) {
        Store.setAuth(Store.user, data.access_token, data.refresh_token);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  },

  async logout(sessionId) {
    return this.post('/auth/logout', { session_id: sessionId });
  },

  // ── Chat endpoint'leri ─────────────────────────────────
  async getConversations() {
  const userId = Store.user ? Store.user.id : null;
  if (!userId) throw new Error('user_id zorunlu');
  return this.get(`/chat/conversations?user_id=${userId}`);
},

  async getMessages(convId, limit = 50, offset = 0) {
    return this.get(`/chat/conversations/${convId}/messages?limit=${limit}&offset=${offset}`);
  },

  async sendMessage(convId, content, type = 'text') {
    return this.post(`/chat/conversations/${convId}/messages`, {
      content,
      type,
      sender_id: Store.user.id,
    });
  },

  async createConversation(memberIds, type = 'direct', name = '') {
    return this.post('/chat/conversations', {
      type,
      name,
      member_ids: memberIds,
    });
  },

  async getVapidKey() {
    return this.get('/notifications/vapid-public-key');
  },

  async savePushSubscription(userId, subscription) {
    return this.post('/notifications/subscribe', { user_id: userId, subscription });
  },

  // ── Server endpoint'leri ───────────────────────────────
  async getServers() {
    const userId = Store.user?.id;
    if (!userId) throw new Error('user_id zorunlu');
    return this.get(`/servers?user_id=${userId}`);
  },

  async createServer(name, iconUrl = '') {
    return this.post('/servers', { name, icon_url: iconUrl, owner_id: Store.user.id });
  },

  async joinServer(inviteCode) {
    return this.post('/servers/join', { invite_code: inviteCode, user_id: Store.user.id });
  },

  async deleteServer(serverId) {
    return this._request('DELETE', `/servers/${serverId}`, { user_id: Store.user.id });
  },

  // ── Kanal endpoint'leri ────────────────────────────────
  async getChannels(serverId) {
    return this.get(`/servers/${serverId}/channels?user_id=${Store.user.id}`);
  },

  async createChannel(serverId, name, topic = '', type = 'text') {
    return this.post(`/servers/${serverId}/channels`, { name, topic, type, owner_id: Store.user.id });
  },

  async deleteChannel(channelId) {
    return this._request('DELETE', `/channels/${channelId}`, { user_id: Store.user.id });
  },

  // ── Üye & rol endpoint'leri ────────────────────────────
  async getServerMembers(serverId) {
    return this.get(`/servers/${serverId}/members?requester_id=${Store.user.id}`);
  },

  async setMemberRole(serverId, targetUserId, role) {
    return this._request('PUT', `/servers/${serverId}/members/${targetUserId}/role`, {
      requester_id: Store.user.id,
      role,
    });
  },

  async kickMember(serverId, targetUserId) {
    return this._request('DELETE', `/servers/${serverId}/members/${targetUserId}`, {
      requester_id: Store.user.id,
    });
  },

  async getChannelMessages(channelId) {
    return this.get(`/channels/${channelId}/messages`);
  },

  async sendChannelMessage(channelId, content, type = 'text') {
    return this.post(`/channels/${channelId}/messages`, {
      content, type, sender_id: Store.user.id,
    });
  },
};