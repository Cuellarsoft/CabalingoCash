-- =====================================================================
--  MIS FINANZAS — Actualización: planillas cargadas
--  · Borrar una planilla importada (y los movimientos que agregó)
--  · Borrar todos los movimientos (con confirmación)
--  · Saldo inicial correcto al importar meses anteriores
--  Péguelo en SQL Editor → New query → Run (una sola vez).
-- =====================================================================

-- Importa un extracto ya leído por la aplicación
-- p_info:  {archivo, desde, hasta, saldo_anterior, saldo_final, total_adeudado, pago_minimo, fecha_vencimiento, linea_credito}
-- p_filas: [{fecha, hora, descripcion, monto_bs, monto_usd, moneda, monto_original, referencia, huella}]
create or replace function public.importar_extracto(p_cuenta uuid, p_info jsonb, p_filas jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  h uuid := public.mi_hogar();
  cta public.cuentas;
  v_imp uuid; v_total int; v_nuevos int; v_clasif int; v_pend int; v_saldo numeric; v_res jsonb;
begin
  select * into cta from public.cuentas where id = p_cuenta and hogar_id = h;
  if cta.id is null then raise exception 'Cuenta no encontrada'; end if;
  if not public.hogar_activo() then raise exception 'Su suscripción no está vigente'; end if;

  -- Cuenta bancaria: el "saldo anterior" del extracto pasa a ser el saldo inicial si es la
  -- primera planilla de la cuenta o si es de un período más antiguo que lo ya cargado
  if cta.tipo = 'banco' and (p_info->>'saldo_anterior') is not null and (p_info->>'desde') is not null
     and (not exists (select 1 from public.movimientos where cuenta_id = cta.id)
          or (p_info->>'desde')::date < coalesce(cta.fecha_saldo_inicial, date '2999-12-31')) then
    update public.cuentas set saldo_inicial = (p_info->>'saldo_anterior')::numeric,
                              fecha_saldo_inicial = (p_info->>'desde')::date
     where id = cta.id;
    cta.saldo_inicial := (p_info->>'saldo_anterior')::numeric;
    cta.fecha_saldo_inicial := (p_info->>'desde')::date;
  -- Primera importación de una tarjeta: deduce la deuda anterior a partir del total adeudado
  elsif (p_info->>'saldo_anterior') is null and (p_info->>'saldo_final') is not null
     and not exists (select 1 from public.movimientos where cuenta_id = cta.id) then
    select (p_info->>'saldo_final')::numeric
           - coalesce(sum(coalesce(nullif(f.monto_bs, 0), round(f.monto_usd * public.tc_en(f.fecha), 2))), 0)
      into cta.saldo_inicial
      from jsonb_to_recordset(p_filas) as f(fecha date, monto_bs numeric, monto_usd numeric);
    cta.fecha_saldo_inicial := coalesce((p_info->>'desde')::date, current_date);
    update public.cuentas set saldo_inicial = cta.saldo_inicial, fecha_saldo_inicial = cta.fecha_saldo_inicial
     where id = cta.id;
  end if;

  insert into public.importaciones (hogar_id, cuenta_id, archivo, desde, hasta, saldo_banco,
                                    total_adeudado, pago_minimo, fecha_vencimiento)
  values (h, cta.id, p_info->>'archivo', (p_info->>'desde')::date, (p_info->>'hasta')::date,
          (p_info->>'saldo_final')::numeric, (p_info->>'total_adeudado')::numeric,
          (p_info->>'pago_minimo')::numeric, (p_info->>'fecha_vencimiento')::date)
  returning id into v_imp;

  v_total := jsonb_array_length(p_filas);

  with filas as (
    select * from jsonb_to_recordset(p_filas) as f(
      fecha date, hora text, descripcion text, monto_bs numeric, monto_usd numeric,
      moneda text, monto_original numeric, referencia text, huella text)
  ), ins as (
    insert into public.movimientos (hogar_id, cuenta_id, fecha, hora, descripcion, monto_bs,
                                    moneda_original, monto_original, referencia, huella, importacion_id, tc_usd)
    select h, cta.id, f.fecha, f.hora, coalesce(f.descripcion, ''),
           coalesce(nullif(f.monto_bs, 0), round(f.monto_usd * public.tc_en(f.fecha), 2)),
           coalesce(nullif(f.moneda, ''), 'BOB'), f.monto_original, f.referencia, f.huella, v_imp,
           public.tc_en(f.fecha)
      from filas f
     where coalesce(nullif(f.monto_bs, 0), f.monto_usd, 0) <> 0
    on conflict (cuenta_id, huella) do nothing
    returning 1
  )
  select count(*) into v_nuevos from ins;

  if cta.tipo = 'tarjeta' and (p_info->>'linea_credito') is not null then
    update public.cuentas set linea_credito = (p_info->>'linea_credito')::numeric where id = cta.id;
  end if;

  v_res := public.procesar_pendientes();

  select count(*) filter (where estado = 'confirmado'), count(*) filter (where estado = 'por_revisar')
    into v_clasif, v_pend from public.movimientos where importacion_id = v_imp;

  select cta.saldo_inicial + coalesce(sum(monto_bs), 0) into v_saldo
    from public.movimientos
   where cuenta_id = cta.id
     and fecha >= coalesce(cta.fecha_saldo_inicial, date '1900-01-01')
     and fecha <= coalesce((p_info->>'hasta')::date, date '2999-12-31');

  update public.importaciones set filas = v_total, nuevos = v_nuevos, duplicados = v_total - v_nuevos,
         clasificados = v_clasif, saldo_sistema = v_saldo
   where id = v_imp;

  return jsonb_build_object('importacion_id', v_imp, 'filas', v_total, 'nuevos', v_nuevos,
    'duplicados', v_total - v_nuevos, 'clasificados', v_clasif, 'pendientes', v_pend,
    'saldo_banco', (p_info->>'saldo_final')::numeric, 'saldo_sistema', v_saldo,
    'detalle', v_res);
end $$;

-- Borra una planilla importada y los movimientos que esa planilla agregó
create or replace function public.eliminar_importacion(p_imp uuid) returns jsonb
language plpgsql set search_path = public as $$
declare
  h uuid := public.mi_hogar();
  imp public.importaciones; cta public.cuentas;
  v_n int; v_suma numeric; v_quedan int;
begin
  select * into imp from public.importaciones where id = p_imp and hogar_id = h;
  if imp.id is null then raise exception 'Planilla no encontrada'; end if;
  if not public.hogar_activo() then raise exception 'Su suscripción no está vigente'; end if;
  select * into cta from public.cuentas where id = imp.cuenta_id;

  -- Traspasos creados automáticamente (por ejemplo, el ingreso en Efectivo de un retiro de cajero)
  delete from public.movimientos
   where hogar_id = h
     and huella in (select 'espejo:' || id from public.movimientos where importacion_id = imp.id);

  select count(*), coalesce(sum(monto_bs) filter (where fecha >= coalesce(cta.fecha_saldo_inicial, date '1900-01-01')), 0)
    into v_n, v_suma
    from public.movimientos where importacion_id = imp.id;

  delete from public.movimientos where importacion_id = imp.id;
  delete from public.importaciones where id = imp.id;

  -- Ajusta el saldo inicial de la cuenta
  select count(*) into v_quedan from public.movimientos where cuenta_id = cta.id;
  if v_quedan = 0 and cta.modo = 'importacion' then
    update public.cuentas set saldo_inicial = 0, fecha_saldo_inicial = null where id = cta.id;
  elsif cta.fecha_saldo_inicial is not null and imp.desde is not null and imp.desde <= cta.fecha_saldo_inicial then
    -- Era la planilla más antigua: el saldo base pasa al comienzo de lo que queda
    update public.cuentas
       set saldo_inicial = cta.saldo_inicial + v_suma,
           fecha_saldo_inicial = (select min(fecha) from public.movimientos where cuenta_id = cta.id)
     where id = cta.id;
  end if;

  return jsonb_build_object('movimientos', v_n);
end $$;

-- Borra TODOS los movimientos y planillas del hogar (pide escribir BORRAR para confirmar)
create or replace function public.borrar_todos_los_movimientos(p_confirmacion text) returns jsonb
language plpgsql set search_path = public as $$
declare h uuid := public.mi_hogar(); v_m int; v_i int;
begin
  if p_confirmacion is distinct from 'BORRAR' then raise exception 'Escriba BORRAR para confirmar'; end if;
  if not public.hogar_activo() then raise exception 'Su suscripción no está vigente'; end if;
  delete from public.movimientos where hogar_id = h;
  get diagnostics v_m = row_count;
  delete from public.importaciones where hogar_id = h;
  get diagnostics v_i = row_count;
  update public.cuentas set saldo_inicial = 0, fecha_saldo_inicial = null where hogar_id = h and modo = 'importacion';
  update public.reglas set veces = 0 where hogar_id = h;
  update public.recurrentes set ultimo_pago = null where hogar_id = h;
  return jsonb_build_object('movimientos', v_m, 'planillas', v_i);
end $$;

revoke execute on function public.eliminar_importacion(uuid) from public, anon;
grant execute on function public.eliminar_importacion(uuid) to authenticated;
revoke execute on function public.borrar_todos_los_movimientos(text) from public, anon;
grant execute on function public.borrar_todos_los_movimientos(text) to authenticated;
