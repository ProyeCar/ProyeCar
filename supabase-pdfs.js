// Integración Supabase Auth + tabla `pdfs` para ProyeCar PWA.
// Cárgalo como: <script type="module" src="supabase-pdfs.js"></script>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://isncjtomlvxyvcaohcpx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SWknGu_-WzXjE1mQUXPdfQ_bIbTaDWO';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Autentica al inspector con email/contraseña.
 * Lanza si las credenciales son inválidas.
 */
export async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/**
 * Intenta obtener la geolocalización actual del dispositivo.
 * Devuelve null si el usuario la niega, hay timeout, o no está disponible:
 * la fila igual se guarda, solo sin lat/lng (columnas nullable en `pdfs`).
 */
function obtenerGeolocalizacion() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

/**
 * Registra el PDF como 'pendiente' antes de subirlo al Worker.
 * Se hace así (y no después de subir) para que quede rastro del intento
 * aunque falle la conexión al Worker o a R2.
 */
export async function registrarPdfPendiente({ nombreArchivo, urlR2, fotosUrls = [] }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa: llama a iniciarSesion() primero.');

  const geo = await obtenerGeolocalizacion();

  const { data, error } = await supabase
    .from('pdfs')
    .insert({
      user_id: user.id,
      nombre_archivo: nombreArchivo,
      url_r2: urlR2,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      fotos_urls: fotosUrls,
      estado: 'pendiente',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Marca el PDF como sincronizado una vez el Worker confirma que quedó en R2.
 * La policy RLS de UPDATE exige auth.uid() = user_id, así que esto solo
 * funciona con la sesión del dueño de la fila (ya la tenemos en el cliente).
 */
export async function confirmarSincronizacion(pdfId) {
  const { data, error } = await supabase
    .from('pdfs')
    .update({ estado: 'sincronizado' })
    .eq('id', pdfId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Marca el PDF como 'error' si el Worker/R2 rechazó la subida. */
export async function marcarError(pdfId) {
  const { error } = await supabase
    .from('pdfs')
    .update({ estado: 'error' })
    .eq('id', pdfId);

  if (error) throw error;
}

/**
 * Flujo completo: genera-PDF -> registra pendiente -> sube al Worker -> confirma/marca error.
 * `blobPdf` es el PDF ya generado (p.ej. por jsPDF). `workerUploadUrl` es el endpoint
 * del Worker de Cloudflare que sube el archivo a R2.
 *
 * Si se pasa `pdfId` (de un reintento previo), se reutiliza esa fila en vez de
 * insertar una nueva: sin esto, cada reintento de un informe que sigue fallando
 * dejaba una fila 'error' huérfana distinta por intento.
 */
export async function subirPdfYSincronizar({ nombreArchivo, blobPdf, fotosUrls, workerUploadUrl, pdfId }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa: llama a iniciarSesion() primero.');

  const base = workerUploadUrl.replace(/\/$/, '');
  // El Worker verifica el token y siempre guarda bajo pdfs/{user_id}/{archivo};
  // como conocemos nuestro propio user_id, podemos predecir esa misma key aquí.
  const urlR2 = `${base}/pdfs/${session.user.id}/${nombreArchivo}`;

  const fila = pdfId
    ? { id: pdfId }
    : await registrarPdfPendiente({ nombreArchivo, urlR2, fotosUrls });

  try {
    const respuesta = await fetch(`${base}/${nombreArchivo}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: blobPdf,
    });

    if (!respuesta.ok) throw new Error(`Worker respondió ${respuesta.status}`);

    await confirmarSincronizacion(fila.id);
  } catch (err) {
    await marcarError(fila.id);
    // El llamador necesita el id (aunque haya fallado) para que el próximo
    // reintento actualice esta misma fila en vez de crear otra.
    err.pdfId = fila.id;
    throw err;
  }

  return fila;
}

window.ProyeCarSupabase = {
  supabase,
  iniciarSesion,
  registrarPdfPendiente,
  confirmarSincronizacion,
  marcarError,
  subirPdfYSincronizar,
};
