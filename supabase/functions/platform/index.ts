// Panel de plataforma (solo el creador del sistema):
//   bootstrap       → crea el primer administrador de plataforma (solo si no hay ninguno)
//   create_org      → crea negocio + dueño + primera sucursal con los módulos elegidos
//   reset_password  → cambia la contraseña de cualquier usuario de un negocio
import { adminClient, cors, dupMsg, json, loginEmail, validUsername } from '../_shared/common.ts';

const DEFAULT_FEATURES = { delivery: true, mesas: true, stock: true, gastos: true, maxBranches: 10 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const admin = adminClient();
    const body = await req.json();
    const { action } = body;

    if (action === 'bootstrap') {
      const { count } = await admin.from('platform_admins').select('*', { count: 'exact', head: true });
      if (count) return json({ error: 'La plataforma ya tiene administrador' }, 403);
      const username = String(body.username || '').trim().toLowerCase();
      if (!validUsername(username) && !username.includes('@')) return json({ error: 'Usuario inválido' }, 400);
      if (!body.password || String(body.password).length < 10) return json({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email: loginEmail(username), password: body.password, email_confirm: true,
        user_metadata: { name: body.name || 'Administrador', platform: true },
      });
      if (error || !data.user) return json({ error: dupMsg(error?.message || '', 'Ese usuario ya existe') }, 400);
      await admin.from('platform_admins').insert({ user_id: data.user.id });
      return json({ ok: true });
    }

    // Todo lo demás requiere ser administrador de plataforma
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const caller = auth?.user;
    if (!caller) return json({ error: 'Sesión inválida' }, 401);
    const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', caller.id).maybeSingle();
    if (!pa) return json({ error: 'Solo para el administrador de la plataforma' }, 403);

    if (action === 'create_org') {
      const orgName = String(body.orgName || '').trim();
      const ownerName = String(body.ownerName || '').trim();
      const ownerUser = String(body.ownerUser || '').trim().toLowerCase();
      if (!orgName) return json({ error: 'Falta el nombre del negocio' }, 400);
      if (!ownerName) return json({ error: 'Falta el nombre del dueño' }, 400);
      if (!ownerUser.includes('@') && !validUsername(ownerUser)) return json({ error: 'Usuario del dueño inválido (3 a 30 letras, números, punto o guion)' }, 400);
      if (!body.ownerPassword || String(body.ownerPassword).length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);

      const { data: created, error: uErr } = await admin.auth.admin.createUser({
        email: loginEmail(ownerUser), password: body.ownerPassword, email_confirm: true, user_metadata: { name: ownerName },
      });
      if (uErr || !created.user) return json({ error: dupMsg(uErr?.message || '', 'Ese usuario ya existe, elegí otro') }, 400);
      const uid = created.user.id;
      const rollback = async (orgId?: string) => {
        if (orgId) await admin.from('organizations').delete().eq('id', orgId);
        await admin.auth.admin.deleteUser(uid);
      };

      const features = { ...DEFAULT_FEATURES, ...(body.features || {}) };
      const { data: org, error: oErr } = await admin.from('organizations')
        .insert({ name: orgName, owner_id: uid, features, notes: String(body.notes || ''), created_by: caller.id }).select().single();
      if (oErr) { await rollback(); throw oErr; }

      const { data: branch, error: bErr } = await admin.from('branches')
        .insert({ org_id: org.id, name: String(body.branchName || 'Casa central').trim(), settings: body.settings || {} }).select().single();
      if (bErr) { await rollback(org.id); throw bErr; }

      const { error: mErr } = await admin.from('members')
        .insert({ org_id: org.id, user_id: uid, name: ownerName, username: ownerUser, role: 'owner' });
      if (mErr) { await rollback(org.id); throw mErr; }

      return json({ ok: true, org_id: org.id, branch_id: branch.id, owner_id: uid });
    }

    if (action === 'reset_password') {
      if (!body.password || String(body.password).length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Error inesperado' }, 500);
  }
});
