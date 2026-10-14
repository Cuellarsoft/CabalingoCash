-- =====================================================================
--  MIS FINANZAS — Corrección: lectura del tipo de cambio del BCB
--  Péguelo en SQL Editor → New query → Run (una sola vez).
-- =====================================================================

-- Lee el tipo de cambio ignorando estilos y programas de la página
create or replace function public.leer_tc_de_texto(p_html text) returns numeric
language plpgsql immutable as $$
declare txt text; low text; pos int; desde int; m text[]; v numeric; etiqueta text;
begin
  txt := coalesce(p_html, '');
  -- 1) quitar bloques <style>, <script> y comentarios (no son texto visible)
  txt := regexp_replace(txt, '<style.*?</style>', ' ', 'gi');
  txt := regexp_replace(txt, '<script.*?</script>', ' ', 'gi');
  txt := regexp_replace(txt, '<!--.*?-->', ' ', 'g');
  -- 2) quitar etiquetas y normalizar espacios
  txt := regexp_replace(txt, '<[^>]+>', ' ', 'g');
  txt := replace(replace(replace(txt, '&nbsp;', ' '), '&oacute;', 'ó'), '&Oacute;', 'Ó');
  txt := regexp_replace(txt, '\s+', ' ', 'g');
  low := lower(txt);
  -- 3) probar cada aparición de las etiquetas hasta encontrar un valor válido
  foreach etiqueta in array array['cambio oficial', 'bolivianos por d'] loop
    desde := 1;
    loop
      pos := strpos(substr(low, desde), etiqueta);
      exit when pos = 0;
      pos := desde + pos - 1;
      m := regexp_match(substr(txt, pos, 500), '(?:^|[^0-9,.])([0-9]{1,3},[0-9]{2,4})(?![0-9])');
      if m is not null then
        v := replace(m[1], ',', '.')::numeric;
        if v between 3 and 100 then return v; end if;
      end if;
      desde := pos + length(etiqueta);
    end loop;
  end loop;
  return null;
end $$;

-- Se identifica como navegador al leer la página
create or replace function public.actualizar_tc_bcb() returns numeric
language plpgsql security definer set search_path = public, extensions as $$
declare resp extensions.http_response; v numeric;
        hoy date := (now() at time zone 'America/La_Paz')::date;
begin
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '25');
    perform extensions.http_set_curlopt('CURLOPT_USERAGENT', 'Mozilla/5.0 (compatible; MisFinanzas/1.0)');
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
revoke execute on function public.actualizar_tc_bcb() from public, anon, authenticated;

-- Prueba: debe mostrar el tipo de cambio de hoy (por ejemplo 11.73)
select public.actualizar_tc_bcb() as tipo_de_cambio_leido;
