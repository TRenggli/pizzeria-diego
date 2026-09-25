-- Las funciones de permisos pasan a un esquema privado (no expuesto por la API REST).
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_role(uuid) set schema private;
alter function public.is_org_admin(uuid) set schema private;
alter function public.can_branch(uuid, uuid) set schema private;

create or replace function private.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.my_role(p_org) in ('owner', 'admin'), false)
$$;

create or replace function public.reserve_numbers(p_branch uuid, p_kind text, p_count int)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_end bigint;
begin
  select org_id into v_org from branches where id = p_branch;
  if v_org is null or not private.can_branch(v_org, p_branch) then
    raise exception 'sin permiso para esta sucursal';
  end if;
  if p_count < 1 or p_count > 500 then raise exception 'cantidad inválida'; end if;
  insert into counters (branch_id, kind, value) values (p_branch, p_kind, p_count)
  on conflict (branch_id, kind) do update set value = counters.value + excluded.value
  returning value into v_end;
  return v_end - p_count + 1;
end $$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
