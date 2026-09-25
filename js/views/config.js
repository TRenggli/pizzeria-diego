/* ==========================================================================
   Vista: CONFIGURACIÓN
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  const S = PZ.store;
  let tab = 'negocio';

  const TABS = [
    ['negocio', '🏪 Negocio'], ['ticket', '🧾 Ticket e impresora'], ['cobros', '💳 Cobros'], ['delivery', '🛵 Delivery'],
    ['usuarios', '👤 Usuarios'], ['apariencia', '🎨 Apariencia'], ['sistema', '🛟 Respaldo y sistema'],
  ];

  function render(el) {
    el.innerHTML = `<div class="tabs-nav">${TABS.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="tab-body"></div>`;
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(el); });
    SECTIONS[tab](el.querySelector('.tab-body'), el);
  }

  /** Enlaza inputs con data-k="ruta.a.la.clave" a settings */
  function bind(root, after) {
    root.querySelectorAll('[data-k]').forEach((inp) => {
      const path = inp.dataset.k.split('.');
      const get = () => path.reduce((o, k) => (o ? o[k] : undefined), S.data.settings);
      const set = (v) => { let o = S.data.settings; path.slice(0, -1).forEach((k) => { o = o[k]; }); o[path[path.length - 1]] = v; };
      const cur = get();
      if (inp.type === 'checkbox') inp.checked = !!cur;
      else inp.value = cur ?? '';
      inp.addEventListener('change', () => {
        let v = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (inp.dataset.num !== undefined) v = Number(String(v).replace(',', '.')) || 0;
        set(v);
        S.save();
        PZ.toast('Guardado', 'ok', 1200);
        after && after();
      });
    });
  }

  const SECTIONS = {
    negocio(b) {
      b.innerHTML = `<div class="card">
        <div class="grid-2">
          <label class="field"><span>Nombre del local</span><input data-k="business.name"></label>
          <label class="field"><span>Frase / slogan</span><input data-k="business.slogan"></label>
          <label class="field"><span>Dirección</span><input data-k="business.address"></label>
          <label class="field"><span>Localidad</span><input data-k="business.city"></label>
          <label class="field"><span>Teléfono</span><input data-k="business.phone"></label>
          <label class="field"><span>Instagram</span><input data-k="business.instagram" placeholder="@pizzeria"></label>
          <label class="field"><span>CUIT (opcional, sale en el ticket)</span><input data-k="business.cuit"></label>
          <label class="field"><span>Condición fiscal</span><select data-k="business.taxCondition"><option>Monotributista</option><option>Responsable Inscripto</option><option>Exento</option><option value="">No mostrar</option></select></label>
        </div>
        <label class="field" style="max-width:260px"><span>Minutos objetivo de preparación (alerta)</span><input data-k="prepMinutes" data-num inputmode="numeric"></label>
      </div>`;
      bind(b);
    },

    ticket(b, el) {
      const t = S.data.settings.ticket;
      const sample = S.data.orders.filter((o) => o.paid && !o.voided).slice(-1)[0];
      b.innerHTML = `<div class="dash" style="margin-top:0">
        <div class="card">
          <h3>🖨️ Impresora</h3>
          <div class="opt-grid mb">
            ${[['browser', '🖥️ Del sistema / PDF', 'Usa el diálogo de impresión. Funciona con cualquier impresora instalada (USB, WiFi) o para guardar PDF.'],
               ['bluetooth', '📶 Bluetooth directo', 'Térmica ESC/POS desde Chrome en Android. Imprime sin diálogo.'],
               ['rawbt', '🤖 App RawBT', 'Android: envía el ticket a la app gratuita RawBT, que maneja la impresora.']]
              .map(([k, l, d]) => `<button class="opt ${t.printMode === k ? 'on' : ''}" data-pm="${k}">${l}<small>${d}</small></button>`).join('')}
          </div>
          ${t.printMode === 'bluetooth' ? '<button class="btn ghost mb" data-a="bt">📶 Buscar y conectar impresora</button>' : ''}
          <div class="grid-2">
            <label class="field"><span>Ancho del papel</span><select data-k="ticket.width" data-num><option value="80">80 mm (común)</option><option value="58">58 mm (portátil)</option></select></label>
            <label class="field"><span>Copias del comprobante</span><select data-k="ticket.copies" data-num><option value="1">1</option><option value="2">2 (original + copia)</option></select></label>
            <label class="field"><span>Punto de venta (Nº)</span><input data-k="ticket.pos" data-num inputmode="numeric"></label>
            <label class="field"><span>QR al pie del ticket</span><select data-k="ticket.qrMode"><option value="instagram">Instagram del local</option><option value="custom">Link propio (reseñas, menú…)</option><option value="none">Sin QR</option></select></label>
          </div>
          ${t.qrMode === 'custom' ? '<label class="field"><span>Link del QR</span><input data-k="ticket.qrText" placeholder="https://g.page/r/... (reseñas de Google)"></label>' : ''}
          <label class="field"><span>Mensaje al pie</span><input data-k="ticket.footer"></label>
          <label class="field"><span>Leyenda legal</span><input data-k="ticket.legend"></label>
          <label class="check"><input type="checkbox" data-k="ticket.showLogo"> Mostrar logo</label>
          <label class="check"><input type="checkbox" data-k="ticket.autoPrint"> Imprimir automáticamente al cobrar</label>
          <label class="check"><input type="checkbox" data-k="ticket.printKitchen"> Imprimir comanda para cocina</label>
          ${t.printMode !== 'browser' ? '<label class="check"><input type="checkbox" data-k="ticket.escposAccents"> Imprimir acentos y ñ (si salen símbolos raros, desactivalo)</label>' : ''}
          <div class="row-flex mt">
            <div class="logo-preview">${t.logo ? `<img src="${t.logo}" alt="">` : PZ.brandLogo(60)}</div>
            <div class="row-flex" style="flex-direction:column;align-items:flex-start">
              <label class="btn ghost sm">📷 Subir logo<input type="file" accept="image/*" data-a="logo" hidden></label>
              ${t.logo ? '<button class="btn ghost sm" data-a="rmlogo">Quitar logo</button>' : ''}
            </div>
          </div>
          <button class="btn primary mt" data-a="test">🖨️ Imprimir ticket de prueba</button>
        </div>
        <div class="card"><h3>👀 Vista previa</h3>
          <div class="ticket-stage" style="max-height:none">${sample ? PZ.ticket.customerHTML(sample) : '<p class="muted">Hacé una venta para ver la vista previa.</p>'}</div>
        </div>
      </div>`;
      bind(b, () => render(el));
      b.querySelectorAll('[data-pm]').forEach((x) => x.onclick = () => { t.printMode = x.dataset.pm; S.save(); render(el); });
      const bt = b.querySelector('[data-a=bt]');
      if (bt) bt.onclick = () => PZ.ticket.connectBluetooth();
      b.querySelector('[data-a=test]').onclick = () => PZ.ticket.testPrint();
      b.querySelector('[data-a=logo]').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        t.logo = await U.shrinkImage(await U.readFileAsDataURL(file), 400);
        S.save(); render(el);
      };
      const rm = b.querySelector('[data-a=rmlogo]');
      if (rm) rm.onclick = () => { t.logo = null; S.save(); render(el); };
    },

    cobros(b, el) {
      const p = S.data.settings.payments;
      b.innerHTML = `<div class="dash" style="margin-top:0">
        <div class="card"><h3>🏦 Transferencias</h3>
          <div class="grid-2">
            <label class="field"><span>Alias</span><input data-k="payments.alias"></label>
            <label class="field"><span>CBU / CVU</span><input data-k="payments.cbu" inputmode="numeric"></label>
            <label class="field"><span>Titular</span><input data-k="payments.holder"></label>
            <label class="field"><span>Banco / billetera</span><input data-k="payments.bank"></label>
          </div>
          <h3 class="mt">💵 Reglas</h3>
          <div class="grid-2">
            <label class="field"><span>% descuento pagando en efectivo</span><input data-k="payments.cashDiscountPct" data-num inputmode="decimal"></label>
            <label class="field"><span>% recargo con tarjeta</span><input data-k="payments.cardSurchargePct" data-num inputmode="decimal"></label>
          </div>
          <label class="check"><input type="checkbox" data-k="payments.enableCard"> Aceptar tarjeta (posnet)</label>
          <label class="field mt"><span>Mitad y mitad: ¿cómo se cobra?</span><select data-k="halfPricing"><option value="max">Se cobra la mitad más cara</option><option value="avg">Promedio de las dos</option></select></label>
        </div>
        <div class="card"><h3>📱 QR de cobro</h3>
          <p class="muted small" style="margin-top:0">Subí la foto del QR de tu cuenta de Mercado Pago (o de otra billetera) y se muestra en pantalla al cobrar. También podés pegar un link de pago y se genera el QR.</p>
          <div class="qr-pay"><div class="qr-frame">${p.qrImage ? `<img src="${p.qrImage}" alt="">` : p.qrLink ? U.qrSvg(p.qrLink, 6, 1) : '<div style="width:220px;height:220px;display:grid;place-items:center;color:#999">Sin QR</div>'}</div></div>
          <div class="row-flex mt" style="justify-content:center">
            <label class="btn ghost sm">📷 Subir imagen del QR<input type="file" accept="image/*" data-a="qr" hidden></label>
            ${p.qrImage ? '<button class="btn ghost sm" data-a="rmqr">Quitar</button>' : ''}
          </div>
          <label class="field mt"><span>…o link de pago</span><input data-k="payments.qrLink" placeholder="https://link.mercadopago.com.ar/..."></label>
        </div>
      </div>`;
      bind(b, () => render(el));
      b.querySelector('[data-a=qr]').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        p.qrImage = await U.shrinkImage(await U.readFileAsDataURL(f), 600);
        S.save(); render(el);
      };
      const rm = b.querySelector('[data-a=rmqr]');
      if (rm) rm.onclick = () => { p.qrImage = null; S.save(); render(el); };
    },

    delivery(b, el) {
      const st = S.data.settings;
      b.innerHTML = `<div class="dash" style="margin-top:0">
        <div class="card"><h3>📍 Zonas y costo de envío</h3>
          ${st.zones.map((z, i) => `<div class="row-flex" style="margin-bottom:8px"><input data-zn="${i}" value="${U.esc(z.name)}" style="flex:2"><input data-zf="${i}" value="${z.fee}" inputmode="numeric" style="flex:1"><button class="icon-btn" data-zd="${i}">🗑️</button></div>`).join('')}
          <button class="btn ghost sm" data-a="addz">➕ Agregar zona</button>
        </div>
        <div class="card"><h3>🛵 Repartidores</h3>
          ${st.drivers.map((d, i) => `<div class="row-flex" style="margin-bottom:8px"><input data-dn="${i}" value="${U.esc(d)}" class="grow"><button class="icon-btn" data-dd="${i}">🗑️</button></div>`).join('')}
          <button class="btn ghost sm" data-a="addd">➕ Agregar repartidor</button>
        </div>
      </div>`;
      const save = () => { S.save(); PZ.toast('Guardado', 'ok', 1000); };
      b.querySelectorAll('[data-zn]').forEach((i) => i.onchange = () => { st.zones[i.dataset.zn].name = i.value; save(); });
      b.querySelectorAll('[data-zf]').forEach((i) => i.onchange = () => { st.zones[i.dataset.zf].fee = U.parseMoney(i.value); save(); });
      b.querySelectorAll('[data-zd]').forEach((i) => i.onclick = () => { st.zones.splice(Number(i.dataset.zd), 1); save(); render(el); });
      b.querySelectorAll('[data-dn]').forEach((i) => i.onchange = () => { st.drivers[i.dataset.dn] = i.value.trim(); save(); });
      b.querySelectorAll('[data-dd]').forEach((i) => i.onclick = () => { st.drivers.splice(Number(i.dataset.dd), 1); save(); render(el); });
      b.querySelector('[data-a=addz]').onclick = () => { st.zones.push({ id: U.uid('z'), name: 'Nueva zona', fee: 0 }); save(); render(el); };
      b.querySelector('[data-a=addd]').onclick = () => { st.drivers.push('Nuevo repartidor'); save(); render(el); };
    },

    usuarios(b, el) {
      if (!PZ.auth.isAdmin()) { b.innerHTML = '<div class="card empty">Solo dueño o encargados</div>'; return; }
      const R = PZ.auth.ROLES;
      const branchLabel = (ids) => (!ids || !ids.length ? 'Todas' : ids.map((id) => S.branchName(id) || '?').join(', '));
      const order = { owner: 0, admin: 1, cajero: 2, cocina: 3, delivery: 4 };
      const users = S.data.users.slice().sort((x, y) => order[x.role] - order[y.role] || x.name.localeCompare(y.name));
      b.innerHTML = `<div class="card">
        <div class="row-flex space-between mb"><h3 style="margin:0">👤 Equipo de ${U.esc(S.ctx.org ? S.ctx.org.name : '')}</h3><button class="btn primary" data-a="new">➕ Nuevo usuario</button></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Sucursales</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead><tbody>
          ${users.map((u) => `<tr><td><b>${U.esc(u.name)}</b>${u.id === PZ.auth.current.id ? ' <span class="badge pri">vos</span>' : ''}</td><td class="small">${U.esc(u.username)}</td><td>${R[u.role].label}</td>
            <td class="small">${u.role === 'owner' ? 'Todas' : U.esc(branchLabel(u.branchIds))}</td>
            <td class="small muted">${u.lastLogin ? U.dateTime(u.lastLogin) : '-'}</td>
            <td><span class="badge ${u.active ? 'ok' : 'err'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
            <td class="actions">${u.role !== 'owner' && (PZ.auth.isOwner() || u.role !== 'admin') ? `<button class="btn sm ghost" data-e="${u.id}">✏️</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="mt small muted">
          <b>Roles:</b> Dueño = todo, todas las sucursales · Encargado = todo en sus sucursales (menú, precios, usuarios, reportes) · Cajero/a = vender, pedidos, caja, clientes, ventas y stock · Cocina y Delivery = solo el tablero de pedidos.<br>
          Los empleados ingresan con su <b>usuario</b> (sin email). Anular ventas, cancelar pedidos y descuentos de más del 20% piden los datos de un encargado.
        </div>
      </div>`;
      b.querySelector('[data-a=new]').onclick = () => editUser(null, () => render(el));
      b.querySelectorAll('[data-e]').forEach((x) => x.onclick = () => editUser(S.user(x.dataset.e), () => render(el)));
    },

    apariencia(b, el) {
      const theme = PZ.app.theme();
      b.innerHTML = `<div class="card"><h3>🍕 Elegí el sabor del sistema</h3>
        <p class="muted small" style="margin-top:0">Se guarda en este equipo: la tablet de cocina puede usar un tema y la caja otro.</p>
        <div class="theme-grid">${PZ.themes.map((t) => `<button class="theme-card ${theme === t.id ? 'on' : ''}" data-th="${t.id}"><div class="sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>${t.name}<div class="small muted">${t.desc}</div></button>`).join('')}</div>
        <label class="check mt"><input type="checkbox" class="motion" ${localStorage.getItem('pz-motion') === 'off' ? '' : 'checked'}> Animaciones activadas (desactivalas si el equipo es lento)</label>
      </div>`;
      b.querySelectorAll('[data-th]').forEach((x) => x.onclick = () => { PZ.app.setTheme(x.dataset.th); render(el); });
      b.querySelector('.motion').onchange = (e) => { localStorage.setItem('pz-motion', e.target.checked ? 'on' : 'off'); PZ.app.applyTheme(); };
    },

    sistema(b, el) {
      const d = S.data;
      const size = new Blob([JSON.stringify(d)]).size;
      b.innerHTML = `<div class="dash" style="margin-top:0">
        <div class="card"><h3>☁️ Tus datos están en la nube</h3>
          <p class="muted" style="margin-top:0">Todo se guarda automáticamente en la base de datos (Supabase) y queda disponible en cualquier equipo donde ingreses. Además cada equipo guarda una copia para seguir funcionando si se corta internet.</p>
          <div class="bank-box">
            <div class="bk-row"><span>Sucursal</span><b>${U.esc(S.branchName())}</b></div>
            <div class="bk-row"><span>Pedidos cargados en este equipo</span><b>${d.orders.length} (últimos 120 días)</b></div>
            <div class="bk-row"><span>Clientes del negocio</span><b>${d.customers.length}</b></div>
            <div class="bk-row"><span>Copia local</span><b>${(size / 1024).toFixed(0)} KB</b></div>
          </div>
          <button class="btn ghost mt" data-a="exp">⬇️ Descargar copia extra (JSON)</button>
        </div>
        <div class="card"><h3>🧹 Datos de demostración</h3>
          ${d.demo
            ? '<p style="margin-top:0">Esta sucursal tiene <b>ventas de demostración</b>. Borralas antes de empezar a usarla en serio (el menú, los clientes y la configuración se conservan).</p><button class="btn accent" data-a="demo">🧹 Borrar ventas de demo</button>'
            : `<p class="muted" style="margin-top:0">No hay datos de demo en esta sucursal.</p>${PZ.auth.isAdmin() ? '<button class="btn ghost" data-a="load">🎬 Cargar 2 semanas de ventas de ejemplo</button>' : ''}`}
          ${PZ.auth.isAdmin() && !d.categories.length ? '<button class="btn ghost mt" data-a="menu">📋 Cargar menú de ejemplo</button>' : ''}
        </div>
      </div>
      <div class="card mt"><h3>🕵️ Registro de actividad</h3>
        ${d.audit.length ? d.audit.slice(0, 40).map((a) => `<div class="list-row"><span class="small muted nowrap">${U.dateTime(a.at)}</span><span class="badge">${U.esc(a.action)}</span><span class="grow">${U.esc(a.detail)}</span><span class="small muted">${U.esc((S.user(a.userId) || {}).name || '')}</span></div>`).join('') : '<div class="empty small">Sin actividad</div>'}
      </div>`;
      b.querySelector('[data-a=exp]').onclick = () => {
        U.download(`respaldo_${U.stripAccents(S.branchName()).replace(/\W+/g, '_')}_${U.dayKey(Date.now())}.json`, S.exportBackup(), 'application/json');
        S.log('sistema', 'Copia de respaldo descargada');
        S.save();
      };
      const on = (a, fn) => { const x = b.querySelector(`[data-a=${a}]`); if (x) x.onclick = fn; };
      on('demo', async () => {
        if (!(await PZ.confirm('¿Borrar todas las ventas, cajas y movimientos de demostración de esta sucursal?', { danger: true, ok: 'Borrar' }))) return;
        try { await S.clearDemo(); PZ.toast('Listo, sucursal limpia para arrancar 🍕'); } catch (e) { PZ.toast(e.message, 'err'); }
        render(el);
      });
      on('load', async () => {
        if (!(await PZ.confirm('Se van a cargar unas 350 ventas ficticias de las últimas 2 semanas en esta sucursal. Después las podés borrar. ¿Continuar?'))) return;
        try { PZ.toast('Horneando ventas de ejemplo…', 'info'); const n = await PZ.seed.demoHistory(14); PZ.toast(`${n} ventas de demo cargadas`); } catch (e) { PZ.toast(e.message, 'err'); }
        render(el);
      });
      on('menu', () => { S.seedIfEmpty({ customers: false }); PZ.toast('Menú de ejemplo cargado'); render(el); });
    },
  };

  async function reloadMembers() {
    const meta = await PZ.cloud.orgMeta(S.ctx.orgId);
    S.ctx.members = meta.members;
    S.ctx.branches = meta.branches;
    S.afterLoad();
  }

  function editUser(u, done) {
    const R = PZ.auth.ROLES;
    const roles = Object.keys(R).filter((k) => k !== 'owner' && (k !== 'admin' || PZ.auth.isOwner()));
    const all = !u || !u.branchIds.length;
    const branches = PZ.app.allowedBranches();
    const m = PZ.modal({
      title: u ? '✏️ ' + U.esc(u.name) : '➕ Nuevo usuario',
      body: `
        <div class="grid-2">
          <label class="field"><span>Nombre</span><input name="name" value="${U.esc(u ? u.name : '')}" autofocus></label>
          <label class="field"><span>Usuario para ingresar</span><input name="username" value="${U.esc(u ? u.username : '')}" autocapitalize="off" ${u ? 'disabled' : 'placeholder="ej: caja.centro"'}></label>
          <label class="field"><span>Rol</span><select name="role">${roles.map((k) => `<option value="${k}" ${u && u.role === k ? 'selected' : ''}>${R[k].label}</option>`).join('')}</select></label>
          <label class="field"><span>${u ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña (mínimo 6)'}</span><input name="pass" type="password" autocomplete="new-password"></label>
        </div>
        <div class="opt-section">Sucursales donde trabaja</div>
        <label class="check"><input type="checkbox" name="all" ${all ? 'checked' : ''} ${PZ.auth.isOwner() ? '' : 'disabled'}> Todas las sucursales${PZ.auth.isOwner() ? '' : ' (solo el dueño)'}</label>
        <div class="branch-checks ${all && PZ.auth.isOwner() ? 'hidden' : ''}">${branches.map((b) => `<label class="check"><input type="checkbox" name="br" value="${b.id}" ${u && u.branchIds.includes(b.id) ? 'checked' : !u && b.id === S.ctx.branchId ? 'checked' : ''}> ${U.esc(b.name)}</label>`).join('')}</div>
        ${u ? `<label class="check mt"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuario activo (si lo desactivás no puede ingresar)</label>` : ''}`,
      footer: `${u ? '<button class="btn danger" data-a="del">Quitar</button><span class="grow"></span>' : ''}<button class="btn ghost" data-a="x">Cancelar</button><button class="btn primary" data-a="ok">Guardar</button>`,
    });
    const E = m.el;
    const v = (n) => E.querySelector(`[name=${n}]`).value.trim();
    const allBox = E.querySelector('[name=all]');
    allBox.onchange = () => E.querySelector('.branch-checks').classList.toggle('hidden', allBox.checked);
    E.querySelector('[data-a=x]').onclick = () => m.close();
    const del = E.querySelector('[data-a=del]');
    if (del) del.onclick = async () => {
      if (!(await PZ.confirm(`¿Quitar a ${U.esc(u.name)} del negocio? No va a poder ingresar más. Sus ventas se conservan.`, { danger: true, ok: 'Quitar' }))) return;
      try { await PZ.cloud.staff('delete', { user_id: u.id }); await reloadMembers(); m.close(); PZ.toast('Usuario quitado'); done(); } catch (e) { PZ.toast(e.message, 'err'); }
    };
    E.querySelector('[data-a=ok]').onclick = async () => {
      if (!navigator.onLine) return PZ.toast('Para gestionar usuarios hace falta conexión', 'warn');
      const name = v('name');
      const role = v('role');
      const pass = E.querySelector('[name=pass]').value;
      const branchIds = allBox.checked && PZ.auth.isOwner() ? [] : Array.from(E.querySelectorAll('[name=br]:checked')).map((x) => x.value);
      if (!name) return PZ.toast('Falta el nombre', 'warn');
      if (!(allBox.checked && PZ.auth.isOwner()) && !branchIds.length) return PZ.toast('Elegí al menos una sucursal', 'warn');
      const btn = E.querySelector('[data-a=ok]');
      btn.disabled = true;
      try {
        if (!u) {
          if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
          await PZ.cloud.staff('create', { name, username: v('username'), password: pass, role, branch_ids: branchIds });
        } else {
          const active = E.querySelector('[name=active]').checked;
          const { error } = await PZ.cloud.sb.from('members').update({ name, role, branch_ids: branchIds, active }).eq('org_id', S.ctx.orgId).eq('user_id', u.id);
          if (error) throw error;
          if (pass) await PZ.cloud.staff('password', { user_id: u.id, password: pass });
        }
        await reloadMembers();
        S.log('usuarios', `${u ? 'Edición' : 'Alta'} de ${name}`);
        S.save();
        m.close();
        PZ.toast(u ? 'Usuario actualizado' : `Usuario creado. Ingresa con “${v('username').toLowerCase()}”`, 'ok', 4000);
        done();
      } catch (e) {
        PZ.toast(e.message || 'No se pudo guardar', 'err', 5000);
      } finally {
        btn.disabled = false;
      }
    };
  }

  PZ.views.config = { title: 'Configuración', render };
})(window.PZ);
