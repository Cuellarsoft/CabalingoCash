import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Check, Pencil, Search, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import { revisar, supabase, traerTodo } from '../lib/supabase';
import type { Movimiento } from '../lib/tipos';
import { dinero, fechaCorta, finMes, hoy, inicioMes, nombreMes, numero, sugerirTextoRegla } from '../lib/formato';
import { Boton, Campo, Cargando, cx, Encabezado, Entrada, Etiqueta, Modal, PuntoColor, Selector, SelectorMes, Tarjeta, Vacio } from '../components/ui';
import FormMovimiento from '../components/FormMovimiento';

interface Sugerencia { texto: string; categoria_id: string; mov: Movimiento }

export default function Movimientos() {
  const { cuentas, categorias, categoria, nombreCuenta, moneda, avisar, tocar, version } = useApp();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') || '';
  const [mes, setMes] = useState(params.get('mes') || inicioMes(hoy()));
  const [cuenta, setCuenta] = useState(params.get('cuenta') || '');
  const [cat, setCat] = useState(params.get('categoria') || '');
  const [q, setQ] = useState('');
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [sug, setSug] = useState<Sugerencia | null>(null);
  const [editar, setEditar] = useState<Movimiento | null>(null);
  const [traspaso, setTraspaso] = useState<Movimiento | null>(null);

  const soloPendientes = estado === 'por_revisar';

  const cargar = useCallback(async () => {
    try {
      if (soloPendientes) {
        const filas = await traerTodo<Movimiento>((a, b) => supabase.from('movimientos').select('*').eq('estado', 'por_revisar')
          .order('fecha', { ascending: false }).range(a, b));
        setMovs(filas.map((m) => ({ ...m, monto_bs: Number(m.monto_bs) })));
      } else {
        setMovs(await D.movimientos(mes, finMes(mes)));
      }
    } catch (e) { avisar((e as Error).message, 'error'); setMovs([]); }
  }, [mes, soloPendientes, avisar]);

  useEffect(() => { cargar(); }, [cargar, version]);

  const lista = useMemo(() => {
    if (!movs) return [];
    const t = q.trim().toUpperCase();
    return movs.filter((m) => (!cuenta || m.cuenta_id === cuenta)
      && (cat === 'eliminados' ? m.clase === 'excluido' : m.clase !== 'excluido')
      && (!cat || cat === 'eliminados' || (cat === 'sin' ? !m.categoria_id && m.clase === 'normal' : cat === 'traspaso' ? m.clase === 'traspaso' : m.categoria_id === cat))
      && (!t || m.descripcion.toUpperCase().includes(t) || (m.nota || '').toUpperCase().includes(t)));
  }, [movs, q, cuenta, cat]);

  const tot = useMemo(() => {
    let ing = 0, gas = 0;
    for (const m of lista) {
      if (m.clase !== 'normal') continue;
      const val = moneda === 'USD' ? (m.tc_usd ? m.monto_bs / m.tc_usd : 0) : m.monto_bs;
      if (val > 0) ing += val; else gas -= val;
    }
    return { ing, gas };
  }, [lista, moneda]);

  const montoVis = (m: Movimiento) => moneda === 'USD' ? (m.tc_usd ? m.monto_bs / m.tc_usd : NaN) : m.monto_bs;

  async function cambiarCategoria(m: Movimiento, categoria_id: string) {
    try {
      if (categoria_id === '__traspaso') { setTraspaso(m); return; }
      revisar(await supabase.from('movimientos').update({ categoria_id: categoria_id || null, estado: categoria_id ? 'confirmado' : 'por_revisar' }).eq('id', m.id));
      setMovs((ms) => (ms || []).map((x): Movimiento => x.id === m.id ? { ...x, categoria_id: categoria_id || null, estado: categoria_id ? 'confirmado' : 'por_revisar' } : x)
        .filter((x) => !soloPendientes || x.id !== m.id || !categoria_id));
      if (categoria_id && m.importacion_id) setSug({ texto: sugerirTextoRegla(m.descripcion), categoria_id, mov: m });
      tocar();
    } catch (e) { avisar((e as Error).message, 'error'); }
  }

  async function crearRegla(texto: string, datos: { categoria_id?: string; es_traspaso?: boolean; cuenta_destino_id?: string | null }) {
    if (texto.trim().length < 3) return avisar('El texto de la regla debe tener al menos 3 letras.', 'error');
    try {
      revisar(await supabase.from('reglas').insert({ texto: texto.trim(), categoria_id: datos.categoria_id || null,
        es_traspaso: !!datos.es_traspaso, cuenta_destino_id: datos.cuenta_destino_id || null }));
      const r = revisar(await supabase.rpc('procesar_pendientes')) as { reglas: number; traspasos: number };
      avisar(`Regla guardada. ${r.reglas + r.traspasos} movimiento(s) más se clasificaron solos.`);
      setSug(null);
      tocar();
    } catch (e) { avisar((e as Error).message, 'error'); }
  }

  async function quitarTraspaso(m: Movimiento) {
    try { revisar(await supabase.rpc('quitar_traspaso', { p_mov: m.id })); avisar('Ya no es traspaso; clasifíquelo.'); tocar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }

  async function eliminar(m: Movimiento) {
    if (!window.confirm(m.importacion_id
      ? '¿Eliminar este movimiento? Dejará de contar en gastos y reportes (podrá restaurarlo desde el filtro «Eliminados»).'
      : '¿Eliminar este movimiento?')) return;
    try {
      const r = await D.eliminarMovimiento(m);
      avisar(r === 'borrado' ? 'Movimiento eliminado.' : 'Movimiento eliminado. Puede restaurarlo con el filtro «Eliminados».');
      tocar();
    } catch (e) { avisar((e as Error).message, 'error'); }
  }

  async function restaurar(m: Movimiento) {
    try { await D.restaurarMovimiento(m); avisar('Movimiento restaurado: clasifíquelo de nuevo.'); tocar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }

  const gastos = categorias.filter((c) => c.activa && c.tipo === 'gasto');
  const ingresosC = categorias.filter((c) => c.activa && c.tipo === 'ingreso');

  const selectorCategoria = (m: Movimiento) => {
    if (m.clase === 'traspaso') return <Etiqueta color="azul"><ArrowLeftRight className="h-3 w-3" />Traspaso{m.traspaso_par_id ? ` · ${nombreCuenta(movs?.find((x) => x.id === m.traspaso_par_id)?.cuenta_id) !== '—' ? nombreCuenta(movs?.find((x) => x.id === m.traspaso_par_id)?.cuenta_id) : 'cuenta propia'}` : ' externo'}</Etiqueta>;
    if (m.clase === 'ajuste') return <Etiqueta>Ajuste de saldo</Etiqueta>;
    if (m.clase === 'excluido') return <Etiqueta color="rojo">Eliminado</Etiqueta>;
    const c = categoria(m.categoria_id);
    return (
      <div className="flex items-center gap-1.5">
        {c && <PuntoColor color={c.color} />}
        <select value={m.categoria_id || ''} onChange={(e) => cambiarCategoria(m, e.target.value)}
          className={cx('max-w-[11rem] rounded-lg border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-marca-500',
            m.categoria_id ? 'border-transparent hover:border-black/10' : 'border-amber-300 bg-amber-50 text-amber-900')}>
          <option value="">— Elegir categoría —</option>
          <optgroup label="Gastos">{gastos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</optgroup>
          <optgroup label="Ingresos">{ingresosC.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</optgroup>
          <option value="__traspaso">↔ Es un traspaso entre mis cuentas…</option>
        </select>
      </div>
    );
  };

  const acciones = (m: Movimiento) => m.clase === 'excluido' ? (
    <div className="flex items-center justify-end">
      <button title="Restaurar" onClick={() => restaurar(m)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-marca-700 hover:bg-marca-50"><Undo2 className="h-4 w-4" />Restaurar</button>
    </div>
  ) : (
    <div className="flex items-center justify-end gap-0.5">
      <button title="Editar" onClick={() => setEditar(m)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5 hover:text-tinta"><Pencil className="h-4 w-4" /></button>
      {m.clase === 'traspaso'
        ? <button title="Quitar traspaso" onClick={() => quitarTraspaso(m)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5 hover:text-tinta"><Undo2 className="h-4 w-4" /></button>
        : <button title="Marcar como traspaso" onClick={() => setTraspaso(m)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5 hover:text-tinta"><ArrowLeftRight className="h-4 w-4" /></button>}
      <button title="Eliminar" onClick={() => eliminar(m)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
    </div>
  );

  return (
    <>
      <Encabezado titulo={soloPendientes ? 'Por revisar' : 'Movimientos'}
        subtitulo={soloPendientes ? 'Elija la categoría de cada movimiento. El sistema le ofrecerá recordarlo para la próxima vez.' : undefined}>
        {!soloPendientes && <SelectorMes mes={mes} cambiar={(m) => { setMes(m); params.set('mes', m); setParams(params, { replace: true }); }} nombre={nombreMes(mes)} />}
        <Boton variante={soloPendientes ? 'primario' : 'secundario'} onClick={() => { if (soloPendientes) params.delete('estado'); else params.set('estado', 'por_revisar'); setParams(params); }}>
          {soloPendientes ? 'Ver todos' : 'Solo por revisar'}
        </Boton>
      </Encabezado>

      {sug && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-marca-200 bg-marca-50 p-3 text-sm">
          <Sparkles className="h-4 w-4 text-marca-700" />
          <span>¿Recordar? Siempre que la descripción contenga</span>
          <Entrada value={sug.texto} onChange={(e) => setSug({ ...sug, texto: e.target.value })} className="w-48 py-1" />
          <span>→ <b>{categoria(sug.categoria_id)?.nombre}</b></span>
          <Boton className="py-1" onClick={() => crearRegla(sug.texto, { categoria_id: sug.categoria_id })}><Check className="h-4 w-4" />Crear regla</Boton>
          <Boton variante="fantasma" className="py-1" onClick={() => setSug(null)}>No</Boton>
        </div>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-tinta-tenue" />
          <Entrada value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la descripción…" className="pl-9" />
        </div>
        <Selector value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selector>
        <Selector value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          <option value="sin">Sin categoría</option>
          <option value="traspaso">Traspasos</option>
          <option value="eliminados">Eliminados</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selector>
      </div>

      {!movs ? <Cargando /> : lista.length === 0 ? (
        <Tarjeta><Vacio titulo={soloPendientes ? '¡Todo clasificado!' : 'No hay movimientos'} texto={soloPendientes ? 'No quedan movimientos por revisar.' : 'Pruebe con otro mes o filtro.'} /></Tarjeta>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 px-1 text-sm text-tinta-suave">
            <span>{lista.length} movimientos</span>
            <span>Ingresos <b className="text-marca-700 tabular-nums">{dinero(tot.ing, moneda)}</b></span>
            <span>Gastos <b className="text-tinta tabular-nums">{dinero(tot.gas, moneda)}</b></span>
            <span className="text-tinta-tenue">(sin traspasos)</span>
          </div>

          {/* Tabla (computadora) */}
          <div className="hidden overflow-hidden rounded-2xl border border-black/5 bg-white shadow-tarjeta md:block">
            <table className="w-full text-sm">
              <thead className="bg-papel text-left text-xs text-tinta-suave">
                <tr><th className="px-4 py-2.5 font-medium">Fecha</th><th className="px-2 py-2.5 font-medium">Descripción</th>
                  <th className="px-2 py-2.5 font-medium">Categoría</th><th className="px-2 py-2.5 text-right font-medium">Monto</th><th className="w-28"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {lista.map((m) => (
                  <tr key={m.id} className={cx('align-top', m.estado === 'por_revisar' && m.clase === 'normal' && 'bg-amber-50/40')}>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-tinta-suave">{fechaCorta(m.fecha)}</td>
                    <td className="px-2 py-2.5">
                      <div className="line-clamp-2 max-w-md break-words">{m.descripcion}</div>
                      <div className="mt-0.5 text-xs text-tinta-tenue">{nombreCuenta(m.cuenta_id)}{m.nota ? ` · ${m.nota}` : ''}
                        {m.moneda_original !== 'BOB' && m.monto_original ? ` · ${m.moneda_original} ${numero(Math.abs(m.monto_original))}` : ''}</div>
                    </td>
                    <td className="px-2 py-2">{selectorCategoria(m)}</td>
                    <td className={cx('whitespace-nowrap px-2 py-2.5 text-right font-medium tabular-nums', m.monto_bs > 0 ? 'text-marca-700' : 'text-tinta', m.clase !== 'normal' && 'text-tinta-tenue')}>
                      {dinero(montoVis(m), moneda, { signo: true })}
                    </td>
                    <td className="px-2 py-1.5">{acciones(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (celular) */}
          <ul className="space-y-2 md:hidden">
            {lista.map((m) => (
              <li key={m.id} className={cx('rounded-2xl border bg-white p-3 shadow-tarjeta', m.estado === 'por_revisar' && m.clase === 'normal' ? 'border-amber-200' : 'border-black/5')}>
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-sm">{m.descripcion}</div>
                    <div className="mt-0.5 text-xs text-tinta-tenue">{fechaCorta(m.fecha)} · {nombreCuenta(m.cuenta_id)}</div>
                  </div>
                  <div className={cx('shrink-0 text-right font-semibold tabular-nums', m.monto_bs > 0 ? 'text-marca-700' : '', m.clase !== 'normal' && 'text-tinta-tenue')}>
                    {dinero(montoVis(m), moneda, { signo: true })}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">{selectorCategoria(m)}{acciones(m)}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <FormMovimiento abierto={!!editar} editar={editar} cerrar={() => setEditar(null)} alGuardar={cargar} />
      <ModalTraspaso mov={traspaso} cerrar={() => setTraspaso(null)} alGuardar={() => { setTraspaso(null); tocar(); }} crearRegla={crearRegla} />
    </>
  );
}

function ModalTraspaso({ mov, cerrar, alGuardar, crearRegla }: {
  mov: Movimiento | null; cerrar: () => void; alGuardar: () => void;
  crearRegla: (t: string, d: { es_traspaso: boolean; cuenta_destino_id: string | null }) => Promise<void>;
}) {
  const { cuentas, avisar, ver } = useApp();
  const [destino, setDestino] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (mov) { setDestino(''); setRecordar(false); setTexto(sugerirTextoRegla(mov.descripcion)); } }, [mov]);
  if (!mov) return null;
  const otras = cuentas.filter((c) => c.id !== mov.cuenta_id && c.activa);

  async function guardar() {
    setGuardando(true);
    try {
      revisar(await supabase.rpc('marcar_traspaso', { p_mov: mov!.id, p_destino: destino || null }));
      if (recordar) await crearRegla(texto, { es_traspaso: true, cuenta_destino_id: destino || null });
      else avisar('Marcado como traspaso.');
      alGuardar();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setGuardando(false);
  }

  return (
    <Modal abierto titulo="Traspaso entre mis cuentas" cerrar={cerrar}
      pie={<><Boton variante="secundario" onClick={cerrar}>Cancelar</Boton><Boton onClick={guardar} cargando={guardando}>Guardar</Boton></>}>
      <div className="space-y-4 text-sm">
        <p className="rounded-xl bg-papel p-3"><b className="tabular-nums">{ver(mov.monto_bs, mov.tc_usd, { signo: true })}</b> · {mov.descripcion}</p>
        <p className="text-tinta-suave">Un traspaso no cuenta como gasto ni como ingreso. Ej.: pago de tarjeta, retiro de cajero, envío a otra cuenta suya.</p>
        <Campo etiqueta={mov.monto_bs < 0 ? '¿A qué cuenta fue el dinero?' : '¿De qué cuenta vino el dinero?'}
          ayuda="Si es Efectivo o una tarjeta manual, el sistema registrará la otra mitad del traspaso.">
          <Selector value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Otra cuenta mía que no está en el sistema</option>
            {otras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="mt-1" />
          <span>Recordar: tratar como traspaso todo movimiento que contenga
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!recordar} className="mt-1.5 py-1" /></span>
        </label>
      </div>
    </Modal>
  );
}
