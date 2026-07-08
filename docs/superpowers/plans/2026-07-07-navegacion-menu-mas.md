# Navegación: barra inferior reducida + pantalla "Más" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir la barra inferior de ProyeCar de 6 a 4 botones (Datos, Frentes, Sync, Más) y mover Herramientas/Historial/Comparar + las áreas de inspección a una nueva pantalla "Más", sin cambiar ninguna función existente.

**Architecture:** Todo vive en un único archivo (`C:\Users\DAIRON NARVAEZ\Desktop\ProyeCar\index.html`, HTML+CSS+JS inline, sin build step ni framework). Se añade una 7ª `.pantalla` al patrón ya existente (`mostrarPantalla(nombre)` + `ORDEN_TABS`), sin infraestructura nueva.

**Tech Stack:** Vanilla JS (ES6+), CSS plano, sin dependencias externas. No hay framework de testing en este proyecto — la verificación de cada tarea es: (1) chequeo de sintaxis JS con `node -e` (método usado en toda la sesión) y (2) verificación manual/estructural puntual descrita en cada tarea.

## Global Constraints

- Nunca usar el Edit tool intentando reproducir la línea del logo en base64 (busca "base64" si es necesario evitarla) — no aplica a este plan, ningún cambio toca esa zona del archivo.
- Todo cambio de JS se valida con este comando antes de dar la tarea por terminada:
  ```bash
  cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && node -e "
  const fs = require('fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;
  let m, i=0, ok=true;
  while ((m = re.exec(html))) { i++; try { new Function(m[1]); } catch(e) { ok=false; console.log('Block', i, e.message); } }
  console.log('OK=', ok, 'blocks=', i);
  "
  ```
  Esperado siempre: `OK= true blocks= 3`.
- Commits van directo a `main` (no hay rama de feature en este flujo) — `git add index.html && git commit -m "..." && git push origin main`, un commit por tarea.
- No agregar lógica de negocio nueva — todos los botones nuevos deben llamar funciones que ya existen (`mostrarPantalla`, `aplicarFiltroCategoria`).

---

### Task 1: CSS del menú "Más" (`.menu-titulo`, `.menu-lista`, `.menu-item`)

**Files:**
- Modify: `C:\Users\DAIRON NARVAEZ\Desktop\ProyeCar\index.html` (bloque `<style>`, cerca de `.hist-item` línea ~637-650)

**Interfaces:**
- Produces: clases CSS `.menu-titulo`, `.menu-lista`, `.menu-item` que las Tasks 3 y 5 usan en su HTML/JS.

- [ ] **Step 1: Insertar el nuevo bloque CSS**

Ubicar esta línea exacta (línea 650 actual):
```css
        .hist-frentes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
```
Insertar inmediatamente después:
```css
        .menu-titulo {
            font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.6px; color: #64748b; margin: 20px 0 10px;
        }
        .menu-titulo:first-child { margin-top: 4px; }
        .menu-lista { display: flex; flex-direction: column; gap: 10px; }
        .menu-item {
            display: flex; align-items: center; gap: 12px;
            background: white; border-radius: 16px; padding: 14px 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,.05);
            border: 1.5px solid transparent;
            font-size: 0.92rem; font-weight: 600; color: #1e3a2f;
            cursor: pointer; width: 100%; text-align: left;
            transition: box-shadow 0.2s, border-color 0.2s;
        }
        .menu-item:hover { box-shadow: 0 8px 22px rgba(13,51,33,0.12); border-color: #bbf7d0; }
        .menu-item svg { flex-shrink: 0; color: #1a5c35; }
```
Nota: sin `transform` en `:hover`/`:active` — a propósito, para no repetir el problema de "se mueve al tocar" ya corregido en frentes/áreas/ítems.

- [ ] **Step 2: Verificar sintaxis** (comando de la sección Global Constraints). Esperado: `OK= true blocks= 3` (este cambio es solo CSS, no debería afectar los bloques JS, pero se corre igual por consistencia).

- [ ] **Step 3: Commit**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
feat: CSS del menu Mas (menu-titulo/menu-lista/menu-item)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 2: Reducir la barra inferior a 4 botones + agregar "Más"

**Files:**
- Modify: `C:\Users\DAIRON NARVAEZ\Desktop\ProyeCar\index.html:986-1005` (bloque `<nav class="nav-bar no-print">`)

**Interfaces:**
- Produces: botón `<button id="nav-mas">` que la Task 4 activa/desactiva vía `mostrarPantalla()`.

- [ ] **Step 1: Reemplazar el bloque `<nav>` completo**

Buscar este bloque exacto (líneas 986-1005):
```html
<nav class="nav-bar no-print">
    <button class="nav-btn activo" id="nav-datos" onclick="mostrarPantalla('datos')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>Datos
    </button>
    <button class="nav-btn" id="nav-frentes" onclick="mostrarPantalla('frentes')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-6 4 3 4-8"/></svg></span>Frentes
    </button>
    <button class="nav-btn" id="nav-herramientas" onclick="mostrarPantalla('herramientas')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4l-5.6 5.6a1.5 1.5 0 0 0 2.1 2.1l5.6-5.6a4 4 0 0 1 5.4-5.4l-2.5 2.5-2-2z"/></svg></span>Herramientas
    </button>
    <button class="nav-btn" id="nav-historial" onclick="mostrarPantalla('historial')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><polyline points="12 7.5 12 12 15 14"/><line x1="12" y1="1.8" x2="12" y2="3.2"/><line x1="12" y1="20.8" x2="12" y2="22.2"/><line x1="1.8" y1="12" x2="3.2" y2="12"/><line x1="20.8" y1="12" x2="22.2" y2="12"/></svg></span>Historial
    </button>
    <button class="nav-btn" id="nav-comparar" onclick="mostrarPantalla('comparar')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="15" stroke="currentColor" stroke-width="2.4"/><line x1="10" y1="21" x2="10" y2="10" stroke="currentColor" stroke-width="2.4"/><line x1="16" y1="21" x2="16" y2="6" stroke="currentColor" stroke-width="2.4"/><line x1="21" y1="21" x2="21" y2="9" stroke="currentColor" stroke-width="2.4"/><polyline points="3 16 10 9 16 4 21 8" fill="none" stroke="#4ade80" stroke-width="2"/></svg></span>Comparar
    </button>
    <button class="nav-btn" id="nav-sync" onclick="mostrarPantalla('sync')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg></span>Sync
    </button>
</nav>
```
Reemplazar por:
```html
<nav class="nav-bar no-print">
    <button class="nav-btn activo" id="nav-datos" onclick="mostrarPantalla('datos')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>Datos
    </button>
    <button class="nav-btn" id="nav-frentes" onclick="mostrarPantalla('frentes')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-6 4 3 4-8"/></svg></span>Frentes
    </button>
    <button class="nav-btn" id="nav-sync" onclick="mostrarPantalla('sync')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg></span>Sync
    </button>
    <button class="nav-btn" id="nav-mas" onclick="mostrarPantalla('mas')">
        <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span>Más
    </button>
</nav>
```

- [ ] **Step 2: Verificar sintaxis** (comando de Global Constraints). Esperado: `OK= true blocks= 3`.

- [ ] **Step 3: Verificación estructural manual**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && grep -c 'class="nav-btn' index.html
```
Esperado: `4` (antes eran 6 — confirma que quedaron exactamente 4 botones en la barra).

- [ ] **Step 4: Commit**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
feat: reducir barra inferior a 4 botones (Datos/Frentes/Sync/Mas)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 3: Pantalla `#pantalla-mas` con "Secciones principales" estáticas

**Files:**
- Modify: `C:\Users\DAIRON NARVAEZ\Desktop\ProyeCar\index.html:977-983` (después del cierre de `#pantalla-sync`)

**Interfaces:**
- Consumes: clases `.menu-titulo`, `.menu-lista`, `.menu-item` (Task 1).
- Produces: `<div id="areas-menu-lista">` vacío que la Task 5 puebla.

- [ ] **Step 1: Insertar la nueva pantalla**

Buscar este bloque exacto (líneas 977-983, `#pantalla-sync` completo):
```html
<div id="pantalla-sync" class="pantalla"><div class="container">
    <div class="card">
        <div class="card-header"><h2><span class="icon-box icon-box-verde"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a5c35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg></span>Sincronización</h2></div>
        <div id="sync-lista"></div>
        <button id="btn-sync-reintentar" style="width:100%;">🔄 Reintentar ahora</button>
    </div>
</div></div>
```
Insertar inmediatamente después de ese bloque (antes de `<!-- NAV BAR -->`):
```html
<div id="pantalla-mas" class="pantalla"><div class="container">
    <div class="card">
        <div class="menu-titulo">Secciones principales</div>
        <div class="menu-lista">
            <button class="menu-item" onclick="mostrarPantalla('herramientas')">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4l-5.6 5.6a1.5 1.5 0 0 0 2.1 2.1l5.6-5.6a4 4 0 0 1 5.4-5.4l-2.5 2.5-2-2z"/></svg>
                Herramientas
            </button>
            <button class="menu-item" onclick="mostrarPantalla('historial')">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><polyline points="12 7.5 12 12 15 14"/><line x1="12" y1="1.8" x2="12" y2="3.2"/><line x1="12" y1="20.8" x2="12" y2="22.2"/><line x1="1.8" y1="12" x2="3.2" y2="12"/><line x1="20.8" y1="12" x2="22.2" y2="12"/></svg>
                Historial de inspección
            </button>
            <button class="menu-item" onclick="mostrarPantalla('comparar')">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="15" stroke="currentColor" stroke-width="2.4"/><line x1="10" y1="21" x2="10" y2="10" stroke="currentColor" stroke-width="2.4"/><line x1="16" y1="21" x2="16" y2="6" stroke="currentColor" stroke-width="2.4"/><line x1="21" y1="21" x2="21" y2="9" stroke="currentColor" stroke-width="2.4"/><polyline points="3 16 10 9 16 4 21 8" fill="none" stroke="#4ade80" stroke-width="2"/></svg>
                Comparar inspecciones
            </button>
        </div>
        <div class="menu-titulo">Áreas de inspección</div>
        <div class="menu-lista" id="areas-menu-lista"></div>
    </div>
</div></div>
```

- [ ] **Step 2: Verificar sintaxis** (comando de Global Constraints). Esperado: `OK= true blocks= 3`.

- [ ] **Step 3: Verificación estructural manual**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && grep -c 'id="pantalla-' index.html
```
Esperado: `7` (las 6 originales + `pantalla-mas`).

- [ ] **Step 4: Commit**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
feat: agregar pantalla Mas con Secciones principales

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 4: Robustecer `mostrarPantalla()` + integrar "mas" al swipe

**Files:**
- Modify: `C:\Users\DAIRON NARVAEZ\Desktop\ProyeCar\index.html` — función `mostrarPantalla()` (línea ~2968) y `const ORDEN_TABS` (línea ~3004)

**Interfaces:**
- Consumes: nada nuevo (usa DOM ya existente).
- Produces: `mostrarPantalla()` ya no falla en pantallas sin botón propio en la barra; llama a `renderMenuAreas()` (Task 5) cuando `nombre === 'mas'`.

- [ ] **Step 1: Reemplazar `mostrarPantalla()`**

Buscar este bloque exacto:
```js
    function mostrarPantalla(nombre) {
        document.getElementById('paleta3d-panel')?.remove();
        document.getElementById('cs-picker')?.remove();
        document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('activo'));
        document.getElementById('pantalla-' + nombre).classList.add('activa');
        document.getElementById('nav-' + nombre).classList.add('activo');
        if (nombre === 'historial') renderHistorial();
        if (nombre === 'comparar') renderComparar();
        if (nombre === 'sync') renderSync();
        const waFab = document.getElementById('wa-fab');
        if (waFab) waFab.style.display = (nombre === 'frentes') ? 'flex' : 'none';
        window.scrollTo(0, 0);
    }
```
Reemplazar por:
```js
    const SIN_BOTON_PROPIO = ['herramientas', 'historial', 'comparar'];
    function mostrarPantalla(nombre) {
        document.getElementById('paleta3d-panel')?.remove();
        document.getElementById('cs-picker')?.remove();
        document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('activo'));
        document.getElementById('pantalla-' + nombre).classList.add('activa');
        const navId = SIN_BOTON_PROPIO.includes(nombre) ? 'nav-mas' : ('nav-' + nombre);
        document.getElementById(navId)?.classList.add('activo');
        if (nombre === 'historial') renderHistorial();
        if (nombre === 'comparar') renderComparar();
        if (nombre === 'sync') renderSync();
        if (nombre === 'mas') renderMenuAreas();
        const waFab = document.getElementById('wa-fab');
        if (waFab) waFab.style.display = (nombre === 'frentes') ? 'flex' : 'none';
        window.scrollTo(0, 0);
    }
```

- [ ] **Step 2: Agregar 'mas' a `ORDEN_TABS`**

Buscar esta línea exacta:
```js
    const ORDEN_TABS = ['datos', 'frentes', 'herramientas', 'historial', 'comparar', 'sync'];
```
Reemplazar por:
```js
    const ORDEN_TABS = ['datos', 'frentes', 'herramientas', 'historial', 'comparar', 'sync', 'mas'];
```
Nota: `herramientas`/`historial`/`comparar` siguen en `ORDEN_TABS` a propósito — el swipe entre pantallas sigue funcionando igual que antes para llegar a ellas (solo se quitó su botón de la barra, no su lugar en el recorrido de swipe).

- [ ] **Step 3: Verificar sintaxis** (comando de Global Constraints). Esperado: `OK= true blocks= 3`. Nota: en este punto el chequeo puede fallar con `renderMenuAreas is not defined` solo si se ejecutara el código — el chequeo de sintaxis (`new Function`) NO ejecuta el código, solo valida que parsee, así que debe pasar igual aunque `renderMenuAreas` todavía no exista (se crea en la Task 5).

- [ ] **Step 4: Commit**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
fix: mostrarPantalla resiliente a pantallas sin boton propio + mas en swipe

document.getElementById('nav-'+nombre) podia devolver null para
herramientas/historial/comparar tras sacarlos de la barra inferior,
rompiendo con TypeError. Ahora esas 3 resaltan 'nav-mas' en su lugar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 5: `renderMenuAreas()` — generar los botones de área desde los chips existentes

**Files:**
- Modify: `C:\Users\DAIRON NARVAEZ\Desktop\ProyeCar\index.html` — agregar la función junto a `aplicarFiltroCategoria` (línea ~3057, buscar `// ── Chips de categoría`)

**Interfaces:**
- Consumes: `#chips-categorias .chip` (HTML ya existente, atributo `data-catid`, hijos `.chip-icon` y `.chip-label`), función `aplicarFiltroCategoria(catid)` ya existente.
- Produces: función global `renderMenuAreas()`, invocada por `mostrarPantalla()` (Task 4).

- [ ] **Step 1: Agregar la función**

Buscar esta línea exacta:
```js
    // ── Chips de categoría (filtro rápido en tab Frentes) ──
```
Insertar inmediatamente antes:
```js
    // ── Menú "Más": botones de área generados desde los chips existentes ──
    function renderMenuAreas() {
        const cont = document.getElementById('areas-menu-lista');
        if (!cont) return;
        cont.innerHTML = '';
        document.querySelectorAll('#chips-categorias .chip').forEach(chip => {
            const catid = chip.dataset.catid;
            if (catid === 'todos') return;
            const icono = chip.querySelector('.chip-icon').innerHTML;
            const nombre = chip.querySelector('.chip-label').textContent;
            const btn = document.createElement('button');
            btn.className = 'menu-item';
            btn.innerHTML = icono + nombre;
            btn.onclick = () => { mostrarPantalla('frentes'); aplicarFiltroCategoria(catid); };
            cont.appendChild(btn);
        });
    }

```

- [ ] **Step 2: Verificar sintaxis** (comando de Global Constraints). Esperado: `OK= true blocks= 3`.

- [ ] **Step 3: Commit**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && git add index.html && git commit -m "$(cat <<'EOF'
feat: generar botones de area del menu Mas desde los chips existentes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 6: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

- [ ] **Step 1: Servir localmente**
```bash
cd "/c/Users/DAIRON NARVAEZ/Desktop/ProyeCar" && python -m http.server 8901
```

- [ ] **Step 2: Abrir `http://localhost:8901/index.html` en el navegador y verificar, en orden:**
  1. La barra inferior muestra exactamente 4 botones: Datos, Frentes, Sync, Más.
  2. Tocar "Más" → se abre la pantalla con "Secciones principales" (3 filas: Herramientas, Historial de inspección, Comparar inspecciones) y "Áreas de inspección" (5 filas: Ambiental, SST, Jurídica, Social, Técnica — sin "Todos").
  3. Tocar "Herramientas" desde el menú → llega a la pantalla de Herramientas, y el botón "Más" de la barra queda resaltado (no ninguno de los otros 3). Sin errores en la consola del navegador.
  4. Repetir el paso 3 para "Historial de inspección" y "Comparar inspecciones".
  5. Tocar "Ambiental" desde el menú → llega a la pantalla Frentes, con el chip "Ambiental" ya marcado activo y solo esa categoría visible en los frentes.
  6. Recargar la página → confirmar que el filtro "Ambiental" sigue aplicado (persistencia ya existente, no debe romperse).
  7. Deslizar (swipe) de izquierda a derecha empezando en "Sync" → debe llegar a "Más" (último en `ORDEN_TABS`).
  8. Abrir la consola del navegador (F12) y confirmar que no hay ningún error (`TypeError` u otro) durante todo el recorrido anterior.

- [ ] **Step 4: Detener el servidor local**
```bash
pkill -f "http.server 8901"
```

No requiere commit — es solo verificación de lo ya commiteado en las Tasks 1-5.
