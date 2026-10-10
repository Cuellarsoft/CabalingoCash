-- =====================================================================
--  MIS FINANZAS — Script 2: dejar su usuario como administrador
--  1) Primero cree su usuario en Supabase → Authentication → Users → Add user
--     (marque "Auto Confirm User").
--  2) Cambie el correo de la línea de abajo si es distinto.
--  3) Ejecútelo una sola vez en SQL Editor → Run.
-- =====================================================================
do $$
declare
  v_email text := 'fernando@cuellar.com';      -- <<< SU CORREO
  u uuid; h uuid;
  cat_super uuid; cat_comidas uuid; cat_edu uuid; cat_sub uuid; cat_trans uuid;
  cat_int uuid; cat_seg uuid; cat_don uuid; cat_salud uuid;
begin
  select id into u from auth.users where lower(email) = lower(v_email);
  if u is null then
    raise exception 'No existe el usuario %. Créelo primero en Authentication → Users.', v_email;
  end if;

  -- Hogar, perfil y suscripción (si todavía no existen)
  h := public.crear_hogar_para(u, v_email, 'Fernando', true);

  -- Administrador del sistema con suscripción permanente
  update public.perfiles set es_superadmin = true, rol = 'titular' where id = u;
  update public.suscripciones set plan = 'propietario', estado = 'activa', vence_el = date '2099-12-31'
   where hogar_id = h;

  -- Sus cuentas iniciales
  insert into public.cuentas (hogar_id, nombre, tipo, modo, banco, numero, formato, orden)
  select h, 'Caja de ahorro Ganadero 2145', 'banco', 'importacion', 'Banco Ganadero', '1310442145', 'ganadero_cuenta', 1
   where not exists (select 1 from public.cuentas where hogar_id = h and numero = '1310442145');
  insert into public.cuentas (hogar_id, nombre, tipo, modo, banco, numero, formato, orden)
  select h, 'Cuenta Ganadero 1079', 'banco', 'importacion', 'Banco Ganadero', '1041081079', 'ganadero_cuenta', 2
   where not exists (select 1 from public.cuentas where hogar_id = h and numero = '1041081079');
  insert into public.cuentas (hogar_id, nombre, tipo, modo, banco, numero, formato, linea_credito, dia_pago, orden)
  select h, 'Tarjeta Ganadero …5016', 'tarjeta', 'importacion', 'Banco Ganadero', '5016', 'ganadero_tarjeta', 35000, 10, 3
   where not exists (select 1 from public.cuentas where hogar_id = h and numero = '5016');
  insert into public.cuentas (hogar_id, nombre, tipo, modo, orden)
  select h, 'Otra tarjeta de crédito', 'tarjeta', 'manual', 4
   where not exists (select 1 from public.cuentas where hogar_id = h and nombre = 'Otra tarjeta de crédito');

  -- Reglas iniciales sacadas de sus extractos de septiembre
  select id into cat_super   from public.categorias where hogar_id = h and nombre = 'Supermercado';
  select id into cat_comidas from public.categorias where hogar_id = h and nombre = 'Comidas fuera';
  select id into cat_edu     from public.categorias where hogar_id = h and nombre = 'Educación';
  select id into cat_sub     from public.categorias where hogar_id = h and nombre = 'Suscripciones digitales';
  select id into cat_trans   from public.categorias where hogar_id = h and nombre = 'Transporte';
  select id into cat_int     from public.categorias where hogar_id = h and nombre = 'Intereses y comisiones';
  select id into cat_seg     from public.categorias where hogar_id = h and nombre = 'Seguros';
  select id into cat_don     from public.categorias where hogar_id = h and nombre = 'Donaciones';
  select id into cat_salud   from public.categorias where hogar_id = h and nombre = 'Salud y farmacia';

  if not exists (select 1 from public.reglas where hogar_id = h) then
    insert into public.reglas (hogar_id, texto, categoria_id) values
      (h, 'HIPERMAXI', cat_super),
      (h, 'HIPERMAXI FARMACIA', cat_salud),
      (h, 'FARMACIA', cat_salud),
      (h, 'DELIZIA', cat_comidas),
      (h, 'MANJAR DE ORO', cat_comidas),
      (h, 'JARDIN INFANTIL ARCO IRIS', cat_edu),
      (h, 'NETFLIX', cat_sub),
      (h, 'DISNEY PLUS', cat_sub),
      (h, 'UBER', cat_trans),
      (h, 'UBR*', cat_trans),
      (h, 'INTERES DE FINANCIAMIENTO', cat_int),
      (h, 'CUOTA ANUAL DE MANTENIMIE', cat_int),
      (h, 'COSTO EMISION', cat_int),
      (h, 'SEGURO DE PROTECCION', cat_seg),
      (h, 'SEGURO DE DESGRAVAMEN', cat_seg),
      (h, 'ALDEAS INFANTILES', cat_don);
    -- Transferencias con su cuenta del Banco Mercantil = traspaso (no es ingreso ni gasto)
    insert into public.reglas (hogar_id, texto, es_traspaso) values (h, '1007922228', true);
    -- Débito automático del pago de la tarjeta …5016 = traspaso hacia la tarjeta
    insert into public.reglas (hogar_id, texto, es_traspaso, cuenta_destino_id)
    select h, 'XXXXXX-5016', true, id from public.cuentas where hogar_id = h and numero = '5016';
  end if;

  raise notice 'Listo: % es administrador del sistema.', v_email;
end $$;
