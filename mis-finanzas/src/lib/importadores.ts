// Lectores de extractos bancarios en Excel.
// Cada lector recibe la hoja como una tabla (filas × columnas) y devuelve
// los movimientos listos para enviar a la base de datos.

export type Celda = string | number | boolean | Date | null | undefined;

export interface FilaImportada {
  fecha: string;            // AAAA-MM-DD
  hora: string | null;
  descripcion: string;
  monto_bs: number;         // negativo = sale dinero / aumenta deuda
  monto_usd: number | null; // solo si el banco no dio el monto en Bs
  moneda: string;           // BOB, USD, EUR…
  monto_original: number | null;
  referencia: string | null;
  huella: string;           // identificador único para no duplicar
}

export interface InfoExtracto {
  archivo: string;
  desde: string | null;
  hasta: string | null;
  saldo_anterior: number | null;
  saldo_final: number | null;
  total_adeudado: number | null;
  pago_minimo: number | null;
  fecha_vencimiento: string | null;
  linea_credito: number | null;
}

export interface ResultadoLectura {
  info: InfoExtracto;
  filas: FilaImportada[];
  avisos: string[];
}

export const FORMATOS: { id: string; nombre: string; tipo: 'banco' | 'tarjeta' }[] = [
  { id: 'ganadero_cuenta', nombre: 'Banco Ganadero — Cuenta (caja de ahorro / corriente)', tipo: 'banco' },
  { id: 'ganadero_tarjeta', nombre: 'Banco Ganadero — Tarjeta de crédito', tipo: 'tarjeta' },
];

// ---------- utilidades ----------

const txt = (c: Celda): string => (c === null || c === undefined ? '' : String(c)).replace(/\s+/g, ' ').trim();

const normal = (c: Celda): string =>
  txt(c).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function aFecha(c: Celda): string | null {
  if (c === null || c === undefined || c === '') return null;
  if (c instanceof Date && !isNaN(c.getTime())) {
    const y = c.getFullYear(), m = c.getMonth() + 1, d = c.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof c === 'number') {
    // número de serie de Excel
    const ms = Math.round((c - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const m = txt(c).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const mes = parseInt(m[2], 10), dia = parseInt(m[1], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function aNumero(c: Celda): number | null {
  if (c === null || c === undefined || c === '') return null;
  if (typeof c === 'number') return isFinite(c) ? c : null;
  let s = txt(c).replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  // 1.234,56 → 1234.56   |   1,234.56 → 1234.56
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');   // 3.100 → 3100 (punto de miles)
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function buscarFilaEncabezado(tabla: Celda[][], requeridas: string[]): number {
  for (let i = 0; i < Math.min(tabla.length, 40); i++) {
    const fila = (tabla[i] || []).map(normal);
    if (requeridas.every((r) => fila.some((c) => c === r || c.startsWith(r)))) return i;
  }
  return -1;
}

function indice(encabezado: Celda[], ...nombres: string[]): number {
  const fila = encabezado.map(normal);
  for (const n of nombres) {
    const i = fila.findIndex((c) => c === n);
    if (i >= 0) return i;
  }
  for (const n of nombres) {
    const i = fila.findIndex((c) => c.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

function textoCompleto(tabla: Celda[][], hasta: number): string {
  return tabla.slice(0, hasta).map((f) => (f || []).map(txt).join(' ')).join(' \n ');
}

// ---------- Banco Ganadero: cuenta ----------

function ganaderoCuenta(tabla: Celda[][], archivo: string): ResultadoLectura {
  const avisos: string[] = [];
  const h = buscarFilaEncabezado(tabla, ['FECHA', 'DESCRIPCION', 'DEBITO', 'CREDITO']);
  if (h < 0) throw new Error('No se reconoce el formato: no encontré las columnas FECHA, DESCRIPCIÓN, DÉBITO y CRÉDITO.');
  const enc = tabla[h];
  const iF = indice(enc, 'FECHA'), iH = indice(enc, 'HORA'), iN = indice(enc, 'NRO. TRANSAC.', 'NRO');
  const iD = indice(enc, 'DESCRIPCION'), iDe = indice(enc, 'DEBITO'), iCr = indice(enc, 'CREDITO'), iS = indice(enc, 'SALDO');

  const cab = textoCompleto(tabla, h);
  const per = cab.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  const info: InfoExtracto = {
    archivo, desde: per ? aFecha(per[1]) : null, hasta: per ? aFecha(per[2]) : null,
    saldo_anterior: null, saldo_final: null, total_adeudado: null, pago_minimo: null,
    fecha_vencimiento: null, linea_credito: null,
  };
  if (/MONEDA:\s*(\$US|USD|DOLAR)/i.test(cab)) avisos.push('El extracto parece estar en dólares: los montos se tomarán como Bs. Revise la cuenta elegida.');

  const filas: FilaImportada[] = [];
  const vistos = new Map<string, number>();
  for (let i = h + 1; i < tabla.length; i++) {
    const f = tabla[i] || [];
    const desc = txt(f[iD]);
    if (/^SALDO ANTERIOR/i.test(desc)) {
      info.saldo_anterior = aNumero(f[iS]);
      continue;
    }
    const fecha = aFecha(f[iF]);
    if (!fecha) continue;
    const deb = aNumero(f[iDe]) || 0, cred = aNumero(f[iCr]) || 0;
    const monto = r2(cred - deb);
    if (monto === 0) continue;
    const saldo = iS >= 0 ? aNumero(f[iS]) : null;
    if (saldo !== null) info.saldo_final = r2(saldo);
    const ref = iN >= 0 ? txt(f[iN]) || null : null;
    const hora = iH >= 0 ? txt(f[iH]) || null : null;
    let base = ref ? `T:${ref}:${fecha}:${monto}` : `F:${fecha}:${hora || ''}:${monto}:${desc}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    if (n > 1) base += `#${n}`;
    filas.push({ fecha, hora, descripcion: desc, monto_bs: monto, monto_usd: null, moneda: 'BOB',
      monto_original: monto, referencia: ref, huella: base });
  }
  if (!info.desde && filas.length) info.desde = filas[0].fecha;
  if (!info.hasta && filas.length) info.hasta = filas[filas.length - 1].fecha;
  if (!filas.length) avisos.push('No se encontraron movimientos en el archivo.');
  return { info, filas, avisos };
}

// ---------- Banco Ganadero: tarjeta de crédito ----------

function ganaderoTarjeta(tabla: Celda[][], archivo: string): ResultadoLectura {
  const avisos: string[] = [];
  const h = buscarFilaEncabezado(tabla, ['FECHA TRANS', 'DESCRIPCION', 'TIPO']);
  if (h < 0) throw new Error('No se reconoce el formato de tarjeta: no encontré las columnas FECHA TRANS., DESCRIPCIÓN y TIPO.');
  const enc = tabla[h];
  const iF = indice(enc, 'FECHA TRANS.', 'FECHA TRANS'), iD = indice(enc, 'DESCRIPCION'), iT = indice(enc, 'TIPO');
  const iBs = indice(enc, 'IMPORTE BOLIVIANOS'), iUsd = indice(enc, 'IMPORTE DOLARES');
  const iTr = indice(enc, 'IMPORTE TRANS.', 'IMPORTE TRANS'), iM = indice(enc, 'MONEDA');

  const cab = textoCompleto(tabla, h);
  const per = cab.match(/DEL\s+(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/i);
  const vto = cab.match(/VTO\.?\s*DE\s*PAGO\s*(\d{2}\/\d{2}\/\d{4})/i);
  const info: InfoExtracto = {
    archivo, desde: per ? aFecha(per[1]) : null, hasta: per ? aFecha(per[2]) : null,
    saldo_anterior: null, saldo_final: null, total_adeudado: null, pago_minimo: null,
    fecha_vencimiento: vto ? aFecha(vto[1]) : null, linea_credito: null,
  };
  for (let i = 0; i < h; i++) {
    const f = tabla[i] || [];
    const k = f.findIndex((c) => /L[IÍ]NEA DE CR[EÉ]DITO/i.test(txt(c)));
    if (k >= 0) info.linea_credito = aNumero(f.slice(k + 1).find((c) => aNumero(c) !== null));
  }

  const filas: FilaImportada[] = [];
  const vistos = new Map<string, number>();
  for (let i = h + 1; i < tabla.length; i++) {
    const f = tabla[i] || [];
    const linea = f.map(normal).join(' ');
    // Totales al pie
    const valorJunto = (etq: string) => {
      const k = f.findIndex((c) => normal(c).startsWith(etq));
      return k >= 0 ? aNumero(f.slice(k + 1).find((c) => aNumero(c) !== null)) : null;
    };
    if (linea.includes('TOTAL ADEUDADO')) { info.total_adeudado = valorJunto('TOTAL ADEUDADO'); continue; }
    if (linea.includes('PAGO MINIMO')) { info.pago_minimo = valorJunto('PAGO MINIMO'); continue; }
    if (linea.includes('SALDO DISPONIBLE')) continue;

    const fecha = aFecha(f[iF]);
    if (!fecha) continue;
    const desc = txt(f[iD]);
    const tipo = normal(f[iT]);
    const bs = aNumero(f[iBs]) || 0;
    const usd = iUsd >= 0 ? aNumero(f[iUsd]) || 0 : 0;
    if (bs === 0 && usd === 0) continue;
    const signo = tipo.startsWith('CRED') ? 1 : -1;   // DEBIT = consumo (sube la deuda)
    let moneda = normal(f[iM]) || 'BOB';
    if (moneda === 'BS') moneda = 'BOB';
    if (moneda === '$US' || moneda === 'US$') moneda = 'USD';
    const original = iTr >= 0 ? aNumero(f[iTr]) : null;
    const monto_bs = r2(signo * bs);
    const monto_usd = bs === 0 ? r2(signo * usd) : null;
    let base = `C:${fecha}:${desc}:${monto_bs || monto_usd}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    base += `#${n}`;
    filas.push({ fecha, hora: null, descripcion: desc, monto_bs, monto_usd, moneda,
      monto_original: original !== null ? r2(signo * original) : null, referencia: null, huella: base });
  }
  if (info.total_adeudado !== null) info.saldo_final = -info.total_adeudado;
  if (!filas.length) avisos.push('No se encontraron movimientos en el archivo.');
  return { info, filas, avisos };
}

export function leerExtracto(formato: string, tabla: Celda[][], archivo: string): ResultadoLectura {
  if (formato === 'ganadero_cuenta') return ganaderoCuenta(tabla, archivo);
  if (formato === 'ganadero_tarjeta') return ganaderoTarjeta(tabla, archivo);
  throw new Error('Esta cuenta no tiene un formato de importación configurado.');
}

/** Intenta adivinar el formato por el contenido (para avisar si eligió mal la cuenta). */
export function detectarFormato(tabla: Celda[][]): string | null {
  if (buscarFilaEncabezado(tabla, ['FECHA TRANS', 'DESCRIPCION', 'TIPO']) >= 0) return 'ganadero_tarjeta';
  if (buscarFilaEncabezado(tabla, ['FECHA', 'DESCRIPCION', 'DEBITO', 'CREDITO']) >= 0) return 'ganadero_cuenta';
  return null;
}
