import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, traducirError } from '../lib/supabase';
import { Boton, Campo, Entrada, Tarjeta } from '../components/ui';

export default function Restablecer() {
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const nav = useNavigate();

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (clave.length < 8) return setError('Use al menos 8 caracteres.');
    if (clave !== clave2) return setError('Las contraseñas no coinciden.');
    setCargando(true);
    const { error } = await supabase.auth.updateUser({ password: clave });
    setCargando(false);
    if (error) return setError(traducirError(error.message));
    nav('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel px-4">
      <Tarjeta className="w-full max-w-sm" titulo="Crear nueva contraseña">
        <form onSubmit={guardar} className="space-y-4">
          <Campo etiqueta="Nueva contraseña"><Entrada type="password" value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
          <Campo etiqueta="Repita la contraseña"><Entrada type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} /></Campo>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Boton type="submit" cargando={cargando} className="w-full">Guardar</Boton>
        </form>
      </Tarjeta>
    </div>
  );
}
