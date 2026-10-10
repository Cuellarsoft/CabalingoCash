import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CreditCard, Inbox, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import type { Importacion, Presupuesto, Recurrente, ResumenMes } from '../lib/tipos';
import { diasEntre, dinero, fechaCorta, finMes, hoy, inicioMes, nombreMes } from '../lib/formato';
import { Barra, Boton, Cargando, colorSemaforo, Encabezado, Etiqueta, Indicador, PuntoColor, SelectorMes, Tarjeta, Vacio } from '../components/ui';
import { supabase } from '../lib/supabase';

export default function Inicio() {
  const { cuentas, categorias, moneda, ver, version, avisar } = useApp();
  const [mes, setMes] = useState(inicioMes(hoy()));
  const [res, setRes] = useState<ResumenMes[] | null>(null);
  const [pres, setPres] = useState<Presupuesto[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [imps, setImps] = useState<Map<string, Importacion>>(new Map());
  const [recs, setRecs] = useState<Recurrente[]>([]);
  const [pend, setPend] = useState(0);
  const [tcMes, setTcMes] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const fin = finMes(mes) < hoy() ? finMes(mes) : hoy();
        const [r, p, s, i, rc, tc, pe] = await Promise.all([
          D.resumen(mes, mes), D.presupuestos(mes), D.saldos(), D.ultimasImportaciones(), D.recurrentes(), D.tcEn(fin),
          supabase.from('movimientos').select('id', { count: 'exact', head: true }).eq('estado', 'por_revisar'),
        ]);
        if (!vivo) return;
        setRes(r); setPres(p); setSaldos(s); setImps(i); setRecs(rc); setTcMes(tc); setPend(pe.count || 0);
      } catch (e) { avisar((e as Error).message, 'error'); setRes([]); }
    })();
    return () => { vivo = false; };
  }, [mes, version, avisar]);

  const v = (x: ResumenMes) => (moneda === 'USD' ? x.total_usd : x.total_bs);
  const presM = (bs: number) => (moneda === 'USD' ? (tcMes ? bs / tcMes : NaN) : bs);

  const filas = useMemo(() => {
    if (!res) return [];
    const gastoPorCat = new Map<string, number>();
    for (const x of res) if (x.tipo === 'gasto' && x.categoria_id) gastoPorCat.set(x.categoria_id, (gastoPorCat.get(x.categoria_id) || 0) - v(x));
    return categorias.filter((c) => c.tipo === 'gasto' && c.en_presupuesto)
      .map((c) => ({ c, gasto: gastoPorCat.get(c.id) || 0, pres: presM(pres.find((p) => p.categoria_id === c.id)?.monto_bs || 0) }))
      .filter((f) => f.gasto !== 0 || f.pres !== 0)
      .sort((a, b) => (b.pres ? b.gasto / b.pres : 9) - (a.pres ? a.gasto / a.pres : 9) || b.gasto - a.gasto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, pres, categorias, moneda, tcMes]);

  if (!res) return <Cargando />;

  const enPres = new Set(categorias.filter((c) => c.en_presupuesto).map((c) => c.id));
  const gastado = res.filter((x) => x.tipo === 'gasto' && x.categoria_id && enPres.has(x.categoria_id)).reduce((a, x) => a - v(x), 0);
  const sinClasificar = res.filter((x) => !x.categoria_id && x.total_bs < 0).reduce((a, x) => a - v(x), 0);
  const ingresos = res.filter((x) => x.tipo === 'ingreso').reduce((a, x) => a + v(x), 0);
  const presTotal = presM(pres.filter((p) => enPres.has(p.categoria_id)).reduce((a, p) => a + p.monto_bs, 0));

  const tarjetas = cuentas.filter((c) => c.tipo === 'tarjeta' && c.activa);
  const deuda = tarjetas.reduce((a, c) => a + Math.max(0, -(saldos.get(c.id) || 0)), 0);

  const avisosRec = recs.filter((r) => r.activo && D.estadoRecurrente(r) !== 'futuro');
  const vencTarjetas = tarjetas.map((c) => ({ c, i: imps.get(c.id) }))
    .filter((x) => x.i?.fecha_vencimiento && diasEntre(hoy(), x.i.fecha_vencimiento) >= -5 && diasEntre(hoy(), x.i.fecha_vencimiento) <= 15);

  const sinDatos = res.length === 0 && pres.length === 0;

  return (
    <>
      <Encabezado titulo="Inicio" subtitulo="Cómo va el mes">
        <SelectorMes mes={mes} cambiar={setMes} nombre={nombreMes(mes)} />
      </Encabezado>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="Gastado vs. presupuesto" icono={<TrendingDown className="h-4 w-4" />}
          tono={presTotal ? (colorSemaforo(gastado, presTotal) === 'rojo' ? 'peligro' : colorSemaforo(gastado, presTotal) === 'ambar' ? 'alerta' : 'normal') : 'normal'}
          valor={dinero(gastado, moneda, { corto: true })}
          detalle={presTotal ? <><Barra valor={gastado} maximo={presTotal} /><span className="mt-1 block">de {dinero(presTotal, moneda, { corto: true })} · {Math.round((gastado / presTotal) * 100)} %</span></> : <Link to="/presupuesto" className="text-marca-700 underline">Definir presupuesto</Link>} />
        <Indicador etiqueta="Ingresos del mes" icono={<TrendingUp className="h-4 w-4" />} valor={dinero(ingresos, moneda, { corto: true })}
          detalle="Sin contar traspasos entre sus cuentas" />
        <Indicador etiqueta="Deuda en tarjetas" icono={<CreditCard className="h-4 w-4" />} valor={ver(deuda, null, { corto: true })}
          tono={tarjetas.some((c) => c.linea_credito && -(saldos.get(c.id) || 0) / c.linea_credito > 0.8) ? 'alerta' : 'normal'}
          detalle={<Link to="/tarjetas" className="underline">Ver tarjetas</Link>} />
        <Indicador etiqueta="Por revisar" icono={<Inbox className="h-4 w-4" />} valor={pend}
          tono={pend > 0 ? 'alerta' : 'normal'}
          detalle={pend > 0 ? <Link to="/movimientos?estado=por_revisar" className="text-marca-700 underline">Clasificar ahora</Link> : 'Todo clasificado ✔'} />
      </div>

      {sinDatos ? (
        <Tarjeta className="mt-5">
          <Vacio icono={<Upload className="h-8 w-8" />} titulo="Todavía no hay movimientos este mes"
            texto="Importe el extracto de su banco o registre un gasto con el botón +."
            accion={<Link to="/importar"><Boton>Importar extracto</Boton></Link>} />
        </Tarjeta>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <Tarjeta titulo="Gastado vs. presupuesto por categoría" accion={<Link to="/presupuesto" className="text-sm text-marca-700">Editar</Link>}>
            <ul className="space-y-3.5">
              {filas.map(({ c, gasto, pres: p }) => (
                <li key={c.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><PuntoColor color={c.color} /><span className="truncate">{c.nombre}</span></span>
                    <span className="shrink-0 tabular-nums">
                      <b>{dinero(gasto, moneda)}</b>
                      <span className="text-tinta-tenue"> / {p ? dinero(p, moneda) : 'sin presupuesto'}</span>
                    </span>
                  </div>
                  <Barra valor={gasto} maximo={p} />
                </li>
              ))}
              {filas.length === 0 && <li className="text-sm text-tinta-suave">Sin gastos clasificados este mes.</li>}
            </ul>
            {sinClasificar > 0 && (
              <Link to="/movimientos?estado=por_revisar" className="mt-4 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Gastos sin clasificar</span>
                <b className="tabular-nums">{dinero(sinClasificar, moneda)}</b>
              </Link>
            )}
          </Tarjeta>

          <div className="space-y-5">
            <Tarjeta titulo="Próximos vencimientos" accion={<Link to="/recurrentes" className="text-sm text-marca-700">Ver todos</Link>}>
              {avisosRec.length === 0 && vencTarjetas.length === 0 ? (
                <p className="text-sm text-tinta-suave">Nada por vencer en los próximos días.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {vencTarjetas.map(({ c, i }) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-tinta-tenue" />{c.nombre}</span>
                      <span className="text-right">
                        <span className="block tabular-nums">mín. {ver(i!.pago_minimo)}</span>
                        <Etiqueta color={diasEntre(hoy(), i!.fecha_vencimiento!) < 3 ? 'rojo' : 'ambar'}>vence {fechaCorta(i!.fecha_vencimiento)}</Etiqueta>
                      </span>
                    </li>
                  ))}
                  {avisosRec.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><Bell className="h-4 w-4 text-tinta-tenue" />{r.nombre}</span>
                      <span className="text-right">
                        {r.monto_estimado && <span className="block tabular-nums">{ver(Number(r.monto_estimado))}</span>}
                        <Etiqueta color={D.estadoRecurrente(r) === 'vencido' ? 'rojo' : 'ambar'}>
                          {D.estadoRecurrente(r) === 'vencido' ? 'venció' : 'vence'} {fechaCorta(r.proxima_fecha)}
                        </Etiqueta>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            <Tarjeta titulo="Saldos">
              <ul className="space-y-2 text-sm">
                {cuentas.filter((c) => c.activa).map((c) => {
                  const s = saldos.get(c.id) || 0;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-tinta-suave">{c.nombre}</span>
                      <span className={'whitespace-nowrap tabular-nums font-medium ' + (c.tipo === 'tarjeta' && s < 0 ? 'text-red-700' : '')}>
                        {c.tipo === 'tarjeta' ? (s < 0 ? `debe ${ver(-s)}` : ver(s)) : ver(s)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          </div>
        </div>
      )}
    </>
  );
}
