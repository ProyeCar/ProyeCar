# Navegación: barra inferior reducida + pantalla "Más"

## Contexto

La barra inferior (`.nav-bar`) tiene hoy 6 botones (Datos, Frentes, Herramientas, Historial, Comparar, Sync). El usuario considera que son demasiados y se ve recargado. Se decidió reducir la barra a los 4 accesos de uso más frecuente en campo y agrupar el resto detrás de un botón "Más" que abre una pantalla de menú con dos secciones. Ningún flujo ni función existente cambia — solo se reorganiza cómo se llega a cada pantalla.

## Decisiones confirmadas con el usuario

- Barra inferior final: **Datos, Frentes, Sync, Más** (4 botones).
- Pantalla "Más" es una 7ª pantalla (`#pantalla-mas`), no un modal — se integra a `ORDEN_TABS` y al swipe existente.
- Sección "Secciones principales" del menú: **solo** Herramientas, Historial, Comparar (no se duplican Datos/Frentes/Sync, ya están siempre visibles en la barra).
- Sección "Áreas de inspección" del menú: los 5 chips existentes (Ambiental, SST, Social, Técnica, Jurídica), generados dinámicamente leyendo `#chips-categorias .chip` (no se hardcodean, para no duplicar íconos/nombres en dos lugares).
- Tocar un área en el menú → `mostrarPantalla('frentes')` + `aplicarFiltroCategoria(catid)` (reutiliza el filtro y la persistencia que ya existen).
- "Crear nueva área" **no** va en el menú — es una acción por-frente que ya vive dentro de cada tarjeta de frente (`+ Agregar área nueva`); no tiene sentido como acceso global sin frente elegido.
- Mientras el usuario está en Herramientas/Historial/Comparar (pantallas sin botón propio en la barra), el botón **"Más" queda visualmente resaltado/activo** en la barra inferior.

## Arquitectura

Sin componentes nuevos de infraestructura — se añade una pantalla más al patrón ya existente de `.pantalla` + `mostrarPantalla(nombre)` + `ORDEN_TABS`, y una función de render pequeña para la lista de áreas del menú.

## Componentes a modificar/crear

### 1. HTML — barra inferior (`<nav class="nav-bar">`)
Quitar los `<button class="nav-btn" id="nav-herramientas">`, `id="nav-historial"`, `id="nav-comparar"`. Agregar `<button class="nav-btn" id="nav-mas" onclick="mostrarPantalla('mas')">` con ícono de menú (☰ o similar) y label "Más". Los `<div id="pantalla-herramientas">`, `id="pantalla-historial">`, `id="pantalla-comparar">` **no se tocan** — siguen existiendo exactamente igual, solo dejan de tener un botón dedicado abajo.

### 2. HTML — nueva pantalla `#pantalla-mas`
Estructura con dos bloques:
```html
<div id="pantalla-mas" class="pantalla"><div class="container">
  <h3>Secciones principales</h3>
  <div class="menu-lista">
    <button class="menu-item" onclick="mostrarPantalla('herramientas')">🛠️ Herramientas</button>
    <button class="menu-item" onclick="mostrarPantalla('historial')">📜 Historial de inspección</button>
    <button class="menu-item" onclick="mostrarPantalla('comparar')">📊 Comparar inspecciones</button>
  </div>
  <h3>Áreas de inspección</h3>
  <div class="menu-lista" id="areas-menu-lista"></div>
</div></div>
```
`#areas-menu-lista` se llena en JS (ver punto 4), no se hardcodea.

### 3. CSS — estilo del menú
Nuevas clases `.menu-lista` (columna de filas) y `.menu-item` (tarjeta tocable, mismo lenguaje visual que `.hist-item`/`.frente-card`: fondo blanco, borde suave, ícono + texto, sin los efectos `transform` de presión que ya se quitaron en el fix anterior). Reutilizar variables de color existentes (`--verde-vivo`, etc.), no inventar paleta nueva.

### 4. JS
- `ORDEN_TABS`: agregar `'mas'` al final del array.
- `mostrarPantalla(nombre)`:
  - **Fix de robustez (línea ~2974)**: cambiar `document.getElementById('nav-' + nombre).classList.add('activo')` a `document.getElementById('nav-' + nombre)?.classList.add('activo')`, porque ahora hay pantallas (`herramientas`/`historial`/`comparar`) sin botón propio en la barra — sin este fix, navegar a esas pantallas tira `TypeError`.
  - Agregar lógica: si `nombre` es `'herramientas'`, `'historial'` o `'comparar'`, marcar `nav-mas` como `.activo` en su lugar (ya que esas 3 no tienen botón propio).
  - Si `nombre === 'mas'`, llamar a `renderMenuAreas()` (ver siguiente punto) para refrescar la lista de áreas.
- **Nueva función `renderMenuAreas()`**: lee `document.querySelectorAll('#chips-categorias .chip')`, **excluye el chip `data-catid="todos"`** (no es un área real, es el filtro "mostrar todas"), y por cada chip restante crea un botón en `#areas-menu-lista` con el mismo ícono (`.chip-icon`) y nombre (`.chip-label`), con `onclick` que hace `mostrarPantalla('frentes')` seguido de `aplicarFiltroCategoria(chip.dataset.catid)`. Confirmado en el HTML actual: los `data-catid` existentes son `ambiental`, `sst`, `juridica`, `social`, `tecnica`, `todos` — 5 áreas reales + el chip "todos" a excluir.

## Flujo de datos

Todo reutiliza funciones ya existentes y probadas (`mostrarPantalla`, `aplicarFiltroCategoria`, la persistencia en `localStorage` de la categoría activa) — no se introduce lógica de negocio nueva, solo nuevos puntos de entrada hacia pantallas y filtros que ya funcionan.

## Manejo de errores

El único caso de error real identificado es el `TypeError` de `mostrarPantalla()` descrito arriba (línea ~2974), resuelto con optional chaining. No hay otros casos: `renderMenuAreas()` lee del DOM estático (`#chips-categorias` siempre existe desde la carga inicial), no hay fetch ni async.

## Verificación

1. Chequeo de sintaxis JS (mismo método `node -e` usado en toda la sesión).
2. Manual en navegador: swipe por las 7 pantallas en orden, confirmar que "Más" se resalta correctamente en Herramientas/Historial/Comparar y que Datos/Frentes/Sync/Más se resaltan en las suyas.
3. Tocar cada fila de "Secciones principales" desde el menú → confirma que llega a la pantalla correcta sin error en consola.
4. Tocar cada área del menú → confirma que llega a Frentes con el chip de esa área ya activo y los ítems filtrados; recargar página y confirmar que el filtro persiste (ya cubierto por `aplicarFiltroCategoria` existente).
5. Revisar consola del navegador sin errores en todo el recorrido.
6. Commit + push directo a `main` (mismo flujo de esta sesión) una vez confirmado.
