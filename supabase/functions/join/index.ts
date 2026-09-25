// Canje de un código de sucursal: la persona crea su usuario y queda
// vinculada a esa sucursal con el rol que definió quien generó el código.
import { adminClient, cors, dupMsg, json, loginEmail, validUsername } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const admin = adminClient();
    const body = await req.json();
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
    const name = String(body.name || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'El código tiene 8 letras y números, por ejemplo ABCD-1234' }, 400);

    // Solo validar (paso 1 del formulario)
    const { data: inv } = await admin.from('invites').select('*, organizations(name, status), branches(name, active)').eq('code', code).maybeSingle();
    const invalid = !inv || inv.revoked || inv.used_at || new Date(inv.expires_at) < new Date()
      || !inv.organizations || inv.organizations.status !== 'active' || !inv.branches || !inv.branches.active;
    if (invalid) return json({ error: 'Código inválido, vencido o ya usado. Pedile uno nuevo al encargado o al dueño.' }, 400);
    if (body.check) return json({ ok: true, org: inv.organizations.name, branch: inv.branches.name, role: inv.role });

    if (!name) return json({ error: 'Falta tu nombre' }, 400);
    if (!validUsername(username)) return json({ error: 'El usuario debe tener 3 a 30 letras, números, punto o guion, sin espacios' }, 400);
    if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);

    // Reservar el código (evita que dos personas lo usen a la vez)
    const { data: claimed } = await admin.from('invites').update({ used_at: new Date().toISOString() })
      .eq('code', code).is('used_at', null).select().maybeSingle();
    if (!claimed) return json({ error: 'Ese código ya fue usado' }, 400);
    const release = () => admin.from('invites').update({ used_at: null }).eq('code', code);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: loginEmail(username), password, email_confirm: true, user_metadata: { name },
    });
    if (error || !created.user) {
      await release();
      return json({ error: dupMsg(error?.message || '', 'Ese nombre de usuario ya existe, probá con otro') }, 400);
    }
    const { error: mErr } = await admin.from('members').insert({
      org_id: inv.org_id, user_id: created.user.id, name, username, role: inv.role, branch_ids: [inv.branch_id],
    });
    if (mErr) { await admin.auth.admin.deleteUser(created.user.id); await release(); throw mErr; }
    await admin.from('invites').update({ used_by: created.user.id }).eq('code', code);

    return json({ ok: true, org: inv.organizations.name, branch: inv.branches.name, role: inv.role });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Error inesperado' }, 500);
  }
});
