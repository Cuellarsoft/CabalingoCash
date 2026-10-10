-- =====================================================================
--  MIS FINANZAS — Script único de base de datos (Supabase)
--  Cópielo completo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar más de una vez sin dañar los datos existentes.
-- =====================================================================

-- ---------------------------------------------------------------
-- 0. Extensiones (vienen incluidas en Supabase)
--    pg_cron = tareas programadas · http = leer la página del BCB
-- ---------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists http with schema extensions;

-- ---------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------

-- Ajustes generales del sistema (una sola fila)
create table if not exists public.ajustes_sistema (
  id               int primary key default 1 check (id = 1),
  registro_abierto boolean not null default false,  -- ¿pueden registrarse nuevas familias?
  dias_prueba      int not null default 15
);
insert into public.ajustes_sistema (id) values (1) on conflict (id) do nothing;

-- Cada cliente / familia
create table if not exists public.hogares (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  creado_en timestamptz not null default now()
);

-- Usuarios
create table if not exists public.perfiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  hogar_id      uuid not null references public.hogares(id) on delete cascade,
  nombre        text,
  email         text,
  rol           text not null default 'titular' check (rol in ('titular','miembro')),
  es_superadmin boolean not null default false,
  creado_en     timestamptz not null default now()
);

-- Suscripción de cada hogar
create table if not exists public.suscripciones (
  hogar_id       uuid primary key references public.hogares(id) on delete cascade,
  plan           text not null default 'mensual',
  estado         text not null default 'prueba' check (estado in ('prueba','activa','vencida','suspendida')),
  vence_el       date not null default (current_date + 15),
  notas          text,
  actualizado_en timestamptz not null default now()
);

-- Tipo de cambio diario (compartido por todos)
create table if not exists public.tipos_cambio (
  fecha          date primary key,
  bs_por_usd     numeric(10,4) not null check (bs_por_usd > 0),
  origen         text not null default 'manual',   -- 'BCB automático' | 'manual'
  actualizado_en timestamptz not null default now()
);

-- Funciones base que usan las tablas siguientes como valor por defecto
create or replace function public.mi_hogar() returns uuid
language sql stable security definer set search_path = public as $$
  select hogar_id from public.perfiles where id = auth.uid()
$$;

create or replace function public.es_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_superadmin from public.perfiles where id = auth.uid()), false)
$$;

create or replace function public.hogar_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.suscripciones s
    where s.hogar_id = public.mi_hogar()
      and s.estado in ('prueba','activa')
      and s.vence_el >= (now() at time zone 'America/La_Paz')::date
  )
$$;

-- Tipo de cambio vigente para una fecha (el último conocido hasta esa fecha)
create or replace function public.tc_en(p_fecha date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select bs_por_usd from public.tipos_cambio where fecha <= p_fecha order by fecha desc limit 1),
    (select bs_por_usd from public.tipos_cambio order by fecha asc limit 1)
  )
$$;

-- Cuentas bancarias, tarjetas y efectivo
create table if not exists public.cuentas (
  id                  uuid primary key default gen_random_uuid(),
  hogar_id            uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  nombre              text not null,
  tipo                text not null check (tipo in ('banco','tarjeta','efectivo')),
  modo                text not null default 'manual' check (modo in ('importacion','manual')),
  banco               text,
  numero              text,              -- número de cuenta o últimos dígitos
  formato             text,              -- 'ganadero_cuenta' | 'ganadero_tarjeta'
  saldo_inicial       numeric(14,2) not null default 0,  -- en tarjetas: deuda inicial en negativo
  fecha_saldo_inicial date,
  linea_credito       numeric(14,2),
  dia_corte           int check (dia_corte between 1 and 31),
  dia_pago            int check (dia_pago between 1 and 31),
  activa              boolean not null default true,
  orden               int not null default 0,
  creado_en           timestamptz not null default now()
);

-- Categorías (un solo nivel)
create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  hogar_id  uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  nombre    text not null,
  tipo      text not null default 'gasto' check (tipo in ('gasto','ingreso')),
  color     text not null default '#64748b',
  en_presupuesto boolean not null default true,  -- falso = no cuenta en el presupuesto personal
  activa    boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (hogar_id, nombre)
);

-- Historial de importaciones de Excel
create table if not exists public.importaciones (
  id                uuid primary key default gen_random_uuid(),
  hogar_id          uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  cuenta_id         uuid not null references public.cuentas(id) on delete cascade,
  archivo           text,
  desde             date,
  hasta             date,
  filas             int default 0,
  nuevos            int default 0,
  duplicados        int default 0,
  clasificados      int default 0,
  saldo_banco       numeric(14,2),
  saldo_sistema     numeric(14,2),
  total_adeudado    numeric(14,2),
  pago_minimo       numeric(14,2),
  fecha_vencimiento date,
  creado_en         timestamptz not null default now()
);

-- Reglas aprendidas
create table if not exists public.reglas (
  id                uuid primary key default gen_random_uuid(),
  hogar_id          uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  texto             text not null check (length(trim(texto)) >= 3),
  cuenta_id         uuid references public.cuentas(id) on delete cascade,   -- opcional: solo para esta cuenta
  categoria_id      uuid references public.categorias(id) on delete cascade,
  es_traspaso       boolean not null default false,
  cuenta_destino_id uuid references public.cuentas(id) on delete set null,  -- para traspasos (p. ej. a Efectivo)
  veces             int not null default 0,
  creado_en         timestamptz not null default now(),
  check (es_traspaso or categoria_id is not null)
);

-- Movimientos
create table if not exists public.movimientos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  cuenta_id       uuid not null references public.cuentas(id) on delete cascade,
  fecha           date not null,
  hora            text,
  descripcion     text not null default '',
  monto_bs        numeric(14,2) not null,       -- negativo = sale dinero / sube deuda
  clase           text not null default 'normal' check (clase in ('normal','traspaso','ajuste')),
  categoria_id    uuid references public.categorias(id) on delete set null,
  moneda_original text not null default 'BOB',
  monto_original  numeric(14,2),
  tc_usd          numeric(10,4),                -- Bs por USD en la fecha del movimiento
  referencia      text,                         -- nro. de transacción del banco
  huella          text not null default gen_random_uuid()::text,  -- evita duplicados
  importacion_id  uuid references public.importaciones(id) on delete set null,
  regla_id        uuid references public.reglas(id) on delete set null,
  traspaso_par_id uuid references public.movimientos(id) on delete set null,
  estado          text not null default 'por_revisar' check (estado in ('por_revisar','confirmado')),
  nota            text,
  creado_en       timestamptz not null default now(),
  unique (cuenta_id, huella)
);
create index if not exists movimientos_hogar_fecha on public.movimientos (hogar_id, fecha);
create index if not exists movimientos_estado on public.movimientos (hogar_id, estado);

-- Presupuesto mensual por categoría
create table if not exists public.presupuestos (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  mes          date not null,            -- primer día del mes
  monto_bs     numeric(14,2) not null default 0,
  unique (hogar_id, categoria_id, mes)
);

-- Pagos recurrentes y recordatorios
create table if not exists public.recurrentes (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  nombre          text not null,
  categoria_id    uuid references public.categorias(id) on delete set null,
  cuenta_id       uuid references public.cuentas(id) on delete set null,
  monto_estimado  numeric(14,2),
  frecuencia      text not null default 'mensual' check (frecuencia in ('mensual','bimestral','trimestral','semestral','anual')),
  proxima_fecha   date not null,
  dias_aviso      int not null default 5,
  texto_reconocer text,      -- texto que aparece en el extracto, p. ej. ARCO IRIS
  ultimo_pago     date,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 2. Disparadores (triggers)
-- ---------------------------------------------------------------

-- Completa el tipo de cambio y convierte montos en USD
create or replace function public.trg_movimiento_tc() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tc_usd is null or tg_op = 'UPDATE' and new.fecha <> old.fecha then
    new.tc_usd := public.tc_en(new.fecha);
  end if;
  if new.monto_bs is null and new.moneda_original = 'USD' and new.monto_original is not null then
    new.monto_bs := round(new.monto_original * coalesce(new.tc_usd, 0), 2);
  end if;
  return new;
end $$;
drop trigger if exists movimiento_tc on public.movimientos;
create trigger movimiento_tc before insert or update on public.movimientos
  for each row execute function public.trg_movimiento_tc();

-- Impide que un usuario cambie su propio rol, hogar o permiso de superadmin
create or replace function public.trg_proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.es_superadmin() then
    new.rol := old.rol;
    new.es_superadmin := old.es_superadmin;
    new.hogar_id := old.hogar_id;
    new.email := old.email;
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfil on public.perfiles;
create trigger proteger_perfil before update on public.perfiles
  for each row execute function public.trg_proteger_perfil();

-- Categorías iniciales de cada hogar
create or replace function public.crear_categorias_iniciales(p_hogar uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.categorias (hogar_id, nombre, tipo, color, en_presupuesto) values
    (p_hogar, 'Supermercado',             'gasto',   '#16a34a', true),
    (p_hogar, 'Comidas fuera',            'gasto',   '#ea580c', true),
    (p_hogar, 'Educación',                'gasto',   '#2563eb', true),
    (p_hogar, 'Personal doméstico',       'gasto',   '#7c3aed', true),
    (p_hogar, 'Servicios básicos',        'gasto',   '#0891b2', true),
    (p_hogar, 'Suscripciones digitales',  'gasto',   '#db2777', true),
    (p_hogar, 'Transporte',               'gasto',   '#ca8a04', true),
    (p_hogar, 'Salud y farmacia',         'gasto',   '#dc2626', true),
    (p_hogar, 'Ropa y personales',        'gasto',   '#c026d3', true),
    (p_hogar, 'Hogar',                    'gasto',   '#65a30d', true),
    (p_hogar, 'Seguros',                  'gasto',   '#0d9488', true),
    (p_hogar, 'Intereses y comisiones',   'gasto',   '#b91c1c', true),
    (p_hogar, 'Donaciones',               'gasto',   '#9333ea', true),
    (p_hogar, 'Por cuenta de la estancia','gasto',   '#78716c', false),
    (p_hogar, 'Otros gastos',             'gasto',   '#64748b', true),
    (p_hogar, 'Sueldo',                   'ingreso', '#059669', false),
    (p_hogar, 'Otros ingresos',           'ingreso', '#0f766e', false)
  on conflict (hogar_id, nombre) do nothing;
end $$;

-- Crea hogar, perfil, suscripción, categorías y cuenta Efectivo para un usuario
create or replace function public.crear_hogar_para(p_user uuid, p_email text, p_nombre text, p_propietario boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid; dias int;
begin
  select hogar_id into h from public.perfiles where id = p_user;
  if h is not null then return h; end if;

  select dias_prueba into dias from public.ajustes_sistema where id = 1;
  insert into public.hogares (nombre) values ('Hogar de ' || coalesce(p_nombre, p_email)) returning id into h;
  insert into public.perfiles (id, hogar_id, nombre, email, rol, es_superadmin)
    values (p_user, h, p_nombre, p_email, 'titular', p_propietario);
  insert into public.suscripciones (hogar_id, plan, estado, vence_el)
    values (h,
            case when p_propietario then 'propietario' else 'mensual' end,
            case when p_propietario then 'activa' else 'prueba' end,
            case when p_propietario then date '2099-12-31' else current_date + coalesce(dias, 15) end);
  perform public.crear_categorias_iniciales(h);
  insert into public.cuentas (hogar_id, nombre, tipo, modo, orden)
    values (h, 'Efectivo', 'efectivo', 'manual', 99);
  return h;
end $$;

-- Cuando se crea un usuario en Authentication
create or replace function public.al_crear_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare hay int; abierto boolean;
begin
  select count(*) into hay from public.perfiles;
  select registro_abierto into abierto from public.ajustes_sistema where id = 1;
  if hay > 0 and not coalesce(abierto, false) then
    raise exception 'El registro de nuevos usuarios está cerrado.';
  end if;
  perform public.crear_hogar_para(
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    hay = 0);   -- el primer usuario es el dueño del sistema
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.al_crear_usuario();

-- ---------------------------------------------------------------
-- 3. Seguridad: cada hogar ve solo lo suyo (Row Level Security)
-- ---------------------------------------------------------------
alter table public.ajustes_sistema enable row level security;
alter table public.hogares        enable row level security;
alter table public.perfiles       enable row level security;
alter table public.suscripciones  enable row level security;
alter table public.tipos_cambio   enable row level security;
alter table public.cuentas        enable row level security;
alter table public.categorias     enable row level security;
alter table public.importaciones  enable row level security;
alter table public.reglas         enable row level security;
alter table public.movimientos    enable row level security;
alter table public.presupuestos   enable row level security;
alter table public.recurrentes    enable row level security;

-- Borra políticas anteriores (para poder ejecutar el script de nuevo)
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('ajustes_sistema','hogares','perfiles','suscripciones','tipos_cambio','cuentas','categorias',
     'importaciones','reglas','movimientos','presupuestos','recurrentes')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

create policy ver on public.ajustes_sistema for select to authenticated using (true);
create policy editar on public.ajustes_sistema for update to authenticated using (public.es_superadmin());

create policy ver on public.hogares for select to authenticated using (id = public.mi_hogar() or public.es_superadmin());
create policy editar on public.hogares for update to authenticated using (id = public.mi_hogar() or public.es_superadmin());

create policy ver on public.perfiles for select to authenticated
  using (id = auth.uid() or hogar_id = public.mi_hogar() or public.es_superadmin());
create policy editar on public.perfiles for update to authenticated using (id = auth.uid() or public.es_superadmin());

create policy ver on public.suscripciones for select to authenticated using (hogar_id = public.mi_hogar() or public.es_superadmin());
create policy editar on public.suscripciones for update to authenticated using (public.es_superadmin());

create policy ver on public.tipos_cambio for select to authenticated using (true);
create policy crear on public.tipos_cambio for insert to authenticated with check (public.es_superadmin());
create policy editar on public.tipos_cambio for update to authenticated using (public.es_superadmin());
create policy borrar on public.tipos_cambio for delete to authenticated using (public.es_superadmin());

-- Tablas del hogar: ver siempre lo propio; modificar solo con suscripción vigente
do $$ declare t text; begin
  foreach t in array array['cuentas','categorias','importaciones','reglas','movimientos','presupuestos','recurrentes'] loop
    execute format('create policy ver on public.%I for select to authenticated using (hogar_id = public.mi_hogar())', t);
    execute format('create policy crear on public.%I for insert to authenticated with check (hogar_id = public.mi_hogar() and public.hogar_activo())', t);
    execute format('create policy editar on public.%I for update to authenticated using (hogar_id = public.mi_hogar() and public.hogar_activo()) with check (hogar_id = public.mi_hogar())', t);
    execute format('create policy borrar on public.%I for delete to authenticated using (hogar_id = public.mi_hogar() and public.hogar_activo())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 4. Vistas para reportes
-- ---------------------------------------------------------------
create or replace view public.v_resumen_mes with (security_invoker = true) as
select m.hogar_id,
       date_trunc('month', m.fecha)::date as mes,
       m.categoria_id,
       coalesce(c.tipo, case when m.monto_bs < 0 then 'gasto' else 'ingreso' end) as tipo,
       sum(m.monto_bs)::numeric(14,2) as total_bs,
       sum(m.monto_bs / nullif(m.tc_usd, 0))::numeric(14,2) as total_usd,
       count(*)::int as cantidad
from public.movimientos m
left join public.categorias c on c.id = m.categoria_id
where m.clase = 'normal'
group by 1, 2, 3, 4;

-- ---------------------------------------------------------------
-- 5. Funciones de negocio
-- ---------------------------------------------------------------

-- Une un movimiento con su contraparte en otra cuenta propia (traspaso).
-- Si la cuenta destino es manual (Efectivo, tarjeta manual) y no hay contraparte, la crea.
create or replace function public.emparejar_traspaso(p_mov uuid, p_destino uuid) returns uuid
language plpgsql set search_path = public as $$
declare m public.movimientos; d public.cuentas; par uuid;
begin
  select * into m from public.movimientos where id = p_mov and hogar_id = public.mi_hogar();
  if m.id is null or m.traspaso_par_id is not null then return m.traspaso_par_id; end if;
  select * into d from public.cuentas where id = p_destino and hogar_id = public.mi_hogar();
  if d.id is null or d.id = m.cuenta_id then return null; end if;

  select id into par from public.movimientos
   where cuenta_id = d.id and monto_bs = -m.monto_bs and traspaso_par_id is null
     and clase in ('normal','traspaso') and id <> m.id
     and fecha between m.fecha - 4 and m.fecha + 4
   order by abs(fecha - m.fecha), creado_en limit 1;

  if par is null and d.modo = 'manual' then
    insert into public.movimientos (hogar_id, cuenta_id, fecha, hora, descripcion, monto_bs, clase,
                                    estado, huella, traspaso_par_id, tc_usd)
    values (m.hogar_id, d.id, m.fecha, m.hora, 'Traspaso: ' || m.descripcion, -m.monto_bs, 'traspaso',
            'confirmado', 'espejo:' || m.id, m.id, m.tc_usd)
    returning id into par;
  end if;

  if par is not null then
    update public.movimientos set clase = 'traspaso', estado = 'confirmado', categoria_id = null,
                                  traspaso_par_id = m.id where id = par;
    update public.movimientos set traspaso_par_id = par where id = m.id;
  end if;
  return par;
end $$;

-- Marca o desmarca un movimiento como traspaso (desde la pantalla de movimientos)
create or replace function public.marcar_traspaso(p_mov uuid, p_destino uuid default null) returns void
language plpgsql set search_path = public as $$
begin
  update public.movimientos set clase = 'traspaso', estado = 'confirmado', categoria_id = null
   where id = p_mov and hogar_id = public.mi_hogar();
  if p_destino is not null then perform public.emparejar_traspaso(p_mov, p_destino); end if;
end $$;

create or replace function public.quitar_traspaso(p_mov uuid) returns void
language plpgsql set search_path = public as $$
declare par uuid; h text;
begin
  select traspaso_par_id into par from public.movimientos where id = p_mov and hogar_id = public.mi_hogar();
  update public.movimientos set clase = 'normal', estado = 'por_revisar', traspaso_par_id = null
   where id = p_mov and hogar_id = public.mi_hogar();
  if par is not null then
    select huella into h from public.movimientos where id = par;
    if h like 'espejo:%' then
      delete from public.movimientos where id = par;
    else
      update public.movimientos set clase = 'normal', estado = 'por_revisar', traspaso_par_id = null where id = par;
    end if;
  end if;
end $$;

-- Calcula la próxima fecha de un pago recurrente
create or replace function public.siguiente_fecha(p_fecha date, p_frecuencia text) returns date
language sql immutable as $$
  select (p_fecha + (case p_frecuencia
            when 'bimestral' then interval '2 months'
            when 'trimestral' then interval '3 months'
            when 'semestral' then interval '6 months'
            when 'anual' then interval '12 months'
            else interval '1 month' end))::date
$$;

-- Clasifica automáticamente: pagos de tarjeta, traspasos entre cuentas propias,
-- reglas aprendidas y pagos recurrentes. Devuelve cuántos movimientos clasificó.
create or replace function public.procesar_pendientes() returns jsonb
language plpgsql set search_path = public as $$
declare
  h uuid := public.mi_hogar();
  m record; c record; r record; rec record; par uuid;
  n_traspasos int := 0; n_reglas int := 0; n_recurrentes int := 0; i int; f_pago date;
begin
  if h is null then raise exception 'Sesión no válida'; end if;

  -- a) Pagos de tarjeta ("PAGO" en el extracto de la tarjeta)
  for m in
    select mv.* from public.movimientos mv join public.cuentas ct on ct.id = mv.cuenta_id
     where mv.hogar_id = h and ct.tipo = 'tarjeta' and mv.monto_bs > 0
       and mv.traspaso_par_id is null and mv.clase in ('normal','traspaso')
       and (mv.clase = 'traspaso' or mv.estado = 'por_revisar')
       and upper(trim(mv.descripcion)) like 'PAGO%'
  loop
    update public.movimientos set clase = 'traspaso', estado = 'confirmado', categoria_id = null where id = m.id;
    select mv2.id into par from public.movimientos mv2 join public.cuentas c2 on c2.id = mv2.cuenta_id
     where mv2.hogar_id = h and c2.tipo = 'banco' and mv2.monto_bs = -m.monto_bs
       and mv2.traspaso_par_id is null and mv2.clase in ('normal','traspaso')
       and mv2.fecha between m.fecha - 4 and m.fecha + 4
     order by abs(mv2.fecha - m.fecha) limit 1;
    if par is not null then
      update public.movimientos set clase = 'traspaso', estado = 'confirmado', categoria_id = null,
             traspaso_par_id = m.id where id = par;
      update public.movimientos set traspaso_par_id = par where id = m.id;
    end if;
    if m.clase = 'normal' then n_traspasos := n_traspasos + 1; end if;
  end loop;

  -- b) Movimientos que mencionan el número de otra cuenta propia
  for m in
    select mv.* from public.movimientos mv
     where mv.hogar_id = h and mv.traspaso_par_id is null
       and ((mv.clase = 'normal' and mv.estado = 'por_revisar') or mv.clase = 'traspaso')
  loop
    select ct.* into c from public.cuentas ct
     where ct.hogar_id = h and ct.id <> m.cuenta_id and length(coalesce(ct.numero, '')) >= 6
       and position(ct.numero in m.descripcion) > 0
     limit 1;
    if c.id is not null then
      if m.clase = 'normal' then
        update public.movimientos set clase = 'traspaso', estado = 'confirmado', categoria_id = null where id = m.id;
        n_traspasos := n_traspasos + 1;
      end if;
      perform public.emparejar_traspaso(m.id, c.id);
    end if;
  end loop;

  -- c) Reglas aprendidas (gana la regla con el texto más largo)
  for m in
    select mv.* from public.movimientos mv
     where mv.hogar_id = h and mv.clase = 'normal' and mv.estado = 'por_revisar'
  loop
    select rg.* into r from public.reglas rg
     where rg.hogar_id = h
       and position(upper(rg.texto) in upper(m.descripcion)) > 0
       and (rg.cuenta_id is null or rg.cuenta_id = m.cuenta_id)
     order by length(rg.texto) desc limit 1;
    if r.id is not null then
      if r.es_traspaso then
        update public.movimientos set clase = 'traspaso', estado = 'confirmado', categoria_id = null, regla_id = r.id
         where id = m.id;
        if r.cuenta_destino_id is not null then perform public.emparejar_traspaso(m.id, r.cuenta_destino_id); end if;
      else
        update public.movimientos set categoria_id = r.categoria_id, estado = 'confirmado', regla_id = r.id
         where id = m.id;
      end if;
      update public.reglas set veces = veces + 1 where id = r.id;
      n_reglas := n_reglas + 1;
    end if;
  end loop;

  -- d) Pagos recurrentes: si aparece el texto en el extracto, se marca pagado
  for rec in
    select * from public.recurrentes
     where hogar_id = h and activo and length(coalesce(trim(texto_reconocer), '')) >= 3
  loop
    i := 0;
    loop
      i := i + 1; exit when i > 24;
      f_pago := null;
      select mv.fecha into f_pago from public.movimientos mv
       where mv.hogar_id = h and mv.monto_bs < 0
         and position(upper(trim(rec.texto_reconocer)) in upper(mv.descripcion)) > 0
         and mv.fecha between rec.proxima_fecha - 20 and rec.proxima_fecha + 20
         and mv.fecha > coalesce(rec.ultimo_pago, date '1900-01-01')
       order by mv.fecha limit 1;
      exit when f_pago is null;
      rec.ultimo_pago := f_pago;
      rec.proxima_fecha := public.siguiente_fecha(rec.proxima_fecha, rec.frecuencia);
      update public.recurrentes set ultimo_pago = rec.ultimo_pago, proxima_fecha = rec.proxima_fecha where id = rec.id;
      n_recurrentes := n_recurrentes + 1;
    end loop;
  end loop;

  return jsonb_build_object('traspasos', n_traspasos, 'reglas', n_reglas, 'recurrentes', n_recurrentes);
end $$;

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

  -- Primera importación de una cuenta bancaria: toma el "saldo anterior" como saldo inicial
  if cta.tipo = 'banco' and (p_info->>'saldo_anterior') is not null
     and not exists (select 1 from public.movimientos where cuenta_id = cta.id) then
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

-- Saldo actual de cada cuenta (en tarjetas, negativo = deuda)
create or replace function public.saldos_cuentas() returns table (cuenta_id uuid, saldo numeric)
language sql stable set search_path = public as $$
  select c.id, (c.saldo_inicial + coalesce(sum(m.monto_bs), 0))::numeric(14,2)
    from public.cuentas c
    left join public.movimientos m on m.cuenta_id = c.id
         and m.fecha >= coalesce(c.fecha_saldo_inicial, date '1900-01-01')
   where c.hogar_id = public.mi_hogar()
   group by c.id, c.saldo_inicial
$$;

-- Ajusta el saldo de una cuenta al valor real (crea un movimiento de ajuste)
create or replace function public.ajustar_saldo(p_cuenta uuid, p_saldo_real numeric, p_fecha date default current_date)
returns void language plpgsql set search_path = public as $$
declare actual numeric;
begin
  select saldo into actual from public.saldos_cuentas() where cuenta_id = p_cuenta;
  if actual is null then raise exception 'Cuenta no encontrada'; end if;
  if round(p_saldo_real - actual, 2) <> 0 then
    insert into public.movimientos (cuenta_id, fecha, descripcion, monto_bs, clase, estado)
    values (p_cuenta, p_fecha, 'Ajuste de saldo', round(p_saldo_real - actual, 2), 'ajuste', 'confirmado');
  end if;
end $$;

-- Marca un pago recurrente como pagado y avanza a la próxima fecha
create or replace function public.marcar_recurrente_pagado(p_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  update public.recurrentes
     set ultimo_pago = (now() at time zone 'America/La_Paz')::date,
         proxima_fecha = public.siguiente_fecha(proxima_fecha, frecuencia)
   where id = p_id and hogar_id = public.mi_hogar();
end $$;

-- Vuelve a calcular el tipo de cambio de los movimientos (después de cargar tipos históricos)
create or replace function public.recalcular_tc() returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  update public.movimientos m set tc_usd = public.tc_en(m.fecha)
   where m.hogar_id = public.mi_hogar() and m.tc_usd is distinct from public.tc_en(m.fecha);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------
-- 6. Tipo de cambio automático desde la página del BCB
-- ---------------------------------------------------------------
create or replace function public.leer_tc_de_texto(p_html text) returns numeric
language plpgsql immutable as $$
declare txt text; pos int; m text[]; v numeric;
begin
  txt := regexp_replace(coalesce(p_html, ''), '<[^>]+>', ' ', 'g');
  txt := replace(replace(replace(txt, '&nbsp;', ' '), '&oacute;', 'ó'), '&Oacute;', 'Ó');
  txt := regexp_replace(txt, '\s+', ' ', 'g');
  pos := strpos(lower(txt), 'cambio oficial');
  if pos = 0 then pos := strpos(lower(txt), 'bolivianos por d'); end if;
  if pos = 0 then return null; end if;
  m := regexp_match(substr(txt, pos, 700), '(?:^|[^0-9,.])([0-9]{1,3},[0-9]{2,4})(?![0-9])');
  if m is null then return null; end if;
  v := replace(m[1], ',', '.')::numeric;
  if v < 3 or v > 100 then return null; end if;
  return v;
end $$;

create or replace function public.actualizar_tc_bcb() returns numeric
language plpgsql security definer set search_path = public, extensions as $$
declare resp extensions.http_response; v numeric;
        hoy date := (now() at time zone 'America/La_Paz')::date;
begin
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '25');
    select * into resp from extensions.http_get('https://www.bcb.gob.bo/');
  exception when others then
    raise warning 'No se pudo leer la página del BCB: %', sqlerrm;
    return null;
  end;
  if resp.status is distinct from 200 then
    raise warning 'El BCB respondió con estado %', resp.status;
    return null;
  end if;
  v := public.leer_tc_de_texto(resp.content);
  if v is null then
    raise warning 'No se encontró el tipo de cambio en la página del BCB';
    return null;
  end if;
  insert into public.tipos_cambio (fecha, bs_por_usd, origen)
  values (hoy, v, 'BCB automático')
  on conflict (fecha) do update
     set bs_por_usd = excluded.bs_por_usd, origen = excluded.origen, actualizado_en = now()
   where public.tipos_cambio.origen <> 'manual';
  return v;
end $$;

-- Botón "Actualizar ahora" (solo el dueño del sistema)
create or replace function public.actualizar_tc_ahora() returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  return public.actualizar_tc_bcb();
end $$;

-- Permisos de ejecución
revoke execute on function public.actualizar_tc_bcb() from public, anon, authenticated;
revoke execute on function public.crear_hogar_para(uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.crear_categorias_iniciales(uuid) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array[
    'public.emparejar_traspaso(uuid, uuid)', 'public.marcar_traspaso(uuid, uuid)', 'public.quitar_traspaso(uuid)',
    'public.procesar_pendientes()', 'public.importar_extracto(uuid, jsonb, jsonb)', 'public.saldos_cuentas()',
    'public.ajustar_saldo(uuid, numeric, date)', 'public.marcar_recurrente_pagado(uuid)', 'public.actualizar_tc_ahora()',
    'public.recalcular_tc()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Tarea diaria: 08:00 y 18:00 hora de Bolivia (12:00 y 22:00 UTC)
select cron.schedule('tc-bcb-manana', '0 12 * * *', 'select public.actualizar_tc_bcb()');
select cron.schedule('tc-bcb-tarde',  '0 22 * * *', 'select public.actualizar_tc_bcb()');

-- Valor inicial (publicado por el BCB el 10/10/2026) y primer intento de lectura
insert into public.tipos_cambio (fecha, bs_por_usd, origen)
values (date '2026-10-10', 11.73, 'BCB automático') on conflict (fecha) do nothing;
select public.actualizar_tc_bcb();

-- Si su usuario ya existía en Authentication antes de ejecutar este script, se le crea su hogar
do $$ declare u record; primero boolean; begin
  for u in select id, email, raw_user_meta_data from auth.users order by created_at loop
    if not exists (select 1 from public.perfiles where id = u.id) then
      primero := not exists (select 1 from public.perfiles);
      perform public.crear_hogar_para(u.id, u.email,
        coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)), primero);
    end if;
  end loop;
end $$;

-- Fin del script ✔
