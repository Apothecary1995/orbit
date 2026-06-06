// ── Orbit — Global State ──────────────────────
// localStorage ile kalıcı, memory ile hızlı erişim

const Store = {
  // ── State ──────────────────────────────────────────────
  _state: {
    user:            null,
    accessToken:     null,
    refreshToken:    null,
    activeConvId:    null,
    conversations:   [],
    messages:        {},   // convId → mesaj listesi
    onlineUsers:     new Set(),
    userMap:         new Map(), // userId → username, '~'+username → userId
    servers:          [],
    activeServerId:   null,
    channels:         {},   // serverId → kanal listesi
    activeChannelId:  null,
    mode:             'dm', // 'dm' | 'server'
    myVoiceChannelId: null,
    voiceParticipants: {}, // channelId → [userId]
    unreadCounts:    {},   // convId → number
    lastMessages:    {},   // convId → { content, created_at, sender_id }
  },

  // ── Auth ───────────────────────────────────────────────
  // Güvenlik notu:
  //   Normal kullanıcı: access token → bellekte; refresh token → localStorage
  //   Misafir: access token → sessionStorage (sekme kapanınca siler); refresh token yok
  setAuth(user, accessToken, refreshToken) {
    this._state.user         = user;
    this._state.accessToken  = accessToken;
    this._state.refreshToken = refreshToken;

    if (user?.role === 'guest') {
      // Misafir: sadece sessionStorage — sekme kapanınca otomatik silinir
      sessionStorage.setItem('cp_guest_token', accessToken);
      sessionStorage.setItem('cp_guest_user',  JSON.stringify(user));
      localStorage.removeItem('cp_access_token');
      localStorage.removeItem('cp_refresh_token');
      localStorage.removeItem('cp_user');
    } else {
      localStorage.setItem('cp_refresh_token', refreshToken);
      localStorage.setItem('cp_user',          JSON.stringify(user));
      localStorage.removeItem('cp_access_token');
    }
  },

  clearAuth() {
    this._state.user         = null;
    this._state.accessToken  = null;
    this._state.refreshToken = null;
    localStorage.removeItem('cp_access_token');
    localStorage.removeItem('cp_refresh_token');
    localStorage.removeItem('cp_user');
    sessionStorage.removeItem('cp_guest_token');
    sessionStorage.removeItem('cp_guest_user');
  },

  loadFromStorage() {
    // Misafir oturumu?
    const guestToken = sessionStorage.getItem('cp_guest_token');
    const guestUserStr = sessionStorage.getItem('cp_guest_user');
    if (guestToken && guestUserStr) {
      try {
        this._state.user        = JSON.parse(guestUserStr);
        this._state.accessToken = guestToken;
        return;
      } catch {}
    }
    // Normal kullanıcı
    this._state.refreshToken = localStorage.getItem('cp_refresh_token');
    const userStr = localStorage.getItem('cp_user');
    if (userStr) {
      try { this._state.user = JSON.parse(userStr); } catch {}
    }
    localStorage.removeItem('cp_access_token');
  },

  isLoggedIn() {
    if (this._state.user?.role === 'guest') {
      return !!this._state.accessToken;
    }
    return !!this._state.refreshToken && !!this._state.user;
  },

  isGuest() {
    return this._state.user?.role === 'guest';
  },

  // ── Getters ────────────────────────────────────────────
  get user()         { return this._state.user; },
  get accessToken()  { return this._state.accessToken; },
  get refreshToken() { return this._state.refreshToken; },
  get activeConvId() { return this._state.activeConvId; },
  get conversations(){ return this._state.conversations; },

  // ── Conversations ──────────────────────────────────────
  setConversations(convs) {
    this._state.conversations = convs;
  },

  setActiveConv(convId) {
    this._state.activeConvId = convId;
  },

  // ── Messages ───────────────────────────────────────────
  getMessages(convId) {
    return this._state.messages[convId] || [];
  },

  addMessage(convId, message) {
    if (!this._state.messages[convId]) {
      this._state.messages[convId] = [];
    }
    this._state.messages[convId].push(message);
  },

  setMessages(convId, messages) {
    this._state.messages[convId] = messages;
  },

  updateMessage(messageId, patch) {
    for (const msgs of Object.values(this._state.messages)) {
      const msg = msgs.find(m => m.id === messageId);
      if (msg) { Object.assign(msg, patch); return; }
    }
  },

  // ── Online durumu ──────────────────────────────────────
  setOnline(userID)        { this._state.onlineUsers.add(userID); },
  setOffline(userID)       { this._state.onlineUsers.delete(userID); },
  isOnline(userID)         { return this._state.onlineUsers.has(userID); },
  setOnlineUsers(ids)      { this._state.onlineUsers = new Set(ids); },

  // ── Kullanıcı ID ↔ username eşlemesi ───────────────────
  addUser(id, username) {
    this._state.userMap.set(id, username);
    this._state.userMap.set('~' + username, id);
  },
  getUserId(username)  { return this._state.userMap.get('~' + username); },
  getUsername(id)      { return this._state.userMap.get(id); },

  // ── Server & kanal yönetimi ────────────────────────────
  get servers()         { return this._state.servers; },
  get activeServerId()  { return this._state.activeServerId; },
  get activeChannelId() { return this._state.activeChannelId; },
  get mode()            { return this._state.mode; },

  setServers(servers)   { this._state.servers = servers; },
  setActiveServer(id)   { this._state.activeServerId = id; this._state.mode = id ? 'server' : 'dm'; },
  setActiveChannel(id)  { this._state.activeChannelId = id; },
  setMode(mode)         { this._state.mode = mode; },

  // ── Sesli kanal ────────────────────────────────────────
  get myVoiceChannelId()  { return this._state.myVoiceChannelId; },
  setMyVoiceChannel(id)   { this._state.myVoiceChannelId = id; },
  getVoiceParticipants(channelId) { return this._state.voiceParticipants[channelId] || []; },
  setVoiceParticipants(channelId, users) { this._state.voiceParticipants[channelId] = users; },
  addVoiceParticipant(channelId, userId) {
    if (!this._state.voiceParticipants[channelId]) this._state.voiceParticipants[channelId] = [];
    if (!this._state.voiceParticipants[channelId].includes(userId))
      this._state.voiceParticipants[channelId].push(userId);
  },
  removeVoiceParticipant(channelId, userId) {
    if (this._state.voiceParticipants[channelId])
      this._state.voiceParticipants[channelId] = this._state.voiceParticipants[channelId].filter(id => id !== userId);
  },

  getChannels(serverId) { return this._state.channels[serverId] || []; },
  setChannels(serverId, channels) { this._state.channels[serverId] = channels; },
  addChannel(serverId, channel) {
    if (!this._state.channels[serverId]) this._state.channels[serverId] = [];
    this._state.channels[serverId].push(channel);
  },

  // ── Okunmamış sayaç ────────────────────────────────────
  incrementUnread(convId) {
    this._state.unreadCounts[convId] = (this._state.unreadCounts[convId] || 0) + 1;
  },
  resetUnread(convId) {
    delete this._state.unreadCounts[convId];
  },
  getUnread(convId) {
    return this._state.unreadCounts[convId] || 0;
  },

  // ── Son mesaj önizlemesi ────────────────────────────────
  setLastMessage(convId, msg) {
    this._state.lastMessages[convId] = msg;
  },
  getLastMessage(convId) {
    return this._state.lastMessages[convId] || null;
  },
};

// Sayfa açılınca localStorage'dan yükle
Store.loadFromStorage();