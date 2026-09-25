/* ==========================================================================
   Vista: SUCURSALES — panel del dueño: todas las sucursales, comparación,
   estadísticas consolidadas y alta/edición de sucursales.
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  const S = PZ.store;
  const PALETTE = ['#d7263d', '#2a9d8f', '#e9a23b', '#6c8ebf', '#8e44ad', '#52b788', '#ff6b35', '#1d3557'];
  let range = '7d';
  let reqId = 0;

  function bounds() {
    const t = U.startOfDay().getTime();
    const now = new Date();
    switch (range) {
      case 'hoy': return [t, Date.now()];
      case '7d': return [t - 6 * 864e5, Date.now()];
      case '30d': return [t - 29 * 864e5, Date.now()];
      case 'mes': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Date.now()];
      case 'mesant': return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1];
      default: return [t, Date.now()];
    }
  }

  const visibleBranches = () => PZ.app.allowedBranches().concat(PZ.auth.isOwner() ? S.ctx.branches.filter((b) => !b.active) : []);
  const colorOf = (id) => PALETTE[Math.max(0, S.ctx.branches.findIndex((b) => b.id === id)) % PALETTE.length];

  function render(el) {
    const branches = visibleBranches();
    el.innerHTML = `
      <div class="row-flex space-between mb">
        <div class="seg">${[['hoy', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['mes', 'Este mes'], ['mesant', 'Mes pasado']].map(([k, l]) => `<button data-r="${k}" class="${range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="row-flex">
          ${PZ.auth.isOwner() ? '<button class="btn ghost" data-a="org">✏️ Negocio</button><button class="btn primary" data-a="new">➕ Nueva sucursal</button>' : ''}
        </div>
      </div>
      <div class="org-head card mb">
        <div class="row-flex"><div class="brand-mini">${PZ.brandLogo(46)}</div><div><h2 style="margin:0">${U.esc(S.ctx.org ? S.ctx.org.name : '')}</h2><div class="muted small">${branches.filter((b) => b.active).length} sucursal(es) activa(s) · estadísticas de todas las que podés ver</div></div></div>
      </div>
      <div class="stats-body"><div class="card empty"><span class="e-ico">🍕</span>Juntando los números de todas las sucursales…</div></div>`;
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { range = b.dataset.r; render(el); });
    const on = (a, fn) => { const b = el.querySelector(`[data-a=${a}]`); if (b) b.onclick = fn; };
    on('new', () => branchModal(null, () => render(el)));
    on('org', orgModal);
    load(el);
  }

  async function load(el) {
    const my = ++reqId;
    const body = el.querySelector('.stats-body');
    if (!navigator.onLine) {
      body.innerHTML = '<div class="card empty"><span class="e-ico">📴</span>Las estadísticas generales necesitan conexión a internet.</div>';
      return;
    }
    const [from, to] = bounds();
    let rep;
    let live;
    try {
      [rep, live] = await Promise.all([PZ.cloud.report(S.ctx.orgId, from, to), PZ.cloud.live(S.ctx.orgId)]);
    } catch (e) {
      body.innerHTML = `<div class="card empty"><span class="e-ico">🔥</span>No se pudieron cargar las estadísticas: ${U.esc(e.message)}</div>`;
      return;
    }
    if (my !== reqId || !el.isConnected) return;
    const C = PZ.charts;
    const L = PZ.labels;
    const branches = visibleBranches();
    const byBranch = Object.fromEntries((rep.by_branch || []).map((b) => [b.branch_id, b]));
    const total = (rep.by_branch || []).reduce((a, b) => a + Number(b.sales), 0);
    const tickets = (rep.by_branch || []).reduce((a, b) => a + Number(b.tickets), 0);
    const delivery = (rep.by_branch || []).reduce((a, b) => a + Number(b.delivery), 0);
    const openCash = new Set((live.open_cash || []).map((x) => x));
    const active = live.active_orders || {};
    const best = (rep.by_branch || []).slice().sort((a, b) => b.sales - a.sales)[0];

    // Serie diaria apilada por sucursal
    const days = [];
    for (let d = U.startOfDay(from).getTime(); d <= to; d += 864e5) days.push(U.dayKey(d));
    const dayMap = {};
    (rep.by_day || []).forEach((r) => { dayMap[r.day] = dayMap[r.day] || {}; dayMap[r.day][r.branch_id] = Number(r.sales); });
    const hours = Array.from({ length: 24 }, (_, h) => ({ label: h + 'h', value: 0 }));
    (rep.by_hour || []).forEach((r) => { hours[r.hour].value = Number(r.sales); });
    const firstH = hours.findIndex((h) => h.value > 0);
    const lastH = 23 - hours.slice().reverse().findIndex((h) => h.value > 0);

    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="k-ico">💰</span><div class="k-label">Ventas del negocio</div><div class="k-value">${U.money(total)}</div><div class="k-sub">${branches.filter((b) => b.active).length} sucursales</div></div>
        <div class="kpi"><span class="k-ico">🧾</span><div class="k-label">Tickets</div><div class="k-value">${tickets}</div><div class="k-sub">Promedio ${U.money(tickets ? total / tickets : 0)}</div></div>
        <div class="kpi"><span class="k-ico">🏆</span><div class="k-label">Sucursal que más vende</div><div class="k-value" style="font-size:1.25em">${best ? U.esc(S.branchName(best.branch_id) || '—') : '—'}</div><div class="k-sub">${best && total ? Math.round((best.sales / total) * 100) + '% del total' : '&nbsp;'}</div></div>
        <div class="kpi"><span class="k-ico">🛵</span><div class="k-label">Envíos cobrados</div><div class="k-value">${U.money(delivery)}</div><div class="k-sub">${Object.values(active).reduce((a, b) => a + Number(b), 0)} pedidos en curso ahora</div></div>
      </div>

      <div class="branch-grid mt">
        ${branches.map((b) => {
          const r = byBranch[b.id] || { sales: 0, tickets: 0 };
          const share = total ? (Number(r.sales) / total) * 100 : 0;
          const addr = (b.settings && b.settings.business && b.settings.business.address) || '';
          return `<div class="branch-card ${b.id === S.ctx.branchId ? 'current' : ''} ${b.active ? '' : 'inactive'}" style="--bc:${colorOf(b.id)}">
            <div class="row-flex space-between"><h3>🏪 ${U.esc(b.name)}</h3>${b.id === S.ctx.branchId ? '<span class="badge pri">Estás acá</span>' : ''}${b.active ? '' : '<span class="badge err">Inactiva</span>'}</div>
            ${addr ? `<div class="small muted">📍 ${U.esc(addr)}</div>` : ''}
            <div class="bc-sales">${U.money(r.sales)}</div>
            <div class="small muted">${r.tickets} tickets · promedio ${U.money(r.tickets ? r.sales / r.tickets : 0)}</div>
            <div class="bc-bar"><i style="width:${share}%"></i></div>
            <div class="small muted">${Math.round(share)}% del negocio</div>
            <div class="row-flex mt" style="gap:6px">
              <span class="badge ${openCash.has(b.id) ? 'ok' : 'err'}">${openCash.has(b.id) ? '● Caja abierta' : '● Caja cerrada'}</span>
              <span class="badge ${active[b.id] ? 'warn' : ''}">🔥 ${active[b.id] || 0} en curso</span>
            </div>
            <div class="row-flex mt" style="gap:6px">
              ${b.id !== S.ctx.branchId && b.active ? `<button class="btn sm primary" data-go="${b.id}">Entrar →</button>` : ''}
              ${PZ.auth.isAdmin() ? `<button class="btn sm ghost" data-edit="${b.id}">✏️ Editar</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="card mt"><h3>📅 Ventas por día y sucursal</h3>
        ${C.stacked(days.map((d) => ({ label: d.slice(8) + '/' + d.slice(5, 7), values: branches.map((b) => (dayMap[d] || {})[b.id] || 0) })), branches.map((b) => ({ label: b.name, color: colorOf(b.id) })))}
      </div>
      <div class="dash">
        <div class="card"><h3>⚖️ Comparación de sucursales</h3>${C.hbars(branches.map((b) => ({ label: b.name, value: Number((byBranch[b.id] || {}).sales || 0) })).sort((a, b) => b.value - a.value), { money: true })}</div>
        <div class="card"><h3>💳 Medios de pago (todo el negocio)</h3>${C.donut((rep.by_method || []).map((m) => ({ label: L.method[m.method] || m.method, value: Number(m.amount), color: C.methodColors[m.method] || '#999' })))}</div>
      </div>
      <div class="dash">
        <div class="card"><h3>🏆 Productos más vendidos (todas)</h3>${C.hbars((rep.top_products || []).map((p) => ({ label: `${p.name} (${U.num(p.qty)})`, value: Number(p.revenue) })), { money: true })}</div>
        <div class="card"><h3>🛵 Tipo de pedido</h3>${C.donut((rep.by_type || []).map((t) => ({ label: L.type[t.type] || t.type, value: Number(t.sales), color: { mostrador: '#f4a261', delivery: '#e63946', retiro: '#2a9d8f', mesa: '#6c8ebf' }[t.type] || '#999' })))}</div>
      </div>
      <div class="card mt"><h3>⏰ Horarios pico (todo el negocio)</h3>${firstH >= 0 ? C.bars(hours.slice(firstH, lastH + 1)) : '<div class="empty small">Sin ventas en el período</div>'}</div>`;

    body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => PZ.app.openBranch(b.dataset.go).catch((e) => PZ.toast(e.message, 'err')));
    body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => branchModal(S.branch(b.dataset.edit), () => render(el)));
  }

  /* ---------------- Alta / edición de sucursal ---------------- */
  function branchModal(b, done) {
    const isNew = !b;
    const bz = b && b.settings && b.settings.business ? b.settings.business : {};
    const m = PZ.modal({
      title: isNew ? '➕ Nueva sucursal' : '✏️ ' + U.esc(b.name),
      body: `
        <label class="field"><span>Nombre de la sucursal</span><input name="name" value="${U.esc(b ? b.name : '')}" placeholder="Ej: Centro, Barrio Norte" autofocus></label>
        <div class="grid-2">
          <label class="field"><span>Dirección</span><input name="address" value="${U.esc(bz.address || '')}"></label>
          <label class="field"><span>Teléfono / WhatsApp</span><input name="phone" value="${U.esc(bz.phone || '')}" inputmode="tel"></label>
        </div>
        ${isNew ? `
          <label class="check"><input type="checkbox" name="copy" checked> Copiar configuración de “${U.esc(S.branchName())}” (ticket, cobros, zonas de envío)</label>
          <label class="check"><input type="checkbox" name="ings" checked> Copiar la lista de insumos (con stock en cero)</label>
          <p class="small muted">El menú, los precios y los clientes son compartidos por todas las sucursales. Caja, pedidos y stock son propios de cada una.</p>`
        : `${b.id !== S.ctx.branchId && PZ.auth.isOwner() ? `<label class="check"><input type="checkbox" name="active" ${b.active ? 'checked' : ''}> Sucursal activa</label>` : ''}`}`,
      footer: `<button class="btn ghost" data-a="x">Cancelar</button><button class="btn primary" data-a="ok">${isNew ? 'Crear sucursal' : 'Guardar'}</button>`,
    });
    const E = m.el;
    const v = (n) => (E.querySelector(`[name=${n}]`) || {}).value || '';
    E.querySelector('[data-a=x]').onclick = () => m.close();
    E.querySelector('[data-a=ok]').onclick = async () => {
      const name = v('name').trim();
      if (!name) return PZ.toast('Poné un nombre', 'warn');
      if (!navigator.onLine) return PZ.toast('Para crear o editar sucursales hace falta conexión', 'warn');
      const btn = E.querySelector('[data-a=ok]');
      btn.disabled = true;
      try {
        if (isNew) {
          const base = E.querySelector('[name=copy]').checked
            ? JSON.parse(JSON.stringify(S.data.settings))
            : PZ.seed.settings(S.ctx.org ? S.ctx.org.name : '', name);
          base.business = { ...base.business, address: v('address').trim(), phone: v('phone').trim(), branchLabel: name };
          base.ticket = { ...base.ticket, pos: S.ctx.branches.length + 1 };
          const { data, error } = await PZ.cloud.sb.from('branches').insert({ org_id: S.ctx.orgId, name, settings: base }).select().single();
          if (error) throw error;
          if (E.querySelector('[name=ings]').checked && S.data.ingredients.length) {
            await PZ.cloud.upsertDocs(S.data.ingredients.map((i, idx) => ({
              org_id: S.ctx.orgId, col: 'ingredient', id: `${data.id}/${i.id}`, branch_id: data.id, data: { ...i, stock: 0, _i: idx },
            })));
          }
          if (!S.ctx.branches.some((x) => x.id === data.id)) S.ctx.branches.push(data);
          S.log('sucursales', `Nueva sucursal: ${name}`);
          S.save();
          m.close();
          PZ.celebrate();
          if (await PZ.confirm(`¡Sucursal “${U.esc(name)}” creada! ¿Querés entrar ahora para configurarla?`, { ok: 'Entrar', title: '🏪 Lista' })) return PZ.app.openBranch(data.id);
        } else {
          const settings = b.id === S.ctx.branchId ? S.data.settings : JSON.parse(JSON.stringify(b.settings || {}));
          settings.business = { ...(settings.business || {}), address: v('address').trim(), phone: v('phone').trim() };
          const patch = { name, settings };
          const act = E.querySelector('[name=active]');
          if (act) patch.active = act.checked;
          if (b.id === S.ctx.branchId) { S.save(); S.diff(); await S.flush(); delete patch.settings; }
          const { error } = await PZ.cloud.sb.from('branches').update(patch).eq('id', b.id);
          if (error) throw error;
          Object.assign(b, patch);
          m.close();
          PZ.toast('Sucursal actualizada');
          PZ.app.refreshChrome();
        }
        done();
      } catch (e) {
        PZ.toast(e.message || 'No se pudo guardar', 'err');
      } finally {
        btn.disabled = false;
      }
    };
  }

  function orgModal() {
    PZ.prompt('Nombre del negocio', { value: S.ctx.org ? S.ctx.org.name : '', title: '✏️ Negocio' }).then(async (name) => {
      if (!name || !name.trim()) return;
      const { error } = await PZ.cloud.sb.from('organizations').update({ name: name.trim() }).eq('id', S.ctx.orgId);
      if (error) return PZ.toast(error.message, 'err');
      S.ctx.org.name = name.trim();
      PZ.toast('Nombre actualizado');
      PZ.app.renderShell();
      PZ.app.route();
    });
  }

  PZ.views.sucursales = { title: 'Sucursales', live: true, render };
})(window.PZ);
