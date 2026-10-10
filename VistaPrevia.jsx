// =====================================================================
//  MIS FINANZAS — Vista previa visual (datos de ejemplo, no se conecta a nada)
//  Sirve para ver y comentar el diseño. La aplicación real está en /src.
// =====================================================================
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import {
  Home, ArrowLeftRight, Upload, PiggyBank, CreditCard, Bell, BarChart3, Settings, Plus, Menu, X,
  TrendingDown, TrendingUp, Inbox, AlertTriangle, Sparkles, Check, Search, CheckCircle2,
} from 'lucide-react';

const C = { marca: '#136351', marcaOsc: '#124f42', marcaClaro: '#effaf6', marcaMedio: '#259a79', tinta: '#0f1f1b', suave: '#4b5b57', tenue: '#8a9894', papel: '#f6f7f4' };
const TC = 11.73;

const CATS = [
  { id: 'super', n: 'Supermercado', c: '#16a34a', p: 2500 },
  { id: 'comidas', n: 'Comidas fuera', c: '#ea580c', p: 800 },
  { id: 'edu', n: 'Educación', c: '#2563eb', p: 4000 },
  { id: 'dom', n: 'Personal doméstico', c: '#7c3aed', p: 3000 },
  { id: 'serv', n: 'Servicios básicos', c: '#0891b2', p: 700 },
  { id: 'subs', n: 'Suscripciones digitales', c: '#db2777', p: 250 },
  { id: 'trans', n: 'Transporte', c: '#ca8a04', p: 600 },
  { id: 'salud', n: 'Salud y farmacia', c: '#dc2626', p: 300 },
  { id: 'int', n: 'Intereses y comisiones', c: '#b91c1c', p: 200 },
  { id: 'seg', n: 'Seguros', c: '#0d9488', p: 100 },
];
const cat = (id) => CATS.find((x) => x.id === id);

const MOVS0 = [
  { id: 1, f: '25/09', d: 'TRANSF. QR ACH BANCO ECONOMICO HIPERMAXI SA', cta: 'Caja de ahorro', m: -292.11, cat: 'super' },
  { id: 2, f: '24/09', d: 'POS CAFE CENTRAL SCZ Tarj: 0000', cta: 'Caja de ahorro', m: -48.0, cat: null },
  { id: 3, f: '23/09', d: 'NETFLIX.COM', cta: 'Tarjeta Visa', m: -109.03, cat: 'subs' },
  { id: 4, f: '22/09', d: 'UBR* PENDING.UBER.COM (EUR 18,93)', cta: 'Tarjeta Visa', m: -258.34, cat: 'trans' },
  { id: 5, f: '21/09', d: 'Cobro Tarjetas Visa …5016', cta: 'Caja de ahorro', m: -3000, tras: 'Tarjeta Visa' },
  { id: 6, f: '21/09', d: 'INTERES DE FINANCIAMIENTO', cta: 'Tarjeta Visa', m: -545.69, cat: 'int' },
  { id: 7, f: '18/09', d: 'Transferencia a 1310000000. FARMACIA SAN JOSE', cta: 'Caja de ahorro', m: -151.2, cat: null },
  { id: 8, f: '15/09', d: 'GMV - Transf. EMPRESA S.R.L. SUELDO', cta: 'Caja de ahorro', m: 12500, cat: 'ing' },
  { id: 9, f: '12/09', d: 'TRANSF. QR ACH JARDIN INFANTIL ARCO IRIS Mensualidades', cta: 'Caja de ahorro', m: -3100, cat: 'edu' },
  { id: 10, f: '10/09', d: 'Retiro ATM', cta: 'Caja de ahorro', m: -1000, tras: 'Efectivo' },
  { id: 11, f: '08/09', d: 'Gasolina', cta: 'Efectivo', m: -250, cat: 'trans' },
  { id: 12, f: '05/09', d: 'Pago CRE luz', cta: 'Caja de ahorro', m: -412.5, cat: 'serv' },
];

const EVOL = [
  { n: 'Abr', i: 12500, g: 10120 }, { n: 'May', i: 12500, g: 11890 }, { n: 'Jun', i: 13100, g: 9870 },
  { n: 'Jul', i: 12500, g: 12740 }, { n: 'Ago', i: 12500, g: 10950 }, { n: 'Sep', i: 12500, g: 9230 },
];

const nf = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Barra({ v, max, alto = 8 }) {
  const pct = max > 0 ? (v / max) * 100 : v > 0 ? 101 : 0;
  const color = pct > 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : C.marcaMedio;
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height: alto, background: 'rgba(0,0,0,.06)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}
function Card({ titulo, accion, children, className = '' }) {
  return (
    <section className={'rounded-2xl border border-black/5 bg-white shadow-sm ' + className}>
      {titulo && <header className="flex items-center justify-between px-5 pt-4"><h2 className="text-sm font-semibold" style={{ color: C.tinta }}>{titulo}</h2>{accion}</header>}
      <div className="p-5">{children}</div>
    </section>
  );
}
function Chip({ children, tono = 'gris' }) {
  const t = { gris: ['#f1f5f9', '#334155'], verde: ['#d8f3e8', '#124f42'], ambar: ['#fef3c7', '#92400e'], rojo: ['#fee2e2', '#b91c1c'], azul: ['#e0f2fe', '#075985'] }[tono];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: t[0], color: t[1] }}>{children}</span>;
}
function Kpi({ e, v, d, icono: I, tono }) {
  const borde = tono === 'peligro' ? '#fecaca' : tono === 'alerta' ? '#fde68a' : 'rgba(0,0,0,.05)';
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: borde }}>
      <div className="flex items-center justify-between text-xs font-medium" style={{ color: C.suave }}><span>{e}</span>{I && <I size={16} />}</div>
      <div className="mt-1.5 text-xl font-semibold" style={{ color: C.tinta }}>{v}</div>
      {d && <div className="mt-1 text-xs" style={{ color: C.suave }}>{d}</div>}
    </div>
  );
}

export default function VistaPrevia() {
  const [pag, setPag] = useState('inicio');
  const [usd, setUsd] = useState(false);
  const [modal, setModal] = useState(false);
  const [mas, setMas] = useState(false);
  const [movs, setMovs] = useState(MOVS0);
  const [sug, setSug] = useState(null);

  const $ = (bs, opts = {}) => {
    const v = usd ? bs / TC : bs;
    const s = (v < 0 ? '−' : opts.signo && v > 0 ? '+' : '') + (usd ? '$us ' : 'Bs ') + nf.format(Math.abs(v));
    return s;
  };

  const gastoCat = useMemo(() => {
    const m = {};
    movs.forEach((x) => { if (x.cat && x.cat !== 'ing' && !x.tras) m[x.cat] = (m[x.cat] || 0) - x.m; });
    m.dom = (m.dom || 0) + 2800; m.super = (m.super || 0) + 1180; m.comidas = (m.comidas || 0) + 512; m.salud = (m.salud || 0) + 96; m.seg = (m.seg || 0) + 89.75;
    return m;
  }, [movs]);
  const totalPres = CATS.reduce((a, c) => a + c.p, 0);
  const totalGasto = Object.values(gastoCat).reduce((a, v) => a + v, 0);
  const pendientes = movs.filter((m) => !m.cat && !m.tras).length;

  const MENU = [
    ['inicio', 'Inicio', Home], ['movimientos', 'Movimientos', ArrowLeftRight], ['importar', 'Importar extracto', Upload],
    ['presupuesto', 'Presupuesto', PiggyBank], ['tarjetas', 'Tarjetas', CreditCard], ['recurrentes', 'Pagos recurrentes', Bell],
    ['reportes', 'Reportes', BarChart3], ['config', 'Configuración', Settings],
  ];

  const clasificar = (id, c) => {
    const m = movs.find((x) => x.id === id);
    setMovs(movs.map((x) => (x.id === id ? { ...x, cat: c } : x)));
    if (c) setSug({ texto: m.d.split(' ').slice(m.d.startsWith('POS') ? 1 : 3, m.d.startsWith('POS') ? 3 : 5).join(' '), cat: c });
  };

  // ---------------------------------------------------------------- páginas
  const Inicio = (
    <>
      <Titulo t="Inicio" s="Cómo va el mes">
        <div className="inline-flex items-center rounded-xl border border-black/10 bg-white text-sm"><span className="px-3 py-2">‹</span><span className="px-2 font-medium">Septiembre 2026</span><span className="px-3 py-2">›</span></div>
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi e="Gastado vs. presupuesto" icono={TrendingDown} v={$(totalGasto)} d={<><Barra v={totalGasto} max={totalPres} /><span className="mt-1 block">de {$(totalPres)} · {Math.round((totalGasto / totalPres) * 100)} %</span></>} />
        <Kpi e="Ingresos del mes" icono={TrendingUp} v={$(12500)} d="Sin contar traspasos" />
        <Kpi e="Deuda en tarjetas" icono={CreditCard} v={$(32047.13)} tono="alerta" d="92 % de la línea" />
        <Kpi e="Por revisar" icono={Inbox} v={pendientes} tono={pendientes ? 'alerta' : ''} d={pendientes ? <button className="underline" style={{ color: C.marca }} onClick={() => setPag('movimientos')}>Clasificar ahora</button> : 'Todo clasificado ✔'} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card titulo="Gastado vs. presupuesto por categoría" accion={<button className="text-sm" style={{ color: C.marca }} onClick={() => setPag('presupuesto')}>Editar</button>}>
          <ul className="space-y-3.5">
            {[...CATS].sort((a, b) => (gastoCat[b.id] || 0) / b.p - (gastoCat[a.id] || 0) / a.p).map((c) => (
              <li key={c.id}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.c }} />{c.n}</span>
                  <span><b>{$(gastoCat[c.id] || 0)}</b><span style={{ color: C.tenue }}> / {$(c.p)}</span></span>
                </div>
                <Barra v={gastoCat[c.id] || 0} max={c.p} />
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card titulo="Próximos vencimientos">
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between"><span className="flex items-center gap-2"><CreditCard size={16} color={C.tenue} />Tarjeta Visa</span><span className="text-right"><span className="block">mín. {$(1307.3)}</span><Chip tono="ambar">vence 10/11</Chip></span></li>
              <li className="flex justify-between"><span className="flex items-center gap-2"><Bell size={16} color={C.tenue} />Jardín infantil</span><span className="text-right"><span className="block">{$(3100)}</span><Chip tono="ambar">vence 01/10</Chip></span></li>
              <li className="flex justify-between"><span className="flex items-center gap-2"><Bell size={16} color={C.tenue} />Seguro del auto</span><span className="text-right"><span className="block">{$(2400)}</span><Chip tono="rojo">venció 22/09</Chip></span></li>
            </ul>
          </Card>
          <Card titulo="Saldos">
            <ul className="space-y-2 text-sm">
              {[['Caja de ahorro Ganadero', 7983.42], ['Cuenta Ganadero 1079', 1250], ['Efectivo', 750]].map(([n, v]) => <li key={n} className="flex justify-between"><span style={{ color: C.suave }}>{n}</span><b>{$(v)}</b></li>)}
              <li className="flex justify-between"><span style={{ color: C.suave }}>Tarjeta Visa …5016</span><b className="text-red-700">debe {$(32047.13)}</b></li>
              <li className="flex justify-between"><span style={{ color: C.suave }}>Otra tarjeta</span><b className="text-red-700">debe {$(1000)}</b></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );

  const Movimientos = (
    <>
      <Titulo t="Movimientos" s="Elija la categoría de lo que esté en amarillo; el sistema aprende." />
      {sug && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3 text-sm" style={{ borderColor: '#b3e6d3', background: C.marcaClaro }}>
          <Sparkles size={16} color={C.marca} /> ¿Recordar? Siempre que contenga
          <input value={sug.texto} onChange={(e) => setSug({ ...sug, texto: e.target.value })} className="w-44 rounded-lg border border-black/10 px-2 py-1" />
          → <b>{cat(sug.cat)?.n}</b>
          <button onClick={() => setSug(null)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-white" style={{ background: C.marca }}><Check size={14} />Crear regla</button>
          <button onClick={() => setSug(null)} className="px-2" style={{ color: C.suave }}>No</button>
        </div>
      )}
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" style={{ color: C.tenue }}><Search size={16} />Buscar en la descripción…</div>
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        {movs.map((m) => {
          const pend = !m.cat && !m.tras;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-3 last:border-0" style={{ background: pend ? '#fffbeb' : undefined }}>
              <span className="w-12 text-xs" style={{ color: C.suave }}>{m.f}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{m.d}</div>
                <div className="text-xs" style={{ color: C.tenue }}>{m.cta}</div>
              </div>
              {m.tras ? <Chip tono="azul"><ArrowLeftRight size={12} />Traspaso · {m.tras}</Chip> : m.cat === 'ing' ? <Chip tono="verde">Sueldo</Chip> : (
                <select value={m.cat || ''} onChange={(e) => clasificar(m.id, e.target.value)} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: pend ? '#fcd34d' : 'transparent', background: pend ? '#fef3c7' : 'transparent' }}>
                  <option value="">— Elegir categoría —</option>
                  {CATS.map((c) => <option key={c.id} value={c.id}>{c.n}</option>)}
                </select>
              )}
              <span className="w-28 text-right text-sm font-medium" style={{ color: m.tras ? C.tenue : m.m > 0 ? C.marca : C.tinta }}>{$(m.m, { signo: true })}</span>
            </div>
          );
        })}
      </div>
    </>
  );

  const Importar = (
    <>
      <Titulo t="Importar extracto" s="Cargue el Excel que descarga de la banca por internet." />
      <Card>
        <label className="mb-1 block text-xs font-medium" style={{ color: C.suave }}>1. ¿De qué cuenta o tarjeta es el extracto?</label>
        <select className="mb-4 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"><option>Caja de ahorro Ganadero 2145</option><option>Tarjeta Ganadero …5016</option></select>
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-black/10 py-10 text-sm"><Upload color={C.marcaMedio} /><b>Toque para elegir el archivo</b><span style={{ color: C.tenue }}>.xlsx o .xls</span></div>
      </Card>
      <Card className="mt-5">
        <div className="flex gap-3"><CheckCircle2 color={C.marcaMedio} /><div className="flex-1">
          <p className="font-semibold">Importación terminada</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[['Nuevos', 90], ['Ya existían', 0], ['Clasificados solos', 21], ['Por revisar', 69]].map(([e, v]) => <div key={e} className="rounded-xl px-3 py-2" style={{ background: C.papel }}><div className="text-xs" style={{ color: C.suave }}>{e}</div><b>{v}</b></div>)}
          </div>
          <p className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: C.marcaClaro, color: C.marcaOsc }}><CheckCircle2 size={16} />El saldo cuadra con el banco (Bs 7.983,42).</p>
        </div></div>
      </Card>
    </>
  );

  const Presupuesto = (
    <>
      <Titulo t="Presupuesto" s="Cuánto quiere gastar en cada categoría este mes (en Bs)." />
      <Card className="mb-5">
        <div className="text-xs" style={{ color: C.suave }}>Gastado del presupuesto</div>
        <div className="text-2xl font-bold">{$(totalGasto)} <span className="text-base font-medium" style={{ color: C.tenue }}>de {$(totalPres)}</span></div>
        <div className="mt-3"><Barra v={totalGasto} max={totalPres} alto={12} /></div>
      </Card>
      <Card titulo="Por categoría">
        {CATS.map((c) => {
          const g = gastoCat[c.id] || 0; const pct = Math.round((g / c.p) * 100);
          return (
            <div key={c.id} className="border-b border-black/5 py-3 last:border-0">
              <div className="mb-1.5 grid grid-cols-[1fr_7rem_auto] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.c }} />{c.n}</span>
                <input defaultValue={c.p} className="rounded-lg border border-black/10 px-2 py-1 text-right" />
                <Chip tono={pct > 100 ? 'rojo' : pct >= 80 ? 'ambar' : 'verde'}>{pct} %</Chip>
              </div>
              <Barra v={g} max={c.p} alto={6} />
            </div>
          );
        })}
      </Card>
    </>
  );

  const Tarjetas = (
    <>
      <Titulo t="Tarjetas de crédito" s="Deuda, pago mínimo, vencimientos e intereses." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Tarjeta Visa …5016" accion={<Chip tono="azul">Se importa</Chip>}>
          <div className="flex items-end justify-between"><div><div className="text-xs" style={{ color: C.suave }}>Deuda actual</div><div className="text-2xl font-bold">{$(32047.13)}</div></div>
            <div className="text-right text-sm" style={{ color: C.suave }}>Línea {$(35000)}<br />Disponible <b style={{ color: C.tinta }}>{$(2952.87)}</b></div></div>
          <div className="mt-3"><Barra v={32047} max={35000} alto={10} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl px-3 py-2" style={{ background: C.papel }}><div className="text-xs" style={{ color: C.suave }}>Pago mínimo</div><b>{$(1307.3)}</b></div>
            <div className="rounded-xl px-3 py-2" style={{ background: C.papel }}><div className="text-xs" style={{ color: C.suave }}>Vencimiento</div><b>10/11/2026</b></div>
          </div>
          <p className="mt-4 text-sm">Intereses y comisiones del mes: <b className="text-red-700">{$(705.69)}</b></p>
        </Card>
        <Card titulo="Otra tarjeta de crédito" accion={<Chip>Manual</Chip>}>
          <div className="text-xs" style={{ color: C.suave }}>Deuda actual</div><div className="text-2xl font-bold">{$(1000)}</div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {['+ Consumo', 'Pago', 'Ajustar deuda'].map((b) => <button key={b} className="rounded-xl border border-black/10 px-3 py-1.5">{b}</button>)}
          </div>
        </Card>
      </div>
    </>
  );

  const Reportes = (
    <>
      <Titulo t="Reportes" s="Montos sin traspasos entre sus cuentas." />
      <Card titulo="Ingresos y gastos por mes">
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={EVOL.map((e) => ({ ...e, i: usd ? e.i / TC : e.i, g: usd ? e.g / TC : e.g }))}>
              <CartesianGrid vertical={false} stroke="#eef0ee" />
              <XAxis dataKey="n" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} />
              <Tooltip formatter={(v) => (usd ? '$us ' : 'Bs ') + nf.format(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="i" name="Ingresos" fill={C.marcaMedio} radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="g" name="Gastos" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card titulo="Gasto por categoría" className="mt-5">
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={CATS.map((c) => ({ n: c.n, v: (gastoCat[c.id] || 0) / (usd ? TC : 1), c: c.c })).sort((a, b) => b.v - a.v)}>
              <XAxis type="number" hide /><YAxis type="category" dataKey="n" width={150} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => (usd ? '$us ' : 'Bs ') + nf.format(v)} />
              <Bar dataKey="v" name="Gasto" radius={[0, 6, 6, 0]} maxBarSize={18}>{CATS.map((c) => <Cell key={c.id} fill={c.c} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );

  const Simple = (t, s) => <><Titulo t={t} s={s} /><Card><p className="text-sm" style={{ color: C.suave }}>Pantalla incluida en la aplicación real.</p></Card></>;
  const paginas = { inicio: Inicio, movimientos: Movimientos, importar: Importar, presupuesto: Presupuesto, tarjetas: Tarjetas, reportes: Reportes,
    recurrentes: Simple('Pagos recurrentes', 'Colegio, servicios, seguros… con aviso previo.'), config: Simple('Configuración', 'Cuentas, categorías, reglas, tipo de cambio y su usuario.') };

  return (
    <div className="min-h-screen text-[15px]" style={{ background: C.papel, color: C.tinta, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-black/5 bg-white px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2"><Logo /><div><div className="font-bold">Mis Finanzas</div><div className="text-xs" style={{ color: C.tenue }}>Vista previa</div></div></div>
        <button onClick={() => setModal(true)} className="mb-4 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white" style={{ background: C.marca }}><Plus size={16} />Registrar gasto</button>
        {MENU.map(([id, n, I]) => (
          <button key={id} onClick={() => setPag(id)} className="mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium"
            style={pag === id ? { background: C.marca, color: '#fff' } : { color: C.suave }}>
            <I size={18} /><span className="flex-1">{n}</span>
            {id === 'movimientos' && pendientes > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold">{pendientes}</span>}
          </button>
        ))}
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 px-4 py-2.5 backdrop-blur sm:px-6" style={{ background: 'rgba(246,247,244,.9)' }}>
          <div className="flex items-center gap-2 lg:hidden"><Logo /><b>Mis Finanzas</b></div>
          <div className="hidden text-xs lg:block" style={{ color: C.suave }}>Dólar BCB: <b style={{ color: C.tinta }}>Bs {nf.format(TC)}</b> · 10/10/2026</div>
          <div className="inline-flex rounded-xl p-0.5 text-xs font-semibold" style={{ background: 'rgba(0,0,0,.05)' }}>
            {[['Bs', false], ['$us', true]].map(([n, v]) => <button key={n} onClick={() => setUsd(v)} className="rounded-lg px-3 py-1.5" style={usd === v ? { background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.1)' } : { color: C.suave }}>{n}</button>)}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{paginas[pag]}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-black/10 bg-white lg:hidden">
        {[['inicio', 'Inicio', Home], ['movimientos', 'Movimientos', ArrowLeftRight]].map(([id, n, I]) => (
          <button key={id} onClick={() => setPag(id)} className="flex flex-col items-center gap-0.5 py-2 text-xs font-medium" style={{ color: pag === id ? C.marca : C.tenue }}><I size={20} />{n}</button>
        ))}
        <button onClick={() => setModal(true)} className="flex justify-center"><span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg" style={{ background: C.marca }}><Plus /></span></button>
        <button onClick={() => setPag('presupuesto')} className="flex flex-col items-center gap-0.5 py-2 text-xs font-medium" style={{ color: pag === 'presupuesto' ? C.marca : C.tenue }}><PiggyBank size={20} />Presupuesto</button>
        <button onClick={() => setMas(true)} className="flex flex-col items-center gap-0.5 py-2 text-xs font-medium" style={{ color: C.tenue }}><Menu size={20} />Más</button>
      </nav>
      {mas && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMas(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            {MENU.slice(2).map(([id, n, I]) => <button key={id} onClick={() => { setPag(id); setMas(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm" style={{ color: C.suave }}><I size={18} />{n}</button>)}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-lg rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4"><b>Nuevo movimiento</b><button onClick={() => setModal(false)}><X size={20} /></button></div>
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="inline-flex gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,.05)' }}>{['Gasto', 'Ingreso', 'Traspaso'].map((t, i) => <span key={t} className="rounded-lg px-3 py-1.5 font-medium" style={i === 0 ? { background: '#fff' } : { color: C.suave }}>{t}</span>)}</div>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Campo e="Monto"><input placeholder="0,00" className="w-full rounded-xl border border-black/10 px-3 py-2 text-lg font-semibold" /></Campo><Campo e="Moneda"><select className="rounded-xl border border-black/10 px-3 py-2.5"><option>Bs</option><option>$us</option></select></Campo></div>
              <div className="grid grid-cols-2 gap-2"><Campo e="Fecha"><input type="date" defaultValue="2026-09-25" className="w-full rounded-xl border border-black/10 px-3 py-2" /></Campo><Campo e="Cuenta o tarjeta"><select className="w-full rounded-xl border border-black/10 px-3 py-2.5"><option>Efectivo</option><option>Otra tarjeta</option></select></Campo></div>
              <Campo e="Categoría"><select className="w-full rounded-xl border border-black/10 px-3 py-2.5">{CATS.map((c) => <option key={c.id}>{c.n}</option>)}</select></Campo>
              <Campo e="Descripción"><input placeholder="Ej.: Hipermaxi, almuerzo, gasolina…" className="w-full rounded-xl border border-black/10 px-3 py-2" /></Campo>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3"><button onClick={() => setModal(false)} className="rounded-xl border border-black/10 px-4 py-2 text-sm">Cancelar</button><button onClick={() => setModal(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-white" style={{ background: C.marca }}>Guardar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Titulo({ t, s, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">{t}</h1>{s && <p className="mt-0.5 text-sm" style={{ color: C.suave }}>{s}</p>}</div>
      {children}
    </div>
  );
}
function Campo({ e, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium" style={{ color: C.suave }}>{e}</span>{children}</label>;
}
function Logo() {
  return (
    <svg viewBox="0 0 64 64" width="30" height="30"><rect width="64" height="64" rx="14" fill={C.marca} />
      <path d="M18 42 L28 30 L36 37 L47 22" stroke="#b3e6d3" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}
