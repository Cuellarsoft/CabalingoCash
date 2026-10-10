import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { revisar, supabase } from '../lib/supabase';
import type { Categoria, Cuenta, Perfil, Suscripcion, TipoCambio } from '../lib/tipos';
import { convertir, dinero, hoy, Moneda } from '../lib/formato';

interface Aviso { id: number; texto: string; tipo: 'ok' | 'error' | 'info' }

interface Ctx {
  sesion: Session | null;
  cargando: boolean;
  listo: boolean;
  perfil: Perfil | null;
  suscripcion: Suscripcion | null;
  activa: boolean;
  cuentas: Cuenta[];
  categorias: Categoria[];
  tcHoy: TipoCambio | null;
  moneda: Moneda;
  setMoneda: (m: Moneda) => void;
  recargar: () => Promise<void>;
  /** Formatea un monto en Bs en la moneda elegida (tc = tipo de cambio de la fecha; por defecto el de hoy). */
  ver: (bs: number | null | undefined, tc?: number | null, opts?: { signo?: boolean; corto?: boolean }) => string;
  aUsd: (bs: number, tc?: number | null) => number;
  avisar: (texto: string, tipo?: Aviso['tipo']) => void;
  avisos: Aviso[];
  nombreCuenta: (id: string | null | undefined) => string;
  categoria: (id: string | null | undefined) => Categoria | undefined;
  version: number;
  tocar: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}

function leerMoneda(): Moneda {
  try { return localStorage.getItem('moneda') === 'USD' ? 'USD' : 'BOB'; } catch { return 'BOB'; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [listo, setListo] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tcHoy, setTcHoy] = useState<TipoCambio | null>(null);
  const [moneda, setMonedaState] = useState<Moneda>(leerMoneda());
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [version, setRV] = useState(0);

  const setMoneda = (m: Moneda) => {
    setMonedaState(m);
    try { localStorage.setItem('moneda', m); } catch { /* sin almacenamiento */ }
  };

  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 3500);
  }, []);

  const recargar = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return;
    try {
      const [p, cu, ca, tc] = await Promise.all([
        supabase.from('perfiles').select('*').eq('id', uid).maybeSingle(),
        supabase.from('cuentas').select('*').order('orden').order('nombre'),
        supabase.from('categorias').select('*').order('tipo', { ascending: false }).order('nombre'),
        supabase.from('tipos_cambio').select('*').lte('fecha', hoy()).order('fecha', { ascending: false }).limit(1).maybeSingle(),
      ]);
      let tcFila = revisar(tc) as TipoCambio | null;
      if (!tcFila) {   // si no hay valor hasta hoy, usa el más antiguo disponible
        const t2 = await supabase.from('tipos_cambio').select('*').order('fecha').limit(1).maybeSingle();
        tcFila = (t2.data as TipoCambio | null) || null;
      }
      const per = revisar(p) as Perfil | null;
      setPerfil(per);
      setCuentas((revisar(cu) as Cuenta[]) || []);
      setCategorias((revisar(ca) as Categoria[]) || []);
      setTcHoy(tcFila);
      if (per) {
        const su = await supabase.from('suscripciones').select('*').eq('hogar_id', per.hogar_id).maybeSingle();
        setSuscripcion((revisar(su) as Suscripcion | null) || null);
      }
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setListo(true);
    }
  }, [avisar]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSesion(data.session);
      if (data.session) await recargar();
      setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (evento === 'PASSWORD_RECOVERY') window.location.assign('/restablecer');
      // Las consultas se hacen fuera del aviso de sesión (recomendación de Supabase)
      if (evento === 'SIGNED_IN') setTimeout(() => { recargar(); }, 0);
      if (evento === 'SIGNED_OUT') { setPerfil(null); setCuentas([]); setCategorias([]); setListo(false); }
    });
    return () => data.subscription.unsubscribe();
  }, [recargar]);

  const activa = useMemo(() => {
    if (!suscripcion) return true;
    return ['prueba', 'activa'].includes(suscripcion.estado) && suscripcion.vence_el >= hoy();
  }, [suscripcion]);

  const tcBase = tcHoy?.bs_por_usd ? Number(tcHoy.bs_por_usd) : null;

  const ver: Ctx['ver'] = (bs, tc, opts) => {
    if (bs === null || bs === undefined) return '—';
    return dinero(convertir(Number(bs), moneda, tc ? Number(tc) : tcBase), moneda, opts);
  };
  const aUsd = (bs: number, tc?: number | null) => convertir(bs, 'USD', tc ? Number(tc) : tcBase);

  const mapaCuentas = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);
  const mapaCat = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  const valor: Ctx = {
    sesion, cargando, listo, perfil, suscripcion, activa, cuentas, categorias, tcHoy, moneda, setMoneda,
    recargar, ver, aUsd, avisar, avisos,
    nombreCuenta: (id) => (id ? mapaCuentas.get(id)?.nombre || '—' : '—'),
    categoria: (id) => (id ? mapaCat.get(id) : undefined),
    version, tocar: () => setRV((v) => v + 1),
  };
  return <AppCtx.Provider value={valor}>{children}</AppCtx.Provider>;
}
