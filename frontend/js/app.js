// ── Orbit — Ana uygulama ──────────────────────

async function setupPushNotifications() {
  if (Store.isGuest()) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const data = await Api.getVapidKey().catch(() => null);
    if (!data?.public_key) return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await Api.savePushSubscription(Store.user.id, existing.toJSON()).catch(() => {});
      return;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    });
    await Api.savePushSubscription(Store.user.id, sub.toJSON()).catch(() => {});
  } catch(e) {
    console.warn('Push kurulum hatası:', e);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Service Worker mesajını dinle (bildirimden uygulama açıldığında)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open_conversation' && event.data.conversation_id) {
      openConversation(event.data.conversation_id);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  Router.register('login',    renderLogin);
  Router.register('register', renderRegister);
  Router.register('chat',     renderChat);
  Router.register('calls',    renderCalls);
  Router.register('status',   renderStatus);
  Router.register('404',      render404);
  Router.init();
});

// Sekme kapanınca misafir oturumunu Redis'ten sil
window.addEventListener('beforeunload', () => {
  if (Store.isGuest() && Store.accessToken) {
    const token = Store.accessToken;
    // keepalive: true — sayfa unload olsa bile istek tamamlanır
    fetch(API_BASE + '/auth/guest/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({}),
      keepalive: true,
    }).catch(() => {});
  }
});

// ── Global event delegation — tüm dinamik butonlar için ──
document.addEventListener('click', (e) => {
  // Logout — her yerden çalışır
  if (e.target.closest('#logout-btn')) {
    e.preventDefault();
    if (Store.isGuest()) Api.guestLogout().catch(() => {});
    Socket.disconnect();
    Store.clearAuth();
    Router.navigate('login');
    return;
  }
});

// ── Login sayfası ─────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">💬</div>
          <h1>Orbit</h1>
          <p>Güvenli · Hızlı · Gerçek zamanlı</p>
        </div>
        <form class="auth-form" id="login-form">
          <div class="input-group">
            <label class="input-label">Telefon numarası</label>
            <input class="input" type="tel" id="login-phone" placeholder="+905551234567" required />
          </div>
          <div class="input-group">
            <label class="input-label">Şifre</label>
            <input class="input" type="password" id="login-password" placeholder="••••••••" required />
          </div>
          <button class="btn btn-primary btn-full" type="submit" id="login-btn">
            Giriş yap
          </button>
          <div id="login-error" class="hidden auth-error"></div>
        </form>
        <div class="auth-divider" style="display:flex;align-items:center;gap:8px;margin:8px 0;color:var(--text-muted);font-size:12px">
          <hr style="flex:1;border:none;border-top:1px solid var(--border-color)" />
          veya
          <hr style="flex:1;border:none;border-top:1px solid var(--border-color)" />
        </div>
        <button class="btn btn-ghost btn-full" id="guest-btn" style="font-size:14px">
          Misafir olarak devam et
        </button>
        <div class="auth-switch">
          Hesabın yok mu? <a href="#/register">Kayıt ol</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone    = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errEl    = document.getElementById('login-error');

    btn.disabled = true;
    btn.textContent = 'Giriş yapılıyor...';
    errEl.classList.add('hidden');

    try {
      const data = await Api.login(phone, password);
      Store.setAuth(data.user, data.access_token, data.refresh_token);
      Socket.connect();
      Router.navigate('chat');
    } catch (err) {
      errEl.textContent = err.message || 'Giriş başarısız. Bilgilerini kontrol et.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Giriş yap';
    }
  });

  document.getElementById('guest-btn').addEventListener('click', async () => {
    const btn = document.getElementById('guest-btn');
    btn.disabled = true;
    btn.textContent = 'Bağlanıyor...';
    try {
      const data = await Api.guestLogin();
      Store.setAuth(
        { id: data.user_id, username: data.username, role: 'guest' },
        data.access_token,
        ''
      );
      Socket.connect();
      Router.navigate('chat');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Misafir olarak devam et';
    }
  });
}

// ── Kayıt sayfası ─────────────────────────────────────
function renderRegister() {
  const inviteCode = window._pendingInviteCode || '';

  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">💬</div>
          <h1>Orbit</h1>
          <p>${inviteCode ? 'Davet ile kayıt ol' : 'Hesap oluştur'}</p>
        </div>
        ${inviteCode ? `<div style="background:var(--color-primary);color:white;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;text-align:center">Davet kodu: <strong>${escHtml(inviteCode)}</strong></div>` : ''}
        <form class="auth-form" id="register-form">
          <div class="input-group">
            <label class="input-label">Kullanıcı adı</label>
            <input class="input" type="text" id="reg-username" placeholder="kullanici_adi" required />
          </div>
          <div class="input-group">
            <label class="input-label">Telefon numarası</label>
            <input class="input" type="tel" id="reg-phone" placeholder="+905551234567" required />
          </div>
          <div class="input-group">
            <label class="input-label">Şifre</label>
            <input class="input" type="password" id="reg-password" placeholder="En az 8 karakter" required />
          </div>
          <button class="btn btn-primary btn-full" type="submit" id="reg-btn">
            Kayıt ol
          </button>
          <div id="reg-error" class="hidden auth-error"></div>
        </form>
        <div class="auth-switch">
          Zaten hesabın var mı? <a href="#/login">Giriş yap</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const phone    = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const btn      = document.getElementById('reg-btn');
    const errEl    = document.getElementById('reg-error');

    btn.disabled = true;
    btn.textContent = 'Kayıt yapılıyor...';
    errEl.classList.add('hidden');

    try {
      const data = await Api.register(username, phone, password);
      Store.setAuth(data.user, data.access_token, data.refresh_token);

      // Davet kodu varsa kullan (arkadaşlık oluşturur)
      if (inviteCode) {
        await Api.useInvite(inviteCode).catch(() => {});
        delete window._pendingInviteCode;
      }

      Socket.connect();
      Router.navigate('chat');
    } catch (err) {
      errEl.textContent = err.message || 'Kayıt başarısız';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Kayıt ol';
    }
  });
}

function updatePresenceIndicator(userId, online) {
  const item = document.querySelector(`.conv-item[data-other-user-id="${userId}"]`);
  if (item) {
    const dot = item.querySelector('.presence-dot');
    if (dot) dot.classList.toggle('online', online);
  }

  const hdr = document.getElementById('chat-header');
  if (hdr && hdr.dataset.otherUserId === userId) {
    const el = document.getElementById('typing-indicator');
    if (el && !el.dataset.typing) {
      if (online) {
        el.textContent = 'Çevrimiçi';
        el.style.color = 'var(--color-success)';
      } else {
        el.textContent = 'son görülme yükleniyor...';
        el.style.color = 'var(--text-muted)';
        Api.get(`/auth/users/${userId}`).then(data => {
          if (!data?.user?.last_seen) return;
          el.textContent = formatLastSeen(data.user.last_seen);
        }).catch(() => { el.textContent = 'Çevrimdışı'; });
      }
    }
  }
}

function formatLastSeen(isoStr) {
  if (!isoStr || isoStr === '0001-01-01 00:00:00 +0000 UTC') return 'Çevrimdışı';
  const d = new Date(isoStr);
  if (isNaN(d)) return 'Çevrimdışı';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Az önce görüldü';
  if (mins < 60) return `${mins} dakika önce görüldü`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} saat önce görüldü`;
  const days = Math.floor(hrs / 24);
  return `${days} gün önce görüldü`;
}

// ── Chat sayfası ──────────────────────────────────────
function renderChat() {
  Socket.connect();
  setupPushNotifications();

  document.getElementById('app').innerHTML = `
    <div class="server-panel" id="server-panel">
      <div class="server-icon active" id="server-dm-btn" title="Direkt Mesajlar">${Icons.messageSquare}</div>
      <div class="server-icon" id="server-friends-btn" title="Arkadaşlar">${Icons.users}</div>
      <div class="server-divider"></div>
      <div id="server-icons"></div>
      <div class="server-divider" id="server-icons-divider" style="display:none"></div>
      <div class="server-icon" id="server-add-btn" title="Server oluştur">${Icons.plus}</div>
      <div class="server-icon" id="server-join-btn" title="Server'a katıl">${Icons.hash}</div>
    </div>
    <div class="sidebar" id="main-sidebar">
      <div class="sidebar-header">
        <div class="avatar-wrap">
          <div class="avatar">${Store.user?.username?.[0]?.toUpperCase() || 'U'}</div>
          <div class="presence-dot online"></div>
        </div>
        <div class="sidebar-user-info">
          <div class="sidebar-username">${escHtml(Store.user?.username || '')}</div>
          <div class="sidebar-status">Çevrimiçi</div>
        </div>
        <button class="btn-icon" id="new-chat-btn" title="Yeni mesaj">${Icons.plus}</button>
        <button class="btn-icon" id="logout-btn" title="Çıkış yap">${Icons.logOut}</button>
      </div>

      <div id="search-panel" class="hidden" style="padding:10px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-elevated)">
        <input class="input input-search" type="text" id="user-search-input" placeholder="Kullanıcı ara..." />
        <div id="search-results" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto"></div>
      </div>

      <div id="story-bar" class="story-bar"></div>

      <div class="sidebar-search">
        <input class="input input-search" type="text" placeholder="Sohbet ara..." id="search-input" />
      </div>
      <div class="sidebar-list" id="conv-list"></div>
    </div>

    <div class="chat-area" id="chat-area">
      <div class="welcome-screen">
        <div class="welcome-icon">${Icons.messageSquare}</div>
        <h3>Sohbet seç</h3>
        <p>Sol taraftan bir sohbet seç veya yeni mesaj başlat</p>
      </div>
    </div>
  `;

  // Misafir UI
  if (Store.isGuest()) {
    // Server panelini gizle
    document.getElementById('server-panel').style.display = 'none';
    // Story bar'ı gizle
    document.getElementById('story-bar').style.display = 'none';
    // Sarı banner
    const sidebar = document.getElementById('main-sidebar');
    const banner = document.createElement('div');
    banner.id = 'guest-banner';
    banner.style.cssText = 'background:#b45309;color:#fff;font-size:12px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0';
    banner.innerHTML = `
      <span>👤 Misafir · Sekme kapanınca tüm veriler silinir</span>
      <a href="#/register" style="color:#fef08a;font-weight:600;white-space:nowrap;text-decoration:none">Kayıt ol →</a>
    `;
    sidebar.insertBefore(banner, sidebar.firstChild);
  }

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    Socket.disconnect();
    Store.clearAuth();
    Router.navigate('login');
  });

  // --- YENİ EKLENEN AÇILIR MENÜ KODU BURASI ---
  document.getElementById('new-chat-btn').addEventListener('click', () => {
    // Menü göster
    const existing = document.getElementById('new-chat-menu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.id = 'new-chat-menu';
    menu.style.cssText = 'position:absolute;top:52px;left:12px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:10px;padding:6px;z-index:100;min-width:160px;box-shadow:var(--shadow-md)';
    menu.innerHTML = `
      <div id="menu-direct" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">
        💬 Yeni mesaj
      </div>
      <div id="menu-group" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">
        👥 Grup oluştur
      </div>
    `;

    // Sidebar'a relative position ekle
    const sidebar = document.querySelector('.sidebar');
    sidebar.style.position = 'relative';
    sidebar.appendChild(menu);

    document.getElementById('menu-direct').addEventListener('click', () => {
      menu.remove();
      const panel = document.getElementById('search-panel');
      panel.classList.remove('hidden');
      document.getElementById('user-search-input').focus();
    });

    document.getElementById('menu-group').addEventListener('click', () => {
      menu.remove();
      showGroupModal();
    });

    // Dışarı tıklayınca kapat
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target.id !== 'new-chat-btn') {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
  });
  // --- YENİ EKLENEN KODUN BİTİŞİ ---

  // Kullanıcı arama
  let searchTimer;
  document.getElementById('user-search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) {
      document.getElementById('search-results').innerHTML = '';
      return;
    }
    searchTimer = setTimeout(() => searchUsers(q), 400);
  });

  // WebSocket mesaj dinleyici — handler birikimsini önlemek için off→on
  Socket.off('new_message', window._newMessageHandler);
  window._newMessageHandler = (msg) => {
    // websocket.js _handleMessage temp→real geçişini ve DOM eklemeyi zaten yapıyor.
    // Burada sadece status icon'ı güvenlik neti olarak güncelle.
    if (msg.sender_id === Store.user?.id && msg.id && !msg.id.startsWith('temp-')) {
      updateMessageStatusIcon(msg.id, 'sent');
    }
  };
  Socket.on('new_message', window._newMessageHandler);

  // Okundu bildirimi
  Socket.off('read_receipt', window._readReceiptHandler);
  window._readReceiptHandler = ({ message_id, reader_id }) => {
    if (reader_id === Store.user?.id) return;
    updateMessageStatusIcon(message_id, 'read');
    const seenEl = document.getElementById('seen-' + message_id);
    if (seenEl) seenEl.style.display = 'block';
  };
  Socket.on('read_receipt', window._readReceiptHandler);

  // Yeni konuşma bildirimi (karşı taraf DM açtığında)
  Socket.off('new_conversation', window._newConvHandler);
  window._newConvHandler = (conv) => {
    const exists = Store.conversations.some(c => c.id === conv.id);
    if (!exists) {
      if (conv.other_user_id && conv.name) Store.addUser(conv.other_user_id, conv.name);
      Store.conversations.unshift(conv);
      renderConvList(Store.conversations);
      Socket.joinConv(conv.id);
    }
  };
  Socket.on('new_conversation', window._newConvHandler);

  Socket.off('presence', window._presenceHandler);
  window._presenceHandler = ({ user_id, online }) => {
    updatePresenceIndicator(user_id, online);
    if (document.getElementById('friends-panel')) {
      clearTimeout(window._friendsPanelTimer);
      window._friendsPanelTimer = setTimeout(renderFriendsPanel, 150);
    }
  };
  Socket.on('presence', window._presenceHandler);

  Socket.off('online_users', window._onlineUsersHandler);
  window._onlineUsersHandler = ({ user_ids }) =>
    (user_ids || []).forEach(id => updatePresenceIndicator(id, true));
  Socket.on('online_users', window._onlineUsersHandler);

  Socket.off('friend_request', window._friendRequestHandler);
  window._friendRequestHandler = (data) => {
    showToast(`${escHtml(data.from_username || 'Biri')} arkadaşlık isteği gönderdi`, 'info');
    if (document.getElementById('friends-panel')) renderFriendsPanel();
  };
  Socket.on('friend_request', window._friendRequestHandler);

  Socket.off('friend_accepted', window._friendAcceptedHandler);
  window._friendAcceptedHandler = (data) => {
    showToast(`${escHtml(data.username || 'Biri')} arkadaşlık isteğini kabul etti`, 'success');
    if (document.getElementById('friends-panel')) renderFriendsPanel();
  };
  Socket.on('friend_accepted', window._friendAcceptedHandler);

  // Offline mod
  setupOfflineMode();

  // Giriş yapıldıktan sonra bekleyen invite kodu uygula
  if (window._pendingInviteCode) {
    const code = window._pendingInviteCode;
    delete window._pendingInviteCode;
    Api.useInvite(code)
      .then(() => showToast('Arkadaşlık bağlantısı kuruldu!', 'success'))
      .catch(() => {});
  }

  loadConversations();
  loadServers();

  // DM modu
  document.getElementById('server-dm-btn').addEventListener('click', () => {
    Store.setActiveServer(null);
    Store.setActiveChannel(null);
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('server-dm-btn').classList.add('active');
    restoreDmSidebar();
    // Chat alanını sıfırla
    const chatArea = document.getElementById('chat-area');
    if (chatArea && !Store.activeConvId) {
      chatArea.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:16px">💬</div>
            <div>Bir sohbet seç veya yeni sohbet başlat</div>
          </div>
        </div>
      `;
    }
  });

  document.getElementById('server-friends-btn').addEventListener('click', () => {
    Store.setActiveServer(null);
    Store.setActiveChannel(null);
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('server-friends-btn').classList.add('active');
    renderFriendsPanel();
    const chatArea = document.getElementById('chat-area');
    if (chatArea && !Store.activeConvId) {
      chatArea.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:16px">👥</div>
            <div>Bir arkadaş seç ve sohbet başlat</div>
          </div>
        </div>
      `;
    }
  });

  document.getElementById('server-add-btn').addEventListener('click', showCreateServerModal);
  document.getElementById('server-join-btn').addEventListener('click', showJoinServerModal);
}

// ── DM sidebar'ını geri yükle ────────────────────────────
function restoreDmSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Sidebar'ı sıfırdan DM moduna yeniden oluştur
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="avatar-wrap">
        <div class="avatar">${Store.user?.username?.[0]?.toUpperCase() || 'U'}</div>
        <div class="presence-dot online"></div>
      </div>
      <div class="sidebar-user-info">
        <div class="sidebar-username">${escHtml(Store.user?.username || '')}</div>
        <div class="sidebar-status">Çevrimiçi</div>
      </div>
      <button class="btn-icon" id="new-chat-btn" title="Yeni mesaj">${Icons.plus}</button>
      <button class="btn-icon" id="logout-btn" title="Çıkış yap">${Icons.logOut}</button>
    </div>
    <div id="search-panel" class="hidden" style="padding:10px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-elevated)">
      <input class="input input-search" type="text" id="user-search-input" placeholder="Kullanıcı ara..." />
      <div id="search-results" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto"></div>
    </div>
    <div id="story-bar" class="story-bar"></div>
    <div class="sidebar-search">
      <input class="input input-search" type="text" placeholder="Sohbet ara..." id="search-input" />
    </div>
    <div class="sidebar-list" id="conv-list"></div>
  `;

  sidebar.style.position = 'relative';

  document.getElementById('logout-btn').addEventListener('click', () => {
    Socket.disconnect();
    Store.clearAuth();
    Router.navigate('login');
  });

  document.getElementById('new-chat-btn').addEventListener('click', () => {
    const existing = document.getElementById('new-chat-menu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'new-chat-menu';
    menu.style.cssText = 'position:absolute;top:52px;left:12px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:10px;padding:6px;z-index:100;min-width:160px;box-shadow:var(--shadow-md)';
    menu.innerHTML = `
      <div id="menu-direct" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">💬 Yeni mesaj</div>
      <div id="menu-group"  style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">👥 Grup oluştur</div>
    `;
    sidebar.appendChild(menu);
    document.getElementById('menu-direct').addEventListener('click', () => {
      menu.remove();
      const panel = document.getElementById('search-panel');
      panel.classList.remove('hidden');
      document.getElementById('user-search-input').focus();
    });
    document.getElementById('menu-group').addEventListener('click', () => { menu.remove(); showGroupModal(); });
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target.id !== 'new-chat-btn') {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
  });

  let searchTimer;
  document.getElementById('user-search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
    searchTimer = setTimeout(() => searchUsers(q), 400);
  });

  renderConvList(Store.conversations);
  loadStories();
}

// ── Arkadaş paneli ───────────────────────────────────────
async function renderFriendsPanel() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const hasServers = Store.servers && Store.servers.length > 0;

  // Geçici içerik göster
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:15px;color:var(--text-primary)">Arkadaşlar</div>
        <div style="font-size:11px;color:var(--text-muted)">Yükleniyor...</div>
      </div>
      <button class="btn-icon" id="add-friend-btn" title="Arkadaş ekle">${Icons.userPlus}</button>
      <button class="btn-icon" id="create-invite-btn" title="Davet linki oluştur" style="font-size:16px">🔗</button>
      <button class="btn-icon" id="logout-btn" title="Çıkış yap">${Icons.logOut}</button>
    </div>
    <div id="friends-panel" style="flex:1;overflow-y:auto;padding:8px 0">
      <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Yükleniyor...</div>
    </div>
  `;

  document.getElementById('add-friend-btn').addEventListener('click', showAddFriendModal);
  document.getElementById('create-invite-btn').addEventListener('click', showCreateInviteModal);
  document.getElementById('logout-btn').addEventListener('click', () => {
    Socket.disconnect();
    Store.clearAuth();
    Router.navigate('login');
  });

  // API'den arkadaş listesi çek
  let friends = [];
  let pending = [];
  try {
    const [fData, pData] = await Promise.all([
      Api.getFriends().catch(() => null),
      Api.getPendingFriends().catch(() => null),
    ]);
    friends = fData?.friends || [];
    pending = pData?.requests || [];
  } catch {
    // 503 veya ağ hatası — DM tabanlı fallback
    friends = Store.conversations
      .filter(c => c.type === 'direct' && c.other_user_id)
      .map(c => ({
        id:       c.other_user_id,
        username: c.name || Store.getUsername(c.other_user_id) || 'Bilinmiyor',
        conv_id:  c.id,
      }));
  }

  // conv_id eksikse Store'dan bul (API yanıtında user_id = diğer kullanıcının ID'si)
  friends = friends.map(f => {
    const uid = f.user_id || f.id; // API: user_id, fallback Store tabanlı: id
    if (!f.conv_id) {
      const conv = Store.conversations.find(c => c.type === 'direct' && c.other_user_id === uid);
      f.conv_id = conv?.id || null;
    }
    f._userId = uid;
    f.online = Store.isOnline(uid);
    return f;
  });

  friends.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));

  const onlineCount = friends.filter(f => f.online).length;
  const panel = document.getElementById('friends-panel');
  if (!panel) return;

  // Bekleyen istekler bölümü (API: {id: friendshipId, from_user_id, from_username})
  const pendingHtml = pending.length > 0 ? `
    <div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.7px">
      Bekleyen istekler (${pending.length})
    </div>
    ${pending.map(p => {
      const name = p.from_username || p.username || '?';
      const fid  = p.id; // friendship_id
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;margin:0 8px">
        <div class="avatar avatar-sm">${escHtml(name[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escHtml(name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">arkadaşlık isteği</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-primary" style="padding:4px 10px;font-size:12px" data-accept="${escHtml(fid)}">Kabul</button>
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" data-reject="${escHtml(fid)}">Reddet</button>
        </div>
      </div>
    `}).join('')}
    <div style="height:1px;background:var(--border-color);margin:8px 16px"></div>
  ` : '';

  const friendsHtml = friends.length === 0 ? `
    <div style="padding:40px 16px;text-align:center;color:var(--text-muted)">
      <div style="font-size:40px;margin-bottom:12px">👥</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">Henüz arkadaşın yok</div>
      <div style="font-size:12px">Arkadaş ekle butonuyla istek gönderebilirsin</div>
    </div>
  ` : `
    <div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.7px">
      Arkadaşlar — ${onlineCount} çevrimiçi
    </div>
    ${friends.map(f => friendItem(f, hasServers)).join('')}
  `;

  panel.innerHTML = pendingHtml + friendsHtml;

  // Yeni bant genişliği göstergesi
  const hdrSub = sidebar.querySelector('.sidebar-header div[style*="font-size:11px"]');
  if (hdrSub) hdrSub.textContent = `${onlineCount} çevrimiçi · ${friends.length} toplam`;

  // Kabul / reddet butonları
  panel.querySelectorAll('[data-accept]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Api.acceptFriend(btn.dataset.accept).catch(() => {});
      renderFriendsPanel();
    });
  });
  panel.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Api.rejectFriend(btn.dataset.reject).catch(() => {});
      renderFriendsPanel();
    });
  });

  // Arkadaşa tıkla → DM aç
  panel.querySelectorAll('[data-friend-conv]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-invite-btn]')) return;
      document.querySelectorAll('.server-icon').forEach(s => s.classList.remove('active'));
      document.getElementById('server-dm-btn')?.classList.add('active');
      restoreDmSidebar();
      openConversation(el.dataset.friendConv);
    });
  });

  panel.querySelectorAll('[data-invite-btn]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showInviteServerPicker(btn.dataset.friendConvId, btn);
    });
  });
}

function friendItem(f, hasServers) {
  // API yanıtı: {id: friendshipId, user_id: otherUserId, username, conv_id, online, _userId}
  // Eski Store tabanlı: {userId, name, convId, online}
  const userId  = f._userId  || f.user_id || f.userId || f.id;
  const name    = f.username || f.name || '?';
  const convId  = f.conv_id  || f.convId || '';

  const inviteBtn = hasServers && convId ? `
    <button class="btn-icon" title="Sunucuya davet et" data-invite-btn
            data-friend-conv-id="${escHtml(convId)}"
            style="flex-shrink:0">
      ${Icons.userPlus}
    </button>` : '';

  const msgIcon = convId
    ? `<div style="color:var(--text-muted);display:flex;align-items:center;padding:4px">${Icons.messageSquare}</div>`
    : '';

  return `
    <div class="conv-item" ${convId ? `data-friend-conv="${escHtml(convId)}"` : ''}
         data-other-user-id="${escHtml(userId)}" style="cursor:${convId ? 'pointer' : 'default'}">
      <div class="avatar-wrap">
        <div class="avatar">${escHtml(name[0].toUpperCase())}</div>
        <div class="presence-dot${f.online ? ' online' : ''}"></div>
      </div>
      <div class="conv-info">
        <div class="conv-name">${escHtml(name)}</div>
        <div class="conv-preview" style="color:${f.online ? 'var(--color-success)' : 'var(--text-muted)'}">
          ${f.online ? '● Çevrimiçi' : '○ Çevrimdışı'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
        ${msgIcon}
        ${inviteBtn}
      </div>
    </div>
  `;
}

function showInviteServerPicker(convId, anchorEl) {
  const existing = document.getElementById('invite-picker');
  if (existing) { existing.remove(); return; }

  const servers = Store.servers || [];
  if (servers.length === 0) return;

  if (servers.length === 1) {
    sendServerInviteToDm(convId, servers[0]);
    return;
  }

  const picker = document.createElement('div');
  picker.id = 'invite-picker';
  picker.style.cssText = 'position:fixed;z-index:300;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:6px;min-width:200px;box-shadow:var(--shadow-lg)';

  const rect = anchorEl.getBoundingClientRect();
  picker.style.top  = `${rect.bottom + 4}px`;
  picker.style.left = `${Math.max(4, rect.left - 160)}px`;

  picker.innerHTML = `
    <div style="padding:4px 10px 6px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.7px">
      Hangi sunucuya?
    </div>
    ${servers.map(s => `
      <div class="conv-item" data-srv="${escHtml(s.id)}"
           style="cursor:pointer;padding:8px 10px;gap:10px;border-radius:var(--radius-sm)"
           onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background=''">
        <div class="avatar avatar-sm">${escHtml((s.name || '?')[0].toUpperCase())}</div>
        <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${escHtml(s.name)}</div>
      </div>
    `).join('')}
  `;

  document.body.appendChild(picker);

  picker.querySelectorAll('[data-srv]').forEach(el => {
    el.addEventListener('click', () => {
      const server = servers.find(s => s.id === el.dataset.srv);
      picker.remove();
      if (server) sendServerInviteToDm(convId, server);
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 50);
}

async function sendServerInviteToDm(convId, server) {
  if (!convId || !server?.invite_code) return;
  // `:` karakterini server adından çıkar ki parse güvenli olsun
  const safeName = (server.name || 'Sunucu').replace(/:/g, '');
  const content = `orbit-invite:${safeName}:${server.invite_code}`;
  try {
    const data = await Api.sendMessage(convId, content, 'text');
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('server-dm-btn').classList.add('active');
    restoreDmSidebar();
    openConversation(convId);
  } catch (e) {
    console.error('Davet gönderilemedi:', e);
  }
}

async function showCreateInviteModal() {
  const existing = document.getElementById('create-invite-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'create-invite-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:24px;width:400px;max-width:90vw;box-shadow:var(--shadow-lg)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="font-size:18px;font-weight:700;margin:0">Davet Linki</h3>
        <button class="btn-icon" id="close-invite-modal">${Icons.x}</button>
      </div>
      <div id="invite-link-area" style="text-align:center;padding:16px">
        <div style="color:var(--text-muted);font-size:13px">Oluşturuluyor...</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('close-invite-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  try {
    const data = await Api.createInvite(50);
    const code = data?.code || data?.invite?.code;
    if (!code) throw new Error('kod alınamadı');
    const link = `${window.location.origin}${window.location.pathname}#/invite/${code}`;
    document.getElementById('invite-link-area').innerHTML = `
      <div style="background:var(--bg-overlay);border-radius:8px;padding:12px 14px;font-family:monospace;font-size:13px;color:var(--text-primary);word-break:break-all;margin-bottom:12px">
        ${escHtml(link)}
      </div>
      <button id="copy-invite-link" class="btn btn-primary" style="width:100%">Kopyala</button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Bu link ile kayıt olan kişi seni otomatik arkadaş olarak ekler</div>
    `;
    document.getElementById('copy-invite-link').addEventListener('click', () => {
      navigator.clipboard.writeText(link).then(() => {
        document.getElementById('copy-invite-link').textContent = 'Kopyalandı!';
      }).catch(() => {});
    });
  } catch (err) {
    document.getElementById('invite-link-area').innerHTML = `
      <div style="color:var(--color-error);font-size:13px">Hata: ${escHtml(err.message || 'oluşturulamadı')}</div>
    `;
  }
}

function showAddFriendModal() {
  const existing = document.getElementById('add-friend-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'add-friend-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:24px;width:400px;max-width:90vw;box-shadow:var(--shadow-lg)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="font-size:18px;font-weight:700;margin:0">Arkadaş Ekle</h3>
        <button class="btn-icon" id="close-friend-modal">${Icons.x}</button>
      </div>
      <input class="input" type="text" id="friend-search-input" placeholder="Kullanıcı adı ara..."
             style="width:100%;box-sizing:border-box;margin-bottom:12px" autocomplete="off" />
      <div id="friend-search-results" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const input = document.getElementById('friend-search-input');
  input.focus();

  let timer;
  input.addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    const results = document.getElementById('friend-search-results');
    if (q.length < 2) { results.innerHTML = ''; return; }
    timer = setTimeout(() => searchFriendCandidates(q), 400);
  });

  document.getElementById('close-friend-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function searchFriendCandidates(q) {
  const results = document.getElementById('friend-search-results');
  if (!results) return;
  results.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px">Aranıyor...</div>';

  try {
    const data = await Api.get(`/auth/search?q=${encodeURIComponent(q)}`);
    const users = (data?.users || []).filter(u => u.id !== Store.user?.id);
    users.forEach(u => Store.addUser(u.id, u.username));

    if (users.length === 0) {
      results.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px">Kullanıcı bulunamadı</div>';
      return;
    }

    results.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-md);background:var(--bg-overlay)">
        <div class="avatar avatar-sm">${escHtml((u.username || '?')[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--text-primary)">
          ${escHtml(u.username)}
        </div>
        <button class="btn btn-primary" style="padding:6px 12px;font-size:12px"
                data-uid="${escHtml(u.id)}" data-uname="${escHtml(u.username)}" data-action="add-friend">
          Arkadaş ekle
        </button>
      </div>
    `).join('');

    results.querySelectorAll('[data-action="add-friend"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Gönderiliyor...';
        try {
          await Api.friendRequest(btn.dataset.uid);
          btn.textContent = 'İstek gönderildi';
          btn.style.background = 'var(--color-success)';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Arkadaş ekle';
          showToast(err.message || 'Hata oluştu', 'error');
        }
      });
    });
  } catch {
    const results2 = document.getElementById('friend-search-results');
    if (results2) results2.innerHTML = '<div style="font-size:12px;color:var(--color-error);padding:4px">Hata oluştu</div>';
  }
}

async function searchUsers(q) {
  const results = document.getElementById('search-results');
  results.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px">Aranıyor...</div>';

  try {
    const data = await Api.get(`/auth/search?q=${encodeURIComponent(q)}`);
    const users = data?.users || [];
    users.forEach(u => Store.addUser(u.id, u.username));

    if (users.length === 0) {
      results.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px">Kullanıcı bulunamadı</div>';
      return;
    }

    results.innerHTML = users.map(u => `
      <div class="conv-item" data-uid="${escHtml(u.id)}" data-uname="${escHtml(u.username)}" style="cursor:pointer;border-radius:8px">
        <div class="avatar avatar-sm">${escHtml((u.username || '?')[0].toUpperCase())}</div>
        <div class="conv-info">
          <div class="conv-name">${escHtml(u.username)}</div>
          <div class="conv-preview">${escHtml(u.phone)}</div>
        </div>
      </div>
    `).join('');

    results.querySelectorAll('.conv-item').forEach(el => {
      el.addEventListener('click', () => startDirectChat(el.dataset.uid, el.dataset.uname));
    });
  } catch (e) {
    results.innerHTML = '<div style="font-size:12px;color:var(--color-error);padding:4px">Hata oluştu</div>';
  }
}

async function startDirectChat(targetUserId, targetUsername) {
  Store.addUser(targetUserId, targetUsername);
  // Önce mevcut sohbet var mı kontrol et
  const existing = Store.conversations.find(c =>
    c.type === 'direct' && c.name === targetUsername
  );

  if (existing) {
    document.getElementById('search-panel').classList.add('hidden');
    openConversation(existing.id);
    return;
  }

  // Yeni sohbet oluştur
  try {
    const data = await Api.post('/chat/conversations', {
      type:       'direct',
      name:       targetUsername,
      created_by: Store.user.id,
      member_ids: [Store.user.id, targetUserId],
    });

    const conv = data?.conversation;
    if (conv) {
      Store.conversations.unshift(conv);
      renderConvList(Store.conversations);
      document.getElementById('search-panel').classList.add('hidden');
      document.getElementById('user-search-input').value = '';
      openConversation(conv.id);
    }
  } catch (e) {
    if (e.message?.includes('arkadaş')) {
      showToast('Sadece arkadaşlarına mesaj gönderebilirsin. Önce arkadaşlık isteği gönder.', 'error');
    } else {
      console.error('Sohbet oluşturulamadı:', e);
    }
  }
}
async function loadConversations() {
  const list = document.getElementById('conv-list');
  if (list) {
    list.innerHTML = Array(5).fill(0).map(() => `
      <div class="skeleton-item">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line skeleton-line-lg"></div>
          <div class="skeleton-line skeleton-line-sm"></div>
        </div>
      </div>
    `).join('');
  }

  try {
    const userId = Store.user && Store.user.id;
    if (!userId) return;
    const data = await Api.getConversations();
    const convs = data?.conversations || [];
    convs.forEach(c => {
      if (c.other_user_id && c.name) Store.addUser(c.other_user_id, c.name);
    });
    Store.setConversations(convs);
    renderConvList(convs);
    loadStoryBar(convs);
    convs.forEach(conv => Socket.joinConv(conv.id));
  } catch(e) {
    console.error('Conversations yüklenemedi:', e);
    renderConvList([]);
  }
}

function renderConvList(convs) {
  const list = document.getElementById('conv-list');
  if (!list) return;

  if (convs.length === 0) {
    list.innerHTML = `
      <div class="conv-empty-state">
        <div class="conv-empty-icon">💬</div>
        <div class="conv-empty-title">Henüz sohbet yok</div>
        <div class="conv-empty-sub">Yeni mesaj butonuna bas ve sohbet başlat</div>
      </div>
    `;
    return;
  }

  list.innerHTML = convs.map(conv => {
    const otherId   = conv.type === 'direct' ? (conv.other_user_id || Store.getUserId(conv.name)) : null;
    const online    = otherId ? Store.isOnline(otherId) : false;
    const dot       = otherId ? `<div class="presence-dot${online ? ' online' : ''}"></div>` : '';
    const unread    = Store.getUnread(conv.id);
    const lastMsg   = Store.getLastMessage(conv.id);
    const previewTxt = lastMsg
      ? (lastMsg.sender_id === Store.user?.id ? 'Sen: ' : '') +
        (lastMsg.content?.substring(0, 35) || '') + (lastMsg.content?.length > 35 ? '…' : '')
      : 'Mesaj yok';
    const timeStr   = lastMsg ? formatConvTime(lastMsg.created_at) : '';
    const badgeHtml = unread > 0
      ? `<div class="conv-badge">${unread > 99 ? '99+' : unread}</div>`
      : '';
    const isActive  = conv.id === Store.activeConvId;

    return `
      <div class="conv-item${isActive ? ' active' : ''}" data-id="${conv.id}"${otherId ? ` data-other-user-id="${otherId}"` : ''}>
        <div class="avatar-wrap">
          <div class="avatar${conv.type === 'group' ? ' avatar-group' : ''}">${(conv.name || '?')[0].toUpperCase()}</div>
          ${dot}
        </div>
        <div class="conv-info">
          <div class="conv-name${unread > 0 ? ' conv-name-bold' : ''}">${escHtml(conv.name || 'Sohbet')}</div>
          <div class="conv-preview">${escHtml(previewTxt)}</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">${timeStr}</div>
          ${badgeHtml}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', () => openConversation(el.dataset.id));
  });
}

function formatConvTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  const now  = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)    return 'Az önce';
  if (mins < 60)   return `${mins}d`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (hrs < 24*7)  return d.toLocaleDateString('tr-TR', { weekday: 'short' });
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function openConversation(convId) {
  clearSelection();
  Store.setActiveConv(convId);
  Store.resetUnread(convId);
  Socket.joinConv(convId);

  document.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === convId);
  });

  const conv       = Store.conversations.find(c => c.id === convId);
  const convName   = conv?.name || 'Sohbet';
  const otherId    = conv?.type === 'direct' ? (conv.other_user_id || Store.getUserId(conv.name)) : null;
  const isOnline   = otherId ? Store.isOnline(otherId) : false;
  const presenceTxt   = otherId ? (isOnline ? 'Çevrimiçi' : 'yükleniyor...') : '';
  const presenceColor = isOnline ? 'var(--color-success)' : 'var(--text-muted)';

  const chatArea = document.getElementById('chat-area');
  const sidebar  = document.getElementById('main-sidebar');

  // Mobil: sidebar gizle, chat alanı göster
  if (window.innerWidth <= 768) {
    sidebar?.classList.add('hidden-mobile');
    chatArea?.classList.add('visible-mobile');
  }

  chatArea.innerHTML = `
    <div id="chat-header" class="chat-header"${otherId ? ` data-other-user-id="${otherId}"` : ''}>
      <button class="btn-icon mobile-back-btn" id="mobile-back-btn" title="Geri">${Icons.arrowLeft}</button>
      <div class="avatar-wrap">
        <div class="avatar">${escHtml(convName[0].toUpperCase())}</div>
        ${otherId ? `<div class="presence-dot${isOnline ? ' online' : ''}"></div>` : ''}
      </div>
      <div class="chat-header-info">
        <h3>${escHtml(convName)}</h3>
        <span id="typing-indicator" class="chat-status" style="color:${presenceColor}">${presenceTxt}</span>
      </div>
      <div class="chat-header-actions">
        <button class="btn-icon" id="call-btn" title="Sesli arama">${Icons.phone}</button>
        <button class="btn-icon" id="video-btn" title="Görüntülü arama">${Icons.video}</button>
        <button class="btn-icon" id="screen-btn" title="Ekran paylaş">${Icons.monitor}</button>
      </div>
    </div>
    <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column">
      <div class="message-list" id="message-list"></div>
      <button class="scroll-fab hidden" id="scroll-fab" title="Aşağı git">${Icons.chevronDown}</button>
    </div>
    <div class="message-input-bar">
      ${Store.isGuest() ? '' : `<label class="btn-icon" title="Dosya gönder" style="cursor:pointer">
        ${Icons.paperclip}
        <input type="file" id="file-input" style="display:none" accept="image/*,video/*,.pdf,.doc,.docx" />
      </label>`}
      <textarea class="message-input" id="msg-input" placeholder="Mesaj yaz..." rows="1"></textarea>
      <button class="btn-icon-primary" id="send-btn" title="Gönder">${Icons.send}</button>
    </div>
  `;

  // Mobil — geri butonu sidebar'ı göster
  document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
    chatArea.classList.remove('visible-mobile');
    document.getElementById('main-sidebar')?.classList.remove('hidden-mobile');
  });

  const sendBtn  = document.getElementById('send-btn');
  const msgInput = document.getElementById('msg-input');

  sendBtn.addEventListener('click', () => sendMessage(convId, msgInput));
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(convId, msgInput);
    }
  });

  // Auto-resize textarea
  msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 130) + 'px';
  });


  // Dosya gönder
  document.getElementById('file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/media/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Store.accessToken}` },
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        // Dosya URL'ini mesaj olarak gönder
        const isImage = file.type.startsWith('image/');
        await Api.sendMessage(convId, data.url, isImage ? 'image' : 'file');
      }
    } catch (e) {
      console.error('Dosya yüklenemedi:', e);
    }
    e.target.value = '';
  });

  // Arama butonları
  document.getElementById('call-btn').addEventListener('click', () => startCall(convId, 'audio'));
  document.getElementById('video-btn').addEventListener('click', () => startCall(convId, 'video'));
  document.getElementById('screen-btn').addEventListener('click', () => startScreenShare(convId));

  // Yazıyor bildirimi gönder
  let typingTimer;
  msgInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    Socket.send('typing', { conversation_id: convId });
    typingTimer = setTimeout(() => {}, 2000);
  });

  // Yazıyor bildirimini dinle
  Socket.off('typing', window._typingHandler);
  window._typingHandler = (data) => {
    if (data.conversation_id !== Store.activeConvId) return;
    const el = document.getElementById('typing-indicator');
    if (!el) return;
    el.textContent = 'yazıyor...';
    el.style.color = 'var(--color-primary)';
    el.dataset.typing = '1';
    clearTimeout(window._typingClear);
    window._typingClear = setTimeout(() => {
      delete el.dataset.typing;
      const hdr     = document.getElementById('chat-header');
      const uid     = hdr?.dataset?.otherUserId;
      const online  = uid ? Store.isOnline(uid) : false;
      el.textContent = uid ? (online ? 'Çevrimiçi' : 'Çevrimdışı') : '';
      el.style.color = online ? 'var(--color-success)' : 'var(--text-muted)';
    }, 2000);
  };
  Socket.on('typing', window._typingHandler);

  Socket.off('message_edited', window._editHandler);
  window._editHandler = ({ message_id, content, edited_at }) => applyMessageEdit(message_id, content, edited_at);
  Socket.on('message_edited', window._editHandler);

  Socket.off('message_deleted', window._deleteHandler);
  window._deleteHandler = ({ message_id }) => applyMessageDelete(message_id);
  Socket.on('message_deleted', window._deleteHandler);

  Socket.off('reaction_added', window._reactionHandler);
  window._reactionHandler = ({ message_id, emoji }) => {
    if (message_id && emoji) addReactionToMessage(message_id, emoji, null, true);
  };
  Socket.on('reaction_added', window._reactionHandler);

  // Mobil swipe: sağa kaydırınca sidebar aç
  if (window.innerWidth <= 768) {
    let touchStartX = 0;
    chatArea.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    chatArea.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx > 60) {
        chatArea.classList.remove('visible-mobile');
        document.getElementById('main-sidebar')?.classList.remove('hidden-mobile');
      }
    }, { passive: true });
  }

  // Çevrimdışıysa son görülmeyi çek
  if (otherId && !isOnline) {
    Api.get(`/auth/users/${otherId}`).then(data => {
      const el = document.getElementById('typing-indicator');
      if (el && !el.dataset.typing) {
        el.textContent = formatLastSeen(data?.user?.last_seen);
      }
    }).catch(() => {});
  }

  // Scroll-to-bottom FAB
  const msgList = document.getElementById('message-list');
  const scrollFab = document.getElementById('scroll-fab');
  if (msgList && scrollFab) {
    msgList.addEventListener('scroll', () => {
      const distFromBottom = msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight;
      scrollFab.classList.toggle('hidden', distFromBottom < 120); // eslint-disable-line
    });
    scrollFab.addEventListener('click', () => {
      msgList.scrollTo({ top: msgList.scrollHeight, behavior: 'smooth' });
    });
  }

  // Geçmiş mesajları yükle
  try {
    const data = await Api.getMessages(convId);
    const msgs = (data?.messages || []).reverse();

    // Fetch sırasında WS ile gelen mesajları kaybetme
    const alreadyInStore = Store.getMessages(convId);
    const historyIds = new Set(msgs.map(m => m.id));
    const wsPending = alreadyInStore.filter(
      m => !historyIds.has(m.id) && !m.id?.startsWith('temp-')
    );

    Store.setMessages(convId, [...msgs, ...wsPending]);
    if (msgs.length > 0) Store.setLastMessage(convId, msgs[msgs.length - 1]);
    renderMessages([...msgs, ...wsPending]);
    renderConvList(Store.conversations);
  } catch {}
}

async function sendMessage(convId, input) {
  const content = input.value.trim();
  if (!content) return;

  // Edit modu
  if (input.dataset.editingId) {
    const msgId      = input.dataset.editingId;
    const editConvId = input.dataset.editingConvId || convId;
    input.value = '';
    delete input.dataset.editingId;
    delete input.dataset.editingConvId;
    document.getElementById('edit-preview')?.remove();
    applyMessageEdit(msgId, content);
    await Api.post(`/chat/conversations/${editConvId}/messages/${msgId}/edit`, {
      content,
    }).catch(() => {});
    return;
  }

  input.value = '';
  const replyToId      = replyToMsg?.id || '';
  const replyToContent = replyToMsg?.content || '';
  clearReply();

  const tempId  = 'temp-' + Date.now();
  const tempMsg = {
    id:               tempId,
    conversation_id:  convId,
    sender_id:        Store.user.id,
    content,
    type:             'text',
    status:           'pending',
    created_at:       new Date().toISOString(),
    reply_to_id:      replyToId,
    reply_to_content: replyToContent,
  };
  appendMessage(tempMsg);

  // Çevrimdışıysa kuyruğa al
  if (!navigator.onLine) {
    _offlineQueue.push({ convId, content, replyToId });
    updateMessageStatusIcon(tempId, 'failed');
    return;
  }

  try {
    const result  = await Api.sendMessage(convId, content, 'text', replyToId);
    const realId = result?.message_id;
    // HTTP önce geldi: temp wrapper'ı bul ve gerçek ID'ye güncelle
    const tempEl = document.querySelector(`[data-id="${tempId}"]`);
    if (tempEl) {
      if (realId) {
        tempEl.dataset.id = realId;
        tempEl.querySelector('.message-bubble')?.setAttribute('data-msg-id', realId);
        // "Görüldü" elementinin id'sini de güncelle
        const seenEl = tempEl.querySelector('.msg-seen');
        if (seenEl) seenEl.id = 'seen-' + realId;
      }
      updateMessageStatusIcon(realId || tempId, 'sent');
    }
  } catch (err) {
    console.error('Mesaj gönderilemedi:', err);
    updateMessageStatusIcon(tempId, 'failed');
    // Ağ hatası gibi görünüyorsa kuyruğa al
    if (!navigator.onLine || err.message?.includes('fetch')) {
      _offlineQueue.push({ convId, content, replyToId });
    }
  }
}

function renderMessages(msgs) {
  const list = document.getElementById('message-list');
  if (!list) return;
  list.innerHTML = '';

  let lastDate  = null;
  let lastSender = null;

  msgs.forEach((msg, idx) => {
    // Gün ayracı
    const msgDate = new Date(msg.created_at);
    const dateStr = msgDate.toDateString();
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      lastSender = null; // Yeni gün — sender grubunu sıfırla
      const today     = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      let label;
      if (dateStr === today)     label = 'Bugün';
      else if (dateStr === yesterday) label = 'Dün';
      else label = msgDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span>${label}</span>`;
      list.appendChild(sep);
    }

    const isGrouped = !msg.deleted && lastSender === msg.sender_id;
    lastSender = msg.sender_id;
    appendMessage(msg, isGrouped);
  });

  list.scrollTop = list.scrollHeight;
}

function appendMessage(msg, isGrouped = false) {
  const list = document.getElementById('message-list');
  if (!list) return;

  const isSent = msg.sender_id === Store.user?.id;
  const time = new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  let statusIcon = '';
  if (isSent) {
    const isPending = msg.status === 'pending' || msg.id?.startsWith('temp-');
    if (isPending) {
      statusIcon = '<span class="msg-status" style="font-size:10px;color:var(--text-muted);vertical-align:middle;opacity:.7">🕐</span>';
    } else if (msg.status === 'failed') {
      statusIcon = '<span class="msg-status" style="font-size:11px;color:#e74c3c" title="Gönderilemedi">⚠️</span>';
    } else if (msg.status === 'read') {
      statusIcon = '<span class="msg-status" style="color:#00E5C9;font-size:13px;letter-spacing:-3px;vertical-align:middle">✓✓</span>';
    } else {
      statusIcon = '<span class="msg-status" style="color:#00E5C9;font-size:13px;vertical-align:middle">✓</span>';
    }
  }

  const msgType = msg.type || 'text';
  // Tüm kullanıcı içeriği escape edilmeli — XSS önlemi
  const safeContent = escHtml(msg.content || '');
  let content;
  let isInviteCard = false;
  if (msgType === 'image') {
    content = `<img src="${safeContent}" style="max-width:100%;border-radius:8px;display:block;margin-bottom:4px" loading="lazy" onerror="this.style.display='none'" />`;
  } else if (msgType === 'file') {
    content = `<a href="${safeContent}" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary-light)">📎 Dosya</a>`;
  } else if ((msg.content || '').startsWith('orbit-invite:')) {
    const parts = msg.content.split(':');
    const srvName   = parts[1] || 'Sunucu';
    const srvCode   = (parts[2] || '').replace(/[^a-zA-Z0-9\-_]/g, '');
    const alreadyIn = Store.servers.some(s => s.invite_code === srvCode);
    content = `
      <div class="orbit-invite-card" data-code="${escHtml(srvCode)}"
           style="background:var(--bg-overlay);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:14px;min-width:220px;max-width:260px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div class="avatar avatar-sm">${escHtml(srvName[0].toUpperCase())}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${escHtml(srvName)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Sunucu daveti</div>
          </div>
        </div>
        <button class="btn btn-primary invite-join-btn" style="width:100%;padding:8px;font-size:13px"
                ${alreadyIn ? 'disabled' : ''}>
          ${alreadyIn ? '✓ Zaten üyesin' : 'Sunucuya Katıl'}
        </button>
      </div>`;
    isInviteCard = true;
  } else {
    content = safeContent;
  }

  // Forwarded message detection
  const FWD_PREFIX = '​↪​';
  let isForwarded = false;
  if (typeof content === 'string' && content.startsWith(FWD_PREFIX)) {
    isForwarded = true;
    content = content.slice(FWD_PREFIX.length);
  }
  const fwdHeader = isForwarded
    ? '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;opacity:.8">↪ İletildi</div>'
    : '';

  // Reply preview
  let replyHTML = '';
  if (msg.reply_to_id && msg.reply_to_content) {
    replyHTML = `<div style="border-left:3px solid var(--color-primary);padding:4px 8px;margin-bottom:6px;font-size:12px;color:var(--text-secondary);border-radius:0 4px 4px 0;background:rgba(127,119,221,0.1)">${escHtml(msg.reply_to_content)}</div>`;
  }

  const el = document.createElement('div');
  el.className = 'message-bubble ' + (isSent ? 'sent' : 'received');
  el.dataset.msgId = msg.id;
  el.dataset.content = msg.content;
  const contentHtml = msg.deleted
    ? '<em style="color:var(--text-muted)">Bu mesaj silindi.</em>'
    : fwdHeader + replyHTML + '<span class="msg-text">' + content + '</span>';
  el.innerHTML = contentHtml + '<span class="message-time">' + time + ' ' + statusIcon + (msg.edited_at ? ' <span style="font-size:10px;color:var(--text-muted)">(düzenlendi)</span>' : '') + '</span>';

  // Wrapper: column container
  const wrapper = document.createElement('div');
  wrapper.className = 'message' + (isGrouped ? ' message-grouped' : '');
  wrapper.dataset.id = msg.id;
  wrapper.style.cssText = 'position:relative;display:flex;flex-direction:column;margin-bottom:' + (isGrouped ? '1px' : '6px');

  // Row: checkbox + bubble (side by side)
  const rowEl = document.createElement('div');
  rowEl.style.cssText = 'display:flex;flex-direction:row;align-items:flex-end;gap:6px;justify-content:' + (isSent ? 'flex-end' : 'flex-start');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'msg-checkbox';
  checkbox.style.cssText = 'display:none;flex-shrink:0;width:16px;height:16px;margin-bottom:4px;cursor:pointer;accent-color:var(--color-primary)';
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedMsgs.set(msg.id, msg);
    else selectedMsgs.delete(msg.id);
    updateSelectionBar();
  });

  if (isSent) {
    rowEl.appendChild(checkbox);
    rowEl.appendChild(el);
  } else {
    rowEl.appendChild(checkbox);
    rowEl.appendChild(el);
  }
  wrapper.appendChild(rowEl);

  // Reactions display
  const reactionsEl = document.createElement('div');
  reactionsEl.className = 'msg-reactions';
  reactionsEl.dataset.msgId = msg.id;
  reactionsEl.id = 'reactions-' + msg.id;
  reactionsEl.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;padding-left:22px;' + (isSent ? 'justify-content:flex-end;padding-left:0;padding-right:22px' : '');
  if (msg.reactions && msg.reactions.length) {
    const grouped = {};
    msg.reactions.forEach(r => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
    Object.entries(grouped).forEach(([emoji, count]) => {
      const span = document.createElement('span');
      span.dataset.emoji = emoji;
      span.dataset.count = count;
      span.style.cssText = 'background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:99px;padding:2px 8px;font-size:12px;cursor:pointer;';
      span.textContent = emoji + (count > 1 ? ' ' + count : '');
      reactionsEl.appendChild(span);
    });
  }
  wrapper.appendChild(reactionsEl);

  // "Görüldü" etiketi
  if (isSent) {
    const seenEl = document.createElement('div');
    seenEl.id = 'seen-' + msg.id;
    seenEl.className = 'msg-seen';
    seenEl.style.cssText = 'text-align:right;padding-right:22px';
    seenEl.textContent = 'Görüldü';
    wrapper.appendChild(seenEl);
  }

  list.appendChild(wrapper);

  // Hover: show checkbox
  wrapper.addEventListener('mouseenter', () => { checkbox.style.display = 'inline-block'; });
  wrapper.addEventListener('mouseleave', () => { if (!checkbox.checked && selectedMsgs.size === 0) checkbox.style.display = 'none'; });

  // Davet kartı "Sunucuya Katıl" butonu
  if (isInviteCard) {
    const card = wrapper.querySelector('.orbit-invite-card');
    const joinBtn = card?.querySelector('.invite-join-btn');
    if (joinBtn && !joinBtn.disabled) {
      joinBtn.addEventListener('click', async () => {
        const code = card.dataset.code;
        joinBtn.disabled = true;
        joinBtn.textContent = 'Katılınıyor...';
        try {
          await Api.joinServer(code);
          joinBtn.textContent = '✓ Katıldın!';
          joinBtn.style.background = 'var(--color-success)';
          await loadServers();
        } catch {
          joinBtn.disabled = false;
          joinBtn.textContent = 'Sunucuya Katıl';
        }
      });
    }
  }

  // Scroll-to-bottom
  const distFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
  if (distFromBottom < 200) {
    list.scrollTop = list.scrollHeight;
  }

  // Son mesaj store'a kaydet
  if (msg.conversation_id && !msg.id?.startsWith('temp-')) {
    Store.setLastMessage(msg.conversation_id, msg);
  }

  // Context menu — sağ tık
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMessageMenu(e, msg, el);
  });

  // Long press — mobil
  let longPressTimer;
  el.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
      const touch = e.touches[0];
      showMessageMenu({ clientX: touch.clientX, clientY: touch.clientY }, msg, el);
    }, 500);
  }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(longPressTimer), { passive: true });
  el.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive: true });

  if (!isSent && msg.id && !msg.id.startsWith('temp-')) {
    Api.post('/chat/conversations/' + msg.conversation_id + '/messages/' + msg.id + '/read', {}).catch(() => {});
    if (msg.sender_id) {
      Socket.send('read_receipt', { message_id: msg.id, sender_id: msg.sender_id });
    }
  }
}

// Mesaj durum ikonunu güncelle (saat → tek tik → çift tik)
function updateMessageStatusIcon(msgId, status) {
  const wrapper = document.querySelector(`[data-id="${msgId}"]`);
  if (!wrapper) return;
  const timeEl = wrapper.querySelector('.message-time');
  if (!timeEl) return;

  let icon = '';
  if (status === 'pending') {
    icon = '<span class="msg-status" style="font-size:10px;color:var(--text-muted);vertical-align:middle;opacity:.7">🕐</span>';
  } else if (status === 'failed') {
    icon = '<span class="msg-status" style="font-size:11px;color:#e74c3c" title="Gönderilemedi">⚠️</span>';
  } else if (status === 'read') {
    icon = '<span class="msg-status" style="color:#00E5C9;font-size:13px;letter-spacing:-3px;vertical-align:middle">✓✓</span>';
  } else {
    // sent / delivered
    icon = '<span class="msg-status" style="color:#00E5C9;font-size:13px;vertical-align:middle">✓</span>';
  }

  const existing = timeEl.querySelector('.msg-status');
  if (existing) existing.outerHTML = icon;
  else timeEl.insertAdjacentHTML('beforeend', icon);
}

function showMessageMenu(e, msg, el) {
  document.querySelectorAll('.ctx-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 280);
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9000`;

  const isMine = msg.sender_id === Store.user?.id;
  const emojis = ['👍','❤️','😂','😮','😢','🔥'];

  menu.innerHTML = `
    <div class="ctx-menu-section">
      ${emojis.map(em => `<span class="ctx-emoji-btn" data-emoji="${em}">${em}</span>`).join('')}
    </div>
    <button class="ctx-menu-item" id="menu-reply">↩️ Yanıtla</button>
    <button class="ctx-menu-item" id="menu-copy">📋 Kopyala</button>
    <button class="ctx-menu-item" id="menu-forward">➡️ İlet</button>
    <button class="ctx-menu-item" id="menu-select">☑️ Seç</button>
    ${isMine && !msg.deleted ? `<button class="ctx-menu-item" id="menu-edit">✏️ Düzenle</button>` : ''}
    ${isMine && !msg.deleted ? `<button class="ctx-menu-item danger" id="menu-delete-all">🗑️ Herkesten Sil</button>` : ''}
    ${!isMine && !msg.deleted ? `<button class="ctx-menu-item danger" id="menu-delete-me">🗑️ Sil (Sadece Benden)</button>` : ''}
  `;

  document.body.appendChild(menu);

  // Emoji tepki
  menu.querySelectorAll('[data-emoji]').forEach(btn => {
    btn.addEventListener('click', () => {
      menu.remove();
      addReactionToMessage(msg.id, btn.dataset.emoji, Store.user.id);
    });
  });

  menu.querySelector('#menu-reply')?.addEventListener('click', () => { menu.remove(); setReplyTo(msg); });
  menu.querySelector('#menu-copy')?.addEventListener('click', () => {
    menu.remove();
    navigator.clipboard.writeText(msg.content).catch(() => {});
  });
  menu.querySelector('#menu-forward')?.addEventListener('click', () => { menu.remove(); showForwardModal([msg]); });
  menu.querySelector('#menu-select')?.addEventListener('click', () => {
    menu.remove();
    selectedMsgs.set(msg.id, msg);
    const cb = document.querySelector(`.message[data-id="${msg.id}"] .msg-checkbox`);
    if (cb) { cb.checked = true; cb.style.display = 'inline-block'; }
    updateSelectionBar();
  });
  menu.querySelector('#menu-edit')?.addEventListener('click', () => { menu.remove(); startEditMessage(msg); });
  menu.querySelector('#menu-delete-all')?.addEventListener('click', () => { menu.remove(); deleteMessage(msg); });
  menu.querySelector('#menu-delete-me')?.addEventListener('click', () => { menu.remove(); deleteMessageLocally(msg.id); });

  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 80);
}

function startEditMessage(msg) {
  const input = document.getElementById('msg-input');
  if (!input) return;
  input.value = msg.content;
  input.dataset.editingId = msg.id;
  input.dataset.editingConvId = msg.conversation_id;
  input.focus();

  let bar = document.getElementById('edit-preview');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'edit-preview';
    bar.style.cssText = 'padding:6px 12px;background:var(--bg-elevated);border-left:3px solid var(--color-primary);font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center';
    input.parentNode.insertBefore(bar, input);
  }
  bar.innerHTML = `<span>Mesaj düzenleniyor</span><span id="cancel-edit" style="cursor:pointer;color:var(--color-danger)">✕</span>`;
  document.getElementById('cancel-edit').addEventListener('click', () => {
    input.value = '';
    delete input.dataset.editingId;
    delete input.dataset.editingConvId;
    bar.remove();
  });
}

async function deleteMessage(msg) {
  if (!confirm('Bu mesajı herkesten silmek istiyor musun?')) return;
  const convId = msg.conversation_id;
  await Api.post(`/chat/conversations/${convId}/messages/${msg.id}/delete`, {}).catch(() => {});
  applyMessageDelete(msg.id);
}

function deleteMessageLocally(msgId) {
  const wrapper = document.querySelector(`.message[data-id="${msgId}"]`);
  wrapper?.remove();
}

function showForwardModal(msgs) {
  const existing = document.getElementById('forward-modal');
  if (existing) existing.remove();

  const convs = Store.conversations.filter(c => c.id !== Store.activeConvId);

  const modal = document.createElement('div');
  modal.id = 'forward-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9500;display:flex;align-items:center;justify-content:center';

  const inner = document.createElement('div');
  inner.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-color);border-radius:16px;padding:24px;width:100%;max-width:380px;max-height:80vh;display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow-lg)';
  inner.innerHTML = `
    <h3 style="margin:0;font-size:16px">İlet</h3>
    <input id="fwd-search" class="input" type="text" placeholder="Sohbet ara..." style="font-size:13px" />
    <div id="fwd-list" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:4px;max-height:320px"></div>
    <div style="display:flex;gap:8px">
      <button id="fwd-cancel" class="btn" style="flex:1">İptal</button>
    </div>
  `;
  modal.appendChild(inner);
  document.body.appendChild(modal);

  const listEl = inner.querySelector('#fwd-list');

  function renderFwdList(filter = '') {
    listEl.innerHTML = '';
    const filtered = filter
      ? convs.filter(c => (c.name || '').toLowerCase().includes(filter.toLowerCase()))
      : convs;
    if (!filtered.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px">Sohbet bulunamadı</div>';
      return;
    }
    filtered.forEach(c => {
      const item = document.createElement('button');
      item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border:none;background:transparent;cursor:pointer;border-radius:8px;color:var(--text-primary);width:100%;text-align:left';
      item.innerHTML = `<div class="avatar avatar-sm" style="flex-shrink:0">${escHtml((c.name || '?')[0].toUpperCase())}</div><span style="font-size:13px">${escHtml(c.name || 'Sohbet')}</span>`;
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-elevated)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('click', async () => {
        modal.remove();
        const FWD_PREFIX = '​↪​';
        for (const m of msgs) {
          const fwdContent = FWD_PREFIX + (m.content || '');
          await Api.sendMessage(c.id, fwdContent, m.type === 'image' ? 'image' : 'text').catch(() => {});
        }
      });
      listEl.appendChild(item);
    });
  }

  renderFwdList();
  inner.querySelector('#fwd-search').addEventListener('input', (e) => renderFwdList(e.target.value));
  inner.querySelector('#fwd-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function applyMessageDelete(msgId) {
  const wrapper = document.querySelector(`.message[data-id="${msgId}"]`);
  if (!wrapper) return;
  const bubble = wrapper.querySelector('.message-bubble');
  if (!bubble) return;
  const timeEl = bubble.querySelector('.message-time');
  bubble.innerHTML = '<em style="color:var(--text-muted)">Bu mesaj silindi.</em>';
  if (timeEl) bubble.appendChild(timeEl);
}

function applyMessageEdit(msgId, content, editedAt) {
  const wrapper = document.querySelector(`.message[data-id="${msgId}"]`);
  if (!wrapper) return;
  const textEl = wrapper.querySelector('.msg-text');
  if (textEl) textEl.textContent = content;
  const timeEl = wrapper.querySelector('.message-time');
  if (timeEl && !timeEl.querySelector('.edited-tag')) {
    timeEl.insertAdjacentHTML('beforeend', ' <span class="edited-tag" style="font-size:10px;color:var(--text-muted)">(düzenlendi)</span>');
  }
}

function addReactionToMessage(msgId, emoji, userId, fromServer = false) {
  const reactEl = document.getElementById('reactions-' + msgId);
  if (!reactEl) return;

  const existing = reactEl.querySelector('[data-emoji="' + emoji + '"]');
  if (existing) {
    const count = parseInt(existing.dataset.count || '1') + 1;
    existing.dataset.count = count;
    existing.textContent = emoji + ' ' + count;
  } else {
    const span = document.createElement('span');
    span.dataset.emoji = emoji;
    span.dataset.count = '1';
    span.style.cssText = 'background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:99px;padding:2px 8px;font-size:12px;cursor:pointer;';
    span.textContent = emoji + ' 1';
    reactEl.appendChild(span);
  }

  if (!fromServer) {
    const convId = Store.activeConvId;
    if (convId) Api.addReaction(convId, msgId, emoji).catch(() => {});
  }
}

// Reply state
let replyToMsg = null;

// Message selection state
const selectedMsgs = new Map(); // msgId → msg

function updateSelectionBar() {
  const count = selectedMsgs.size;
  let bar = document.getElementById('selection-bar');
  if (count === 0) {
    bar?.remove();
    document.querySelectorAll('.msg-checkbox').forEach(cb => { cb.checked = false; cb.style.display = 'none'; });
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selection-bar';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg-elevated);border-top:1px solid var(--border-color);padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:8000;box-shadow:0 -2px 12px rgba(0,0,0,.3)';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <span style="flex:1;font-size:14px;color:var(--text-primary)">${count} mesaj seçildi</span>
    <button id="sel-forward-btn" class="btn btn-ghost" style="font-size:13px">➡️ İlet</button>
    <button id="sel-delete-btn" class="btn btn-danger" style="font-size:13px">🗑️ Sil</button>
    <button id="sel-cancel-btn" class="btn" style="font-size:13px">İptal</button>
  `;
  bar.querySelector('#sel-cancel-btn').addEventListener('click', clearSelection);
  bar.querySelector('#sel-delete-btn').addEventListener('click', async () => {
    if (!confirm(count + ' mesajı herkesten silmek istiyor musun?')) return;
    const ids = [...selectedMsgs.keys()];
    const msgs = [...selectedMsgs.values()];
    for (const m of msgs) {
      await Api.post(`/chat/conversations/${m.conversation_id}/messages/${m.id}/delete`, {}).catch(() => {});
      applyMessageDelete(m.id);
    }
    clearSelection();
  });
  bar.querySelector('#sel-forward-btn').addEventListener('click', () => {
    showForwardModal([...selectedMsgs.values()]);
  });
  document.querySelectorAll('.msg-checkbox').forEach(cb => { cb.style.display = 'inline-block'; });
}

function clearSelection() {
  selectedMsgs.clear();
  document.querySelectorAll('.msg-checkbox').forEach(cb => { cb.checked = false; cb.style.display = 'none'; });
  document.getElementById('selection-bar')?.remove();
}

function setReplyTo(msg) {
  replyToMsg = msg;
  const existing = document.getElementById('reply-preview');
  if (existing) existing.remove();

  const bar = document.querySelector('.message-input-bar');
  const preview = document.createElement('div');
  preview.id = 'reply-preview';
  preview.style.cssText = 'padding:8px 12px;background:var(--bg-elevated);border-left:3px solid var(--color-primary);margin:0 0 4px;border-radius:0 8px 8px 0;font-size:12px;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center';
  const replySnippet = escHtml((msg.content || '').substring(0, 50)) + (msg.content?.length > 50 ? '…' : '');
  preview.innerHTML = `<span>↩️ ${replySnippet}</span><button onclick="clearReply()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px">×</button>`;
  bar.parentNode.insertBefore(preview, bar);
}

function clearReply() {
  replyToMsg = null;
  const el = document.getElementById('reply-preview');
  if (el) el.remove();
}
// ── Diğer sayfalar ────────────────────────────────────
function renderCalls() {
  document.getElementById('app').innerHTML = `
    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">📞</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px">Aramalar</div>
        <div style="font-size:13px">Yakında geliyor</div>
      </div>
    </div>
  `;
}

function renderStatus() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--bg-primary)">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px">
        <h2 style="margin:0;font-size:18px">Hikayeler</h2>
        <button id="add-story-btn" class="btn btn-primary" style="margin-left:auto;font-size:13px;padding:6px 14px">+ Hikaye Ekle</button>
      </div>

      <div id="my-story" style="padding:16px 24px;border-bottom:1px solid var(--border-color)">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Benim Hikayem</div>
        <div id="my-story-list" style="display:flex;gap:12px;flex-wrap:wrap"></div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:16px 24px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Son Hikayeler</div>
        <div id="stories-list" style="display:flex;gap:12px;flex-wrap:wrap"></div>
      </div>

      <!-- Hikaye oluşturma modalı -->
      <div id="story-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2000;display:none;align-items:center;justify-content:center">
        <div style="background:var(--bg-elevated);border-radius:16px;padding:24px;width:360px;box-shadow:var(--shadow-lg)">
          <h3 style="margin:0 0 16px">Hikaye Paylaş</h3>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <button class="story-type-btn active" data-type="text" style="flex:1;padding:8px;border:1px solid var(--color-primary);border-radius:8px;background:var(--color-primary);color:white;font-size:13px;cursor:pointer">Metin</button>
            <button class="story-type-btn" data-type="image" style="flex:1;padding:8px;border:1px solid var(--border-color);border-radius:8px;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer">Görsel URL</button>
          </div>
          <textarea id="story-content" placeholder="Ne paylaşmak istiyorsun?" style="width:100%;height:100px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-overlay);color:var(--text-primary);font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
          <input id="story-caption" type="text" placeholder="Başlık (isteğe bağlı)" style="width:100%;margin-top:8px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-overlay);color:var(--text-primary);font-size:14px;box-sizing:border-box">
          <div style="display:flex;gap:8px;margin-top:16px">
            <button id="story-cancel" class="btn" style="flex:1">İptal</button>
            <button id="story-submit" class="btn btn-primary" style="flex:1">Paylaş</button>
          </div>
        </div>
      </div>

      <!-- Hikaye izleme modalı -->
      <div id="story-viewer" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:3000;align-items:center;justify-content:center;flex-direction:column">
        <button id="story-viewer-close" style="position:absolute;top:20px;right:20px;background:none;border:none;color:white;font-size:24px;cursor:pointer">✕</button>
        <div id="story-viewer-content" style="max-width:500px;width:90%;text-align:center"></div>
        <div id="story-viewer-meta" style="color:rgba(255,255,255,.7);font-size:13px;margin-top:12px"></div>
      </div>
    </div>
  `;

  loadStories();

  document.getElementById('add-story-btn').addEventListener('click', () => {
    const modal = document.getElementById('story-modal');
    modal.style.display = 'flex';
  });

  document.getElementById('story-cancel').addEventListener('click', () => {
    document.getElementById('story-modal').style.display = 'none';
  });

  document.querySelectorAll('.story-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.story-type-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-primary)';
        b.style.borderColor = 'var(--border-color)';
        b.classList.remove('active');
      });
      btn.style.background = 'var(--color-primary)';
      btn.style.color = 'white';
      btn.style.borderColor = 'var(--color-primary)';
      btn.classList.add('active');
    });
  });

  document.getElementById('story-submit').addEventListener('click', async () => {
    const type    = document.querySelector('.story-type-btn.active')?.dataset.type || 'text';
    const content = document.getElementById('story-content').value.trim();
    const caption = document.getElementById('story-caption').value.trim();
    if (!content) return;

    try {
      await Api.post('/stories', { user_id: Store.user.id, type, content, caption });
      document.getElementById('story-modal').style.display = 'none';
      document.getElementById('story-content').value = '';
      document.getElementById('story-caption').value = '';
      loadStories();
    } catch(e) {
      alert('Hikaye paylaşılamadı: ' + (e.message || ''));
    }
  });

  document.getElementById('story-viewer-close').addEventListener('click', () => {
    document.getElementById('story-viewer').style.display = 'none';
  });
}

async function loadStoryBar(convs) {
  const bar = document.getElementById('story-bar');
  if (!bar) return;

  const ids = [Store.user.id, ...convs.filter(c => c.other_user_id).map(c => c.other_user_id)];
  const uniqueIds = [...new Set(ids)].filter(Boolean);

  const data = await Api.get(`/stories?user_ids=${uniqueIds.join(',')}`).catch(() => ({ stories: [] }));
  const stories = data?.stories || [];
  if (stories.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  const byUser = {};
  stories.forEach(s => { if (!byUser[s.user_id]) byUser[s.user_id] = []; byUser[s.user_id].push(s); });

  bar.innerHTML = Object.entries(byUser).map(([uid, userStories]) => {
    const name = uid === Store.user.id ? 'Ben' : (Store.getUsername(uid) || '?');
    return `
      <div class="story-ring" data-uid="${uid}" style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer">
        <div style="width:44px;height:44px;border-radius:50%;border:2.5px solid var(--color-primary);padding:2px;box-sizing:border-box">
          <div style="width:100%;height:100%;border-radius:50%;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600">${name[0].toUpperCase()}</div>
        </div>
        <div style="font-size:10px;color:var(--text-secondary);max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
      </div>
    `;
  }).join('');

  bar.querySelectorAll('.story-ring').forEach(el => {
    el.addEventListener('click', () => {
      const uid = el.dataset.uid;
      openStoryViewer(byUser[uid] || []);
    });
  });
}

async function loadStories() {
  const convUserIds = Store.conversations
    .filter(c => c.type === 'direct' && c.other_user_id)
    .map(c => c.other_user_id);
  const allIds = [Store.user.id, ...convUserIds];
  const uniqueIds = [...new Set(allIds)].filter(Boolean);

  const data = await Api.get(`/stories?user_ids=${uniqueIds.join(',')}`).catch(() => ({ stories: [] }));
  const stories = data?.stories || [];

  const myStories  = stories.filter(s => s.user_id === Store.user.id);
  const otherStories = stories.filter(s => s.user_id !== Store.user.id);

  renderStoryBubbles('my-story-list',  myStories,  true);
  renderStoryBubbles('stories-list',   otherStories, false);
}

function renderStoryBubbles(containerId, stories, isMine) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (stories.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px">${isMine ? 'Henüz hikaye yok' : 'Arkadaşlarının hikayesi yok'}</div>`;
    return;
  }

  // UserID'ye göre grupla
  const byUser = {};
  stories.forEach(s => {
    if (!byUser[s.user_id]) byUser[s.user_id] = [];
    byUser[s.user_id].push(s);
  });

  container.innerHTML = Object.entries(byUser).map(([uid, userStories]) => {
    const name = isMine ? (Store.user.username || 'Ben') : (Store.getUsername(uid) || uid.slice(0, 8));
    const latest = userStories[0];
    return `
      <div class="story-bubble" data-user-id="${uid}" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
        <div style="width:56px;height:56px;border-radius:50%;border:3px solid var(--color-primary);display:flex;align-items:center;justify-content:center;background:var(--bg-elevated);font-size:20px;overflow:hidden">
          ${latest.type === 'image' ? `<img src="${latest.content}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : latest.content.slice(0,2)}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${name}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.story-bubble').forEach(el => {
    el.addEventListener('click', () => {
      const uid = el.dataset.userId;
      const userStories = stories.filter(s => s.user_id === uid);
      openStoryViewer(userStories);
    });
  });
}

function openStoryViewer(stories) {
  const viewer  = document.getElementById('story-viewer');
  const content = document.getElementById('story-viewer-content');
  const meta    = document.getElementById('story-viewer-meta');
  if (!viewer || !content || stories.length === 0) return;

  let idx = 0;
  function show(i) {
    const s = stories[i];
    if (!s) { viewer.style.display = 'none'; return; }
    const ago = formatLastSeen(s.created_at).replace(' görüldü', '');
    meta.textContent = ago;
    if (s.type === 'image') {
      content.innerHTML = `
        <img src="${s.content}" style="max-width:100%;max-height:70vh;border-radius:12px;object-fit:contain">
        ${s.caption ? `<p style="color:white;margin-top:12px;font-size:16px">${s.caption}</p>` : ''}
      `;
    } else {
      content.innerHTML = `
        <div style="background:linear-gradient(135deg,var(--color-primary),var(--color-secondary,#7F77DD));padding:40px;border-radius:16px;min-height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <p style="color:white;font-size:22px;font-weight:600;margin:0;word-break:break-word">${s.content}</p>
          ${s.caption ? `<p style="color:rgba(255,255,255,.8);margin-top:12px;font-size:14px">${s.caption}</p>` : ''}
        </div>
      `;
    }
    if (stories.length > 1) {
      setTimeout(() => { idx++; show(idx); }, 4000);
    }
  }

  viewer.style.display = 'flex';
  show(0);
}

function render404() {
  document.getElementById('app').innerHTML = `
    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">🔍</div>
        <div>Sayfa bulunamadı</div>
        <a href="#/chat" style="margin-top:16px;display:inline-block">Ana sayfaya dön</a>
      </div>
    </div>
  `;
}

// ── Çevrimdışı mod ────────────────────────────────────
const _offlineQueue = { _key: 'orbit_msg_queue', get() { try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch { return []; } }, set(q) { try { localStorage.setItem(this._key, JSON.stringify(q)); } catch {} }, push(item) { const q = this.get(); q.push(item); this.set(q); }, clear() { localStorage.removeItem(this._key); } };

function showOfflineBanner() {
  if (document.getElementById('offline-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#e74c3c;color:white;text-align:center;padding:8px 16px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;justify-content:center;gap:8px';
  banner.innerHTML = '⚠️ Bağlantı kesildi — mesajlar tekrar bağlanınca gönderilecek';
  document.body.appendChild(banner);
}

function hideOfflineBanner() {
  document.getElementById('offline-banner')?.remove();
}

async function flushOfflineQueue() {
  const queue = _offlineQueue.get();
  if (queue.length === 0) return;
  _offlineQueue.clear();
  for (const item of queue) {
    try {
      await Api.sendMessage(item.convId, item.content, 'text', item.replyToId || '');
    } catch {
      _offlineQueue.push(item);
    }
  }
}

function setupOfflineMode() {
  if (window._offlineModeSetup) return;
  window._offlineModeSetup = true;

  if (!navigator.onLine) showOfflineBanner();

  window.addEventListener('offline', () => {
    showOfflineBanner();
  });

  window.addEventListener('online', async () => {
    hideOfflineBanner();
    Socket.connect();
    await flushOfflineQueue();
  });

  // WS yeniden bağlandığında da kuyruğu boşalt
  Socket.off('connected', window._wsReconnectFlush);
  window._wsReconnectFlush = () => flushOfflineQueue();
  Socket.on('connected', window._wsReconnectFlush);
}

// ── Toast bildirimleri ────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}
// ── WebRTC Arama ─────────────────────────────────────────
let localStream = null;
let peerConnection = null;
let callModal = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// ── Grup sohbet oluşturma ─────────────────────────────────
function showGroupModal() {
  const modal = document.createElement('div');
  modal.id = 'group-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--bg-surface);border:1px solid var(--border-color);border-radius:16px;padding:24px;width:100%;max-width:400px;box-shadow:var(--shadow-lg)">
      <h3 style="margin-bottom:16px;font-size:16px">Grup oluştur</h3>
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Grup adı</label>
        <input class="input" type="text" id="group-name" placeholder="Grup adı..." />
      </div>
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Üye ara</label>
        <input class="input" type="text" id="group-search" placeholder="Kullanıcı adı ara..." />
      </div>
      <div id="group-search-results" style="max-height:150px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:4px"></div>
      <div id="selected-members" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;min-height:32px"></div>
      <div style="display:flex;gap:8px">
        <button id="create-group-btn" class="btn btn-primary" style="flex:1">Oluştur</button>
        <button onclick="document.getElementById('group-modal').remove()" class="btn btn-ghost" style="flex:1">İptal</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const selectedUsers = new Map(); // id → username

  const renderSelected = () => {
    const container = document.getElementById('selected-members');
    container.innerHTML = [...selectedUsers.entries()].map(([id, name]) => `
      <span style="background:var(--bg-overlay);padding:4px 10px;border-radius:99px;font-size:12px;display:flex;align-items:center;gap:6px">
        ${name}
        <button onclick="removeGroupMember('${id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;line-height:1">×</button>
      </span>
    `).join('');
  };

  window.removeGroupMember = (id) => { selectedUsers.delete(id); renderSelected(); };

  let groupSearchTimer;
  document.getElementById('group-search').addEventListener('input', (e) => {
    clearTimeout(groupSearchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { document.getElementById('group-search-results').innerHTML = ''; return; }
    groupSearchTimer = setTimeout(async () => {
      try {
        const data = await Api.get('/auth/search?q=' + encodeURIComponent(q));
        const users = (data?.users || []).filter(u => u.id !== Store.user.id);
        const results = document.getElementById('group-search-results');
        results.innerHTML = users.map(u => `
          <div class="conv-item" data-uid="${u.id}" data-uname="${u.username}" style="cursor:pointer;border-radius:8px">
            <div class="avatar avatar-sm">${u.username[0].toUpperCase()}</div>
            <div class="conv-name" style="font-size:13px">${u.username}</div>
          </div>
        `).join('');
        results.querySelectorAll('.conv-item').forEach(el => {
          el.addEventListener('click', () => {
            selectedUsers.set(el.dataset.uid, el.dataset.uname);
            renderSelected();
            document.getElementById('group-search').value = '';
            document.getElementById('group-search-results').innerHTML = '';
          });
        });
      } catch {}
    }, 400);
  });

  document.getElementById('create-group-btn').addEventListener('click', async () => {
    const name = document.getElementById('group-name').value.trim();
    if (!name) { alert('Grup adı zorunlu'); return; }
    if (selectedUsers.size === 0) { alert('En az 1 üye ekle'); return; }

    const memberIds = [Store.user.id, ...selectedUsers.keys()];
    try {
      const data = await Api.post('/chat/conversations', {
        type:       'group',
        name,
        created_by: Store.user.id,
        member_ids: memberIds,
      });
      const conv = data?.conversation;
      if (conv) {
        Store.conversations.unshift(conv);
        renderConvList(Store.conversations);
        modal.remove();
        openConversation(conv.id);
      }
    } catch (e) { console.error('Grup oluşturulamadı:', e); }
  });
}



async function startCall(convId, type) {
  try {
    // Önceki bağlantı/stream temizle
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream)    { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    document.getElementById('screen-share-badge')?.remove();

    // Kamera/mikrofon izni
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    });

    showCallModal(convId, type, true);

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Local stream'i ekle
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // ICE candidate'leri WebSocket ile gönder
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        Socket.send('call_signal', {
          conversation_id: convId,
          type: 'ice_candidate',
          data: event.candidate,
        });
      }
    };

    // Remote stream gelince göster
    peerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    // Offer oluştur
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    Socket.send('call_signal', {
      conversation_id: convId,
      type: 'offer',
      data: offer,
      call_type: type,
    });

  } catch (err) {
    console.error('Arama başlatılamadı:', err);
    alert('Kamera/mikrofon erişimi reddedildi veya hata oluştu.');
  }
}

function showCallModal(convId, type, isCaller) {
  if (callModal) callModal.remove();

  const isScreen = type === 'screen';

  callModal = document.createElement('div');
  callModal.id = 'call-modal';
  callModal.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.95);z-index:9999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    padding:16px;box-sizing:border-box;
  `;

  if (isScreen && isCaller) {
    // Paylaşan kişi: kendi ekranını büyük görür, karşı tarafın kamerasını küçük pip'te
    callModal.innerHTML = `
      <div style="position:relative;width:100%;max-width:1280px;height:calc(100vh - 120px)">
        <video id="local-screen-preview" autoplay playsinline muted
               style="width:100%;height:100%;border-radius:8px;background:#111;object-fit:contain"></video>
        <div style="position:absolute;top:10px;left:12px;
                    background:rgba(0,0,0,0.7);color:#fff;padding:4px 14px;
                    border-radius:99px;font-size:12px;font-weight:600;
                    backdrop-filter:blur(6px)">🖥️ Ekranınız — karşı taraf bunu görüyor</div>
        <video id="remote-video" autoplay playsinline
               style="position:absolute;bottom:12px;right:12px;
                      width:180px;height:101px;border-radius:8px;
                      background:#333;object-fit:cover;display:none;
                      border:2px solid rgba(255,255,255,0.25)"></video>
      </div>
      <div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;justify-content:center">
        <button onclick="toggleScreenAudio()" class="btn btn-ghost" id="screen-mic-btn">🎤 Ses</button>
        <button onclick="endCall()" class="btn btn-danger" id="end-call-btn">🖥️ Paylaşımı Durdur</button>
      </div>
      <div id="call-status" style="color:rgba(255,255,255,0.6);font-size:13px">🖥️ Ekran paylaşılıyor</div>
    `;
  } else if (isScreen && !isCaller) {
    // İzleyen kişi: karşı tarafın ekranını büyük görür
    callModal.innerHTML = `
      <div style="width:100%;max-width:1280px;height:calc(100vh - 120px)">
        <video id="remote-video" autoplay playsinline
               style="width:100%;height:100%;border-radius:8px;background:#111;object-fit:contain"></video>
      </div>
      <div style="display:flex;gap:12px;margin-top:4px">
        <button onclick="endCall()" class="btn btn-danger" id="end-call-btn">📵 Kapat</button>
      </div>
      <div id="call-status" style="color:rgba(255,255,255,0.6);font-size:13px">🖥️ Ekran alınıyor...</div>
    `;
  } else {
    // Sesli / görüntülü arama
    callModal.innerHTML = `
      <div style="position:relative;width:100%;max-width:640px;">
        <video id="remote-video" autoplay playsinline
               style="width:100%;min-height:360px;border-radius:12px;background:#111;object-fit:cover;display:block;"></video>
        <video id="local-video" autoplay playsinline muted style="
            position:absolute;bottom:12px;right:12px;
            width:120px;height:90px;border-radius:8px;background:#333;object-fit:cover;"></video>
      </div>
      <div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;justify-content:center">
        <button onclick="toggleMute()" class="btn btn-ghost" id="mute-btn">🎤 Ses</button>
        ${type === 'video' ? '<button onclick="toggleCamera()" class="btn btn-ghost" id="cam-btn">📹 Kamera</button>' : ''}
        ${type === 'video' || type === 'audio' ? '<button onclick="startScreenShare(\'' + convId + '\')" class="btn btn-ghost" id="share-btn">🖥️ Ekran Paylaş</button>' : ''}
        <button onclick="endCall()" class="btn btn-danger" id="end-call-btn">📵 Kapat</button>
      </div>
      <div id="call-status" style="color:rgba(255,255,255,0.6);font-size:13px">
        ${isCaller ? 'Bağlanıyor...' : 'Gelen arama...'}
      </div>
    `;
  }

  document.body.appendChild(callModal);

  // Local stream bağla
  if (!isScreen && localStream) {
    const lv = document.getElementById('local-video');
    if (lv) lv.srcObject = localStream;
  }
  if (isScreen && isCaller && localStream) {
    const preview = document.getElementById('local-screen-preview');
    if (preview) preview.srcObject = localStream;
  }
}

function showIncomingCall(data) {
  const isScreen = data.call_type === 'screen';
  const callTypeText = isScreen ? '🖥️ Ekran paylaşımı'
    : data.call_type === 'video' ? '📹 Görüntülü arama'
    : '📞 Sesli arama';

  const modal = document.createElement('div');
  modal.id = 'incoming-call-modal';
  modal.style.cssText = 'position:fixed;top:24px;right:24px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:16px;padding:20px 24px;z-index:9999;box-shadow:var(--shadow-lg);min-width:260px';
  modal.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px">${callTypeText}</div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
      ${isScreen ? 'Biri ekranını paylaşıyor' : 'Birisi seni arıyor...'}
    </div>
    <div style="display:flex;gap:8px">
      <button id="accept-call" class="btn btn-primary" style="flex:1">✅ ${isScreen ? 'İzle' : 'Cevapla'}</button>
      <button id="reject-call" class="btn btn-danger" style="flex:1">❌ ${isScreen ? 'Reddet' : 'Reddet'}</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('accept-call').addEventListener('click', async () => {
    modal.remove();
    try {
      // Ekran paylaşımı alıcısının kameraya ihtiyacı yok
      if (isScreen) {
        localStream = new MediaStream(); // boş stream — sadece alıyoruz
      } else {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: data.call_type === 'video',
        });
      }

      showCallModal(data.conversation_id, data.call_type, false);
      peerConnection = new RTCPeerConnection(rtcConfig);

      if (!isScreen) {
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
      }

      peerConnection.onicecandidate = (ev) => {
        if (ev.candidate) Socket.send('call_signal', {
          conversation_id: data.conversation_id,
          type: 'ice_candidate',
          data: ev.candidate,
        });
      };
      peerConnection.ontrack = (ev) => {
        const rv = document.getElementById('remote-video');
        if (rv) rv.srcObject = ev.streams[0];
        // Bağlantı kuruldu
        const statusEl = document.getElementById('call-status');
        if (statusEl && isScreen) statusEl.textContent = '🖥️ Ekran paylaşımı aktif';
      };

      await peerConnection.setRemoteDescription(data.data);

      if (window._pendingCandidates) {
        for (const c of window._pendingCandidates) await peerConnection.addIceCandidate(c);
        window._pendingCandidates = [];
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      Socket.send('call_signal', { conversation_id: data.conversation_id, type: 'answer', data: answer });
    } catch (e) {
      console.error('Arama cevaplama hatası:', e);
      showToast('Bağlantı kurulamadı', 'error');
    }
  });

  document.getElementById('reject-call').addEventListener('click', () => modal.remove());

  setTimeout(() => { if (document.getElementById('incoming-call-modal')) modal.remove(); }, 30000);
}


function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (callModal) {
    callModal.remove();
    callModal = null;
  }
  document.getElementById('screen-share-badge')?.remove();
}

function toggleMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    document.getElementById('mute-btn').textContent = track.enabled ? '🎤 Ses' : '🔇 Sessiz';
  }
}

function toggleCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    document.getElementById('cam-btn').textContent = track.enabled ? '📹 Kamera' : '📷 Kapalı';
  }
}

// ── Server & Kanal yönetimi ───────────────────────────────

async function loadServers() {
  try {
    const data = await Api.getServers();
    const servers = data?.servers || [];
    Store.setServers(servers);
    renderServerIcons(servers);
  } catch (e) {
    console.error('Serverlar yüklenemedi:', e);
  }
}

function renderServerIcons(servers) {
  const container = document.getElementById('server-icons');
  const divider   = document.getElementById('server-icons-divider');
  if (!container) return;

  if (servers.length === 0) {
    container.innerHTML = '';
    if (divider) divider.style.display = 'none';
    return;
  }

  if (divider) divider.style.display = '';

  container.innerHTML = servers.map(s => `
    <div class="server-icon" data-server-id="${s.id}" title="${s.name}"
         style="font-size:14px;font-weight:600">
      ${s.icon_url
        ? `<img src="${s.icon_url}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
        : (s.name?.[0] || '?').toUpperCase()}
    </div>
  `).join('');

  container.querySelectorAll('.server-icon').forEach(el => {
    el.addEventListener('click', () => openServer(el.dataset.serverId));
  });
}

async function openServer(serverId) {
  Store.setActiveServer(serverId);
  Store.setActiveChannel(null);

  // Aktif icon
  document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
  const icon = document.querySelector(`.server-icon[data-server-id="${serverId}"]`);
  if (icon) icon.classList.add('active');

  const server = Store.servers.find(s => s.id === serverId);
  const serverName = server?.name || 'Server';

  // Sidebar'ı kanal listesi moduna geçir
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar-header" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
        <div style="font-weight:700;font-size:15px">${serverName}</div>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" id="members-btn" title="Üyeler" style="font-size:16px">👥</button>
          <button class="btn-icon" id="create-channel-btn" title="Kanal ekle" style="font-size:18px">+</button>
          <button class="btn-icon" id="logout-btn" title="Çıkış" style="font-size:16px">⏻</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">Davet: <code style="color:var(--color-primary);user-select:all">${server?.invite_code || ''}</code></div>
    </div>
    <div style="padding:8px 12px 4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Metin Kanalları</div>
    <div class="sidebar-list" id="channel-list">
      <div style="padding:12px 16px;color:var(--text-muted);font-size:13px">Yükleniyor...</div>
    </div>
  `;

  document.getElementById('create-channel-btn').addEventListener('click', () => showCreateChannelModal(serverId));
  document.getElementById('members-btn').addEventListener('click', () => openMembersPanel(serverId));
  document.getElementById('logout-btn').addEventListener('click', () => {
    Socket.disconnect();
    Store.clearAuth();
    Router.navigate('login');
  });

  // Chat alanını temizle
  const chatArea = document.getElementById('chat-area');
  if (chatArea) {
    chatArea.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">📡</div>
          <div>Bir kanal seç</div>
        </div>
      </div>
    `;
  }

  // Kanalları yükle
  try {
    const data = await Api.getChannels(serverId);
    const channels = data?.channels || [];
    Store.setChannels(serverId, channels);
    renderChannelList(channels, serverId);
  } catch (e) {
    document.getElementById('channel-list').innerHTML = `<div style="padding:12px;color:var(--color-error);font-size:13px">Kanallar yüklenemedi</div>`;
  }
}

function renderChannelList(channels, serverId) {
  const list = document.getElementById('channel-list');
  if (!list) return;

  if (channels.length === 0) {
    list.innerHTML = `<div style="padding:12px 16px;color:var(--text-muted);font-size:13px">Henüz kanal yok.<br>+ butonu ile ekle.</div>`;
    return;
  }

  const textChannels  = channels.filter(c => c.type !== 'voice');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  const renderText = ch => `
    <div class="conv-item channel-item" data-channel-id="${ch.id}" data-conv-id="${ch.conversation_id}" data-channel-type="text">
      <span style="color:var(--text-muted);font-size:16px;margin-right:2px">#</span>
      <div class="conv-info">
        <div class="conv-name" style="font-size:14px">${ch.name}</div>
        ${ch.topic ? `<div class="conv-preview" style="font-size:11px">${ch.topic}</div>` : ''}
      </div>
    </div>
  `;

  const renderVoice = ch => `
    <div class="channel-voice-item" data-channel-id="${ch.id}" data-channel-type="voice"
         style="padding:4px 12px 2px;border-radius:var(--radius-md);cursor:pointer;transition:background var(--transition)">
      <div style="display:flex;align-items:center;gap:6px;padding:2px 0">
        <span style="color:var(--text-muted);font-size:16px">🔊</span>
        <span style="font-size:14px;color:var(--text-normal);flex:1">${ch.name}</span>
        ${Store.myVoiceChannelId === ch.id
          ? `<span style="font-size:10px;color:var(--color-success);font-weight:600">● BAĞLI</span>`
          : ''}
      </div>
      <div class="voice-sidebar-participants" id="voice-participants-${ch.id}"
           style="display:flex;flex-wrap:wrap;gap:4px;padding:2px 0 4px 22px"></div>
    </div>
  `;

  let html = '';
  if (textChannels.length) {
    html += `<div style="padding:6px 12px 2px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Metin Kanalları</div>`;
    html += textChannels.map(renderText).join('');
  }
  if (voiceChannels.length) {
    html += `<div style="padding:6px 12px 2px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Sesli Kanallar</div>`;
    html += voiceChannels.map(renderVoice).join('');
  }
  list.innerHTML = html;

  list.querySelectorAll('.channel-item').forEach(el => {
    el.addEventListener('click', () => openChannel(el.dataset.channelId, serverId));
  });

  list.querySelectorAll('.channel-voice-item').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-elevated)');
    el.addEventListener('mouseleave', () => el.style.background = '');
    el.addEventListener('click', () => {
      const chId = el.dataset.channelId;
      if (Store.myVoiceChannelId === chId) {
        leaveVoice();
      } else {
        joinVoice(chId);
      }
    });
  });

  // Mevcut katılımcıları render et (zaten kanaldaysak)
  voiceChannels.forEach(ch => {
    const parts = Store.getVoiceParticipants(ch.id);
    if (parts.length) renderVoiceSidebarParticipants(ch.id, parts);
  });
}

async function openChannel(channelId, serverId) {
  const channels = Store.getChannels(serverId);
  const channel  = channels.find(c => c.id === channelId);
  if (channel?.type === 'voice') { joinVoice(channelId); return; }

  Store.setActiveChannel(channelId);
  const convId   = channel?.conversation_id;

  // Aktif kanal
  document.querySelectorAll('.channel-item').forEach(el => {
    el.classList.toggle('active', el.dataset.channelId === channelId);
  });

  const chatArea = document.getElementById('chat-area');
  if (!chatArea) return;

  chatArea.innerHTML = `
    <div class="chat-header" id="chat-header">
      <span style="color:var(--text-muted);font-size:18px">#</span>
      <div class="chat-header-info">
        <h3>${channel?.name || 'kanal'}</h3>
        ${channel?.topic ? `<span style="color:var(--text-muted);font-size:12px">${channel.topic}</span>` : ''}
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
        <button class="btn-icon" id="channel-screen-btn" title="Ekran paylaş">🖥️</button>
      </div>
    </div>
    <div class="message-list" id="message-list"></div>
    <div class="message-input-bar">
      <textarea class="message-input" id="msg-input" placeholder="#${channel?.name || 'kanal'} içine mesaj yaz..." rows="1"></textarea>
      <button class="btn btn-primary" id="send-btn">Gönder</button>
    </div>
  `;

  const sendBtn  = document.getElementById('send-btn');
  const msgInput = document.getElementById('msg-input');

  document.getElementById('channel-screen-btn')?.addEventListener('click', () => {
    const shareConvId = convId || Store.activeConvId;
    if (shareConvId) startScreenShare(shareConvId);
    else showToast('Kanal bağlantısı kurulamadı', 'error');
  });

  const doSend = async () => {
    const content = msgInput.value.trim();
    if (!content) return;
    msgInput.value = '';

    const tempId  = 'temp-' + Date.now();
    const tempMsg = {
      id: tempId,
      conversation_id: convId || '',
      channel_id: channelId,
      sender_id: Store.user.id,
      content, type: 'text', status: 'pending',
      created_at: new Date().toISOString(),
    };
    appendMessage(tempMsg);

    try {
      const result = await Api.sendChannelMessage(channelId, content);
      const realId = result?.message_id;
      const tempEl = document.querySelector(`[data-id="${tempId}"]`);
      if (tempEl) {
        if (realId) tempEl.dataset.id = realId;
        updateMessageStatusIcon(realId || tempId, 'sent');
      }
    } catch (e) {
      console.error('Kanal mesajı gönderilemedi:', e);
      updateMessageStatusIcon(tempId, 'failed');
    }
  };

  sendBtn.addEventListener('click', doSend);
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });

  // WS: bu kanalın backing conv'una katıl
  if (convId) {
    Store.setActiveConv(convId);
    Socket.joinConv(convId);
  }

  // Kanal mesajlarını yükle
  try {
    const data = await Api.getChannelMessages(channelId);
    const msgs = (data?.messages || []).reverse();
    msgs.forEach(appendMessage);
  } catch {}
}

// ── Server oluşturma modalı ──────────────────────────────
function showCreateServerModal() {
  const modal = document.createElement('div');
  modal.className = 'cp-modal-overlay';
  modal.innerHTML = `
    <div class="cp-modal">
      <h3 style="margin-bottom:16px">Server Oluştur</h3>
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Server adı</label>
        <input class="input" id="new-server-name" placeholder="Örn: Oyun Sunucusu" />
      </div>
      <div style="display:flex;gap:8px">
        <button id="create-server-submit" class="btn btn-primary" style="flex:1">Oluştur</button>
        <button onclick="this.closest('.cp-modal-overlay').remove()" class="btn btn-ghost" style="flex:1">İptal</button>
      </div>
      <div id="create-server-err" style="color:var(--color-error);font-size:13px;margin-top:8px;display:none"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('create-server-submit').addEventListener('click', async () => {
    const name = document.getElementById('new-server-name').value.trim();
    if (!name) return;
    try {
      const data = await Api.createServer(name);
      const server = data?.server;
      if (server) {
        Store.servers.push(server);
        renderServerIcons(Store.servers);
        modal.remove();
        openServer(server.id);
      }
    } catch (e) {
      const errEl = document.getElementById('create-server-err');
      errEl.textContent = e.message || 'Server oluşturulamadı';
      errEl.style.display = '';
    }
  });
}

// ── Server'a katıl modalı ────────────────────────────────
function showJoinServerModal() {
  const modal = document.createElement('div');
  modal.className = 'cp-modal-overlay';
  modal.innerHTML = `
    <div class="cp-modal">
      <h3 style="margin-bottom:16px">Server'a Katıl</h3>
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Davet kodu</label>
        <input class="input" id="join-invite-code" placeholder="8 karakterli kod..." maxlength="8" />
      </div>
      <div style="display:flex;gap:8px">
        <button id="join-server-submit" class="btn btn-primary" style="flex:1">Katıl</button>
        <button onclick="this.closest('.cp-modal-overlay').remove()" class="btn btn-ghost" style="flex:1">İptal</button>
      </div>
      <div id="join-server-err" style="color:var(--color-error);font-size:13px;margin-top:8px;display:none"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('join-server-submit').addEventListener('click', async () => {
    const code = document.getElementById('join-invite-code').value.trim();
    if (!code) return;
    try {
      const data = await Api.joinServer(code);
      const server = data?.server;
      if (server) {
        const existing = Store.servers.find(s => s.id === server.id);
        if (!existing) Store.servers.push(server);
        renderServerIcons(Store.servers);
        modal.remove();
        openServer(server.id);
      }
    } catch (e) {
      const errEl = document.getElementById('join-server-err');
      errEl.textContent = e.message || 'Geçersiz davet kodu';
      errEl.style.display = '';
    }
  });
}

// ── Üye paneli ───────────────────────────────────────────

const ROLE_LABELS = {
  owner:     { label: 'Sahip',     color: '#ffd700' },
  admin:     { label: 'Admin',     color: '#e74c3c' },
  moderator: { label: 'Moderatör', color: '#3498db' },
  member:    { label: 'Üye',       color: 'var(--text-muted)' },
};

// Mevcut kullanıcının bu server'daki rolünü döner
function myRoleInServer(members) {
  const me = members.find(m => m.user_id === Store.user.id);
  return me?.role || 'member';
}

function roleLevel(role) {
  return { owner: 3, admin: 2, moderator: 1, member: 0 }[role] ?? 0;
}

async function openMembersPanel(serverId) {
  const chatArea = document.getElementById('chat-area');
  if (!chatArea) return;

  chatArea.innerHTML = `
    <div class="chat-header">
      <div style="font-size:18px">👥</div>
      <div class="chat-header-info"><h3>Server Üyeleri</h3></div>
    </div>
    <div id="members-list" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:6px">
      <div style="color:var(--text-muted);font-size:13px">Yükleniyor...</div>
    </div>
  `;

  try {
    const data = await Api.getServerMembers(serverId);
    const members = data?.members || [];

    // Bilinmeyen kullanıcı adlarını yükle
    const unknownIds = members.filter(m => !Store.getUsername(m.user_id) && m.user_id !== Store.user.id).map(m => m.user_id);
    await Promise.all(unknownIds.map(id =>
      Api.get(`/auth/users/${id}`).then(d => {
        if (d?.user) Store.addUser(d.user.id, d.user.username);
      }).catch(() => {})
    ));

    renderMembersList(members, serverId);
  } catch (e) {
    document.getElementById('members-list').innerHTML = `<div style="color:var(--color-error);font-size:13px">${e.message}</div>`;
  }
}

function renderMembersList(members, serverId) {
  const list = document.getElementById('members-list');
  if (!list) return;

  const myRole = myRoleInServer(members);
  const canManage = roleLevel(myRole) >= roleLevel('admin');

  // Rollere göre grupla
  const groups = { owner: [], admin: [], moderator: [], member: [] };
  members.forEach(m => { (groups[m.role] || groups.member).push(m); });

  const renderGroup = (role, items) => {
    if (!items.length) return '';
    const info = ROLE_LABELS[role];
    return `
      <div style="font-size:11px;font-weight:600;color:${info.color};text-transform:uppercase;letter-spacing:.6px;margin-top:12px;margin-bottom:4px">
        ${info.label} — ${items.length}
      </div>
      ${items.map(m => renderMemberRow(m, serverId, myRole, canManage)).join('')}
    `;
  };

  list.innerHTML =
    renderGroup('owner', groups.owner) +
    renderGroup('admin', groups.admin) +
    renderGroup('moderator', groups.moderator) +
    renderGroup('member', groups.member);

  // Üye menüsü
  list.querySelectorAll('.member-row[data-user-id]').forEach(el => {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const targetId   = el.dataset.userId;
      const targetRole = el.dataset.role;
      if (targetId === Store.user.id) return;
      if (!canManage && roleLevel(myRole) < roleLevel('moderator')) return;
      showMemberMenu(e, targetId, targetRole, serverId, myRole, members);
    });
  });
}

function renderMemberRow(m, serverId, myRole, canManage) {
  const info    = ROLE_LABELS[m.role] || ROLE_LABELS.member;
  const name    = Store.getUsername(m.user_id) || m.user_id.slice(0, 8) + '...';
  const online  = Store.isOnline(m.user_id);
  const isMe    = m.user_id === Store.user.id;
  const canAct  = !isMe && (roleLevel(myRole) > roleLevel(m.role));

  return `
    <div class="member-row conv-item" data-user-id="${m.user_id}" data-role="${m.role}"
         style="cursor:${canAct ? 'context-menu' : 'default'};padding:8px 10px"
         title="${canAct ? 'Sağ tık → yönet' : ''}">
      <div class="avatar-wrap">
        <div class="avatar avatar-sm">${name[0].toUpperCase()}</div>
        <div class="presence-dot${online ? ' online' : ''}"></div>
      </div>
      <div class="conv-info">
        <div class="conv-name" style="font-size:13px">${name}${isMe ? ' <span style="color:var(--text-muted)">(Sen)</span>' : ''}</div>
        <div style="font-size:11px;color:${info.color}">${info.label}</div>
      </div>
    </div>
  `;
}

function showMemberMenu(e, targetUserId, targetRole, serverId, myRole, members) {
  document.querySelectorAll('.member-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'member-menu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:10px;padding:6px;z-index:2000;min-width:180px;box-shadow:var(--shadow-md)`;

  const canSetRole = roleLevel(myRole) >= roleLevel('admin') && roleLevel(myRole) > roleLevel(targetRole);
  const canKick    = roleLevel(myRole) >= roleLevel('moderator') && roleLevel(myRole) > roleLevel(targetRole);

  const targetName = Store.getUsername(targetUserId) || targetUserId.slice(0, 8);

  let roleOptions = '';
  if (canSetRole) {
    const availableRoles = ['admin', 'moderator', 'member'].filter(r => roleLevel(r) < roleLevel(myRole));
    roleOptions = availableRoles.map(r => `
      <div class="member-menu-item" data-action="role" data-role="${r}"
           style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;color:${ROLE_LABELS[r].color}"
           onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">
        🏷 ${ROLE_LABELS[r].label} yap
      </div>
    `).join('');
  }

  menu.innerHTML = `
    <div style="padding:6px 12px 6px;font-size:12px;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border-color);margin-bottom:4px">${targetName}</div>
    ${roleOptions}
    ${canKick ? `<div class="member-menu-item" data-action="kick" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;color:var(--color-error)" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">👢 Sunucudan At</div>` : ''}
  `;

  document.body.appendChild(menu);

  menu.querySelectorAll('.member-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      menu.remove();
      const action = item.dataset.action;
      try {
        if (action === 'role') {
          await Api.setMemberRole(serverId, targetUserId, item.dataset.role);
          showToast(`Rol güncellendi: ${ROLE_LABELS[item.dataset.role].label}`, 'success');
          await openMembersPanel(serverId);
        } else if (action === 'kick') {
          if (!confirm(`${targetName} sunucudan atılacak. Emin misin?`)) return;
          await Api.kickMember(serverId, targetUserId);
          showToast(`${targetName} sunucudan atıldı`, 'success');
          await openMembersPanel(serverId);
        }
      } catch (err) {
        showToast(err.message || 'İşlem başarısız', 'error');
      }
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function close() {
      menu.remove();
      document.removeEventListener('click', close);
    });
  }, 50);
}

// ── Kanal oluşturma modalı ───────────────────────────────
function showCreateChannelModal(serverId) {
  const modal = document.createElement('div');
  modal.className = 'cp-modal-overlay';
  modal.innerHTML = `
    <div class="cp-modal">
      <h3 style="margin-bottom:16px">Kanal Oluştur</h3>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <label style="flex:1;cursor:pointer">
          <input type="radio" name="ch-type" value="text" checked style="display:none">
          <div class="ch-type-btn" data-val="text"
               style="border:2px solid var(--color-primary);border-radius:var(--radius-md);padding:10px;text-align:center;background:var(--bg-elevated)">
            <div style="font-size:20px">#</div>
            <div style="font-size:12px;font-weight:600;margin-top:2px">Metin</div>
            <div style="font-size:11px;color:var(--text-muted)">Mesajlaşma</div>
          </div>
        </label>
        <label style="flex:1;cursor:pointer">
          <input type="radio" name="ch-type" value="voice" style="display:none">
          <div class="ch-type-btn" data-val="voice"
               style="border:2px solid var(--border-color);border-radius:var(--radius-md);padding:10px;text-align:center;background:var(--bg-elevated)">
            <div style="font-size:20px">🔊</div>
            <div style="font-size:12px;font-weight:600;margin-top:2px">Sesli</div>
            <div style="font-size:11px;color:var(--text-muted)">WebRTC ses</div>
          </div>
        </label>
      </div>

      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">Kanal adı</label>
        <input class="input" id="new-channel-name" placeholder="genel" />
      </div>
      <div class="input-group" style="margin-bottom:16px">
        <label class="input-label">Açıklama (isteğe bağlı)</label>
        <input class="input" id="new-channel-topic" placeholder="Bu kanalın konusu..." />
      </div>
      <div style="display:flex;gap:8px">
        <button id="create-channel-submit" class="btn btn-primary" style="flex:1">Oluştur</button>
        <button onclick="this.closest('.cp-modal-overlay').remove()" class="btn btn-ghost" style="flex:1">İptal</button>
      </div>
      <div id="create-channel-err" style="color:var(--color-error);font-size:13px;margin-top:8px;display:none"></div>
    </div>
  `;
  document.body.appendChild(modal);

  // Type seçici görsel toggle
  modal.querySelectorAll('input[name="ch-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      modal.querySelectorAll('.ch-type-btn').forEach(btn => {
        btn.style.borderColor = btn.dataset.val === radio.value
          ? 'var(--color-primary)'
          : 'var(--border-color)';
      });
    });
  });

  document.getElementById('create-channel-submit').addEventListener('click', async () => {
    const name  = document.getElementById('new-channel-name').value.trim();
    const topic = document.getElementById('new-channel-topic').value.trim();
    const type  = modal.querySelector('input[name="ch-type"]:checked')?.value || 'text';
    if (!name) return;
    try {
      const data = await Api.createChannel(serverId, name, topic, type);
      const channel = data?.channel;
      if (channel) {
        Store.addChannel(serverId, channel);
        modal.remove();
        renderChannelList(Store.getChannels(serverId), serverId);
        if (channel.type !== 'voice') openChannel(channel.id, serverId);
      }
    } catch (e) {
      const errEl = document.getElementById('create-channel-err');
      errEl.textContent = e.message || 'Kanal oluşturulamadı';
      errEl.style.display = '';
    }
  });
}

// ── Sesli Kanal (Mesh WebRTC) ────────────────────────────

const voicePeers   = {};  // userId → RTCPeerConnection
const voiceAudios  = {};  // userId → <audio> element
let   voiceMicStream = null;
// Web Audio API — konuşma algılama
const voiceAnalysers = {}; // userId → { analyser, interval }

// Sesli kanal video/ekran paylaşımı
let voiceCamStream    = null;
let voiceScreenStream = null;
let voiceVideoEnabled = false;
let voiceScreenSharing = false;
const voiceVideos = {}; // tileId → <div> element

async function joinVoice(channelId) {
  if (!Store.activeServerId) { showToast('Önce bir sunucuya gir', 'error'); return; }

  // Önceki kanaldan çık
  if (Store.myVoiceChannelId && Store.myVoiceChannelId !== channelId) {
    await leaveVoice();
  }

  // Mikrofon izni
  try {
    voiceMicStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    showToast('Mikrofon erişimi reddedildi', 'error');
    return;
  }

  Store.setMyVoiceChannel(channelId);
  Store.setVoiceParticipants(channelId, [Store.user.id]);

  Socket.send('join_voice', { channel_id: channelId });
  updateVoiceUI(channelId);
  showToast('Sesli kanala bağlandınız 🎙️', 'success');
}

async function leaveVoice() {
  const channelId = Store.myVoiceChannelId;
  if (!channelId) return;

  Socket.send('leave_voice', { channel_id: channelId });
  Store.setMyVoiceChannel(null);
  Store.setVoiceParticipants(channelId, []);

  // Tüm P2P bağlantılarını kapat
  for (const [uid, pc] of Object.entries(voicePeers)) {
    pc.close();
    delete voicePeers[uid];
  }

  // Ses elementlerini kaldır
  for (const [uid, el] of Object.entries(voiceAudios)) {
    el.srcObject = null;
    el.remove();
    delete voiceAudios[uid];
  }

  // Konuşma algılama intervallerini temizle
  for (const [uid, a] of Object.entries(voiceAnalysers)) {
    clearInterval(a.interval);
    delete voiceAnalysers[uid];
  }

  // Mikrofon kapat
  voiceMicStream?.getTracks().forEach(t => t.stop());
  voiceMicStream = null;

  // Kamera ve ekran paylaşımını kapat
  voiceCamStream?.getTracks().forEach(t => t.stop());
  voiceCamStream = null;
  voiceVideoEnabled = false;
  voiceScreenStream?.getTracks().forEach(t => t.stop());
  voiceScreenStream = null;
  voiceScreenSharing = false;

  // Video tile'larını temizle
  Object.keys(voiceVideos).forEach(id => removeVoiceVideoTile(id));
  document.getElementById('voice-video-panel')?.remove();

  updateVoiceUI(null);
  showToast('Sesli kanaldan ayrıldınız', 'info');
}

// Ses peer bağlantısı oluştur veya var olanı döndür
function getOrCreateVoicePeer(userId, channelId) {
  if (voicePeers[userId]) return voicePeers[userId];

  const pc = new RTCPeerConnection(rtcConfig);
  voicePeers[userId] = pc;

  // Kendi mikrofonumu ekle
  if (voiceMicStream) {
    voiceMicStream.getTracks().forEach(t => pc.addTrack(t, voiceMicStream));
  }

  pc.onicecandidate = (ev) => {
    if (ev.candidate) Socket.send('voice_signal', {
      channel_id:     channelId,
      target_user_id: userId,
      type:           'ice_candidate',
      data:           ev.candidate,
    });
  };

  pc.ontrack = (ev) => {
    const track  = ev.track;
    const stream = ev.streams[0];
    if (track.kind === 'audio') {
      playVoiceStream(userId, stream);
    } else if (track.kind === 'video') {
      // Ekran paylaşımı mı yoksa kamera mı? Track label'dan anla
      const lbl = track.label?.toLowerCase() ?? '';
      const isScreen = lbl.includes('screen') || lbl.includes('display') || lbl.includes('monitor') || lbl.includes('window');
      showVoiceVideoTile(userId, stream, isScreen);
    }
    Store.addVoiceParticipant(channelId, userId);
    updateVoiceUI(channelId);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      cleanupVoicePeer(userId, channelId);
    }
  };

  return pc;
}

function playVoiceStream(userId, stream) {
  // Mevcut varsa güncelle
  let audio = voiceAudios[userId];
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = `voice-audio-${userId}`;
    audio.autoplay = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    voiceAudios[userId] = audio;
  }
  audio.srcObject = stream;

  // Web Audio API ile konuşma algılaması
  setupSpeakingDetection(userId, stream);
}

function setupSpeakingDetection(userId, stream) {
  try {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const interval = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const el = document.querySelector(`.voice-avatar[data-uid="${userId}"]`);
      if (el) el.classList.toggle('speaking', avg > 12);
    }, 100);

    voiceAnalysers[userId] = { analyser, interval };
  } catch { /* AudioContext yoksa sessizce geç */ }
}

function cleanupVoicePeer(userId, channelId) {
  voicePeers[userId]?.close();
  delete voicePeers[userId];

  if (voiceAudios[userId]) {
    voiceAudios[userId].srcObject = null;
    voiceAudios[userId].remove();
    delete voiceAudios[userId];
  }

  if (voiceAnalysers[userId]) {
    clearInterval(voiceAnalysers[userId].interval);
    delete voiceAnalysers[userId];
  }

  removeVoiceVideoTile(userId);

  Store.removeVoiceParticipant(channelId, userId);
  updateVoiceHeader(channelId);
}

async function sendVoiceOffer(channelId, targetUserId) {
  const pc    = getOrCreateVoicePeer(targetUserId, channelId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  Socket.send('voice_signal', { channel_id: channelId, target_user_id: targetUserId, type: 'offer', data: offer });
}

// ── Sesli kanal UI güncellemeleri ────────────────────────

// ── Sesli kanal UI ──────────────────────────────────────

function updateVoiceUI(channelId) {
  // Sidebar alt status bar
  updateVoiceStatusBar(channelId);
  // Sidebar kanal listesinde katılımcılar
  if (channelId) {
    renderVoiceSidebarParticipants(channelId, Store.getVoiceParticipants(channelId));
  }
  // Kanal listesinde "BAĞLI" badge'ini yenile
  const serverId = Store.activeServerId;
  if (serverId) renderChannelList(Store.getChannels(serverId), serverId);
}

// Sidebar'daki sesli kanal öğesinin altında katılımcıları göster (Discord stili)
function renderVoiceSidebarParticipants(channelId, participants) {
  const container = document.getElementById(`voice-participants-${channelId}`);
  if (!container) return;

  if (!participants.length) { container.innerHTML = ''; return; }

  container.innerHTML = participants.map(uid => {
    const name    = uid === Store.user.id ? (Store.user.username || 'Ben') : (Store.getUsername(uid) || uid.slice(0, 6));
    const isMuted = uid === Store.user.id && voiceMicStream && !voiceMicStream.getAudioTracks()[0]?.enabled;
    return `
      <div class="voice-avatar" data-uid="${uid === Store.user.id ? '__me__' : uid}"
           title="${name}"
           style="display:flex;align-items:center;gap:4px;padding:2px 6px 2px 2px;border-radius:12px;
                  background:var(--bg-elevated);border:1px solid var(--border-color);
                  font-size:11px;color:var(--text-normal);transition:border-color .15s;cursor:default;width:fit-content">
        <div style="width:20px;height:20px;border-radius:50%;background:var(--bg-overlay);
                    display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;
                    color:var(--color-primary-light);flex-shrink:0">
          ${(name[0] || '?').toUpperCase()}
        </div>
        <span style="max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
        ${isMuted ? '<span title="Sessiz">🔇</span>' : ''}
      </div>
    `;
  }).join('');

  // Kendi konuşma algılaması (speaking border)
  if (voiceMicStream) {
    setupSpeakingDetection('__me__', voiceMicStream);
  }
}

function updateVoiceStatusBar(channelId) {
  document.getElementById('voice-status-bar')?.remove();
  if (!channelId) return;

  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const channels = Store.activeServerId ? Store.getChannels(Store.activeServerId) : [];
  const chName   = channels.find(c => c.id === channelId)?.name || 'sesli kanal';
  const isMuted  = voiceMicStream && !voiceMicStream.getAudioTracks()[0]?.enabled;

  const bar = document.createElement('div');
  bar.id = 'voice-status-bar';
  bar.style.cssText = `
    padding:10px 14px;background:var(--bg-overlay);border-top:1px solid var(--border-color);
    display:flex;flex-direction:column;gap:6px;flex-shrink:0;
  `;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px">
      <div style="flex:1;overflow:hidden">
        <div style="font-size:12px;font-weight:600;color:var(--color-success)">● Sesli bağlantı aktif</div>
        <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔊 ${chName}</div>
      </div>
      <button onclick="toggleVoiceMute()" id="voice-mute-btn" class="btn-icon"
              title="${isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}"
              style="font-size:16px;${isMuted ? 'color:var(--color-error)' : ''}">
        ${isMuted ? '🔇' : '🎤'}
      </button>
      <button onclick="toggleVoiceCamera()" id="voice-cam-btn" class="btn-icon"
              title="${voiceVideoEnabled ? 'Kamerayı kapat' : 'Kamerayı aç'}"
              style="font-size:16px;${voiceVideoEnabled ? 'color:var(--color-primary)' : ''}">
        ${voiceVideoEnabled ? '📹' : '📷'}
      </button>
      <button onclick="${voiceScreenSharing ? 'stopVoiceScreenShare()' : 'startVoiceScreenShare()'}"
              id="voice-screen-btn" class="btn-icon"
              title="${voiceScreenSharing ? 'Paylaşımı durdur' : 'Ekran paylaş'}"
              style="font-size:16px;${voiceScreenSharing ? 'color:var(--color-primary)' : ''}">
        🖥️
      </button>
      <button onclick="leaveVoice()" class="btn-icon"
              title="Kanaldan ayrıl" style="font-size:16px;color:var(--color-error)">
        📵
      </button>
    </div>
  `;
  sidebar.appendChild(bar);
}

function toggleVoiceMute() {
  if (!voiceMicStream) return;
  const track = voiceMicStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  // Status bar'ı yenile (mute durumu değişti)
  updateVoiceStatusBar(Store.myVoiceChannelId);
  // Sidebar'daki katılımcı listesini güncelle (kendi ikonum değişir)
  if (Store.myVoiceChannelId) {
    renderVoiceSidebarParticipants(Store.myVoiceChannelId, Store.getVoiceParticipants(Store.myVoiceChannelId));
  }
  showToast(track.enabled ? 'Mikrofon açık' : 'Mikrofon kapalı', 'info');
}

// ── Sesli kanal kamera / ekran paylaşımı ─────────────────

async function toggleVoiceCamera() {
  if (!Store.myVoiceChannelId) return;

  if (voiceVideoEnabled) {
    voiceCamStream?.getTracks().forEach(t => t.stop());
    voiceCamStream = null;
    voiceVideoEnabled = false;
    removeVoiceVideoTile('__me__cam');
    for (const pc of Object.values(voicePeers)) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video' && !voiceScreenSharing);
      if (sender) pc.removeTrack(sender);
    }
    broadcastVoiceMeta('camera_off');
    showToast('Kamera kapatıldı', 'info');
  } else {
    try {
      voiceCamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      showToast('Kamera açılamadı', 'error');
      return;
    }
    voiceVideoEnabled = true;
    const videoTrack = voiceCamStream.getVideoTracks()[0];
    showVoiceVideoTile('__me__cam', voiceCamStream, false);
    for (const [uid, pc] of Object.entries(voicePeers)) {
      try {
        const existingSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (existingSender) {
          await existingSender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, voiceCamStream);
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        Socket.send('voice_signal', { channel_id: Store.myVoiceChannelId, target_user_id: uid, type: 'offer', data: offer });
      } catch (e) { console.error('Kamera renegotiation:', e); }
    }
    broadcastVoiceMeta('camera_on');
    showToast('Kamera açıldı 📹', 'success');
  }
  updateVoiceStatusBar(Store.myVoiceChannelId);
}

async function startVoiceScreenShare() {
  if (!Store.myVoiceChannelId) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('Tarayıcınız ekran paylaşımını desteklemiyor', 'error');
    return;
  }
  try {
    voiceScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, cursor: 'always' },
      audio: false,
    });
  } catch (e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') showToast('Ekran paylaşımı başlatılamadı', 'error');
    return;
  }
  voiceScreenSharing = true;
  const screenTrack = voiceScreenStream.getVideoTracks()[0];
  showVoiceVideoTile('__me__screen', voiceScreenStream, true);

  for (const [uid, pc] of Object.entries(voicePeers)) {
    try {
      const existingSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (existingSender) {
        await existingSender.replaceTrack(screenTrack);
      } else {
        pc.addTrack(screenTrack, voiceScreenStream);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      Socket.send('voice_signal', { channel_id: Store.myVoiceChannelId, target_user_id: uid, type: 'offer', data: offer });
    } catch (e) { console.error('Ekran paylaşımı renegotiation:', e); }
  }
  broadcastVoiceMeta('screen_share_on');
  showToast('Ekran paylaşımı başlatıldı 🖥️', 'success');
  updateVoiceStatusBar(Store.myVoiceChannelId);
  screenTrack.addEventListener('ended', () => stopVoiceScreenShare());
}

function stopVoiceScreenShare() {
  if (!voiceScreenSharing) return;
  voiceScreenStream?.getTracks().forEach(t => t.stop());
  voiceScreenStream = null;
  voiceScreenSharing = false;
  removeVoiceVideoTile('__me__screen');
  for (const [uid, pc] of Object.entries(voicePeers)) {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      if (voiceVideoEnabled && voiceCamStream) {
        sender.replaceTrack(voiceCamStream.getVideoTracks()[0]).catch(() => {});
      } else {
        pc.removeTrack(sender);
      }
    }
  }
  broadcastVoiceMeta('screen_share_off');
  showToast('Ekran paylaşımı durduruldu', 'info');
  updateVoiceStatusBar(Store.myVoiceChannelId);
}

function broadcastVoiceMeta(metaType) {
  if (!Store.myVoiceChannelId) return;
  Socket.send('voice_meta', { channel_id: Store.myVoiceChannelId, meta_type: metaType });
}

function showVoiceVideoTile(tileId, stream, isScreen) {
  let panel = document.getElementById('voice-video-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'voice-video-panel';
    panel.style.cssText = `
      position:fixed;bottom:170px;right:16px;
      display:flex;flex-direction:column;gap:8px;
      z-index:1000;max-height:65vh;overflow-y:auto;
    `;
    document.body.appendChild(panel);
  }

  // Tile zaten varsa sadece stream'i güncelle
  const existing = document.getElementById(`voice-video-tile-${tileId}`);
  if (existing) {
    const vid = existing.querySelector('video');
    if (vid) vid.srcObject = stream;
    return;
  }

  const isMine = tileId.startsWith('__me__');
  const displayName = isMine
    ? (tileId === '__me__screen' ? (Store.user?.username || 'Ben') + ' (Ekran)' : (Store.user?.username || 'Ben'))
    : (Store.getUsername(tileId) || tileId.slice(0, 6));

  const w = isScreen ? 320 : 180;
  const tile = document.createElement('div');
  tile.id = `voice-video-tile-${tileId}`;
  tile.style.cssText = `
    position:relative;background:#000;border-radius:12px;overflow:hidden;
    width:${w}px;flex-shrink:0;
    border:2px solid ${isScreen ? 'var(--color-primary)' : 'var(--border-color)'};
    box-shadow:0 4px 24px rgba(0,0,0,0.5);
  `;
  const aspect = isScreen ? 56.25 : 75;
  tile.innerHTML = `
    <div style="position:relative;padding-top:${aspect}%">
      <video autoplay playsinline ${isMine ? 'muted' : ''}
             style="position:absolute;top:0;left:0;width:100%;height:100%;
                    object-fit:${isScreen ? 'contain' : 'cover'}"></video>
      <div style="position:absolute;bottom:5px;left:8px;
                  background:rgba(0,0,0,0.65);color:#fff;padding:2px 8px;
                  border-radius:99px;font-size:11px;font-weight:600;pointer-events:none">
        ${isScreen ? '🖥️ ' : ''}${displayName}
      </div>
      ${isMine && isScreen ? `
        <button onclick="stopVoiceScreenShare()"
                style="position:absolute;top:6px;right:8px;background:var(--color-error);
                       color:#fff;border:none;border-radius:8px;padding:3px 8px;
                       font-size:11px;cursor:pointer;font-weight:600">■ Durdur</button>
      ` : ''}
    </div>
  `;
  const video = tile.querySelector('video');
  video.srcObject = stream;
  voiceVideos[tileId] = tile;
  panel.appendChild(tile);
}

function removeVoiceVideoTile(tileId) {
  const tile = document.getElementById(`voice-video-tile-${tileId}`);
  if (tile) tile.remove();
  delete voiceVideos[tileId];
  const panel = document.getElementById('voice-video-panel');
  if (panel && panel.children.length === 0) panel.remove();
}

// ── Sesli kanal WS olayları ──────────────────────────────
Socket.on('voice_participants', async ({ channel_id, user_ids }) => {
  if (channel_id !== Store.myVoiceChannelId) return;
  for (const uid of user_ids) {
    if (uid !== Store.user.id) {
      Store.addVoiceParticipant(channel_id, uid);
      await sendVoiceOffer(channel_id, uid);
    }
  }
  renderVoiceSidebarParticipants(channel_id, Store.getVoiceParticipants(channel_id));
});

Socket.on('voice_user_joined', ({ channel_id, user_id }) => {
  if (channel_id !== Store.myVoiceChannelId) return;
  if (user_id === Store.user.id) return;
  Store.addVoiceParticipant(channel_id, user_id);
  renderVoiceSidebarParticipants(channel_id, Store.getVoiceParticipants(channel_id));
  showToast(`${Store.getUsername(user_id) || 'Biri'} sesli kanala katıldı 🎙️`, 'info');
});

Socket.on('voice_user_left', ({ channel_id, user_id }) => {
  cleanupVoicePeer(user_id, channel_id);
  renderVoiceSidebarParticipants(channel_id, Store.getVoiceParticipants(channel_id));
  showToast(`${Store.getUsername(user_id) || 'Biri'} sesli kanaldan ayrıldı`, 'info');
});

Socket.on('voice_signal', async ({ channel_id, from_user_id, type, data }) => {
  if (channel_id !== Store.myVoiceChannelId) return;

  if (type === 'offer') {
    const pc = getOrCreateVoicePeer(from_user_id, channel_id);
    await pc.setRemoteDescription(data);

    // Bekleyen ICE'ları temizle
    const pending = window._voiceIcePending?.[from_user_id] || [];
    for (const c of pending) await pc.addIceCandidate(c).catch(() => {});
    if (window._voiceIcePending) delete window._voiceIcePending[from_user_id];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    Socket.send('voice_signal', { channel_id, target_user_id: from_user_id, type: 'answer', data: answer });

  } else if (type === 'answer') {
    const pc = voicePeers[from_user_id];
    if (pc) {
      await pc.setRemoteDescription(data);
      const pending = window._voiceIcePending?.[from_user_id] || [];
      for (const c of pending) await pc.addIceCandidate(c).catch(() => {});
      if (window._voiceIcePending) delete window._voiceIcePending[from_user_id];
    }

  } else if (type === 'ice_candidate') {
    const pc = voicePeers[from_user_id];
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(data).catch(() => {});
    } else {
      if (!window._voiceIcePending) window._voiceIcePending = {};
      if (!window._voiceIcePending[from_user_id]) window._voiceIcePending[from_user_id] = [];
      window._voiceIcePending[from_user_id].push(data);
    }
  }
});

// ── Ekran paylaşımı ──────────────────────────────────────

async function startScreenShare(convId) {
  // Tarayıcı desteği kontrolü
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('Tarayıcınız ekran paylaşımını desteklemiyor', 'error');
    return;
  }

  try {
    // Ekranı yakala
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
        cursor: 'always',
      },
      audio: false, // sistem sesini istemiyoruz (güvenilmez)
    });

    // Mikrofonu da dene (opsiyonel — hata olsa bile devam et)
    let audioStream = null;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch { /* mikrofon yoksa önemli değil */ }

    // Eğer aktif bir P2P bağlantısı varsa, video track'i değiştir
    if (peerConnection && peerConnection.connectionState === 'connected') {
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(screenTrack);
        localStream = screenStream;
        showToast('Ekran paylaşımı başlatıldı', 'success');

        // Mevcut modal varsa güncelle
        const statusEl = document.getElementById('call-status');
        if (statusEl) statusEl.textContent = '🖥️ Ekran paylaşılıyor';
        const endBtn = document.getElementById('end-call-btn');
        if (endBtn) endBtn.textContent = '🖥️ Paylaşımı Durdur';
      }

      screenTrack.addEventListener('ended', () => {
        endCall();
        showToast('Ekran paylaşımı durduruldu', 'info');
      });
      return;
    }

    // Yeni bağlantı — ekran + (varsa) ses
    localStream = new MediaStream();
    screenStream.getVideoTracks().forEach(t => localStream.addTrack(t));
    if (audioStream) audioStream.getAudioTracks().forEach(t => localStream.addTrack(t));

    showCallModal(convId, 'screen', true);

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

    peerConnection.onicecandidate = (ev) => {
      if (ev.candidate) Socket.send('call_signal', {
        conversation_id: convId,
        type: 'ice_candidate',
        data: ev.candidate,
      });
    };

    peerConnection.ontrack = (ev) => {
      const rv = document.getElementById('remote-video');
      if (rv) {
        rv.srcObject = ev.streams[0];
        rv.style.display = ''; // PIP'i görünür yap
      }
    };

    // Bağlantı durumu değişince status güncelle
    peerConnection.onconnectionstatechange = () => {
      const statusEl = document.getElementById('call-status');
      if (!statusEl) return;
      if (peerConnection.connectionState === 'connected') {
        statusEl.textContent = '🖥️ Ekran paylaşılıyor';
      } else if (peerConnection.connectionState === 'failed') {
        statusEl.textContent = '⚠️ Bağlantı kesildi';
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    Socket.send('call_signal', {
      conversation_id: convId,
      type: 'offer',
      data: offer,
      call_type: 'screen',
    });

    // Tarayıcının natif "Paylaşımı Durdur" butonuna basınca otomatik kapat
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      endCall();
      showToast('Ekran paylaşımı durduruldu', 'info');
    });

  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      // Kullanıcı iptal etti — sessizce geç
      return;
    }
    console.error('Ekran paylaşımı hatası:', err);
    showToast('Ekran paylaşımı başlatılamadı: ' + (err.message || ''), 'error');
  }
}

function toggleScreenAudio() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    showToast('Mikrofon bulunamadı', 'error');
    return;
  }
  audioTrack.enabled = !audioTrack.enabled;
  const btn = document.getElementById('screen-mic-btn');
  if (btn) btn.textContent = audioTrack.enabled ? '🎤 Ses' : '🔇 Sessiz';
}

// Sesli kanal meta olayları (kamera/ekran paylaşımı bildirimleri)
Socket.on('voice_meta', ({ channel_id, from_user_id, meta_type }) => {
  if (channel_id !== Store.myVoiceChannelId) return;
  const name = Store.getUsername(from_user_id) || 'Biri';
  if (meta_type === 'screen_share_on') {
    showToast(`${name} ekranını paylaşıyor 🖥️`, 'info');
  } else if (meta_type === 'screen_share_off') {
    showToast(`${name} ekran paylaşımını durdurdu`, 'info');
    removeVoiceVideoTile(from_user_id);
  } else if (meta_type === 'camera_on') {
    showToast(`${name} kamerasını açtı 📹`, 'info');
  } else if (meta_type === 'camera_off') {
    showToast(`${name} kamerasını kapattı`, 'info');
    removeVoiceVideoTile(from_user_id);
  }
});

// WebRTC sinyal mesajlarını dinle
Socket.on('call_signal', async (data) => {
  if (!data) return;

  if (data.type === 'offer') {
    // confirm yerine custom modal fonksiyonunu çağırıyoruz ve 
    // kullanıcı "Cevapla" dediğinde çalışacak tüm WebRTC mantığını callback olarak geçiyoruz.
    showIncomingCall(data, async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: data.call_type === 'video',
        });

        showCallModal(data.conversation_id, data.call_type, false);

        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            Socket.send('call_signal', {
              conversation_id: data.conversation_id,
              type: 'ice_candidate',
              data: event.candidate,
            });
          }
        };

        peerConnection.ontrack = (event) => {
          const remoteVideo = document.getElementById('remote-video');
          if (remoteVideo) remoteVideo.srcObject = event.streams[0];
        };

        // 1. Remote Description'ı ayarla
        await peerConnection.setRemoteDescription(data.data);

        // 2. Kural: Remote description başarıyla set edildiği için, 
        // bu süreçte arkada birikmiş (bekleyen) ICE adayları varsa onları hemen erit.
        if (window._pendingCandidates && window._pendingCandidates.length > 0) {
          for (const candidate of window._pendingCandidates) {
            await peerConnection.addIceCandidate(candidate).catch(err => 
              console.error("Bekleyen ICE eklenirken hata oluştu:", err)
            );
          }
          window._pendingCandidates = []; // Sırayı temizle
        }

        // 3. Cevap (Answer) oluştur ve gönder
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        Socket.send('call_signal', {
          conversation_id: data.conversation_id,
          type: 'answer',
          data: answer,
        });
      } catch (error) {
        console.error("Arama cevaplanırken bir hata oluştu:", error);
      }
    });

  } else if (data.type === 'answer') {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(data.data);

      // Offerer (Aramayı başlatan) tarafında da remote description set edildi.
      // Eğer bu esnada bekleyen ICE adayı biriktiyse onları da eritelim:
      if (window._pendingCandidates && window._pendingCandidates.length > 0) {
        for (const candidate of window._pendingCandidates) {
          await peerConnection.addIceCandidate(candidate).catch(err => 
            console.error("Bekleyen ICE eklenirken hata oluştu:", err)
          );
        }
        window._pendingCandidates = [];
      }

      const statusEl = callModal?.querySelector('div:last-child');
      if (statusEl) statusEl.textContent = 'Bağlandı ✓';
    }

  } else if (data.type === 'ice_candidate') {
    if (peerConnection && peerConnection.remoteDescription) {
      // Bağlantı kurulduysa veya remote description hazırsa direkt ekle
      await peerConnection.addIceCandidate(data.data).catch(console.error);
    } else if (peerConnection) {
      // Sinyalizasyon henüz tamamlanmadıysa (remoteDescription yoksa) adayı hafızaya al
      if (!window._pendingCandidates) window._pendingCandidates = [];
      window._pendingCandidates.push(data.data);
    }
  }
});