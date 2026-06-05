// ── Orbit — Router ────────────────────────────
// Hash tabanlı SPA router — #/login, #/chat, vb.

const Router = {
  _routes: {},
  _current: null,

  register(path, handler) {
    this._routes[path] = handler;
  },

  navigate(path) {
    window.location.hash = `#/${path}`;
  },

  async init() {
    window.addEventListener('hashchange', () => this._resolve());

    // Sayfa açılışında refresh token varsa access token yenile
    if (Store.refreshToken && !Store.accessToken) {
      const ok = await Api.refresh();
      if (!ok) {
        Store.clearAuth();
      }
    }

    this._resolve();
  },

  _resolve() {
    const hash = window.location.hash.replace('#/', '') || 'login';
    const [path] = hash.split('?');

    if (path !== 'login' && path !== 'register' && !Store.isLoggedIn()) {
      this.navigate('login');
      return;
    }

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
