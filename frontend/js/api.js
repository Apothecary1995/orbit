// ── Orbit — API Client ────────────────────────

const API_BASE = 'https://orbit.ahmetcengiz.dev/api/v1';

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

  async sendMessage(convId, content, type = 'text', replyToId = '') {
    return this.post(`/chat/conversations/${convId}/messages`, {
      content,
      type,
      reply_to_id: replyToId,
      // sender_id backend'de JWT'den alınır
    });
  },

  async createConversation(memberIds, type = 'direct', name = '') {
    return this.post('/chat/conversations', {
      type,
      name,
      member_ids: memberIds,
      // created_by backend'de JWT'den alınır, client'tan göndermeye gerek yok
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
      content, type,
      // sender_id backend'de JWT'den alınır
    });
  },

  // ── Arkadaş endpoint'leri ──────────────────────────────
  // GET /api/v1/friends → {friends: [{id, user_id, username, status}...]}
  async getFriends() {
    return this.get('/friends');
  },

  // GET /api/v1/friends/pending → {pending: [{id, from_user_id, from_username}...]}
  async getPendingFriends() {
    return this.get('/friends/pending');
  },

  // POST /api/v1/friends/request  body: {target_user_id}
  async friendRequest(targetUserId) {
    return this.post('/friends/request', { target_user_id: targetUserId });
  },

  // POST /api/v1/friends/accept  body: {friendship_id}
  async acceptFriend(friendshipId) {
    return this.post('/friends/accept', { friendship_id: friendshipId });
  },

  // POST /api/v1/friends/reject  body: {friendship_id}
  async rejectFriend(friendshipId) {
    return this.post('/friends/reject', { friendship_id: friendshipId });
  },

  // DELETE /api/v1/friends/{friendship_id}
  async removeFriend(friendshipId) {
    return this.delete(`/friends/${friendshipId}`);
  },

  // ── Davet kodu endpoint'leri ───────────────────────────
  async createInvite(maxUses = 50) {
    return this.post('/invites', { max_uses: maxUses });
  },

  async getInviteInfo(code) {
    return this.get(`/invites/${code}`, false);
  },

  async useInvite(code) {
    return this.post(`/invites/${code}/use`);
  },
};