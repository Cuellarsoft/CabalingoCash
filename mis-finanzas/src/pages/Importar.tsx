import { DragEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useApp } from '../context/App';
import { leerExcel } from '../lib/excel';
import { detectarFormato, FORMATOS, leerExtracto, ResultadoLectura } from '../lib/importadores';
import { revisar, supabase } from '../lib/supabase';
import type { Importacion } from '../lib/tipos';
import { dinero, fechaCorta, numero } from '../lib/formato';
import { Boton, Campo, Cargando, cx, Encabezado, Etiqueta, Modal, Selector, Tarjeta, Vacio } from '../components/ui';
import type { Cuenta } from '../lib/tipos';

interface Resultado {
  filas: number; nuevos: number; duplicados: number; clasificados: number; pendientes: number;
  saldo_banco: number | null; saldo_sistema: number | null;
}

export default function Importar() {
  const { cuentas, avisar, tocar, activa, nombreCuenta } = useApp();
  const importables = cuentas.filter((c) => c.modo === 'importacion' && c.formato && c.activa);
  const [cuentaId, setCuentaId] = useState('');
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historial, setHistorial] = useState<Importacion[] | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [borrar, setBorrar] = useState<Importacion | null>(null);
  const [borrando, setBorrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!cuentaId && importables[0]) setCuentaId(importables[0].id); }, [importables, cuentaId]);
  const cargarHistorial = () => supabase.from('importaciones').select('*').order('creado_en', { ascending: false }).limit(500)
    .then((r) => setHistorial((r.data as Importacion[]) || []));
  useEffect(() => { cargarHistorial(); }, []);

  const cuenta = cuentas.find((c) => c.id === cuentaId);

  async function elegirArchivo(f: File | undefined) {
    if (!f || !cuenta?.formato) return;
    setError(''); setAviso(''); setLectura(null); setResultado(null); setLeyendo(true);
    try {
      const tabla = await leerExcel(f);
      // El número de cuenta o tarjeta que dice el extracto decide en qué cuenta se carga
      let destino: Cuenta = cuenta;
      const cab = tabla.slice(0, 15).flat().map((c) => String(c ?? '')).join(' ');
      const m = cab.match(/NRO\.?\s*(?:DE\s*)?(?:CUENTA|TARJETA)\s*:?\s*([0-9X][0-9X\-]{3,})/i);
      if (m) {
        const num = m[1].replace(/[^0-9]/g, '');
        const coincide = (c: Cuenta) => !!c.numero && c.numero.length >= 4 && num.endsWith(c.numero.replace(/[^0-9]/g, ''));
        if (!coincide(cuenta)) {
          const otra = importables.find(coincide);
          if (!otra) {
            setError(`Este extracto es de la cuenta ${m[1]}, que no está registrada. Créela en Configuración → Cuentas (con ese número) o elija otro archivo.`);
            return;
          }
          destino = otra;
          setCuentaId(otra.id);
          setAviso(`El extracto es de la cuenta ${m[1]}: se cargará en «${otra.nombre}» y no en «${cuenta.nombre}».`);
        }
      } else {
        const det = detectarFormato(tabla);
        if (det && det !== cuenta.formato) {
          const otra = importables.find((c) => c.formato === det);
          setAviso(`Este archivo parece de ${FORMATOS.find((x) => x.id === det)?.nombre}. ${otra ? `¿Quiso elegir "${otra.nombre}"?` : ''}`);
        }
      }
      const l = leerExtracto(destino.formato || cuenta.formato, tabla, f.name);
      setLectura(l);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
      if (input.current) input.current.value = '';
    }
  }

  async function importar() {
    if (!lectura || !cuenta) return;
    setSubiendo(true);
    try {
      const r = revisar(await supabase.rpc('importar_extracto', { p_cuenta: cuenta.id, p_info: lectura.info, p_filas: lectura.filas })) as Resultado;
      setResultado(r); setLectura(null);
      avisar(`${r.nuevos} movimientos importados.`);
      tocar(); cargarHistorial();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setSubiendo(false);
  }

  async function eliminarPlanilla() {
    if (!borrar) return;
    setBorrando(true);
    try {
      const r = revisar(await supabase.rpc('eliminar_importacion', { p_imp: borrar.id })) as { movimientos: number };
      avisar(`Planilla borrada: ${r.movimientos} movimientos eliminados.`);
      setBorrar(null); setResultado(null);
      tocar(); cargarHistorial();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setBorrando(false);
  }

  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastrando(false); elegirArchivo(e.dataTransfer.files?.[0]); };

  if (importables.length === 0) {
    return (
      <>
        <Encabezado titulo="Importar extracto" />
        <Tarjeta><Vacio icono={<FileSpreadsheet className="h-8 w-8" />} titulo="No hay cuentas con importación"
          texto="En Configuración → Cuentas, cree una cuenta en modo «Importación» y elija el formato de su banco."
          accion={<Link to="/configuracion"><Boton>Ir a Configuración</Boton></Link>} /></Tarjeta>
      </>
    );
  }

  const deb = lectura?.filas.filter((f) => f.monto_bs < 0).reduce((a, f) => a - f.monto_bs, 0) || 0;
  const cred = lectura?.filas.filter((f) => f.monto_bs > 0).reduce((a, f) => a + f.monto_bs, 0) || 0;
  const cuadra = resultado && resultado.saldo_banco !== null && resultado.saldo_sistema !== null
    ? Math.abs(Number(resultado.saldo_banco) - Number(resultado.saldo_sistema)) < 0.01 : null;

  return (
    <>
      <Encabezado titulo="Importar extracto" subtitulo="Cargue el Excel que descarga de la banca por internet." />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Tarjeta>
            <div className="space-y-4">
              <Campo etiqueta="1. ¿De qué cuenta o tarjeta es el extracto?">
                <Selector value={cuentaId} onChange={(e) => { setCuentaId(e.target.value); setLectura(null); setResultado(null); }}>
                  {importables.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Selector>
              </Campo>
              <div>
                <span className="mb-1 block text-xs font-medium text-tinta-suave">2. Elija o arrastre el archivo Excel</span>
                <button type="button" disabled={!activa} onClick={() => input.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
                  className={cx('flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-sm transition',
                    arrastrando ? 'border-marca-500 bg-marca-50' : 'border-black/10 hover:border-marca-300 hover:bg-papel')}>
                  <Upload className="h-7 w-7 text-marca-600" />
                  <span className="font-medium">{leyendo ? 'Leyendo…' : 'Toque para elegir el archivo'}</span>
                  <span className="text-xs text-tinta-tenue">.xlsx o .xls · {FORMATOS.find((f) => f.id === cuenta?.formato)?.nombre}</span>
                </button>
                <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => elegirArchivo(e.target.files?.[0])} />
              </div>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {aviso && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{aviso}</p>}
            </div>
          </Tarjeta>

          {lectura && (
            <Tarjeta titulo="3. Revise y confirme">
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Dato e="Período" v={`${fechaCorta(lectura.info.desde)} – ${fechaCorta(lectura.info.hasta)}`} />
                <Dato e="Movimientos" v={String(lectura.filas.length)} />
                <Dato e="Salidas" v={dinero(deb)} />
                <Dato e="Entradas" v={dinero(cred)} />
                {lectura.info.saldo_final !== null && cuenta?.tipo === 'banco' && <Dato e="Saldo final del banco" v={dinero(lectura.info.saldo_final)} />}
                {lectura.info.total_adeudado !== null && <Dato e="Total adeudado" v={dinero(lectura.info.total_adeudado)} />}
                {lectura.info.pago_minimo !== null && <Dato e="Pago mínimo" v={dinero(lectura.info.pago_minimo)} />}
                {lectura.info.fecha_vencimiento && <Dato e="Vence" v={fechaCorta(lectura.info.fecha_vencimiento)} />}
              </div>
              {lectura.avisos.map((a) => <p key={a} className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{a}</p>)}
              <div className="max-h-80 overflow-auto rounded-xl border border-black/5">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-black/5">
                    {lectura.filas.map((f) => (
                      <tr key={f.huella}>
                        <td className="whitespace-nowrap px-3 py-1.5 text-tinta-suave">{fechaCorta(f.fecha)}</td>
                        <td className="px-2 py-1.5">{f.descripcion}</td>
                        <td className={cx('whitespace-nowrap px-3 py-1.5 text-right tabular-nums', f.monto_bs > 0 && 'text-marca-700')}>
                          {f.monto_bs ? dinero(f.monto_bs, 'BOB', { signo: true }) : dinero(f.monto_usd, 'USD', { signo: true })}
                          {f.moneda !== 'BOB' && f.monto_original ? <span className="ml-1 text-tinta-tenue">({f.moneda} {numero(Math.abs(f.monto_original))})</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Boton variante="secundario" onClick={() => setLectura(null)}>Cancelar</Boton>
                <Boton onClick={importar} cargando={subiendo} disabled={!lectura.filas.length}>Importar {lectura.filas.length} movimientos</Boton>
              </div>
              <p className="mt-2 text-right text-xs text-tinta-tenue">Los movimientos que ya estén cargados se omiten solos.</p>
            </Tarjeta>
          )}

          {resultado && (
            <Tarjeta>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-marca-600" />
                <div className="flex-1">
                  <p className="font-semibold">Importación terminada</p>
                  <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Dato e="Nuevos" v={String(resultado.nuevos)} />
                    <Dato e="Ya existían" v={String(resultado.duplicados)} />
                    <Dato e="Clasificados solos" v={String(resultado.clasificados)} />
                    <Dato e="Por revisar" v={String(resultado.pendientes)} />
                  </ul>
                  {cuadra !== null && (
                    <p className={cx('mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm', cuadra ? 'bg-marca-50 text-marca-800' : 'bg-amber-50 text-amber-800')}>
                      {cuadra ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {cuadra ? `El saldo cuadra con el banco (${dinero(Number(resultado.saldo_banco))}).`
                        : `Diferencia de saldo: banco ${dinero(Number(resultado.saldo_banco))} · sistema ${dinero(Number(resultado.saldo_sistema))}. Puede faltar un extracto anterior.`}
                    </p>
                  )}
                  {resultado.pendientes > 0 && (
                    <Link to="/movimientos?estado=por_revisar"><Boton className="mt-3">Revisar {resultado.pendientes} pendientes</Boton></Link>
                  )}
                </div>
              </div>
            </Tarjeta>
          )}
        </div>

        <Tarjeta titulo={`Planillas cargadas${historial?.length ? ` (${historial.length})` : ''}`}>
          {!historial ? <Cargando /> : historial.length === 0 ? <p className="text-sm text-tinta-suave">Todavía no cargó planillas.</p> : (
            <ul className="max-h-[36rem] space-y-3 overflow-y-auto pr-1 text-sm">
              {historial.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-2 border-b border-black/5 pb-3 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium">{nombreCuenta(h.cuenta_id)}</div>
                    <div className="truncate text-xs text-tinta-suave" title={h.archivo || ''}>{h.archivo || 'Sin nombre'}</div>
                    <div className="text-xs text-tinta-suave">Período {fechaCorta(h.desde)} – {fechaCorta(h.hasta)} · cargada el {fechaCorta(h.creado_en)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Etiqueta color={h.nuevos > 0 ? 'verde' : 'gris'}>{h.nuevos} movimientos</Etiqueta>
                      {h.duplicados > 0 && <Etiqueta>{h.duplicados} ya existían</Etiqueta>}
                    </div>
                  </div>
                  <button title="Borrar esta planilla" aria-label="Borrar esta planilla" disabled={!activa} onClick={() => setBorrar(h)}
                    className="shrink-0 rounded-lg p-1.5 text-tinta-tenue hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <Modal abierto={!!borrar} cerrar={() => setBorrar(null)} titulo="Borrar planilla"
        pie={<><Boton variante="secundario" onClick={() => setBorrar(null)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={eliminarPlanilla} cargando={borrando}>Borrar planilla</Boton></>}>
        {borrar && (
          <div className="space-y-3 text-sm">
            <p><b>{nombreCuenta(borrar.cuenta_id)}</b> · {borrar.archivo || 'Sin nombre'}<br />
              <span className="text-tinta-suave">Período {fechaCorta(borrar.desde)} – {fechaCorta(borrar.hasta)}</span></p>
            <p>Se borrarán los <b>{borrar.nuevos} movimientos</b> que agregó esta planilla, con las categorías que les haya puesto.
              Los movimientos que ya existían por otra planilla no se tocan.</p>
            <p className="rounded-xl bg-red-50 px-3 py-2 text-red-800">Esto no se puede deshacer. Si se equivocó, puede volver a cargar el Excel.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

function Dato({ e, v }: { e: string; v: string }) {
  return (
    <div className="rounded-xl bg-papel px-3 py-2">
      <div className="text-[11px] text-tinta-suave">{e}</div>
      <div className="font-semibold tabular-nums">{v}</div>
    </div>
  );
}
