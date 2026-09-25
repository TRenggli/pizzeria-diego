/* ==========================================================================
   PZ.cloud — todo lo que habla con Supabase: sesión, lectura, escritura,
   tiempo real, numeración y estadísticas del negocio.
   ========================================================================== */
(function (PZ) {
  const CFG = window.PZ_CONFIG;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pz-auth' },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  const toEmail = (u) => {
    u = String(u || '').trim().toLowerCase();
    return u.includes('@') ? u : `${u}@${CFG.staffDomain}`;
  };

  const C = (PZ.cloud = {
    sb,
    online: navigator.onLine,
    channel: null,

    /* ---------------- Sesión ---------------- */
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },

    async signIn(user, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(user), password });
      if (error) {
        if (!navigator.onLine) throw new Error('Sin conexión. Para el primer ingreso hace falta internet.');
        throw new Error(/invalid/i.test(error.message) ? 'Usuario o contraseña incorrectos' : error.message);
      }
      return data.session;
    },

    async signOut() {
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* sin conexión: igual se borra local */ }
      C.unsubscribe();
    },

    /** Verifica credenciales de otra persona sin tocar la sesión actual */
    async verifyOther(user, password) {
      const tmp = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: 'pz-auth-tmp' },
      });
      const { data, error } = await tmp.auth.signInWithPassword({ email: toEmail(user), password });
      if (error) return null;
      const uid = data.user.id;
      const { data: m } = await tmp.from('members').select('role, active, branch_ids, org_id').eq('user_id', uid);
      try { await tmp.auth.signOut({ scope: 'local' }); } catch (e) { /* noop */ }
      return m || [];
    },

    async updateMyPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },

    /** Canje de código de sucursal (público). check=true solo valida. */
    async join(payload) {
      const res = await fetch(`${CFG.supabaseUrl}/functions/v1/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey, Authorization: `Bearer ${CFG.supabaseKey}` },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) throw new Error(out.error || 'No se pudo usar el código');
      return out;
    },

    async invoke(fn, body) {
      const { data, error } = await sb.functions.invoke(fn, { body });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j.error) msg = j.error; } catch (e) { /* noop */ }
        throw new Error(msg);
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },

    staff(action, body) { return C.invoke('staff', { action, org_id: PZ.store.ctx.orgId, ...body }); },
    platform(action, body) { return C.invoke('platform', { action, ...body }); },

    async isPlatformAdmin() {
      const s = await C.session();
      if (!s) return false;
      const { data } = await sb.from('platform_admins').select('user_id').eq('user_id', s.user.id).maybeSingle();
      return !!data;
    },

    async platformOrgs() {
      const { data, error } = await sb.rpc('platform_orgs');
      if (error) throw error;
      return data || [];
    },

    async updateOrg(orgId, patch) {
      const { error } = await sb.from('organizations').update(patch).eq('id', orgId);
      if (error) throw error;
    },

    /* ---------------- Invitaciones ---------------- */
    async createInvite(branchId, role, days = 7, note = '') {
      const { data, error } = await sb.rpc('create_invite', { p_branch: branchId, p_role: role, p_days: days, p_note: note });
      if (error) throw error;
      return data;
    },
    async invites(orgId) {
      const { data, error } = await sb.from('invites').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    async revokeInvite(code) {
      const { error } = await sb.from('invites').update({ revoked: true }).eq('code', code);
      if (error) throw error;
    },

    /* ---------------- Menú modelo y menú de sucursales ---------------- */
    async menuModel(orgId) {
      const { data } = await sb.from('docs').select('data').eq('org_id', orgId).eq('col', 'menu_model').eq('id', 'model').maybeSingle();
      return data ? data.data : null;
    },
    async saveMenuModel(orgId, model) {
      await C.upsertDocs([{ org_id: orgId, col: 'menu_model', id: 'model', branch_id: '', data: { ...model, updatedAt: Date.now() } }]);
    },
    async branchMenu(orgId, branchId) {
      const { data, error } = await sb.from('docs').select('col, id, data').eq('org_id', orgId).eq('branch_id', branchId).in('col', ['category', 'product', 'extra']);
      if (error) throw error;
      const out = { categories: [], products: [], extras: [] };
      const key = { category: 'categories', product: 'products', extra: 'extras' };
      (data || []).forEach((r) => out[key[r.col]].push({ ...r.data, id: r.id.slice(r.id.indexOf('/') + 1) }));
      Object.values(out).forEach((a) => a.sort((x, y) => (x._i ?? 0) - (y._i ?? 0)));
      return out;
    },
    /** Escribe un menú completo en una sucursal. replace=true borra lo que no esté en el menú nuevo. */
    async writeBranchMenu(orgId, branchId, menu, { replace = false } = {}) {
      const rows = [];
      const push = (col, arr) => arr.forEach((x, i) => rows.push({ org_id: orgId, col, id: `${branchId}/${x.id}`, branch_id: branchId, data: { ...x, _i: i } }));
      push('category', menu.categories || []);
      push('product', menu.products || []);
      push('extra', menu.extras || []);
      if (replace) {
        const cur = await C.branchMenu(orgId, branchId);
        const keep = new Set(rows.map((r) => r.col + ':' + r.id));
        const colOf = { categories: 'category', products: 'product', extras: 'extra' };
        for (const [k, arr] of Object.entries(cur)) {
          for (const x of arr) {
            if (!keep.has(colOf[k] + ':' + `${branchId}/${x.id}`)) await C.deleteDoc(orgId, colOf[k], `${branchId}/${x.id}`);
          }
        }
      }
      await C.upsertDocs(rows);
    },

    async finance(orgId, from, to) {
      const { data, error } = await sb.rpc('org_finance', { p_org: orgId, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() });
      if (error) throw error;
      return data;
    },

    /** Tiempo real a nivel negocio (panel del dueño) */
    subscribeOrg(orgId, onEvent) {
      C.unsubscribe();
      C.channel = sb.channel(`org-panel-${orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `org_id=eq.${orgId}` }, () => onEvent('orders'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'branches', filter: `org_id=eq.${orgId}` }, () => onEvent('branches'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `org_id=eq.${orgId}` }, () => onEvent('members'))
        .subscribe((status) => { C.realtime = status; PZ.store && PZ.store.emitStatus(); });
    },

    /* ---------------- Lectura ---------------- */
    async memberships() {
      const s = await C.session();
      if (!s) return [];
      const { data, error } = await sb.from('members').select('*, organizations(id, name, owner_id, status, features)').eq('user_id', s.user.id).eq('active', true);
      if (error) throw error;
      return (data || []).filter((m) => m.organizations);
    },

    async orgMeta(orgId) {
      const [br, mem, org] = await Promise.all([
        sb.from('branches').select('*').eq('org_id', orgId).order('created_at'),
        sb.from('members').select('*').eq('org_id', orgId).order('created_at'),
        sb.from('organizations').select('*').eq('id', orgId).single(),
      ]);
      if (br.error) throw br.error;
      if (mem.error) throw mem.error;
      return { branches: br.data, members: mem.data, org: org.data };
    },

    /** Trae todo lo que necesita una sucursal para operar */
    async branchData(orgId, branchId, days = 120) {
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const all = async (q) => {
        // pagina de a 1000 (límite de la API)
        let out = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await q().range(from, from + 999);
          if (error) throw error;
          out = out.concat(data);
          if (data.length < 1000) break;
        }
        return out;
      };
      const [docs, orders, active, branch] = await Promise.all([
        all(() => sb.from('docs').select('col, id, branch_id, data').eq('org_id', orgId).eq('branch_id', branchId).order('col').order('id')),
        all(() => sb.from('orders').select('id, data').eq('branch_id', branchId).gte('created_at', since).order('created_at')),
        sb.from('orders').select('id, data').eq('branch_id', branchId).lt('created_at', since).not('status', 'in', '(entregado,cancelado)').eq('voided', false),
        sb.from('branches').select('*').eq('id', branchId).single(),
      ]);
      if (branch.error) throw branch.error;
      return { docs, orders: orders.concat(active.data || []), branch: branch.data };
    },

    async reserve(branchId, kind, count) {
      const { data, error } = await sb.rpc('reserve_numbers', { p_branch: branchId, p_kind: kind, p_count: count });
      if (error) throw error;
      return Number(data);
    },

    async report(orgId, from, to) {
      const { data, error } = await sb.rpc('org_report', { p_org: orgId, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() });
      if (error) throw error;
      return data;
    },

    async live(orgId) {
      const { data, error } = await sb.rpc('branches_live', { p_org: orgId });
      if (error) throw error;
      return data;
    },

    /* ---------------- Escritura ---------------- */
    async upsertDocs(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.rpc('upsert_docs', { p_rows: rows.slice(i, i + 200) });
        if (error) throw error;
      }
    },
    async upsertOrders(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.rpc('upsert_orders', { p_rows: rows.slice(i, i + 200) });
        if (error) throw error;
      }
    },
    async deleteDoc(orgId, col, id) {
      const { error } = await sb.from('docs').delete().match({ org_id: orgId, col, id });
      if (error) throw error;
    },
    async saveSettings(branchId, settings) {
      const { error } = await sb.from('branches').update({ settings }).eq('id', branchId);
      if (error) throw error;
    },

    /* ---------------- Tiempo real ---------------- */
    subscribe(orgId, branchId, onEvent) {
      C.unsubscribe();
      C.channel = sb.channel(`org-${orgId}-${branchId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `org_id=eq.${orgId}` }, (p) => onEvent('docs', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, (p) => onEvent('orders', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'branches', filter: `org_id=eq.${orgId}` }, (p) => onEvent('branches', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `org_id=eq.${orgId}` }, (p) => onEvent('members', p))
        .subscribe((status) => { C.realtime = status; PZ.store && PZ.store.emitStatus(); });
    },
    unsubscribe() {
      if (C.channel) { sb.removeChannel(C.channel); C.channel = null; }
    },
  });

  window.addEventListener('online', () => { C.online = true; PZ.store && PZ.store.onOnline(); });
  window.addEventListener('offline', () => { C.online = false; PZ.store && PZ.store.emitStatus(); });
})(window.PZ);
