import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useApp } from '../context/App';
import { revisar, supabase } from '../lib/supabase';
import type { Categoria, Cuenta, Regla, TipoCambio } from '../lib/tipos';
import { fechaCorta, hoy, numero } from '../lib/formato';
import { aFecha, aNumero, FORMATOS } from '../lib/importadores';
import { leerExcel } from '../lib/excel';
import { Boton, Campo, Cargando, Encabezado, Entrada, Etiqueta, Modal, Pestanas, PuntoColor, Selector, Tarjeta } from '../components/ui';

type Tab = 'cuentas' | 'categorias' | 'reglas' | 'cambio' | 'perfil';

export default function Configuracion() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'cuentas';
  return (
    <>
      <Encabezado titulo="Configuración" />
      <div className="mb-5 overflow-x-auto">
        <Pestanas valor={tab} cambiar={(t) => setParams({ tab: t })} opciones={[
          { id: 'cuentas', nombre: 'Cuentas' }, { id: 'categorias', nombre: 'Categorías' }, { id: 'reglas', nombre: 'Reglas' },
          { id: 'cambio', nombre: 'Tipo de cambio' }, { id: 'perfil', nombre: 'Mi cuenta' }]} />
      </div>
      {tab === 'cuentas' && <Cuentas />}
      {tab === 'categorias' && <Categorias />}
      {tab === 'reglas' && <Reglas />}
      {tab === 'cambio' && <Cambio />}
      {tab === 'perfil' && <Perfil />}
    </>
  );
}

// ------------------------------------------------------------- Cuentas
function Cuentas() {
  const { cuentas, recargar, avisar, activa } = useApp();
  const [ed, setEd] = useState<Partial<Cuenta> | null>(null);
  const [saldoTxt, setSaldoTxt] = useState('');
  const [lineaTxt, setLineaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = (c: Partial<Cuenta>) => {
    setEd(c);
    const s = Number(c.saldo_inicial || 0);
    setSaldoTxt(s ? String(c.tipo === 'tarjeta' ? -s : s) : '');
    setLineaTxt(c.linea_credito ? String(c.linea_credito) : '');
  };

  async function guardar() {
    if (!ed?.nombre?.trim()) return avisar('Escriba un nombre.', 'error');
    setGuardando(true);
    const saldo = aNumero(saldoTxt) || 0;
    const fila = {
      nombre: ed.nombre.trim(), tipo: ed.tipo || 'banco', modo: ed.modo || 'manual', banco: ed.banco || null,
      numero: ed.numero?.trim() || null, formato: ed.modo === 'importacion' ? ed.formato || null : null,
      linea_credito: ed.tipo === 'tarjeta' ? aNumero(lineaTxt) : null,
      dia_corte: ed.tipo === 'tarjeta' && ed.dia_corte ? Number(ed.dia_corte) : null,
      dia_pago: ed.tipo === 'tarjeta' && ed.dia_pago ? Number(ed.dia_pago) : null,
      activa: ed.activa ?? true, orden: ed.orden ?? 10,
      ...(ed.modo !== 'importacion' || !ed.id ? {
        saldo_inicial: ed.tipo === 'tarjeta' ? -Math.abs(saldo) : saldo,
        fecha_saldo_inicial: saldo ? ed.fecha_saldo_inicial || hoy() : ed.fecha_saldo_inicial || null,
      } : {}),
    };
    if (fila.modo === 'importacion' && !fila.formato) { setGuardando(false); return avisar('Elija el formato del banco.', 'error'); }
    try {
      if (ed.id) revisar(await supabase.from('cuentas').update(fila).eq('id', ed.id));
      else revisar(await supabase.from('cuentas').insert(fila));
      await recargar(); setEd(null); avisar('Cuenta guardada.');
    } catch (e) { avisar((e as Error).message, 'error'); }
    setGuardando(false);
  }

  async function eliminar(c: Cuenta) {
    const { count } = await supabase.from('movimientos').select('id', { count: 'exact', head: true }).eq('cuenta_id', c.id);
    if (count) return avisar(`Tiene ${count} movimientos: desactívela en lugar de eliminarla.`, 'error');
    if (!window.confirm(`¿Eliminar "${c.nombre}"?`)) return;
    try { revisar(await supabase.from('cuentas').delete().eq('id', c.id)); await recargar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }

  const tipoTxt = { banco: 'Cuenta bancaria', tarjeta: 'Tarjeta de crédito', efectivo: 'Efectivo' };
  return (
    <Tarjeta titulo="Cuentas, tarjetas y efectivo" accion={<Boton disabled={!activa} onClick={() => abrir({ tipo: 'banco', modo: 'manual', activa: true })}><Plus className="h-4 w-4" />Nueva</Boton>}>
      <ul className="divide-y divide-black/5">
        {cuentas.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-3">
            <div className={c.activa ? '' : 'opacity-50'}>
              <div className="font-medium">{c.nombre}</div>
              <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-tinta-suave">
                <span>{tipoTxt[c.tipo]}{c.banco ? ` · ${c.banco}` : ''}{c.numero ? ` · ${c.numero}` : ''}</span>
                <Etiqueta color={c.modo === 'importacion' ? 'azul' : 'gris'}>{c.modo === 'importacion' ? 'Se importa' : 'Manual'}</Etiqueta>
                {!c.activa && <Etiqueta>Inactiva</Etiqueta>}
              </div>
            </div>
            <div className="flex gap-0.5">
              <button onClick={() => abrir(c)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5" title="Editar"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => eliminar(c)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-red-50 hover:text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
      </ul>
      {ed && (
        <Modal abierto titulo={ed.id ? 'Editar cuenta' : 'Nueva cuenta'} cerrar={() => setEd(null)}
          pie={<><Boton variante="secundario" onClick={() => setEd(null)}>Cancelar</Boton><Boton onClick={guardar} cargando={guardando}>Guardar</Boton></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={ed.nombre || ''} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} placeholder="Ej.: Visa BNB" autoFocus /></Campo>
            <Campo etiqueta="Tipo">
              <Selector value={ed.tipo} onChange={(e) => setEd({ ...ed, tipo: e.target.value as Cuenta['tipo'], formato: null })}>
                <option value="banco">Cuenta bancaria</option><option value="tarjeta">Tarjeta de crédito</option><option value="efectivo">Efectivo</option>
              </Selector>
            </Campo>
            <Campo etiqueta="¿Cómo se registran sus movimientos?">
              <Selector value={ed.modo} onChange={(e) => setEd({ ...ed, modo: e.target.value as Cuenta['modo'] })} disabled={ed.tipo === 'efectivo'}>
                <option value="manual">Manual</option><option value="importacion">Importando el Excel del banco</option>
              </Selector>
            </Campo>
            {ed.modo === 'importacion' && ed.tipo !== 'efectivo' && (
              <Campo etiqueta="Formato del extracto" className="sm:col-span-2">
                <Selector value={ed.formato || ''} onChange={(e) => setEd({ ...ed, formato: e.target.value })}>
                  <option value="">Elija…</option>
                  {FORMATOS.filter((f) => f.tipo === ed.tipo).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </Selector>
              </Campo>
            )}
            {ed.tipo !== 'efectivo' && <>
              <Campo etiqueta="Banco"><Entrada value={ed.banco || ''} onChange={(e) => setEd({ ...ed, banco: e.target.value })} /></Campo>
              <Campo etiqueta={ed.tipo === 'tarjeta' ? 'Últimos 4 dígitos' : 'Número de cuenta'} ayuda={ed.tipo === 'banco' ? 'Sirve para reconocer traspasos entre sus cuentas.' : undefined}>
                <Entrada value={ed.numero || ''} onChange={(e) => setEd({ ...ed, numero: e.target.value })} />
              </Campo>
            </>}
            {ed.tipo === 'tarjeta' && <>
              <Campo etiqueta="Línea de crédito (Bs)"><Entrada inputMode="decimal" value={lineaTxt} onChange={(e) => setLineaTxt(e.target.value)} /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo etiqueta="Día de corte"><Entrada type="number" min={1} max={31} value={ed.dia_corte ?? ''} onChange={(e) => setEd({ ...ed, dia_corte: e.target.value ? Number(e.target.value) : null })} /></Campo>
                <Campo etiqueta="Día de pago"><Entrada type="number" min={1} max={31} value={ed.dia_pago ?? ''} onChange={(e) => setEd({ ...ed, dia_pago: e.target.value ? Number(e.target.value) : null })} /></Campo>
              </div>
            </>}
            {(ed.modo !== 'importacion' || !ed.id) && <>
              <Campo etiqueta={ed.tipo === 'tarjeta' ? 'Deuda inicial (Bs)' : 'Saldo inicial (Bs)'}
                ayuda={ed.modo === 'importacion' ? 'Si lo deja vacío, se toma del primer extracto.' : undefined}>
                <Entrada inputMode="decimal" value={saldoTxt} onChange={(e) => setSaldoTxt(e.target.value)} placeholder="0" />
              </Campo>
              <Campo etiqueta="A la fecha"><Entrada type="date" value={ed.fecha_saldo_inicial || hoy()} onChange={(e) => setEd({ ...ed, fecha_saldo_inicial: e.target.value })} /></Campo>
            </>}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={ed.activa ?? true} onChange={(e) => setEd({ ...ed, activa: e.target.checked })} /> Activa
            </label>
          </div>
        </Modal>
      )}
    </Tarjeta>
  );
}

// ------------------------------------------------------------- Categorías
const COLORES = ['#16a34a', '#ea580c', '#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ca8a04', '#dc2626', '#c026d3', '#65a30d', '#0d9488', '#b91c1c', '#9333ea', '#78716c', '#64748b', '#059669'];

function Categorias() {
  const { categorias, recargar, avisar, activa } = useApp();
  const [ed, setEd] = useState<Partial<Categoria> | null>(null);

  async function guardar() {
    if (!ed?.nombre?.trim()) return avisar('Escriba un nombre.', 'error');
    const fila = { nombre: ed.nombre.trim(), tipo: ed.tipo || 'gasto', color: ed.color || '#64748b', en_presupuesto: ed.en_presupuesto ?? true, activa: ed.activa ?? true };
    try {
      if (ed.id) revisar(await supabase.from('categorias').update(fila).eq('id', ed.id));
      else revisar(await supabase.from('categorias').insert(fila));
      await recargar(); setEd(null);
    } catch (e) { avisar((e as Error).message, 'error'); }
  }
  async function eliminar(c: Categoria) {
    if (!window.confirm(`¿Eliminar "${c.nombre}"? Sus movimientos quedarán sin categoría y se borrarán sus presupuestos.`)) return;
    try { revisar(await supabase.from('categorias').delete().eq('id', c.id)); await recargar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }

  const grupo = (tipo: 'gasto' | 'ingreso') => (
    <ul className="divide-y divide-black/5">
      {categorias.filter((c) => c.tipo === tipo).map((c) => (
        <li key={c.id} className={'flex items-center justify-between gap-3 py-2.5 ' + (c.activa ? '' : 'opacity-50')}>
          <span className="flex items-center gap-2 text-sm"><PuntoColor color={c.color} />{c.nombre}
            {tipo === 'gasto' && !c.en_presupuesto && <Etiqueta>no cuenta en presupuesto</Etiqueta>}</span>
          <span className="flex gap-0.5">
            <button onClick={() => setEd(c)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => eliminar(c)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta titulo="Categorías de gasto" accion={<Boton disabled={!activa} onClick={() => setEd({ tipo: 'gasto', color: COLORES[categorias.length % COLORES.length], en_presupuesto: true, activa: true })}><Plus className="h-4 w-4" />Nueva</Boton>}>{grupo('gasto')}</Tarjeta>
      <Tarjeta titulo="Categorías de ingreso" accion={<Boton variante="secundario" disabled={!activa} onClick={() => setEd({ tipo: 'ingreso', color: '#059669', en_presupuesto: false, activa: true })}><Plus className="h-4 w-4" />Nueva</Boton>}>{grupo('ingreso')}</Tarjeta>
      {ed && (
        <Modal abierto titulo={ed.id ? 'Editar categoría' : 'Nueva categoría'} cerrar={() => setEd(null)}
          pie={<><Boton variante="secundario" onClick={() => setEd(null)}>Cancelar</Boton><Boton onClick={guardar}>Guardar</Boton></>}>
          <div className="space-y-4">
            <Campo etiqueta="Nombre"><Entrada value={ed.nombre || ''} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} autoFocus /></Campo>
            <Campo etiqueta="Color">
              <div className="flex flex-wrap gap-2">
                {COLORES.map((c) => <button key={c} type="button" onClick={() => setEd({ ...ed, color: c })} className={'h-7 w-7 rounded-full ' + (ed.color === c ? 'ring-2 ring-offset-2 ring-tinta' : '')} style={{ background: c }} />)}
              </div>
            </Campo>
            {ed.tipo === 'gasto' && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.en_presupuesto ?? true} onChange={(e) => setEd({ ...ed, en_presupuesto: e.target.checked })} />
                Cuenta en el presupuesto personal</label>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.activa ?? true} onChange={(e) => setEd({ ...ed, activa: e.target.checked })} /> Activa</label>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Reglas
function Reglas() {
  const { categorias, categoria, nombreCuenta, cuentas, avisar, tocar, version } = useApp();
  const [reglas, setReglas] = useState<Regla[] | null>(null);
  const [ed, setEd] = useState<Partial<Regla> | null>(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    supabase.from('reglas').select('*').order('texto').then((r) => setReglas((r.data as Regla[]) || []));
  }, [version]);

  async function guardar() {
    if (!ed?.texto || ed.texto.trim().length < 3) return avisar('El texto debe tener al menos 3 caracteres.', 'error');
    if (!ed.es_traspaso && !ed.categoria_id) return avisar('Elija una categoría o marque «Es traspaso».', 'error');
    const fila = { texto: ed.texto.trim(), es_traspaso: !!ed.es_traspaso, categoria_id: ed.es_traspaso ? null : ed.categoria_id,
      cuenta_destino_id: ed.es_traspaso ? ed.cuenta_destino_id || null : null, cuenta_id: ed.cuenta_id || null };
    try {
      if (ed.id) revisar(await supabase.from('reglas').update(fila).eq('id', ed.id));
      else revisar(await supabase.from('reglas').insert(fila));
      setEd(null); tocar();
    } catch (e) { avisar((e as Error).message, 'error'); }
  }
  async function eliminar(r: Regla) {
    if (!window.confirm(`¿Eliminar la regla «${r.texto}»? Los movimientos ya clasificados no cambian.`)) return;
    try { revisar(await supabase.from('reglas').delete().eq('id', r.id)); tocar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }
  async function aplicar() {
    setAplicando(true);
    try {
      const r = revisar(await supabase.rpc('procesar_pendientes')) as { reglas: number; traspasos: number; recurrentes: number };
      avisar(`${r.reglas + r.traspasos} movimiento(s) clasificados.`); tocar();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setAplicando(false);
  }

  if (!reglas) return <Cargando />;
  return (
    <Tarjeta titulo={`Reglas aprendidas (${reglas.length})`} accion={<div className="flex gap-2">
      <Boton variante="secundario" onClick={aplicar} cargando={aplicando}><RefreshCw className="h-4 w-4" />Aplicar a pendientes</Boton>
      <Boton onClick={() => setEd({ es_traspaso: false })}><Plus className="h-4 w-4" />Nueva</Boton></div>}>
      <p className="mb-3 text-sm text-tinta-suave">Si la descripción de un movimiento contiene el texto, se clasifica solo. Si varias coinciden, gana la de texto más largo.</p>
      <ul className="divide-y divide-black/5">
        {reglas.map((r) => {
          const c = categoria(r.categoria_id);
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="rounded bg-papel px-1.5 py-0.5 font-mono text-xs">{r.texto}</span>
                <span className="mx-2 text-tinta-tenue">→</span>
                {r.es_traspaso ? <Etiqueta color="azul"><ArrowLeftRight className="h-3 w-3" />Traspaso{r.cuenta_destino_id ? ` a ${nombreCuenta(r.cuenta_destino_id)}` : ''}</Etiqueta>
                  : <span className="inline-flex items-center gap-1.5">{c && <PuntoColor color={c.color} />}{c?.nombre || '—'}</span>}
                {r.cuenta_id && <span className="ml-2 text-xs text-tinta-tenue">solo en {nombreCuenta(r.cuenta_id)}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs text-tinta-tenue">{r.veces}×</span>
                <button onClick={() => setEd(r)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-black/5"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => eliminar(r)} className="rounded-lg p-1.5 text-tinta-tenue hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          );
        })}
      </ul>
      {ed && (
        <Modal abierto titulo={ed.id ? 'Editar regla' : 'Nueva regla'} cerrar={() => setEd(null)}
          pie={<><Boton variante="secundario" onClick={() => setEd(null)}>Cancelar</Boton><Boton onClick={guardar}>Guardar</Boton></>}>
          <div className="space-y-4">
            <Campo etiqueta="Si la descripción contiene" ayuda="No distingue mayúsculas. Ej.: HIPERMAXI"><Entrada value={ed.texto || ''} onChange={(e) => setEd({ ...ed, texto: e.target.value })} autoFocus /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!ed.es_traspaso} onChange={(e) => setEd({ ...ed, es_traspaso: e.target.checked })} /> Es un traspaso entre mis cuentas</label>
            {ed.es_traspaso ? (
              <Campo etiqueta="Cuenta del otro lado (opcional)">
                <Selector value={ed.cuenta_destino_id || ''} onChange={(e) => setEd({ ...ed, cuenta_destino_id: e.target.value || null })}>
                  <option value="">Cuenta mía que no está en el sistema</option>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Selector>
              </Campo>
            ) : (
              <Campo etiqueta="Categoría">
                <Selector value={ed.categoria_id || ''} onChange={(e) => setEd({ ...ed, categoria_id: e.target.value })}>
                  <option value="">Elija…</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
                </Selector>
              </Campo>
            )}
            <Campo etiqueta="Aplicar solo en la cuenta (opcional)">
              <Selector value={ed.cuenta_id || ''} onChange={(e) => setEd({ ...ed, cuenta_id: e.target.value || null })}>
                <option value="">Todas las cuentas</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Selector>
            </Campo>
          </div>
        </Modal>
      )}
    </Tarjeta>
  );
}

// ------------------------------------------------------------- Tipo de cambio
function Cambio() {
  const { perfil, avisar, recargar, tocar } = useApp();
  const admin = !!perfil?.es_superadmin;
  const [lista, setLista] = useState<TipoCambio[] | null>(null);
  const [fecha, setFecha] = useState(hoy());
  const [valor, setValor] = useState('');
  const [ocupado, setOcupado] = useState('');

  const cargar = () => supabase.from('tipos_cambio').select('*').order('fecha', { ascending: false }).limit(60)
    .then((r) => setLista((r.data as TipoCambio[]) || []));
  useEffect(() => { cargar(); }, []);

  async function bcb() {
    setOcupado('bcb');
    try {
      const v = revisar(await supabase.rpc('actualizar_tc_ahora')) as number | null;
      avisar(v ? `BCB: Bs ${numero(Number(v))} por dólar.` : 'No se pudo leer la página del BCB. Cargue el valor a mano.', v ? 'ok' : 'error');
      await cargar(); await recargar();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setOcupado('');
  }
  async function guardarManual() {
    const v = aNumero(valor);
    if (!v || v <= 0) return avisar('Ingrese un valor válido.', 'error');
    try {
      revisar(await supabase.from('tipos_cambio').upsert({ fecha, bs_por_usd: v, origen: 'manual', actualizado_en: new Date().toISOString() }));
      setValor(''); await cargar(); await recargar(); avisar('Tipo de cambio guardado.');
    } catch (e) { avisar((e as Error).message, 'error'); }
  }
  async function importarHistorico(f?: File) {
    if (!f) return;
    setOcupado('excel');
    try {
      const tabla = await leerExcel(f);
      const filas = tabla.map((r) => ({ fecha: aFecha(r[0]), bs_por_usd: aNumero(r[1]) }))
        .filter((r) => r.fecha && r.bs_por_usd && r.bs_por_usd > 0).map((r) => ({ ...r, origen: 'manual' }));
      if (!filas.length) throw new Error('No encontré filas con fecha (columna A) y valor (columna B).');
      revisar(await supabase.from('tipos_cambio').upsert(filas));
      const n = revisar(await supabase.rpc('recalcular_tc')) as number;
      avisar(`${filas.length} tipos de cambio cargados. ${n} movimientos actualizados.`);
      await cargar(); await recargar(); tocar();
    } catch (e) { avisar((e as Error).message, 'error'); }
    setOcupado('');
  }
  async function recalcular() {
    setOcupado('rec');
    try { const n = revisar(await supabase.rpc('recalcular_tc')) as number; avisar(`${n} movimientos actualizados.`); tocar(); }
    catch (e) { avisar((e as Error).message, 'error'); }
    setOcupado('');
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Tarjeta titulo="Tipo de cambio oficial del BCB (Bs por dólar)">
        <p className="mb-3 text-sm text-tinta-suave">Se actualiza solo todos los días a las 08:00 y 18:00. Cada movimiento guarda el tipo de cambio de su fecha para los reportes en dólares.</p>
        {!lista ? <Cargando /> : (
          <ul className="max-h-[28rem] divide-y divide-black/5 overflow-y-auto text-sm">
            {lista.map((t) => (
              <li key={t.fecha} className="flex items-center justify-between py-2">
                <span>{fechaCorta(t.fecha)}</span>
                <span className="flex items-center gap-2"><Etiqueta color={t.origen === 'manual' ? 'gris' : 'verde'}>{t.origen}</Etiqueta><b className="tabular-nums">{numero(Number(t.bs_por_usd))}</b></span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <div className="space-y-5">
        {admin ? (
          <>
            <Tarjeta titulo="Actualizar">
              <Boton onClick={bcb} cargando={ocupado === 'bcb'} className="w-full"><RefreshCw className="h-4 w-4" />Leer el BCB ahora</Boton>
              <Boton variante="secundario" onClick={recalcular} cargando={ocupado === 'rec'} className="mt-2 w-full">Recalcular movimientos</Boton>
            </Tarjeta>
            <Tarjeta titulo="Cargar a mano">
              <div className="space-y-3">
                <Campo etiqueta="Fecha"><Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
                <Campo etiqueta="Bs por dólar"><Entrada inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="11,73" /></Campo>
                <Boton onClick={guardarManual} className="w-full">Guardar</Boton>
              </div>
            </Tarjeta>
            <Tarjeta titulo="Cargar historial desde Excel">
              <p className="mb-3 text-xs text-tinta-suave">Columna A: fecha · Columna B: Bs por dólar. Úselo para meses anteriores a la puesta en marcha.</p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 px-3 py-4 text-sm hover:bg-papel">
                <Upload className="h-4 w-4" />{ocupado === 'excel' ? 'Cargando…' : 'Elegir archivo'}
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importarHistorico(e.target.files?.[0])} />
              </label>
            </Tarjeta>
          </>
        ) : (
          <Tarjeta><p className="text-sm text-tinta-suave">El tipo de cambio lo administra el sistema.</p></Tarjeta>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Mi cuenta
function Perfil() {
  const { perfil, suscripcion, recargar, avisar } = useApp();
  const [nombre, setNombre] = useState(perfil?.nombre || '');
  const [clave, setClave] = useState('');
  async function guardarNombre() {
    try { revisar(await supabase.from('perfiles').update({ nombre }).eq('id', perfil!.id)); await recargar(); avisar('Nombre guardado.'); }
    catch (e) { avisar((e as Error).message, 'error'); }
  }
  async function cambiarClave() {
    if (clave.length < 8) return avisar('Use al menos 8 caracteres.', 'error');
    const { error } = await supabase.auth.updateUser({ password: clave });
    if (error) avisar(error.message, 'error'); else { setClave(''); avisar('Contraseña cambiada.'); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta titulo="Mis datos">
        <div className="space-y-3">
          <Campo etiqueta="Correo"><Entrada value={perfil?.email || ''} disabled /></Campo>
          <Campo etiqueta="Nombre"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
          <Boton onClick={guardarNombre}>Guardar</Boton>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Cambiar contraseña">
        <div className="space-y-3">
          <Campo etiqueta="Nueva contraseña"><Entrada type="password" value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
          <Boton onClick={cambiarClave}>Cambiar</Boton>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Suscripción">
        <p className="text-sm">Plan <b>{suscripcion?.plan}</b> · estado <b>{suscripcion?.estado}</b> · vence {fechaCorta(suscripcion?.vence_el)}</p>
        {perfil?.es_superadmin && <p className="mt-2 text-xs text-tinta-suave">Usted es el administrador del sistema.</p>}
      </Tarjeta>
    </div>
  );
}
