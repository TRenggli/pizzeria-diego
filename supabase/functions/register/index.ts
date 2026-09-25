// El registro público quedó cerrado: los negocios los crea el administrador
// de la plataforma (función "platform") y el resto se suma con códigos ("join").
import { cors, json } from '../_shared/common.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return json({ error: 'El registro está cerrado. Pedile tu cuenta al administrador del sistema.' }, 410);
});
