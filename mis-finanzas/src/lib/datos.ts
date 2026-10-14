import { revisar, supabase, traerTodo } from './supabase';
import type { Importacion, Movimiento, Presupuesto, Recurrente, ResumenMes } from './tipos';
import { diasEntre, hoy } from './formato';

export async function resumen(desdeMes: string, hastaMes: string): Promise<ResumenMes[]> {
  const r = await supabase.from('v_resumen_mes').select('mes,categoria_id,tipo,total_bs,total_usd,cantidad')
    .gte('mes', desdeMes).lte('mes', hastaMes);
  return ((revisar(r) as ResumenMes[]) || []).map((x) => ({ ...x, total_bs: Number(x.total_bs), total_usd: Number(x.total_usd) }));
}

export async function presupuestos(mes: string): Promise<Presupuesto[]> {
  const r = await supabase.from('presupuestos').select('*').eq('mes', mes);
  return ((revisar(r) as Presupuesto[]) || []).map((x) => ({ ...x, monto_bs: Number(x.monto_bs) }));
}

export async function saldos(): Promise<Map<string, number>> {
  const r = await supabase.rpc('saldos_cuentas');
  const filas = (revisar(r) as { cuenta_id: string; saldo: number }[]) || [];
  return new Map(filas.map((f) => [f.cuenta_id, Number(f.saldo)]));
}

export async function ultimasImportaciones(): Promise<Map<string, Importacion>> {
  const r = await supabase.from('importaciones').select('*').order('hasta', { ascending: false }).order('creado_en', { ascending: false }).limit(200);
  const m = new Map<string, Importacion>();
  for (const i of (revisar(r) as Importacion[]) || []) if (!m.has(i.cuenta_id)) m.set(i.cuenta_id, i);
  return m;
}

export async function tcEn(fecha: string): Promise<number | null> {
  const r = await supabase.from('tipos_cambio').select('bs_por_usd').lte('fecha', fecha).order('fecha', { ascending: false }).limit(1).maybeSingle();
  const v = (r.data as { bs_por_usd: number } | null)?.bs_por_usd;
  if (v) return Number(v);
  const r2 = await supabase.from('tipos_cambio').select('bs_por_usd').order('fecha').limit(1).maybeSingle();
  return (r2.data as { bs_por_usd: number } | null)?.bs_por_usd ? Number((r2.data as { bs_por_usd: number }).bs_por_usd) : null;
}

export async function movimientos(desde: string, hasta: string): Promise<Movimiento[]> {
  const filas = await traerTodo<Movimiento>((a, b) =>
    supabase.from('movimientos').select('*').gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false }).order('hora', { ascending: false, nullsFirst: false }).order('creado_en', { ascending: false })
      .range(a, b));
  return filas.map((m) => ({ ...m, monto_bs: Number(m.monto_bs), tc_usd: m.tc_usd ? Number(m.tc_usd) : null }));
}

/**
 * Elimina un movimiento.
 * - Cargado a mano: se borra.
 * - Vino de un extracto: queda como «eliminado» (no cuenta en gastos ni reportes,
 *   no vuelve a aparecer al importar de nuevo y el saldo del banco sigue cuadrando).
 */
export async function eliminarMovimiento(m: Movimiento): Promise<'borrado' | 'excluido'> {
  if (m.traspaso_par_id) revisar(await supabase.rpc('quitar_traspaso', { p_mov: m.id }));
  if (!m.importacion_id) {
    revisar(await supabase.from('movimientos').delete().eq('id', m.id));
    return 'borrado';
  }
  const r = await supabase.from('movimientos')
    .update({ clase: 'excluido', estado: 'confirmado', categoria_id: null, traspaso_par_id: null }).eq('id', m.id);
  if (r.error && /clase_check|check constraint/i.test(r.error.message)) {
    throw new Error('Falta instalar en Supabase la actualización 05_eliminar_movimientos.sql.');
  }
  revisar(r);
  return 'excluido';
}

export async function restaurarMovimiento(m: Movimiento) {
  revisar(await supabase.from('movimientos').update({ clase: 'normal', estado: 'por_revisar' }).eq('id', m.id));
}

export async function recurrentes(): Promise<Recurrente[]> {
  const r = await supabase.from('recurrentes').select('*').order('proxima_fecha');
  return (revisar(r) as Recurrente[]) || [];
}

export type EstadoRecordatorio = 'vencido' | 'pronto' | 'futuro';
export function estadoRecurrente(r: Recurrente): EstadoRecordatorio {
  const d = diasEntre(hoy(), r.proxima_fecha);
  if (d < 0) return 'vencido';
  if (d <= r.dias_aviso) return 'pronto';
  return 'futuro';
}
