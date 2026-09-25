-- ============================================================================
-- v3 · Tres niveles (plataforma / negocio / sucursal), invitaciones por
-- código, módulos por negocio, menú y clientes por sucursal, gastos y
-- finanzas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Plataforma: el creador del sistema administra todos los negocios
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy pa_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function private.is_platform()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- 2. Negocios: estado (activo/suspendido) y módulos contratados
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column status     text  not null default 'active' check (status in ('active', 'suspended')),
  add column features   jsonb not null default '{"delivery": true, "mesas": true, "stock": true, "gastos": true, "maxBranches": 10}'::jsonb,
  add column notes      text  not null default '',
  add column created_by uuid;

-- Permisos: el administrador de plataforma cuenta como dueño de todo;
-- un negocio suspendido deja de ser accesible para sus usuarios.
create or replace function private.my_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when private.is_platform() then 'owner' else (
    select m.role from members m join organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.active and o.status = 'active'
  ) end
$$;

create or replace function private.can_branch(p_org uuid, p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_platform() or exists (
    select 1 from members m join organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.active and o.status = 'active'
      and (m.role = 'owner' or cardinality(m.branch_ids) = 0 or p_branch = any (m.branch_ids))
  )
$$;

create or replace function private.branch_quota_ok(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from branches where org_id = p_org)
       < coalesce((select (features ->> 'maxBranches')::int from organizations where id = p_org), 10)
$$;

drop policy branch_insert on public.branches;
create policy branch_insert on public.branches for insert to authenticated
  with check (private.my_role(org_id) = 'owner' and private.branch_quota_ok(org_id));

-- Solo la plataforma cambia estado, módulos y notas de un negocio
create or replace function private.protect_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform() and auth.uid() is not null and (
       new.status is distinct from old.status or new.features is distinct from old.features
    or new.notes is distinct from old.notes or new.owner_id is distinct from old.owner_id) then
    raise exception 'Solo el administrador de la plataforma puede cambiar el plan o el estado del negocio';
  end if;
  return new;
end $$;
create trigger organizations_protect before update on public.organizations
  for each row execute function private.protect_org();

-- ---------------------------------------------------------------------------
-- 3. Menú y clientes pasan a ser de cada sucursal. El negocio guarda un
--    "menú modelo" que se copia al crear sucursales.
-- ---------------------------------------------------------------------------
insert into public.docs (org_id, col, id, branch_id, data, updated_at)
select d.org_id, d.col, b.id::text || '/' || d.id, b.id, d.data, now()
from public.docs d join public.branches b on b.org_id = d.org_id
where d.branch_id is null and d.col in ('category', 'product', 'extra', 'customer')
on conflict do nothing;

insert into public.docs (org_id, col, id, branch_id, data)
select o.id, 'menu_model', 'model', null, jsonb_build_object(
  'categories', coalesce((select jsonb_agg(x.data order by (x.data ->> '_i')::int) from public.docs x where x.org_id = o.id and x.col = 'category' and x.branch_id is null), '[]'::jsonb),
  'products',   coalesce((select jsonb_agg(x.data order by (x.data ->> '_i')::int) from public.docs x where x.org_id = o.id and x.col = 'product'  and x.branch_id is null), '[]'::jsonb),
  'extras',     coalesce((select jsonb_agg(x.data order by (x.data ->> '_i')::int) from public.docs x where x.org_id = o.id and x.col = 'extra'    and x.branch_id is null), '[]'::jsonb),
  'updatedAt',  (extract(epoch from now()) * 1000)::bigint)
from public.organizations o
where exists (select 1 from public.docs where org_id = o.id and branch_id is null and col = 'category')
on conflict do nothing;

delete from public.docs where branch_id is null and col in ('category', 'product', 'extra', 'customer');

drop policy docs_insert on public.docs;
drop policy docs_update on public.docs;
create policy docs_insert on public.docs for insert to authenticated
  with check (
    private.my_role(org_id) is not null
    and (
      (branch_id is not null and private.can_branch(org_id, branch_id)
        and (col not in ('category', 'product', 'extra') or private.is_org_admin(org_id)))
      or (branch_id is null and col = 'menu_model' and private.my_role(org_id) = 'owner')
    )
  );
create policy docs_update on public.docs for update to authenticated
  using (private.my_role(org_id) is not null and (branch_id is null or private.can_branch(org_id, branch_id)))
  with check (
    private.my_role(org_id) is not null
    and (
      (branch_id is not null and private.can_branch(org_id, branch_id)
        and (col not in ('category', 'product', 'extra') or private.is_org_admin(org_id)))
      or (branch_id is null and col = 'menu_model' and private.my_role(org_id) = 'owner')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Invitaciones con código (encargados y empleados se suman solos)
-- ---------------------------------------------------------------------------
create table public.invites (
  code        text primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  branch_id   uuid not null references public.branches(id) on delete cascade,
  role        text not null check (role in ('admin', 'cajero', 'cocina', 'delivery')),
  note        text not null default '',
  created_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_by     uuid,
  used_at     timestamptz,
  revoked     boolean not null default false
);
create index invites_org_idx on public.invites (org_id, created_at desc);
alter table public.invites enable row level security;
create policy inv_select on public.invites for select to authenticated
  using (private.is_org_admin(org_id) and private.can_branch(org_id, branch_id));
create policy inv_update on public.invites for update to authenticated
  using (private.is_org_admin(org_id) and private.can_branch(org_id, branch_id))
  with check (private.is_org_admin(org_id) and private.can_branch(org_id, branch_id));

create or replace function public.create_invite(p_branch uuid, p_role text, p_days int default 7, p_note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_role  text;
  v_code  text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_pos   int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  i       int;
begin
  select org_id into v_org from branches where id = p_branch and active;
  if v_org is null then raise exception 'Sucursal inválida'; end if;
  v_role := private.my_role(v_org);
  if v_role is null or v_role not in ('owner', 'admin') or not private.can_branch(v_org, p_branch) then
    raise exception 'No tenés permiso para invitar en esta sucursal';
  end if;
  if p_role not in ('admin', 'cajero', 'cocina', 'delivery') then raise exception 'Rol inválido'; end if;
  if p_role = 'admin' and v_role <> 'owner' then raise exception 'Solo el dueño puede invitar encargados'; end if;
  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    foreach i in array v_pos loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
    exit when not exists (select 1 from invites where code = v_code);
  end loop;
  insert into invites (code, org_id, branch_id, role, note, created_by, expires_at)
  values (v_code, v_org, p_branch, p_role, coalesce(p_note, ''), auth.uid(),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))));
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Panel de plataforma: listado de negocios
-- ---------------------------------------------------------------------------
create or replace function public.platform_orgs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform() then raise exception 'Solo para la plataforma'; end if;
  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select o.id, o.name, o.status, o.features, o.notes, o.created_at,
      (select jsonb_build_object('user_id', m.user_id, 'name', m.name, 'username', m.username)
         from members m where m.org_id = o.id and m.role = 'owner' limit 1) as owner,
      (select count(*) from branches b where b.org_id = o.id) as branches,
      (select count(*) from members m where m.org_id = o.id) as members,
      (select coalesce(sum(r.total), 0) from orders r where r.org_id = o.id and r.paid and not r.voided and r.paid_at > now() - interval '30 days') as sales30,
      (select max(r.created_at) from orders r where r.org_id = o.id) as last_order
    from organizations o) x);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Finanzas: ingresos, costo de mercadería, gastos, resultado y equipo
-- ---------------------------------------------------------------------------
create or replace function public.org_finance(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public as $$
  with o as (
    select branch_id, paid_at, total, data from orders
    where org_id = p_org and paid and not voided and paid_at >= p_from and paid_at <= p_to
  ),
  cogs as (
    select o.branch_id, sum(coalesce((i ->> 'cost')::numeric, 0) * coalesce((i ->> 'qty')::numeric, 1)) as cogs
    from o, jsonb_array_elements(o.data -> 'items') i group by 1
  ),
  e as (
    select branch_id, data from docs
    where org_id = p_org and col = 'expense'
      and to_timestamp((data ->> 'at')::double precision / 1000) between p_from and p_to
  )
  select jsonb_build_object(
    'by_branch', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select b.id as branch_id, b.name, b.active,
          coalesce((select sum(total) from o where o.branch_id = b.id), 0) as sales,
          (select count(*) from o where o.branch_id = b.id) as tickets,
          coalesce((select cogs from cogs where cogs.branch_id = b.id), 0) as cogs,
          coalesce((select sum((data ->> 'amount')::numeric) from e where e.branch_id = b.id), 0) as expenses
        from branches b where b.org_id = p_org) x),
    'expenses_by_category', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(data ->> 'category', 'Otros') as category, sum((data ->> 'amount')::numeric) as amount
        from e group by 1 order by 2 desc) x),
    'expenses_by_branch_category', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select branch_id, coalesce(data ->> 'category', 'Otros') as category, sum((data ->> 'amount')::numeric) as amount
        from e group by 1, 2) x),
    'by_day', (select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
        select day, sum(sales) as sales, sum(expenses) as expenses from (
          select (paid_at at time zone 'America/Argentina/Buenos_Aires')::date as day, total as sales, 0::numeric as expenses from o
          union all
          select (to_timestamp((data ->> 'at')::double precision / 1000) at time zone 'America/Argentina/Buenos_Aires')::date, 0, (data ->> 'amount')::numeric from e
        ) u group by day) x),
    'by_employee', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(data ->> 'paidBy', data ->> 'userId') as user_id, branch_id, sum(total) as sales, count(*) as tickets,
               sum(coalesce((data ->> 'discountAmount')::numeric, 0) + coalesce((data ->> 'cashDiscount')::numeric, 0)) as discounts
        from o group by 1, 2) x),
    'voids', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select data ->> 'voidedBy' as user_id, count(*) as voids, sum(total) as amount
        from orders where org_id = p_org and voided
          and to_timestamp((data ->> 'voidedAt')::double precision / 1000) between p_from and p_to
        group by 1) x),
    'salaries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select data ->> 'employeeId' as user_id, sum((data ->> 'amount')::numeric) as amount
        from e where data ->> 'category' = 'Sueldos' and coalesce(data ->> 'employeeId', '') <> '' group by 1) x),
    'cash_closes', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select data ->> 'closedBy' as user_id, count(*) as closes,
               sum(abs(coalesce((data ->> 'diff')::numeric, 0))) as abs_diff, sum(coalesce((data ->> 'diff')::numeric, 0)) as diff
        from docs where org_id = p_org and col = 'cash_session' and (data ->> 'closedAt') is not null
          and to_timestamp((data ->> 'closedAt')::double precision / 1000) between p_from and p_to
        group by 1) x)
  )
$$;

-- Estado en vivo de cada sucursal (para el panel del dueño)
create or replace function public.branches_live(p_org uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'active_orders', (select coalesce(jsonb_object_agg(branch_id, n), '{}'::jsonb) from (
        select branch_id, count(*) as n from orders
        where org_id = p_org and not voided and status not in ('entregado', 'cancelado')
          and created_at > now() - interval '2 days'
        group by branch_id) x),
    'open_cash', (select coalesce(jsonb_agg(branch_id), '[]'::jsonb) from docs
        where org_id = p_org and col = 'cash_session' and (data ->> 'closedAt') is null),
    'low_stock', (select coalesce(jsonb_object_agg(branch_id, n), '{}'::jsonb) from (
        select branch_id, count(*) as n from docs
        where org_id = p_org and col = 'ingredient' and (data ->> 'stock')::numeric <= (data ->> 'min')::numeric
        group by branch_id) x),
    'today', (select coalesce(jsonb_object_agg(branch_id, jsonb_build_object('sales', s, 'tickets', t)), '{}'::jsonb) from (
        select branch_id, sum(total) as s, count(*) as t from orders
        where org_id = p_org and paid and not voided
          and paid_at >= (date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires')
        group by branch_id) x),
    'last_close', (select coalesce(jsonb_object_agg(branch_id, d), '{}'::jsonb) from (
        select distinct on (branch_id) branch_id,
               jsonb_build_object('diff', (data ->> 'diff')::numeric, 'at', (data ->> 'closedAt')::bigint) as d
        from docs where org_id = p_org and col = 'cash_session' and (data ->> 'closedAt') is not null
        order by branch_id, (data ->> 'closedAt')::bigint desc) x)
  )
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke all on function public.create_invite(uuid, text, int, text) from public, anon;
revoke all on function public.platform_orgs() from public, anon;
grant execute on function public.create_invite(uuid, text, int, text) to authenticated;
grant execute on function public.platform_orgs() to authenticated;

alter publication supabase_realtime add table public.invites;
