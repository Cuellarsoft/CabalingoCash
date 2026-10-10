import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import { revisar, supabase } from '../lib/supabase';
import type { Presupuesto, ResumenMes, TipoCambio } from '../lib/tipos';
import { dinero, fechaCorta, finMes, hoy, inicioMes, nombreMes, simbolo, sumarMeses } from '../lib/formato';
import { descargarExcel } from '../lib/excel';
import { Boton, Cargando, Encabezado, Pestanas, Selector, Tarjeta } from '../components/ui';

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
        { nombre: 'Movimientos', filas: movs.map((m) => ({
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
                      <YAxis type="category" dataKey="nombre" width={130} tickLine={false} axisLine={false} fontSize={12} />
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
