import type { Celda } from './importadores';

/** Lee la primera hoja de un archivo Excel (.xlsx o .xls) como tabla. */
export async function leerExcel(archivo: File): Promise<Celda[][]> {
  const XLSX = await import('xlsx');
  const buf = await archivo.arrayBuffer();
  const libro = XLSX.read(buf, { type: 'array', cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null }) as Celda[][];
}

/** Descarga un Excel con una o varias hojas. */
export async function descargarExcel(nombre: string, hojas: { nombre: string; filas: Record<string, unknown>[] }[]) {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  for (const h of hojas) {
    const hoja = XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ '': 'Sin datos' }]);
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31));
  }
  XLSX.writeFile(libro, nombre);
}
