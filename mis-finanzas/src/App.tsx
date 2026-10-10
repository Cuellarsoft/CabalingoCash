import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './context/App';
import { configurado } from './lib/supabase';
import Layout from './components/Layout';
import { Cargando } from './components/ui';
import Login from './pages/Login';
import Restablecer from './pages/Restablecer';
import Inicio from './pages/Inicio';
import Movimientos from './pages/Movimientos';
import Importar from './pages/Importar';
import Presupuesto from './pages/Presupuesto';
import Tarjetas from './pages/Tarjetas';
import Recurrentes from './pages/Recurrentes';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';

export default function App() {
  const { sesion, cargando, perfil, listo } = useApp();

  if (!configurado) return <SinConfigurar />;
  if (cargando) return <Cargando texto="Abriendo…" />;

  return (
    <Routes>
      <Route path="/restablecer" element={<Restablecer />} />
      {!sesion ? (
        <Route path="*" element={<Login />} />
      ) : !listo ? (
        <Route path="*" element={<Cargando texto="Abriendo…" />} />
      ) : !perfil ? (
        <Route path="*" element={<SinPerfil />} />
      ) : (
        <Route path="*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Inicio />} />
              <Route path="/movimientos" element={<Movimientos />} />
              <Route path="/importar" element={<Importar />} />
              <Route path="/presupuesto" element={<Presupuesto />} />
              <Route path="/tarjetas" element={<Tarjetas />} />
              <Route path="/recurrentes" element={<Recurrentes />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        } />
      )}
    </Routes>
  );
}

function SinConfigurar() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-bold">Falta conectar con Supabase</h1>
      <p className="mt-2 text-sm text-tinta-suave">
        Abra el archivo <code className="rounded bg-black/5 px-1">public/config.js</code> y pegue la <b>Project URL</b> y la
        <b> Publishable key</b> de su proyecto de Supabase. Luego vuelva a publicar.
      </p>
    </div>
  );
}

function SinPerfil() {
  const { recargar } = useApp();
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-bold">Su usuario todavía no tiene datos</h1>
      <p className="mt-2 text-sm text-tinta-suave">
        Ejecute en Supabase el script <b>01_estructura.sql</b> y luego <b>02_administrador.sql</b>. Después toque el botón.
      </p>
      <button onClick={() => recargar()} className="mt-4 rounded-xl bg-marca-700 px-4 py-2 text-sm font-medium text-white">Volver a intentar</button>
    </div>
  );
}
