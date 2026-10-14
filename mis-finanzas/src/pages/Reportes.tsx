import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import { revisar, supabase } from '../lib/supabase';
import type { Movimiento, Presupuesto, ResumenMes, TipoCambio } from '../lib/tipos';
import { diasEntre, dinero, fechaCorta, finMes, hoy, inicioMes, nombreMes, simbolo, sumarDias, sumarMeses } from '../lib/formato';
import { descargarExcel } from '../lib/excel';
import { Boton, Campo, Cargando, cx, Encabezado, Entrada, Pestanas, PuntoColor, Selector, Tarjeta } from '../components/ui';

const nfEje = new Intl.NumberFormat('es-BO', { notation: 'compact', maximumFractionDigits: 1 });

export default function Reportes() {
  const { categorias, moneda, avisar, version, nombreCuenta, categoria } = useApp();
  const actual = inicioMes(hoy());
  const [hasta, setHasta] = useState(actual);
  const [meses, setMeses] = useState<'3' | '6' | '12'>('6');
  const desde = sumarMeses(hasta, -(Number(meses) - 1));
  const [res, setRes] = useState<ResumenMes[] | null>(null);
  const [pres, setPres] = useState<Presupuesto[]>([]);
  const [tcs, setTcs] = useState<TipoCambio[]>([]);
  const [mesCat, setMesCat] = useState<string>('todo');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setRes(null);
    (async () => {
      try {
        const [r, p, t] = await Promise.all([
          D.resumen(desde, hasta),
          supabase.from('presupuestos').select('*').gte('mes', desde).lte('mes', hasta),
          supabase.from('tipos_cambio').select('*').lte('fecha', finMes(hasta)).order('fecha', { ascending: false }).limit(800),
        ]);
        setRes(r); setPres(((revisar(p) as Presupuesto[]) || []).map((x) => ({ ...x, monto_bs: Number(x.monto_bs) }))); setTcs((revisar(t) as TipoCambio[]) || []);
      } catch (e) { avisar((e as Error).message, 'error'); setRes([]); }
    })();
  }, [desde, hasta, version, avisar]);

  const lista = useMemo(() => Array.from({ length: Number(meses) }, (_, i) => sumarMeses(desde, i)), [desde, meses]);
  const tcFinMes = (m: string) => {
    const f = finMes(m) < hoy() ? finMes(m) : hoy();
    const t = tcs.find((x) => x.fecha <= f) || tcs[tcs.length - 1];
    return t ? Number(t.bs_por_usd) : null;
  };
  const val = (x: ResumenMes) => (moneda === 'USD' ? x.total_usd : x.total_bs);
  const presVal = (bs: number, m: string) => (moneda === 'USD' ? (tcFinMes(m) ? bs / tcFinMes(m)! : 0) : bs);
  const enPres = useMemo(() => new Set(categorias.filter((c) => c.en_presupuesto).map((c) => c.id)), [categorias]);

  const evolucion = useMemo(() => lista.map((m) => {
    const r = (res || []).filter((x) => x.mes === m);
    const ingresos = r.filter((x) => x.tipo === 'ingreso').reduce((a, x) => a + val(x), 0);
    const gastos = r.filter((x) => x.tipo === 'gasto').reduce((a, x) => a - val(x), 0);
    const gastoPres = r.filter((x) => x.tipo === 'gasto' && x.categoria_id && enPres.has(x.categoria_id)).reduce((a, x) => a - val(x), 0);
    const presupuesto = presVal(pres.filter((p) => p.mes === m && enPres.has(p.categoria_id)).reduce((a, p) => a + p.monto_bs, 0), m);
    return { mes: m, nombre: nombreMes(m, true), ingresos: Math.round(ingresos), gastos: Math.round(gastos), gastoPres, presupuesto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [res, pres, lista, moneda, tcs, enPres]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of res || []) {
      if (x.tipo !== 'gasto' || (mesCat !== 'todo' && x.mes !== mesCat)) continue;
      const k = x.categoria_id || 'sin';
      m.set(k, (m.get(k) || 0) - val(x));
    }
    return [...m.entries()].filter(([, v]) => v > 0).map(([k, v]) => ({
      nombre: k === 'sin' ? 'Sin clasificar' : categoria(k)?.nombre || '—', color: k === 'sin' ? '#cbd5e1' : categoria(k)?.color || '#94a3b8', valor: Math.round(v * 100) / 100,
    })).sort((a, b) => b.valor - a.valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, mesCat, moneda, categorias]);

  async function exportar() {
    setExportando(true);
    try {
      const movs = await D.movimientos(desde, finMes(hasta));
      const s = simbolo(moneda);
      await descargarExcel(`finanzas_${desde.slice(0, 7)}_a_${hasta.slice(0, 7)}.xlsx`, [
        { nombre: 'Resumen mensual', filas: evolucion.map((e) => ({ Mes: nombreMes(e.mes), [`Ingresos (${s})`]: e.ingresos, [`Gastos (${s})`]: e.gastos, [`Presupuesto (${s})`]: Math.round(e.presupuesto), [`Gasto en presupuesto (${s})`]: Math.round(e.gastoPres), [`Diferencia (${s})`]: Math.round(e.presupuesto - e.gastoPres) })) },
        { nombre: 'Por categoría', filas: porCategoria.map((c) => ({ Categoría: c.nombre, [`Gasto (${s})`]: c.valor })) },
        { nombre: 'Movimientos', filas: movs.filter((m) => m.clase !== 'excluido').map((m) => ({
          Fecha: fechaCorta(m.fecha), Cuenta: nombreCuenta(m.cuenta_id), Descripción: m.descripcion,
          Categoría: m.clase === 'traspaso' ? 'Traspaso' : m.clase === 'ajuste' ? 'Ajuste' : categoria(m.categoria_id)?.nombre || 'Sin clasificar',
          'Monto Bs': m.monto_bs, 'TC Bs/USD': m.tc_usd, 'Monto USD': m.tc_usd ? Math.round((m.monto_bs / m.tc_usd) * 100) / 100 : null,
          'Moneda original': m.moneda_original, 'Monto original': m.monto_original, Nota: m.nota || '',
        })) },
      ]);
    } catch (e) { avisar((e as Error).message, 'error'); }
    setExportando(false);
  }

  const opcionesHasta = Array.from({ length: 24 }, (_, i) => sumarMeses(actual, -i));
  const fmt = (v: number) => dinero(v, moneda);

  return (
    <>
      <Encabezado titulo="Reportes" subtitulo="Montos sin traspasos entre sus cuentas.">
        <Pestanas valor={meses} cambiar={setMeses} opciones={[{ id: '3', nombre: '3 meses' }, { id: '6', nombre: '6 meses' }, { id: '12', nombre: '12 meses' }]} />
        <Selector value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-auto">
          {opcionesHasta.map((m) => <option key={m} value={m}>hasta {nombreMes(m)}</option>)}
        </Selector>
        <Boton variante="secundario" onClick={exportar} cargando={exportando}><Download className="h-4 w-4" />Excel</Boton>
      </Encabezado>

      <RangoFechas />

      {!res ? <Cargando /> : (
        <div className="grid gap-5">
          <Tarjeta titulo="Ingresos y gastos por mes">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucion} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef0ee" />
                  <XAxis dataKey="nombre" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => nfEje.format(v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
                  <Tooltip formatter={(v: number) => fmt(v)} cursor={{ fill: 'rgba(0,0,0,.04)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#259a79" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="gastos" name="Gastos" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Tarjeta>

          <div className="grid gap-5 lg:grid-cols-2">
            <Tarjeta titulo="Gasto por categoría" accion={
              <Selector value={mesCat} onChange={(e) => setMesCat(e.target.value)} className="w-auto py-1 text-xs">
                <option value="todo">Todo el período</option>
                {lista.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
              </Selector>}>
              {porCategoria.length === 0 ? <p className="text-sm text-tinta-suave">Sin gastos en el período.</p> : (
                <div style={{ height: Math.max(200, porCategoria.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porCategoria} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="nombre" width={160} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip formatter={(v: number) => fmt(v)} cursor={{ fill: 'rgba(0,0,0,.04)' }} />
                      <Bar dataKey="valor" name="Gasto" radius={[0, 6, 6, 0]} maxBarSize={20}>
                        {porCategoria.map((c) => <Cell key={c.nombre} fill={c.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Tarjeta>

            <Tarjeta titulo="Presupuesto vs. real">
              <table className="w-full text-sm">
                <thead className="text-xs text-tinta-suave"><tr><th className="py-1.5 text-left font-medium">Mes</th><th className="text-right font-medium">Presupuesto</th><th className="text-right font-medium">Real</th><th className="text-right font-medium">Diferencia</th></tr></thead>
                <tbody className="divide-y divide-black/5 tabular-nums">
                  {evolucion.map((e) => {
                    const dif = e.presupuesto - e.gastoPres;
                    return (
                      <tr key={e.mes}>
                        <td className="py-2 capitalize">{nombreMes(e.mes, true)}</td>
                        <td className="text-right">{e.presupuesto ? fmt(e.presupuesto) : '—'}</td>
                        <td className="text-right">{fmt(e.gastoPres)}</td>
                        <td className={'text-right font-medium ' + (!e.presupuesto ? 'text-tinta-tenue' : dif >= 0 ? 'text-marca-700' : 'text-red-600')}>
                          {e.presupuesto ? dinero(dif, moneda, { signo: true }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-tinta-tenue">Verde = gastó menos de lo previsto. Solo categorías que cuentan en el presupuesto.</p>
            </Tarjeta>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------- Rango de fechas
function RangoFechas() {
  const { cuentas, moneda, avisar, version, categoria, nombreCuenta } = useApp();
  const [desde, setDesde] = useState(inicioMes(hoy()));
  const [hasta, setHasta] = useState(hoy());
  const [cuenta, setCuenta] = useState('');
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [exportando, setExportando] = useState(false);

  const valido = !!desde && !!hasta && desde <= hasta;

  useEffect(() => {
    if (!valido) return;
    setMovs(null);
    D.movimientos(desde, hasta).then(setMovs).catch((e) => { avisar((e as Error).message, 'error'); setMovs([]); });
  }, [desde, hasta, version, valido, avisar]);

  const atajo = (d: string, h: string) => { setDesde(d); setHasta(h); };
  const hoyTxt = hoy();
  const atajos = [
    { n: 'Este mes', d: inicioMes(hoyTxt), h: hoyTxt },
    { n: 'Mes anterior', d: sumarMeses(inicioMes(hoyTxt), -1), h: finMes(sumarMeses(inicioMes(hoyTxt), -1)) },
    { n: 'Últimos 30 días', d: sumarDias(hoyTxt, -29), h: hoyTxt },
    { n: 'Este año', d: hoyTxt.slice(0, 4) + '-01-01', h: hoyTxt },
  ];

  // Solo movimientos que cuentan (sin traspasos, ajustes ni eliminados)
  const calc = useMemo(() => {
    const lista = (movs || []).filter((m) => m.clase === 'normal' && (!cuenta || m.cuenta_id === cuenta));
    const val = (m: Movimiento) => (moneda === 'USD' ? (m.tc_usd ? m.monto_bs / m.tc_usd : 0) : m.monto_bs);
    const tipo = (m: Movimiento) => categoria(m.categoria_id)?.tipo || (m.monto_bs < 0 ? 'gasto' : 'ingreso');
    let ingresos = 0, gastos = 0;
    const porCat = new Map<string, { tipo: string; total: number; n: number }>();
    const porDia = new Map<string, { i: number; g: number }>();
    for (const m of lista) {
      const t = tipo(m), v = val(m);
      if (t === 'ingreso') ingresos += v; else gastos -= v;
      const k = m.categoria_id || (t === 'ingreso' ? 'sin-ing' : 'sin-gas');
      const c = porCat.get(k) || { tipo: t, total: 0, n: 0 };
      c.total += t === 'ingreso' ? v : -v; c.n++; porCat.set(k, c);
      const d = porDia.get(m.fecha) || { i: 0, g: 0 };
      if (t === 'ingreso') d.i += v; else d.g -= v;
      porDia.set(m.fecha, d);
    }
    // Acumulado día a día
    const serie: { nombre: string; ingresos: number; gastos: number }[] = [];
    if (valido) {
      const dias = Math.min(diasEntre(desde, hasta), 731);
      let ai = 0, ag = 0;
      for (let k = 0; k <= dias; k++) {
        const f = sumarDias(desde, k);
        const d = porDia.get(f);
        if (d) { ai += d.i; ag += d.g; }
        serie.push({ nombre: f.slice(8, 10) + '/' + f.slice(5, 7), ingresos: Math.round(ai), gastos: Math.round(ag) });
      }
    }
    const filas = [...porCat.entries()].map(([k, c]) => ({
      k, tipo: c.tipo, total: c.total, n: c.n,
      nombre: k === 'sin-ing' ? 'Ingresos sin clasificar' : k === 'sin-gas' ? 'Gastos sin clasificar' : categoria(k)?.nombre || '—',
      color: k.startsWith('sin-') ? '#cbd5e1' : categoria(k)?.color || '#94a3b8',
    })).sort((a, b) => b.total - a.total);
    return { lista, ingresos, gastos, serie, filas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movs, cuenta, moneda, desde, hasta, valido]);

  async function exportar() {
    setExportando(true);
    try {
      const s = simbolo(moneda);
      await descargarExcel(`ingresos_gastos_${desde}_a_${hasta}.xlsx`, [
        { nombre: 'Resumen', filas: [
          { Concepto: 'Desde', Valor: fechaCorta(desde) }, { Concepto: 'Hasta', Valor: fechaCorta(hasta) },
          { Concepto: `Ingresos (${s})`, Valor: Math.round(calc.ingresos * 100) / 100 },
          { Concepto: `Gastos (${s})`, Valor: Math.round(calc.gastos * 100) / 100 },
          { Concepto: `Resultado (${s})`, Valor: Math.round((calc.ingresos - calc.gastos) * 100) / 100 },
        ] },
        { nombre: 'Por categoría', filas: calc.filas.map((f) => ({ Tipo: f.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', Categoría: f.nombre, Movimientos: f.n, [`Total (${s})`]: Math.round(f.total * 100) / 100 })) },
        { nombre: 'Movimientos', filas: calc.lista.map((m) => ({
          Fecha: fechaCorta(m.fecha), Cuenta: nombreCuenta(m.cuenta_id), Descripción: m.descripcion,
          Categoría: categoria(m.categoria_id)?.nombre || 'Sin clasificar', 'Monto Bs': m.monto_bs,
          'Monto USD': m.tc_usd ? Math.round((m.monto_bs / m.tc_usd) * 100) / 100 : null, Nota: m.nota || '',
        })) },
      ]);
    } catch (e) { avisar((e as Error).message, 'error'); }
    setExportando(false);
  }

  const resultado = calc.ingresos - calc.gastos;
  const fmt = (v: number) => dinero(v, moneda);
  const ingresosF = calc.filas.filter((f) => f.tipo === 'ingreso');
  const gastosF = calc.filas.filter((f) => f.tipo !== 'ingreso');

  return (
    <Tarjeta titulo="Ingresos y gastos acumulados por fechas" className="mb-5"
      accion={<Boton variante="secundario" onClick={exportar} cargando={exportando} disabled={!valido || !movs}><Download className="h-4 w-4" />Excel</Boton>}>
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <Campo etiqueta="Desde"><Entrada type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo etiqueta="Hasta"><Entrada type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} /></Campo>
        <Campo etiqueta="Cuenta">
          <Selector value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {atajos.map((a) => (
          <button key={a.n} onClick={() => atajo(a.d, a.h)}
            className={cx('rounded-full border px-3 py-1 text-xs font-medium transition',
              desde === a.d && hasta === a.h ? 'border-marca-700 bg-marca-700 text-white' : 'border-black/10 text-tinta-suave hover:bg-papel')}>
            {a.n}
          </button>
        ))}
      </div>

      {!valido ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">La fecha «desde» debe ser anterior o igual a «hasta».</p>
      ) : !movs ? <Cargando /> : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-marca-50 p-4">
              <div className="text-xs font-medium text-marca-800">Ingresos</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-marca-800">{fmt(calc.ingresos)}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <div className="text-xs font-medium text-amber-900">Gastos</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-amber-900">{fmt(calc.gastos)}</div>
            </div>
            <div className={cx('rounded-2xl p-4', resultado >= 0 ? 'bg-papel' : 'bg-red-50')}>
              <div className="text-xs font-medium text-tinta-suave">Resultado (ingresos − gastos)</div>
              <div className={cx('mt-1 text-xl font-bold tabular-nums', resultado >= 0 ? 'text-tinta' : 'text-red-700')}>{dinero(resultado, moneda, { signo: true })}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-tinta-tenue">
            {fechaCorta(desde)} al {fechaCorta(hasta)} · {calc.lista.length} movimientos{cuenta ? ` de ${nombreCuenta(cuenta)}` : ''} · sin traspasos entre sus cuentas ni movimientos eliminados.
          </p>

          {calc.serie.length > 1 && (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calc.serie} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef0ee" />
                  <XAxis dataKey="nombre" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                  <YAxis tickFormatter={(v) => nfEje.format(v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="stepAfter" dataKey="ingresos" name="Ingresos acumulados" stroke="#259a79" strokeWidth={2} dot={false} />
                  <Line type="stepAfter" dataKey="gastos" name="Gastos acumulados" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {calc.filas.length > 0 && (
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {[{ t: 'Gastos por categoría', f: gastosF, total: calc.gastos }, { t: 'Ingresos por categoría', f: ingresosF, total: calc.ingresos }].map((g) => (
                <div key={g.t}>
                  <h3 className="mb-2 text-sm font-semibold">{g.t}</h3>
                  {g.f.length === 0 ? <p className="text-sm text-tinta-suave">Ninguno en este período.</p> : (
                    <ul className="divide-y divide-black/5 text-sm">
                      {g.f.map((f) => (
                        <li key={f.k} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="flex min-w-0 items-center gap-2"><PuntoColor color={f.color} /><span className="truncate">{f.nombre}</span>
                            <span className="text-xs text-tinta-tenue">({f.n})</span></span>
                          <span className="shrink-0 tabular-nums"><b>{fmt(f.total)}</b>
                            <span className="ml-1 text-xs text-tinta-tenue">{g.total > 0 ? Math.round((f.total / g.total) * 100) : 0} %</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}
