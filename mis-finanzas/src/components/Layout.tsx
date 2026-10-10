import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight, BarChart3, Bell, CreditCard, Home, LogOut, Menu, PiggyBank, Plus, Settings, Upload, X,
} from 'lucide-react';
import { useApp } from '../context/App';
import { supabase } from '../lib/supabase';
import { diasEntre, fechaCorta, hoy, numero } from '../lib/formato';
import FormMovimiento from './FormMovimiento';
import { cx } from './ui';

const MENU = [
  { a: '/', n: 'Inicio', i: Home },
  { a: '/movimientos', n: 'Movimientos', i: ArrowLeftRight },
  { a: '/importar', n: 'Importar extracto', i: Upload },
  { a: '/presupuesto', n: 'Presupuesto', i: PiggyBank },
  { a: '/tarjetas', n: 'Tarjetas', i: CreditCard },
  { a: '/recurrentes', n: 'Pagos recurrentes', i: Bell },
  { a: '/reportes', n: 'Reportes', i: BarChart3 },
  { a: '/configuracion', n: 'Configuración', i: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { perfil, moneda, setMoneda, tcHoy, activa, suscripcion, avisos, version } = useApp();
  const [nuevo, setNuevo] = useState(false);
  const [mas, setMas] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const loc = useLocation();

  useEffect(() => { setMas(false); }, [loc.pathname]);
  useEffect(() => {
    supabase.from('movimientos').select('id', { count: 'exact', head: true }).eq('estado', 'por_revisar')
      .then((r) => setPendientes(r.count || 0));
  }, [version, loc.pathname]);

  const tcViejo = tcHoy ? diasEntre(tcHoy.fecha, hoy()) > 3 : true;

  const enlace = (m: typeof MENU[number], compacto = false) => (
    <NavLink key={m.a} to={m.a} end={m.a === '/'}
      className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
        isActive ? 'bg-marca-700 text-white' : 'text-tinta-suave hover:bg-black/5 hover:text-tinta', compacto && 'py-3')}>
      <m.i className="h-[18px] w-[18px]" />
      <span className="flex-1">{m.n}</span>
      {m.a === '/movimientos' && pendientes > 0 && (
        <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">{pendientes}</span>
      )}
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-papel text-tinta">
      {/* Menú lateral (computadora y tablet) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-black/5 bg-white px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <div className="text-[15px] font-bold leading-tight">Mis Finanzas</div>
            <div className="text-[11px] text-tinta-tenue">{perfil?.nombre || perfil?.email}</div>
          </div>
        </div>
        <button onClick={() => setNuevo(true)}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-marca-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-marca-800">
          <Plus className="h-4 w-4" /> Registrar gasto
        </button>
        <nav className="flex flex-1 flex-col gap-0.5">{MENU.map((m) => enlace(m))}</nav>
        <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-tinta-suave hover:bg-black/5">
          <LogOut className="h-[18px] w-[18px]" /> Salir
        </button>
      </aside>

      <div className="lg:pl-60">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-black/5 bg-papel/90 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-bold">Mis Finanzas</span>
          </div>
          <div className="hidden text-xs text-tinta-suave lg:block">
            {tcHoy ? <>Dólar BCB: <b className="text-tinta">Bs {numero(Number(tcHoy.bs_por_usd))}</b> · {fechaCorta(tcHoy.fecha)}</> : 'Sin tipo de cambio'}
            {tcViejo && <span className="ml-2 text-amber-700">⚠ no se actualizó en los últimos días</span>}
          </div>
          <div className="inline-flex rounded-xl bg-black/5 p-0.5 text-xs font-semibold" role="group" aria-label="Moneda">
            {(['BOB', 'USD'] as const).map((m) => (
              <button key={m} onClick={() => setMoneda(m)}
                className={cx('rounded-lg px-3 py-1.5 transition', moneda === m ? 'bg-white text-tinta shadow-sm' : 'text-tinta-suave')}>
                {m === 'BOB' ? 'Bs' : '$us'}
              </button>
            ))}
          </div>
        </header>

        {!activa && (
          <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-6">
            Su suscripción está <b>{suscripcion?.estado}</b> (venció el {fechaCorta(suscripcion?.vence_el)}). Puede ver sus datos, pero no registrar ni importar.
          </div>
        )}

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Barra inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[MENU[0], MENU[1]].map((m) => (
          <NavLink key={m.a} to={m.a} end={m.a === '/'}
            className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-marca-700' : 'text-tinta-tenue')}>
            <m.i className="h-5 w-5" />{m.a === '/' ? 'Inicio' : 'Movimientos'}
            {m.a === '/movimientos' && pendientes > 0 && <span className="absolute right-4 top-1 h-2 w-2 rounded-full bg-amber-400" />}
          </NavLink>
        ))}
        <button onClick={() => setNuevo(true)} className="flex flex-col items-center justify-center" aria-label="Registrar gasto">
          <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-marca-700 text-white shadow-lg"><Plus className="h-6 w-6" /></span>
        </button>
        <NavLink to="/presupuesto" className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-marca-700' : 'text-tinta-tenue')}>
          <PiggyBank className="h-5 w-5" />Presupuesto
        </NavLink>
        <button onClick={() => setMas(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-tinta-tenue">
          <Menu className="h-5 w-5" />Más
        </button>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMas(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Menú</span>
              <button onClick={() => setMas(false)} className="p-1"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-2 rounded-xl bg-papel px-3 py-2 text-xs text-tinta-suave">
              {tcHoy ? <>Dólar BCB: <b className="text-tinta">Bs {numero(Number(tcHoy.bs_por_usd))}</b> · {fechaCorta(tcHoy.fecha)}</> : 'Sin tipo de cambio'}
            </div>
            <nav className="grid gap-0.5">{MENU.slice(2).map((m) => enlace(m, true))}</nav>
            <button onClick={() => supabase.auth.signOut()} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-tinta-suave hover:bg-black/5">
              <LogOut className="h-[18px] w-[18px]" /> Salir
            </button>
          </div>
        </div>
      )}

      <FormMovimiento abierto={nuevo} cerrar={() => setNuevo(false)} />

      {/* Avisos */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {avisos.map((a) => (
          <div key={a.id} className={cx('pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg',
            a.tipo === 'error' ? 'bg-red-600 text-white' : a.tipo === 'info' ? 'bg-slate-800 text-white' : 'bg-marca-800 text-white')}>
            {a.texto}
          </div>
        ))}
      </div>
    </div>
  );
}
