// Utilidades compartidas por las funciones (se copian dentro de cada una al desplegar)
import { createClient } from 'npm:@supabase/supabase-js@2';

export const STAFF_DOMAIN = 'staff.pizzeria.local';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** usuario → email interno; si ya es un email se usa tal cual */
export const loginEmail = (user: string) => {
  const u = String(user || '').trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${STAFF_DOMAIN}`;
};

export const validUsername = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u);

export const dupMsg = (msg: string, fallback: string) =>
  /already|registered|exists/i.test(msg) ? fallback : msg;
