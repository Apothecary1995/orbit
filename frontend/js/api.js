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
      const data = await res.json();

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

      if (!res.ok) {
        throw new Error(data.error || 'Bir hata oluştu');
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
    return this.get('/chat/conversations');
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
};