// Gestión de empleados (solo dueño o encargado del negocio):
//   create   → crea el usuario con nombre de usuario (sin email real) y su membresía
//   password → cambia la contraseña de un empleado
//   delete   → quita al empleado del negocio
// Los empleados ingresan con "usuario"; internamente es <usuario>@staff.pizzeria.local
import { createClient } from 'npm:@supabase/supabase-js@2';

const STAFF_DOMAIN = 'staff.pizzeria.local';
const ROLES = ['admin', 'cajero', 'cocina', 'delivery'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const caller = auth?.user;
    if (!caller) return json({ error: 'Sesión inválida' }, 401);

    const body = await req.json();
    const { action, org_id } = body;
    if (!org_id) return json({ error: 'Falta el negocio' }, 400);

    const { data: me } = await admin.from('members').select('role, active')
      .eq('org_id', org_id).eq('user_id', caller.id).maybeSingle();
    if (!me || !me.active || !['owner', 'admin'].includes(me.role)) return json({ error: 'No tenés permiso para gestionar usuarios' }, 403);
    const isOwner = me.role === 'owner';

    const target = async (userId: string) => {
      const { data } = await admin.from('members').select('role').eq('org_id', org_id).eq('user_id', userId).maybeSingle();
      return data;
    };

    if (action === 'create') {
      const username = String(body.username || '').trim().toLowerCase();
      const { name, password, role } = body;
      const branchIds: string[] = Array.isArray(body.branch_ids) ? body.branch_ids : [];
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'El usuario debe tener 3 a 30 letras, números, punto o guion, sin espacios' }, 400);
      if (!name || !String(name).trim()) return json({ error: 'Falta el nombre' }, 400);
      if (!password || String(password).length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Rol inválido' }, 400);
      if (role === 'admin' && !isOwner) return json({ error: 'Solo el dueño puede crear encargados' }, 403);

      if (branchIds.length) {
        const { data: brs } = await admin.from('branches').select('id').eq('org_id', org_id).in('id', branchIds);
        if ((brs || []).length !== branchIds.length) return json({ error: 'Sucursal inválida' }, 400);
      }

      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${username}@${STAFF_DOMAIN}`, password, email_confirm: true, user_metadata: { name: String(name).trim() },
      });
      if (error || !created.user) {
        const msg = error?.message || 'No se pudo crear';
        return json({ error: /already|registered|exists/i.test(msg) ? 'Ese nombre de usuario ya existe, probá con otro' : msg }, 400);
      }
      const { error: memErr } = await admin.from('members').insert({
        org_id, user_id: created.user.id, name: String(name).trim(), username, role, branch_ids: branchIds,
      });
      if (memErr) { await admin.auth.admin.deleteUser(created.user.id); throw memErr; }
      return json({ ok: true, user_id: created.user.id });
    }

    if (action === 'password') {
      const { user_id, password } = body;
      if (!password || String(password).length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
      const t = await target(user_id);
      if (!t) return json({ error: 'Usuario no encontrado' }, 404);
      if (t.role === 'owner' && user_id !== caller.id) return json({ error: 'No podés cambiar la contraseña del dueño' }, 403);
      if (t.role === 'admin' && !isOwner && user_id !== caller.id) return json({ error: 'Solo el dueño puede cambiar la contraseña de un encargado' }, 403);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'delete') {
      const { user_id } = body;
      const t = await target(user_id);
      if (!t) return json({ error: 'Usuario no encontrado' }, 404);
      if (t.role === 'owner') return json({ error: 'No se puede quitar al dueño' }, 403);
      if (t.role === 'admin' && !isOwner) return json({ error: 'Solo el dueño puede quitar encargados' }, 403);
      await admin.from('members').delete().eq('org_id', org_id).eq('user_id', user_id);
      const { count } = await admin.from('members').select('*', { count: 'exact', head: true }).eq('user_id', user_id);
      if (!count) await admin.auth.admin.deleteUser(user_id);
      return json({ ok: true });
    }

    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Error inesperado' }, 500);
  }
});
