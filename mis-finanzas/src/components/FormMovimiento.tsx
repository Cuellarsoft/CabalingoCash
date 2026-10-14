import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/App';
import { revisar, supabase } from '../lib/supabase';
import { eliminarMovimiento } from '../lib/datos';
import { Trash2 } from 'lucide-react';
import type { Movimiento, Regla } from '../lib/tipos';
import { hoy, numero } from '../lib/formato';
import { aNumero } from '../lib/importadores';
import { Boton, Campo, Entrada, Modal, Pestanas, Selector } from './ui';

type Tipo = 'gasto' | 'ingreso' | 'traspaso';

export default function FormMovimiento({ abierto, cerrar, editar, alGuardar, cuentaInicial, tipoInicial, destinoInicial }: {
  abierto: boolean; cerrar: () => void; editar?: Movimiento | null; alGuardar?: () => void;
  cuentaInicial?: string; tipoInicial?: Tipo; destinoInicial?: string;
}) {
  const { cuentas, categorias, avisar, tocar, tcHoy } = useApp();
  const activas = cuentas.filter((c) => c.activa);
  const [tipo, setTipo] = useState<Tipo>('gasto');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'BOB' | 'USD'>('BOB');
  const [fecha, setFecha] = useState(hoy());
  const [cuenta, setCuenta] = useState('');
  const [destino, setDestino] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nota, setNota] = useState('');
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [catManual, setCatManual] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const esImportado = !!editar?.importacion_id;

  useEffect(() => {
    if (!abierto) return;
    setConfirmarBorrar(false);
    supabase.from('reglas').select('*').then((r) => setReglas((r.data as Regla[]) || []));
    if (editar) {
      setTipo(editar.clase === 'traspaso' ? 'traspaso' : editar.monto_bs < 0 ? 'gasto' : 'ingreso');
      setMonto(String(Math.abs(editar.moneda_original === 'USD' && editar.monto_original ? editar.monto_original : editar.monto_bs)));
      setMoneda(editar.moneda_original === 'USD' ? 'USD' : 'BOB');
      setFecha(editar.fecha);
      setCuenta(editar.cuenta_id);
      setCategoria(editar.categoria_id || '');
      setDescripcion(editar.descripcion);
      setNota(editar.nota || '');
      setCatManual(true);
    } else {
      setTipo(tipoInicial || 'gasto'); setMonto(''); setMoneda('BOB'); setFecha(hoy()); setDescripcion(''); setNota('');
      setCategoria(''); setDestino(destinoInicial || ''); setCatManual(false);
      const ultima = (() => { try { return localStorage.getItem('ultimaCuenta'); } catch { return null; } })();
      const efectivo = activas.find((c) => c.tipo === 'efectivo');
      const sugerida = cuentaInicial || (tipoInicial === 'traspaso' ? activas.find((c) => c.tipo === 'banco')?.id : undefined);
      setCuenta(sugerida || activas.find((c) => c.id === ultima)?.id || efectivo?.id || activas[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, editar]);

  // Sugerencia de categoría según las reglas aprendidas
  useEffect(() => {
    if (catManual || !descripcion.trim() || tipo === 'traspaso') return;
    const d = descripcion.toUpperCase();
    const r = reglas.filter((x) => !x.es_traspaso && x.categoria_id && d.includes(x.texto.toUpperCase()))
      .sort((a, b) => b.texto.length - a.texto.length)[0];
    if (r?.categoria_id) setCategoria(r.categoria_id);
  }, [descripcion, reglas, catManual, tipo]);

  const cats = useMemo(() => categorias.filter((c) => c.activa && c.tipo === (tipo === 'ingreso' ? 'ingreso' : 'gasto')), [categorias, tipo]);
  const cuentaSel = cuentas.find((c) => c.id === cuenta);

  async function guardar() {
    const valor = Math.abs(aNumero(monto) || 0);
    if (!valor || valor <= 0) return avisar('Ingrese un monto mayor a cero.', 'error');
    if (!cuenta) return avisar('Elija la cuenta o tarjeta.', 'error');
    if (tipo === 'traspaso' && (!destino || destino === cuenta)) return avisar('Elija una cuenta destino distinta.', 'error');
    setGuardando(true);
    try {
      const signo = tipo === 'ingreso' ? 1 : -1;
      if (editar) {
        const cambios: Partial<Movimiento> = { categoria_id: tipo === 'traspaso' ? null : categoria || null, nota: nota || null,
          estado: categoria || tipo === 'traspaso' ? 'confirmado' : editar.estado };
        if (!esImportado) {
          Object.assign(cambios, {
            fecha, descripcion: descripcion || '(sin descripción)', cuenta_id: cuenta,
            moneda_original: moneda, monto_original: signo * valor,
            monto_bs: moneda === 'USD' ? null : signo * valor,
            tc_usd: null,
          });
        }
        revisar(await supabase.from('movimientos').update(cambios).eq('id', editar.id));
        avisar('Movimiento actualizado.');
      } else {
        const fila = {
          cuenta_id: cuenta, fecha,
          descripcion: descripcion.trim() || (tipo === 'traspaso' ? 'Traspaso' : categorias.find((c) => c.id === categoria)?.nombre || 'Movimiento'),
          monto_bs: moneda === 'USD' ? null : signo * valor,
          moneda_original: moneda, monto_original: signo * valor,
          categoria_id: tipo === 'traspaso' ? null : categoria || null,
          estado: categoria || tipo === 'traspaso' ? 'confirmado' : 'por_revisar',
          clase: tipo === 'traspaso' ? 'traspaso' : 'normal',
          nota: nota || null,
        };
        const nuevo = revisar(await supabase.from('movimientos').insert(fila).select('id').single()) as { id: string };
        if (tipo === 'traspaso') revisar(await supabase.rpc('marcar_traspaso', { p_mov: nuevo.id, p_destino: destino }));
        try { localStorage.setItem('ultimaCuenta', cuenta); } catch { /* */ }
        avisar(tipo === 'gasto' ? 'Gasto registrado.' : tipo === 'ingreso' ? 'Ingreso registrado.' : 'Traspaso registrado.');
      }
      tocar();
      alGuardar?.();
      cerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!editar) return;
    setBorrando(true);
    try {
      const r = await eliminarMovimiento(editar);
      avisar(r === 'borrado' ? 'Movimiento eliminado.' : 'Movimiento eliminado. Puede restaurarlo en Movimientos → «Eliminados».');
      tocar();
      alGuardar?.();
      cerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setBorrando(false);
    }
  }

  const titulo = editar ? 'Editar movimiento' : 'Nuevo movimiento';
  const pie = editar && confirmarBorrar ? (
    <>
      <span className="mr-auto self-center text-sm text-red-700">¿Eliminar este movimiento?</span>
      <Boton variante="secundario" onClick={() => setConfirmarBorrar(false)}>No</Boton>
      <Boton variante="peligro" onClick={borrar} cargando={borrando}>Sí, eliminar</Boton>
    </>
  ) : (
    <>
      {editar && (
        <Boton variante="fantasma" className="mr-auto text-red-600 hover:bg-red-50" onClick={() => setConfirmarBorrar(true)}>
          <Trash2 className="h-4 w-4" />Eliminar
        </Boton>
      )}
      <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
      <Boton onClick={guardar} cargando={guardando}>Guardar</Boton>
    </>
  );
  return (
    <Modal abierto={abierto} cerrar={cerrar} titulo={titulo}
      pie={pie}>
      <div className="space-y-4">
        {!editar && (
          <Pestanas valor={tipo} cambiar={(t) => { setTipo(t); setCategoria(''); setCatManual(false); }}
            opciones={[{ id: 'gasto', nombre: 'Gasto' }, { id: 'ingreso', nombre: 'Ingreso' }, { id: 'traspaso', nombre: 'Traspaso' }]} />
        )}
        {esImportado && !confirmarBorrar && (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Este movimiento vino del extracto del banco: solo puede cambiar la categoría y la nota, o eliminarlo.
          </p>
        )}
        {confirmarBorrar && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
            {esImportado
              ? 'Dejará de contar en sus gastos, presupuesto y reportes. Como vino del extracto del banco, queda guardado como «eliminado»: no vuelve a aparecer si importa el extracto otra vez y el saldo de la cuenta sigue cuadrando con el banco. Puede restaurarlo en Movimientos → filtro «Eliminados».'
              : 'Se borrará definitivamente.'}
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Campo etiqueta="Monto">
            <Entrada inputMode="decimal" autoFocus={!editar} value={monto} disabled={esImportado}
              onChange={(e) => setMonto(e.target.value)} placeholder="0,00" className="text-lg font-semibold tabular-nums" />
          </Campo>
          <Campo etiqueta="Moneda">
            <Selector value={moneda} disabled={esImportado} onChange={(e) => setMoneda(e.target.value as 'BOB' | 'USD')}>
              <option value="BOB">Bs</option>
              <option value="USD">$us</option>
            </Selector>
          </Campo>
        </div>
        {moneda === 'USD' && !esImportado && (
          <p className="text-xs text-tinta-suave">Se convertirá a bolivianos con el tipo de cambio del BCB de la fecha
            {tcHoy ? ` (hoy: Bs ${numero(Number(tcHoy.bs_por_usd))})` : ''}.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={fecha} disabled={esImportado} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta={tipo === 'traspaso' ? 'Desde' : 'Cuenta o tarjeta'}>
            <Selector value={cuenta} disabled={esImportado} onChange={(e) => setCuenta(e.target.value)}>
              {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
        </div>
        {cuentaSel?.modo === 'importacion' && !editar && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta cuenta se carga con el extracto del banco. Si registra aquí un movimiento, puede quedar repetido cuando importe el extracto.
          </p>
        )}
        {tipo === 'traspaso' ? (
          <Campo etiqueta="Hacia" ayuda="Ej.: retiro de cajero → Efectivo, o pago de la otra tarjeta.">
            <Selector value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elija…</option>
              {activas.filter((c) => c.id !== cuenta).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
        ) : (
          <Campo etiqueta="Categoría">
            <Selector value={categoria} onChange={(e) => { setCategoria(e.target.value); setCatManual(true); }}>
              <option value="">Sin categoría (revisar después)</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
        )}
        <Campo etiqueta="Descripción">
          <Entrada value={descripcion} disabled={esImportado} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Hipermaxi, almuerzo, gasolina…" />
        </Campo>
        <Campo etiqueta="Nota (opcional)">
          <Entrada value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}
