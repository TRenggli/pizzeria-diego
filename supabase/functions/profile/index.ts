// Perfil propio: cambio de correo.
//   · Si la persona ingresa con email (ej. el dueño), cambia su email de ingreso.
//   · Si ingresa con nombre de usuario, el correo queda como contacto.
import { adminClient, cors, json, STAFF_DOMAIN } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const admin = adminClient();
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const me = auth?.user;
    if (!me) return json({ error: 'Sesión inválida' }, 401);

    const body = await req.json();
    if (body.action !== 'change_email') return json({ error: 'Acción desconocida' }, 400);

    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email inválido' }, 400);
    if (email.endsWith('@' + STAFF_DOMAIN)) return json({ error: 'Email inválido' }, 400);

    const oldEmail = (me.email || '').toLowerCase();
    const logsInWithEmail = !oldEmail.endsWith('@' + STAFF_DOMAIN);

    if (logsInWithEmail && email !== oldEmail) {
      const { error } = await admin.auth.admin.updateUserById(me.id, { email, email_confirm: true });
      if (error) return json({ error: /already|registered|exists/i.test(error.message) ? 'Ese email ya lo usa otra cuenta' : error.message }, 400);
      await admin.from('members').update({ username: email }).eq('user_id', me.id).eq('username', oldEmail);
    }
    const { error: pErr } = await admin.from('profiles').upsert({ user_id: me.id, email, updated_at: new Date().toISOString() });
    if (pErr) throw pErr;

    return json({ ok: true, login: logsInWithEmail ? email : null });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Error inesperado' }, 500);
  }
});
