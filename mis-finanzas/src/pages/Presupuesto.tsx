import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import { revisar, supabase } from '../lib/supabase';
import type { Presupuesto as P, ResumenMes } from '../lib/tipos';
import { dinero, finMes, hoy, inicioMes, nombreMes, sumarMeses } from '../lib/formato';
import { aNumero } from '../lib/importadores';
import { Barra, Boton, Cargando, colorSemaforo, Encabezado, Etiqueta, PuntoColor, SelectorMes, Tarjeta } from '../components/ui';

export default function Presupuesto() {
  const { categorias, moneda, avisar, activa, version } = useApp();
  const [mes, setMes] = useState(inicioMes(hoy()));
  const [pres, setPres] = useState<P[] | null>(null);
  const [res, setRes] = useState<ResumenMes[]>([]);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [tc, setTc] = useState<number | null>(null);
  const [copiando, setCopiando] = useState(false);

  async function cargar() {
    try {
      const fin = finMes(mes) < hoy() ? finMes(mes) : hoy();
      const [p, r, t] = await Promise.all([D.presupuestos(mes), D.resumen(mes, mes), D.tcEn(fin)]);
      setPres(p); setRes(r); setTc(t);
      setBorrador(Object.fromEntries(p.map((x) => [x.categoria_id, x.monto_bs ? String(x.monto_bs) : ''])));
    } catch (e) { avisar((e as Error).message, 'error'); setPres([]); }
  }
  useEffect(() => { setPres(null); cargar(); /* eslint-disable-next-line */ }, [mes, version]);

  const gastos = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of res) if (x.tipo === 'gasto' && x.categoria_id) m.set(x.categoria_id, (m.get(x.categoria_id) || 0) - (moneda === 'USD' ? x.total_usd : x.total_bs));
    return m;
  }, [res, moneda]);

  const conv = (bs: number) => (moneda === 'USD' ? (tc ? bs / tc : NaN) : bs);

  async function guardar(categoria_id: string) {
    const valor = aNumero(borrador[categoria_id] || '') || 0;
    const actual = pres?.find((p) => p.categoria_id === categoria_id)?.monto_bs || 0;
    if (valor === actual) return;
    try {
      const r = revisar(await supabase.from('presupuestos').upsert({ categoria_id, mes, monto_bs: valor }, { onConflict: 'hogar_id,categoria_id,mes' }).select().single()) as P;
      setPres((ps) => [...(ps || []).filter((p) => p.categoria_id !== categoria_id), { ...r, monto_bs: Number(r.monto_bs) }]);
    } catch (e) { avisar((e as Error).message, 'error'); }
  }

  async function copiarAnterior() {
    setCopiando(true);
    try {
      const ant = await D.presupuestos(sumarMeses(mes, -1));
      if (!ant.length) { avisar('El mes anterior no tiene presupuesto.', 'info'); return; }
      revisar(await supabase.from('presupuestos').upsert(ant.map((a) => ({ categoria_id: a.categoria_id, mes, monto_bs: a.monto_bs })), { onConflict: 'hogar_id,categoria_id,mes' }));
      avisar('Presupuesto copiado del mes anterior.');
      await cargar();
    } catch (e) { avisar((e as Error).message, 'error'); }
    finally { setCopiando(false); }
  }

  if (!pres) return <Cargando />;

  const cats = categorias.filter((c) => c.tipo === 'gasto' && c.activa);
  const enPres = cats.filter((c) => c.en_presupuesto);
  const fuera = cats.filter((c) => !c.en_presupuesto);
  const totalPres = conv(enPres.reduce((a, c) => a + (pres.find((p) => p.categoria_id === c.id)?.monto_bs || 0), 0));
  const totalGasto = enPres.reduce((a, c) => a + (gastos.get(c.id) || 0), 0);

  const fila = (c: typeof cats[number], cuenta: boolean) => {
    const p = conv(pres.find((x) => x.categoria_id === c.id)?.monto_bs || 0);
    const g = gastos.get(c.id) || 0;
    const sem = colorSemaforo(g, p);
    return (
      <li key={c.id} className="grid grid-cols-[1fr_7.5rem] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_5rem]">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><PuntoColor color={c.color} /><span className="truncate">{c.nombre}</span></span>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1.5 text-xs text-tinta-tenue">Bs</span>
          <input inputMode="decimal" disabled={!activa} value={borrador[c.id] ?? ''} placeholder="0"
            onChange={(e) => setBorrador({ ...borrador, [c.id]: e.target.value })} onBlur={() => guardar(c.id)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full rounded-lg border border-black/10 py-1.5 pl-7 pr-2 text-right text-sm tabular-nums outline-none focus:border-marca-500" />
        </div>
        <span className="text-sm tabular-nums text-tinta-suave sm:text-right">gastado <b className="text-tinta">{dinero(g, moneda)}</b></span>
        <span className="text-right">{cuenta && (p || g) ? <Etiqueta color={sem}>{p ? `${Math.round((g / p) * 100)} %` : 'sin pres.'}</Etiqueta> : null}</span>
        {cuenta && <div className="col-span-2 sm:col-span-4"><Barra valor={g} maximo={p} alto="h-1.5" /></div>}
      </li>
    );
  };

  return (
    <>
      <Encabezado titulo="Presupuesto" subtitulo="Cuánto quiere gastar en cada categoría este mes (en Bs).">
        <SelectorMes mes={mes} cambiar={setMes} nombre={nombreMes(mes)} />
        <Boton variante="secundario" onClick={copiarAnterior} cargando={copiando} disabled={!activa}><Copy className="h-4 w-4" />Copiar mes anterior</Boton>
      </Encabezado>

      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-tinta-suave">Gastado del presupuesto</div>
            <div className="text-2xl font-bold tabular-nums">{dinero(totalGasto, moneda)} <span className="text-base font-medium text-tinta-tenue">de {dinero(totalPres, moneda)}</span></div>
          </div>
          {totalPres > 0 && <Etiqueta color={colorSemaforo(totalGasto, totalPres)}>{Math.round((totalGasto / totalPres) * 100)} % usado · quedan {dinero(totalPres - totalGasto, moneda)}</Etiqueta>}
        </div>
        <div className="mt-3"><Barra valor={totalGasto} maximo={totalPres} alto="h-3" /></div>
      </Tarjeta>

      <Tarjeta titulo="Por categoría">
        <ul className="divide-y divide-black/5">{enPres.map((c) => fila(c, true))}</ul>
      </Tarjeta>

      {fuera.length > 0 && (
        <Tarjeta className="mt-5" titulo="No cuentan en el presupuesto personal">
          <ul className="divide-y divide-black/5 opacity-80">{fuera.map((c) => fila(c, false))}</ul>
          <p className="mt-2 text-xs text-tinta-tenue">Puede cambiar esto en Configuración → Categorías.</p>
        </Tarjeta>
      )}
    </>
  );
}
