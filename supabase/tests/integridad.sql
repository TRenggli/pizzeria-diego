-- ============================================================================
-- Pruebas de seguridad e integridad (se ejecutan contra la base real, pero
-- TODO se deshace al final: el bloque termina con un error a propósito que
-- revierte la transacción y muestra el resultado).
--
-- Simula usuarios reales con su sesión (auth.uid) y verifica que las reglas
-- de la base (RLS + triggers) frenen lo que no corresponde.
--
-- Uso: ejecutar el archivo completo en el editor SQL de Supabase. El
-- resultado aparece como mensaje de error "RESULTADO: ..." (es esperado).
-- ============================================================================
do $$
declare
  v_org      uuid;
  v_centro   uuid;
  v_palermo  uuid;
  u_cajero   uuid;  -- cajero de Centro
  u_enc      uuid;  -- encargada de Centro
  u_pal      uuid;  -- cajera de Palermo
  v_paid     text;  -- una venta cobrada de Centro
  v_session  text;  -- una caja cerrada de Centro
  v_n        int;
  v_txt      text;
  ok         int := 0;
  bad        int := 0;
  res        text := '';

begin
  -- Datos de referencia (como administrador de la base)
  select o.id into v_org from organizations o where o.name = 'Pizzería Diego';
  select id into v_centro from branches where org_id = v_org and name = 'Centro';
  select id into v_palermo from branches where org_id = v_org and name = 'Palermo';
  select user_id into u_cajero from members where username = 'martin.centro';
  select user_id into u_enc from members where username = 'sofia.centro';
  select user_id into u_pal from members where username = 'ana.palermo';
  select id into v_paid from orders where branch_id = v_centro and paid and not voided limit 1;
  select id into v_session from docs where branch_id = v_centro and col = 'cash_session' and (data ->> 'closedAt') is not null limit 1;
  insert into profiles (user_id, full_name, phone, cuil) values
    (u_cajero, 'Martín', '1100000000', '20123456786'), (u_pal, 'Ana', '1100000001', '27123456781')
  on conflict (user_id) do nothing;

  execute 'set local role authenticated';

  -- ---------- como CAJERO de Centro ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_cajero, 'role', 'authenticated')::text, true);

  begin
    update orders set data = data || '{"total": 1}' where org_id = v_org and id = v_paid;
    bad := bad + 1; res := res || E'\n❌ 1. El cajero pudo cambiar el total de una venta cobrada';
  exception when others then ok := ok + 1; res := res || E'\n✅ 1. Cambiar el total de una venta cobrada: bloqueado';
  end;

  begin
    update orders set data = data || '{"status": "entregado", "driver": "Carlos"}' where org_id = v_org and id = v_paid;
    ok := ok + 1; res := res || E'\n✅ 2. Cambiar el estado de una venta cobrada: permitido';
  exception when others then bad := bad + 1; res := res || E'\n❌ 2. No se pudo cambiar el estado: ' || sqlerrm;
  end;

  begin
    update orders set data = data || '{"voided": true}' where org_id = v_org and id = v_paid;
    bad := bad + 1; res := res || E'\n❌ 3. Se pudo anular sin pasar por la función';
  exception when others then ok := ok + 1; res := res || E'\n✅ 3. Anular editando directo: bloqueado';
  end;

  begin
    perform public.void_order(v_org, v_paid, 'prueba');
    bad := bad + 1; res := res || E'\n❌ 4. El cajero pudo anular';
  exception when others then ok := ok + 1; res := res || E'\n✅ 4. El cajero no puede anular';
  end;

  delete from orders where org_id = v_org and id = v_paid;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; res := res || E'\n✅ 5. Borrar una venta real: bloqueado';
  else bad := bad + 1; res := res || E'\n❌ 5. Se pudo borrar una venta real'; end if;

  begin
    insert into orders (org_id, id, branch_id, data) values (v_org, 'o-test-malo', v_centro,
      '{"createdAt": 1790000000000, "items": [{"name": "Muzza", "qty": 1, "unitPrice": 13500}], "subtotal": 13500, "total": 100, "paid": true, "payments": [{"method": "efectivo", "amount": 100}]}');
    bad := bad + 1; res := res || E'\n❌ 6. Se guardó una venta con total trucho';
  exception when others then ok := ok + 1; res := res || E'\n✅ 6. Venta con total que no cierra: rechazada';
  end;

  begin
    insert into orders (org_id, id, branch_id, data) values (v_org, 'o-test-bien', v_centro,
      '{"createdAt": 1790000000000, "items": [{"name": "Muzza", "qty": 2, "unitPrice": 13500}], "subtotal": 27000, "discountAmount": 2700, "deliveryFee": 1500, "total": 25800, "paid": true, "payments": [{"method": "efectivo", "amount": 25800}]}');
    ok := ok + 1; res := res || E'\n✅ 7. Venta correcta: aceptada';
  exception when others then bad := bad + 1; res := res || E'\n❌ 7. Se rechazó una venta correcta: ' || sqlerrm;
  end;

  begin
    update docs set data = data || '{"countedCash": 999999}' where org_id = v_org and col = 'cash_session' and id = v_session;
    bad := bad + 1; res := res || E'\n❌ 8. Se modificó una caja cerrada';
  exception when others then ok := ok + 1; res := res || E'\n✅ 8. Modificar una caja cerrada: bloqueado';
  end;

  begin
    perform public.create_invite(v_centro, 'cajero', 7, '');
    bad := bad + 1; res := res || E'\n❌ 9. El cajero pudo generar un código';
  exception when others then ok := ok + 1; res := res || E'\n✅ 9. El cajero no puede generar códigos';
  end;

  select count(*) into v_n from profiles where user_id = u_pal;
  if v_n = 0 then ok := ok + 1; res := res || E'\n✅ 10. El cajero no ve el perfil de otra persona';
  else bad := bad + 1; res := res || E'\n❌ 10. El cajero ve perfiles ajenos'; end if;

  -- ---------- como CAJERA de Palermo ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_pal, 'role', 'authenticated')::text, true);
  select count(*) into v_n from orders where branch_id = v_centro;
  if v_n = 0 then ok := ok + 1; res := res || E'\n✅ 11. Palermo no ve ventas de Centro';
  else bad := bad + 1; res := res || E'\n❌ 11. Palermo ve ' || v_n || ' ventas de Centro'; end if;

  begin
    insert into orders (org_id, id, branch_id, data) values (v_org, 'o-test-cruzado', v_centro,
      '{"createdAt": 1790000000000, "items": [{"name": "Muzza", "qty": 1, "unitPrice": 13500}], "subtotal": 13500, "total": 13500}');
    bad := bad + 1; res := res || E'\n❌ 12. Palermo cargó una venta en Centro';
  exception when others then ok := ok + 1; res := res || E'\n✅ 12. Cargar ventas en otra sucursal: bloqueado';
  end;

  -- ---------- como ENCARGADA de Centro ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_enc, 'role', 'authenticated')::text, true);

  begin
    v_txt := (public.void_order(v_org, v_paid, 'prueba de anulación') ->> 'voidedBy');
    if v_txt = u_enc::text then ok := ok + 1; res := res || E'\n✅ 13. La encargada anula y queda registrada';
    else bad := bad + 1; res := res || E'\n❌ 13. Anuló pero no quedó quién'; end if;
  exception when others then bad := bad + 1; res := res || E'\n❌ 13. La encargada no pudo anular: ' || sqlerrm;
  end;

  begin
    perform public.create_invite(v_centro, 'cajero', 7, '');
    ok := ok + 1; res := res || E'\n✅ 14. La encargada genera códigos para su sucursal';
  exception when others then bad := bad + 1; res := res || E'\n❌ 14. La encargada no pudo generar código: ' || sqlerrm;
  end;

  begin
    perform public.create_invite(v_centro, 'admin', 7, '');
    bad := bad + 1; res := res || E'\n❌ 15. La encargada pudo invitar a otro encargado';
  exception when others then ok := ok + 1; res := res || E'\n✅ 15. Invitar encargados: solo el dueño';
  end;

  begin
    perform public.create_invite(v_palermo, 'cajero', 7, '');
    bad := bad + 1; res := res || E'\n❌ 16. La encargada invitó en otra sucursal';
  exception when others then ok := ok + 1; res := res || E'\n✅ 16. Invitar en otra sucursal: bloqueado';
  end;

  select count(*) into v_n from profiles where user_id = u_cajero;
  if v_n = 1 then ok := ok + 1; res := res || E'\n✅ 17. La encargada ve el perfil de su cajero';
  else bad := bad + 1; res := res || E'\n❌ 17. La encargada no ve el perfil de su cajero'; end if;

  select count(*) into v_n from profiles where user_id = u_pal;
  if v_n = 0 then ok := ok + 1; res := res || E'\n✅ 18. La encargada no ve perfiles de otra sucursal';
  else bad := bad + 1; res := res || E'\n❌ 18. La encargada ve perfiles de otra sucursal'; end if;

  raise exception 'RESULTADO: % ok, % fallas%', ok, bad, res;
end $$;
