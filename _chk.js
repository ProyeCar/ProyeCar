
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js');
        });
      }
    


    // ============================================================
    // INDEXEDDB — almacenamiento de fotos (sin límite de localStorage)
    // ============================================================
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

    async function idbGuardarFoto(id, dataUrl) {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put({ id, dataUrl });
            tx.oncomplete = () => res();
            tx.onerror    = e => rej(e.target.error);
        });
    }

    async function idbLeerFotos(ids) {
        if (!ids || !ids.length) return {};
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx    = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const map   = {};
            let pending = ids.length;
            ids.forEach(id => {
                const req = store.get(id);
                req.onsuccess = e => {
                    if (e.target.result) map[id] = e.target.result.dataUrl;
                    if (--pending === 0) res(map);
                };
                req.onerror = () => { if (--pending === 0) res(map); };
            });
        });
    }

    async function idbEliminarFoto(id) {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(id);
            tx.oncomplete = () => res();
            tx.onerror    = e => rej(e.target.error);
        });
    }

    async function idbTodas() {
        const db = await abrirIDB();
        return new Promise((res, rej) => {
            const tx  = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAll();
            req.onsuccess = e => res(e.target.result || []);
            req.onerror   = e => rej(e.target.error);
        });
    }

    // Genera un ID único por foto
    function fotoId(frenteIdx, timestamp) {
        return 'foto_' + frenteIdx + '_' + timestamp;
    }

    // ======================== MODELO DE DATOS ========================
    const CATEGORIAS_BASE = [
        { id: "ambiental", nombre: "🌱 Ambiental", tipo: "auto", obs: "", rec: "", items: [
            { id: "amb1", texto: "Buen orden y aseo en el frente de obra.", cumple: null, obs: "" },
            { id: "amb2", texto: "Manejo adecuado de residuos sólidos.", cumple: null, obs: "" },
            { id: "amb3", texto: "Puntos ecológicos en buen estado.", cumple: null, obs: "" },
            { id: "amb4", texto: "Control de material particulado (Carque y descargue de material por volquetas)", cumple: null, obs: "" }
        ]},
        { id: "sst", nombre: "⛑️ Seguridad y Salud (SST)", tipo: "auto", obs: "", rec: "", items: [
            { id: "sst1", texto: "Uso de EPP por cada trabajador, según su actividad.", cumple: null, obs: "" },
            { id: "sst2", texto: "Señalización y aislamiento.", cumple: null, obs: "" },
            { id: "sst3", texto: "Capacitaciones e inducciones de seguridad al día.", cumple: null, obs: "" },
            { id: "sst4", texto: "Paletero en cruces viales.", cumple: null, obs: "" },
            { id: "sst5", texto: "Botiquín, kit antiderrame y extintor disponible.", cumple: null, obs: "" },
            { id: "sst6", texto: "Inspecciones diarias preoperacionales.", cumple: null, obs: "" },
            { id: "sst7", texto: "Plan de contingencia actualizado e implementado.", cumple: null, obs: "" }
        ]},
        { id: "juridica", nombre: "⚖️ Jurídica", tipo: "manual", obs: "", rec: "", items: [
            { id: "jur1", texto: "Vigencia del contrato y actas al día.", cumple: null, obs: "" },
            { id: "jur2", texto: "Pólizas de seguros actualizadas y vigentes.", cumple: null, obs: "" },
            { id: "jur3", texto: "Licencias y permisos ambientales vigentes.", cumple: null, obs: "" },
            { id: "jur4", texto: "Registro de modificaciones contractuales.", cumple: null, obs: "" }
        ]},
        { id: "tecnica", nombre: "🔧 Técnica", tipo: "manual", obs: "", rec: "", items: [
            { id: "tec1", texto: "Cumplimiento del cronograma de obra.", cumple: null, obs: "" },
            { id: "tec2", texto: "Calidad de materiales según especificaciones.", cumple: null, obs: "" },
            { id: "tec3", texto: "Registros de laboratorio y ensayos al día.", cumple: null, obs: "" },
            { id: "tec4", texto: "Bitácora de obra diligenciada.", cumple: null, obs: "" }
        ]},
        { id: "social", nombre: "👥 Social", tipo: "manual", obs: "", rec: "", items: [
            { id: "soc1", texto: "Socialización e información a comunidades aledañas.", cumple: null, obs: "" },
            { id: "soc2", texto: "Contratación de mano de obra local (mín. 10%).", cumple: null, obs: "" },
            { id: "soc3", texto: "Mecanismo de atención de quejas y reclamos activo.", cumple: null, obs: "" },
            { id: "soc4", texto: "Señalización peatonal alterna implementada.", cumple: null, obs: "" }
        ]}
    ];


    // ── SUGERENCIAS TÉCNICAS EXPERTAS – AMBIENTAL & SST OBRAS CIVILES ──
    const SUGERENCIAS = {
        "amb1": "Se evidencia desorden y residuos sin clasificar en el frente de obra. Se recomienda realizar limpieza y segregación. Incumple Decreto 1076 de 2015 y PMA aprobado.",
        "amb2": "Se observa manejo inadecuado de residuos: mezcla sin separación en fuente. Incumple Decreto 1076 de 2015.",
        "amb3": "Puntos ecológicos deteriorados, sin tapa o sin rotulación correcta (GTC 24). Incumple Decreto 1076 de 2015.",
        "amb4": "Sin control de material particulado en operaciones de cargue/descargue. Se recomienda humectación y cubrimiento de volquetas. Incumple Decreto 1076 de 2015.",
        "sst1": "Se evidencia personal sin EPP completo o con dotación en mal estado. Se recomienda corrección inmediata. Incumple Resolución 0312 de 2019.",
        "sst2": "Señalización vial deficiente o no conforme al esquema PMT aprobado. Incumple Manual de Señalización Vial MINTRANSPORTE 2015.",
        "sst3": "Inducciones o capacitaciones SST sin vigencia o sin registro. Incumple Decreto 1072 de 2015 y Resolución 0312 de 2019.",
        "sst4": "Sin paletero certificado en cruce vial. Incumple PMT aprobado y Código Nacional de Tránsito Art. 101.",
        "sst5": "Botiquín, kit antiderrame o extintor incompleto o con vigencia vencida. Incumple Decreto 1072 de 2015.",
        "sst6": "Sin registros preoperacionales diligenciados para la maquinaria. Incumple Resolución 0312 de 2019.",
        "sst7": "Plan de emergencias desactualizado o no socializado con el personal. Incumple Decreto 1072 de 2015."
    };

    const SUGERENCIAS_CUMPLE = {
        "amb1": "Orden y aseo conformes en frente de obra. Cumple Decreto 1076 de 2015 y PMA aprobado.",
        "amb2": "Manejo de residuos sólidos conforme: separación en fuente y disposición correcta. Cumple Decreto 1076 de 2015.",
        "amb3": "Puntos ecológicos en buen estado y correctamente rotulados (GTC 24). Cumple Decreto 1076 de 2015.",
        "amb4": "Control de material particulado efectivo: humectación y cubrimiento de volquetas. Cumple Decreto 1076 de 2015.",
        "sst1": "EPP completo y en buen estado en el 100% del personal. Cumple Resolución 0312 de 2019.",
        "sst2": "Señalización vial conforme al esquema PMT aprobado. Cumple Manual de Señalización Vial MINTRANSPORTE 2015.",
        "sst3": "Capacitaciones e inducciones SST vigentes y registradas. Cumple Decreto 1072 de 2015 y Resolución 0312 de 2019.",
        "sst4": "Paletero certificado presente en cruces viales con elementos reglamentarios. Cumple PMT aprobado.",
        "sst5": "Botiquín, kit antiderrame y extintor completos y vigentes. Cumple Decreto 1072 de 2015.",
        "sst6": "Registros preoperacionales de maquinaria diligenciados y actualizados. Cumple Resolución 0312 de 2019.",
        "sst7": "Plan de emergencias actualizado, socializado y con brigada designada. Cumple Decreto 1072 de 2015."
    };

    function getSugerencia(itemId) {
        return SUGERENCIAS[itemId] || null;
    }

    function getSugerenciaCumple(itemId) {
        return SUGERENCIAS_CUMPLE[itemId] || null;
    }

    function autoActualizarFrente(frenteIdx, obsEl, recEl) {
        var fr = frentes[frenteIdx];
        if (!fr) return;
        var nosCumplen = [], hayCumple = false;
        fr.categorias.forEach(function(cat) {
            cat.items.forEach(function(it) {
                if (it.cumple === false) nosCumplen.push(it);
                else if (it.cumple === true) hayCumple = true;
            });
        });

        function aplicarAuto(el, prop, nuevoAuto) {
            if (!el || !nuevoAuto) return;
            var old = el.dataset.autoText || "";
            var cur = (el.value || "").trim();
            var user = cur;
            if (old && cur.endsWith(old)) {
                user = cur.slice(0, cur.length - old.length).trimEnd();
            }
            var next = user ? user + "\n" + nuevoAuto : nuevoAuto;
            fr[prop] = next;
            el.value = next;
            el.dataset.autoText = nuevoAuto;
        }

        var autoObs = "";
        if (hayCumple && nosCumplen.length === 0) {
            autoObs = "Frente conforme. Mantener condiciones actuales.";
        } else if (nosCumplen.length > 0) {
            var nombres = nosCumplen.slice(0, 2).map(function(it) {
                return it.texto.substring(0, 50);
            }).join("; ");
            autoObs = "Hallazgos: " + nombres + (nosCumplen.length > 2 ? "; y otros." : ".");
        }
        aplicarAuto(obsEl, 'observaciones', autoObs);

        var autoRec = "";
        if (nosCumplen.length > 0) {
            var hasAmb  = nosCumplen.some(function(it){ return it.id && it.id.indexOf('amb') === 0; });
            var hasSena = nosCumplen.some(function(it){ return it.id === 'sst2'; });
            var hasSst  = nosCumplen.some(function(it){ return it.id && it.id.indexOf('sst') === 0 && it.id !== 'sst2'; });
            var parts = [];
            if (hasAmb)  parts.push("Corregir incumplimientos ambientales (Decreto 1076/2015)");
            if (hasSena) parts.push("Reinstalar señalización vial (Manual MINTRANSPORTE 2015)");
            if (hasSst)  parts.push("Subsanar deficiencias SST (Res. 0312/2019 y Decreto 1072/2015)");
            if (parts.length) autoRec = parts.join(". ") + ". Acción correctiva requerida.";
        } else if (hayCumple) {
            autoRec = "Frente conforme en todos los ítems. Continuar buenas prácticas ambientales y SST.";
        }
        aplicarAuto(recEl, 'recomendaciones', autoRec);
    }

    let frentes = [
        { nombre: "Frente 1 - Arroyo Ají Molido", categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" },
        { nombre: "Frente 2 - Box Matagente", categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" }
    ];

    // Elementos DOM
    const frentesContainer = document.getElementById("frentes-container");
    const btnResetGlobal = document.getElementById("reset-global");
    const btnExportarJson = document.getElementById("exportar-json");
    const btnGenerarPdf = document.getElementById("generar-pdf");
    const btnGuardarManual = document.getElementById("guardar-manual");
    const saveIndicator = document.getElementById("save-indicator");
    const fechaInput = document.getElementById("fecha");
    const btnAgregarFrente = document.getElementById("agregar-frente");
    const logoImg = document.getElementById("logo-img");
    const logoFileInput = document.getElementById("logo-file-input");
    const proyectoInput = document.getElementById("proyecto");
    const ubicacionInput = document.getElementById("ubicacion");
    const inspectorInput = document.getElementById("inspector");

    fechaInput.valueAsDate = new Date();

    function showSavedMessage() { saveIndicator.textContent = "✅ Datos guardados"; setTimeout(() => saveIndicator.textContent = "", 2000); }
    function getFormValues() {
        return {
            proyecto:  document.getElementById("proyecto").value,
            fecha:     document.getElementById("fecha").value,
            ubicacion: document.getElementById("ubicacion").value,
            inspector: document.getElementById("inspector").value
        };
    }
    function saveToLocal() {
        const form = getFormValues();
        try {
            const data = { frentes, ...form };
            localStorage.setItem("inspectorFrentesData", JSON.stringify(data));
            showSavedMessage();
            return true;
        } catch(e) {
            try {
                const dataNoFotos = { frentes: frentes.map(f => ({...f, fotos:[]})), ...form };
                localStorage.setItem("inspectorFrentesData", JSON.stringify(dataNoFotos));
                showSavedMessage();
            } catch(e2) { console.warn("Storage full"); }
            return true;
        }
    }
    async function loadFromLocal() {
        // Pre-cargar todas las fotos de IDB en caché de memoria
        try {
            const todas = await idbTodas();
            if (!window._fotoCache) window._fotoCache = {};
            todas.forEach(r => { window._fotoCache[r.id] = r.dataUrl; });
        } catch(e) { console.warn('IDB load error:', e); }

        const saved = localStorage.getItem("inspectorFrentesData");
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.frentes) {
                    frentes = data.frentes;
                    // Migrar categorías antiguas al nuevo formato de áreas
                    frentes.forEach(function(fr) {
                        (fr.categorias || []).forEach(function(cat) {
                            if (!cat.tipo) cat.tipo = (cat.id === 'ambiental' || cat.id === 'sst') ? "auto" : "manual";
                            if (cat.obs === undefined) cat.obs = "";
                            if (cat.rec === undefined) cat.rec = "";
                        });
                    });
                }
                proyectoInput.value = data.proyecto || "";
                fechaInput.value = data.fecha || "";
                ubicacionInput.value = data.ubicacion || "";
                inspectorInput.value = data.inspector || "";
            } catch(e) { console.error(e); }
        } else {
            frentes = [
                { nombre: "Frente 1 - Arroyo Ají Molido", categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" },
                { nombre: "Frente 2 - Box Matagente", categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" }
            ];
        }
        renderFrentes();
    }
    const savedLogo = localStorage.getItem("cardique_logo");
    if (savedLogo) { logoImg.src = savedLogo; }
    logoFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (ev) => { logoImg.src = ev.target.result; localStorage.setItem("cardique_logo", ev.target.result); };
            reader.readAsDataURL(file);
        }
    };
    function renderFrentes() {
        frentesContainer.innerHTML = "";
        frentes.forEach((frente, idx) => {
            const frenteDiv = document.createElement("div");
            frenteDiv.className = "frente-card";
            const headerDiv = document.createElement("div");
            headerDiv.className = "frente-header";
            // Toggle arrow
            const toggleArrow = document.createElement("span");
            toggleArrow.className = "frente-toggle open";
            toggleArrow.innerText = "▶";
            const tituloDiv = document.createElement("div");
            tituloDiv.className = "frente-titulo";
            const nombreInput = document.createElement("input");
            nombreInput.type = "text";
            nombreInput.value = frente.nombre;
            nombreInput.style.width = "70%";
            nombreInput.style.fontWeight = "bold";
            nombreInput.addEventListener("change", (e) => { frentes[idx].nombre = e.target.value; saveToLocal(); });
            tituloDiv.appendChild(nombreInput);
            const contratLabel = document.createElement("label");
            contratLabel.innerText = "🏢 Contratista:";
            contratLabel.style.cssText = "font-size:0.82rem;color:#ffffff;margin-left:10px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.4);";
            const contratInput = document.createElement("input");
            contratInput.type = "text";
            contratInput.placeholder = "Nombre del contratista";
            contratInput.value = frente.contratista || "";
            contratInput.style.cssText = "width:55%;font-size:0.85rem;margin-left:6px;padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;";
            contratInput.addEventListener("change", (e) => { frentes[idx].contratista = e.target.value; saveToLocal(); });
            tituloDiv.appendChild(contratLabel);
            tituloDiv.appendChild(contratInput);
            const btnEliminar = document.createElement("button");
            btnEliminar.innerText = "🗑️ Eliminar frente";
            btnEliminar.className = "btn-eliminar-frente";
            btnEliminar.onclick = () => { setTimeout(() => { if (confirm("¿Eliminar este frente?")) { frentes.splice(idx, 1); saveToLocal(); renderFrentes(); } }, 10); };
            tituloDiv.prepend(toggleArrow);
            headerDiv.appendChild(tituloDiv);
            headerDiv.appendChild(btnEliminar);
            frenteDiv.appendChild(headerDiv);

            // Body wrapper for collapse
            const frenteBody = document.createElement("div");
            frenteBody.className = "frente-body";

            headerDiv.addEventListener("click", (e) => {
                if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
                const isOpen = !frenteBody.classList.contains("collapsed");
                frenteBody.classList.toggle("collapsed");
                toggleArrow.classList.toggle("open");
            });

            frente.categorias.forEach((cat, catIdx) => {
                const catDiv = document.createElement("div"); catDiv.className = "categoria";
                const catTitulo = document.createElement("div"); catTitulo.className = "cat-titulo";
                catTitulo.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;";
                const catToggle = document.createElement("span"); catToggle.className = "cat-toggle open"; catToggle.innerText = "▶";
                const catNombre = document.createElement("span"); catNombre.innerText = cat.nombre; catNombre.style.flex = "1";
                const catBtnsDiv = document.createElement("div"); catBtnsDiv.style.cssText = "display:flex;gap:4px;align-items:center;flex-shrink:0;";
                const btnRenArea = document.createElement("button"); btnRenArea.innerText = "✏️"; btnRenArea.title = "Renombrar área";
                btnRenArea.style.cssText = "background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:3px 7px;border-radius:14px;font-size:0.72rem;cursor:pointer;box-shadow:none;";
                btnRenArea.onclick = (e) => { e.stopPropagation(); setTimeout(() => { const n = prompt("Renombrar área:", cat.nombre); if (n && n.trim()) { frentes[idx].categorias[catIdx].nombre = n.trim(); saveToLocal(); renderFrentes(); } }, 10); };
                const btnDelArea = document.createElement("button"); btnDelArea.innerText = "🗑️"; btnDelArea.title = "Eliminar esta área";
                btnDelArea.style.cssText = "background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:3px 7px;border-radius:14px;font-size:0.72rem;cursor:pointer;box-shadow:none;";
                btnDelArea.onclick = (e) => { e.stopPropagation(); setTimeout(() => { if (confirm("¿Eliminar el área \"" + cat.nombre + "\"?\nSe perderán todos sus ítems.")) { frentes[idx].categorias.splice(catIdx, 1); saveToLocal(); renderFrentes(); } }, 10); };
                catBtnsDiv.appendChild(btnRenArea); catBtnsDiv.appendChild(btnDelArea); catBtnsDiv.appendChild(catToggle);
                catTitulo.appendChild(catNombre); catTitulo.appendChild(catBtnsDiv);
                catDiv.appendChild(catTitulo);
                const catBody = document.createElement("div"); catBody.className = "cat-body"; catBody.style.cssText = "padding-top:8px;";
                catTitulo.addEventListener("click", (ev) => {
                    if (ev.target.tagName === "BUTTON") return;
                    catBody.classList.toggle("collapsed"); catToggle.classList.toggle("open");
                });
                const itemsDiv = document.createElement("div"); itemsDiv.className = "items-grid";
                cat.items.forEach((item, itemIdx) => {
                    const itemCard = document.createElement("div"); itemCard.className = "item-card";
                    const row = document.createElement("div"); row.className = "item-row";
                    const desc = document.createElement("div"); desc.className = "item-desc"; desc.innerText = item.texto;
                    const acciones = document.createElement("div"); acciones.className = "item-actions";
                    const estadoDiv = document.createElement("div"); estadoDiv.className = "estado-btns";
                    const btnSi = document.createElement("button"); btnSi.innerText = "✅ Cumple"; btnSi.className = `btn-cumple ${item.cumple === true ? "activo" : ""}`;
                    const btnNo = document.createElement("button"); btnNo.innerText = "❌ No cumple"; btnNo.className = `btn-nocumple ${item.cumple === false ? "activo" : ""}`;
                    // Create obsInput first so btnNo can reference it
                    const obsDiv = document.createElement("div"); obsDiv.className = "item-obs";
                    const obsInput = document.createElement("textarea"); obsInput.placeholder = "Observación del inspector..."; obsInput.value = item.obs || ""; obsInput.rows = 2;
                    obsInput.oninput = (e) => { item.obs = e.target.value; saveToLocal(); };

                    btnSi.onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        item.cumple = true;
                        btnSi.classList.add('activo'); btnNo.classList.remove('activo');
                        if (cat.tipo === "auto") {
                            const sugC = getSugerenciaCumple(item.id);
                            if (sugC) { item.obs = sugC; obsInput.value = sugC; }
                            else { item.obs = "Condición verificada y conforme. Cumple normativa vigente."; obsInput.value = item.obs; }
                            obsInput.style.background = '#f0fdf4';
                            setTimeout(() => { obsInput.style.background = ''; }, 2000);
                        }
                        autoActualizarFrente(idx, obsTextarea, recTextarea);
                        saveToLocal();
                    };
                    btnNo.onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        item.cumple = false;
                        btnNo.classList.add('activo'); btnSi.classList.remove('activo');
                        if (cat.tipo === "auto") {
                            const sugN = getSugerencia(item.id);
                            if (sugN) { item.obs = sugN; obsInput.value = sugN; }
                            else { item.obs = "No conformidad evidenciada. Requiere corrección inmediata. Incumple normativa vigente."; obsInput.value = item.obs; }
                            obsInput.style.background = '#fefce8';
                            setTimeout(() => { obsInput.style.background = ''; }, 2000);
                        }
                        autoActualizarFrente(idx, obsTextarea, recTextarea);
                        saveToLocal();
                    };
                    estadoDiv.appendChild(btnSi); estadoDiv.appendChild(btnNo);
                    const editar = document.createElement("button"); editar.innerHTML = "✏️"; editar.className = "btn-editar";
                    editar.onclick = () => {
                        setTimeout(() => {
                            const nuevo = prompt("Editar ítem:", item.texto);
                            if (nuevo && nuevo.trim()) {
                                item.texto = nuevo.trim();
                                desc.innerText = nuevo.trim();
                                saveToLocal();
                            }
                        }, 10);
                    };
                    const eliminar = document.createElement("button"); eliminar.innerHTML = "🗑️"; eliminar.className = "btn-eliminar";
                    eliminar.onclick = () => {
                        setTimeout(() => {
                            if (confirm("¿Eliminar ítem?")) {
                                cat.items.splice(itemIdx, 1);
                                itemCard.remove();
                                saveToLocal();
                            }
                        }, 10);
                    };
                    acciones.appendChild(estadoDiv); acciones.appendChild(editar); acciones.appendChild(eliminar);
                    row.appendChild(desc); row.appendChild(acciones);
                    obsDiv.appendChild(obsInput);
                    itemCard.appendChild(row); itemCard.appendChild(obsDiv);
                    itemsDiv.appendChild(itemCard);
                });
                catBody.appendChild(itemsDiv);
                catDiv.appendChild(catBody);
                const btnAgregarItem = document.createElement("div"); btnAgregarItem.className = "agregar-item"; btnAgregarItem.innerHTML = "➕ Agregar ítem a esta categoría";
                btnAgregarItem.onclick = () => { setTimeout(() => {
                    const texto = prompt("Nombre del nuevo ítem:");
                    if (texto && texto.trim()) {
                        cat.items.push({ id: "item_" + Date.now(), texto: texto.trim(), cumple: null, obs: "" });
                        saveToLocal();
                        renderFrentes();
                    }
                }, 10); };
                catDiv.appendChild(btnAgregarItem);
                frenteBody.appendChild(catDiv);
            });

            // Botón agregar nueva área al frente
            const btnAgregarArea = document.createElement("button");
            btnAgregarArea.innerHTML = "➕ Agregar nueva área a este frente";
            btnAgregarArea.style.cssText = "background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1.5px dashed #3b82f6;color:#1d4ed8;padding:7px 18px;border-radius:30px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.82rem;font-weight:700;margin:6px 0 12px;box-shadow:none;transition:background 0.2s;";
            btnAgregarArea.onmouseover = () => { btnAgregarArea.style.background = "#dbeafe"; };
            btnAgregarArea.onmouseout  = () => { btnAgregarArea.style.background = "linear-gradient(135deg,#eff6ff,#dbeafe)"; };
            btnAgregarArea.onclick = () => { setTimeout(() => {
                const nombre = prompt("Nombre de la nueva área:", "Nueva área");
                if (nombre && nombre.trim()) {
                    frentes[idx].categorias.push({ id: "area_" + Date.now(), nombre: nombre.trim(), tipo: "manual", obs: "", rec: "", items: [] });
                    saveToLocal(); renderFrentes();
                }
            }, 10); };
            frenteBody.appendChild(btnAgregarArea);

            // ── BLOQUE FINAL DEL FRENTE ──────────────────────────────────────
            const bloqueFinal = document.createElement("div");
            bloqueFinal.style.cssText = "margin-top:18px;border:2px solid #2d9e52;border-radius:14px;overflow:hidden;";
            const bloqueFinalHeader = document.createElement("div");
            bloqueFinalHeader.style.cssText = "background:linear-gradient(90deg,#1a5c35,#2d9e52);padding:10px 16px;display:flex;align-items:center;gap:8px;";
            bloqueFinalHeader.innerHTML = '<span style="font-size:1rem;font-weight:800;color:#fff;letter-spacing:0.5px;">📋 Resumen</span>';
            bloqueFinal.appendChild(bloqueFinalHeader);
            const bloqueFinalBody = document.createElement("div");
            bloqueFinalBody.style.cssText = "padding:14px 16px;background:#f8fafc;display:flex;flex-direction:column;gap:14px;";

            const fotosDiv = document.createElement("div"); fotosDiv.className = "frente-fotos-area";
            const fotosTitulo = document.createElement("h4"); fotosTitulo.innerText = "📸 Evidencias fotográficas";
            fotosDiv.appendChild(fotosTitulo);
            const fotosGrid = document.createElement("div"); fotosGrid.className = "fotos-grid";
            if (frente.fotos && frente.fotos.length > 0) {
                frente.fotos.forEach(async (fotoId, fotoIdx) => {
                    const thumb = document.createElement("div"); thumb.className = "foto-thumb";
                    const img = document.createElement("img");
                    // Resolver dataURL: caché en memoria primero, luego IDB
                    if (window._fotoCache && window._fotoCache[fotoId]) {
                        img.src = window._fotoCache[fotoId];
                    } else {
                        try {
                            const map = await idbLeerFotos([fotoId]);
                            if (map[fotoId]) {
                                img.src = map[fotoId];
                                if (!window._fotoCache) window._fotoCache = {};
                                window._fotoCache[fotoId] = map[fotoId];
                            }
                        } catch(e) {}
                    }
                    const btnDel = document.createElement("button"); btnDel.innerText = "✕"; btnDel.className = "del-foto"; btnDel.onclick = async () => {
                        const fid = frentes[idx].fotos[fotoIdx];
                        frentes[idx].fotos.splice(fotoIdx, 1);
                        try { await idbEliminarFoto(fid); } catch(e) {}
                        if (window._fotoCache) delete window._fotoCache[fid];
                        saveToLocal(); renderFrentes();
                    };
                    thumb.appendChild(img); thumb.appendChild(btnDel);
                    fotosGrid.appendChild(thumb);
                });
            } else {
                const emptyMsg = document.createElement("p"); emptyMsg.innerText = "No hay fotos para este frente."; emptyMsg.style.fontSize = "0.8rem"; emptyMsg.style.color = "#6c757d";
                fotosGrid.appendChild(emptyMsg);
            }
            fotosDiv.appendChild(fotosGrid);
            const btnSubirFotosFrente = document.createElement("button"); btnSubirFotosFrente.className = "btn-foto"; btnSubirFotosFrente.innerHTML = "📷 Subir fotos a este frente";
            btnSubirFotosFrente.onclick = () => {
                const input = document.createElement("input"); input.type = "file"; input.multiple = true; input.accept = "image/*";
                input.onchange = async (e) => {
                    const files = Array.from(e.target.files);
                    for (const file of files) {
                        if (!file.type.startsWith("image/")) continue;
                        await new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                const img = new Image();
                                img.onload = async () => {
                                    // Comprimir: max 1024px, calidad 0.65
                                    const canvas = document.createElement('canvas');
                                    const MAX = 1024;
                                    let w = img.width, h = img.height;
                                    if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                                    if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
                                    canvas.width = w; canvas.height = h;
                                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                                    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                                    // Guardar en IndexedDB, solo el ID en frentes[]
                                    const id = fotoId(idx, Date.now() + Math.random());
                                    try { await idbGuardarFoto(id, dataUrl); } catch(err) { console.warn('IDB error:', err); }
                                    if (!frentes[idx].fotos) frentes[idx].fotos = [];
                                    frentes[idx].fotos.push(id);
                                    // También guardar en caché en memoria para render inmediato
                                    if (!window._fotoCache) window._fotoCache = {};
                                    window._fotoCache[id] = dataUrl;
                                    saveToLocal();
                                    renderFrentes();
                                    resolve();
                                };
                                img.src = ev.target.result;
                            };
                            reader.readAsDataURL(file);
                        });
                    }
                };
                input.click();
            };
            fotosDiv.appendChild(btnSubirFotosFrente);
            bloqueFinalBody.appendChild(fotosDiv);

            // Observaciones generales del frente
            const obsEspecificasDiv = document.createElement("div");
            obsEspecificasDiv.className = "frente-obs-area";
            const obsTitulo = document.createElement("h4");
            obsTitulo.innerText = "📝 Observaciones generales del frente";
            obsEspecificasDiv.appendChild(obsTitulo);
            const obsTextarea = document.createElement("textarea");
            obsTextarea.rows = 3;
            obsTextarea.placeholder = "Observaciones generales del frente (contexto, condiciones del sitio, etc.)...";
            obsTextarea.value = frente.observaciones || "";
            obsTextarea.addEventListener("input", (e) => { frentes[idx].observaciones = e.target.value; saveToLocal(); });
            obsEspecificasDiv.appendChild(obsTextarea);
            bloqueFinalBody.appendChild(obsEspecificasDiv);

            // Recomendaciones generales del frente
            const recomendacionesDiv = document.createElement("div");
            recomendacionesDiv.className = "frente-recomendaciones-area";
            const recTitulo = document.createElement("h4");
            recTitulo.innerText = "📋 Recomendaciones generales del frente";
            recomendacionesDiv.appendChild(recTitulo);
            const recTextarea = document.createElement("textarea");
            recTextarea.rows = 3;
            recTextarea.placeholder = "Recomendaciones generales para el contratista o equipo de obra...";
            recTextarea.value = frente.recomendaciones || "";
            recTextarea.addEventListener("input", (e) => { frentes[idx].recomendaciones = e.target.value; saveToLocal(); });
            recomendacionesDiv.appendChild(recTextarea);
            bloqueFinalBody.appendChild(recomendacionesDiv);

            bloqueFinal.appendChild(bloqueFinalBody);
            frenteBody.appendChild(bloqueFinal);
            frenteDiv.appendChild(frenteBody);
            // Body is open by default - no maxHeight restriction needed
            frentesContainer.appendChild(frenteDiv);
        });
    }

    btnExportarJson.onclick = () => {
        const data = { proyecto: proyectoInput.value, fecha: fechaInput.value, ubicacion: ubicacionInput.value, inspector: inspectorInput.value, frentes };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `inspeccion_frentes_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
    };
    btnGuardarManual.onclick = () => { saveToLocal(); alert("Datos guardados manualmente."); };
    btnAgregarFrente.onclick = () => { setTimeout(() => {
        const nuevoNombre = prompt("Nombre del nuevo frente:", "Nuevo frente");
        if (nuevoNombre && nuevoNombre.trim() !== "") {
            frentes.push({ nombre: nuevoNombre.trim(), categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" });
            saveToLocal();
            renderFrentes(); // necesario para agregar frente completo
        } else if (nuevoNombre !== null) alert("Debe ingresar un nombre.");
    }, 10); };

        btnGenerarPdf.onclick = function() {
        // iOS Safari requiere window.open() SINCRÓNICO desde el gesto del usuario
        // Si se llama después de async/await, Safari lo bloquea como popup
        window._pdfWin = window.open('', '_blank');
        generarInformeDireccion();
    };

    async function generarInformeDireccion() {
        // ── 1. Blur para que iOS Safari confirme el valor activo ──
        ['proyecto','fecha','ubicacion','inspector'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.blur();
        });
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        // ── 2. Indicador de carga ──
        var btnPdf = document.getElementById('generar-pdf');
        var textoOrig = btnPdf ? btnPdf.textContent : '';
        if (btnPdf) { btnPdf.textContent = '\u23F3 Generando...'; btnPdf.disabled = true; }
        function restoreBtn() {
            if (btnPdf) { btnPdf.textContent = textoOrig; btnPdf.disabled = false; }
        }

        // ── 3. Leer campos del DOM (fuente de verdad en iOS) ──
        var proyecto  = (document.getElementById('proyecto').value  || '').trim();
        var fecha     = (document.getElementById('fecha').value     || '');
        var ubicacion = (document.getElementById('ubicacion').value || 'Jurisdicción CARDIQUE').trim();
        var inspector = (document.getElementById('inspector').value || '').trim() || 'No especificado';

        // ── 4. Guardar y recargar frentes ──
        saveToLocal();
        try {
            var _s = localStorage.getItem('inspectorFrentesData');
            if (_s) {
                var _d = JSON.parse(_s);
                if (_d.frentes && _d.frentes.length) frentes = _d.frentes;
            }
        } catch(e) {}

        if (!frentes.length) { restoreBtn(); alert('Sin frentes de obra.'); return; }

        // ── 5. Cargar fotos desde IndexedDB ──
        var allIds = [];
        frentes.forEach(function(fr) { (fr.fotos || []).forEach(function(id) { allIds.push(id); }); });
        var fotoMap = {};
        if (allIds.length) {
            try { fotoMap = await idbLeerFotos(allIds); } catch(e) {}
            allIds.forEach(function(id) {
                if (!fotoMap[id] && window._fotoCache && window._fotoCache[id])
                    fotoMap[id] = window._fotoCache[id];
            });
        }

        // ── 6. Estadísticas ──
        var _cqImg = document.getElementById('cardique-logo'); var logoData = (_cqImg && _cqImg.src && _cqImg.src.startsWith('data:')) ? _cqImg.src : null;
        var gC=0, gN=0, gS=0, stats=[];
        for (var fi=0; fi<frentes.length; fi++) {
            var fr=frentes[fi], c=0, n=0, s=0;
            for (var ci=0; ci<fr.categorias.length; ci++)
                for (var ii=0; ii<fr.categorias[ci].items.length; ii++) {
                    var it=fr.categorias[ci].items[ii];
                    if (it.cumple===true) c++; else if (it.cumple===false) n++; else s++;
                }
            var tot=c+n+s, pct=tot>0?parseFloat((c/tot*100).toFixed(1)):0;
            stats.push({nombre:fr.nombre,c:c,n:n,s:s,tot:tot,pct:pct,cont:fr.contratista||'No especificado'});
            gC+=c; gN+=n; gS+=s;
        }
        var gTot=gC+gN+gS, gPct=gTot>0?parseFloat((gC/gTot*100).toFixed(1)):0;
        var sCol=gPct>=80?'#16a34a':gPct>=50?'#d97706':'#dc2626';

        // ── 7. Helpers ──
        function esc(v) { return (v||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        function pie(c,n,s,sz) {
            var tot=c+n+s; if(!tot) return '<svg width="'+sz+'" height="'+sz+'"><circle cx="'+sz/2+'" cy="'+sz/2+'" r="'+(sz/2-4)+'" fill="#e2e8f0"/></svg>';
            var cx=sz/2,cy=sz/2,r=sz/2-6,cols=['#2b9348','#dc2626','#f59e0b'],vs=[c,n,s],p='',a=-90;
            for(var i=0;i<3;i++){if(!vs[i])continue;var sl=vs[i]/tot*360,ea=a+sl,rd=Math.PI/180;
                var x1=cx+r*Math.cos(a*rd),y1=cy+r*Math.sin(a*rd),x2=cx+r*Math.cos(ea*rd),y2=cy+r*Math.sin(ea*rd),la=sl>180?1:0;
                if(vs[i]===tot)p+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+cols[i]+'"/>';
                else p+='<path d="M'+cx+','+cy+' L'+x1.toFixed(1)+','+y1.toFixed(1)+' A'+r+','+r+' 0 '+la+',1 '+x2.toFixed(1)+','+y2.toFixed(1)+' Z" fill="'+cols[i]+'"/>';
                a=ea;}
            return '<svg width="'+sz+'" height="'+sz+'">'+p+'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="white" stroke-width="1.5"/></svg>';
        }
        function bar(pct,w,h,col) {
            var p=Math.max(0,Math.min(100,parseFloat(pct)||0)),f=(p/100*w).toFixed(1);
            return '<svg width="'+w+'" height="'+h+'"><rect width="'+w+'" height="'+h+'" rx="'+(h/2)+'" fill="#e2e8f0"/>'
                +'<rect width="'+f+'" height="'+h+'" rx="'+(h/2)+'" fill="'+col+'"/>'
                +'<text x="'+Math.max(parseFloat(f)-4,8)+'" y="'+(h/2+4)+'" text-anchor="end" font-size="'+(h*0.65)+'" fill="white" font-weight="bold">'+p+'%</text></svg>';
        }
        function badge(cumple) {
            if(cumple===true)  return {bg:'#dcfce7',col:'#166534',lbl:'CUMPLE'};
            if(cumple===false) return {bg:'#fee2e2',col:'#991b1b',lbl:'NO CUMPLE'};
            return {bg:'#fef9c3',col:'#78350f',lbl:'SIN CALIFICAR'};
        }

        // ── 8. Construir HTML ──
        var totalPags = 2 + frentes.length;
        var CSS = "@page{size:A4;margin:2.5cm 2cm 2.5cm 2cm;@top-left{content:''}@top-center{content:''}@top-right{content:''}@bottom-left{content:''}@bottom-right{content:''}@bottom-center{content:'Página ' counter(page) ' de " + totalPags + "';font-family:Calibri,Arial,sans-serif;font-size:9pt;color:#4B5563}}*{box-sizing:border-box}body{font-family:Calibri,Arial,sans-serif;font-size:10pt;line-height:1.5;color:#1f2d3d;background:white}.portada{text-align:center;page-break-after:always}.portada-header{background:linear-gradient(160deg,#0a2e1a 0%,#1a5c32 55%,#2b9348 100%);padding:38px 30px 32px;color:white}.portada-org{font-size:16pt;font-weight:800;color:#fff;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}.portada-sub{font-size:12pt;font-weight:600;color:#fff;opacity:.88}.portada-accent{width:60px;height:3px;background:#6ee7a0;margin:14px auto 0;border-radius:4px}.portada-body{padding:36px 30px 28px;background:white;display:flex;flex-direction:column;align-items:center}.portada-titulo{font-size:26pt;font-weight:900;color:#0a2e1a;line-height:1.15;margin:0 0 8px}.portada-tipo{font-size:11pt;color:#4b5563;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:32px}.portada-divider{width:72%;height:1px;background:linear-gradient(90deg,transparent,#2b9348,transparent);margin:0 auto 28px}.portada-ficha{display:inline-block;background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:18px 30px;text-align:left;font-size:9.5pt;min-width:340px}.portada-ficha td:first-child{font-weight:700;color:#166534;padding-right:16px;padding-bottom:8px;white-space:nowrap}.portada-ficha td:last-child{color:#1f2d3d;padding-bottom:8px;font-weight:500}.portada-footer-strip{background:#f0fdf4;border-top:2px solid #bbf7d0;padding:11px 20px;text-align:center;font-size:7.5pt;color:#4b7a5a;margin-top:28px}.sec-h{background:#1e3a2f;color:white;padding:9px 16px;border-radius:8px 8px 0 0;font-size:13pt;font-weight:700;margin-top:22px;page-break-after:avoid}.sec-b{border:1px solid #d1fae5;border-top:none;border-radius:0 0 8px 8px;padding:14px 16px;margin-bottom:18px;background:#fafffe}.kpi-row{display:flex;gap:12px;margin:12px 0}.kpi-card{flex:1;background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px 8px;text-align:center}.kpi-num{font-size:22pt;font-weight:800;line-height:1.1}.kpi-lbl{font-size:8.5pt;color:#6b7280;margin-top:3px}.t-res{width:100%;border-collapse:collapse;margin:14px 0;font-size:9.5pt}.t-res thead th{background:#1e3a2f;color:white;padding:8px 10px;text-align:center;font-weight:700}.t-res thead th:first-child{text-align:left}.t-res tbody tr:nth-child(even){background:#f8fafc}.t-res tbody td{padding:7px 10px;border-bottom:1px solid #e2e8f0;vertical-align:middle}.frente-pg{page-break-before:always;break-before:page}.frente-banner{background:linear-gradient(135deg,#1e3a2f 0%,#2b9348 100%);color:white;padding:14px 20px;border-radius:10px;margin-bottom:14px;page-break-after:avoid}.frente-banner h2{margin:0;font-size:14pt}.frente-banner p{margin:3px 0 0;font-size:9pt;opacity:.85}.mini-kpi-row{display:flex;gap:10px;margin:10px 0}.mini-kpi{flex:1;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center}.mini-kpi .num{font-size:15pt;font-weight:800}.mini-kpi .lbl{font-size:8pt;color:#6b7280}.ck-table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:9pt}.ck-table thead tr{background:#1e6f3f;color:white}.ck-table thead th{padding:7px 9px;text-align:center;font-weight:700}.ck-table thead th:first-child{text-align:left;width:46%}.ck-table thead th:nth-child(2){width:17%}.ck-table thead th:nth-child(3){width:37%}.ck-table tbody tr{page-break-inside:avoid;break-inside:avoid}.ck-table tbody tr:nth-child(even){background:#f8fafc}.ck-table tbody td{padding:6px 9px;border-bottom:1px solid #e2e8f0;vertical-align:top}.ck-table tbody td:nth-child(2){text-align:center;vertical-align:middle}.e-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;font-size:8pt;font-weight:700;white-space:nowrap}.cat-h{font-size:10.5pt;font-weight:700;color:#1e6f3f;margin:14px 0 6px;padding:5px 10px;background:#f0fdf4;border-left:4px solid #2b9348;border-radius:0 6px 6px 0;page-break-after:avoid}.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0;page-break-inside:avoid;break-inside:avoid;page-break-before:auto}.photo-card{page-break-inside:avoid;break-inside:avoid;display:block;text-align:center;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}.photo-card img{width:100%;height:auto;max-height:220px;object-fit:contain;display:block;background:#f8fafc}.photo-card figcaption{font-size:8pt;color:#374151;padding:5px 8px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-weight:600}.obs-box{background:#f9fafb;border:1px solid #e2e8f0;border-left:4px solid #2b9348;border-radius:0 6px 6px 0;padding:10px 14px;font-size:9.5pt;margin:8px 0;page-break-inside:avoid}.rec-box{background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #d97706;border-radius:0 6px 6px 0;padding:10px 14px;font-size:9.5pt;margin:8px 0;page-break-inside:avoid}.sub-t{font-size:10.5pt;font-weight:700;color:#1e3a2f;margin:14px 0 6px;page-break-after:avoid;break-after:avoid;orphans:3;widows:3}.no-print-bar{position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,#0d3321,#1a5c35);padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,.3)}.spacer{height:68px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print-bar,.spacer{display:none!important}.frente-pg{page-break-before:always;break-before:page}.ck-table tbody tr{page-break-inside:avoid;break-inside:avoid}.sub-t{page-break-after:avoid;break-after:avoid;orphans:3;widows:3}.photo-grid{page-break-inside:avoid;break-inside:avoid;page-break-before:auto}.photo-card{page-break-inside:avoid;break-inside:avoid;display:block}a[href]:after{content:none!important}}";

        var h = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
            + '<meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Informe CARDIQUE</title>'
            + '<style>' + CSS + '<\/style>'
            + '<\/head><body>';

        // Barra de herramientas (oculta al imprimir)
        h += '<div class="no-print-bar">'
            + '<button onclick="window.close()" style="background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.4);border-radius:40px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,Arial,sans-serif;flex-shrink:0">&#8592; Volver</button>'
            + '<button onclick="window.print()" style="background:#f59e0b;color:white;border:none;border-radius:40px;padding:10px 22px;font-size:15px;font-weight:800;cursor:pointer;font-family:Calibri,Arial,sans-serif;flex-shrink:0">&#128424; Imprimir / Guardar PDF</button>'
            + '</div><div class="spacer"></div>';

        // Portada
        h += '<div class="portada">';
        h += '<div class="portada-header">';
        if(logoData) h += '<div style="margin-bottom:20px"><img src="'+logoData+'" style="height:90px;max-width:200px;object-fit:contain;border-radius:12px;background:white;padding:6px"></div>';
        h += '<div class="portada-org">CORPORACI&Oacute;N AUT&Oacute;NOMA REGIONAL DEL CANAL DEL DIQUE</div>';
        h += '<div class="portada-sub">&Aacute;rea T&eacute;cnica de Planeaci&oacute;n</div>';
        h += '<div class="portada-accent"></div></div>';
        h += '<div class="portada-body">';
        h += '<div class="portada-titulo">INFORME DE INSPECCI&Oacute;N<br>AMBIENTAL Y SST</div>';
        h += '<div class="portada-tipo">Por Frente de Obra</div>';
        h += '<div class="portada-divider"></div>';
        h += '<table class="portada-ficha"><tbody>'
            + '<tr><td>&#128220; Contrato:</td><td>'+esc(proyecto)+'</td></tr>'
            + '<tr><td>&#128197; Fecha:</td><td>'+esc(fecha)+'</td></tr>'
            + '<tr><td>&#128205; Municipio:</td><td>'+esc(ubicacion)+'</td></tr>'
            + '<tr><td>&#128100; Profesional:</td><td>'+esc(inspector)+'</td></tr>'
            + '<tr><td>&#127959; Frentes:</td><td>'+frentes.length+'</td></tr>'
            + '</tbody></table>';
        h += '</div>';
        h += '<div class="portada-footer-strip">CARDIQUE &middot; Inspecci&oacute;n Ambiental y SST &middot; Uso interno</div>';
        h += '</div>';

        // Resumen global
        h += '<div class="sec-h">1. Resumen Global de Cumplimiento</div><div class="sec-b">';
        h += '<div class="kpi-row">'
            + '<div class="kpi-card"><div class="kpi-num" style="color:#1e3a2f">'+gTot+'</div><div class="kpi-lbl">Total</div></div>'
            + '<div class="kpi-card"><div class="kpi-num" style="color:#16a34a">'+gC+'</div><div class="kpi-lbl">&#10004; Cumplen</div></div>'
            + '<div class="kpi-card"><div class="kpi-num" style="color:#dc2626">'+gN+'</div><div class="kpi-lbl">&#10008; No cumplen</div></div>'
            + '<div class="kpi-card"><div class="kpi-num" style="color:#d97706">'+gS+'</div><div class="kpi-lbl">Sin calificar</div></div>'
            + '<div class="kpi-card"><div class="kpi-num" style="color:'+sCol+'">'+gPct+'%</div><div class="kpi-lbl">Cumplimiento</div></div>'
            + '</div>';
        h += '<p style="font-weight:700;margin:10px 0 4px">Barra global</p>';
        h += bar(gPct,560,22,sCol);
        h += '<table style="width:100%;border-collapse:collapse;margin:12px 0"><tr>';
        h += '<td style="width:130px;vertical-align:middle;text-align:center;padding-right:20px">'+pie(gC,gN,gS,120)
            + '<div style="font-size:8pt;margin-top:6px;line-height:1.8">'
            + '<div><svg width="11" height="11"><rect width="11" height="11" rx="2" fill="#2b9348"/></svg> Cumple</div>'
            + '<div><svg width="11" height="11"><rect width="11" height="11" rx="2" fill="#dc2626"/></svg> No cumple</div>'
            + '<div><svg width="11" height="11"><rect width="11" height="11" rx="2" fill="#f59e0b"/></svg> Sin calificar</div>'
            + '</div></td>';
        h += '<td style="vertical-align:top"><p style="font-weight:700;margin:0 0 8px">Por frente</p>';
        for(var si=0;si<stats.length;si++){
            var st=stats[si],bc=st.pct>=80?'#16a34a':st.pct>=50?'#d97706':'#dc2626';
            h += '<div style="margin-bottom:9px"><div style="font-size:9pt;font-weight:600;margin-bottom:3px">'+esc(st.nombre)+'</div>'
                + bar(st.pct,390,18,bc)
                + '<div style="font-size:8pt;color:#6b7280;margin-top:2px">'+st.c+' cumple &middot; '+st.n+' no cumple &middot; '+st.s+' sin calificar</div></div>';
        }
        h += '</td></tr></table>';
        h += '<table class="t-res"><thead><tr><th>Frente</th><th>Contratista</th><th>Total</th><th>Cumple</th><th>No Cumple</th><th>Sin Cal.</th><th>%</th></tr></thead><tbody>';
        for(var si=0;si<stats.length;si++){
            var st=stats[si],rbc=st.pct>=80?'#f0fdf4':st.pct>=50?'#fffbeb':'#fff1f2',tbc=st.pct>=80?'#16a34a':st.pct>=50?'#d97706':'#dc2626';
            h += '<tr style="background:'+rbc+'"><td>'+esc(st.nombre)+'</td><td style="font-size:8.5pt;color:#475569">'+esc(st.cont)+'</td>'
                +'<td style="text-align:center">'+st.tot+'</td>'
                +'<td style="text-align:center;color:#166534;font-weight:700">'+st.c+'</td>'
                +'<td style="text-align:center;color:#991b1b;font-weight:700">'+st.n+'</td>'
                +'<td style="text-align:center;color:#92400e;font-weight:700">'+st.s+'</td>'
                +'<td style="text-align:center;font-weight:800;color:'+tbc+'">'+st.pct+'%</td></tr>';
        }
        h += '</tbody></table></div>';

        // Detalle por frente
        for(var fi=0;fi<frentes.length;fi++){
            var fr=frentes[fi],st=stats[fi],bc=st.pct>=80?'#16a34a':st.pct>=50?'#d97706':'#dc2626';
            h += '<div class="frente-pg">';
            h += '<div class="frente-banner"><h2>&#127959; '+esc(fr.nombre)+'</h2>'
                +'<p>Secci&oacute;n '+(fi+2)+' de '+(frentes.length+1)+' &nbsp;|&nbsp; Profesional: '+esc(inspector)
                +' &nbsp;|&nbsp; Contratista: '+esc(fr.contratista||'No especificado')+' &nbsp;|&nbsp; Fecha: '+esc(fecha)+'</p></div>';
            h += '<div class="mini-kpi-row">'
                +'<div class="mini-kpi"><div class="num" style="color:#1e3a2f">'+st.tot+'</div><div class="lbl">Total</div></div>'
                +'<div class="mini-kpi"><div class="num" style="color:#16a34a">'+st.c+'</div><div class="lbl">Cumple</div></div>'
                +'<div class="mini-kpi"><div class="num" style="color:#dc2626">'+st.n+'</div><div class="lbl">No Cumple</div></div>'
                +'<div class="mini-kpi"><div class="num" style="color:#d97706">'+st.s+'</div><div class="lbl">Sin Cal.</div></div>'
                +'<div class="mini-kpi"><div class="num" style="color:'+bc+'">'+st.pct+'%</div><div class="lbl">Cumplimiento</div></div></div>';
            h += '<table style="width:100%;border-collapse:collapse;margin:10px 0"><tr>'
                +'<td style="width:110px;text-align:center;vertical-align:middle;padding-right:16px">'+pie(st.c,st.n,st.s,100)+'</td>'
                +'<td style="vertical-align:middle">'+bar(st.pct,380,20,bc)+'</td></tr></table>';

            // Checklist
            h += '<div class="sub-t">Checklist de Inspecci&oacute;n</div>';
            for(var ci=0;ci<fr.categorias.length;ci++){
                var cat=fr.categorias[ci]; if(!cat.items.length) continue;
                var cc=0,cn=0;
                cat.items.forEach(function(it){if(it.cumple===true)cc++;else if(it.cumple===false)cn++;});
                h += '<div class="cat-h">'+cat.nombre+' <span style="font-weight:400;font-size:8.5pt;color:#4b5563">('+cc+' &#10004; / '+cn+' &#10008; / '+(cat.items.length-cc-cn)+' &#9633;)</span></div>';
                h += '<table class="ck-table"><thead><tr><th>Item</th><th>Estado</th><th>Observaci&oacute;n</th></tr></thead><tbody>';
                for(var ii=0;ii<cat.items.length;ii++){
                    var it=cat.items[ii],bd=badge(it.cumple);
                    h += '<tr><td style="font-weight:500">'+esc(it.texto)+'</td>'
                        +'<td><span class="e-badge" style="background:'+bd.bg+';color:'+bd.col+'">'+bd.lbl+'</span></td>'
                        +'<td style="color:#374151;font-size:8.5pt">'+(it.obs?esc(it.obs):'<em style="color:#9ca3af">Sin observaci&oacute;n</em>')+'</td></tr>';
                }
                h += '</tbody></table>';
            }

            // Fotos
            if(fr.fotos && fr.fotos.length){
                var fotosOk=fr.fotos.filter(function(id){return !!fotoMap[id];});
                if(fotosOk.length){
                    h += '<div style="font-size:10.5pt;font-weight:700;color:#1e3a2f;margin:14px 0 6px;page-break-after:avoid;break-after:avoid">&#128247; Evidencia Fotogr&aacute;fica ('+fotosOk.length+')</div>';
                    var fotoHtml = '<table style="width:100%;border-collapse:collapse;margin:14px 0">';
                    for(var pi=0;pi<fotosOk.length;pi+=2){
                        fotoHtml += '<tr style="page-break-inside:avoid;break-inside:avoid">';
                        fotoHtml += '<td style="width:50%;padding:7px;vertical-align:top"><figure style="border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;text-align:center;page-break-inside:avoid;break-inside:avoid"><img src="'+fotoMap[fotosOk[pi]]+'" style="width:100%;height:auto;max-height:220px;object-fit:contain;display:block"><figcaption style="font-size:8pt;color:#374151;padding:5px 8px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-weight:600">Fotograf&iacute;a '+(pi+1)+' &mdash; '+esc(fr.nombre)+'</figcaption></figure></td>';
                        if(fotosOk[pi+1]){
                            fotoHtml += '<td style="width:50%;padding:7px;vertical-align:top"><figure style="border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;text-align:center;page-break-inside:avoid;break-inside:avoid"><img src="'+fotoMap[fotosOk[pi+1]]+'" style="width:100%;height:auto;max-height:220px;object-fit:contain;display:block"><figcaption style="font-size:8pt;color:#374151;padding:5px 8px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-weight:600">Fotograf&iacute;a '+(pi+2)+' &mdash; '+esc(fr.nombre)+'</figcaption></figure></td>';
                        } else {
                            fotoHtml += '<td style="width:50%;padding:7px"></td>';
                        }
                        fotoHtml += '</tr>';
                    }
                    fotoHtml += '</table>';
                    h += fotoHtml;
                }
            }

            // Observaciones y recomendaciones
            if(fr.observaciones && fr.observaciones.trim())
                h += '<div class="sub-t">&#128221; Observaciones</div><div class="obs-box">'+esc(fr.observaciones).replace(/\\n/g,'<br>')+'</div>';
            if(fr.recomendaciones && fr.recomendaciones.trim())
                h += '<div class="sub-t">&#9888; Recomendaciones</div><div class="rec-box">'+esc(fr.recomendaciones).replace(/\\n/g,'<br>')+'</div>';

            h += '</div>'; // fin frente-pg
        }

        h += '<\/body><\/html>';

        // ── 9. Abrir informe ──
        // document.write() sobre la ventana pre-abierta: sin URL en pie de página,
        // sin bloqueo de popup en iOS Safari, datos y fotos visibles
        if (window._pdfWin && !window._pdfWin.closed) {
            try {
                window._pdfWin.document.open('text/html', 'replace');
                window._pdfWin.document.write(h);
                window._pdfWin.document.close();
                window._pdfWin.focus();
            } catch(e) {
                var fbu = 'data:text/html;charset=utf-8,' + encodeURIComponent(h);
                window._pdfWin.location.href = fbu;
            }
        } else {
            var fbu = 'data:text/html;charset=utf-8,' + encodeURIComponent(h);
            var w2 = window.open(fbu, '_blank');
            if (!w2) {
                var a4  = document.createElement('a');
                a4.href = fbu; a4.target = '_blank'; a4.rel = 'noopener';
                document.body.appendChild(a4); a4.click();
                setTimeout(function(){ document.body.removeChild(a4); }, 500);
            }
        }
        window._pdfWin = null;
        restoreBtn();
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    btnResetGlobal.onclick = () => {
        if (confirm("⚠️ Reiniciar borrará todos los datos. ¿Continuar?")) {
            localStorage.removeItem("inspectorFrentesData");
            frentes = [
                { nombre: "Frente 1 - Arroyo Ají Molido", categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" },
                { nombre: "Frente 2 - Box Matagente", categorias: JSON.parse(JSON.stringify(CATEGORIAS_BASE)), fotos: [], observaciones: "", recomendaciones: "" }
            ];
            proyectoInput.value = "";
            fechaInput.valueAsDate = new Date();
            ubicacionInput.value = "Jurisdicción CARDIQUE";
            inspectorInput.value = "";
            renderFrentes();
            saveToLocal();
        }
    };

    proyectoInput.addEventListener("input", saveToLocal);
    ubicacionInput.addEventListener("input", saveToLocal);
    inspectorInput.addEventListener("input", saveToLocal);
    fechaInput.addEventListener("change", saveToLocal);

    // ── FASE 2: HISTORIAL Y COMPARAR ──

    function mostrarPantalla(nombre) {
        document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('activo'));
        document.getElementById('pantalla-' + nombre).classList.add('activa');
        document.getElementById('nav-' + nombre).classList.add('activo');
        if (nombre === 'historial') renderHistorial();
        if (nombre === 'comparar') renderComparar();
        window.scrollTo(0, 0);
    }

    function calcularPct(frentesData) {
        let c = 0, n = 0, s = 0;
        frentesData.forEach(f => f.categorias.forEach(cat => cat.items.forEach(item => {
            if (item.cumple === true) c++;
            else if (item.cumple === false) n++;
            else s++;
        })));
        const t = c + n + s;
        return { cumple: c, noCumple: n, sinCalif: s, total: t, pct: t > 0 ? parseFloat((c/t*100).toFixed(1)) : 0 };
    }

    function getHistorial() {
        try { return JSON.parse(localStorage.getItem('cardique_historial') || '[]'); } catch(e) { return []; }
    }

    function saveHistorial(hist) {
        try { localStorage.setItem('cardique_historial', JSON.stringify(hist)); } catch(e) { console.warn('Historial full'); }
    }

    document.getElementById('btn-archivar').onclick = () => {
        const data = { frentes, proyecto: proyectoInput.value, fecha: fechaInput.value, ubicacion: ubicacionInput.value, inspector: inspectorInput.value };
        if (!data.frentes || data.frentes.length === 0) { alert('No hay frentes para archivar.'); return; }
        const stats = calcularPct(data.frentes);
        const registro = {
            id: Date.now(),
            archivedAt: new Date().toLocaleString('es-CO'),
            proyecto: data.proyecto,
            fecha: data.fecha,
            inspector: data.inspector,
            ubicacion: data.ubicacion,
            pct: stats.pct,
            cumple: stats.cumple,
            noCumple: stats.noCumple,
            sinCalif: stats.sinCalif,
            total: stats.total,
            frentes: data.frentes.map(f => ({ nombre: f.nombre, fotos: [], observaciones: f.observaciones, recomendaciones: f.recomendaciones, categorias: f.categorias }))
        };
        const hist = getHistorial();
        hist.unshift(registro);
        saveHistorial(hist);
        alert('✅ Inspección archivada en historial.');
        mostrarPantalla('historial');
    };

    document.getElementById('btn-limpiar-hist').onclick = () => {
        if (confirm('¿Borrar todo el historial?')) {
            localStorage.removeItem('cardique_historial');
            renderHistorial();
        }
    };

    function renderHistorial() {
        const lista = document.getElementById('hist-lista');
        const hist = getHistorial();
        if (hist.length === 0) {
            lista.innerHTML = '<div class="hist-empty">Sin inspecciones archivadas.<br>Completa una inspección y toca "Archivar".</div>';
            return;
        }
        lista.innerHTML = hist.map((r, i) => {
            const color = r.pct >= 80 ? '#16a34a' : r.pct >= 50 ? '#d97706' : '#dc2626';
            const tags = r.frentes.map(f => `<span class="hist-tag">${f.nombre}</span>`).join('');
            return `<div class="hist-item">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div class="hist-proyecto">${r.proyecto || 'Sin nombre'}</div>
                        <div class="hist-fecha">📅 ${r.fecha || ''} &nbsp;|&nbsp; Archivado: ${r.archivedAt}</div>
                        <div class="hist-inspector">👤 ${r.inspector || 'No especificado'}</div>
                    </div>
                    <div class="hist-pct" style="color:${color}">${r.pct}%</div>
                </div>
                <div class="hist-frentes">${tags}</div>
                <div style="margin-top:10px;display:flex;gap:8px;">
                    <button onclick="restaurarInspeccion(${i})" style="font-size:.75rem;padding:6px 12px;background:#2c5e3f;">↩️ Restaurar</button>
                    <button onclick="eliminarHistorial(${i})" style="font-size:.75rem;padding:6px 12px;background:#b91c1c;">🗑️ Borrar</button>
                </div>
            </div>`;
        }).join('');
    }

    function eliminarHistorial(idx) {
        if (!confirm('¿Borrar esta inspección del historial?')) return;
        const hist = getHistorial();
        hist.splice(idx, 1);
        saveHistorial(hist);
        renderHistorial();
    }

    function restaurarInspeccion(idx) {
        if (!confirm('¿Restaurar esta inspección? Se reemplazarán los datos actuales.')) return;
        const hist = getHistorial();
        const r = hist[idx];
        frentes = r.frentes;
        proyectoInput.value = r.proyecto || '';
        fechaInput.value = r.fecha || '';
        ubicacionInput.value = r.ubicacion || '';
        inspectorInput.value = r.inspector || '';
        saveToLocal();
        renderFrentes();
        mostrarPantalla('inspeccion');
    }

    function renderComparar() {
        const hist = getHistorial();
        const selA = document.getElementById('comp-sel-a');
        const selB = document.getElementById('comp-sel-b');
        const valA = selA.value, valB = selB.value;
        const opts = hist.map((r, i) => `<option value="${i}">${r.proyecto || 'Sin nombre'} — ${r.fecha || ''} (${r.pct}%)</option>`).join('');
        selA.innerHTML = '<option value="">— Selecciona —</option>' + opts;
        selB.innerHTML = '<option value="">— Selecciona —</option>' + opts;
        if (valA) selA.value = valA;
        if (valB) selB.value = valB;
    }

    document.getElementById('btn-comparar').onclick = () => {
        const hist = getHistorial();
        const idxA = document.getElementById('comp-sel-a').value;
        const idxB = document.getElementById('comp-sel-b').value;
        if (idxA === '' || idxB === '') { alert('Selecciona dos inspecciones.'); return; }
        if (idxA === idxB) { alert('Selecciona dos inspecciones diferentes.'); return; }
        const a = hist[idxA], b = hist[idxB];
        const delta = (b.pct - a.pct).toFixed(1);
        const deltaClass = delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-neu';
        const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '=';
        document.getElementById('comp-resultado').innerHTML = `
            <div class="comp-card">
                <div class="comp-titulo">📊 Comparación de Cumplimiento Global</div>
                <div class="comp-row">
                    <div class="comp-col">
                        <div class="comp-col-title">A — ${a.proyecto || 'Sin nombre'}</div>
                        <div class="comp-pct" style="color:${a.pct>=80?'#16a34a':a.pct>=50?'#d97706':'#dc2626'}">${a.pct}%</div>
                        <div class="comp-detail">📅 ${a.fecha || ''}<br>👤 ${a.inspector || ''}<br>✔ ${a.cumple} / ✘ ${a.noCumple} / ◻ ${a.sinCalif}</div>
                    </div>
                    <div style="display:flex;align-items:center;padding:0 8px;">
                        <div class="comp-delta ${deltaClass}">${deltaIcon} ${Math.abs(delta)}%</div>
                    </div>
                    <div class="comp-col">
                        <div class="comp-col-title">B — ${b.proyecto || 'Sin nombre'}</div>
                        <div class="comp-pct" style="color:${b.pct>=80?'#16a34a':b.pct>=50?'#d97706':'#dc2626'}">${b.pct}%</div>
                        <div class="comp-detail">📅 ${b.fecha || ''}<br>👤 ${b.inspector || ''}<br>✔ ${b.cumple} / ✘ ${b.noCumple} / ◻ ${b.sinCalif}</div>
                    </div>
                </div>
            </div>
            ${a.frentes.map((fa, fi) => {
                const fb = b.frentes[fi];
                if (!fb) return '';
                const statsA = calcularPct([fa]), statsB = calcularPct([fb]);
                const d = (statsB.pct - statsA.pct).toFixed(1);
                const dc = d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : 'delta-neu';
                return `<div class="comp-card">
                    <div class="comp-titulo">🏗️ ${fa.nombre}</div>
                    <div class="comp-row">
                        <div class="comp-col"><div class="comp-pct" style="color:${statsA.pct>=80?'#16a34a':statsA.pct>=50?'#d97706':'#dc2626'}">${statsA.pct}%</div><div class="comp-detail">✔ ${statsA.cumple} / ✘ ${statsA.noCumple}</div></div>
                        <div style="display:flex;align-items:center;padding:0 8px;"><div class="comp-delta ${dc}">${d>0?'▲':d<0?'▼':'='} ${Math.abs(d)}%</div></div>
                        <div class="comp-col"><div class="comp-pct" style="color:${statsB.pct>=80?'#16a34a':statsB.pct>=50?'#d97706':'#dc2626'}">${statsB.pct}%</div><div class="comp-detail">✔ ${statsB.cumple} / ✘ ${statsB.noCumple}</div></div>
                    </div>
                </div>`;
            }).join('')}
        `;
    };

    loadFromLocal();
