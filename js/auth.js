/* ==========================================================================
   PZ.auth — sesión (Supabase Auth), roles y permisos
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;

  const ROLES = {
    owner: { label: 'Dueño/a', can: ['*'] },
    admin: { label: 'Encargado/a', can: ['*'] },
    cajero: { label: 'Cajero/a', can: ['inicio', 'vender', 'pedidos', 'caja', 'clientes', 'historial', 'stock'] },
    cocina: { label: 'Cocina', can: ['pedidos'] },
    delivery: { label: 'Delivery', can: ['pedidos'] },
  };

  const A = (PZ.auth = {
    ROLES,
    current: null,   // { id, name, username, role, branchIds, orgId }
    memberships: [],

    /** Con la membresía elegida arma el usuario actual */
    use(member) {
      A.current = {
        id: member.user_id,
        name: member.name,
        username: member.username,
        role: member.role,
        branchIds: member.branch_ids || [],
        orgId: member.org_id,
      };
      return A.current;
    },

    async login(user, password) {
      await PZ.cloud.signIn(user, password);
      A.memberships = await PZ.cloud.memberships();
      if (!A.memberships.length) {
        await PZ.cloud.signOut();
        throw new Error('Tu usuario no pertenece a ningún negocio activo. Hablá con el dueño.');
      }
      return A.memberships;
    },

    async logout() {
      A.current = null;
      A.memberships = [];
      await PZ.cloud.signOut();
    },

    can(section) {
      if (!A.current) return false;
      if (section === 'sucursales') return A.isAdmin();
      const r = ROLES[A.current.role];
      return !!r && (r.can.includes('*') || r.can.includes(section));
    },

    isAdmin: () => !!A.current && ['owner', 'admin'].includes(A.current.role),
    isOwner: () => !!A.current && A.current.role === 'owner',

    /**
     * Para acciones sensibles (anular, cancelar, descuento grande) cuando el
     * usuario no es encargado: pide usuario y clave de un encargado o dueño.
     */
    requireAdmin(reason = 'Esta acción requiere autorización') {
      if (A.isAdmin()) return Promise.resolve(true);
      return new Promise((resolve) => {
        let done = false;
        const m = PZ.modal({
          title: '🔐 ' + U.esc(reason),
          size: 'sm',
          body: `<p class="muted" style="margin-top:0">Pedile a un encargado o al dueño que ingrese sus datos.</p>
            <label class="field"><span>Usuario o email</span><input class="u" autocapitalize="off" autocomplete="off" autofocus></label>
            <label class="field"><span>Contraseña</span><input class="p" type="password" autocomplete="off"></label>`,
          footer: `<button class="btn ghost" data-a="x">Cancelar</button><button class="btn primary" data-a="ok">Autorizar</button>`,
          onClose: () => { if (!done) resolve(false); },
        });
        const ok = m.el.querySelector('[data-a=ok]');
        m.el.querySelector('[data-a=x]').onclick = () => m.close();
        m.el.querySelector('.p').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
        ok.onclick = async () => {
          if (!navigator.onLine) return PZ.toast('Para autorizar hace falta conexión', 'warn');
          ok.disabled = true;
          const list = await PZ.cloud.verifyOther(m.el.querySelector('.u').value, m.el.querySelector('.p').value);
          ok.disabled = false;
          const { orgId, branchId } = PZ.store.ctx;
          const valid = (list || []).some((x) => x.org_id === orgId && x.active && (x.role === 'owner' || (x.role === 'admin' && (!x.branch_ids.length || x.branch_ids.includes(branchId)))));
          if (!valid) return PZ.toast('Datos incorrectos o sin permiso de encargado', 'err');
          done = true;
          m.close();
          PZ.store.log('autorización', `${reason} (autorizado por otro usuario)`);
          resolve(true);
        };
      });
    },
  });
})(window.PZ);
