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
      if (!PZ.auth.isAdmin()) { b.innerHTML = '<div class="card empty">Solo administradores</div>'; return; }
      const R = PZ.auth.ROLES;
      b.innerHTML = `<div class="card">
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead><tbody>
          ${S.data.users.map((u) => `<tr><td><b>${U.esc(u.name)}</b></td><td>${U.esc(u.username)}</td><td>${R[u.role].label}</td><td class="small muted">${u.lastLogin ? U.dateTime(u.lastLogin) : '-'}</td>
            <td><span class="badge ${u.active ? 'ok' : 'err'}">${u.active ? 'Activo' : 'Inactivo'}</span></td><td class="actions"><button class="btn sm ghost" data-e="${u.id}">✏️</button></td></tr>`).join('')}
        </tbody></table></div>
        <button class="btn primary mt" data-a="new">➕ Nuevo usuario</button>
        <div class="mt small muted">
          <b>Permisos:</b> Administrador = todo · Cajero/a = vender, pedidos, caja, clientes, ventas y stock · Cocina y Delivery = solo el tablero de pedidos.<br>
          Anular ventas, cancelar pedidos y descuentos mayores al 20% piden clave de administrador.
        </div>
      </div>`;
      b.querySelector('[data-a=new]').onclick = () => editUser(null, () => render(el));
      b.querySelectorAll('[data-e]').forEach((x) => x.onclick = () => editUser(S.user(x.dataset.e), () => render(el)));
    },

    apariencia(b, el) {
      const st = S.data.settings;
      b.innerHTML = `<div class="card"><h3>🍕 Elegí el sabor del sistema</h3>
        <div class="theme-grid">${PZ.themes.map((t) => `<button class="theme-card ${st.theme === t.id ? 'on' : ''}" data-th="${t.id}"><div class="sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>${t.name}<div class="small muted">${t.desc}</div></button>`).join('')}</div>
        <label class="check mt"><input type="checkbox" data-k="motion"> Animaciones activadas (desactivalas si el equipo es lento)</label>
      </div>`;
      bind(b, () => PZ.app.applyTheme());
      b.querySelectorAll('[data-th]').forEach((x) => x.onclick = () => { PZ.app.setTheme(x.dataset.th); render(el); });
    },

    sistema(b, el) {
      const d = S.data;
      const size = new Blob([JSON.stringify(d)]).size;
      b.innerHTML = `<div class="dash" style="margin-top:0">
        <div class="card"><h3>🛟 Respaldo</h3>
          <p class="muted" style="margin-top:0">Los datos se guardan en este dispositivo. Descargá un respaldo cada semana (o antes de cambiar de celular/tablet) y guardalo en Drive o mandalo por mail.</p>
          <div class="row-flex">
            <button class="btn primary" data-a="exp">⬇️ Descargar respaldo</button>
            <label class="btn ghost">⬆️ Restaurar respaldo<input type="file" accept=".json,application/json" data-a="imp" hidden></label>
          </div>
          <p class="small muted">Tamaño actual: ${(size / 1024).toFixed(0)} KB · ${d.orders.length} pedidos · ${d.customers.length} clientes</p>
        </div>
        <div class="card"><h3>🧹 Datos</h3>
          ${d.demo ? '<p style="margin-top:0">Hay <b>ventas de demostración</b> cargadas. Borralas antes de empezar a usar el sistema en serio (se conservan el menú, clientes y configuración).</p><button class="btn accent" data-a="demo">🧹 Borrar ventas de demo</button>' : '<p class="muted" style="margin-top:0">No hay datos de demo.</p>'}
          ${PZ.auth.isAdmin() ? '<hr style="border:0;border-top:1px dashed var(--line);margin:16px 0"><button class="btn danger" data-a="reset">⚠️ Borrar TODO y empezar de cero</button>' : ''}
        </div>
      </div>
      <div class="card mt"><h3>🕵️ Registro de actividad</h3>
        ${d.audit.length ? d.audit.slice(0, 40).map((a) => `<div class="list-row"><span class="small muted nowrap">${U.dateTime(a.at)}</span><span class="badge">${U.esc(a.action)}</span><span class="grow">${U.esc(a.detail)}</span><span class="small muted">${U.esc((S.user(a.userId) || {}).name || '')}</span></div>`).join('') : '<div class="empty small">Sin actividad</div>'}
      </div>`;
      b.querySelector('[data-a=exp]').onclick = () => {
        U.download(`respaldo_pizzeria_${U.dayKey(Date.now())}.json`, JSON.stringify(d), 'application/json');
        S.log('sistema', 'Respaldo descargado');
        S.save();
      };
      b.querySelector('[data-a=imp]').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          if (!data.settings || !Array.isArray(data.orders)) throw new Error('El archivo no es un respaldo válido');
          if (!(await PZ.confirm(`Esto reemplaza TODOS los datos actuales por el respaldo (${data.orders.length} pedidos). ¿Continuar?`, { danger: true, ok: 'Restaurar' }))) return;
          await S.replaceAll(data);
          PZ.toast('Respaldo restaurado');
          setTimeout(() => location.reload(), 600);
        } catch (ex) { PZ.toast(ex.message || 'Archivo inválido', 'err'); }
      };
      const demo = b.querySelector('[data-a=demo]');
      if (demo) demo.onclick = async () => {
        if (!(await PZ.confirm('¿Borrar todas las ventas, cajas y movimientos de demostración?', { danger: true, ok: 'Borrar' }))) return;
        S.clearDemo();
        PZ.toast('Listo, sistema limpio para arrancar 🍕');
        render(el);
      };
      const reset = b.querySelector('[data-a=reset]');
      if (reset) reset.onclick = async () => {
        const w = await PZ.prompt('Escribí BORRAR para confirmar', { title: 'Borrar todo' });
        if (w !== 'BORRAR') return;
        const fresh = await S.seed();
        fresh.orders = []; fresh.cashSessions = []; fresh.cashMoves = []; fresh.counters = { order: 1, ticket: 1 }; fresh.demo = false;
        await S.replaceAll(fresh);
        PZ.auth.logout();
        location.reload();
      };
    },
  };

  function editUser(u, done) {
    const R = PZ.auth.ROLES;
    const m = PZ.modal({
      title: u ? '✏️ ' + U.esc(u.name) : '➕ Nuevo usuario',
      body: `
        <div class="grid-2">
          <label class="field"><span>Nombre</span><input name="name" value="${U.esc(u ? u.name : '')}" autofocus></label>
          <label class="field"><span>Usuario (para ingresar)</span><input name="username" value="${U.esc(u ? u.username : '')}" autocapitalize="off"></label>
          <label class="field"><span>Rol</span><select name="role">${Object.keys(R).map((k) => `<option value="${k}" ${u && u.role === k ? 'selected' : ''}>${R[k].label}</option>`).join('')}</select></label>
          <label class="field"><span>${u ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña'}</span><input name="pass" type="password" autocomplete="new-password"></label>
        </div>
        ${u ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuario activo</label>` : ''}`,
      footer: `<button class="btn ghost" data-a="x">Cancelar</button><button class="btn primary" data-a="ok">Guardar</button>`,
    });
    const E = m.el;
    const v = (n) => E.querySelector(`[name=${n}]`).value.trim();
    E.querySelector('[data-a=x]').onclick = () => m.close();
    E.querySelector('[data-a=ok]').onclick = async () => {
      const username = v('username').toLowerCase();
      if (!v('name') || !username) return PZ.toast('Completá nombre y usuario', 'warn');
      if (S.data.users.some((x) => x.username.toLowerCase() === username && x !== u)) return PZ.toast('Ese usuario ya existe', 'warn');
      const pass = E.querySelector('[name=pass]').value;
      if (!u && pass.length < 6) return PZ.toast('La contraseña debe tener al menos 6 caracteres', 'warn');
      if (u && pass && pass.length < 6) return PZ.toast('La contraseña debe tener al menos 6 caracteres', 'warn');
      const role = v('role');
      const active = u ? E.querySelector('[name=active]').checked : true;
      const admins = S.data.users.filter((x) => x.role === 'admin' && x.active && x !== u).length;
      if (u && u.role === 'admin' && (role !== 'admin' || !active) && !admins) return PZ.toast('Tiene que quedar al menos un administrador activo', 'warn');
      if (u) {
        Object.assign(u, { name: v('name'), username, role, active });
        if (pass) u.passHash = await U.sha256(pass);
      } else {
        S.data.users.push({ id: U.uid('u-'), name: v('name'), username, role, active: true, passHash: await U.sha256(pass) });
      }
      S.log('usuarios', `${u ? 'Edición' : 'Alta'} de ${v('name')}`);
      S.save(); m.close(); PZ.toast('Usuario guardado'); done();
    };
  }

  PZ.views.config = { title: 'Configuración', render };
})(window.PZ);
