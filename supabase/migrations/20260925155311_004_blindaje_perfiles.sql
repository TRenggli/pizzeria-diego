-- ============================================================================
-- v4 · Blindaje del dinero, perfiles de usuario y registro de errores
--
--   1. Una venta cobrada queda fija: solo cambian estado, repartidor y notas.
--   2. El servidor valida que subtotal, total y pagos cierren con los ítems.
--   3. Anular una venta solo se puede con la función void_order (encargado).
--   4. Las ventas reales no se borran nunca (solo las de demostración).
--   5. Una caja cerrada no se modifica; movimientos y auditoría no se editan.
--   6. Perfiles (teléfono, CUIL, email de contacto, foto) y bucket de fotos.
--   7. Registro de errores de la app para el panel de plataforma.
--
-- Las reglas no aplican a mantenimiento hecho por el dueño del proyecto
-- (sin usuario de la app: auth.uid() nulo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1-3. Ventas
-- ---------------------------------------------------------------------------
create or replace function private.orders_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  o         jsonb := case when tg_op = 'UPDATE' then old.data else null end;
  n         jsonb := new.data;
  locked    text[] := array['items', 'subtotal', 'total', 'payments', 'discount', 'discountAmount', 'cashDiscount',
                            'surcharge', 'deliveryFee', 'paidAt', 'ticketNumber', 'cashSessionId', 'createdAt',
                            'number', 'userId', 'paidBy', 'paid'];
  k         text;
  v_sub     numeric;
  v_total   numeric;
  v_pay     numeric;
  v_bad     int;
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'UPDATE' then
    if new.branch_id <> old.branch_id or new.org_id <> old.org_id then
      raise exception 'Una venta no se puede mover de sucursal';
    end if;
    if coalesce((o ->> 'paid')::boolean, false) then
      foreach k in array locked loop
        if (n -> k) is distinct from (o -> k) then
          raise exception 'La venta #% ya está cobrada: no se puede modificar "%"', o ->> 'number', k;
        end if;
      end loop;
    end if;
    if coalesce((o ->> 'voided')::boolean, false) and not coalesce((n ->> 'voided')::boolean, false) then
      raise exception 'Una venta anulada no se puede recuperar';
    end if;
    if coalesce((n ->> 'voided')::boolean, false) <> coalesce((o ->> 'voided')::boolean, false)
       and coalesce(current_setting('app.void_ok', true), '') <> 'on' then
      raise exception 'Las anulaciones se hacen con autorización de un encargado';
    end if;
  elsif coalesce((n ->> 'voided')::boolean, false) then
    raise exception 'No se puede crear una venta ya anulada';
  end if;

  -- Los números tienen que cerrar
  select count(*) filter (where coalesce((i ->> 'qty')::numeric, 0) <= 0 or coalesce((i ->> 'unitPrice')::numeric, -1) < 0),
         coalesce(sum((i ->> 'unitPrice')::numeric * (i ->> 'qty')::numeric), 0)
    into v_bad, v_sub
    from jsonb_array_elements(coalesce(n -> 'items', '[]'::jsonb)) i;
  if v_bad > 0 then raise exception 'Hay ítems con cantidad o precio inválido'; end if;
  if jsonb_array_length(coalesce(n -> 'items', '[]'::jsonb)) = 0 then raise exception 'La venta no tiene productos'; end if;
  if abs(v_sub - coalesce((n ->> 'subtotal')::numeric, 0)) > 1 then
    raise exception 'El subtotal no coincide con los productos';
  end if;
  if coalesce((n ->> 'discountAmount')::numeric, 0) < 0 or coalesce((n ->> 'discountAmount')::numeric, 0) > v_sub
     or coalesce((n ->> 'cashDiscount')::numeric, 0) < 0 or coalesce((n ->> 'surcharge')::numeric, 0) < 0
     or coalesce((n ->> 'deliveryFee')::numeric, 0) < 0 then
    raise exception 'Descuentos, recargos o envío inválidos';
  end if;
  v_total := v_sub - coalesce((n ->> 'discountAmount')::numeric, 0) - coalesce((n ->> 'cashDiscount')::numeric, 0)
           + coalesce((n ->> 'deliveryFee')::numeric, 0) + coalesce((n ->> 'surcharge')::numeric, 0);
  if abs(greatest(v_total, 0) - coalesce((n ->> 'total')::numeric, 0)) > 1 then
    raise exception 'El total no coincide con el detalle de la venta';
  end if;
  if coalesce((n ->> 'paid')::boolean, false) then
    select coalesce(sum((p ->> 'amount')::numeric), 0) into v_pay
      from jsonb_array_elements(coalesce(n -> 'payments', '[]'::jsonb)) p;
    if abs(v_pay - coalesce((n ->> 'total')::numeric, 0)) > 1 then
      raise exception 'Los pagos no suman el total de la venta';
    end if;
  end if;
  return new;
end $$;

create trigger orders_guard before insert or update on public.orders
  for each row execute function private.orders_guard();

-- Anular: solo dueño o encargado de la sucursal (queda quién y por qué)
create or replace function public.void_order(p_org uuid, p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid;
  v_data   jsonb;
  v_role   text;
begin
  select branch_id, data into v_branch, v_data from orders where org_id = p_org and id = p_id for update;
  if v_branch is null then raise exception 'La venta no existe (¿se sincronizó?)'; end if;
  v_role := private.my_role(p_org);
  if v_role is null or v_role not in ('owner', 'admin') or not private.can_branch(p_org, v_branch) then
    raise exception 'Solo un encargado o el dueño pueden anular';
  end if;
  if coalesce((v_data ->> 'voided')::boolean, false) then return v_data; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la anulación'; end if;
  perform set_config('app.void_ok', 'on', true);
  update orders set
    data = data || jsonb_build_object(
      'voided', true, 'voidReason', left(p_reason, 300), 'status', 'cancelado',
      'voidedAt', (extract(epoch from now()) * 1000)::bigint, 'voidedBy', auth.uid()),
    updated_at = now()
  where org_id = p_org and id = p_id
  returning data into v_data;
  perform set_config('app.void_ok', 'off', true);
  return v_data;
end $$;
revoke all on function public.void_order(uuid, text, text) from public, anon;
grant execute on function public.void_order(uuid, text, text) to authenticated;

-- 4. Las ventas reales no se borran (solo las de demostración)
drop policy orders_delete on public.orders;
create policy orders_delete on public.orders for delete to authenticated
  using (demo and private.is_org_admin(org_id) and private.can_branch(org_id, branch_id));

-- ---------------------------------------------------------------------------
-- 5. Caja y auditoría
-- ---------------------------------------------------------------------------
create or replace function private.docs_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    if old.col = 'cash_session' and (old.data ->> 'closedAt') is not null and new.data is distinct from old.data then
      raise exception 'La caja ya está cerrada: no se puede modificar';
    end if;
    if old.col in ('cash_move', 'audit') and new.data is distinct from old.data then
      raise exception 'Los movimientos registrados no se pueden modificar';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.col in ('cash_session', 'cash_move', 'audit') and not coalesce((old.data ->> 'demo')::boolean, false) then
      raise exception 'Los registros de caja no se pueden borrar';
    end if;
    return old;
  end if;
  return new;
end $$;

create trigger docs_guard before update or delete on public.docs
  for each row execute function private.docs_guard();

-- ---------------------------------------------------------------------------
-- 6. Perfiles y fotos
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  cuil        text check (cuil is null or cuil ~ '^[0-9]{11}$'),
  email       text,
  avatar_url  text,
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Ve el perfil: la persona, la plataforma, el dueño del negocio y el
-- encargado si comparten sucursal.
create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or private.is_platform() or exists (
    select 1
    from members me
    join members them on them.org_id = me.org_id and them.user_id = p_user
    join organizations o on o.id = me.org_id and o.status = 'active'
    where me.user_id = auth.uid() and me.active
      and (me.role = 'owner'
        or (me.role = 'admin' and (cardinality(me.branch_ids) = 0 or cardinality(them.branch_ids) = 0
                                   or me.branch_ids && them.branch_ids)))
  )
$$;

create policy profiles_select on public.profiles for select to authenticated using (private.can_see_profile(user_id));
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 7. Registro de errores de la app
-- ---------------------------------------------------------------------------
create table public.client_errors (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  org_id      uuid,
  branch_id   uuid,
  message     text not null check (length(message) <= 1000),
  stack       text check (length(stack) <= 4000),
  context     text check (length(context) <= 500),
  url         text check (length(url) <= 500),
  user_agent  text check (length(user_agent) <= 300),
  version     text check (length(version) <= 40)
);
create index client_errors_at_idx on public.client_errors (at desc);
alter table public.client_errors enable row level security;
create policy errors_insert on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy errors_select on public.client_errors for select to authenticated using (private.is_platform());

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
