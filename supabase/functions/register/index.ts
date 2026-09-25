// Alta de un negocio nuevo: crea el usuario dueño (ya confirmado), el negocio,
// la primera sucursal y la membresía de dueño. Si se define el secreto
// REGISTRATION_CODE, solo se puede registrar quien tenga ese código.
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const { orgName, branchName, name, email, password, settings, code } = await req.json();
    const required = Deno.env.get('REGISTRATION_CODE');
    if (required && code !== required) return json({ error: 'Código de registro inválido' }, 403);

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!orgName || !String(orgName).trim()) return json({ error: 'Falta el nombre del negocio' }, 400);
    if (!name || !String(name).trim()) return json({ error: 'Falta tu nombre' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return json({ error: 'Email inválido' }, 400);
    if (!password || String(password).length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: String(name).trim() },
    });
    if (userErr || !created.user) {
      const msg = userErr?.message || 'No se pudo crear el usuario';
      return json({ error: /already|registered|exists/i.test(msg) ? 'Ese email ya está registrado. Ingresá con tu contraseña.' : msg }, 400);
    }
    const uid = created.user.id;

    const rollback = async () => { await admin.auth.admin.deleteUser(uid); };

    const { data: org, error: orgErr } = await admin
      .from('organizations').insert({ name: String(orgName).trim(), owner_id: uid }).select().single();
    if (orgErr) { await rollback(); throw orgErr; }

    const { data: branch, error: brErr } = await admin
      .from('branches')
      .insert({ org_id: org.id, name: String(branchName || 'Casa central').trim(), settings: settings && typeof settings === 'object' ? settings : {} })
      .select().single();
    if (brErr) { await admin.from('organizations').delete().eq('id', org.id); await rollback(); throw brErr; }

    const { error: memErr } = await admin.from('members').insert({
      org_id: org.id, user_id: uid, name: String(name).trim(), username: cleanEmail, role: 'owner',
    });
    if (memErr) { await admin.from('organizations').delete().eq('id', org.id); await rollback(); throw memErr; }

    return json({ ok: true, org_id: org.id, branch_id: branch.id });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Error inesperado' }, 500);
  }
});
