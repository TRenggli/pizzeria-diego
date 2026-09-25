/* ==========================================================================
   PZ.app — arranque, ingreso/registro, selección de sucursal y navegación
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  const S = PZ.store;
  const A = PZ.auth;

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
    { id: 'sucursales', label: 'Sucursales', icon: '🏢' },
    { id: 'historial', label: 'Ventas', icon: '🧾' },
    { id: 'clientes', label: 'Clientes', icon: '👥' },
    { id: 'menu', label: 'Menú y precios', icon: '📋' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'reportes', label: 'Reportes', icon: '📈' },
    { id: 'config', label: 'Configuración', icon: '⚙️' },
  ];

  let cleanup = null;
  let clockTimer = null;
  const root = () => document.getElementById('app');
  const flavorDots = (current) => PZ.themes.map((t) => `<button type="button" class="flavor-dot ${t.id === current ? 'on' : ''}" data-t="${t.id}" title="${t.name}" aria-label="Tema ${t.name}" style="background:conic-gradient(${t.sw[0]} 0 50%, ${t.sw[1]} 50% 80%, ${t.sw[2]} 80%)"></button>`).join('');

  const App = (PZ.app = {
    /* ===================== Tema (por dispositivo) ===================== */
    theme: () => localStorage.getItem('pz-theme') || 'margherita',
    applyTheme(id) {
      const t = id || App.theme();
      document.documentElement.dataset.theme = t;
      document.documentElement.dataset.motion = localStorage.getItem('pz-motion') === 'off' ? 'off' : 'on';
      const meta = document.querySelector('meta[name=theme-color]');
      const col = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      if (meta && col) meta.content = col;
    },
    setTheme(id) { localStorage.setItem('pz-theme', id); App.applyTheme(id); },
    bindFlavors(el) {
      el.querySelectorAll('.flavor-dot').forEach((b) => b.addEventListener('click', () => {
        App.setTheme(b.dataset.t);
        el.querySelectorAll('.flavor-dot').forEach((x) => x.classList.toggle('on', x === b));
      }));
    },

    go(route) { location.hash = '#/' + route; },

    loading(msg = 'Preparando la masa…') {
      clearInterval(clockTimer);
      root().innerHTML = `<div class="login"><div class="loading-card"><div class="spin-pizza">${PZ.brandLogo(90)}</div><p>${U.esc(msg)}</p></div></div>`;
    },

    floaters() {
      return Array.from({ length: 20 }, (_, i) => {
        const kinds = ['pep', 'basil', 'olive', 'cheese', 'tomato'];
        const size = 14 + Math.random() * 26;
        return `<i class="${kinds[i % 5]}" style="left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${12 + Math.random() * 14}s;animation-delay:-${Math.random() * 20}s"></i>`;
      }).join('');
    },

    /* ===================== INGRESO ===================== */
    renderLogin(mode = 'login', errMsg = '') {
      clearInterval(clockTimer);
      const isReg = mode === 'register';
      root().innerHTML = `
        <div class="login">
          <div class="floaters">${App.floaters()}</div>
          <form class="login-card ${isReg ? 'wide' : ''}" autocomplete="on" novalidate>
            <div class="login-logo">${PZ.brandLogo(96)}</div>
            <h1>${isReg ? 'Creá tu pizzería' : 'Pizzería'}</h1>
            <p class="tag">${isReg ? 'Un negocio, todas tus sucursales, todo sincronizado' : 'Sistema de gestión · ¡a hornear!'}</p>
            <div class="err-msg ${errMsg ? '' : 'hidden'}">${U.esc(errMsg)}</div>
            ${isReg ? `
              <div class="grid-2">
                <label class="field"><span>Nombre del negocio</span><input name="org" required placeholder="Pizzería Diego" autofocus></label>
                <label class="field"><span>Primera sucursal</span><input name="branch" value="Casa central"></label>
                <label class="field"><span>Tu nombre</span><input name="name" autocomplete="name" required></label>
                <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
              </div>
              <label class="field"><span>Contraseña (mínimo 8)</span><input name="pass" type="password" autocomplete="new-password" required minlength="8"></label>
              <label class="check"><input type="checkbox" name="menu" checked> Cargar menú de ejemplo (lo editás después)</label>
              <label class="check"><input type="checkbox" name="demo" checked> Cargar 2 semanas de ventas de demostración</label>
              <button class="btn primary lg block mt" type="submit">Crear mi cuenta 🍕</button>
              <p class="center small mt"><a href="#" data-a="login">Ya tengo cuenta, ingresar</a></p>`
            : `
              <label class="field"><span>Usuario o email</span><input name="user" autocomplete="username" autocapitalize="off" required autofocus></label>
              <label class="field"><span>Contraseña</span><input name="pass" type="password" autocomplete="current-password" required></label>
              <button class="btn primary lg block mt" type="submit">Ingresar 🍕</button>
              <p class="center small mt">¿Tenés una pizzería? <a href="#" data-a="register">Creá tu cuenta gratis</a></p>`}
            <div class="flavor-dots" title="Elegí el sabor del sistema">${flavorDots(App.theme())}</div>
            ${navigator.onLine ? '' : '<div class="demo-hint">📴 Sin conexión. Si ya ingresaste antes en este equipo, tu sesión sigue activa.</div>'}
          </form>
        </div>`;
      const form = root().querySelector('form');
      const err = root().querySelector('.err-msg');
      const showErr = (m) => { err.textContent = m; err.classList.remove('hidden'); err.style.animation = 'none'; void err.offsetWidth; err.style.animation = ''; };
      App.bindFlavors(form);
      form.querySelectorAll('[data-a]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); App.renderLogin(a.dataset.a); }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Un momento…';
        try {
          if (isReg) {
            const f = form.elements;
            if (!f.org.value.trim() || !f.name.value.trim() || !f.email.value.trim()) throw new Error('Completá todos los campos');
            if (f.pass.value.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
            await PZ.cloud.register({
              orgName: f.org.value.trim(), branchName: f.branch.value.trim() || 'Casa central', name: f.name.value.trim(),
              email: f.email.value.trim(), password: f.pass.value, settings: PZ.seed.settings(f.org.value.trim(), f.branch.value.trim()),
            });
            sessionStorage.setItem('pz-onboard', JSON.stringify({ menu: f.menu.checked, demo: f.demo.checked }));
            await A.login(f.email.value, f.pass.value);
          } else {
            await A.login(form.elements.user.value, form.elements.pass.value);
          }
          localStorage.setItem('pz-memberships', JSON.stringify(A.memberships));
          await App.enter(A.memberships);
        } catch (ex) {
          console.error(ex);
          showErr(ex.message || 'No se pudo ingresar');
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    },

    /** Elegir negocio y sucursal y abrir el sistema */
    async enter(memberships) {
      let m = memberships.find((x) => x.org_id === localStorage.getItem('pz-org'));
      if (!m && memberships.length === 1) m = memberships[0];
      if (!m) m = await App.pick('¿Con qué negocio vas a trabajar?', memberships.map((x) => ({ id: x.org_id, title: x.organizations ? x.organizations.name : 'Negocio', sub: A.ROLES[x.role].label, icon: '🍕' })))
        .then((id) => memberships.find((x) => x.org_id === id));
      A.use(m);
      localStorage.setItem('pz-org', m.org_id);

      App.loading('Buscando tus sucursales…');
      let branches = [];
      try {
        const meta = await PZ.cloud.orgMeta(m.org_id);
        branches = meta.branches;
        S.ctx.org = meta.org;
        S.ctx.branches = meta.branches;
        S.ctx.members = meta.members;
        localStorage.setItem('pz-branches-' + m.org_id, JSON.stringify(branches));
      } catch (e) {
        try { branches = JSON.parse(localStorage.getItem('pz-branches-' + m.org_id)) || []; } catch (x) { branches = []; }
      }
      const allowed = branches.filter((b) => b.active && (m.role === 'owner' || !(m.branch_ids || []).length || m.branch_ids.includes(b.id)));
      if (!allowed.length) throw new Error('No tenés sucursales asignadas. Hablá con el dueño.');
      let branchId = localStorage.getItem('pz-branch-' + m.org_id);
      if (!allowed.some((b) => b.id === branchId)) {
        branchId = allowed.length === 1 ? allowed[0].id : await App.pick('¿En qué sucursal estás hoy?', allowed.map((b) => ({ id: b.id, title: b.name, sub: (b.settings && b.settings.business && b.settings.business.address) || '', icon: '🏪' })));
      }
      await App.openBranch(branchId);
    },

    async openBranch(branchId) {
      App.loading('Calentando el horno…');
      if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } cleanup = null; }
      await S.flush();
      await S.open(A.current.orgId, branchId);
      localStorage.setItem('pz-branch-' + A.current.orgId, branchId);
      PZ.cloud.sb.rpc('touch_login', { p_org: A.current.orgId }).then(() => {}, () => {});

      // Primer ingreso de un negocio nuevo
      const onboard = JSON.parse(sessionStorage.getItem('pz-onboard') || 'null');
      if (onboard) {
        sessionStorage.removeItem('pz-onboard');
        if (onboard.menu) S.seedIfEmpty();
        if (onboard.demo) {
          App.loading('Horneando 2 semanas de ventas de ejemplo…');
          try { await PZ.seed.demoHistory(14); } catch (e) { console.error(e); PZ.toast('No se pudieron cargar las ventas de demo', 'warn'); }
        }
      }
      App.start();
    },

    /** Pantalla de elección (negocio / sucursal) */
    pick(title, options) {
      return new Promise((resolve) => {
        root().innerHTML = `
          <div class="login"><div class="floaters">${App.floaters()}</div>
            <div class="login-card wide">
              <div class="login-logo">${PZ.brandLogo(96)}</div>
              <h1 style="font-size:1.5em">${U.esc(title)}</h1>
              <div class="pick-list mt">${options.map((o) => `<button class="pick" data-id="${o.id}"><span class="pick-ico">${o.icon}</span><span><b>${U.esc(o.title)}</b><small>${U.esc(o.sub || '')}</small></span><span class="pick-go">→</span></button>`).join('')}</div>
              <p class="center small mt"><a href="#" data-a="out">Salir</a></p>
            </div></div>`;
        root().querySelectorAll('.pick').forEach((b) => b.onclick = () => resolve(b.dataset.id));
        root().querySelector('[data-a=out]').onclick = (e) => { e.preventDefault(); App.logout(); };
      });
    },

    /* ===================== ESTRUCTURA ===================== */
    renderShell() {
      const u = A.current;
      const items = NAV.filter((n) => A.can(n.id) && PZ.views[n.id]);
      const priority = ['inicio', 'vender', 'pedidos', 'caja', 'sucursales'];
      const bottom = items.filter((n) => priority.includes(n.id)).slice(0, 4);
      const rest = items.filter((n) => !bottom.includes(n));
      const orgName = S.ctx.org ? S.ctx.org.name : S.data.settings.business.name;
      root().innerHTML = `
        <div class="shell">
          <aside class="sidebar">
            <div class="brand">${PZ.brandLogo(44)}<div class="brand-txt"><b>${U.esc(orgName)}</b><small>${U.esc(S.branchName())}</small></div></div>
            <nav class="nav">
              ${items.map((n) => `<a href="#/${n.id}" data-r="${n.id}" title="${n.label}"><span class="n-ico">${n.icon}</span><span class="n-txt">${n.label}</span>${n.id === 'pedidos' ? '<span class="n-count hidden"></span>' : ''}</a>`).join('')}
            </nav>
            <div class="side-foot">
              <div class="sf-txt"><div style="opacity:.75">Conectado como</div><b>${U.esc(u.name)}</b> · ${A.ROLES[u.role].label}</div>
              <button class="btn sm ghost block mt" data-a="logout" title="Cerrar sesión" style="color:inherit;box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)">🚪<span class="sf-txt"> Cerrar sesión</span></button>
            </div>
          </aside>
          <div class="main">
            <header class="topbar">
              <h2><span class="t-ico"></span><span class="t-txt"></span></h2>
              <div class="spacer"></div>
              <button class="branch-chip" data-a="branch" title="Cambiar de sucursal">🏪 <span class="bc-txt">${U.esc(S.branchName())}</span>${App.allowedBranches().length > 1 ? ' ▾' : ''}</button>
              <button class="sync-chip" data-a="sync"></button>
              <button class="cash-chip" data-a="cash"></button>
              <span class="clock"></span>
              <button class="user-pill" data-a="user" aria-label="Mi usuario"><span class="avatar">${U.esc(u.name[0].toUpperCase())}</span><span class="u-name">${U.esc(u.name)}</span></button>
              <svg class="drip" viewBox="0 0 1200 14" preserveAspectRatio="none" aria-hidden="true">
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
            ${bottom.map((n) => `<a href="#/${n.id}" data-r="${n.id}"><span class="b-ico">${n.icon}</span><span class="b-txt">${n.label}</span>${n.id === 'pedidos' ? '<span class="n-count hidden"></span>' : ''}</a>`).join('')}
            ${rest.length ? '<button data-a="more"><span class="b-ico">☰</span><span class="b-txt">Más</span></button>' : ''}
          </nav>
        </div>`;

      const r = root();
      r.querySelector('[data-a=logout]').onclick = App.logout;
      r.querySelector('[data-a=user]').onclick = App.userMenu;
      r.querySelector('[data-a=branch]').onclick = App.branchMenu;
      r.querySelector('[data-a=sync]').onclick = App.syncInfo;
      r.querySelector('[data-a=cash]').onclick = () => (A.can('caja') ? App.go('caja') : null);
      const more = r.querySelector('[data-a=more]');
      if (more) more.onclick = () => {
        const m = PZ.modal({
          title: 'Más secciones',
          body: `<div class="more-menu">${rest.map((n) => `<a href="#/${n.id}"><span>${n.icon}</span>${n.label}</a>`).join('')}<a href="#" data-a="br"><span>🏪</span>Cambiar sucursal</a><a href="#" data-a="lo"><span>🚪</span>Salir</a></div>`,
        });
        m.el.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => {
          if (a.dataset.a === 'lo') { e.preventDefault(); m.close(); App.logout(); return; }
          if (a.dataset.a === 'br') { e.preventDefault(); m.close(); App.branchMenu(); return; }
          m.close();
        }));
      };

      const tick = () => {
        const c = r.querySelector('.clock');
        if (c) c.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      };
      tick();
      clearInterval(clockTimer);
      clockTimer = setInterval(tick, 15000);
      App.refreshChrome();
      App.refreshSync(S.status);
    },

    allowedBranches() {
      const u = A.current;
      return S.ctx.branches.filter((b) => b.active && (u.role === 'owner' || !u.branchIds.length || u.branchIds.includes(b.id)));
    },

    refreshChrome() {
      const r = root();
      const chip = r.querySelector('.cash-chip');
      if (!chip || !S.data) return;
      const s = S.currentSession();
      chip.className = 'cash-chip ' + (s ? 'open' : 'closed');
      chip.innerHTML = `<span class="dot"></span><span class="c-txt">${s ? 'Caja abierta' : 'Caja cerrada'}</span>`;
      const active = S.data.orders.filter((o) => !o.voided && !['entregado', 'cancelado'].includes(o.status)).length;
      r.querySelectorAll('.n-count').forEach((el) => {
        el.textContent = active;
        el.classList.toggle('hidden', !active);
      });
      const bc = r.querySelector('.bc-txt');
      if (bc) bc.textContent = S.branchName();
    },

    refreshSync(st) {
      const el = root().querySelector('.sync-chip');
      if (!el) return;
      const offline = !navigator.onLine;
      let cls = 'ok';
      let txt = 'Al día';
      let ico = '☁️';
      if (offline) { cls = 'off'; ico = '📴'; txt = st.pending ? `Sin conexión · ${st.pending} por enviar` : 'Sin conexión'; }
      else if (st.state === 'syncing') { cls = 'busy'; ico = '⏳'; txt = 'Guardando…'; }
      else if (st.state === 'retry') { cls = 'warn'; ico = '⚠️'; txt = `Reintentando (${st.pending})`; }
      else if (st.state === 'error') { cls = 'err'; ico = '⚠️'; txt = 'Error al guardar'; }
      else if (st.pending) { cls = 'busy'; ico = '⏳'; txt = `${st.pending} por enviar`; }
      el.className = 'sync-chip ' + cls;
      el.innerHTML = `<span>${ico}</span><span class="s-txt">${txt}</span>`;
      el.title = offline ? 'Sin internet: seguí trabajando, se sincroniza solo al volver la conexión' : 'Datos guardados en la nube';
    },

    syncInfo() {
      const st = S.status;
      PZ.modal({
        title: '☁️ Sincronización',
        size: 'sm',
        body: `
          <div class="bank-box">
            <div class="bk-row"><span>Conexión</span><b>${navigator.onLine ? '🟢 En línea' : '🔴 Sin internet'}</b></div>
            <div class="bk-row"><span>Tiempo real</span><b>${PZ.cloud.realtime === 'SUBSCRIBED' ? '🟢 Activo' : '🟡 ' + (PZ.cloud.realtime || 'Conectando')}</b></div>
            <div class="bk-row"><span>Cambios por enviar</span><b>${st.pending}</b></div>
            <div class="bk-row"><span>Última sincronización</span><b>${st.lastSync ? U.time(st.lastSync) : '—'}</b></div>
          </div>
          <p class="small muted">Todo se guarda primero en este equipo y se sube a la nube apenas hay internet. Si se corta la conexión, podés seguir vendiendo e imprimiendo: se sincroniza solo al volver.</p>
          ${st.error ? `<div class="alert-row">⚠️ ${U.esc(st.error)}</div>` : ''}`,
      });
    },

    branchMenu() {
      const list = App.allowedBranches();
      const m = PZ.modal({
        title: '🏪 Sucursal',
        size: 'sm',
        body: `<div class="pick-list">${list.map((b) => `<button class="pick ${b.id === S.ctx.branchId ? 'on' : ''}" data-id="${b.id}"><span class="pick-ico">🏪</span><span><b>${U.esc(b.name)}</b><small>${U.esc((b.settings && b.settings.business && b.settings.business.address) || '')}</small></span><span class="pick-go">${b.id === S.ctx.branchId ? '✓' : '→'}</span></button>`).join('')}</div>
          ${A.isAdmin() ? '<a class="btn ghost block mt" href="#/sucursales">🏢 Ver todas / estadísticas generales</a>' : ''}`,
      });
      m.el.querySelectorAll('.pick').forEach((b) => b.onclick = async () => {
        m.close();
        if (b.dataset.id === S.ctx.branchId) return;
        try { await App.openBranch(b.dataset.id); PZ.toast('Estás en ' + S.branchName()); } catch (e) { PZ.toast(e.message, 'err'); App.start(); }
      });
      m.el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => m.close()));
    },

    userMenu() {
      const u = A.current;
      const m = PZ.modal({
        title: `Hola, ${U.esc(u.name)} 👋`,
        size: 'sm',
        body: `
          <p class="muted" style="margin-top:0">${A.ROLES[u.role].label} · ${U.esc(S.ctx.org ? S.ctx.org.name : '')}<br><span class="small">${U.esc(u.username)}</span></p>
          <div class="opt-section">Sabor del sistema (en este equipo)</div>
          <div class="flavor-dots" style="justify-content:flex-start">${flavorDots(App.theme())}</div>
          ${A.memberships.length > 1 ? '<button class="btn ghost block mt" data-a="org">🔀 Cambiar de negocio</button>' : ''}
          <button class="btn ghost block mt" data-a="pass">🔑 Cambiar mi contraseña</button>
          <button class="btn danger block mt" data-a="out">🚪 Cerrar sesión</button>`,
      });
      App.bindFlavors(m.el);
      m.el.querySelector('[data-a=out]').onclick = () => { m.close(); App.logout(); };
      const org = m.el.querySelector('[data-a=org]');
      if (org) org.onclick = () => { m.close(); localStorage.removeItem('pz-org'); App.enter(A.memberships).catch((e) => App.renderLogin('login', e.message)); };
      m.el.querySelector('[data-a=pass]').onclick = async () => {
        m.close();
        const p = await PZ.prompt('Nueva contraseña (mínimo 8 caracteres)', { type: 'password', title: 'Cambiar contraseña' });
        if (p == null) return;
        if (p.length < 8) return PZ.toast('La contraseña es muy corta', 'warn');
        try { await PZ.cloud.updateMyPassword(p); PZ.toast('Contraseña actualizada'); } catch (e) { PZ.toast(e.message, 'err'); }
      };
    },

    async logout() {
      if (S.status.pending && !(await PZ.confirm(`Hay ${S.status.pending} cambio(s) que todavía no se enviaron a la nube. Si cerrás sesión se envían la próxima vez que ingreses en este equipo. ¿Salir igual?`))) return;
      if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } cleanup = null; }
      await S.flush();
      await A.logout();
      location.hash = '';
      App.renderLogin();
    },

    /* ===================== NAVEGACIÓN ===================== */
    route() {
      if (!A.current || !S.data) return;
      if (!document.getElementById('view')) App.renderShell();
      const [name, ...params] = (location.hash.replace(/^#\/?/, '') || '').split('/');
      const allowed = NAV.filter((n) => A.can(n.id) && PZ.views[n.id]);
      const id = name && allowed.some((n) => n.id === name) ? name : allowed[0].id;
      if (!name || id !== name) history.replaceState(null, '', '#/' + id);
      const view = PZ.views[id];
      const nav = NAV.find((n) => n.id === id);
      if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
      document.querySelectorAll('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === id));
      document.querySelector('.topbar .t-ico').textContent = nav.icon;
      document.querySelector('.topbar .t-txt').textContent = view.title || nav.label;
      document.title = `${nav.label} · ${S.branchName()}`;
      const el = document.getElementById('view');
      el.innerHTML = '';
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      App.currentView = id;
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

  /* ===================== Tablas adaptables ===================== */
  // En pantallas chicas cada fila de tabla se muestra como tarjeta; para eso
  // cada celda necesita la etiqueta de su columna.
  function labelTables(scope) {
    scope.querySelectorAll('table.tbl').forEach((t) => {
      const heads = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim());
      if (!heads.length) { t.classList.add('no-head'); return; }
      t.classList.add('stackable');
      t.querySelectorAll('tbody tr').forEach((tr) => {
        Array.from(tr.children).forEach((td, i) => { if (!td.dataset.label) td.dataset.label = heads[i] || ''; });
      });
    });
  }

  /* ===================== Arranque ===================== */
  async function boot() {
    App.applyTheme();
    window.addEventListener('hashchange', () => App.route());
    S.onChange(() => App.refreshChrome());
    S.onStatus((st) => App.refreshSync(st));
    new MutationObserver(U.debounce(() => labelTables(document.body), 60)).observe(document.body, { childList: true, subtree: true });

    // Cambios de otros equipos: se redibujan las pantallas "en vivo"
    S.onRemoteHook = U.debounce(() => {
      const v = PZ.views[App.currentView];
      if (v && v.live && !document.querySelector('.modal-back')) App.route();
    }, 350);

    const boot = document.getElementById('boot');
    const hideBoot = () => { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 400); };
    try {
      const session = await PZ.cloud.session();
      if (!session) { hideBoot(); return App.renderLogin(); }
      let memberships;
      try { memberships = await PZ.cloud.memberships(); localStorage.setItem('pz-memberships', JSON.stringify(memberships)); }
      catch (e) { memberships = JSON.parse(localStorage.getItem('pz-memberships') || '[]'); }
      A.memberships = memberships;
      hideBoot();
      if (!memberships.length) return App.renderLogin();
      await App.enter(memberships);
    } catch (e) {
      console.error(e);
      hideBoot();
      App.renderLogin('login', e.message);
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.PZ);
