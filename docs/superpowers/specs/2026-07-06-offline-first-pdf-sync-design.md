# Offline-first sync de informes a Supabase/R2

## Contexto

ProyeCar es una PWA vanilla (sin build, sin framework) para inspección ambiental/SST por
frente de obra. Hoy, al generar un informe:

1. Se construye un HTML autocontenido (fotos embebidas como `data:` URLs vía
   `canvas.toDataURL` / `FileReader.readAsDataURL` — no hay hosting de fotos separado).
2. Se abre en una ventana nueva.
3. Se envía una copia (fire-and-forget) a `https://pdf-receiver.ecodesaingenieria.workers.dev/`
   vía POST, sin auth, sin reintento, sin registro en ninguna base de datos.

Esta sesión ya agregó:
- Tabla `pdfs` en Supabase (RLS por `auth.uid() = user_id`, columnas `estado`
  `pendiente|sincronizado|error`, `url_r2`, `lat`/`lng` nullable, `fotos_urls text[]`).
- `supabase-pdfs.js`: `iniciarSesion`, `registrarPdfPendiente`, `confirmarSincronizacion`,
  `marcarError`, `subirPdfYSincronizar`.
- Worker `proyecar-pdfs-worker-production` (Cloudflare, bucket R2 `proyecar-pdfs`): verifica
  el JWT de Supabase vía `/auth/v1/user` antes de aceptar un PUT, y escribe bajo
  `pdfs/{user_id}/{archivo}`.

Ninguna de estas piezas está conectada a `index.html` todavía. Este spec cubre esa
integración, más el manejo de que el dispositivo esté sin conexión al momento de generar
el informe.

## Objetivo

Que un inspector pueda generar un informe sin conexión, y que se sincronice solo
(sin acción manual) apenas el dispositivo recupere internet — sin perder el informe si la
app se cierra entre medio.

## Fuera de alcance

- Hosting de fotos por separado (siguen embebidas como base64 dentro del HTML; el campo
  `fotos_urls` queda `[]` por ahora).
- Conversión del informe a PDF binario real (se sigue subiendo como HTML,
  `Content-Type: text/html`).
- Recuperación de contraseña / registro de nuevos usuarios (login asume que las cuentas
  ya existen en Supabase Auth).
- Background Sync API del Service Worker (sin soporte en iOS Safari, que es una plataforma
  objetivo de esta PWA).

## Diseño

### 1. Login (gate simple)

- Al cargar `index.html`, si `supabase.auth.getSession()` no tiene sesión, se muestra un
  modal bloqueante (email + password + botón "Entrar") que llama a `iniciarSesion()`.
  Hasta que haya sesión, el resto de la UI queda oculta.
- Supabase persiste la sesión en `localStorage` automáticamente — el login solo ocurre una
  vez por dispositivo, hasta que expire o se cierre sesión explícitamente.
- Si el token expira, supabase-js intenta refrescarlo solo; si el refresh falla, reaparece
  el modal.

### 2. Reemplazo del envío al Worker

- Se elimina por completo el `fetch('https://pdf-receiver.ecodesaingenieria.workers.dev/', ...)`
  actual (línea ~2486 de `index.html`).
- El Worker (`worker/index.js`) cambia el `Content-Type`/`httpMetadata.contentType` de
  `application/pdf` a `text/html;charset=utf-8`, ya que seguimos subiendo HTML, no un PDF
  binario. El nombre de archivo pasa a usar extensión `.html`.
- `supabase-pdfs.js`'s `subirPdfYSincronizar` ajusta su header `Content-Type` del PUT al
  Worker de la misma forma.

### 3. Flujo de datos

```
generar informe (sin cambios)
        │
        ▼
sincronizarInforme(nombreArchivo, htmlBlob)
        │
   ¿navigator.onLine?
        │
   no ──┼── sí: intentar flujo completo
        │         (registrarPdfPendiente → PUT Worker → confirmarSincronizacion)
        │         │
        │      falla en cualquier paso
        │         │
        ▼         ▼
   encolarLocal(id, nombreArchivo, htmlBlob, fotosUrls=[], lat, lng, creadoEn)
```

- `encolarLocal` guarda el ítem completo (blob incluido) en un nuevo object store
  `colaInformes` dentro de la IndexedDB `cardique_fotos` ya existente (se reutiliza la
  misma base, se sube `IDB_VERSION` de 1 a 2 y se crea el store en `onupgradeneeded`).
  No se crea una IndexedDB nueva.
- Se actualiza un contador visible (badge) con la cantidad de ítems en `colaInformes`.

### 4. Reintento

- `window.addEventListener('online', reintentarCola)`.
- `reintentarCola()` también se llama una vez al cargar la app, por si quedó algo
  pendiente de una sesión anterior (app cerrada mientras estaba offline).
- Recorre todos los ítems de `colaInformes`, reintenta el flujo completo por cada uno.
  Si un ítem tiene éxito, se borra de IndexedDB y se actualiza el badge. Si falla, se deja
  intacto y se sigue con el siguiente — un fallo no bloquea a los demás.

### 5. Manejo de errores

- Fallo de red (offline real, o Worker/Supabase inalcanzables): el ítem se queda en la cola
  local; **no** se marca `estado='error'` en Supabase, porque en este punto probablemente
  la fila ni siquiera se creó (no hay forma de escribir `pendiente` en Supabase estando sin
  conexión) — el estado vive solo en IndexedDB hasta que el flujo completo funcione.
- Fallo real estando online (ej. el Worker responde 401 por token inválido, o Supabase
  rechaza el insert por otra razón): se marca `estado='error'` en la fila (ya existe,
  porque el insert sí llegó a completarse) vía `marcarError`, y el ítem permanece en la
  cola local para reintento manual/futuro.

### 6. Indicador visual

- Badge simple en la UI (ej. junto al header) mostrando la cantidad de informes en
  `colaInformes`. Se actualiza cada vez que se encola o se sincroniza un ítem.

## Testing (manual — no hay framework de tests en este proyecto)

1. Levantar servidor local para ProyeCar (`http://localhost:8000`).
2. Abrir la PWA en el navegador, completar login Supabase (email/password) en el modal.
3. Generar un informe con la conexión desactivada (DevTools → Network → Offline) →
   confirmar que el HTML se abre igual que hoy, y que aparece el badge de "pendiente".
4. Verificar en DevTools → Application → IndexedDB → `cardique_fotos` → `colaInformes`
   que el ítem quedó guardado completo.
5. Reconectar → confirmar que el listener `online` dispara, la cola se vacía, el badge
   desaparece.
6. Verificar en la tabla `pdfs` de Supabase que la fila quedó con `estado='sincronizado'`
   y `url_r2` apuntando a `proyecar-pdfs-worker-production.ecodesaingenieria.workers.dev`.
