# Contrato por frente (multi-contrato por inspección)

## Contexto

Hoy "Contrato" es un solo campo de texto libre en "Datos generales de la inspección" (`<input id="proyecto">`, línea ~823, variable `proyectoInput`), compartido por **todos** los frentes de esa sesión. El usuario a veces inspecciona en un mismo día frentes que pertenecen a contratos distintos (ej. `LP-CARDIQUE-003-2024-GrupoI` y `LP-CARDIQUE-006-2024`), y hoy no hay forma de distinguirlos: quedan mezclados bajo un único nombre de contrato, lo que impide comparar correctamente el historial por contrato y que el PDF los refleje por separado.

`proyectoInput.value` no es solo una etiqueta: hoy alimenta el nombre del archivo descargado (línea ~2876), el título del informe (`generarInformeDireccion`, línea 2444), el nombre mostrado en cada tarjeta de historial (`hist-proyecto`, línea ~3233), las opciones de los `<select>` de Comparar (línea ~3316 `renderComparar`, ~3608, ~4079), y el campo editable en "editar entrada del historial" (`edit-hist-proyecto`, líneas ~3263-3307). Todo esto debe seguir funcionando al mover el contrato al nivel de frente.

## Decisiones confirmadas con el usuario

- El campo global "Contrato" de Datos Generales **desaparece por completo**. Cada frente gana un campo propio `contrato` (texto libre), igual patrón que el `contratista` que ya existe por frente.
- Coincidencia entre inspecciones: **texto exacto** del campo `contrato` (normalizado internamente con `trim()` + minúsculas para no fallar por mayúsculas/espacios de más, pero sin pedirle al usuario un código corto aparte).
- El nombre que identifica cada informe (historial, PDF, nombre de archivo) se **calcula automáticamente**: se listan los valores distintos de `contrato` entre los frentes de esa inspección, unidos con `" + "` (ej. `"LP-CARDIQUE-003-2024-GrupoI + LP-CARDIQUE-006-2024"`). Sin campo nuevo que llenar a mano.
- Informes ya guardados en el historial **antes** de este cambio (sin `contrato` por frente) siguen mostrando su `proyecto` original tal cual — no se migran ni se pierden.
- PDF de una sola inspección: si sus frentes tienen más de un `contrato` distinto, el informe agrupa los frentes en secciones por contrato (con su propio resumen/KPIs por sección). Si todos comparten el mismo contrato, el resultado es igual al actual salvo por la etiqueta.
- Comparar: al elegir las 2 inspecciones guardadas (como ya se hace hoy), la app calcula la unión de contratos presentes en cualquiera de las dos y genera **una sección de comparación por cada contrato**, automáticamente. Si un contrato solo existe en una de las dos fechas, esa sección lo indica ("sin datos para este contrato en esta fecha") en vez de fallar o mostrar vacío sin explicación.
- En "editar entrada del historial" se **quita** el campo de texto editable `edit-hist-proyecto` (ya no tiene sentido editarlo a mano); se muestra el nombre calculado como texto de solo lectura.

## Arquitectura

Sin infraestructura nueva. Se extiende el modelo de datos existente (`frente.contrato`, mismo patrón que `frente.contratista`) y se añade una función pura de agrupación (`agruparPorContrato(frentesData)`) reutilizada en tres sitios: render de historial/nombre, generación del PDF individual, y generación de la comparación. El filtro por contrato en Comparar reutiliza el mismo patrón visual que los `<select id="filtro-frente">` / `<select id="filtro-area">` que ya existen.

## Componentes a modificar

### 1. Datos generales (HTML + JS)
- Quitar `<div class="form-group">` del input `id="proyecto"` (línea ~823) y su listener `proyectoInput.addEventListener("input", saveToLocal)` (línea ~2943), junto con `const proyectoInput = document.getElementById("proyecto")` (línea 1425).
- Todas las lecturas de `proyectoInput.value` (nombre de archivo ~2876, `data.proyecto` en guardar/historial ~2357, ~3128) se reemplazan por el resultado de una nueva función `nombreInspeccion(frentesData)` que arma el string descrito arriba.

### 2. Modelo de datos por frente
- Agregar `contrato: ""` en **todos** los puntos donde hoy se crea un objeto de frente sin ese campo: el array inicial por defecto (`let frentes = [...]`, ~línea 1409), el reinicio de la app (`frentes = [...]` dentro de la función de reset, ~línea 1530), y el alta de frente nuevo vía el botón "Agregar nuevo frente" (`frentes.push({...})`, ~línea 2366 — verificar número exacto al implementar, el archivo cambia de tamaño con cada fix). Buscar por el literal `categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE))` para no dejar ninguno afuera.
- En el render de cada tarjeta de frente (junto al input de `contratista`), agregar un `<input>` de texto para `frente.contrato`, mismo estilo visual, con su propio `addEventListener("change", ...)` que guarda `frentes[idx].contrato = valor` y llama `saveToLocal()`.
- `frentes.map(f => ({...}))` u otras copias/serializaciones existentes (ej. al guardar en historial o exportar) deben incluir `contrato` sin cambios, ya que usan spread/JSON completo del objeto frente — no requieren tocarse mientras no filtren campos explícitamente.

### 3. Función compartida `agruparPorContrato(frentesData)`
Nueva función utilitaria: recibe el array de frentes, devuelve un array de grupos `{ contrato: string, frentes: [...] }`, en el orden en que cada contrato aparece por primera vez. Frentes con `contrato` vacío/no definido (informes viejos o campo sin llenar) caen en un grupo `"Sin contrato especificado"`. La comparación de "mismo contrato" usa `contrato.trim().toLowerCase()` para agrupar, pero conserva el texto original (del primer frente que lo usó) para mostrarlo.

### 4. Historial (`renderComparar` y guardado, líneas ~3128-3321)
- Guardar historial: en vez de `proyecto: proyectoInput.value`, usar `proyecto: nombreInspeccion(frentes)` (se sigue llamando `proyecto` en el objeto guardado, por compatibilidad con entradas viejas — es solo el nombre calculado).
- Tarjeta de historial (`hist-proyecto`, línea ~3233) y las opciones de los `<select>` de comparar (~3608, ~4079): sin cambios de código, ya que siguen leyendo `r.proyecto`, que ahora ya viene pre-calculado al guardar.
- Diálogo "editar entrada de historial" (~3263-3307): quitar el `<input id="edit-hist-proyecto">` editable y su asignación en `hist[idx].proyecto = ...` (línea ~3284); mostrar el valor como texto plano.

### 5. PDF individual (`generarInformeDireccion`, línea 2444)
Antes de recorrer `frentes` para armar las secciones del informe, llamar `agruparPorContrato(frentes)`. Si el resultado tiene más de un grupo, insertar un encabezado de sección (mismo estilo que `.sec-h` ya usado para "Resumen Global") con el nombre del contrato antes de los frentes de ese grupo, y calcular el resumen/KPIs (`calcularPct`, línea 3108) por grupo además del global. Si hay un solo grupo, el comportamiento es idéntico al actual.

### 6. Comparar (`renderComparar` / `generarInformeConComparacion`, líneas 3316 / 3985)
- Al seleccionar las 2 inspecciones, calcular `agruparPorContrato` sobre los frentes de cada una y obtener la unión de contratos.
- Por cada contrato en la unión, generar una sección de comparación (reutilizando la lógica actual de comparación por frente/área, ya que un "grupo por contrato" es solo un subconjunto de frentes) usando los frentes de ese contrato de cada lado; si un lado no tiene frentes de ese contrato, la sección lo indica explícitamente en vez de comparar contra un array vacío sin aviso.
- El filtro existente `filtro-frente` / `filtro-area` sigue aplicando *dentro* de cada sección de contrato, sin cambios de comportamiento.

## Riesgos a verificar durante la implementación

- Se asume que la lógica actual de comparación (`renderComparar`, `generarInformeConComparacion`, `generarGraficasComparacionPDF`) puede recibir un subconjunto de frentes (los de un solo contrato) en vez del array completo de cada inspección, sin más cambios que el filtrado previo. No se leyó el cuerpo completo de esas 3 funciones en este brainstorming — el plan de implementación debe confirmarlo primero (spike corto) antes de construir el agrupado automático por contrato; si alguna de esas funciones depende de índices globales de `frentes` en vez de recibir el array como parámetro, necesitará un ajuste adicional no cubierto aquí.

## Manejo de errores / casos borde

- Frente sin `contrato` llenado → cae en el grupo "Sin contrato especificado" (no rompe el agrupado ni el PDF).
- Informe viejo del historial (sin `contrato` en sus frentes) comparado contra uno nuevo → el lado viejo entero cae en "Sin contrato especificado"; se compara igual, solo que agrupado bajo esa etiqueta en vez de por código real.
- Los dos lados de una comparación no comparten ningún contrato → se muestran ambas secciones por separado, cada una con "sin datos para este contrato" del lado contrario, en vez de una comparación vacía o un error.
