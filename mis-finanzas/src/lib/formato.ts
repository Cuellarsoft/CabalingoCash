const nf = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });

export type Moneda = 'BOB' | 'USD';

export const simbolo = (m: Moneda) => (m === 'USD' ? '$us' : 'Bs');

export function dinero(n: number | null | undefined, m: Moneda = 'BOB', opts: { signo?: boolean; corto?: boolean } = {}): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Math.abs(n);
  const s = opts.corto && v >= 10000 ? nf0.format(v) : nf.format(v);
  const pre = n < 0 ? '−' : opts.signo && n > 0 ? '+' : '';
  return `${pre}${simbolo(m)} ${s}`;
}

export const numero = (n: number | null | undefined) => (n === null || n === undefined ? '' : nf.format(n));

/** Convierte un monto en Bs a la moneda elegida usando el tipo de cambio dado. */
export function convertir(bs: number, m: Moneda, tc: number | null | undefined): number {
  if (m === 'BOB') return bs;
  if (!tc) return NaN;
  return bs / tc;
}

// ---------- fechas (siempre como texto AAAA-MM-DD) ----------

export function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fechaCorta(f: string | null | undefined): string {
  if (!f) return '—';
  const [y, m, d] = f.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const inicioMes = (f: string) => f.slice(0, 7) + '-01';

export function finMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${mes.slice(0, 7)}-${String(d).padStart(2, '0')}`;
}

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function nombreMes(mes: string, corto = false): string {
  const [y, m] = mes.split('-').map(Number);
  return corto ? `${MESES_C[m - 1]} ${String(y).slice(2)}` : `${MESES[m - 1]} ${y}`;
}

export function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + 'T00:00:00'), b = new Date(hasta + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function sumarDias(f: string, n: number): string {
  const d = new Date(f + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Texto clave sugerido para una regla a partir de una descripción bancaria. */
export function sugerirTextoRegla(desc: string): string {
  const d = desc.replace(/\s+/g, ' ').trim();
  // QR / ACH: "... BANCO XXX 1041322447 HIPERMAXI SA referencia"
  let m = d.match(/BANCO [A-ZÁÉÍÓÚÑ.\s]+?\s\d{6,}\s+(.+)$/i);
  if (m) return m[1].split(' ').slice(0, 3).join(' ').replace(/[^\wÁÉÍÓÚÑáéíóúñ.&*\s-]/g, '').trim();
  // "Transferencia a 1311409346. NOMBRE APELLIDO referencia"
  m = d.match(/Transferencia a \d+\.?\s+(.+)$/i);
  if (m) return m[1].split(' ').slice(0, 3).join(' ').trim();
  // "POS DELIZIA SCZ AV GRIGO Tarj: 7137 BO"
  m = d.match(/^POS\s+(.+?)(\s+Tarj:|$)/i);
  if (m) return m[1].split(' ').slice(0, 2).join(' ');
  return d.split(' ').slice(0, 3).join(' ').replace(/\d{5,}/g, '').trim();
}
