# Mis Finanzas — cómo dejarlo funcionando

Esta carpeta trae todo el programa:

| Carpeta / archivo | Qué es |
|---|---|
| `supabase/01_estructura.sql` | Crea toda la base de datos (se pega una sola vez) |
| `supabase/02_administrador.sql` | Lo deja a usted como administrador y crea sus cuentas y reglas iniciales |
| `public/config.js` | **Las dos variables de conexión** (URL y clave pública de Supabase) |
| `src/` | El código de la aplicación (computadora y celular) |
| `vista-previa/VistaPrevia.jsx` | Vista previa del diseño con datos de ejemplo |
| `netlify.toml` | Le dice a Netlify cómo publicar la aplicación (no hay que tocarlo) |

**No necesita crear ningún bucket** (carpeta de almacenamiento) en Supabase: la aplicación no guarda archivos, solo los datos.

---

## Parte 1 — Supabase (la base de datos)

1. Entre a **supabase.com** → **New project**. Póngale un nombre (por ejemplo *mis-finanzas*), escriba una contraseña para la base de datos (guárdela) y en **Region** elija **South America (São Paulo)**. Espere 1–2 minutos a que se cree.
2. En el menú de la izquierda abra **SQL Editor** → **New query**. Abra el archivo `supabase/01_estructura.sql` con el Bloc de notas, copie **todo** el texto, péguelo y presione **Run**. Debe decir *Success*. Si aparece algún aviso amarillo (*warning*) sobre el BCB, no es un error.
3. Menú **Authentication** → **Users** → **Add user** → **Create new user**. Escriba su correo y la contraseña con la que va a entrar. Marque **Auto Confirm User** y presione **Create user**.
4. Vuelva a **SQL Editor** → **New query**. Abra `supabase/02_administrador.sql`. Si su correo **no** es `fernando@cuellar.com`, cámbielo en la línea que dice `<<< SU CORREO`. Péguelo y presione **Run**. Debe decir *Listo: … es administrador del sistema*.
5. Menú **Project Settings** (engranaje) → **Data API** (o **API Keys**). Copie dos cosas:
   - **Project URL** (empieza con `https://` y termina en `.supabase.co`)
   - **Publishable key** (empieza con `sb_publishable_…`; en proyectos antiguos se llama *anon public*)

## Parte 2 — Pegar las dos variables

Abra `public/config.js` con el Bloc de notas y reemplace los dos textos de ejemplo:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxx',
};
```

Guarde el archivo. (La clave *publishable* es pública por diseño: está bien que vaya en la aplicación. **Nunca** pegue la clave *secret* ni la *service_role*).

## Parte 3 — GitHub (donde se guarda el código)

1. Cree una cuenta gratis en **github.com** (si no tiene).
2. Botón **+** (arriba a la derecha) → **New repository**. Nombre: `mis-finanzas`. Marque **Private**. Presione **Create repository**.
3. En la página que aparece, haga clic en el enlace **uploading an existing file**.
4. Abra la carpeta descomprimida en su computadora, seleccione **todo su contenido** (no la carpeta, sino lo que hay adentro: `src`, `public`, `supabase`, `package.json`, `index.html`, etc.) y arrástrelo a la página de GitHub.
5. Espere a que suban todos los archivos y presione **Commit changes**.

## Parte 4 — Netlify (la dirección web)

1. Entre a **netlify.com** → **Sign up** → **Sign up with GitHub**.
2. **Add new site** → **Import an existing project** → **GitHub** → autorice y elija `mis-finanzas`.
3. Netlify lee solo la configuración. Presione **Deploy**. En 1–3 minutos tendrá una dirección del tipo `https://algo.netlify.app`.
4. (Opcional) **Site configuration** → **Change site name** para elegir un nombre más corto.

## Parte 5 — Último ajuste en Supabase (para recuperar contraseña)

**Authentication** → **URL Configuration**:
- **Site URL**: pegue su dirección de Netlify.
- **Redirect URLs** → **Add URL**: su dirección de Netlify seguida de `/**` (por ejemplo `https://mis-finanzas.netlify.app/**`).

¡Listo! Entre a su dirección de Netlify con el correo y la contraseña del paso 1.3.

---

## Cómo hacer cambios después

Cualquier archivo que cambie en GitHub (botón del lápiz → **Commit changes**) se publica solo en Netlify en un par de minutos.

## Si algo falla

- **Netlify dice "Failed"**: abra **Deploys** → el último → copie el texto en rojo y envíelo para revisarlo.
- **La página dice "Falta conectar con Supabase"**: revise `public/config.js`.
- **"Su usuario todavía no tiene datos"**: ejecute de nuevo `02_administrador.sql`.
- **El tipo de cambio no se actualiza**: en *Configuración → Tipo de cambio* use **Leer el BCB ahora** o cárguelo a mano.

## Para tener en cuenta

- El plan gratuito de Supabase **pausa el proyecto** si nadie lo usa durante 7 días; se reactiva desde el panel de Supabase. Para vender el sistema conviene el plan pago.
- El registro de nuevos usuarios está **cerrado**. Solo existe su usuario.
