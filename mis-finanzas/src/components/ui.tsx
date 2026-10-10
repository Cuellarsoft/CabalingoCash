import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Tarjeta({ children, className, titulo, accion }: { children: ReactNode; className?: string; titulo?: ReactNode; accion?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-black/5 bg-white shadow-tarjeta', className)}>
      {(titulo || accion) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <h2 className="text-[15px] font-semibold text-tinta">{titulo}</h2>
          {accion}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
export function Boton({ variante = 'primario', cargando, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  const estilos: Record<Variante, string> = {
    primario: 'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-marca-700/50',
    secundario: 'bg-white text-tinta border border-black/10 hover:bg-papel',
    fantasma: 'text-tinta-suave hover:bg-black/5',
    peligro: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button
      {...p}
      disabled={p.disabled || cargando}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed', estilos[variante], className)}
    >
      {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Campo({ etiqueta, ayuda, children, className }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-tinta-suave">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-tinta-tenue">{ayuda}</span>}
    </label>
  );
}

const baseInput = 'w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20 disabled:bg-papel';

// Si se indica un ancho propio (w-…), no se fuerza el ancho completo
const base = (c?: string) => (/(^|\s)w-/.test(c || '') ? baseInput.replace('w-full ', '') : baseInput);

export function Entrada(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(base(p.className), p.className)} />;
}

export function Selector({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(base(p.className), 'pr-8', p.className)}>{children}</select>;
}

export function Modal({ abierto, cerrar, titulo, children, pie, ancho = 'max-w-lg' }: { abierto: boolean; cerrar: () => void; titulo: string; children: ReactNode; pie?: ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [abierto, cerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={cerrar}>
      <div className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', ancho)} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <h3 className="text-base font-semibold text-tinta">{titulo}</h3>
          <button onClick={cerrar} className="rounded-lg p-1 text-tinta-tenue hover:bg-black/5" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pie && <footer className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">{pie}</footer>}
      </div>
    </div>
  );
}

export function Etiqueta({ children, color = 'gris' }: { children: ReactNode; color?: 'gris' | 'verde' | 'ambar' | 'rojo' | 'azul' }) {
  const c = {
    gris: 'bg-slate-100 text-slate-700', verde: 'bg-marca-100 text-marca-800', ambar: 'bg-amber-100 text-amber-800',
    rojo: 'bg-red-100 text-red-700', azul: 'bg-sky-100 text-sky-800',
  }[color];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', c)}>{children}</span>;
}

export function PuntoColor({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

/** Barra de avance con semáforo: verde < 80 %, ámbar 80–100 %, rojo > 100 %. */
export function Barra({ valor, maximo, alto = 'h-2' }: { valor: number; maximo: number; alto?: string }) {
  const pct = maximo > 0 ? (valor / maximo) * 100 : valor > 0 ? 101 : 0;
  const color = pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-marca-500';
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-black/[.06]', alto)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function colorSemaforo(valor: number, maximo: number): 'verde' | 'ambar' | 'rojo' {
  const pct = maximo > 0 ? (valor / maximo) * 100 : valor > 0 ? 101 : 0;
  return pct > 100 ? 'rojo' : pct >= 80 ? 'ambar' : 'verde';
}

export function Vacio({ icono, titulo, texto, accion }: { icono?: ReactNode; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      {icono && <div className="mb-3 text-tinta-tenue">{icono}</div>}
      <p className="font-medium text-tinta">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-tinta-suave">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-tinta-suave">
      <Loader2 className="h-4 w-4 animate-spin" /> {texto}
    </div>
  );
}

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-tinta sm:text-2xl">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-tinta-suave">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Indicador({ etiqueta, valor, detalle, icono, tono = 'normal' }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; icono?: ReactNode; tono?: 'normal' | 'alerta' | 'peligro' }) {
  return (
    <div className={cx('rounded-2xl border bg-white p-4 shadow-tarjeta',
      tono === 'peligro' ? 'border-red-200' : tono === 'alerta' ? 'border-amber-200' : 'border-black/5')}>
      <div className="flex items-center justify-between text-xs font-medium text-tinta-suave">
        <span>{etiqueta}</span>
        {icono}
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular-nums text-tinta sm:text-xl">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-tinta-suave">{detalle}</div>}
    </div>
  );
}

/** Selector de mes con flechas. */
export function SelectorMes({ mes, cambiar, nombre }: { mes: string; cambiar: (m: string) => void; nombre: string }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-black/10 bg-white">
      <button className="px-3 py-2 text-tinta-suave hover:text-tinta" onClick={() => cambiar(sumar(mes, -1))} aria-label="Mes anterior">‹</button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize">{nombre}</span>
      <button className="px-3 py-2 text-tinta-suave hover:text-tinta" onClick={() => cambiar(sumar(mes, 1))} aria-label="Mes siguiente">›</button>
    </div>
  );
}
function sumar(mes: string, n: number) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function Pestanas<T extends string>({ valor, cambiar, opciones }: { valor: T; cambiar: (v: T) => void; opciones: { id: T; nombre: string }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-black/5 p-1">
      {opciones.map((o) => (
        <button key={o.id} onClick={() => cambiar(o.id)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-medium transition', valor === o.id ? 'bg-white text-tinta shadow-sm' : 'text-tinta-suave hover:text-tinta')}>
          {o.nombre}
        </button>
      ))}
    </div>
  );
}
