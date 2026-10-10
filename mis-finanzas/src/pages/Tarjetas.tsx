import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Plus, Scale, Wallet } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import { revisar, supabase, traerTodo } from '../lib/supabase';
import type { Cuenta, Importacion, Movimiento } from '../lib/tipos';
import { diasEntre, fechaCorta, hoy, inicioMes, nombreMes, sumarMeses } from '../lib/formato';
import { aNumero } from '../lib/importadores';
import { Barra, Boton, Campo, Cargando, Encabezado, Entrada, Etiqueta, Modal, Tarjeta, Vacio } from '../components/ui';
import FormMovimiento from '../components/FormMovimiento';

interface ResumenMesTarjeta { mes: string; consumos: number; intereses: number; pagos: number }

export default function Tarjetas() {
  const { cuentas, categorias, ver, avisar, tocar, version, activa } = useApp();
  const tarjetas = cuentas.filter((c) => c.tipo === 'tarjeta' && c.activa);
  const [saldos, setSaldos] = useState<Map<string, number> | null>(null);
  const [imps, setImps] = useState<Map<string, Importacion>>(new Map());
  const [hist, setHist] = useState<Map<string, ResumenMesTarjeta[]>>(new Map());
  const [form, setForm] = useState<{ tipo: 'gasto' | 'traspaso'; cuenta?: string; destino?: string } | null>(null);
  const [ajuste, setAjuste] = useState<Cuenta | null>(null);

  const catInteres = categorias.find((c) => c.nombre.toLowerCase().startsWith('intereses'))?.id;

  useEffect(() => {
    (async () => {
      try {
        const desde = sumarMeses(inicioMes(hoy()), -5);
        const [s, i, movs] = await Promise.all([
          D.saldos(), D.ultimasImportaciones(),
          tarjetas.length ? traerTodo<Movimiento>((a, b) => supabase.from('movimientos').select('cuenta_id,fecha,monto_bs,clase,categoria_id')
            .in('cuenta_id', tarjetas.map((t) => t.id)).gte('fecha', desde).range(a, b)) : Promise.resolve([] as Movimiento[]),
        ]);
        const h = new Map<string, ResumenMesTarjeta[]>();
        for (const t of tarjetas) {
          const meses = Array.from({ length: 6 }, (_, k) => sumarMeses(desde, k));
          h.set(t.id, meses.map((m) => {
            const ms = movs.filter((x) => x.cuenta_id === t.id && inicioMes(x.fecha) === m);
            const n = (x: Movimiento) => Number(x.monto_bs);
            return {
              mes: m,
              intereses: ms.filter((x) => x.clase === 'normal' && x.categoria_id === catInteres).reduce((a, x) => a - n(x), 0),
              consumos: ms.filter((x) => x.clase === 'normal' && x.categoria_id !== catInteres && n(x) < 0).reduce((a, x) => a - n(x), 0),
              pagos: ms.filter((x) => x.clase === 'traspaso' && n(x) > 0).reduce((a, x) => a + n(x), 0),
            };
          }));
        }
        setSaldos(s); setImps(i); setHist(h);
      } catch (e) { avisar((e as Error).message, 'error'); setSaldos(new Map()); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, cuentas.length, catInteres]);

  if (!saldos) return <Cargando />;
  const efectivo = cuentas.find((c) => c.tipo === 'efectivo');

  return (
    <>
      <Encabezado titulo="Tarjetas de crédito" subtitulo="Deuda, pago mínimo, vencimientos e intereses." />
      {tarjetas.length === 0 && (
        <Tarjeta><Vacio icono={<CreditCard className="h-8 w-8" />} titulo="No tiene tarjetas registradas"
          accion={<Link to="/configuracion"><Boton>Agregar tarjeta</Boton></Link>} /></Tarjeta>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {tarjetas.map((t) => {
          const deuda = Math.max(0, -(saldos.get(t.id) || 0));
          const linea = Number(t.linea_credito || 0);
          const imp = imps.get(t.id);
          const dias = imp?.fecha_vencimiento ? diasEntre(hoy(), imp.fecha_vencimiento) : null;
          const h = hist.get(t.id) || [];
          const interesesTotal = h.reduce((a, x) => a + x.intereses, 0);
          return (
            <Tarjeta key={t.id} titulo={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" />{t.nombre}</span>}
              accion={<Etiqueta color={t.modo === 'manual' ? 'gris' : 'azul'}>{t.modo === 'manual' ? 'Manual' : 'Se importa'}</Etiqueta>}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-tinta-suave">Deuda actual</div>
                  <div className="text-2xl font-bold tabular-nums">{ver(deuda)}</div>
                </div>
                {linea > 0 && <div className="text-right text-sm text-tinta-suave">Línea {ver(linea)}<br />Disponible <b className="text-tinta">{ver(Math.max(0, linea - deuda))}</b></div>}
              </div>
              {linea > 0 && <div className="mt-3"><Barra valor={deuda} maximo={linea} alto="h-2.5" /><div className="mt-1 text-xs text-tinta-suave">{Math.round((deuda / linea) * 100)} % de la línea usada</div></div>}

              {(imp?.pago_minimo || imp?.fecha_vencimiento || t.dia_pago) && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {imp?.pago_minimo != null && <div className="rounded-xl bg-papel px-3 py-2"><div className="text-[11px] text-tinta-suave">Pago mínimo</div><b className="tabular-nums">{ver(Number(imp.pago_minimo))}</b></div>}
                  <div className="rounded-xl bg-papel px-3 py-2">
                    <div className="text-[11px] text-tinta-suave">Vencimiento</div>
                    {imp?.fecha_vencimiento ? (
                      <b className={dias !== null && dias <= 3 ? 'text-red-600' : ''}>{fechaCorta(imp.fecha_vencimiento)}{dias !== null && dias >= 0 ? ` · en ${dias} días` : ''}</b>
                    ) : <b>{t.dia_pago ? `día ${t.dia_pago} de cada mes` : '—'}</b>}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs text-tinta-suave">
                  <span>Últimos 6 meses</span>
                  <span>Intereses y comisiones: <b className="text-red-700">{ver(interesesTotal)}</b></span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-tinta-tenue"><tr><th className="py-1 text-left font-medium">Mes</th><th className="text-right font-medium">Consumos</th><th className="text-right font-medium">Intereses</th><th className="text-right font-medium">Pagos</th></tr></thead>
                  <tbody className="divide-y divide-black/5 tabular-nums">
                    {h.map((x) => (
                      <tr key={x.mes}><td className="py-1 capitalize">{nombreMes(x.mes, true)}</td>
                        <td className="text-right">{x.consumos ? ver(x.consumos) : '—'}</td>
                        <td className="text-right text-red-700">{x.intereses ? ver(x.intereses) : '—'}</td>
                        <td className="text-right text-marca-700">{x.pagos ? ver(x.pagos) : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {t.modo === 'manual' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Boton variante="secundario" disabled={!activa} onClick={() => setForm({ tipo: 'gasto', cuenta: t.id })}><Plus className="h-4 w-4" />Consumo</Boton>
                  <Boton variante="secundario" disabled={!activa} onClick={() => setForm({ tipo: 'traspaso', cuenta: efectivo?.id, destino: t.id })}><Wallet className="h-4 w-4" />Pago</Boton>
                  <Boton variante="fantasma" disabled={!activa} onClick={() => setAjuste(t)}><Scale className="h-4 w-4" />Ajustar deuda</Boton>
                </div>
              )}
              {t.modo === 'manual' && (
                <p className="mt-2 text-xs text-tinta-tenue">Si pagó esta tarjeta desde su cuenta del banco, búsquelo en Movimientos y márquelo como traspaso hacia esta tarjeta.</p>
              )}
            </Tarjeta>
          );
        })}
      </div>

      <FormMovimiento abierto={!!form} cerrar={() => setForm(null)} tipoInicial={form?.tipo} cuentaInicial={form?.cuenta} destinoInicial={form?.destino} />
      <ModalAjuste cuenta={ajuste} deudaActual={ajuste ? Math.max(0, -(saldos.get(ajuste.id) || 0)) : 0} cerrar={() => setAjuste(null)}
        guardar={async (deuda) => {
          try {
            revisar(await supabase.rpc('ajustar_saldo', { p_cuenta: ajuste!.id, p_saldo_real: -deuda, p_fecha: hoy() }));
            avisar('Deuda ajustada.'); setAjuste(null); tocar();
          } catch (e) { avisar((e as Error).message, 'error'); }
        }} />
    </>
  );
}

function ModalAjuste({ cuenta, deudaActual, cerrar, guardar }: { cuenta: Cuenta | null; deudaActual: number; cerrar: () => void; guardar: (d: number) => Promise<void> }) {
  const [valor, setValor] = useState('');
  useEffect(() => { setValor(deudaActual ? deudaActual.toFixed(2) : ''); }, [cuenta, deudaActual]);
  if (!cuenta) return null;
  return (
    <Modal abierto titulo={`Ajustar deuda — ${cuenta.nombre}`} cerrar={cerrar}
      pie={<><Boton variante="secundario" onClick={cerrar}>Cancelar</Boton><Boton onClick={() => guardar(aNumero(valor) || 0)}>Guardar</Boton></>}>
      <Campo etiqueta="Deuda según el extracto del banco (Bs)" ayuda="El sistema registra la diferencia como «Ajuste de saldo»; no cuenta como gasto.">
        <Entrada inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
      </Campo>
    </Modal>
  );
}
