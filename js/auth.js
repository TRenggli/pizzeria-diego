/* ==========================================================================
   PZ.auth — ingreso con usuario y contraseña, roles y permisos
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  const SESSION_KEY = 'pz-session';

  const ROLES = {
    admin: { label: 'Administrador', can: ['*'] },
    cajero: { label: 'Cajero/a', can: ['inicio', 'vender', 'pedidos', 'caja', 'clientes', 'historial', 'stock'] },
    cocina: { label: 'Cocina', can: ['pedidos'] },
    delivery: { label: 'Delivery', can: ['pedidos'] },
  };

  const A = (PZ.auth = {
    ROLES,
    current: null,

    restore() {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      try {
        const s = JSON.parse(raw);
        if (s.exp && s.exp < Date.now()) { A.logout(); return null; }
        const u = PZ.store.user(s.userId);
        if (u && u.active) A.current = u;
      } catch (e) { /* sesión corrupta */ }
      return A.current;
    },

    async login(username, password, remember) {
      const lockUntil = Number(localStorage.getItem('pz-lock') || 0);
      if (lockUntil > Date.now()) {
        const s = Math.ceil((lockUntil - Date.now()) / 1000);
        throw new Error(`Demasiados intentos. Esperá ${s} segundos.`);
      }
      const u = PZ.store.data.users.find((x) => x.username.toLowerCase() === String(username).trim().toLowerCase() && x.active);
      const hash = await U.sha256(password);
      if (!u || u.passHash !== hash) {
        const fails = Number(localStorage.getItem('pz-fails') || 0) + 1;
        localStorage.setItem('pz-fails', fails);
        if (fails >= 5) {
          localStorage.setItem('pz-lock', Date.now() + 60000);
          localStorage.setItem('pz-fails', 0);
        }
        throw new Error('Usuario o contraseña incorrectos');
      }
      localStorage.setItem('pz-fails', 0);
      A.current = u;
      const sess = JSON.stringify({ userId: u.id, exp: Date.now() + (remember ? 30 : 1) * 864e5 });
      if (remember) localStorage.setItem(SESSION_KEY, sess);
      else sessionStorage.setItem(SESSION_KEY, sess);
      u.lastLogin = Date.now();
      PZ.store.log('ingreso', `${u.name} ingresó al sistema`);
      PZ.store.save();
      return u;
    },

    logout() {
      A.current = null;
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    },

    can(section) {
      if (!A.current) return false;
      const r = ROLES[A.current.role];
      return !!r && (r.can.includes('*') || r.can.includes(section));
    },

    isAdmin: () => A.current && A.current.role === 'admin',

    /** Pide la clave de un administrador (para anular, descuentos grandes, etc.) */
    async requireAdmin(reason = 'Esta acción requiere autorización') {
      if (A.isAdmin()) return true;
      const pass = await PZ.prompt('Contraseña de un administrador', { title: reason, type: 'password', ok: 'Autorizar' });
      if (pass == null) return false;
      const hash = await U.sha256(pass);
      const ok = PZ.store.data.users.some((u) => u.role === 'admin' && u.active && u.passHash === hash);
      if (!ok) PZ.toast('Contraseña de administrador incorrecta', 'err');
      return ok;
    },
  });
})(window.PZ);
