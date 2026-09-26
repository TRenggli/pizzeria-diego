-- ============================================================================
-- Pizzería · esquema multi-sucursal
--
--   organizations  un negocio (la marca). Tiene un dueño.
--   branches       sucursales del negocio. Cada una con su configuración.
--   members        quién trabaja en el negocio, con qué rol y en qué sucursales.
--   docs           menú, clientes (compartidos por negocio) y stock, caja,
--                  movimientos (por sucursal). Guardados como JSON.
--   orders         pedidos/ventas por sucursal, con columnas calculadas
--                  para estadísticas.
--   counters       numeración de pedidos y comprobantes por sucursal.
--
-- Seguridad: todo pasa por RLS. Un usuario solo ve los negocios donde es
-- miembro y, dentro de ellos, solo las sucursales que tiene asignadas.
-- ============================================================================

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index branches_org_idx on public.branches (org_id);

create table public.members (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  username    text not null,
  role        text not null check (role in ('owner', 'admin', 'cajero', 'cocina', 'delivery')),
  -- vacío = todas las sucursales
  branch_ids  uuid[] not null default '{}',
  active      boolean not null default true,
  last_login  timestamptz,
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.docs (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  col         text not null,
  id          text not null,
  branch_id   uuid references public.branches(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, col, id)
);
create index docs_scope_idx on public.docs (org_id, col, branch_id);

create table public.orders (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  id          text not null,
  branch_id   uuid not null references public.branches(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz generated always as (to_timestamp((data ->> 'createdAt')::double precision / 1000)) stored,
  paid_at     timestamptz generated always as (to_timestamp((data ->> 'paidAt')::double precision / 1000)) stored,
  total       numeric     generated always as ((data ->> 'total')::numeric) stored,
  paid        boolean     generated always as (coalesce((data ->> 'paid')::boolean, false)) stored,
  voided      boolean     generated always as (coalesce((data ->> 'voided')::boolean, false)) stored,
  status      text        generated always as (data ->> 'status') stored,
  demo        boolean     generated always as (coalesce((data ->> 'demo')::boolean, false)) stored,
  primary key (org_id, id)
);
create index orders_branch_created_idx on public.orders (branch_id, created_at desc);
create index orders_org_paid_idx on public.orders (org_id, paid_at) where paid and not voided;
create index orders_active_idx on public.orders (branch_id) where status not in ('entregado', 'cancelado');

create table public.counters (
  branch_id   uuid not null references public.branches(id) on delete cascade,
  kind        text not null,
  value       bigint not null default 0,
  primary key (branch_id, kind)
);

-- ---------------------------------------------------------------------------
-- Funciones de permisos (security definer para no recursar en RLS)
-- ---------------------------------------------------------------------------
create or replace function public.my_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from members where org_id = p_org and user_id = auth.uid() and active
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(p_org) in ('owner', 'admin'), false)
$$;

create or replace function public.can_branch(p_org uuid, p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.active
      and (m.role = 'owner' or cardinality(m.branch_ids) = 0 or p_branch = any (m.branch_ids))
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.branches      enable row level security;
alter table public.members       enable row level security;
alter table public.docs          enable row level security;
alter table public.orders        enable row level security;
alter table public.counters      enable row level security;  -- sin políticas: solo vía funciones

create policy org_select on public.organizations for select to authenticated
  using (public.my_role(id) is not null);
create policy org_update on public.organizations for update to authenticated
  using (public.my_role(id) = 'owner') with check (public.my_role(id) = 'owner');

create policy branch_select on public.branches for select to authenticated
  using (public.can_branch(org_id, id));
create policy branch_insert on public.branches for insert to authenticated
  with check (public.my_role(org_id) = 'owner');
create policy branch_update on public.branches for update to authenticated
  using (public.is_org_admin(org_id) and public.can_branch(org_id, id))
  with check (public.is_org_admin(org_id) and public.can_branch(org_id, id));

create policy member_select on public.members for select to authenticated
  using (public.my_role(org_id) is not null);
create policy member_update on public.members for update to authenticated
  using (public.is_org_admin(org_id) and role <> 'owner')
  with check (public.is_org_admin(org_id) and role <> 'owner');

create policy docs_select on public.docs for select to authenticated
  using (public.my_role(org_id) is not null and (branch_id is null or public.can_branch(org_id, branch_id)));
create policy docs_insert on public.docs for insert to authenticated
  with check (
    public.my_role(org_id) is not null
    and (branch_id is null or public.can_branch(org_id, branch_id))
    and (col not in ('category', 'product', 'extra') or public.is_org_admin(org_id))
  );
create policy docs_update on public.docs for update to authenticated
  using (public.my_role(org_id) is not null and (branch_id is null or public.can_branch(org_id, branch_id)))
  with check (
    public.my_role(org_id) is not null
    and (branch_id is null or public.can_branch(org_id, branch_id))
    and (col not in ('category', 'product', 'extra') or public.is_org_admin(org_id))
  );
create policy docs_delete on public.docs for delete to authenticated
  using (public.is_org_admin(org_id) and (branch_id is null or public.can_branch(org_id, branch_id)));

create policy orders_select on public.orders for select to authenticated
  using (public.can_branch(org_id, branch_id));
create policy orders_insert on public.orders for insert to authenticated
  with check (public.can_branch(org_id, branch_id));
create policy orders_update on public.orders for update to authenticated
  using (public.can_branch(org_id, branch_id)) with check (public.can_branch(org_id, branch_id));
create policy orders_delete on public.orders for delete to authenticated
  using (public.is_org_admin(org_id) and public.can_branch(org_id, branch_id));

-- ---------------------------------------------------------------------------
-- Escritura con merge: cada dispositivo manda solo los campos que cambió,
-- así dos equipos editando el mismo pedido (caja cobra, cocina cambia
-- estado) no se pisan.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_docs(p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into docs (org_id, col, id, branch_id, data, updated_at)
  select (r ->> 'org_id')::uuid, r ->> 'col', r ->> 'id', nullif(r ->> 'branch_id', '')::uuid, r -> 'data', now()
  from jsonb_array_elements(p_rows) r
  on conflict (org_id, col, id) do update
    set data = docs.data || excluded.data, updated_at = now();
end $$;

create or replace function public.upsert_orders(p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into orders (org_id, id, branch_id, data, updated_at)
  select (r ->> 'org_id')::uuid, r ->> 'id', (r ->> 'branch_id')::uuid, r -> 'data', now()
  from jsonb_array_elements(p_rows) r
  on conflict (org_id, id) do update
    set data = orders.data || excluded.data, updated_at = now();
end $$;

-- Reserva un bloque de números (pedido / comprobante). Devuelve el primero.
create or replace function public.reserve_numbers(p_branch uuid, p_kind text, p_count int)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_end bigint;
begin
  select org_id into v_org from branches where id = p_branch;
  if v_org is null or not public.can_branch(v_org, p_branch) then
    raise exception 'sin permiso para esta sucursal';
  end if;
  if p_count < 1 or p_count > 500 then raise exception 'cantidad inválida'; end if;
  insert into counters (branch_id, kind, value) values (p_branch, p_kind, p_count)
  on conflict (branch_id, kind) do update set value = counters.value + excluded.value
  returning value into v_end;
  return v_end - p_count + 1;
end $$;

create or replace function public.touch_login(p_org uuid)
returns void language sql security definer set search_path = public as $$
  update members set last_login = now() where org_id = p_org and user_id = auth.uid()
$$;

-- Borra las ventas de demostración de una sucursal
create or replace function public.clear_demo(p_branch uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from orders where branch_id = p_branch and demo;
  delete from docs where branch_id = p_branch and col in ('cash_session', 'cash_move') and coalesce((data ->> 'demo')::boolean, false);
end $$;

-- ---------------------------------------------------------------------------
-- Estadísticas del negocio (todas las sucursales que el usuario puede ver)
-- ---------------------------------------------------------------------------
create or replace function public.org_report(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public as $$
  with o as (
    select branch_id, paid_at, total, data
    from orders
    where org_id = p_org and paid and not voided and paid_at >= p_from and paid_at <= p_to
  )
  select jsonb_build_object(
    'by_branch', (select coalesce(jsonb_agg(x), '[]') from (
        select branch_id, sum(total) as sales, count(*) as tickets,
               sum(coalesce((data ->> 'deliveryFee')::numeric, 0)) as delivery
        from o group by branch_id) x),
    'by_day', (select coalesce(jsonb_agg(x order by x.day), '[]') from (
        select branch_id, (paid_at at time zone 'America/Argentina/Buenos_Aires')::date as day, sum(total) as sales, count(*) as tickets
        from o group by 1, 2) x),
    'by_hour', (select coalesce(jsonb_agg(x), '[]') from (
        select extract(hour from paid_at at time zone 'America/Argentina/Buenos_Aires')::int as hour, sum(total) as sales
        from o group by 1) x),
    'by_method', (select coalesce(jsonb_agg(x), '[]') from (
        select p ->> 'method' as method, sum((p ->> 'amount')::numeric) as amount
        from o, jsonb_array_elements(o.data -> 'payments') p group by 1) x),
    'by_type', (select coalesce(jsonb_agg(x), '[]') from (
        select data ->> 'type' as type, sum(total) as sales, count(*) as tickets from o group by 1) x),
    'top_products', (select coalesce(jsonb_agg(x), '[]') from (
        select i ->> 'name' as name, sum((i ->> 'qty')::numeric) as qty,
               sum((i ->> 'qty')::numeric * (i ->> 'unitPrice')::numeric) as revenue
        from o, jsonb_array_elements(o.data -> 'items') i
        group by 1 order by 3 desc limit 12) x)
  )
$$;

-- Estado en vivo de cada sucursal (pedidos activos, caja abierta)
create or replace function public.branches_live(p_org uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'active_orders', (select coalesce(jsonb_object_agg(branch_id, n), '{}') from (
        select branch_id, count(*) as n from orders
        where org_id = p_org and not voided and status not in ('entregado', 'cancelado')
          and created_at > now() - interval '2 days'
        group by branch_id) x),
    'open_cash', (select coalesce(jsonb_agg(branch_id), '[]') from docs
        where org_id = p_org and col = 'cash_session' and (data ->> 'closedAt') is null)
  )
$$;

revoke all on function public.reserve_numbers(uuid, text, int) from public, anon;
revoke all on function public.touch_login(uuid) from public, anon;
grant execute on function public.reserve_numbers(uuid, text, int) to authenticated;
grant execute on function public.touch_login(uuid) to authenticated;

-- Tiempo real
alter publication supabase_realtime add table public.docs, public.orders, public.branches, public.members;
