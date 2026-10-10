import { useEffect, useState } from 'react';
import { Bell, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/App';
import * as D from '../lib/datos';
import { revisar, supabase } from '../lib/supabase';
import type { Recurrente } from '../lib/tipos';
import { diasEntre, fechaCorta, hoy } from '../lib/formato';
import { aNumero } from '../lib/importadores';
import { Boton, Campo, Cargando, Encabezado, Entrada, Etiqueta, Modal, Selector, Tarjeta, Vacio } from '../components/ui';

const FRECUENCIAS = [
  { id: 'mensual', n: 'Mensual' }, { id: 'bimestral', n: 'Cada 2 meses' }, { id: 'trimestral', n: 'Cada 3 meses' },
  { id: 'semestral', n: 'Cada 6 meses' }, { id: 'anual', n: 'Anual' },
] as const;

export default function Recurrentes() {
  const { ver, avisar, tocar, version, categoria, activa } = useApp();
  const [lista, setLista] = useState<Recurrente[] | null>(null);
  const [editar, setEditar] = useState<Partial<Recurrente> | null>(null);

  useEffect(() => { D.recurrentes().then(setLista).catch((e) => { avisar(e.message, 'error'); setLista([]); }); }, [version, avisar]);

  async function pagado(r: Recurrente) {
    try { revisar(await supabase.rpc('marcar_recurrente_pagado', { p_id: r.id })); avisar(`${r.nombre}: marcado como pagado.`); tocar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }
  async function eliminar(r: Recurrente) {
    if (!window.confirm(`¿Eliminar "${r.nombre}"?`)) return;
    try { revisar(await supabase.from('recurrentes').delete().eq('id', r.id)); tocar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }

  if (!lista) return <Cargando />;
  const orden = [...lista].sort((a, b) => Number(b.activo) - Number(a.activo) || a.proxima_fecha.localeCompare(b.proxima_fecha));
  const totalMes = lista.filter((r) => r.activo && r.frecuencia === 'mensual').reduce((a, r) => a + Number(r.monto_estimado || 0), 0);

  return (
    <>
      <Encabezado titulo="Pagos recurrentes" subtitulo="Colegio, servicios, seguros… El sistema le avisa antes de que venzan.">
        <Boton disabled={!activa} onClick={() => setEditar({ frecuencia: 'mensual', dias_aviso: 5, proxima_fecha: hoy(), activo: true })}><Plus className="h-4 w-4" />Nuevo</Boton>
      </Encabezado>
      {lista.length === 0 ? (
        <Tarjeta><Vacio icono={<Bell className="h-8 w-8" />} titulo="Sin pagos recurrentes"
          texto="Registre sus pagos fijos. Si escribe el texto con el que aparecen en el extracto (por ejemplo ARCO IRIS), se marcarán como pagados solos al importar." /></Tarjeta>
      ) : (
        <>
          <p className="mb-3 text-sm text-tinta-suave">Pagos mensuales fijos: <b className="text-tinta">{ver(totalMes)}</b></p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {orden.map((r) => {
              const est = D.estadoRecurrente(r);
              const dias = diasEntre(hoy(), r.proxima_fecha);
              return (
                <li key={r.id} className={'rounded-2xl border bg-white p-4 shadow-tarjeta ' + (!r.activo ? 'opacity-60' : est === 'vencido' ? 'border-red-200' : est === 'pronto' ? 'border-amber-200' : 'border-black/5')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{r.nombre}</div>
                      <div className="mt-0.5 text-xs text-tinta-suave">
                        {FRECUENCIAS.find((f) => f.id === r.frecuencia)?.n}{r.categoria_id ? ` · ${categoria(r.categoria_id)?.nombre}` : ''}
                        {r.texto_reconocer ? ` · reconoce «${r.texto_reconocer}»` : ''}
                      </div>
                    </div>
                    <div className="text-right font-semibold tabular-nums">{r.monto_estimado ? ver(Number(r.monto_estimado)) : ''}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {r.activo ? (
                      <Etiqueta color={est === 'vencido' ? 'rojo' : est === 'pronto' ? 'ambar' : 'verde'}>
                        {est === 'vencido' ? `Venció el ${fechaCorta(r.proxima_fecha)}` : dias === 0 ? 'Vence hoy' : `Vence ${fechaCorta(r.proxima_fecha)} · en ${dias} días`}
                      </Etiqueta>
                    ) : <Etiqueta>Pausado</Etiqueta>}
                    <div className="flex gap-0.5">
                      {r.activo && <button title="Marcar pagado" disabled={!activa} onClick={() => pagado(r)} className="rounded-lg p-1.5 text-marca-700 hover:bg-marca-50"><Check className="h-4 w-4" /></button>}
                      <button title="Editar" onClick={() => setEditar(r)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5"><Pencil className="h-4 w-4" /></button>
                      <button title="Eliminar" onClick={() => eliminar(r)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {r.ultimo_pago && <div className="mt-2 text-xs text-tinta-tenue">Último pago: {fechaCorta(r.ultimo_pago)}</div>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <FormRecurrente valor={editar} cerrar={() => setEditar(null)} />
    </>
  );
}

function FormRecurrente({ valor, cerrar }: { valor: Partial<Recurrente> | null; cerrar: () => void }) {
  const { categorias, cuentas, avisar, tocar } = useApp();
  const [f, setF] = useState<Partial<Recurrente>>({});
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (valor) { setF(valor); setMonto(valor.monto_estimado ? String(valor.monto_estimado) : ''); } }, [valor]);
  if (!valor) return null;

  async function guardar() {
    if (!f.nombre?.trim()) return avisar('Escriba un nombre.', 'error');
    if (!f.proxima_fecha) return avisar('Elija la próxima fecha de pago.', 'error');
    setGuardando(true);
    const fila = {
      nombre: f.nombre.trim(), monto_estimado: aNumero(monto), frecuencia: f.frecuencia || 'mensual', proxima_fecha: f.proxima_fecha,
      dias_aviso: Number(f.dias_aviso ?? 5), texto_reconocer: f.texto_reconocer?.trim() || null,
      categoria_id: f.categoria_id || null, cuenta_id: f.cuenta_id || null, activo: f.activo ?? true,
    };
    try {
      if (f.id) revisar(await supabase.from('recurrentes').update(fila).eq('id', f.id));
      else revisar(await supabase.from('recurrentes').insert(fila));
      if (fila.texto_reconocer) await supabase.rpc('procesar_pendientes');
      avisar('Guardado.'); tocar(); cerrar();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setGuardando(false);
  }

  return (
    <Modal abierto titulo={f.id ? 'Editar pago recurrente' : 'Nuevo pago recurrente'} cerrar={cerrar}
      pie={<><Boton variante="secundario" onClick={cerrar}>Cancelar</Boton><Boton onClick={guardar} cargando={guardando}>Guardar</Boton></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Jardín Arco Iris" autoFocus /></Campo>
        <Campo etiqueta="Monto estimado (Bs)"><Entrada inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Campo etiqueta="Frecuencia">
          <Selector value={f.frecuencia || 'mensual'} onChange={(e) => setF({ ...f, frecuencia: e.target.value as Recurrente['frecuencia'] })}>
            {FRECUENCIAS.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Próxima fecha de pago"><Entrada type="date" value={f.proxima_fecha || ''} onChange={(e) => setF({ ...f, proxima_fecha: e.target.value })} /></Campo>
        <Campo etiqueta="Avisar días antes"><Entrada type="number" min={0} max={60} value={f.dias_aviso ?? 5} onChange={(e) => setF({ ...f, dias_aviso: Number(e.target.value) })} /></Campo>
        <Campo etiqueta="Texto en el extracto (opcional)" className="sm:col-span-2" ayuda="Si aparece este texto en un movimiento cercano a la fecha, se marca como pagado solo. Ej.: ARCO IRIS">
          <Entrada value={f.texto_reconocer || ''} onChange={(e) => setF({ ...f, texto_reconocer: e.target.value })} />
        </Campo>
        <Campo etiqueta="Categoría">
          <Selector value={f.categoria_id || ''} onChange={(e) => setF({ ...f, categoria_id: e.target.value || null })}>
            <option value="">—</option>
            {categorias.filter((c) => c.tipo === 'gasto').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Se paga con">
          <Selector value={f.cuenta_id || ''} onChange={(e) => setF({ ...f, cuenta_id: e.target.value || null })}>
            <option value="">—</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.activo ?? true} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo
        </label>
      </div>
    </Modal>
  );
}
