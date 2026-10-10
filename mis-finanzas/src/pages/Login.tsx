import { FormEvent, useState } from 'react';
import { supabase, traducirError } from '../lib/supabase';
import { Boton, Campo, Entrada } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [modo, setModo] = useState<'entrar' | 'recuperar'>('entrar');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ t: string; error?: boolean } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setCargando(true); setMensaje(null);
    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
      if (error) setMensaje({ t: traducirError(error.message), error: true });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/restablecer` });
      setMensaje(error ? { t: traducirError(error.message), error: true } : { t: 'Le enviamos un correo con el enlace para crear una nueva contraseña.' });
    }
    setCargando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-900 via-marca-800 to-marca-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-14 w-14 rounded-2xl ring-4 ring-white/10" />
          <h1 className="text-2xl font-bold">Mis Finanzas</h1>
          <p className="mt-1 text-sm text-marca-200">Ingresos, gastos y presupuesto en un solo lugar</p>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold">{modo === 'entrar' ? 'Ingresar' : 'Recuperar contraseña'}</h2>
          <Campo etiqueta="Correo">
            <Entrada type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          {modo === 'entrar' && (
            <Campo etiqueta="Contraseña">
              <Entrada type="password" required autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </Campo>
          )}
          {mensaje && <p className={mensaje.error ? 'text-sm text-red-600' : 'text-sm text-marca-700'}>{mensaje.t}</p>}
          <Boton type="submit" cargando={cargando} className="w-full py-2.5">{modo === 'entrar' ? 'Ingresar' : 'Enviar enlace'}</Boton>
          <button type="button" onClick={() => { setModo(modo === 'entrar' ? 'recuperar' : 'entrar'); setMensaje(null); }}
            className="w-full text-center text-sm text-tinta-suave hover:text-tinta">
            {modo === 'entrar' ? '¿Olvidó su contraseña?' : 'Volver a ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
