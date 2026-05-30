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
  document.getElementById('app').innerHTML = `
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="avatar">${Store.user?.username?.[0]?.toUpperCase() || 'U'}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${Store.user?.username || ''}</div>
          <div style="font-size:12px;color:var(--color-success)">Çevrimiçi</div>
        </div>
        <button class="btn-icon" id="logout-btn" title="Çıkış">⏻</button>
      </div>
      <div class="sidebar-search">
        <input class="input" type="text" placeholder="Ara..." id="search-input" />
      </div>
      <div class="sidebar-list" id="conv-list">
        <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px)">
          Yükleniyor...
        </div>
      </div>
    </div>

    <div style="flex:1;display:flex;flex-direction:column;height:100vh;" id="chat-area">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">💬</div>
          <div>Bir sohbet seç</div>
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

  // WebSocket mesaj dinleyici
  Socket.on('new_message', (msg) => {
    if (msg.conversation_id === Store.activeConvId) {
      appendMessage(msg);
    }
  });

  // Sohbetleri yükle
  loadConversations();
}

async function loadConversations() {
  try {
    const data = await Api.getConversations();
    const convs = data?.conversations || [];
    Store.setConversations(convs);
    renderConvList(convs);
  } catch {
    // Chat endpoint'leri henüz hazır değil — boş göster
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

  document.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === convId);
  });

  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = `
    <div class="chat-header">
      <div class="avatar">S</div>
      <div class="chat-header-info">
        <h3>Sohbet</h3>
        <span>Çevrimiçi</span>
      </div>
    </div>
    <div class="message-list" id="message-list"></div>
    <div class="message-input-bar">
      <textarea class="message-input" id="msg-input" placeholder="Mesaj yaz..." rows="1"></textarea>
      <button class="btn btn-primary" id="send-btn">Gönder</button>
    </div>
  `;

  // Mesaj gönder
  const sendBtn  = document.getElementById('send-btn');
  const msgInput = document.getElementById('msg-input');

  sendBtn.addEventListener('click', () => sendMessage(convId, msgInput));
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(convId, msgInput);
    }
  });

  // Geçmiş mesajları yükle
  try {
    const data = await Api.getMessages(convId);
    const msgs = data?.messages || [];
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

  const el = document.createElement('div');
  el.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
  el.innerHTML = `
    ${msg.content}
    <span class="message-time">${time}</span>
  `;

  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
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