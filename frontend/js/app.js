// ── Cengsta Paradise — Ana uygulama ──────────────────────

async function setupPushNotifications() {
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

  // ── Route'ları kaydet ────────────────────────────────
  Router.register('login',    renderLogin);
  Router.register('register', renderRegister);
  Router.register('chat',     renderChat);
  Router.register('calls',    renderCalls);
  Router.register('status',   renderStatus);
  Router.register('404',      render404);

  // Router'ı başlat
  Router.init();
});

// ── Login sayfası ─────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <h1>Cengsta Paradise</h1>
          <p>Güvenli mesajlaşma platformu</p>
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
          <div id="login-error" class="hidden" style="color:var(--color-error);font-size:13px;text-align:center;"></div>
        </form>
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
      errEl.textContent = err.message || 'Giriş başarısız';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Giriş yap';
    }
  });
}

// ── Kayıt sayfası ─────────────────────────────────────
function renderRegister() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <h1>Cengsta Paradise</h1>
          <p>Hesap oluştur</p>
        </div>
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
          <div id="reg-error" class="hidden" style="color:var(--color-error);font-size:13px;text-align:center;"></div>
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
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="avatar">${Store.user?.username?.[0]?.toUpperCase() || 'U'}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${Store.user?.username || ''}</div>
          <div style="font-size:12px;color:var(--color-success)">Çevrimiçi</div>
        </div>
        <button class="btn-icon" id="new-chat-btn" title="Yeni sohbet">+</button>
        <button class="btn-icon" id="logout-btn" title="Çıkış">⏻</button>
      </div>

      <div id="search-panel" class="hidden" style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:var(--bg-elevated)">
        <input class="input" type="text" id="user-search-input" placeholder="Kullanıcı adı veya telefon ara..." />
        <div id="search-results" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto"></div>
      </div>

      <!-- Story halkaları -->
      <div id="story-bar" style="display:flex;gap:12px;overflow-x:auto;padding:10px 16px;border-bottom:1px solid var(--border-color);scrollbar-width:none"></div>

      <div class="sidebar-search">
        <input class="input" type="text" placeholder="Ara..." id="search-input" />
      </div>
      <div class="sidebar-list" id="conv-list">
        <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
          Yükleniyor...
        </div>
      </div>
    </div>

    <div style="flex:1;display:flex;flex-direction:column;height:100vh;" id="chat-area">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">💬</div>
          <div>Bir sohbet seç veya yeni sohbet başlat</div>
        </div>
      </div>
    </div>
  `;

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

  // WebSocket mesaj dinleyici
  Socket.on('new_message', (msg) => {
    if (msg.conversation_id === Store.activeConvId) {
      appendMessage(msg);
    }
  });

  Socket.off('presence', window._presenceHandler);
  window._presenceHandler = ({ user_id, online }) => updatePresenceIndicator(user_id, online);
  Socket.on('presence', window._presenceHandler);

  Socket.off('online_users', window._onlineUsersHandler);
  window._onlineUsersHandler = ({ user_ids }) =>
    (user_ids || []).forEach(id => updatePresenceIndicator(id, true));
  Socket.on('online_users', window._onlineUsersHandler);

  loadConversations();
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
      <div class="conv-item" data-uid="${u.id}" data-uname="${u.username}" style="cursor:pointer;border-radius:8px">
        <div class="avatar avatar-sm">${u.username[0].toUpperCase()}</div>
        <div class="conv-info">
          <div class="conv-name">${u.username}</div>
          <div class="conv-preview">${u.phone}</div>
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
    console.error('Sohbet oluşturulamadı:', e);
  }
}
async function loadConversations() {
  try {
    const userId = Store.user && Store.user.id;
    if (!userId) return;
    const data = await Api.getConversations();
    const convs = data?.conversations || [];
    // other_user_id geliyorsa userMap'e ekle
    convs.forEach(c => {
      if (c.other_user_id && c.name) Store.addUser(c.other_user_id, c.name);
    });
    Store.setConversations(convs);
    renderConvList(convs);
    loadStoryBar(convs);

    // WS'e katılım bildir
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
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
        Henüz sohbet yok
      </div>
    `;
    return;
  }

  list.innerHTML = convs.map(conv => {
    const otherId = conv.type === 'direct' ? (conv.other_user_id || Store.getUserId(conv.name)) : null;
    const online  = otherId ? Store.isOnline(otherId) : false;
    const dot     = otherId
      ? `<div class="presence-dot${online ? ' online' : ''}"></div>`
      : '';
    return `
      <div class="conv-item" data-id="${conv.id}"${otherId ? ` data-other-user-id="${otherId}"` : ''}>
        <div class="avatar-wrap">
          <div class="avatar">${(conv.name || '?')[0].toUpperCase()}</div>
          ${dot}
        </div>
        <div class="conv-info">
          <div class="conv-name">${conv.name || 'Sohbet'}</div>
          <div class="conv-preview">Son mesaj...</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">--:--</div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', () => openConversation(el.dataset.id));
  });
}

async function openConversation(convId) {
  Store.setActiveConv(convId);
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
  chatArea.innerHTML = `
    <div id="chat-header" class="chat-header"${otherId ? ` data-other-user-id="${otherId}"` : ''}>
      <div class="avatar">${convName[0].toUpperCase()}</div>
      <div class="chat-header-info">
        <h3>${convName}</h3>
        <span id="typing-indicator" style="color:${presenceColor}">${presenceTxt}</span>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn-icon" id="call-btn" title="Sesli arama">📞</button>
        <button class="btn-icon" id="video-btn" title="Görüntülü arama">📹</button>
      </div>
    </div>
    <div class="message-list" id="message-list"></div>
    <div class="message-input-bar">
      <label class="btn-icon" title="Dosya gönder" style="cursor:pointer">
        📎
        <input type="file" id="file-input" style="display:none" accept="image/*,video/*,.pdf,.doc,.docx" />
      </label>
      <textarea class="message-input" id="msg-input" placeholder="Mesaj yaz..." rows="1"></textarea>
      <button class="btn btn-primary" id="send-btn">Gönder</button>
    </div>
  `;

  const sendBtn  = document.getElementById('send-btn');
  const msgInput = document.getElementById('msg-input');

  sendBtn.addEventListener('click', () => sendMessage(convId, msgInput));
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(convId, msgInput);
    }
  });


  // Dosya gönder
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8080/api/v1/media/upload', {
        method: 'POST',
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

  // Çevrimdışıysa son görülmeyi çek
  if (otherId && !isOnline) {
    Api.get(`/auth/users/${otherId}`).then(data => {
      const el = document.getElementById('typing-indicator');
      if (el && !el.dataset.typing) {
        el.textContent = formatLastSeen(data?.user?.last_seen);
      }
    }).catch(() => {});
  }

  // Geçmiş mesajları yükle
  try {
    const data = await Api.getMessages(convId);
    const msgs = (data?.messages || []).reverse();
    Store.setMessages(convId, msgs);
    msgs.forEach(appendMessage);
  } catch {}
}

async function sendMessage(convId, input) {
  const content = input.value.trim();
  if (!content) return;

  // Edit modu
  if (input.dataset.editingId) {
    const msgId   = input.dataset.editingId;
    const editConvId = input.dataset.editingConvId || convId;
    input.value = '';
    delete input.dataset.editingId;
    delete input.dataset.editingConvId;
    document.getElementById('edit-preview')?.remove();
    applyMessageEdit(msgId, content);
    await Api.post(`/chat/conversations/${editConvId}/messages/${msgId}/edit`, {
      user_id: Store.user.id, content,
    }).catch(() => {});
    return;
  }

  input.value = '';
  const replyToId = replyToMsg?.id || '';
  const replyToContent = replyToMsg?.content || '';
  clearReply();

  const tempMsg = {
    id:               'temp-' + Date.now(),
    conversation_id:  convId,
    sender_id:        Store.user.id,
    content,
    type:             'text',
    status:           'sent',
    created_at:       new Date().toISOString(),
    reply_to_id:      replyToId,
    reply_to_content: replyToContent,
  };
  appendMessage(tempMsg);

  try {
    await Api.post('/chat/conversations/' + convId + '/messages', {
      sender_id:    Store.user.id,
      content,
      type:         'text',
      reply_to_id:  replyToId,
    });
  } catch (err) {
    console.error('Mesaj gönderilemedi:', err);
  }
}

function appendMessage(msg) {
  const list = document.getElementById('message-list');
  if (!list) return;

  const isSent = msg.sender_id === Store.user?.id;
  const time = new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  let statusIcon = '';
  if (isSent) {
    if (msg.status === 'read')           statusIcon = '<span style="color:#7F77DD">✓✓</span>';
    else if (msg.status === 'delivered') statusIcon = '<span style="color:#aaa">✓✓</span>';
    else                                 statusIcon = '<span style="color:#aaa">✓</span>';
  }

  const msgType = msg.type || 'text';
  let content = msgType === 'image' ? '<img src="' + msg.content + '" style="max-width:100%;border-radius:8px;display:block;margin-bottom:4px" />' :
                msgType === 'file'  ? '<a href="' + msg.content + '" target="_blank" style="color:var(--color-primary-light)">📎 Dosya</a>' :
                msg.content;

  // Reply preview
  let replyHTML = '';
  if (msg.reply_to_id && msg.reply_to_content) {
    replyHTML = `<div style="border-left:3px solid var(--color-primary);padding:4px 8px;margin-bottom:6px;font-size:12px;color:var(--text-secondary);border-radius:0 4px 4px 0;background:rgba(127,119,221,0.1)">${msg.reply_to_content}</div>`;
  }

  const el = document.createElement('div');
  el.className = 'message-bubble ' + (isSent ? 'sent' : 'received');
  el.dataset.msgId = msg.id;
  el.dataset.content = msg.content;
  const contentHtml = msg.deleted
    ? '<em style="color:var(--text-muted)">Bu mesaj silindi.</em>'
    : replyHTML + '<span class="msg-text">' + content + '</span>';
  el.innerHTML = contentHtml + '<span class="message-time">' + time + ' ' + statusIcon + (msg.edited_at ? ' <span style="font-size:10px;color:var(--text-muted)">(düzenlendi)</span>' : '') + '</span>';

  // Emoji tepki butonu
  const reactBar = document.createElement('div');
  reactBar.style.cssText = 'display:none;position:absolute;' + (isSent ? 'left:-120px' : 'right:-120px') + ';top:0;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:99px;padding:4px 8px;display:flex;gap:4px;font-size:16px;cursor:pointer;box-shadow:var(--shadow-sm)';
  reactBar.innerHTML = ['👍','❤️','😂','😮','😢','🔥'].map(e =>
    '<span class="emoji-btn" data-emoji="' + e + '" style="cursor:pointer;padding:2px 4px;border-radius:4px" onmouseover="this.style.background=\'var(--bg-overlay)\'" onmouseout="this.style.background=\'transparent\'">' + e + '</span>'
  ).join('');

  const wrapper = document.createElement('div');
  wrapper.className = 'message';
  wrapper.dataset.id = msg.id;
  wrapper.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:' + (isSent ? 'flex-end' : 'flex-start') + ';margin-bottom:2px';
  wrapper.appendChild(el);

  // Reactions display
  const reactionsEl = document.createElement('div');
  reactionsEl.className = 'msg-reactions';
  reactionsEl.dataset.msgId = msg.id;
  reactionsEl.id = 'reactions-' + msg.id;
  reactionsEl.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;' + (isSent ? 'justify-content:flex-end' : '');
  wrapper.appendChild(reactionsEl);

  list.appendChild(wrapper);
  list.scrollTop = list.scrollHeight;

  // Hover ile tepki ve yanıt menüsü
  el.addEventListener('mouseenter', () => {
    el.style.cursor = 'pointer';
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMessageMenu(e, msg, el);
  });

  if (!isSent && msg.id && !msg.id.startsWith('temp-')) {
    Api.post('/chat/conversations/' + msg.conversation_id + '/messages/' + msg.id + '/read', {
      user_id: Store.user.id,
    }).catch(() => {});
  }
}

function showMessageMenu(e, msg, el) {
  document.querySelectorAll('.msg-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'msg-menu';
  menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:10px;padding:6px;z-index:1000;min-width:160px;box-shadow:var(--shadow-md)';

  const isMine = msg.sender_id === Store.user?.id;
  const emojis = ['👍','❤️','😂','😮','😢','🔥'];
  menu.innerHTML = `
    <div style="display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid var(--border-color);margin-bottom:4px">
      ${emojis.map(em => '<span data-emoji="' + em + '" style="font-size:20px;cursor:pointer;padding:2px 4px;border-radius:4px" onmouseover="this.style.background=\'var(--bg-overlay)\'" onmouseout="this.style.background=\'transparent\'">' + em + '</span>').join('')}
    </div>
    <div class="menu-item" id="menu-reply" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">↩️ Yanıtla</div>
    <div class="menu-item" id="menu-copy" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">📋 Kopyala</div>
    ${isMine && !msg.deleted ? `<div class="menu-item" id="menu-edit" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">✏️ Düzenle</div>` : ''}
    ${isMine && !msg.deleted ? `<div class="menu-item" id="menu-delete" style="padding:8px 12px;cursor:pointer;border-radius:6px;font-size:13px;color:var(--color-danger)" onmouseover="this.style.background='var(--bg-overlay)'" onmouseout="this.style.background='transparent'">🗑️ Sil</div>` : ''}
  `;

  document.body.appendChild(menu);

  // Emoji tepki
  menu.querySelectorAll('[data-emoji]').forEach(btn => {
    btn.addEventListener('click', () => {
      menu.remove();
      addReactionToMessage(msg.id, btn.dataset.emoji, Store.user.id);
    });
  });

  // Yanıtla
  document.getElementById('menu-reply')?.addEventListener('click', () => {
    menu.remove();
    setReplyTo(msg);
  });

  // Kopyala
  document.getElementById('menu-copy')?.addEventListener('click', () => {
    menu.remove();
    navigator.clipboard.writeText(msg.content).catch(() => {});
  });

  // Düzenle
  document.getElementById('menu-edit')?.addEventListener('click', () => {
    menu.remove();
    startEditMessage(msg);
  });

  // Sil
  document.getElementById('menu-delete')?.addEventListener('click', () => {
    menu.remove();
    deleteMessage(msg);
  });

  // Dışarı tıklayınca kapat
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 100);
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
  if (!confirm('Mesajı silmek istiyor musun?')) return;
  const convId = msg.conversation_id;
  await Api.post(`/chat/conversations/${convId}/messages/${msg.id}/delete`, {
    user_id: Store.user.id,
  }).catch(() => {});
  // UI güncelle (WS eventi de gelecek ama local da uygula)
  applyMessageDelete(msg.id);
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

function addReactionToMessage(msgId, emoji, userId) {
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
}

// Reply state
let replyToMsg = null;

function setReplyTo(msg) {
  replyToMsg = msg;
  const existing = document.getElementById('reply-preview');
  if (existing) existing.remove();

  const bar = document.querySelector('.message-input-bar');
  const preview = document.createElement('div');
  preview.id = 'reply-preview';
  preview.style.cssText = 'padding:8px 12px;background:var(--bg-elevated);border-left:3px solid var(--color-primary);margin:0 0 4px;border-radius:0 8px 8px 0;font-size:12px;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center';
  preview.innerHTML = '<span>↩️ ' + msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '') + '</span><button onclick="clearReply()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px">×</button>';
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

  callModal = document.createElement('div');
  callModal.id = 'call-modal';
  callModal.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.9);z-index:9999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  `;

  callModal.innerHTML = `
    <div style="position:relative;width:100%;max-width:640px;max-height:480px">
      <video id="remote-video" autoplay playsinline style="width:100%;border-radius:12px;background:#111"></video>
      <video id="local-video"  autoplay playsinline muted style="
        position:absolute;bottom:12px;right:12px;
        width:120px;border-radius:8px;background:#333;
      "></video>
    </div>
    <div style="display:flex;gap:16px;margin-top:16px">
      <button onclick="toggleMute()" class="btn btn-ghost" id="mute-btn">🎤 Ses</button>
      ${type === 'video' ? '<button onclick="toggleCamera()" class="btn btn-ghost" id="cam-btn">📹 Kamera</button>' : ''}
      <button onclick="endCall()" class="btn btn-danger">📵 Kapat</button>
    </div>
    <div style="color:#aaa;font-size:13px">${isCaller ? 'Bağlanıyor...' : 'Gelen arama...'}</div>
  `;

  document.body.appendChild(callModal);

  // Local video
  if (localStream) {
    document.getElementById('local-video').srcObject = localStream;
  }
}

function showIncomingCall(data) {
  const modal = document.createElement('div');
  modal.id = 'incoming-call-modal';
  modal.style.cssText = 'position:fixed;top:24px;right:24px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:16px;padding:20px 24px;z-index:9999;box-shadow:var(--shadow-lg);min-width:260px';
  modal.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px">
      📞 Gelen ${data.call_type === 'video' ? 'görüntülü' : 'sesli'} arama
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
      Birisi seni arıyor...
    </div>
    <div style="display:flex;gap:8px">
      <button id="accept-call" class="btn btn-primary" style="flex:1">✅ Cevapla</button>
      <button id="reject-call" class="btn btn-danger" style="flex:1">❌ Reddet</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('accept-call').addEventListener('click', async () => {
    modal.remove();
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: data.call_type === 'video',
      });
      showCallModal(data.conversation_id, data.call_type, false);
      peerConnection = new RTCPeerConnection(rtcConfig);
      localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

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
      };

      await peerConnection.setRemoteDescription(data.data);

      // Bekleyen ICE candidate'leri ekle
      if (window._pendingCandidates) {
        for (const c of window._pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        window._pendingCandidates = [];
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      Socket.send('call_signal', {
        conversation_id: data.conversation_id,
        type: 'answer',
        data: answer,
      });
    } catch (e) {
      console.error('Arama cevaplama hatası:', e);
    }
  });

  document.getElementById('reject-call').addEventListener('click', () => {
    modal.remove();
  });

  // 30 saniye sonra otomatik kapat
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