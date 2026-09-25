/* ==========================================================================
   PZ.app — arranque, login, estructura de pantalla y navegación
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  const S = PZ.store;

  PZ.views = PZ.views || {};

  PZ.themes = [
    { id: 'margherita', name: 'Margherita', desc: 'Tomate, muzza y albahaca', sw: ['#d7263d', '#ffd166', '#2d6a4f'] },
    { id: 'pepperoni', name: 'Pepperoni', desc: 'Picante y ahumado', sw: ['#b3261e', '#ff8c42', '#f9c74f'] },
    { id: 'fugazzeta', name: 'Fugazzeta', desc: 'Cebolla dorada al horno', sw: ['#c98a1b', '#f6e7b4', '#7a8b3a'] },
    { id: 'cuatroquesos', name: 'Cuatro quesos', desc: 'Muzza, roquefort, provolone', sw: ['#d9a300', '#6c8ebf', '#fff6d6'] },
    { id: 'rucula', name: 'Rúcula y crudo', desc: 'Fresca y verde', sw: ['#3f7d20', '#e56b6f', '#f1e3b3'] },
    { id: 'napolitana', name: 'Napolitana', desc: 'Tomate, ajo y perejil', sw: ['#e63946', '#f1faee', '#1d3557'] },
    { id: 'horno', name: 'Horno de barro', desc: 'Modo oscuro, brasas', sw: ['#17110e', '#ff6b35', '#ffb347'] },
  ];

  const NAV = [
    { id: 'inicio', label: 'Inicio', icon: '🏠' },
    { id: 'vender', label: 'Vender', icon: '🍕' },
    { id: 'pedidos', label: 'Pedidos', icon: '🔥' },
    { id: 'caja', label: 'Caja', icon: '💰' },
    { id: 'historial', label: 'Ventas', icon: '🧾' },
    { id: 'clientes', label: 'Clientes', icon: '👥' },
    { id: 'menu', label: 'Menú y precios', icon: '📋' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'reportes', label: 'Reportes', icon: '📈' },
    { id: 'config', label: 'Configuración', icon: '⚙️' },
  ];

  let cleanup = null;
  let clockTimer = null;

  const App = (PZ.app = {
    applyTheme(id) {
      const t = id || (S.data && S.data.settings.theme) || 'margherita';
      document.documentElement.dataset.theme = t;
      document.documentElement.dataset.motion = S.data && S.data.settings.motion === false ? 'off' : 'on';
      const meta = document.querySelector('meta[name=theme-color]');
      const col = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      if (meta && col) meta.content = col;
    },

    setTheme(id) {
      S.data.settings.theme = id;
      S.save();
      App.applyTheme(id);
    },

    go(route) { location.hash = '#/' + route; },

    /* ===================== LOGIN ===================== */
    renderLogin() {
      clearInterval(clockTimer);
      const app = document.getElementById('app');
      const floaters = Array.from({ length: 22 }, (_, i) => {
        const kinds = ['pep', 'basil', 'olive', 'cheese', 'tomato'];
        const size = 14 + Math.random() * 26;
        return `<i class="${kinds[i % 5]}" style="left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${12 + Math.random() * 14}s;animation-delay:-${Math.random() * 20}s"></i>`;
      }).join('');
      const theme = S.data.settings.theme;
      app.innerHTML = `
        <div class="login">
          <div class="floaters">${floaters}</div>
          <form class="login-card" autocomplete="on">
            <div class="login-logo">${PZ.brandLogo(96)}</div>
            <h1>${U.esc(S.data.settings.business.name)}</h1>
            <p class="tag">Sistema de gestión · ¡a hornear!</p>
            <div class="err-msg hidden"></div>
            <label class="field"><span>Usuario</span><input name="user" autocomplete="username" autocapitalize="off" required autofocus></label>
            <label class="field"><span>Contraseña</span><input name="pass" type="password" autocomplete="current-password" required></label>
            <label class="check"><input type="checkbox" name="remember" checked> Recordarme en este dispositivo</label>
            <button class="btn primary lg block mt" type="submit">Ingresar 🍕</button>
            <div class="flavor-dots" title="Elegí el sabor del sistema">
              ${PZ.themes.map((t) => `<button type="button" class="flavor-dot ${t.id === theme ? 'on' : ''}" data-t="${t.id}" title="${t.name}" style="background:conic-gradient(${t.sw[0]} 0 50%, ${t.sw[1]} 50% 80%, ${t.sw[2]} 80%)"></button>`).join('')}
            </div>
            ${S.data.demo ? `<div class="demo-hint">🎬 <b>Modo demo.</b> Probá con <code data-u="diego" data-p="pizza123">diego / pizza123</code> (admin), <code data-u="caja" data-p="caja123">caja / caja123</code> o <code data-u="cocina" data-p="cocina123">cocina / cocina123</code>.</div>` : ''}
          </form>
        </div>`;
      const form = app.querySelector('form');
      const err = app.querySelector('.err-msg');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          await PZ.auth.login(form.user.value, form.pass.value, form.remember.checked);
          App.start();
        } catch (ex) {
          err.textContent = ex.message;
          err.classList.remove('hidden');
          err.style.animation = 'none';
          void err.offsetWidth;
          err.style.animation = '';
        } finally {
          btn.disabled = false;
        }
      });
      app.querySelectorAll('.flavor-dot').forEach((b) => b.addEventListener('click', () => {
        App.setTheme(b.dataset.t);
        app.querySelectorAll('.flavor-dot').forEach((x) => x.classList.toggle('on', x === b));
      }));
      app.querySelectorAll('.demo-hint code').forEach((c) => c.addEventListener('click', () => {
        form.user.value = c.dataset.u;
        form.pass.value = c.dataset.p;
      }));
    },

    /* ===================== SHELL ===================== */
    renderShell() {
      const u = PZ.auth.current;
      const b = S.data.settings.business;
      const items = NAV.filter((n) => PZ.auth.can(n.id));
      const bottom = items.slice(0, 4);
      const rest = items.slice(4);
      document.getElementById('app').innerHTML = `
        <div class="shell">
          <aside class="sidebar">
            <div class="brand">${PZ.brandLogo(44)}<div><b>${U.esc(b.name)}</b><small>Sistema de gestión</small></div></div>
            <nav class="nav">
              ${items.map((n) => `<a href="#/${n.id}" data-r="${n.id}"><span class="n-ico">${n.icon}</span>${n.label}${n.id === 'pedidos' ? '<span class="n-count hidden"></span>' : ''}</a>`).join('')}
            </nav>
            <div class="side-foot">
              <div style="opacity:.75">Conectado como</div>
              <b>${U.esc(u.name)}</b> · ${PZ.auth.ROLES[u.role].label}
              <button class="btn sm ghost block mt" data-a="logout" style="color:inherit;box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)">Cerrar sesión</button>
            </div>
          </aside>
          <div class="main">
            <header class="topbar">
              <h2><span class="t-ico"></span><span class="t-txt"></span></h2>
              <div class="spacer"></div>
              <button class="cash-chip" data-a="cash"></button>
              <span class="clock"></span>
              <button class="user-pill" data-a="user"><span class="avatar">${U.esc(u.name[0].toUpperCase())}</span><span class="u-name" style="font-weight:800;padding-right:6px">${U.esc(u.name)}</span></button>
              <svg class="drip" viewBox="0 0 1200 14" preserveAspectRatio="none">
                <path d="M0 0H1200V3H0Z"/>
                <path class="d" d="M120 2 q8 0 8 7 q0 5 -8 5 q-8 0 -8 -5 q0 -7 8 -7z"/>
                <path class="d" d="M380 2 q6 0 6 5 q0 4 -6 4 q-6 0 -6 -4 q0 -5 6 -5z"/>
                <path class="d" d="M640 2 q9 0 9 8 q0 4 -9 4 q-9 0 -9 -4 q0 -8 9 -8z"/>
                <path class="d" d="M900 2 q6 0 6 6 q0 4 -6 4 q-6 0 -6 -4 q0 -6 6 -6z"/>
                <path class="d" d="M1100 2 q7 0 7 6 q0 5 -7 5 q-7 0 -7 -5 q0 -6 7 -6z"/>
              </svg>
            </header>
            <main class="content" id="view"></main>
          </div>
          <nav class="bottom-nav">
            ${bottom.map((n) => `<a href="#/${n.id}" data-r="${n.id}"><span class="b-ico">${n.icon}</span>${n.label}${n.id === 'pedidos' ? '<span class="n-count hidden"></span>' : ''}</a>`).join('')}
            ${rest.length ? '<button data-a="more"><span class="b-ico">☰</span>Más</button>' : ''}
          </nav>
        </div>`;

      const root = document.getElementById('app');
      root.querySelector('[data-a=logout]').onclick = App.logout;
      root.querySelector('[data-a=user]').onclick = App.userMenu;
      root.querySelector('[data-a=cash]').onclick = () => (PZ.auth.can('caja') ? App.go('caja') : null);
      const more = root.querySelector('[data-a=more]');
      if (more) more.onclick = () => {
        const m = PZ.modal({
          title: 'Más secciones',
          body: `<div class="more-menu">${rest.map((n) => `<a href="#/${n.id}"><span>${n.icon}</span>${n.label}</a>`).join('')}<a href="#" data-a="lo"><span>🚪</span>Salir</a></div>`,
        });
        m.el.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => {
          if (a.dataset.a === 'lo') { e.preventDefault(); m.close(); App.logout(); return; }
          m.close();
        }));
      };

      const tick = () => {
        const c = root.querySelector('.clock');
        if (c) c.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      };
      tick();
      clearInterval(clockTimer);
      clockTimer = setInterval(tick, 15000);
      App.refreshChrome();
    },

    refreshChrome() {
      const root = document.getElementById('app');
      const chip = root.querySelector('.cash-chip');
      if (!chip) return;
      const s = S.currentSession();
      chip.className = 'cash-chip ' + (s ? 'open' : 'closed');
      chip.innerHTML = `<span class="dot"></span><span class="c-txt">${s ? 'Caja abierta' : 'Caja cerrada'}</span>`;
      const active = S.data.orders.filter((o) => !o.voided && !['entregado', 'cancelado'].includes(o.status)).length;
      root.querySelectorAll('.n-count').forEach((el) => {
        el.textContent = active;
        el.classList.toggle('hidden', !active);
      });
    },

    userMenu() {
      const u = PZ.auth.current;
      const m = PZ.modal({
        title: `Hola, ${U.esc(u.name)} 👋`,
        size: 'sm',
        body: `
          <p class="muted" style="margin-top:0">${PZ.auth.ROLES[u.role].label}</p>
          <div class="opt-section">Sabor del sistema</div>
          <div class="flavor-dots" style="justify-content:flex-start">
            ${PZ.themes.map((t) => `<button type="button" class="flavor-dot ${t.id === S.data.settings.theme ? 'on' : ''}" data-t="${t.id}" title="${t.name}" style="background:conic-gradient(${t.sw[0]} 0 50%, ${t.sw[1]} 50% 80%, ${t.sw[2]} 80%)"></button>`).join('')}
          </div>
          <button class="btn ghost block mt" data-a="pass">🔑 Cambiar mi contraseña</button>
          <button class="btn danger block mt" data-a="out">🚪 Cerrar sesión</button>`,
      });
      m.el.querySelectorAll('.flavor-dot').forEach((b) => b.addEventListener('click', () => {
        App.setTheme(b.dataset.t);
        m.el.querySelectorAll('.flavor-dot').forEach((x) => x.classList.toggle('on', x === b));
      }));
      m.el.querySelector('[data-a=out]').onclick = () => { m.close(); App.logout(); };
      m.el.querySelector('[data-a=pass]').onclick = async () => {
        m.close();
        const p = await PZ.prompt('Nueva contraseña (mínimo 6 caracteres)', { type: 'password', title: 'Cambiar contraseña' });
        if (p == null) return;
        if (p.length < 6) return PZ.toast('La contraseña es muy corta', 'warn');
        u.passHash = await U.sha256(p);
        S.save();
        PZ.toast('Contraseña actualizada');
      };
    },

    logout() {
      PZ.auth.logout();
      if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } cleanup = null; }
      location.hash = '';
      App.renderLogin();
    },

    /* ===================== ROUTER ===================== */
    route() {
      if (!PZ.auth.current) return App.renderLogin();
      if (!document.getElementById('view')) App.renderShell();
      const [name, ...params] = (location.hash.replace(/^#\/?/, '') || '').split('/');
      const allowed = NAV.filter((n) => PZ.auth.can(n.id));
      let id = name && PZ.auth.can(name) && PZ.views[name] ? name : allowed[0].id;
      if (!name || id !== name) { history.replaceState(null, '', '#/' + id); }
      const view = PZ.views[id];
      const nav = NAV.find((n) => n.id === id);
      if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
      document.querySelectorAll('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === id));
      document.querySelector('.topbar .t-ico').textContent = nav.icon;
      document.querySelector('.topbar .t-txt').textContent = view.title || nav.label;
      document.title = `${nav.label} · ${S.data.settings.business.name}`;
      const el = document.getElementById('view');
      el.innerHTML = '';
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      window.scrollTo(0, 0);
      try {
        cleanup = view.render(el, params) || null;
      } catch (e) {
        console.error(e);
        el.innerHTML = `<div class="card empty"><span class="e-ico">🔥</span>Se quemó la pizza: ${U.esc(e.message)}</div>`;
      }
    },

    start() {
      App.applyTheme();
      App.renderShell();
      App.route();
    },
  });

  /* ===================== Arranque ===================== */
  async function boot() {
    try {
      await S.init();
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = '<p style="padding:20px">No se pudo iniciar el almacenamiento del navegador.</p>';
      return;
    }
    App.applyTheme();
    S.onChange(() => App.refreshChrome());
    window.addEventListener('hashchange', () => App.route());

    // Sincroniza entre pestañas del mismo dispositivo (ej. caja + cocina)
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('pizzeria-diego');
      const origFlush = S.flush;
      S.flush = async function () { await origFlush(); bc.postMessage('changed'); };
      bc.onmessage = async () => {
        await S.init();
        if (PZ.auth.current) PZ.auth.current = S.user(PZ.auth.current.id) || PZ.auth.current;
        App.refreshChrome();
        // Las vistas "en vivo" (pedidos, inicio, caja) se redibujan solas si no hay un modal abierto
        const name = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
        if (PZ.auth.current && PZ.views[name] && PZ.views[name].live && !document.querySelector('.modal-back')) App.route();
      };
    }

    PZ.auth.restore();
    const boot = document.getElementById('boot');
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 400);
    if (PZ.auth.current) App.start();
    else App.renderLogin();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.PZ);
