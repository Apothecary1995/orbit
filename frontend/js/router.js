// ── Orbit — Router ────────────────────────────
// Hash tabanlı SPA router — #/login, #/chat, vb.

const Router = {
  _routes: {},
  _current: null,

  // Route kaydet
  register(path, handler) {
    this._routes[path] = handler;
  },

  // Sayfa yönlendir
  navigate(path) {
    window.location.hash = `#/${path}`;
  },

  // Hash değişikliğini dinle
  init() {
    window.addEventListener('hashchange', () => this._resolve());
    this._resolve(); // ilk yükleme
  },

  _resolve() {
    const hash = window.location.hash.replace('#/', '') || 'login';
    const [path] = hash.split('?');

    // Auth koruması — giriş yapmadan chat'e giremez
    if (path !== 'login' && path !== 'register' && !Store.isLoggedIn()) {
      this.navigate('login');
      return;
    }

    // Giriş yapılmışsa login sayfasına gitmesin
    if ((path === 'login' || path === 'register') && Store.isLoggedIn()) {
      this.navigate('chat');
      return;
    }

    const handler = this._routes[path] || this._routes['404'];
    if (handler) {
      this._current = path;
      handler();
    }
  },
};