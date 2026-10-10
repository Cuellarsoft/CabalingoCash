import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    APP_CONFIG?: { SUPABASE_URL?: string; SUPABASE_KEY?: string };
  }
}

const cfg = window.APP_CONFIG || {};
const url = (cfg.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (cfg.SUPABASE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const configurado = /^https:\/\/.+/.test(url) && !url.includes('SU-PROYECTO') && key.length > 20 && !key.includes('PEGUE_AQUI');

export const supabase: SupabaseClient = createClient(
  configurado ? url : 'https://sin-configurar.supabase.co',
  configurado ? key : 'sin-configurar-clave-publica',
);

/** Lanza un error legible si la consulta falló. */
export function revisar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(traducirError(r.error.message));
  return r.data as T;
}

export function traducirError(m: string): string {
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'El correo todavía no fue confirmado.';
  if (/row-level security/i.test(m)) return 'No tiene permiso para hacer esto o su suscripción no está vigente.';
  if (/duplicate key/i.test(m)) return 'Ya existe un registro con esos datos.';
  if (/Failed to fetch/i.test(m)) return 'No hay conexión con el servidor. Revise su internet.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espere unos minutos.';
  return m;
}

/** Trae todas las filas de una consulta (Supabase entrega de a 1000). */
export async function traerTodo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const res: T[] = [];
  const paso = 1000;
  for (let i = 0; i < 50; i++) {
    const r = await armar(i * paso, i * paso + paso - 1);
    const filas = revisar(r) || [];
    res.push(...filas);
    if (filas.length < paso) break;
  }
  return res;
}
