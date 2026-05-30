// ── Cengsta Paradise — Ana uygulama ──────────────────────

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

// ── Chat sayfası ──────────────────────────────────────
function renderChat() {
  Socket.connect();

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

      <!-- Kullanıcı arama paneli (gizli) -->
      <div id="search-panel" class="hidden" style="padding:12px 16px;border-bottom:1px solid var(--border-color);background:var(--bg-elevated)">
        <input class="input" type="text" id="user-search-input" placeholder="Kullanıcı adı veya telefon ara..." />
        <div id="search-results" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto"></div>
      </div>

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

  // Yeni sohbet butonu
  document.getElementById('new-chat-btn').addEventListener('click', () => {
    const panel = document.getElementById('search-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      document.getElementById('user-search-input').focus();
    }
  });

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

  loadConversations();
}

async function searchUsers(q) {
  const results = document.getElementById('search-results');
  results.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px">Aranıyor...</div>';

  try {
    const data = await Api.get(`/auth/search?q=${encodeURIComponent(q)}`);
    const users = data?.users || [];

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
    Store.setConversations(convs);
    renderConvList(convs);

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

  list.innerHTML = convs.map(conv => `
    <div class="conv-item" data-id="${conv.id}">
      <div class="avatar">${(conv.name || '?')[0].toUpperCase()}</div>
      <div class="conv-info">
        <div class="conv-name">${conv.name || 'Sohbet'}</div>
        <div class="conv-preview">Son mesaj...</div>
      </div>
      <div class="conv-meta">
        <div class="conv-time">--:--</div>
      </div>
    </div>
  `).join('');

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

  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = `
    <div class="chat-header">
      <div class="avatar">${convId.slice(0,1).toUpperCase()}</div>
      <div class="chat-header-info">
        <h3>Sohbet</h3>
        <span id="typing-indicator" style="color:var(--color-success)">Çevrimiçi</span>
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
    clearTimeout(window._typingClear);
    window._typingClear = setTimeout(() => {
      el.textContent = 'Çevrimiçi';
      el.style.color = 'var(--color-success)';
    }, 2000);
  };
  Socket.on('typing', window._typingHandler);

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

  input.value = '';

  // Optimistik güncelleme — hemen göster
  const tempMsg = {
    id:              'temp-' + Date.now(),
    conversation_id: convId,
    sender_id:       Store.user.id,
    content,
    type:            'text',
    status:          'sent',
    created_at:      new Date().toISOString(),
  };
  appendMessage(tempMsg);

  try {
    await Api.sendMessage(convId, content);
  } catch (err) {
    console.error('Mesaj gönderilemedi:', err);
  }
}

function appendMessage(msg) {
  const list = document.getElementById('message-list');
  if (!list) return;

  const isSent = msg.sender_id === Store.user?.id;
  const time   = new Date(msg.created_at).toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit',
  });

  let statusIcon = '';
  if (isSent) {
    if (msg.status === 'read')           statusIcon = '<span style="color:#7F77DD">✓✓</span>';
    else if (msg.status === 'delivered') statusIcon = '<span style="color:#aaa">✓✓</span>';
    else                                 statusIcon = '<span style="color:#aaa">✓</span>';
  }

  // İçerik türüne göre render
  let content = '';
  const msgType = msg.type || 'text';
  if (msgType === 'image') {
    content = `<img src="${msg.content}" style="max-width:100%;border-radius:8px;display:block;margin-bottom:4px" />`;
  } else if (msgType === 'file') {
    content = `<a href="${msg.content}" target="_blank" style="color:var(--color-primary-light)">📎 Dosya</a>`;
  } else {
    content = msg.content;
  }

  const el = document.createElement('div');
  el.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
  el.dataset.msgId = msg.id;
  el.innerHTML = `
    ${content}
    <span class="message-time">${time} ${statusIcon}</span>
  `;

  list.appendChild(el);
  list.scrollTop = list.scrollHeight;

  if (!isSent && msg.id && !msg.id.startsWith('temp-')) {
    Api.post(`/chat/conversations/${msg.conversation_id}/messages/${msg.id}/read`, {
      user_id: Store.user.id,
    }).catch(() => {});
  }
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
  document.getElementById('app').innerHTML = `
    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">🔵</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px">Durum</div>
        <div style="font-size:13px">Yakında geliyor</div>
      </div>
    </div>
  `;
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