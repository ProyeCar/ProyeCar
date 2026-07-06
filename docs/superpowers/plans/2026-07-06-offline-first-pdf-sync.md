# Offline-first PDF/informe sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built Supabase Auth + `pdfs` table + Cloudflare Worker into `index.html`, so an inspector can log in, generate an informe fully offline, and have it sync automatically once the device reconnects.

**Architecture:** A classic (non-module) script (the app's existing huge inline `<script>`) drives everything; `supabase-pdfs.js` is loaded as an ES module and exposes its functions on `window.ProyeCarSupabase` so the classic script can call them. A new IndexedDB object store (`colaInformes`, in the same `cardique_fotos` database the app already uses for photos) holds informes that couldn't sync immediately. A `sincronizarInforme()` function tries the live path first and falls back to the queue; `reintentarCola()` drains the queue on `online` and on page load.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step, no framework), Supabase JS v2 (via esm.sh CDN), Cloudflare Workers + R2, IndexedDB.

## Global Constraints

- No build step, no npm install for the PWA itself — `index.html`, `supabase-pdfs.js` stay plain files loaded directly by the browser.
- No test framework exists in this project (per spec) — verification is manual, via a local static server + browser DevTools. Do not add a test framework.
- Reports stay HTML (`text/html;charset=utf-8`), not a real PDF binary — this was decided explicitly in the design spec.
- `fotos_urls` stays `[]` for every insert — photo hosting is out of scope (photos are embedded as base64 inside the HTML itself).
- The Worker URL is `https://proyecar-pdfs-worker-production.ecodesaingenieria.workers.dev`.
- Spec reference: `docs/superpowers/specs/2026-07-06-offline-first-pdf-sync-design.md`.

---

### Task 1: Content-Type fix (HTML not PDF) + window bridge + redeploy Worker

**Files:**
- Modify: `ProyeCar/supabase-pdfs.js`
- Modify: `ProyeCar/worker/index.js`
- Deploy: `ProyeCar/worker/` (via wrangler, no file created)

**Interfaces:**
- Produces: `window.ProyeCarSupabase = { supabase, iniciarSesion, registrarPdfPendiente, confirmarSincronizacion, marcarError, subirPdfYSincronizar }` — this is what every later task calls from the classic script.
- Produces: `subirPdfYSincronizar(...)` now PUTs with `Content-Type: text/html;charset=utf-8`.
- Produces: the deployed Worker stores R2 objects with `contentType: 'text/html;charset=utf-8'`.

- [ ] **Step 1: Fix the Content-Type in `subirPdfYSincronizar`**

In `ProyeCar/supabase-pdfs.js`, find:

```js
      headers: {
        'Content-Type': 'application/pdf',
        Authorization: `Bearer ${session.access_token}`,
      },
```

Replace with:

```js
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        Authorization: `Bearer ${session.access_token}`,
      },
```

- [ ] **Step 2: Add the `window` bridge at the end of `supabase-pdfs.js`**

Append this to the end of the file (after the closing `}` of `subirPdfYSincronizar`):

```js

window.ProyeCarSupabase = {
  supabase,
  iniciarSesion,
  registrarPdfPendiente,
  confirmarSincronizacion,
  marcarError,
  subirPdfYSincronizar,
};
```

- [ ] **Step 3: Fix the Content-Type in the Worker**

In `ProyeCar/worker/index.js`, find:

```js
    await env.PDFS_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: 'application/pdf' },
    });
```

Replace with:

```js
    await env.PDFS_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: 'text/html;charset=utf-8' },
    });
```

- [ ] **Step 4: Redeploy the Worker**

Run (from `ProyeCar/worker/`):

```bash
cd "ProyeCar/worker" && npx --yes wrangler deploy index.js --config wrangler.toml --env production
```

Expected output includes:
```
Uploaded proyecar-pdfs-worker-production (...)
Deployed proyecar-pdfs-worker-production triggers (...)
  https://proyecar-pdfs-worker-production.ecodesaingenieria.workers.dev
```

(Note: plain `wrangler deploy` without `index.js --config wrangler.toml` fails in this environment due to a wrangler 4.107.0 autoconfig bug that ignores `wrangler.toml`'s `main` field — always pass both flags explicitly.)

- [ ] **Step 5: Verify**

```bash
node --check "ProyeCar/supabase-pdfs.js"
node --check "ProyeCar/worker/index.js"
grep -c "text/html;charset=utf-8" "ProyeCar/supabase-pdfs.js"
grep -c "text/html;charset=utf-8" "ProyeCar/worker/index.js"
```
Expected: both `node --check` commands print nothing (valid syntax); both `grep -c` print `1` (client) and `1` (worker) respectively — i.e. exactly one occurrence each of the new content type, and zero remaining occurrences of `application/pdf`:
```bash
grep -c "application/pdf" "ProyeCar/supabase-pdfs.js" "ProyeCar/worker/index.js"
```
Expected: `0` for both files.

- [ ] **Step 6: Commit**

```bash
cd "ProyeCar" && git add supabase-pdfs.js worker/index.js && git commit -m "$(cat <<'EOF'
Switch upload Content-Type to text/html, expose window.ProyeCarSupabase bridge

Reports are HTML, not real PDFs, so both the client PUT and the Worker's
R2 write now use text/html;charset=utf-8. Also exposes supabase-pdfs.js's
exports on window so the classic (non-module) app script can call them.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: IndexedDB queue store + helpers

**Files:**
- Modify: `ProyeCar/index.html:875-891` (IndexedDB setup block)
- Modify: `ProyeCar/index.html` (insert new helpers after the existing `idbTodas` function)

**Interfaces:**
- Consumes: nothing new (pure IndexedDB, uses the existing `abrirIDB()` pattern).
- Produces: `colaGuardar(item)`, `colaLeerTodas()` (returns `Promise<Array<{id, nombreArchivo, htmlBlob, creadoEn}>>`), `colaEliminar(id)` — used by Task 3.

- [ ] **Step 1: Bump the IndexedDB version and add the new store**

In `ProyeCar/index.html`, find:

```js
    const IDB_NAME = 'cardique_fotos';
    const IDB_STORE = 'fotos';
    const IDB_VERSION = 1;

    function abrirIDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = e => res(e.target.result);
            req.onerror   = e => rej(e.target.error);
        });
    }
```

Replace with:

```js
    const IDB_NAME = 'cardique_fotos';
    const IDB_STORE = 'fotos';
    const IDB_STORE_COLA = 'colaInformes';
    const IDB_VERSION = 2;

    function abrirIDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(IDB_STORE_COLA)) {
                    db.createObjectStore(IDB_STORE_COLA, { keyPath: 'id' });
                }
            };
            req.onsuccess = e => res(e.target.result);
            req.onerror   = e => rej(e.target.error);
        });
    }
```

- [ ] **Step 2: Add the queue helpers after `idbTodas`**

Find (the existing last IDB helper function):

```js
    async function idbTodas() {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx  = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAll();
            req.onsuccess = e => res(e.target.result || []);
            req.onerror   = e => rej(e.target.error);
        });
    }
```

Replace with (same block, plus three new functions immediately after):

```js
    async function idbTodas() {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx  = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAll();
            req.onsuccess = e => res(e.target.result || []);
            req.onerror   = e => rej(e.target.error);
        });
    }

    // ── Cola de informes pendientes de sincronizar (offline-first) ──

    async function colaGuardar(item) {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE_COLA, 'readwrite');
            tx.objectStore(IDB_STORE_COLA).put(item);
            tx.oncomplete = () => res();
            tx.onerror    = e => rej(e.target.error);
        });
    }

    async function colaLeerTodas() {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx  = db.transaction(IDB_STORE_COLA, 'readonly');
            const req = tx.objectStore(IDB_STORE_COLA).getAll();
            req.onsuccess = e => res(e.target.result || []);
            req.onerror   = e => rej(e.target.error);
        });
    }

    async function colaEliminar(id) {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE_COLA, 'readwrite');
            tx.objectStore(IDB_STORE_COLA).delete(id);
            tx.oncomplete = () => res();
            tx.onerror    = e => rej(e.target.error);
        });
    }
```

- [ ] **Step 3: Verify**

```bash
cd "ProyeCar" && python -m http.server 8000
```
Open `http://localhost:8000` in Chrome, open DevTools → Console (confirm no red syntax errors on load), then DevTools → Application → IndexedDB → `cardique_fotos`. Expected: version shows `2`, and object stores list includes both `fotos` and `colaInformes`. Stop the server (Ctrl+C) when done.

- [ ] **Step 4: Commit**

```bash
cd "ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
Add colaInformes IndexedDB store for the offline sync queue

Bumps cardique_fotos to version 2 and adds colaGuardar/colaLeerTodas/
colaEliminar helpers, following the same pattern as the existing photo
storage functions.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sync engine (queue, retry, badge) wired into the report generator

**Files:**
- Modify: `ProyeCar/index.html` (insert sync engine functions after `colaEliminar`)
- Modify: `ProyeCar/index.html:2483-2493` (replace the old `pdf-receiver` fetch call)
- Modify: `ProyeCar/index.html:85-87` (add `.badge-cola` CSS)
- Modify: `ProyeCar/index.html:764` (add the badge element + module script tag)

**Interfaces:**
- Consumes: `colaGuardar`, `colaLeerTodas`, `colaEliminar` (Task 2); `window.ProyeCarSupabase.subirPdfYSincronizar` (Task 1).
- Produces: `sincronizarInforme(nombreArchivo, htmlBlob)`, `reintentarCola()`, `refrescarBadge()` — `reintentarCola` is consumed by Task 4's login handler.

- [ ] **Step 1: Add the CSS for the badge**

In `ProyeCar/index.html`, find:

```css
        .logo-img { height: 64px; max-width: 190px; object-fit: contain; border-radius: 12px; }
```

Replace with:

```css
        .logo-img { height: 64px; max-width: 190px; object-fit: contain; border-radius: 12px; }
        .badge-cola { position: fixed; top: 10px; right: 10px; background: var(--ambar); color: var(--verde-oscuro); font-weight: 700; font-size: 0.8rem; padding: 6px 14px; border-radius: 30px; box-shadow: var(--shadow-md); z-index: 500; }
```

- [ ] **Step 2: Add the badge element + the `supabase-pdfs.js` module script tag**

Find:

```html
    </button>
</nav>

<script>
    const APP_VERSION = "1.5.59";
```

Replace with:

```html
    </button>
</nav>

<div id="badge-cola" class="badge-cola" style="display:none;"></div>

<script type="module" src="supabase-pdfs.js"></script>
<script>
    const APP_VERSION = "1.5.59";
```

- [ ] **Step 3: Add the sync engine functions after `colaEliminar`**

Find (the last function added in Task 2):

```js
    async function colaEliminar(id) {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE_COLA, 'readwrite');
            tx.objectStore(IDB_STORE_COLA).delete(id);
            tx.oncomplete = () => res();
            tx.onerror    = e => rej(e.target.error);
        });
    }
```

Replace with (same block, plus the sync engine immediately after):

```js
    async function colaEliminar(id) {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE_COLA, 'readwrite');
            tx.objectStore(IDB_STORE_COLA).delete(id);
            tx.oncomplete = () => res();
            tx.onerror    = e => rej(e.target.error);
        });
    }

    // ── Motor de sincronización offline-first ──

    const WORKER_URL = 'https://proyecar-pdfs-worker-production.ecodesaingenieria.workers.dev';

    function actualizarBadge(n) {
        const el = document.getElementById('badge-cola');
        if (!el) return;
        if (n > 0) {
            el.textContent = n + (n === 1 ? ' informe pendiente' : ' informes pendientes');
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    async function refrescarBadge() {
        const items = await colaLeerTodas();
        actualizarBadge(items.length);
    }

    async function encolarLocal(nombreArchivo, htmlBlob) {
        await colaGuardar({
            id: 'cola_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            nombreArchivo: nombreArchivo,
            htmlBlob: htmlBlob,
            creadoEn: new Date().toISOString(),
        });
        await refrescarBadge();
    }

    async function sincronizarInforme(nombreArchivo, htmlBlob) {
        if (!navigator.onLine) {
            await encolarLocal(nombreArchivo, htmlBlob);
            return;
        }
        try {
            await window.ProyeCarSupabase.subirPdfYSincronizar({
                nombreArchivo: nombreArchivo,
                blobPdf: htmlBlob,
                fotosUrls: [],
                workerUploadUrl: WORKER_URL,
            });
        } catch (e) {
            console.error('Sync de informe falló, se encola:', e);
            await encolarLocal(nombreArchivo, htmlBlob);
        }
    }

    async function reintentarCola() {
        if (!navigator.onLine) return;
        const items = await colaLeerTodas();
        for (const item of items) {
            try {
                await window.ProyeCarSupabase.subirPdfYSincronizar({
                    nombreArchivo: item.nombreArchivo,
                    blobPdf: item.htmlBlob,
                    fotosUrls: [],
                    workerUploadUrl: WORKER_URL,
                });
                await colaEliminar(item.id);
            } catch (e) {
                console.error('Reintento de cola falló para', item.nombreArchivo, e);
            }
        }
        await refrescarBadge();
    }

    window.addEventListener('online', reintentarCola);
    window.addEventListener('load', function() {
        refrescarBadge();
        reintentarCola();
    });
```

- [ ] **Step 4: Replace the old Worker POST with `sincronizarInforme`**

Find:

```js
        // Enviar copia del informe al Worker (Cloudflare)
        try {
            var htmlBlob = new Blob([h], { type: 'text/html;charset=utf-8' });
            fetch('https://pdf-receiver.ecodesaingenieria.workers.dev/', {
                method: 'POST',
                headers: { 'Content-Type': 'text/html;charset=utf-8' },
                body: htmlBlob
            }).catch(function(e) { console.error('Error enviando informe al worker:', e); });
        } catch (e) {
            console.error('Error creando blob para el worker:', e);
        }
```

Replace with:

```js
        // Sincronizar informe con Supabase + R2 (offline-first, ver sincronizarInforme)
        try {
            var htmlBlob = new Blob([h], { type: 'text/html;charset=utf-8' });
            var nombreArchivo = 'informe_' + (proyectoInput.value || 'sin-nombre').replace(/[^a-z0-9]+/gi, '-') + '_' + (fechaInput.value || new Date().toISOString().slice(0,10)) + '_' + Date.now() + '.html';
            sincronizarInforme(nombreArchivo, htmlBlob).catch(function(e) { console.error('Error sincronizando informe:', e); });
        } catch (e) {
            console.error('Error creando blob para sincronización:', e);
        }
```

- [ ] **Step 5: Verify**

```bash
cd "ProyeCar" && python -m http.server 8000
```
Open `http://localhost:8000`, DevTools → Console: confirm no red errors on load. Then:
1. DevTools → Network → set to **Offline**.
2. Fill in proyecto/fecha/inspector, mark a couple of items, click the button that generates the informe (`generarInformeDireccion`).
3. Expected: the informe window still opens exactly as before (no regression), and within ~1 second the badge in the top-right shows "1 informe pendiente".
4. DevTools → Application → IndexedDB → `cardique_fotos` → `colaInformes`: expected one row with `nombreArchivo` ending in `.html` and a populated `htmlBlob`.
5. Set Network back to **Online**. Expected: within a couple seconds the badge disappears (queue drained). Check the Console for `Reintento de cola falló` — expected: not present (meaning it succeeded). If Supabase/Worker are reachable, this also means the row's `estado` should now be `sincronizado` — verify via the Supabase dashboard's Table Editor on `pdfs`, or defer that check to Task 5 if login (Task 4) isn't wired yet at this point (login exists starting Task 4, so `subirPdfYSincronizar` will throw "No hay sesión activa" here — expected at this stage; the item will stay queued and retry after Task 4 adds login. This step's real pass criterion for Task 3 is items 1-4 above; full sync success is confirmed in Task 5).

Stop the server (Ctrl+C) when done.

- [ ] **Step 6: Commit**

```bash
cd "ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
Wire offline-first sync engine into the report generator

Replaces the old fire-and-forget POST to pdf-receiver.ecodesaingenieria.workers.dev
with sincronizarInforme(), which tries the live Supabase+Worker path and
falls back to an IndexedDB queue on failure/offline. Queue drains on the
'online' event and on page load. Adds a pending-count badge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Login modal + auth gate

**Files:**
- Modify: `ProyeCar/index.html:617-618` (insert login modal HTML)
- Modify: `ProyeCar/index.html` (insert login JS after the sync engine)

**Interfaces:**
- Consumes: `window.ProyeCarSupabase.supabase`, `window.ProyeCarSupabase.iniciarSesion` (Task 1); `reintentarCola` (Task 3).
- Produces: nothing consumed by later tasks — this is the last app-code task.

- [ ] **Step 1: Add the login modal HTML**

Find:

```html
<body>
<div id="pantalla-inspeccion" class="pantalla activa"><div class="container">
```

Replace with:

```html
<body>
<div id="modal-login" style="display:none; position:fixed; inset:0; background:rgba(13,51,33,0.85); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:var(--blanco); border-radius:var(--radius); padding:32px; width:min(90vw,360px); box-shadow:var(--shadow-lg);">
        <h2 style="margin-bottom:16px; color:var(--verde-oscuro);">Iniciar sesión</h2>
        <input type="email" id="login-email" placeholder="Email" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid var(--gris-borde); border-radius:var(--radius-sm); box-sizing:border-box;">
        <input type="password" id="login-password" placeholder="Contraseña" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid var(--gris-borde); border-radius:var(--radius-sm); box-sizing:border-box;">
        <div id="login-error" style="color:var(--rojo); font-size:0.85rem; margin-bottom:10px; display:none;"></div>
        <button id="login-submit" style="width:100%; padding:12px; background:var(--verde-gradient); color:white; border:none; border-radius:var(--radius-sm); font-weight:600; cursor:pointer;">Entrar</button>
    </div>
</div>
<div id="pantalla-inspeccion" class="pantalla activa"><div class="container">
```

- [ ] **Step 2: Add the login JS after the sync engine**

Find:

```js
    window.addEventListener('online', reintentarCola);
    window.addEventListener('load', function() {
        refrescarBadge();
        reintentarCola();
    });
```

Replace with (same block, plus login logic immediately after):

```js
    window.addEventListener('online', reintentarCola);
    window.addEventListener('load', function() {
        refrescarBadge();
        reintentarCola();
    });

    // ── Login gate ──

    async function mostrarLoginSiHaceFalta() {
        const modal = document.getElementById('modal-login');
        const { data: { session } } = await window.ProyeCarSupabase.supabase.auth.getSession();
        modal.style.display = session ? 'none' : 'flex';
    }

    document.getElementById('login-submit').addEventListener('click', async function() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        errorEl.style.display = 'none';
        try {
            await window.ProyeCarSupabase.iniciarSesion(email, password);
            document.getElementById('modal-login').style.display = 'none';
            reintentarCola();
        } catch (e) {
            errorEl.textContent = 'No se pudo iniciar sesión: ' + (e.message || e);
            errorEl.style.display = 'block';
        }
    });

    window.addEventListener('load', mostrarLoginSiHaceFalta);
```

- [ ] **Step 3: Verify**

```bash
cd "ProyeCar" && python -m http.server 8000
```
Open `http://localhost:8000` in an Incognito window (guarantees no leftover Supabase session in localStorage). Expected: the login modal covers the screen immediately, main app is not usable underneath. Try a wrong password: expected red error text under the password field, modal stays open. Enter valid credentials for a real Supabase Auth user in this project: expected modal disappears and the app underneath is usable. Reload the page: expected modal does NOT reappear (session persisted).

If you don't have a test user yet, create one via the Supabase Dashboard → Authentication → Users → Add user (project `isncjtomlvxyvcaohcpx`), or via the MCP tool `mcp__plugin_supabase_supabase__execute_sql` is not applicable here (Auth users aren't created through SQL) — use the Dashboard.

Stop the server (Ctrl+C) when done.

- [ ] **Step 4: Commit**

```bash
cd "ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
Add Supabase Auth login gate to index.html

A blocking modal requests email/password on load if there's no active
Supabase session; session persists via supabase-js's localStorage
handling, so this only happens once per device until logout/expiry.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** Consumes everything from Tasks 1-4.

- [ ] **Step 1: Full offline → online sync cycle**

```bash
cd "ProyeCar" && python -m http.server 8000
```

1. Open `http://localhost:8000` in Chrome.
2. Log in with valid Supabase Auth credentials in the modal.
3. DevTools → Network → **Offline**.
4. Fill in the inspection form and generate an informe.
5. Expected: informe window opens normally; badge shows "1 informe pendiente".
6. DevTools → Application → IndexedDB → `cardique_fotos` → `colaInformes`: expected one row present.
7. DevTools → Network → **Online**.
8. Expected within a few seconds: badge disappears; DevTools Console shows no `Reintento de cola falló` message; `colaInformes` is empty again (refresh the IndexedDB view in DevTools).

- [ ] **Step 2: Confirm the Supabase row**

Using the Supabase MCP tools (`mcp__plugin_supabase_supabase__execute_sql` against project `isncjtomlvxyvcaohcpx`), run:

```sql
select id, nombre_archivo, url_r2, estado, created_at
from public.pdfs
order by created_at desc
limit 5;
```

Expected: the most recent row has `estado = 'sincronizado'` and `url_r2` containing `proyecar-pdfs-worker-production.ecodesaingenieria.workers.dev/pdfs/`.

- [ ] **Step 3: Confirm the R2 object**

```bash
cd "ProyeCar/worker" && npx --yes wrangler r2 object get "proyecar-pdfs/pdfs/<user_id>/<nombreArchivo>" --file /tmp/check.html
```
(Replace `<user_id>`/`<nombreArchivo>` with the values from Step 2's `url_r2`.) Expected: command succeeds and `/tmp/check.html` contains the informe HTML.

- [ ] **Step 4: Regression check — online-only path still works**

With Network back to Online from the start (skip the offline step), generate a second informe. Expected: badge never appears (synced immediately), and a second row shows up in `pdfs` with `estado = 'sincronizado'`.

No commit for this task — it's verification only. If any step fails, open a task against the specific task above whose deliverable is broken; do not patch ad hoc without updating this plan.
