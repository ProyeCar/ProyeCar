/**
 * Registro de Asesoría — Proceso de Planeación Estratégica (Versión 03)
 * Formulario offline, firmas táctiles sobre línea y PDF formato CARDIQUE.
 */
(function () {
    'use strict';

    var LS_REGISTROS = 'cardique_registro_asesoria';
    var LS_FIRMAS = 'cardique_firmas_guardadas';
    var CONSENT_KEY = 'cardique_registro_consentimiento';
    var LOGO_URL = 'assets/cardique-logo-registro.jpg';
    var VERSION_FORMATO = '03';
    var FECHA_VERSION_PLANTILLA = '27/01/2026';
    var LINEA_ALTURA = 72;
    var _logoDataUrl = null;
    var _consentModalAbierto = false;
    var LS_SESSION = 'proyecar_session';
    var SS_SESION_LEGACY = 'cardique_ra_sesion';
    var _sesionLegacyMigrada = false;
    var IDB_NAME = 'cardique_ra_sync';
    var IDB_STORE = 'registros';
    var IDB_VERSION = 1;
    var _modoSoloLectura = false;
    var _formInitDone = false;
    var _syncIntervalId = null;
    var _raDbPromise = null;
    var _editRemoteId = null;
    var _editProfesionalId = null;
    var _raModoFormularioActivo = false;

    /** Migra datos legacy de localStorage → sessionStorage y elimina copias persistentes. */
    function migrarDesdeLocalStorage() {
        [LS_REGISTROS, LS_FIRMAS].forEach(function(key) {
            try {
                if (sessionStorage.getItem(key) != null) {
                    localStorage.removeItem(key);
                    return;
                }
                var legacy = localStorage.getItem(key);
                if (legacy != null) {
                    sessionStorage.setItem(key, legacy);
                    localStorage.removeItem(key);
                }
            } catch (e) {}
        });
    }

    function leerJSON(key, def) {
        try { return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(def)); } catch (e) { return def; }
    }
    function guardarJSON(key, obj) {
        try { sessionStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
    }

    function tieneConsentimiento() {
        try { return sessionStorage.getItem(CONSENT_KEY) === '1'; } catch (e) { return false; }
    }

    function modalConsentimiento() {
        if (tieneConsentimiento()) return Promise.resolve(true);
        if (_consentModalAbierto) return Promise.resolve(false);

        return new Promise(function(resolve) {
            _consentModalAbierto = true;
            var overlay = document.createElement('div');
            overlay.id = 'ra-consent-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'ra-consent-title');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,51,33,0.88);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
            overlay.innerHTML = ''
                + '<div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:22px 20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:system-ui,-apple-system,sans-serif;">'
                + '<h2 id="ra-consent-title" style="margin:0 0 12px;font-size:1.05rem;color:#0d3321;">Tratamiento de datos personales</h2>'
                + '<p style="margin:0 0 10px;font-size:0.88rem;line-height:1.5;color:#374151;">Esta aplicación captura y almacena de forma temporal en tu dispositivo: nombre completo, cédula y número celular de terceros.</p>'
                + '<p style="margin:0 0 6px;font-size:0.84rem;line-height:1.45;color:#374151;"><strong>Finalidad:</strong> Documentación de asesorías CARDIQUE</p>'
                + '<p style="margin:0 0 6px;font-size:0.84rem;line-height:1.45;color:#374151;"><strong>Responsable:</strong> CARDIQUE</p>'
                + '<p style="margin:0 0 16px;font-size:0.84rem;line-height:1.45;color:#374151;"><strong>Derechos:</strong> Puedes acceder, rectificar o solicitar supresión de tus datos</p>'
                + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
                + '<button type="button" id="ra-consent-aceptar" style="flex:1;min-width:140px;padding:11px 14px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.88rem;font-weight:700;cursor:pointer;">✓ Entiendo y acepto</button>'
                + '<button type="button" id="ra-consent-rechazar" style="flex:1;min-width:140px;padding:11px 14px;background:#e5e7eb;color:#374151;border:none;border-radius:10px;font-size:0.88rem;font-weight:600;cursor:pointer;">✗ Rechazar</button>'
                + '</div></div>';

            function cerrar(ok) {
                _consentModalAbierto = false;
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                if (ok) {
                    try { sessionStorage.setItem(CONSENT_KEY, '1'); } catch (e) {}
                    aplicarEstadoConsentimientoEnPersonas();
                }
                resolve(!!ok);
            }

            document.body.appendChild(overlay);
            overlay.querySelector('#ra-consent-aceptar').onclick = function() { cerrar(true); };
            overlay.querySelector('#ra-consent-rechazar').onclick = function() {
                cerrar(false);
                alert('Debes aceptar el tratamiento de datos para capturar cédula y datos de terceros.');
            };
        });
    }

    function aplicarEstadoConsentimientoEnPersonas() {
        var ok = tieneConsentimiento();
        document.querySelectorAll('#ra-personas-lista .ra-p-cedula, #ra-personas-lista .ra-p-celular, #ra-personas-lista .ra-p-nombre').forEach(function(el) {
            el.readOnly = !ok;
            el.setAttribute('autocomplete', 'off');
        });
    }

    function solicitarConsentimientoSiFalta() {
        if (tieneConsentimiento()) return Promise.resolve(true);
        return modalConsentimiento();
    }

    function wireConsentimientoPersonas() {
        var lista = document.getElementById('ra-personas-lista');
        if (!lista || lista.dataset.raConsentWired === '1') return;
        lista.dataset.raConsentWired = '1';
        aplicarEstadoConsentimientoEnPersonas();

        function gateCedula(ev) {
            var t = ev.target;
            if (!t || !t.classList || !t.classList.contains('ra-p-cedula')) return;
            if (tieneConsentimiento()) return;
            ev.preventDefault();
            modalConsentimiento().then(function(ok) {
                if (ok) t.focus();
            });
        }
        lista.addEventListener('mousedown', gateCedula);
        lista.addEventListener('touchstart', gateCedula, { passive: false });
    }

    function limpiarTodosRegistrosAsesoria(mostrarMensaje) {
        try {
            sessionStorage.removeItem(LS_REGISTROS);
            sessionStorage.removeItem(LS_FIRMAS);
            sessionStorage.removeItem(CONSENT_KEY);
            localStorage.removeItem(LS_REGISTROS);
            localStorage.removeItem(LS_FIRMAS);
        } catch (e) {}
        idbClearAll();
        limpiarFormulario();
        renderHistorialRegistro();
        renderGestionFirmasRegistro();
        aplicarEstadoConsentimientoEnPersonas();
        if (getRaSession()) renderDashboard();
        if (mostrarMensaje) alert('Todos los registros de asesoría fueron eliminados.');
    }

    function confirmarLimpiarTodoRegistros() {
        if (!confirm('¿Borrar TODOS los registros guardados? Esta acción es irreversible.')) return;
        limpiarTodosRegistrosAsesoria(true);
    }

    function injectBotonLimpiarTodo() {
        var estiloBtn = 'width:100%;margin-top:12px;padding:10px 14px;background:#b91c1c;color:#fff;border:none;border-radius:10px;font-size:0.84rem;font-weight:700;cursor:pointer;';

        if (!document.getElementById('ra-limpiar-todo-hist')) {
            var histLista = document.getElementById('ra-historial-lista');
            if (histLista && histLista.parentNode) {
                var btnHist = document.createElement('button');
                btnHist.type = 'button';
                btnHist.id = 'ra-limpiar-todo-hist';
                btnHist.textContent = 'Limpiar todos los registros de asesoría';
                btnHist.style.cssText = estiloBtn;
                btnHist.onclick = confirmarLimpiarTodoRegistros;
                histLista.parentNode.appendChild(btnHist);
            }
        }

        if (!document.getElementById('ra-limpiar-todo-tools')) {
            var firmasCont = document.getElementById('ra-firmas-gestion');
            if (firmasCont && firmasCont.parentNode) {
                var btnTools = document.createElement('button');
                btnTools.type = 'button';
                btnTools.id = 'ra-limpiar-todo-tools';
                btnTools.textContent = 'Limpiar todos los registros de asesoría';
                btnTools.style.cssText = estiloBtn;
                btnTools.onclick = confirmarLimpiarTodoRegistros;
                firmasCont.parentNode.appendChild(btnTools);
            }
        }
    }

    function wireReinicioGlobalHook() {
        if (document.documentElement.dataset.raResetHook === '1') return;
        document.documentElement.dataset.raResetHook = '1';
        document.addEventListener('click', function(ev) {
            var btn = ev.target && ev.target.closest ? ev.target.closest('#modal-reset3-confirm') : null;
            if (!btn || btn.disabled) return;
            limpiarTodosRegistrosAsesoria(false);
            setTimeout(function() {
                alert('Registros de asesoría eliminados.');
            }, 80);
        }, true);
    }

    function wireAutoUpdateDesdeSW() {
        if (!('serviceWorker' in navigator)) return;
        if (window.__proyecarAutoUpdateWired) return;
        window.__proyecarAutoUpdateWired = true;

        var recargando = false;

        function mostrarToastRecarga(version) {
            if (document.getElementById('ra-auto-update-toast')) return;
            var toast = document.createElement('div');
            toast.id = 'ra-auto-update-toast';
            toast.setAttribute('role', 'status');
            toast.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:100060;background:#1a5c35;color:#fff;padding:12px 16px;border-radius:12px;font-size:0.88rem;font-weight:600;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.25);font-family:system-ui,-apple-system,sans-serif;';
            toast.textContent = 'Hay actualizaciones disponibles — recargando… (v' + (version || '') + ')';
            (document.body || document.documentElement).appendChild(toast);
        }

        function recargarPorNuevaVersion(version) {
            if (recargando) return;
            recargando = true;
            mostrarToastRecarga(version);
            setTimeout(function() {
                if (typeof forzarActualizacionPWA === 'function') {
                    forzarActualizacionPWA(version);
                    return;
                }
                window.location.reload();
            }, 700);
        }

        navigator.serviceWorker.addEventListener('message', function(ev) {
            var d = ev.data;
            if (!d || d.type !== 'PROYECAR_VERSION_UPDATE' || !d.autoReload) return;
            recargarPorNuevaVersion(d.version);
        });

        navigator.serviceWorker.ready.then(function(reg) {
            if (reg.active) reg.active.postMessage({ type: 'CHECK_VERSION' });
        }).catch(function() {});
    }

    function getSupabaseClient() {
        try {
            return window.ProyeCarSupabase && window.ProyeCarSupabase.supabase;
        } catch (e) { return null; }
    }

    function normalizarUsuarioRaLogin(data) {
        if (data == null) return null;
        var u = data;
        if (typeof u === 'string') {
            try { u = JSON.parse(u); } catch (e) { return null; }
        }
        if (!u || !u.id) return null;
        return u;
    }

    function mensajeErrorLoginRa(res, err) {
        if (err) {
            return (err.message || String(err)) + (err.code ? ' (' + err.code + ')' : '');
        }
        if (res && res.error) {
            var e = res.error;
            var msg = e.message || 'Error en RPC ra_login';
            if (e.code) msg += ' (' + e.code + ')';
            if (e.details) msg += ' — ' + e.details;
            if (e.hint) msg += ' — ' + e.hint;
            return msg;
        }
        if (res && (res.data === null || res.data === undefined)) {
            return 'Nombre o código no coinciden. Usa el nombre exacto registrado en el sistema (ortografía y tildes).';
        }
        return 'Respuesta de login incompleta (falta id de usuario). Revisa ra_login en Supabase.';
    }

    function migrarSesionLegacy() {
        if (_sesionLegacyMigrada) return;
        _sesionLegacyMigrada = true;
        try {
            if (localStorage.getItem(LS_SESSION)) return;
            var legacy = sessionStorage.getItem(SS_SESION_LEGACY);
            if (!legacy) return;
            var obj = JSON.parse(legacy);
            if (obj && obj.id) setRaSession(obj);
            sessionStorage.removeItem(SS_SESION_LEGACY);
        } catch (e) {}
    }

    function getRaSession() {
        try {
            migrarSesionLegacy();
            var raw = localStorage.getItem(LS_SESSION);
            if (!raw) return null;
            var s = JSON.parse(raw);
            if (!s || !s.id || !s.nombre || !s.rol) return null;
            var codigo = s.codigo || s.codigo_acceso;
            if (!codigo) return null;
            s.codigo = codigo;
            s.codigo_acceso = codigo;
            return s;
        } catch (e) { return null; }
    }

    function setRaSession(obj) {
        try {
            var codigo = (obj.codigo || obj.codigo_acceso || '').trim();
            var payload = {
                id: obj.id,
                nombre: obj.nombre,
                rol: obj.rol,
                jefe_id: obj.jefe_id || null,
                codigo: codigo,
                codigo_acceso: codigo,
                timestamp: obj.timestamp || Date.now()
            };
            localStorage.setItem(LS_SESSION, JSON.stringify(payload));
            ensureRaSessionBar();
            return true;
        } catch (e) { return false; }
    }

    function clearRaSession() {
        try { localStorage.removeItem(LS_SESSION); } catch (e) {}
        try { sessionStorage.removeItem(SS_SESION_LEGACY); } catch (e) {}
        var bar = document.getElementById('ra-session-bar');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }

    function generarCodigo() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var out = '';
        for (var i = 0; i < 6; i++) {
            out += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return out;
    }

    function copiarTexto(texto) {
        if (!texto) return Promise.reject(new Error('Sin texto'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(texto);
        }
        return new Promise(function(resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = texto;
                ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) resolve();
                else reject(new Error('No se pudo copiar'));
            } catch (e) { reject(e); }
        });
    }

    function mensajeWhatsAppAccesoProyecar(nombre, codigo) {
        // Formato compartir: nombre + codigo + link ProyeCar
        return 'Tu acceso a ProyeCar:\nNombre: ' + nombre + '\nCódigo: ' + codigo + '\nLink: https://proyecar.github.io/ProyeCar/';
    }

    function rolEtiquetaLarga(rol) {
        var r = String(rol || '').toLowerCase();
        if (r === 'admin' || r === 'administrador') return 'Admin';
        if (r === 'jefe') return 'Jefe';
        return 'Profesional';
    }

    function normalizarNombreUsuario(val) {
        return (val || '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();
    }

    function normalizarCodigoUsuario(val) {
        return (val || '').trim().toUpperCase();
    }

    function cerrarOverlayPorId(id) {
        var el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function abrirModalConfirmarUsuario(opts) {
        // Preview obligatorio antes de crear o editar usuario en Supabase
        cerrarOverlayPorId('ra-user-confirm-overlay');
        var overlay = document.createElement('div');
        overlay.id = 'ra-user-confirm-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,51,33,0.92);z-index:10085;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
        overlay.innerHTML = ''
            + '<div style="background:#fff;border-radius:14px;max-width:400px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:system-ui,-apple-system,sans-serif;">'
            + '<div style="font-size:1rem;font-weight:800;color:#166534;margin-bottom:14px;">✅ Confirmar</div>'
            + '<div style="background:#f9fafb;border-radius:12px;padding:14px;margin-bottom:14px;font-size:0.88rem;color:#374151;line-height:1.55;">'
            + '<div><span style="color:#6b7280;">Nombre:</span> ' + escHtml(opts.nombre) + '</div>'
            + '<div style="margin-top:8px;"><span style="color:#6b7280;">Código:</span> <strong style="font-family:monospace;font-size:1.15rem;letter-spacing:.1em;color:#1a5c35;">' + escHtml(opts.codigo) + '</strong></div>'
            + '<div style="margin-top:8px;"><span style="color:#6b7280;">Rol:</span> ' + escHtml(rolEtiquetaLarga(opts.rol)) + '</div>'
            + '</div>'
            + '<p id="ra-user-confirm-error" style="display:none;margin:0 0 10px;font-size:0.78rem;color:#b91c1c;"></p>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
            + '<button type="button" id="ra-user-confirm-ok" style="flex:1;min-width:130px;padding:11px 14px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.88rem;font-weight:800;cursor:pointer;">✅ Confirmar</button>'
            + '<button type="button" id="ra-user-confirm-back" style="flex:1;min-width:130px;padding:11px 14px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:10px;font-size:0.88rem;font-weight:700;cursor:pointer;">✏️ Corregir</button>'
            + '</div></div>';
        document.body.appendChild(overlay);
        overlay.querySelector('#ra-user-confirm-back').onclick = function() {
            cerrarOverlayPorId('ra-user-confirm-overlay');
            if (typeof opts.onCorregir === 'function') opts.onCorregir();
        };
        overlay.querySelector('#ra-user-confirm-ok').onclick = function() {
            var btn = overlay.querySelector('#ra-user-confirm-ok');
            var errEl = overlay.querySelector('#ra-user-confirm-error');
            errEl.style.display = 'none';
            btn.disabled = true;
            btn.textContent = 'Guardando…';
            Promise.resolve(typeof opts.onConfirm === 'function' ? opts.onConfirm() : null).then(function() {
                cerrarOverlayPorId('ra-user-confirm-overlay');
                cerrarOverlayPorId('ra-user-modal-overlay');
                if (typeof opts.onSuccess === 'function') opts.onSuccess();
            }).catch(function(err) {
                btn.disabled = false;
                btn.textContent = '✅ Confirmar';
                errEl.style.display = 'block';
                errEl.textContent = (err && err.message) ? err.message : 'No se pudo guardar el usuario.';
            });
        };
    }

    function ensureRaSessionBar() {
        var ses = getRaSession();
        var pantalla = document.getElementById('pantalla-registro-asesoria');
        if (!pantalla) return;
        var bar = document.getElementById('ra-session-bar');
        if (!ses) {
            if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
            return;
        }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ra-session-bar';
            bar.style.cssText = 'position:sticky;top:0;z-index:10040;background:#0d3321;color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);';
            pantalla.insertBefore(bar, pantalla.firstChild);
        }
        bar.innerHTML = ''
            + '<div style="font-size:0.78rem;line-height:1.35;min-width:0;">'
            + '<span style="opacity:.75;">Sesión:</span> '
            + escHtml(ses.nombre) + ' · ' + escHtml(ses.rol || '')
            + '</div>'
            + '<button type="button" id="ra-btn-cerrar-sesion" style="padding:7px 12px;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;font-size:0.74rem;font-weight:700;cursor:pointer;white-space:nowrap;">Cerrar sesión</button>';
        wireCerrarSesion();
    }

    function openRaDb() {
        if (_raDbPromise) return _raDbPromise;
        _raDbPromise = new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB no disponible'));
                return;
            }
            var req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = function(ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    var store = db.createObjectStore(IDB_STORE, { keyPath: 'local_id' });
                    store.createIndex('profesional_id', 'profesional_id', { unique: false });
                    store.createIndex('sincronizado', 'sincronizado', { unique: false });
                }
            };
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error || new Error('IndexedDB error')); };
        });
        return _raDbPromise;
    }

    function idbTxn(mode, fn) {
        return openRaDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(IDB_STORE, mode);
                var store = tx.objectStore(IDB_STORE);
                var out;
                try {
                    out = fn(store);
                } catch (e) {
                    reject(e);
                    return;
                }
                tx.oncomplete = function() {
                    if (out && typeof out.then === 'function') out.then(resolve, reject);
                    else resolve(out);
                };
                tx.onerror = function() { reject(tx.error || new Error('IndexedDB tx error')); };
            });
        });
    }

    function idbGetAllRegistros() {
        return idbTxn('readonly', function(store) {
            return new Promise(function(resolve, reject) {
                var req = store.getAll();
                req.onsuccess = function() { resolve(req.result || []); };
                req.onerror = function() { reject(req.error); };
            });
        }).catch(function() { return []; });
    }

    function idbGetRegistro(localId) {
        return idbTxn('readonly', function(store) {
            return new Promise(function(resolve, reject) {
                var req = store.get(localId);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { reject(req.error); };
            });
        }).catch(function() { return null; });
    }

    function idbPutRegistro(rec) {
        return idbTxn('readwrite', function(store) {
            return new Promise(function(resolve, reject) {
                var req = store.put(rec);
                req.onsuccess = function() { resolve(rec); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function idbDeleteRegistro(localId) {
        return idbTxn('readwrite', function(store) {
            return new Promise(function(resolve, reject) {
                var req = store.delete(localId);
                req.onsuccess = function() { resolve(true); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function idbGetByProfesional(profId) {
        return idbGetAllRegistros().then(function(all) {
            return all.filter(function(r) { return String(r.profesional_id) === String(profId); });
        });
    }

    function idbClearAll() {
        return idbTxn('readwrite', function(store) {
            return new Promise(function(resolve, reject) {
                var req = store.clear();
                req.onsuccess = function() { resolve(true); };
                req.onerror = function() { reject(req.error); };
            });
        }).catch(function() {});
    }

    function registroAFormulario(reg) {
        if (!reg) return null;
        var d = reg.datos || reg;
        var f = reg.firmas || {};
        return {
            id: reg.local_id || reg.id,
            remote_id: reg.remote_id || null,
            usuarioAtendido: d.usuarioAtendido || '',
            fecha: d.fecha || '',
            asunto: d.asunto || '',
            descripcion: d.descripcion || '',
            personas: (d.personas || []).map(normalizarPersona),
            firmaFuncionario: f.funcionario || reg.firmaFuncionario || '',
            firmaUsuario: f.usuario || reg.firmaUsuario || '',
            firmaFuncionarioTimestamp: f.funcionarioTimestamp || reg.firmaFuncionarioTimestamp || '',
            firmaUsuarioTimestamp: f.usuarioTimestamp || reg.firmaUsuarioTimestamp || '',
            creadoEn: (reg.timestamps || {}).creadoEn || reg.creadoEn,
            actualizadoEn: (reg.timestamps || {}).actualizadoEn || reg.actualizadoEn,
            sincronizado: !!reg.sincronizado,
            profesional_id: reg.profesional_id
        };
    }

    function remoteRegistroAFormulario(row) {
        if (!row) return null;
        var d = row.datos || row;
        var f = row.firmas || {};
        return {
            id: row.local_id || row.id || ('remote_' + row.id),
            remote_id: row.id || row.remote_id || null,
            usuarioAtendido: d.usuarioAtendido || row.usuario_atendido || '',
            fecha: d.fecha || row.fecha || '',
            asunto: d.asunto || row.asunto || '',
            descripcion: d.descripcion || row.descripcion || '',
            personas: (d.personas || row.personas || []).map(normalizarPersona),
            firmaFuncionario: f.funcionario || row.firma_funcionario || '',
            firmaUsuario: f.usuario || row.firma_usuario || '',
            firmaFuncionarioTimestamp: f.funcionarioTimestamp || row.firma_funcionario_ts || '',
            firmaUsuarioTimestamp: f.usuarioTimestamp || row.firma_usuario_ts || '',
            sincronizado: true,
            profesional_id: row.profesional_id,
            profesional_nombre: row.profesional_nombre || row.nombre_profesional || '',
            fecha_ultima_edicion: row.fecha_ultima_edicion || null,
            fecha_creacion: row.fecha_creacion || null,
            datos: d,
            firmas: f
        };
    }

    function badgeEstadoRegistro(reg) {
        if (reg.sincronizado) {
            return { txt: 'SINCRONIZADO', bg: '#dcfce7', color: '#166534' };
        }
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            return { txt: 'PENDIENTE SYNC', bg: '#fef3c7', color: '#92400e' };
        }
        return { txt: 'GUARDADO', bg: '#e0e7ff', color: '#3730a3' };
    }

    function badgeHtml(reg) {
        var b = badgeEstadoRegistro(reg);
        return '<span style="display:inline-block;padding:3px 8px;border-radius:999px;font-size:0.68rem;font-weight:700;background:' + b.bg + ';color:' + b.color + ';">' + b.txt + '</span>';
    }

    function ensureRolesRoot() {
        var pantalla = document.getElementById('pantalla-registro-asesoria');
        if (!pantalla) return null;
        var container = pantalla.querySelector('.container');
        if (!container) return null;
        var root = document.getElementById('ra-roles-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'ra-roles-root';
            root.style.cssText = 'display:none;margin-bottom:16px;';
            container.insertBefore(root, container.firstChild);
        }
        return root;
    }

    function setUiModoDashboard(visible) {
        var pantalla = document.getElementById('pantalla-registro-asesoria');
        if (!pantalla) return;
        var cards = pantalla.querySelectorAll('.container > .card');
        cards.forEach(function(card) {
            card.style.display = visible ? 'none' : '';
        });
        var root = ensureRolesRoot();
        if (root) root.style.display = visible ? 'block' : 'none';
    }

    function setUiModoFormulario(visible) {
        _raModoFormularioActivo = !!visible;
        var pantalla = document.getElementById('pantalla-registro-asesoria');
        if (!pantalla) return;
        var cards = pantalla.querySelectorAll('.container > .card');
        if (cards[0]) cards[0].style.display = visible ? '' : 'none';
        if (cards[1]) cards[1].style.display = 'none';
        var root = document.getElementById('ra-roles-root');
        if (root) root.style.display = visible ? 'none' : (getRaSession() ? 'block' : 'none');
    }

    function aplicarModoSoloLectura(activo) {
        _modoSoloLectura = !!activo;
        var pantalla = document.getElementById('pantalla-registro-asesoria');
        if (!pantalla) return;
        pantalla.querySelectorAll('input, textarea, select, button').forEach(function(el) {
            if (el.id === 'ra-volver-dashboard') return;
            if (el.id === 'ra-btn-cerrar-sesion') return;
            if (el.closest && el.closest('#ra-session-bar')) return;
            if (el.closest && el.closest('#ra-roles-root')) return;
            if (activo) {
                if (el.tagName === 'BUTTON') el.disabled = true;
                else el.readOnly = true;
            } else {
                if (el.tagName === 'BUTTON') el.disabled = false;
                else el.readOnly = false;
            }
        });
        pantalla.querySelectorAll('.firma-linea-zona, .firma-btn-borrar, .firma-btn-aceptar, .firma-btn-usar, .firma-linea-rehacer, .firma-guardar-chk').forEach(function(el) {
            if (activo) {
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.55';
                if (el.tagName === 'BUTTON') el.disabled = true;
            } else {
                el.style.pointerEvents = '';
                el.style.opacity = '';
                if (el.tagName === 'BUTTON') el.disabled = false;
            }
        });
        aplicarEstadoConsentimientoEnPersonas();
    }

    function injectBotonVolverDashboard() {
        var actions = document.querySelector('#pantalla-registro-asesoria .ra-actions');
        if (!actions || document.getElementById('ra-volver-dashboard')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'ra-volver-dashboard';
        btn.textContent = '← Volver al panel';
        btn.style.cssText = 'width:100%;margin-bottom:10px;padding:10px 14px;background:#374151;color:#fff;border:none;border-radius:10px;font-size:0.84rem;font-weight:700;cursor:pointer;';
        btn.onclick = volverAlDashboard;
        actions.insertBefore(btn, actions.firstChild);
    }

    function volverAlDashboard() {
        aplicarModoSoloLectura(false);
        limpiarFormulario();
        setUiModoDashboard(true);
        renderDashboard();
        if (typeof window.mostrarPantalla === 'function') window.mostrarPantalla('registro-asesoria');
    }

    function activarPantallaRegistroAsesoria() {
        if (typeof window.__raMostrarPantallaOrig === 'function') {
            window.__raMostrarPantallaOrig('registro-asesoria');
        } else if (typeof window.mostrarPantalla === 'function') {
            window.mostrarPantalla('registro-asesoria');
        }
    }

    function abrirFormularioRegistro(reg, soloLectura) {
        if (!_formInitDone) {
            initRegistroAsesoriaCore();
            _formInitDone = true;
        }
        injectBotonVolverDashboard();
        setUiModoFormulario(true);
        ensureRaSessionBar();
        if (reg) cargarFormulario(reg);
        else limpiarFormulario();
        aplicarModoSoloLectura(!!soloLectura);
        activarPantallaRegistroAsesoria();
        window.scrollTo(0, 0);
    }

    function abrirNuevoRegistro() {
        editandoId = null;
        _editRemoteId = null;
        var ses = getRaSession();
        var rol = ses ? String(ses.rol || '').toLowerCase() : '';
        if ((rol === 'admin' || rol === 'administrador') && ses) {
            _editProfesionalId = ses.id;
        } else {
            _editProfesionalId = null;
        }
        abrirFormularioRegistro(null, false);
        setTimeout(function() {
            if (!_raModoFormularioActivo) return;
            var pantalla = document.getElementById('pantalla-registro-asesoria');
            var card = pantalla ? pantalla.querySelector('.container > .card') : null;
            if (card && card.style.display === 'none') {
                alert('Error al cargar formulario');
                volverAlDashboard();
            }
        }, 3000);
    }

    function syncPendientes() {
        var ses = getRaSession();
        var sb = getSupabaseClient();
        if (!ses || !sb || !navigator.onLine) return Promise.resolve(0);
        return idbGetAllRegistros().then(function(all) {
            var rol = String(ses.rol || '').toLowerCase();
            var esAdmin = rol === 'admin' || rol === 'administrador';
            var pendientes = all.filter(function(r) {
                if (r.sincronizado) return false;
                if (esAdmin) return true;
                return String(r.profesional_id) === String(ses.id);
            });
            if (!pendientes.length) return 0;
            var chain = Promise.resolve(0);
            pendientes.forEach(function(rec) {
                chain = chain.then(function(n) {
                    return sb.rpc('ra_upsert_registro', {
                        p_actor_id: ses.id,
                        p_codigo: ses.codigo_acceso,
                        p_local_id: rec.local_id,
                        p_profesional_id: rec.profesional_id,
                        p_datos: rec.datos,
                        p_firmas: rec.firmas,
                        p_creado_en: (rec.timestamps || {}).creadoEn || null,
                        p_actualizado_en: (rec.timestamps || {}).actualizadoEn || null,
                        p_remote_id: rec.remote_id || null
                    }).then(function(res) {
                        if (res.error) throw res.error;
                        var remoteId = (res.data && (res.data.id || res.data.remote_id)) || rec.remote_id;
                        rec.sincronizado = true;
                        if (remoteId) rec.remote_id = remoteId;
                        return idbPutRegistro(rec);
                    }).then(function() { return n + 1; }).catch(function() { return n; });
                });
            });
            return chain;
        }).then(function(synced) {
            if (synced > 0 && getRaSession()) renderDashboard();
            return synced;
        });
    }

    function wireSyncEvents() {
        if (window.__raSyncWired) return;
        window.__raSyncWired = true;
        window.addEventListener('online', function() { syncPendientes(); });
        if (_syncIntervalId) clearInterval(_syncIntervalId);
        _syncIntervalId = setInterval(function() { syncPendientes(); }, 30000);
    }

    function dashboardHeaderHtml(titulo, extra) {
        var ses = getRaSession();
        return ''
            + '<div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 12px rgba(0,0,0,.06);font-family:system-ui,-apple-system,sans-serif;">'
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
            + '<div><div style="font-size:0.72rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Registro de asesoría</div>'
            + '<h2 style="margin:4px 0 0;font-size:1.05rem;color:#0d3321;">' + escHtml(titulo) + '</h2>'
            + (ses ? '<p style="margin:6px 0 0;font-size:0.82rem;color:#374151;">' + escHtml(ses.nombre) + ' · ' + escHtml(ses.rol || '') + '</p>' : '')
            + '</div>'
            + '</div>'
            + (extra || '')
            + '</div>';
    }

    function wireCerrarSesion() {
        var btn = document.getElementById('ra-btn-cerrar-sesion');
        if (!btn) return;
        btn.onclick = function() {
            if (!confirm('¿Cerrar sesión de registro de asesoría?')) return;
            clearRaSession();
            setUiModoDashboard(false);
            setUiModoFormulario(false);
            var root = document.getElementById('ra-roles-root');
            if (root) root.innerHTML = '';
            renderHistorialRegistro();
            aplicarEstadoConsentimientoEnPersonas();
        };
    }

    function esPantallaRegistroAsesoriaActiva() {
        var pantalla = document.getElementById('pantalla-registro-asesoria');
        return !!(pantalla && pantalla.classList.contains('activa'));
    }

    function cerrarLoginRaSiFueraDeModulo() {
        if (esPantallaRegistroAsesoriaActiva()) return;
        var overlay = document.getElementById('ra-login-overlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function abrirModuloRegistroAsesoria() {
        if (_raModoFormularioActivo) return;
        if (!esPantallaRegistroAsesoriaActiva()) return;
        ensureRolesRoot();
        if (!_formInitDone) {
            initRegistroAsesoriaCore();
            _formInitDone = true;
        }
        if (getRaSession()) {
            wireSyncEvents();
            renderDashboard();
            return;
        }
        setUiModoDashboard(false);
        setUiModoFormulario(false);
        renderHistorialRegistro();
        aplicarEstadoConsentimientoEnPersonas();
        initLogin();
    }

    function wireEntradaRegistroAsesoria() {
        if (window.__raEntradaWired) return;
        window.__raEntradaWired = true;
        var orig = window.mostrarPantalla;
        if (typeof orig !== 'function') return;
        window.__raMostrarPantallaOrig = orig;
        window.mostrarPantalla = function(nombre) {
            orig(nombre);
            if (nombre === 'registro-asesoria') {
                abrirModuloRegistroAsesoria();
            }
        };
    }

    function parseRegistroFecha(r) {
        if (!r) return new Date();
        if (r.fecha_ultima_edicion) return new Date(r.fecha_ultima_edicion);
        if (r.fecha_creacion) return new Date(r.fecha_creacion);
        if (r.actualizadoEn) return new Date(r.actualizadoEn);
        if (r.fecha) {
            var s = String(r.fecha);
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
            var p = s.split('/');
            if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
        }
        return new Date();
    }

    function startOfWeekMonday(fecha) {
        var monday = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    function getISOWeek(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function getWeekLabel(monday) {
        var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
        var meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        var nSemana = getISOWeek(monday);
        return 'SEMANA ' + nSemana + ' · ' + monday.getDate() + '–' + sunday.getDate() + ' ' + meses[sunday.getMonth()] + ' ' + sunday.getFullYear();
    }

    function groupByWeek(registros) {
        var groups = {};
        registros.forEach(function(r) {
            var fecha = parseRegistroFecha(r);
            var monday = startOfWeekMonday(fecha);
            var key = monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
            if (!groups[key]) groups[key] = { monday: monday, registros: [] };
            groups[key].registros.push(r);
        });
        return Object.keys(groups).sort(function(a, b) { return b.localeCompare(a); }).map(function(k) {
            return groups[k];
        });
    }

    function getHoraFirma(registro) {
        var ts = (registro.firmas && registro.firmas.funcionarioTimestamp)
            || registro.firmaFuncionarioTimestamp
            || registro.hora_firma_profesional
            || '';
        if (!ts) return '';
        return parseTimestampFirmaPdf(ts).hora || '';
    }

    function getDiaFecha(registro) {
        var fecha = parseRegistroFecha(registro);
        var dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        var meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return dias[fecha.getDay()] + ' ' + fecha.getDate() + ' ' + meses[fecha.getMonth()];
    }

    function getUsuarioAtendido(registro) {
        var datos = registro.datos || registro.datos_formulario || {};
        return registro.usuarioAtendido
            || datos.usuarioAtendido
            || datos.usuario_atendido
            || datos.nombre_usuario
            || datos.usuario
            || 'Sin usuario';
    }

    function getAsunto(registro) {
        var datos = registro.datos || registro.datos_formulario || {};
        return registro.asunto
            || datos.asunto_asesoria
            || datos.asunto
            || datos.descripcion
            || 'Sin asunto';
    }

    function buildRegistroAccionesHtml(r, opts) {
        opts = opts || {};
        var id = r.id || r.local_id;
        var remote = r.remote_id || r.id || '';
        if (opts.readonly) {
            return ''
                + '<button type="button" class="ra-dash-ver" data-id="' + escHtml(id) + '" data-remote="' + escHtml(remote) + '" style="padding:6px 10px;background:#1a5c35;color:#fff;border:none;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">Ver</button>'
                + '<button type="button" class="ra-dash-pdf" data-id="' + escHtml(id) + '" data-remote="' + escHtml(remote) + '" style="padding:6px 10px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">PDF</button>';
        }
        if (opts.admin) {
            return ''
                + '<button type="button" class="ra-dash-edit" data-id="' + escHtml(id) + '" data-remote="' + escHtml(remote) + '" style="padding:6px 10px;background:#1a5c35;color:#fff;border:none;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">Editar</button>'
                + '<button type="button" class="ra-dash-del" data-id="' + escHtml(id) + '" data-remote="' + escHtml(remote) + '" style="padding:6px 10px;background:#b91c1c;color:#fff;border:none;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">Eliminar</button>'
                + '<button type="button" class="ra-dash-pdf" data-id="' + escHtml(id) + '" data-remote="' + escHtml(remote) + '" style="padding:6px 10px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">PDF</button>';
        }
        return '';
    }

    function renderListaRegistrosSemanaHtml(items, opts) {
        opts = opts || {};
        if (!items.length) {
            return '<div style="padding:20px;text-align:center;color:#6b7280;font-size:0.88rem;background:#fff;border-radius:12px;">No hay registros.</div>';
        }
        var semanas = groupByWeek(items);
        var html = '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,.05);">';
        semanas.forEach(function(semana, si) {
            html += '<div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;padding:8px 12px 4px;background:#f9fafb;border-top:' + (si ? '1px solid #e5e7eb' : '0') + ';border-bottom:2px solid #bbf7d0;margin-top:' + (si ? '0' : '0') + ';">' + escHtml(getWeekLabel(semana.monday)) + '</div>';
            semana.registros.forEach(function(r) {
                var usuario = getUsuarioAtendido(r);
                var dia = getDiaFecha(r);
                var hora = getHoraFirma(r);
                var asunto = getAsunto(r);
                if (opts.admin) {
                    var profNombre = r.profesional_nombre || 'Sin profesional';
                    var fechaLine = escHtml(dia) + (hora ? ' · ' + escHtml(hora) : '');
                    html += ''
                        + '<div style="font-weight:normal;padding:10px 12px;border-bottom:1px solid #e5e7eb;">'
                        + '<div style="font-weight:600;color:#111827;font-size:13px;line-height:1.4;">' + escHtml(profNombre) + '</div>'
                        + '<div style="font-weight:normal;color:#6b7280;font-size:12px;line-height:1.4;margin-top:2px;">' + fechaLine + '</div>'
                        + '<div style="font-weight:normal;color:#6b7280;font-size:12px;line-height:1.4;margin-top:2px;">Asunto: ' + escHtml(asunto) + '</div>'
                        + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' + buildRegistroAccionesHtml(r, opts) + '</div>'
                        + '</div>';
                    return;
                }
                if (opts.readonly) {
                    var fechaValor = escHtml(dia) + (hora ? ' · ' + escHtml(hora) : '');
                    html += ''
                        + '<div style="font-weight:normal;padding:10px 12px;border-bottom:1px solid #e5e7eb;">'
                        + '<div style="font-size:12px;line-height:1.4;margin-top:0;">'
                        + '<span style="font-weight:600;color:#111827;font-size:12px;">Usuario atendido:</span>'
                        + '<span style="font-weight:normal;color:#6b7280;font-size:12px;"> ' + escHtml(usuario) + '</span>'
                        + '</div>'
                        + '<div style="font-size:12px;line-height:1.4;margin-top:2px;">'
                        + '<span style="font-weight:600;color:#111827;font-size:12px;">Fecha:</span>'
                        + '<span style="font-weight:normal;color:#6b7280;font-size:12px;"> ' + fechaValor + '</span>'
                        + '</div>'
                        + '<div style="font-size:12px;line-height:1.4;margin-top:2px;">'
                        + '<span style="font-weight:600;color:#111827;font-size:12px;">Asunto:</span>'
                        + '<span style="font-weight:normal;color:#6b7280;font-size:12px;"> ' + escHtml(asunto) + '</span>'
                        + '</div>'
                        + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' + buildRegistroAccionesHtml(r, opts) + '</div>'
                        + '</div>';
                    return;
                }
                var linea1 = escHtml(usuario);
                linea1 += ' · ' + escHtml(dia);
                if (hora) linea1 += ' · ' + escHtml(hora);
                html += ''
                    + '<div style="font-weight:normal;padding:10px 12px;border-bottom:1px solid #e5e7eb;">'
                    + '<div style="font-size:12px;color:#6b7280;line-height:1.4;font-weight:normal;">' + linea1 + '</div>'
                    + '<div style="font-size:12px;color:#6b7280;line-height:1.4;font-weight:normal;margin-top:2px;">Asunto: ' + escHtml(asunto) + '</div>'
                    + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' + buildRegistroAccionesHtml(r, opts) + '</div>'
                    + '</div>';
            });
        });
        html += '</div>';
        return html;
    }

    function attachRegCacheToButtons(root, items) {
        var map = {};
        items.forEach(function(r) {
            [r.id, r.remote_id, r.local_id].filter(Boolean).forEach(function(k) {
                map[String(k)] = r;
            });
        });
        root.querySelectorAll('.ra-dash-ver, .ra-dash-pdf, .ra-dash-edit, .ra-dash-del').forEach(function(btn) {
            var remote = btn.getAttribute('data-remote');
            var id = btn.getAttribute('data-id');
            btn._regCache = map[remote] || map[id] || null;
        });
    }

    function renderListaRegistrosHtml(items, opts) {
        opts = opts || {};
        if (!items.length) {
            return '<div style="padding:20px;text-align:center;color:#6b7280;font-size:0.88rem;background:#fff;border-radius:12px;">No hay registros.</div>';
        }
        return items.map(function(r) {
            var f = ymdADmy(r.fecha || (r.datos && r.datos.fecha));
            var titulo = r.usuarioAtendido || (r.datos && r.datos.usuarioAtendido) || 'Sin título';
            var asunto = r.asunto || (r.datos && r.datos.asunto) || '';
            var badge = badgeHtml(r);
            var meta = escHtml(f) + ' · ' + escHtml(asunto);
            if (r.profesional_nombre) meta = escHtml(r.profesional_nombre) + ' · ' + meta;
            var id = r.id || r.local_id;
            var actions = '';
            if (opts.readonly) {
                actions = ''
                    + '<button type="button" class="ra-dash-ver" data-id="' + escHtml(id) + '" data-remote="' + escHtml(r.remote_id || r.id || '') + '" style="padding:8px 12px;background:#1a5c35;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">Ver</button>'
                    + '<button type="button" class="ra-dash-pdf" data-id="' + escHtml(id) + '" data-remote="' + escHtml(r.remote_id || r.id || '') + '" style="padding:8px 12px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">PDF</button>';
            } else if (opts.admin) {
                actions = ''
                    + '<button type="button" class="ra-dash-edit" data-id="' + escHtml(id) + '" data-remote="' + escHtml(r.remote_id || r.id || '') + '" style="padding:8px 12px;background:#1a5c35;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">Editar</button>'
                    + '<button type="button" class="ra-dash-del" data-id="' + escHtml(id) + '" data-remote="' + escHtml(r.remote_id || r.id || '') + '" style="padding:8px 12px;background:#b91c1c;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">Eliminar</button>'
                    + '<button type="button" class="ra-dash-pdf" data-id="' + escHtml(id) + '" data-remote="' + escHtml(r.remote_id || r.id || '') + '" style="padding:8px 12px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">PDF</button>';
            } else {
                actions = ''
                    + '<button type="button" class="ra-dash-edit" data-id="' + escHtml(id) + '" style="padding:8px 12px;background:#1a5c35;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">Editar</button>'
                    + '<button type="button" class="ra-dash-pdf" data-id="' + escHtml(id) + '" style="padding:8px 12px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">PDF</button>';
            }
            return ''
                + '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 1px 8px rgba(0,0,0,.05);">'
                + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'
                + '<div style="flex:1;min-width:0;"><div style="font-weight:700;color:#111827;font-size:0.92rem;">' + escHtml(titulo) + '</div>'
                + '<div style="font-size:0.78rem;color:#6b7280;margin-top:4px;">' + meta + '</div>'
                + '<div style="margin-top:8px;">' + badge + '</div></div>'
                + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + actions + '</div>'
                + '</div></div>';
        }).join('');
    }

    function abrirPdfDesdeRegistro(reg) {
        if (!reg || typeof window.entregarHtmlEnVentanaPdf !== 'function') return;
        obtenerLogoRegistro().then(function(logo) {
            window.entregarHtmlEnVentanaPdf(construirHtmlRegistroAsesoria(reg, logo));
        });
    }

    function wireAccionesListaRegistros(root, opts) {
        opts = opts || {};
        root.querySelectorAll('.ra-dash-pdf').forEach(function(btn) {
            btn.onclick = function() {
                var localId = btn.getAttribute('data-id');
                var remoteId = btn.getAttribute('data-remote');
                if (btn._regCache) {
                    abrirPdfDesdeRegistro(btn._regCache);
                    return;
                }
                idbGetRegistro(localId).then(function(rec) {
                    abrirPdfDesdeRegistro(rec ? registroAFormulario(rec) : null);
                });
            };
        });
        root.querySelectorAll('.ra-dash-edit').forEach(function(btn) {
            btn.onclick = function() {
                var localId = btn.getAttribute('data-id');
                var remoteId = btn.getAttribute('data-remote');
                if (opts.admin && btn._regCache) {
                    editandoId = localId;
                    _editRemoteId = remoteId || null;
                    _editProfesionalId = btn._regCache.profesional_id || null;
                    abrirFormularioRegistro(btn._regCache, false);
                    return;
                }
                idbGetRegistro(localId).then(function(rec) {
                    if (!rec) return;
                    editandoId = rec.local_id;
                    _editRemoteId = rec.remote_id || null;
                    _editProfesionalId = rec.profesional_id || null;
                    abrirFormularioRegistro(registroAFormulario(rec), false);
                });
            };
        });
        root.querySelectorAll('.ra-dash-ver').forEach(function(btn) {
            btn.onclick = function() {
                var reg = btn._regCache;
                if (reg) abrirFormularioRegistro(reg, true);
            };
        });
        root.querySelectorAll('.ra-dash-del').forEach(function(btn) {
            btn.onclick = function() {
                if (!confirm('¿Eliminar este registro?')) return;
                var localId = btn.getAttribute('data-id');
                var remoteId = btn.getAttribute('data-remote');
                var ses = getRaSession();
                var sb = getSupabaseClient();
                var chain = Promise.resolve();
                if (opts.admin && remoteId && sb && ses) {
                    chain = sb.rpc('ra_delete_registro', {
                        p_actor_id: ses.id,
                        p_codigo: ses.codigo_acceso,
                        p_registro_id: remoteId
                    }).then(function(res) {
                        if (res.error) throw new Error(res.error.message || 'Error al eliminar');
                    });
                }
                chain.then(function() {
                    if (String(localId).indexOf('ra_') === 0) return idbDeleteRegistro(localId);
                }).then(function() {
                    renderDashboard();
                }).catch(function(err) {
                    alert(err.message || 'No se pudo eliminar el registro.');
                });
            };
        });
    }

    function renderDashboardProfesional() {
        var root = ensureRolesRoot();
        if (!root) return;
        var ses = getRaSession();
        idbGetByProfesional(ses.id).then(function(lista) {
            var items = lista.map(registroAFormulario).sort(function(a, b) {
                return (b.actualizadoEn || 0) - (a.actualizadoEn || 0);
            });
            root.innerHTML = dashboardHeaderHtml('Panel profesional',
                '<button type="button" id="ra-btn-nuevo" style="width:100%;margin-top:14px;padding:12px 14px;background:#1a5c35;color:#fff;border:none;border-radius:12px;font-size:0.9rem;font-weight:800;cursor:pointer;">+ NUEVO REGISTRO</button>')
                + '<div style="margin-top:12px;font-size:0.82rem;font-weight:700;color:#374151;margin-bottom:8px;">Mis registros</div>'
                + renderListaRegistrosHtml(items, {});
            ensureRaSessionBar();
            var btnNuevo = document.getElementById('ra-btn-nuevo');
            if (btnNuevo) btnNuevo.onclick = abrirNuevoRegistro;
            wireAccionesListaRegistros(root, {});
        });
    }

    function renderDashboardJefe() {
        var root = ensureRolesRoot();
        if (!root) return;
        var ses = getRaSession();
        var sb = getSupabaseClient();
        root.innerHTML = dashboardHeaderHtml('Panel jefe', '<p style="margin:12px 0 0;font-size:0.82rem;color:#6b7280;">Selecciona un profesional para ver sus registros sincronizados.</p>')
            + '<div id="ra-jefe-contenido"><div style="padding:16px;color:#6b7280;font-size:0.86rem;">Cargando equipo…</div></div>';
        ensureRaSessionBar();
        if (!sb) {
            document.getElementById('ra-jefe-contenido').innerHTML = '<div style="padding:16px;color:#b91c1c;">Sin conexión a Supabase.</div>';
            return;
        }
        sb.rpc('ra_list_subordinados', {
            p_jefe_id: ses.id,
            p_codigo: ses.codigo_acceso
        }).then(function(res) {
            if (res.error) throw res.error;
            var subs = res.data || [];
            var cont = document.getElementById('ra-jefe-contenido');
            if (!subs.length) {
                cont.innerHTML = '<div style="padding:16px;color:#6b7280;">No hay profesionales asignados.</div>';
                return;
            }
            cont.innerHTML = subs.map(function(s) {
                return '<button type="button" class="ra-jefe-sub" data-id="' + escHtml(s.id) + '" data-nombre="' + escHtml(s.nombre || '') + '" style="width:100%;text-align:left;padding:14px;margin-bottom:8px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;font-size:0.88rem;font-weight:700;color:#111827;cursor:pointer;">'
                    + escHtml(s.nombre || 'Profesional') + '</button>';
            }).join('') + '<div id="ra-jefe-registros" style="margin-top:12px;"></div>';
            cont.querySelectorAll('.ra-jefe-sub').forEach(function(btn) {
                btn.onclick = function() {
                    cont.querySelectorAll('.ra-jefe-sub').forEach(function(b) { b.style.borderColor = '#e5e7eb'; });
                    btn.style.borderColor = '#1a5c35';
                    var profId = btn.getAttribute('data-id');
                    var dest = document.getElementById('ra-jefe-registros');
                    dest.innerHTML = '<div style="padding:12px;color:#6b7280;">Cargando registros…</div>';
                    sb.rpc('ra_list_jefe', {
                        p_jefe_id: ses.id,
                        p_profesional_id: profId,
                        p_codigo: ses.codigo_acceso
                    }).then(function(r2) {
                        if (r2.error) throw r2.error;
                        var rows = (r2.data || []).map(remoteRegistroAFormulario);
                        dest.innerHTML = '<div style="font-size:0.82rem;font-weight:700;color:#374151;margin-bottom:8px;">Registros de ' + escHtml(btn.getAttribute('data-nombre')) + '</div>'
                            + renderListaRegistrosSemanaHtml(rows, { readonly: true });
                        attachRegCacheToButtons(dest, rows);
                        wireAccionesListaRegistros(dest, { readonly: true });
                    }).catch(function() {
                        dest.innerHTML = '<div style="padding:12px;color:#b91c1c;">No se pudieron cargar los registros.</div>';
                    });
                };
            });
        }).catch(function() {
            var cont = document.getElementById('ra-jefe-contenido');
            if (cont) cont.innerHTML = '<div style="padding:16px;color:#b91c1c;">Error al cargar subordinados.</div>';
        });
    }

    function rolEtiquetaCorta(rol) {
        var r = String(rol || '').toLowerCase();
        if (r === 'admin' || r === 'administrador') return 'Admin';
        if (r === 'jefe') return 'Jefe';
        return 'Prof';
    }

    function renderTablaUsuariosAdminHtml(lista, adminId) {
        if (!lista.length) {
            return '<div style="padding:16px;text-align:center;color:#6b7280;font-size:0.84rem;">No hay usuarios.</div>';
        }
        var rows = lista.map(function(u) {
            var acciones = '';
            acciones += '<button type="button" class="ra-user-edit" data-id="' + escHtml(u.id) + '" style="padding:6px 10px;background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;margin-right:4px;">Editar</button>';
            if (String(u.id) === String(adminId)) {
                acciones += '<span style="font-size:0.72rem;color:#9ca3af;">Tú</span>';
            } else {
                acciones += '<button type="button" class="ra-user-del" data-id="' + escHtml(u.id) + '" data-nombre="' + escHtml(u.nombre || '') + '" style="padding:6px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">Eliminar</button>';
            }
            return ''
                + '<tr style="border-top:1px solid #f3f4f6;">'
                + '<td style="padding:10px 8px;font-size:0.82rem;color:#111827;">' + escHtml(u.nombre || '') + '</td>'
                + '<td style="padding:10px 8px;font-size:0.82rem;color:#1a5c35;font-family:monospace;font-weight:700;letter-spacing:.06em;">' + escHtml(u.codigo_acceso || '—') + '</td>'
                + '<td style="padding:10px 8px;font-size:0.78rem;color:#374151;">' + escHtml(rolEtiquetaCorta(u.rol)) + '</td>'
                + '<td style="padding:10px 4px;text-align:right;white-space:nowrap;">' + acciones + '</td>'
                + '</tr>';
        }).join('');
        return ''
            + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">'
            + '<table style="width:100%;min-width:320px;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;">'
            + '<thead><tr style="background:#f9fafb;text-align:left;">'
            + '<th style="padding:10px 8px;font-size:0.72rem;color:#6b7280;">Nombre</th>'
            + '<th style="padding:10px 8px;font-size:0.72rem;color:#6b7280;">Código</th>'
            + '<th style="padding:10px 8px;font-size:0.72rem;color:#6b7280;">Rol</th>'
            + '<th style="padding:10px 4px;"></th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function cargarUsuariosAdmin(sb, ses) {
        var cont = document.getElementById('ra-admin-usuarios-body');
        if (!cont || !sb || !ses) return;
        cont.innerHTML = '<div style="padding:12px;color:#6b7280;font-size:0.84rem;">Cargando usuarios…</div>';
        sb.rpc('ra_list_usuarios', {
            p_admin_id: ses.id,
            p_codigo: ses.codigo_acceso
        }).then(function(res) {
            if (res.error) throw res.error;
            var lista = res.data || [];
            cont.innerHTML = renderTablaUsuariosAdminHtml(lista, ses.id);
            wireAccionesUsuariosAdmin(cont, lista, sb, ses);
        }).catch(function(err) {
            cont.innerHTML = '<div style="padding:12px;color:#b91c1c;font-size:0.84rem;">'
                + escHtml((err && err.message) ? err.message : 'No se pudieron cargar usuarios. Ejecuta el SQL ra_list_usuarios en Supabase.')
                + '</div>';
        });
    }

    function wireAccionesUsuariosAdmin(cont, lista, sb, ses) {
        cont.querySelectorAll('.ra-user-edit').forEach(function(btn) {
            btn.onclick = function() {
                var uid = btn.getAttribute('data-id');
                var usuario = null;
                for (var i = 0; i < lista.length; i++) {
                    if (String(lista[i].id) === String(uid)) { usuario = lista[i]; break; }
                }
                if (!usuario) return;
                var jefes = lista.filter(function(u) { return String(u.rol || '').toLowerCase() === 'jefe'; });
                abrirModalUsuarioForm({ mode: 'edit', sb: sb, ses: ses, jefes: jefes, usuario: usuario, onSuccess: function() { cargarUsuariosAdmin(sb, ses); } });
            };
        });
        cont.querySelectorAll('.ra-user-del').forEach(function(btn) {
            btn.onclick = function() {
                var uid = btn.getAttribute('data-id');
                var uname = btn.getAttribute('data-nombre') || 'este usuario';
                if (String(uid) === String(ses.id)) {
                    alert('No puedes eliminar tu propio usuario Admin.');
                    return;
                }
                if (!confirm('¿Eliminar a ' + uname + '?')) return;
                btn.disabled = true;
                sb.rpc('ra_delete_usuario', {
                    p_admin_id: ses.id,
                    p_codigo_admin: ses.codigo_acceso,
                    p_usuario_id: uid
                }).then(function(res) {
                    if (res.error) throw res.error;
                    cargarUsuariosAdmin(sb, ses);
                }).catch(function(err) {
                    btn.disabled = false;
                    alert((err && err.message) ? err.message : 'No se pudo eliminar el usuario.');
                });
            };
        });
    }

    function abrirModalUsuarioForm(opts) {
        if (document.getElementById('ra-user-modal-overlay')) return;
        var mode = opts.mode === 'edit' ? 'edit' : 'create';
        var esEdit = mode === 'edit';
        var usuario = opts.usuario || {};
        var codigoInicial = esEdit ? normalizarCodigoUsuario(usuario.codigo_acceso || '') : generarCodigo();
        var titulo = esEdit ? 'Editar Usuario' : 'Nuevo usuario';
        var overlay = document.createElement('div');
        overlay.id = 'ra-user-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,51,33,0.88);z-index:10080;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;overflow-y:auto;-webkit-overflow-scrolling:touch;';
        var jefeOpts = (opts.jefes || []).map(function(j) {
            var sel = esEdit && usuario.jefe_id && String(usuario.jefe_id) === String(j.id) ? ' selected' : '';
            return '<option value="' + escHtml(j.id) + '"' + sel + '>' + escHtml(j.nombre || '') + '</option>';
        }).join('');
        var rolVal = String(usuario.rol || 'profesional').toLowerCase();
        if (rolVal === 'administrador') rolVal = 'admin';
        overlay.innerHTML = ''
            + '<div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:system-ui,-apple-system,sans-serif;margin:auto;">'
            + '<h3 style="margin:0 0 14px;font-size:1rem;color:#0d3321;">' + escHtml(titulo) + '</h3>'
            + '<label style="display:block;font-size:0.76rem;font-weight:700;color:#374151;margin-bottom:4px;">Nombre</label>'
            + '<input type="text" id="ra-user-nombre" value="' + escHtml(esEdit ? (usuario.nombre || '') : '') + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:0.88rem;margin-bottom:12px;">'
            + '<label style="display:block;font-size:0.76rem;font-weight:700;color:#374151;margin-bottom:4px;">Código</label>'
            + '<div id="ra-user-codigo-display" style="font-size:1.55rem;font-weight:800;letter-spacing:.14em;font-family:monospace;text-align:center;padding:14px 10px;background:#f0fdf4;border:2px dashed #86efac;border-radius:12px;margin-bottom:8px;color:#1a5c35;">' + escHtml(codigoInicial) + '</div>'
            + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">'
            + '<input type="text" id="ra-user-codigo" value="' + escHtml(codigoInicial) + '" maxlength="10" style="flex:1;min-width:140px;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:0.95rem;font-weight:800;letter-spacing:.08em;font-family:monospace;">'
            + '<button type="button" id="ra-user-regen-codigo" title="Generar nuevo código" style="padding:10px 12px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:10px;font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">🔄 Nuevo</button>'
            + '</div>'
            + '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">'
            + '<button type="button" id="ra-user-copy-codigo" style="flex:1;min-width:120px;padding:10px 12px;background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:10px;font-size:0.78rem;font-weight:700;cursor:pointer;">📋 Copiar código</button>'
            + '<button type="button" id="ra-user-wa-share" style="flex:1;min-width:120px;padding:10px 12px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.78rem;font-weight:700;cursor:pointer;">📱 WhatsApp</button>'
            + '</div>'
            + '<label style="display:block;font-size:0.76rem;font-weight:700;color:#374151;margin-bottom:4px;">Rol</label>'
            + '<select id="ra-user-rol" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:0.88rem;margin-bottom:12px;">'
            + '<option value="profesional"' + (rolVal === 'profesional' ? ' selected' : '') + '>Profesional</option>'
            + '<option value="jefe"' + (rolVal === 'jefe' ? ' selected' : '') + '>Jefe</option>'
            + '<option value="admin"' + (rolVal === 'admin' ? ' selected' : '') + '>Admin</option>'
            + '</select>'
            + '<div id="ra-user-jefe-wrap" style="margin-bottom:12px;">'
            + '<label style="display:block;font-size:0.76rem;font-weight:700;color:#374151;margin-bottom:4px;">Jefe</label>'
            + '<select id="ra-user-jefe" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:0.88rem;">'
            + '<option value="">Seleccionar…</option>' + jefeOpts
            + '</select></div>'
            + '<p id="ra-user-modal-error" style="display:none;margin:0 0 10px;font-size:0.78rem;color:#b91c1c;"></p>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
            + '<button type="button" id="ra-user-guardar" style="flex:1;min-width:120px;padding:11px 14px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.88rem;font-weight:800;cursor:pointer;">Guardar</button>'
            + '<button type="button" id="ra-user-cancelar" style="flex:1;min-width:120px;padding:11px 14px;background:#e5e7eb;color:#374151;border:none;border-radius:10px;font-size:0.88rem;font-weight:700;cursor:pointer;">Cancelar</button>'
            + '</div></div>';
        document.body.appendChild(overlay);

        var codigoInput = overlay.querySelector('#ra-user-codigo');
        var codigoDisplay = overlay.querySelector('#ra-user-codigo-display');

        function syncCodigoUi() {
            var c = normalizarCodigoUsuario(codigoInput.value);
            codigoInput.value = c;
            codigoDisplay.textContent = c || '——';
        }

        function leerFormulario() {
            var nombre = normalizarNombreUsuario(overlay.querySelector('#ra-user-nombre').value);
            var rol = overlay.querySelector('#ra-user-rol').value;
            var codigo = normalizarCodigoUsuario(codigoInput.value);
            var jefeId = overlay.querySelector('#ra-user-jefe').value || null;
            if (rol !== 'profesional') jefeId = null;
            return { nombre: nombre, rol: rol, codigo: codigo, jefeId: jefeId };
        }

        function toggleJefe() {
            var rol = overlay.querySelector('#ra-user-rol').value;
            overlay.querySelector('#ra-user-jefe-wrap').style.display = rol === 'profesional' ? 'block' : 'none';
        }

        function cerrar() { cerrarOverlayPorId('ra-user-modal-overlay'); }

        toggleJefe();
        syncCodigoUi();
        overlay.querySelector('#ra-user-rol').onchange = toggleJefe;
        overlay.querySelector('#ra-user-cancelar').onclick = cerrar;
        codigoInput.addEventListener('input', syncCodigoUi);
        overlay.querySelector('#ra-user-regen-codigo').onclick = function() {
            codigoInput.value = generarCodigo();
            syncCodigoUi();
        };
        overlay.querySelector('#ra-user-copy-codigo').onclick = function() {
            syncCodigoUi();
            var datos = leerFormulario();
            if (!datos.codigo) { alert('Ingresa un código válido.'); return; }
            copiarTexto(datos.codigo).then(function() {
                overlay.querySelector('#ra-user-copy-codigo').textContent = 'Copiado';
                setTimeout(function() {
                    var b = overlay.querySelector('#ra-user-copy-codigo');
                    if (b) b.textContent = '📋 Copiar código';
                }, 1500);
            }).catch(function() { alert('No se pudo copiar el código.'); });
        };
        overlay.querySelector('#ra-user-wa-share').onclick = function() {
            syncCodigoUi();
            var datos = leerFormulario();
            if (!datos.nombre || !datos.codigo) {
                alert('Completa nombre y código antes de compartir.');
                return;
            }
            var msg = mensajeWhatsAppAccesoProyecar(datos.nombre, datos.codigo);
            copiarTexto(msg).then(function() {
                overlay.querySelector('#ra-user-wa-share').textContent = 'Copiado';
                setTimeout(function() {
                    var b = overlay.querySelector('#ra-user-wa-share');
                    if (b) b.textContent = '📱 WhatsApp';
                }, 1500);
            }).catch(function() { alert('No se pudo copiar el mensaje.'); });
        };

        overlay.querySelector('#ra-user-guardar').onclick = function() {
            syncCodigoUi();
            var datos = leerFormulario();
            var errEl = overlay.querySelector('#ra-user-modal-error');
            errEl.style.display = 'none';
            if (!datos.nombre) {
                errEl.style.display = 'block';
                errEl.textContent = 'Ingresa el nombre.';
                return;
            }
            if (!datos.codigo || datos.codigo.length < 4) {
                errEl.style.display = 'block';
                errEl.textContent = 'Ingresa un código válido (mínimo 4 caracteres).';
                return;
            }
            if (datos.rol === 'profesional' && !datos.jefeId) {
                errEl.style.display = 'block';
                errEl.textContent = 'Selecciona un jefe para el profesional.';
                return;
            }
            abrirModalConfirmarUsuario({
                nombre: datos.nombre,
                codigo: datos.codigo,
                rol: datos.rol,
                onCorregir: function() {},
                onConfirm: function() {
                    if (esEdit) {
                        return opts.sb.rpc('ra_update_usuario', {
                            p_admin_id: opts.ses.id,
                            p_codigo_admin: opts.ses.codigo_acceso,
                            p_usuario_id: usuario.id,
                            p_nombre: datos.nombre,
                            p_codigo_acceso: datos.codigo,
                            p_rol: datos.rol,
                            p_jefe_id: datos.jefeId
                        }).then(function(res) {
                            if (res.error) throw res.error;
                            mostrarToastUsuarioGuardado(datos.codigo, datos.nombre, esEdit);
                        });
                    }
                    return opts.sb.rpc('ra_create_usuario', {
                        p_admin_id: opts.ses.id,
                        p_codigo_admin: opts.ses.codigo_acceso,
                        p_nombre: datos.nombre,
                        p_codigo_acceso: datos.codigo,
                        p_rol: datos.rol,
                        p_jefe_id: datos.jefeId
                    }).then(function(res) {
                        if (res.error) throw res.error;
                        mostrarToastUsuarioGuardado(datos.codigo, datos.nombre, esEdit);
                    });
                },
                onSuccess: function() {
                    if (typeof opts.onSuccess === 'function') opts.onSuccess();
                }
            });
        };
    }

    function abrirModalNuevoUsuario(sb, ses, jefes) {
        abrirModalUsuarioForm({ mode: 'create', sb: sb, ses: ses, jefes: jefes, onSuccess: function() { cargarUsuariosAdmin(sb, ses); } });
    }

    function mostrarToastUsuarioGuardado(codigo, nombre, esEdit) {
        var prev = document.getElementById('ra-user-created-toast');
        if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        var toast = document.createElement('div');
        toast.id = 'ra-user-created-toast';
        toast.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(16px,env(safe-area-inset-bottom));z-index:10090;background:#ecfdf5;border:1px solid #86efac;border-radius:12px;padding:14px;box-shadow:0 8px 24px rgba(0,0,0,.12);font-family:system-ui,-apple-system,sans-serif;';
        toast.innerHTML = ''
            + '<div style="font-size:0.88rem;font-weight:800;color:#166534;margin-bottom:6px;">' + escHtml(esEdit ? 'Usuario actualizado' : 'Usuario creado') + '</div>'
            + '<div style="font-size:0.82rem;color:#374151;margin-bottom:4px;">' + escHtml(nombre) + '</div>'
            + '<div style="font-size:1.1rem;font-weight:800;font-family:monospace;letter-spacing:.1em;color:#1a5c35;margin-bottom:10px;">' + escHtml(codigo) + '</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
            + '<button type="button" id="ra-user-wa-copy" style="flex:1;min-width:140px;padding:10px 12px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;">Copiar WhatsApp</button>'
            + '<button type="button" id="ra-user-copy-code-toast" style="padding:10px 12px;background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;">📋 Código</button>'
            + '<button type="button" id="ra-user-toast-close" style="padding:10px 12px;background:#e5e7eb;color:#374151;border:none;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;">Cerrar</button>'
            + '</div>';
        document.body.appendChild(toast);
        var msg = mensajeWhatsAppAccesoProyecar(nombre, codigo);
        toast.querySelector('#ra-user-toast-close').onclick = function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        };
        toast.querySelector('#ra-user-wa-copy').onclick = function() {
            copiarTexto(msg).then(function() {
                toast.querySelector('#ra-user-wa-copy').textContent = 'Copiado';
            }).catch(function() { alert('No se pudo copiar.'); });
        };
        toast.querySelector('#ra-user-copy-code-toast').onclick = function() {
            copiarTexto(codigo).then(function() {
                toast.querySelector('#ra-user-copy-code-toast').textContent = 'Copiado';
            }).catch(function() { alert('No se pudo copiar.'); });
        };
    }

    function mostrarToastUsuarioCreado(codigo, nombre) {
        mostrarToastUsuarioGuardado(codigo, nombre, false);
    }

    function renderDashboardAdmin() {
        var root = ensureRolesRoot();
        if (!root) return;
        var ses = getRaSession();
        var sb = getSupabaseClient();
        root.innerHTML = dashboardHeaderHtml('Panel administrador', '<div id="ra-admin-kpis" style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;"></div>')
            + '<div id="ra-admin-usuarios" style="margin-top:14px;background:#fff;border-radius:14px;padding:14px;box-shadow:0 1px 8px rgba(0,0,0,.05);">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'
            + '<div style="font-size:0.82rem;font-weight:800;color:#374151;">Usuarios del sistema</div>'
            + '<button type="button" id="ra-admin-user-add" style="padding:8px 12px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.78rem;font-weight:700;cursor:pointer;">+ Agregar</button>'
            + '</div><div id="ra-admin-usuarios-body"><div style="padding:12px;color:#6b7280;font-size:0.84rem;">Cargando…</div></div></div>'
            + '<div style="margin-top:14px;"><button type="button" id="ra-admin-nuevo" style="width:100%;padding:12px 14px;background:#1a5c35;color:#fff;border:none;border-radius:12px;font-size:0.88rem;font-weight:800;cursor:pointer;">+ NUEVO REGISTRO</button></div>'
            + '<div id="ra-admin-lista" style="margin-top:14px;"><div style="padding:16px;color:#6b7280;">Cargando…</div></div>';
        ensureRaSessionBar();
        var btnNuevo = document.getElementById('ra-admin-nuevo');
        if (btnNuevo) btnNuevo.onclick = abrirNuevoRegistro;
        if (!sb) {
            document.getElementById('ra-admin-lista').innerHTML = '<div style="padding:16px;color:#b91c1c;">Sin conexión a Supabase.</div>';
            var ubody = document.getElementById('ra-admin-usuarios-body');
            if (ubody) ubody.innerHTML = '<div style="padding:12px;color:#b91c1c;font-size:0.84rem;">Sin conexión a Supabase.</div>';
            return;
        }
        cargarUsuariosAdmin(sb, ses);
        var btnAddUser = document.getElementById('ra-admin-user-add');
        if (btnAddUser) {
            btnAddUser.onclick = function() {
                sb.rpc('ra_list_usuarios', {
                    p_admin_id: ses.id,
                    p_codigo: ses.codigo_acceso
                }).then(function(res) {
                    var lista = res.data || [];
                    var jefes = lista.filter(function(u) { return String(u.rol || '').toLowerCase() === 'jefe'; });
                    abrirModalNuevoUsuario(sb, ses, jefes);
                }).catch(function() {
                    abrirModalNuevoUsuario(sb, ses, []);
                });
            };
        }
        sb.rpc('ra_admin_stats', {
            p_admin_id: ses.id,
            p_codigo: ses.codigo_acceso
        }).then(function(st) {
            var kpis = st.data || {};
            var kpiEl = document.getElementById('ra-admin-kpis');
            if (kpiEl) {
                var defs = [
                    { k: 'total', lbl: 'Total' },
                    { k: 'hoy', lbl: 'Hoy' },
                    { k: 'semana', lbl: 'Semana' },
                    { k: 'pendientes_sync', lbl: 'Pend. sync' }
                ];
                kpiEl.innerHTML = defs.map(function(d) {
                    var val = kpis[d.k] != null ? kpis[d.k] : (kpis[d.lbl.toLowerCase()] != null ? kpis[d.lbl.toLowerCase()] : '—');
                    return '<div style="background:#f0fdf4;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:1.2rem;font-weight:800;color:#1a5c35;">' + escHtml(String(val)) + '</div><div style="font-size:0.72rem;color:#374151;margin-top:4px;">' + escHtml(d.lbl) + '</div></div>';
                }).join('');
            }
        }).catch(function() {});
        sb.rpc('ra_list_admin', {
            p_admin_id: ses.id,
            p_codigo: ses.codigo_acceso
        }).then(function(res) {
            if (res.error) throw res.error;
            var rows = (res.data || []).map(remoteRegistroAFormulario);
            var listaEl = document.getElementById('ra-admin-lista');
            listaEl.innerHTML = '<div style="font-size:0.82rem;font-weight:700;color:#374151;margin-bottom:8px;">Todos los registros</div>'
                + renderListaRegistrosSemanaHtml(rows, { admin: true });
            attachRegCacheToButtons(listaEl, rows);
            wireAccionesListaRegistros(listaEl, { admin: true });
        }).catch(function() {
            var listaEl = document.getElementById('ra-admin-lista');
            if (listaEl) listaEl.innerHTML = '<div style="padding:16px;color:#b91c1c;">Error al cargar registros.</div>';
        });
    }

    function renderDashboard() {
        var ses = getRaSession();
        if (!ses) return;
        ensureRaSessionBar();
        setUiModoDashboard(true);
        wireSyncEvents();
        syncPendientes();
        var rol = (ses.rol || '').toLowerCase();
        if (rol === 'admin' || rol === 'administrador') renderDashboardAdmin();
        else if (rol === 'jefe') renderDashboardJefe();
        else renderDashboardProfesional();
    }

    function initLogin() {
        if (document.getElementById('ra-login-overlay')) return;
        if (!esPantallaRegistroAsesoriaActiva()) return;
        setUiModoDashboard(false);
        setUiModoFormulario(false);
        var overlay = document.createElement('div');
        overlay.id = 'ra-login-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,51,33,0.92);z-index:10070;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
        overlay.innerHTML = ''
            + '<div style="background:#fff;border-radius:14px;max-width:400px;width:100%;padding:22px 20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:system-ui,-apple-system,sans-serif;">'
            + '<h2 style="margin:0 0 6px;font-size:1.05rem;color:#0d3321;">Acceso Registro de Asesoría</h2>'
            + '<p style="margin:0 0 16px;font-size:0.82rem;color:#6b7280;line-height:1.45;">Ingresa tu nombre y código de acceso.</p>'
            + '<label style="display:block;font-size:0.78rem;font-weight:700;color:#374151;margin-bottom:4px;">Nombre</label>'
            + '<input type="text" id="ra-login-nombre" autocomplete="name" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:0.9rem;margin-bottom:12px;">'
            + '<label style="display:block;font-size:0.78rem;font-weight:700;color:#374151;margin-bottom:4px;">Código</label>'
            + '<input type="password" id="ra-login-codigo" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:0.9rem;margin-bottom:16px;">'
            + '<button type="button" id="ra-login-submit" style="width:100%;padding:12px 14px;background:#1a5c35;color:#fff;border:none;border-radius:10px;font-size:0.9rem;font-weight:800;cursor:pointer;">Entrar</button>'
            + '<p id="ra-login-error" style="display:none;margin:12px 0 0;font-size:0.78rem;color:#b91c1c;"></p>'
            + '</div>';
        document.body.appendChild(overlay);

        function cerrarOverlay() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        function intentarLogin() {
            var nombre = (overlay.querySelector('#ra-login-nombre').value || '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();
            var codigo = (overlay.querySelector('#ra-login-codigo').value || '').trim().toUpperCase();
            var errEl = overlay.querySelector('#ra-login-error');
            if (!nombre || !codigo) {
                errEl.style.display = 'block';
                errEl.textContent = 'Completa nombre y código.';
                return;
            }
            var sb = getSupabaseClient();
            if (!sb) {
                errEl.style.display = 'block';
                errEl.textContent = 'Supabase no disponible. Recarga la app e intenta de nuevo.';
                return;
            }
            var btn = overlay.querySelector('#ra-login-submit');
            btn.disabled = true;
            btn.textContent = 'Verificando…';
            console.log('[RA Login] RPC ra_login →', { p_nombre: nombre, p_codigo: codigo });
            sb.rpc('ra_login', { p_nombre: nombre, p_codigo: codigo }).then(function(res) {
                console.log('[RA Login] respuesta Supabase:', res);
                btn.disabled = false;
                btn.textContent = 'Entrar';
                var u = normalizarUsuarioRaLogin(res.data);
                if (res.error || !u) {
                    errEl.style.display = 'block';
                    errEl.textContent = mensajeErrorLoginRa(res, null);
                    return;
                }
                setRaSession({
                    id: u.id,
                    nombre: u.nombre || nombre,
                    rol: u.rol || 'profesional',
                    jefe_id: u.jefe_id || null,
                    codigo: codigo
                });
                cerrarOverlay();
                if (!_formInitDone) {
                    initRegistroAsesoriaCore();
                    _formInitDone = true;
                }
                wireSyncEvents();
                renderDashboard();
                if (typeof window.mostrarPantalla === 'function') window.mostrarPantalla('registro-asesoria');
            }).catch(function(err) {
                console.log('[RA Login] error catch:', err);
                btn.disabled = false;
                btn.textContent = 'Entrar';
                errEl.style.display = 'block';
                errEl.textContent = mensajeErrorLoginRa(null, err);
            });
        }

        overlay.querySelector('#ra-login-submit').onclick = intentarLogin;
        overlay.querySelector('#ra-login-codigo').addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') intentarLogin();
        });
    }

    function bootstrapRaApp() {
        migrarDesdeLocalStorage();
        wireReinicioGlobalHook();
        wireAutoUpdateDesdeSW();
        ensureRolesRoot();
        wireEntradaRegistroAsesoria();
        cerrarLoginRaSiFueraDeModulo();
    }

    function slugId(texto) {
        return (texto || '').toString().trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-nombre';
    }

    function ymdADmy(ymd) {
        if (!ymd) return '';
        var p = String(ymd).split('-');
        if (p.length !== 3) return ymd;
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function escHtml(s) {
        return (s || '').toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizarPersona(p) {
        p = p || {};
        return {
            nombre: p.nombre || '',
            cedula: p.cedula || '',
            celular: p.celular || p.telefono || '',
            entidad: p.entidad || ''
        };
    }

    function obtenerRegistros() {
        return leerJSON(LS_REGISTROS, []);
    }
    function guardarRegistros(lista) {
        return guardarJSON(LS_REGISTROS, lista);
    }
    function obtenerFirmasGuardadas() {
        return leerJSON(LS_FIRMAS, {});
    }
    function guardarFirmasMap(map) {
        return guardarJSON(LS_FIRMAS, map);
    }

    function obtenerLogoRegistro() {
        if (_logoDataUrl) return Promise.resolve(_logoDataUrl);
        return fetch(LOGO_URL).then(function(r) {
            if (!r.ok) throw new Error('logo');
            return r.blob();
        }).then(function(blob) {
            return new Promise(function(resolve) {
                var fr = new FileReader();
                fr.onload = function() { _logoDataUrl = fr.result; resolve(_logoDataUrl); };
                fr.onerror = function() { resolve(''); };
                fr.readAsDataURL(blob);
            });
        }).catch(function() { return ''; });
    }

    function canvasVacio(ctx, canvas) {
        var px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (var pi = 0; pi < px.length; pi += 4) {
            if (px[pi] !== 255 || px[pi + 1] !== 255 || px[pi + 2] !== 255) return false;
        }
        return true;
    }

    /** Firma táctil activada al tocar la línea horizontal */
    function crearFirmaEnLinea(mountEl, opts) {
        opts = opts || {};
        var lineLabel = opts.lineLabel || 'FIRMA';
        var signerKey = opts.signerKey || function() { return 'firmante'; };

        mountEl.innerHTML = ''
            + '<div class="firma-linea-slot">'
            + '<div class="firma-linea-zona" role="button" tabindex="0" aria-label="Tocar para firmar">'
            + '<canvas class="firma-canvas-linea"></canvas>'
            + '<img class="firma-linea-img" alt="" style="display:none">'
            + '<span class="firma-linea-hint">Tocar la línea para firmar</span>'
            + '</div>'
            + '<div class="firma-linea-ts" style="display:none;font-size:8.5pt;color:#6b7280;text-align:center;margin-top:2px;line-height:1.2;"></div>'
            + '<div class="firma-linea-etiq">' + escHtml(lineLabel) + '</div>'
            + '<div class="firma-linea-tools">'
            + '<button type="button" class="firma-btn-usar" style="display:none;">Usar firma guardada</button>'
            + '<div class="firma-panel-actions">'
            + '<button type="button" class="firma-btn-borrar">Borrar</button>'
            + '<button type="button" class="firma-btn-aceptar">Aceptar</button>'
            + '</div>'
            + '<label class="firma-guardar-lbl"><input type="checkbox" class="firma-guardar-chk"> Guardar esta firma para futuros registros</label>'
            + '</div>'
            + '<button type="button" class="firma-linea-rehacer" style="display:none;">Borrar firma</button>'
            + '</div>';

        var slot = mountEl.querySelector('.firma-linea-slot');
        var zona = mountEl.querySelector('.firma-linea-zona');
        var canvas = mountEl.querySelector('.firma-canvas-linea');
        var ctx = canvas.getContext('2d');
        var img = mountEl.querySelector('.firma-linea-img');
        var hint = mountEl.querySelector('.firma-linea-hint');
        var tools = mountEl.querySelector('.firma-linea-tools');
        var btnBorrar = mountEl.querySelector('.firma-btn-borrar');
        var btnAceptar = mountEl.querySelector('.firma-btn-aceptar');
        var btnUsar = mountEl.querySelector('.firma-btn-usar');
        var btnRehacer = mountEl.querySelector('.firma-linea-rehacer');
        var chkGuardar = mountEl.querySelector('.firma-guardar-chk');
        var tsEl = mountEl.querySelector('.firma-linea-ts');
        var accepted = '';
        var acceptedTimestamp = '';
        var isAccepted = false;
        var isActive = false;
        var drawing = false;

        function resizeCanvas() {
            var rect = zona.getBoundingClientRect();
            var ratio = window.devicePixelRatio || 1;
            var w = Math.max(120, Math.floor(rect.width * ratio));
            var h = Math.floor(LINEA_ALTURA * ratio);
            canvas.width = w;
            canvas.height = h;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(ratio, ratio);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2.2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rect.width, LINEA_ALTURA);
            if (isActive && accepted && !isAccepted) {
                var tmp = new Image();
                tmp.onload = function() {
                    ctx.drawImage(tmp, 0, 0, rect.width, LINEA_ALTURA);
                };
                tmp.src = accepted;
            }
        }

        function pos(ev) {
            var rect = canvas.getBoundingClientRect();
            var t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
            return { x: t.clientX - rect.left, y: t.clientY - rect.top };
        }

        function startDraw(ev) {
            if (!isActive || isAccepted) return;
            ev.preventDefault();
            drawing = true;
            var p = pos(ev);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        }
        function moveDraw(ev) {
            if (!drawing || !isActive || isAccepted) return;
            ev.preventDefault();
            var p = pos(ev);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        function endDraw(ev) {
            if (ev) ev.preventDefault();
            drawing = false;
        }

        function activar() {
            if (isAccepted) return;
            isActive = true;
            slot.classList.add('firma-activa');
            hint.style.display = 'none';
            canvas.style.display = 'block';
            tools.style.display = 'block';
            btnRehacer.style.display = 'none';
            resizeCanvas();
            refrescarUsarGuardada();
        }

        function desactivarSinAceptar() {
            isActive = false;
            slot.classList.remove('firma-activa');
            canvas.style.display = 'none';
            tools.style.display = 'none';
            if (!isAccepted) {
                hint.style.display = 'block';
                accepted = '';
                resizeCanvas();
            }
        }

        function mostrarAceptada(dataUrl, tsText) {
            accepted = dataUrl;
            isAccepted = true;
            isActive = false;
            if (tsText) {
                acceptedTimestamp = tsText;
                if (tsEl) {
                    tsEl.textContent = tsText;
                    tsEl.style.display = 'block';
                }
            }
            img.src = dataUrl;
            img.style.display = 'block';
            canvas.style.display = 'none';
            tools.style.display = 'none';
            hint.style.display = 'none';
            btnRehacer.style.display = 'inline-block';
            slot.classList.remove('firma-activa');
            slot.classList.add('firma-aceptada');
        }

        function limpiarLienzo() {
            isAccepted = false;
            isActive = false;
            accepted = '';
            acceptedTimestamp = '';
            img.style.display = 'none';
            img.src = '';
            canvas.style.display = 'none';
            tools.style.display = 'none';
            hint.style.display = 'block';
            btnRehacer.style.display = 'none';
            chkGuardar.checked = false;
            if (tsEl) { tsEl.textContent = ''; tsEl.style.display = 'none'; }
            slot.classList.remove('firma-activa', 'firma-aceptada');
            resizeCanvas();
        }

        function aceptarFirma() {
            if (isAccepted) return accepted;
            if (!isActive) activar();
            var blank = document.createElement('canvas');
            blank.width = canvas.width;
            blank.height = canvas.height;
            blank.getContext('2d').drawImage(canvas, 0, 0);
            var data = blank.toDataURL('image/png');
            if (canvasVacio(ctx, canvas)) {
                alert('Dibuja tu firma sobre la línea antes de aceptar.');
                return '';
            }
            var ts = new Date();
            acceptedTimestamp = ts.toLocaleDateString('es-CO') + ' ' + ts.toLocaleTimeString('es-CO');
            if (tsEl) {
                tsEl.textContent = acceptedTimestamp;
                tsEl.style.display = 'block';
            }
            if (chkGuardar.checked) {
                var id = slugId(typeof signerKey === 'function' ? signerKey() : signerKey);
                var map = obtenerFirmasGuardadas();
                map[id] = {
                    nombre: typeof signerKey === 'function' ? signerKey() : signerKey,
                    dataUrl: data,
                    actualizado: Date.now()
                };
                guardarFirmasMap(map);
                if (typeof window.renderGestionFirmasRegistro === 'function') {
                    window.renderGestionFirmasRegistro();
                }
            }
            mostrarAceptada(data);
            return accepted;
        }

        function usarGuardada() {
            var id = slugId(typeof signerKey === 'function' ? signerKey() : signerKey);
            var map = obtenerFirmasGuardadas();
            if (!map[id]) return;
            mostrarAceptada(map[id].dataUrl);
        }

        function refrescarUsarGuardada() {
            var id = slugId(typeof signerKey === 'function' ? signerKey() : signerKey);
            var map = obtenerFirmasGuardadas();
            btnUsar.style.display = map[id] ? 'inline-flex' : 'none';
        }

        zona.addEventListener('click', function(ev) {
            if (isAccepted) return;
            if (!isActive) {
                ev.preventDefault();
                activar();
            }
        });
        zona.addEventListener('keydown', function(ev) {
            if ((ev.key === 'Enter' || ev.key === ' ') && !isAccepted && !isActive) {
                ev.preventDefault();
                activar();
            }
        });

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('mouseleave', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', moveDraw, { passive: false });
        canvas.addEventListener('touchend', endDraw, { passive: false });

        btnBorrar.addEventListener('click', function() {
            if (isAccepted) {
                limpiarLienzo();
                return;
            }
            resizeCanvas();
        });
        btnAceptar.addEventListener('click', aceptarFirma);
        btnUsar.addEventListener('click', usarGuardada);
        btnRehacer.addEventListener('click', limpiarLienzo);

        window.addEventListener('resize', function() {
            if (isActive && !isAccepted) resizeCanvas();
        });
        canvas.style.display = 'none';
        setTimeout(resizeCanvas, 50);
        refrescarUsarGuardada();

        return {
            aceptar: aceptarFirma,
            borrar: limpiarLienzo,
            getDataUrl: function() { return isAccepted ? accepted : ''; },
            setDataUrl: function(url, tsText) {
                if (!url) { limpiarLienzo(); return; }
                mostrarAceptada(url, tsText || '');
            },
            getTimestamp: function() { return acceptedTimestamp || ''; },
            setTimestamp: function(tsText) {
                acceptedTimestamp = tsText || '';
                if (tsEl) {
                    if (acceptedTimestamp) {
                        tsEl.textContent = acceptedTimestamp;
                        tsEl.style.display = 'block';
                    } else {
                        tsEl.textContent = '';
                        tsEl.style.display = 'none';
                    }
                }
            },
            refrescarGuardada: refrescarUsarGuardada,
            isEmpty: function() { return !isAccepted; }
        };
    }

    function parseTimestampFirmaPdf(timestamp) {
        if (!timestamp) return { fecha: '', hora: '' };
        var s = String(timestamp).trim();
        var idx = s.search(/\d{1,2}:\d{2}/);
        if (idx < 0) return { fecha: s, hora: '' };
        var fechaRaw = s.slice(0, idx).trim();
        var horaRaw = s.slice(idx).trim();
        var fp = fechaRaw.split('/');
        var fecha = fechaRaw;
        if (fp.length === 3) {
            fecha = String(fp[0]).padStart(2, '0') + '/' + String(fp[1]).padStart(2, '0') + '/' + fp[2];
        }
        var hora = horaRaw.replace(/(\d{1,2}:\d{2}):\d{2}/, '$1');
        return { fecha: fecha, hora: hora };
    }

    function htmlFirmaPdfLinea(dataUrl, timestamp) {
        var img = dataUrl
            ? '<img src="' + dataUrl + '" alt="" style="max-width:96%;max-height:62px;object-fit:contain;display:block;margin:0 auto;">'
            : '&nbsp;';
        var parts = parseTimestampFirmaPdf(timestamp);
        var ts = (parts.fecha || parts.hora)
            ? '<div class="ra-firma-ts-pdf">'
                + (parts.fecha ? '<div>' + escHtml(parts.fecha) + '</div>' : '')
                + (parts.hora ? '<div>' + escHtml(parts.hora) + '</div>' : '')
                + '</div>'
            : '';
        return ''
            + '<div class="ra-firma-zona-pdf">'
            + '<div class="ra-firma-img-pdf">' + img + '</div>'
            + '<div class="ra-firma-linea-pdf"></div>'
            + ts
            + '</div>';
    }

    function construirHtmlRegistroAsesoria(datos, logoDataUrl) {
        var barFn = window.htmlBarraAccionesPdf;
        var fechaReg = ymdADmy(datos.fecha);
        var personas = (datos.personas || []).map(normalizarPersona);
        var personasHtml = '';
        if (!personas.length) {
            personasHtml = '<tr><td colspan="4" style="padding:6px 8px;color:#6b7280;font-style:italic;">Sin registros</td></tr>';
        } else {
            personasHtml = personas.map(function(p) {
                return '<tr>'
                    + '<td style="padding:6px 8px;">' + escHtml(p.nombre) + '</td>'
                    + '<td style="padding:6px 8px;">' + escHtml(p.cedula) + '</td>'
                    + '<td style="padding:6px 8px;">' + escHtml(p.celular) + '</td>'
                    + '<td style="padding:6px 8px;">' + escHtml(p.entidad) + '</td>'
                    + '</tr>';
            }).join('');
        }

        var logoCell = logoDataUrl
            ? '<img src="' + logoDataUrl + '" alt="CARDIQUE" style="width:72px;height:auto;display:block;margin:0 auto;">'
            : '';

        var CSS = '@page{size:A4;margin:1.2cm 1.4cm}'
            + '*{box-sizing:border-box}'
            + 'body,.ra-doc{font-family:Calibri,"Calibri Light","Segoe UI",sans-serif;font-size:11pt;color:#000;margin:0;padding:0;background:#fff}'
            + '.ra-doc{max-width:100%;margin:0 auto}'
            + '.ra-hdr-tbl{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:12px}'
            + '.ra-hdr-tbl td{border:1px solid #000;padding:6px 8px;vertical-align:middle;font-size:11pt}'
            + '.ra-hdr-logo{width:20%;text-align:center;vertical-align:middle}'
            + '.ra-hdr-mid{width:52%;text-align:center;font-weight:700;line-height:1.35;text-transform:uppercase;vertical-align:middle}'
            + '.ra-hdr-meta{width:28%;text-align:left;font-weight:700;line-height:1.35;vertical-align:middle}'
            + '.ra-main{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11pt}'
            + '.ra-main td{border:1px solid #000;padding:8px 10px;vertical-align:top;font-size:11pt}'
            + '.ra-lbl{font-weight:700;text-transform:uppercase}'
            + '.ra-val{min-height:22px}'
            + '.ra-desc{min-height:140px;white-space:pre-wrap;line-height:1.45}'
            + '.ra-personas{width:100%;border-collapse:collapse;margin-top:6px;font-size:11pt}'
            + '.ra-personas th,.ra-personas td{border:none;background:transparent;padding:5px 8px;text-align:left;font-size:11pt}'
            + '.ra-personas thead th{font-weight:700}'
            + '.ra-bloque-firmas-celda{padding:8px 10px;vertical-align:top}'
            + '.ra-bloque-firmas-titulo{font-weight:700;text-transform:uppercase;margin:0 0 10px;line-height:1.35}'
            + '.ra-firmas-flex{display:flex;gap:18px;align-items:flex-start}'
            + '.ra-firma-col{flex:1;min-width:0;border:none;box-shadow:none;padding:0;background:transparent}'
            + '.ra-firma-zona-pdf{text-align:center;width:100%}'
            + '.ra-firma-img-pdf{min-height:62px;display:flex;align-items:flex-end;justify-content:center;padding:4px 6px 0}'
            + '.ra-firma-linea-pdf{border-bottom:1px solid #000;width:100%;margin:0}'
            + '.ra-firma-ts-pdf{font-size:8.5pt;color:#374151;text-align:center;margin-top:2px;line-height:1.25;padding:2px 0 0}'
            + '.ra-firma-etiq{text-align:center;font-weight:700;text-transform:uppercase;padding-top:6px}'
            + '@media print{.no-print-bar,.spacer,.spacer-dash{display:none!important}}';

        var h = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
            + '<meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Registro de Asesoría</title><style>' + CSS + '</style></head><body><div class="ra-doc">';

        if (typeof barFn === 'function') {
            h += barFn({ compact: false });
        }

        h += '<table class="ra-hdr-tbl">'
            + '<tr>'
            + '<td class="ra-hdr-logo" rowspan="6">' + logoCell + '</td>'
            + '<td class="ra-hdr-mid" rowspan="3">REGISTRO DE ASESORIA</td>'
            + '<td class="ra-hdr-meta" rowspan="2">VERSI&Oacute;N: ' + VERSION_FORMATO + '</td>'
            + '</tr>'
            + '<tr></tr>'
            + '<tr><td class="ra-hdr-meta" rowspan="2">FECHA: ' + FECHA_VERSION_PLANTILLA + '</td></tr>'
            + '<tr></tr>'
            + '<tr>'
            + '<td class="ra-hdr-mid" rowspan="3">PROCESO DE PLANEACION ESTRATEGICA</td>'
            + '<td class="ra-hdr-meta" rowspan="2">P&aacute;gina 1 de 1</td>'
            + '</tr>'
            + '<tr></tr>'
            + '</table>'
            + '<table class="ra-main">'
            + '<tr><td colspan="2"><span class="ra-lbl">Usuario atendido:</span><div class="ra-val">' + escHtml(datos.usuarioAtendido) + '</div></td>'
            + '<td style="width:28%"><span class="ra-lbl">Fecha:</span><div class="ra-val">' + escHtml(fechaReg) + '</div></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Asunto de la asesoría:</span><div class="ra-val">' + escHtml(datos.asunto) + '</div></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Descripción de las actividades realizadas durante la asesoría:</span>'
            + '<div class="ra-val ra-desc">' + escHtml(datos.descripcion).replace(/\n/g, '<br>') + '</div></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Persona(s)/Entidad(es):</span>'
            + '<table class="ra-personas"><thead><tr><th>Nombre</th><th>Cédula</th><th>Celular</th><th>Entidad</th></tr></thead><tbody>'
            + personasHtml + '</tbody></table></td></tr>'
            + '<tr><td colspan="3" class="ra-bloque-firmas-celda">'
            + '<div class="ra-bloque-firmas-titulo">FUNCIONARIO ENCARGADO DE LA ASESORÍA.</div>'
            + '<div class="ra-firmas-flex">'
            + '<div class="ra-firma-col">' + htmlFirmaPdfLinea(datos.firmaFuncionario, datos.firmaFuncionarioTimestamp)
            + '<div class="ra-firma-etiq">FIRMA FUNCIONARIO</div></div>'
            + '<div class="ra-firma-col">' + htmlFirmaPdfLinea(datos.firmaUsuario, datos.firmaUsuarioTimestamp)
            + '<div class="ra-firma-etiq">FIRMA DE USUARIO</div></div>'
            + '</div></td></tr>'
            + '</table></div></body></html>';
        return h;
    }

    var firmaFuncionarioPad = null;
    var firmaUsuarioPad = null;
    var editandoId = null;

    function claveFirmanteFuncionario() {
        return (document.getElementById('inspector') || {}).value || 'funcionario';
    }

    function obtenerDatosFormulario() {
        return {
            usuarioAtendido: (document.getElementById('ra-usuario') || {}).value || '',
            fecha: (document.getElementById('ra-fecha') || {}).value || (window.fechaHoyLocalYMD ? fechaHoyLocalYMD() : ''),
            asunto: (document.getElementById('ra-asunto') || {}).value || '',
            descripcion: (document.getElementById('ra-descripcion') || {}).value || '',
            personas: leerPersonasDesdeDom(),
            firmaFuncionario: firmaFuncionarioPad ? firmaFuncionarioPad.getDataUrl() : '',
            firmaUsuario: firmaUsuarioPad ? firmaUsuarioPad.getDataUrl() : '',
            firmaFuncionarioTimestamp: firmaFuncionarioPad ? firmaFuncionarioPad.getTimestamp() : '',
            firmaUsuarioTimestamp: firmaUsuarioPad ? firmaUsuarioPad.getTimestamp() : ''
        };
    }

    function leerPersonasDesdeDom() {
        var filas = document.querySelectorAll('#ra-personas-lista .ra-persona-row');
        var out = [];
        filas.forEach(function(row) {
            var p = normalizarPersona({
                nombre: (row.querySelector('.ra-p-nombre') || {}).value || '',
                cedula: (row.querySelector('.ra-p-cedula') || {}).value || '',
                celular: (row.querySelector('.ra-p-celular') || {}).value || '',
                entidad: (row.querySelector('.ra-p-entidad') || {}).value || ''
            });
            if (p.nombre || p.cedula || p.celular || p.entidad) out.push(p);
        });
        return out;
    }

    function agregarFilaPersona(data) {
        data = normalizarPersona(data);
        var lista = document.getElementById('ra-personas-lista');
        if (!lista) return;
        var row = document.createElement('div');
        row.className = 'ra-persona-row';
        row.innerHTML = ''
            + '<input type="text" class="ra-p-nombre" placeholder="Nombre" value="' + escHtml(data.nombre) + '">'
            + '<input type="text" class="ra-p-cedula" placeholder="Cédula" value="' + escHtml(data.cedula) + '">'
            + '<input type="tel" class="ra-p-celular" placeholder="Celular" value="' + escHtml(data.celular) + '">'
            + '<input type="text" class="ra-p-entidad" placeholder="Entidad" value="' + escHtml(data.entidad) + '">'
            + '<button type="button" class="ra-btn-quitar" title="Quitar">&#10005;</button>';
        row.querySelector('.ra-btn-quitar').onclick = function() {
            row.remove();
            if (!lista.querySelector('.ra-persona-row')) agregarFilaPersona();
        };
        lista.appendChild(row);
        aplicarEstadoConsentimientoEnPersonas();
    }

    function limpiarFormulario() {
        editandoId = null;
        _editRemoteId = null;
        _editProfesionalId = null;
        ['ra-usuario', 'ra-asunto', 'ra-descripcion'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var fecha = document.getElementById('ra-fecha');
        if (fecha) fecha.value = window.fechaHoyLocalYMD ? fechaHoyLocalYMD() : '';
        var desc = document.getElementById('ra-descripcion');
        if (desc) desc.style.height = '';
        var lista = document.getElementById('ra-personas-lista');
        if (lista) { lista.innerHTML = ''; agregarFilaPersona(); }
        if (firmaFuncionarioPad) firmaFuncionarioPad.borrar();
        if (firmaUsuarioPad) firmaUsuarioPad.borrar();
        if (firmaFuncionarioPad) firmaFuncionarioPad.refrescarGuardada();
        if (firmaUsuarioPad) firmaUsuarioPad.refrescarGuardada();
    }

    function cargarFormulario(reg) {
        editandoId = reg.id || reg.local_id || null;
        _editRemoteId = reg.remote_id || null;
        _editProfesionalId = reg.profesional_id || null;
        document.getElementById('ra-usuario').value = reg.usuarioAtendido || '';
        document.getElementById('ra-fecha').value = reg.fecha || (window.fechaHoyLocalYMD ? fechaHoyLocalYMD() : '');
        document.getElementById('ra-asunto').value = reg.asunto || '';
        document.getElementById('ra-descripcion').value = reg.descripcion || '';
        var desc = document.getElementById('ra-descripcion');
        if (desc) {
            desc.style.height = 'auto';
            desc.style.height = desc.scrollHeight + 'px';
        }
        var lista = document.getElementById('ra-personas-lista');
        lista.innerHTML = '';
        var personas = (reg.personas && reg.personas.length) ? reg.personas.map(normalizarPersona) : [{}];
        personas.forEach(agregarFilaPersona);
        if (firmaFuncionarioPad) {
            firmaFuncionarioPad.setDataUrl(reg.firmaFuncionario || '', reg.firmaFuncionarioTimestamp || '');
            firmaFuncionarioPad.refrescarGuardada();
        }
        if (firmaUsuarioPad) {
            firmaUsuarioPad.setDataUrl(reg.firmaUsuario || '', reg.firmaUsuarioTimestamp || '');
            firmaUsuarioPad.refrescarGuardada();
        }
    }

    function validarFormulario(d, opts) {
        opts = opts || {};
        var ses = getRaSession();
        var esProfesional = ses && String(ses.rol || '').toLowerCase() === 'profesional';
        if (esProfesional && opts.permitirVacio !== false) {
            if (firmaFuncionarioPad && firmaFuncionarioPad.isEmpty()) firmaFuncionarioPad.aceptar();
            if (firmaUsuarioPad && firmaUsuarioPad.isEmpty()) firmaUsuarioPad.aceptar();
            d.firmaFuncionario = firmaFuncionarioPad ? firmaFuncionarioPad.getDataUrl() : '';
            d.firmaUsuario = firmaUsuarioPad ? firmaUsuarioPad.getDataUrl() : '';
            d.firmaFuncionarioTimestamp = firmaFuncionarioPad ? firmaFuncionarioPad.getTimestamp() : '';
            d.firmaUsuarioTimestamp = firmaUsuarioPad ? firmaUsuarioPad.getTimestamp() : '';
            return true;
        }
        if (!d.usuarioAtendido.trim()) { alert('Indica el usuario atendido.'); return false; }
        if (!d.asunto.trim()) { alert('Indica el asunto de la asesoría.'); return false; }
        if (!d.descripcion.trim()) { alert('Describe las actividades realizadas.'); return false; }
        if (firmaFuncionarioPad && firmaFuncionarioPad.isEmpty()) firmaFuncionarioPad.aceptar();
        if (firmaUsuarioPad && firmaUsuarioPad.isEmpty()) firmaUsuarioPad.aceptar();
        d.firmaFuncionario = firmaFuncionarioPad ? firmaFuncionarioPad.getDataUrl() : '';
        d.firmaUsuario = firmaUsuarioPad ? firmaUsuarioPad.getDataUrl() : '';
        d.firmaFuncionarioTimestamp = firmaFuncionarioPad ? firmaFuncionarioPad.getTimestamp() : '';
        d.firmaUsuarioTimestamp = firmaUsuarioPad ? firmaUsuarioPad.getTimestamp() : '';
        if (!d.firmaFuncionario) { alert('La firma del funcionario es obligatoria. Toca la línea y firma.'); return false; }
        if (!d.firmaUsuario) { alert('La firma del usuario es obligatoria. Toca la línea y firma.'); return false; }
        return true;
    }

    function guardarRegistroActual() {
        if (_modoSoloLectura) return;
        var d = obtenerDatosFormulario();
        var tienePii = (d.personas || []).some(function(p) {
            return (p.nombre || p.cedula || p.celular || p.entidad);
        });
        if (tienePii && !tieneConsentimiento()) {
            solicitarConsentimientoSiFalta().then(function(ok) {
                if (ok) guardarRegistroActual();
            });
            return;
        }
        var ses = getRaSession();
        var rol = ses ? String(ses.rol || '').toLowerCase() : '';
        var esProfesional = rol === 'profesional';
        var esAdmin = rol === 'admin' || rol === 'administrador';
        if (!validarFormulario(d, { permitirVacio: esProfesional || esAdmin })) return;
        var now = Date.now();
        var localId = editandoId || ('ra_' + now);
        var record = {
            local_id: localId,
            profesional_id: _editProfesionalId || (ses ? ses.id : 'local'),
            datos: {
                usuarioAtendido: d.usuarioAtendido,
                fecha: d.fecha,
                asunto: d.asunto,
                descripcion: d.descripcion,
                personas: d.personas
            },
            firmas: {
                funcionario: d.firmaFuncionario,
                usuario: d.firmaUsuario,
                funcionarioTimestamp: d.firmaFuncionarioTimestamp,
                usuarioTimestamp: d.firmaUsuarioTimestamp
            },
            timestamps: {
                creadoEn: editandoId ? undefined : now,
                actualizadoEn: now
            },
            sincronizado: false,
            remote_id: _editRemoteId || null
        };
        var saveChain = idbGetRegistro(localId).then(function(prev) {
            record.timestamps.creadoEn = (prev && prev.timestamps && prev.timestamps.creadoEn) || now;
            if (prev && prev.remote_id && !_editRemoteId) record.remote_id = prev.remote_id;
            return idbPutRegistro(record);
        });
        saveChain.then(function() {
            var lista = obtenerRegistros();
            var flat = Object.assign({ id: localId, creadoEn: record.timestamps.creadoEn || now, actualizadoEn: now }, d);
            if (editandoId) {
                lista = lista.map(function(r) {
                    if (r.id === editandoId) return Object.assign({}, r, flat);
                    return r;
                });
            } else {
                lista.unshift(flat);
            }
            guardarRegistros(lista);
            syncPendientes().then(function() {
                if (ses) {
                    volverAlDashboard();
                } else {
                    renderHistorialRegistro();
                    alert('Registro guardado correctamente.');
                }
            });
        }).catch(function() {
            alert('No se pudo guardar el registro.');
        });
    }

    function generarPdfRegistro() {
        var d = obtenerDatosFormulario();
        var tienePii = (d.personas || []).some(function(p) {
            return (p.nombre || p.cedula || p.celular || p.entidad);
        });
        if (tienePii && !tieneConsentimiento()) {
            solicitarConsentimientoSiFalta().then(function(ok) {
                if (ok) generarPdfRegistro();
            });
            return;
        }
        var ses = getRaSession();
        var rol = ses ? String(ses.rol || '').toLowerCase() : '';
        var esProfesional = rol === 'profesional';
        var esAdmin = rol === 'admin' || rol === 'administrador';
        if (!validarFormulario(d, { permitirVacio: esProfesional || esAdmin })) return;
        if (typeof window.entregarHtmlEnVentanaPdf !== 'function') {
            alert('Visor PDF no disponible.');
            return;
        }
        obtenerLogoRegistro().then(function(logo) {
            window.entregarHtmlEnVentanaPdf(construirHtmlRegistroAsesoria(d, logo));
        });
    }

    function renderHistorialRegistroCore() {
        var cont = document.getElementById('ra-historial-lista');
        if (!cont) return;
        var lista = obtenerRegistros();
        if (!lista.length) {
            cont.innerHTML = '<div class="hist-empty">No hay registros de asesoría guardados.</div>';
            return;
        }
        cont.innerHTML = lista.map(function(r) {
            var f = ymdADmy(r.fecha);
            return '<div class="ra-hist-item">'
                + '<div><strong>' + escHtml(r.usuarioAtendido) + '</strong>'
                + '<div class="ra-hist-meta">' + escHtml(f) + ' · ' + escHtml(r.asunto) + '</div></div>'
                + '<div class="ra-hist-actions">'
                + '<button type="button" class="ra-hist-edit" data-id="' + escHtml(r.id) + '">Editar</button>'
                + '<button type="button" class="ra-hist-pdf" data-id="' + escHtml(r.id) + '">PDF</button>'
                + '<button type="button" class="ra-hist-del" data-id="' + escHtml(r.id) + '">Eliminar</button>'
                + '</div></div>';
        }).join('');
        cont.querySelectorAll('.ra-hist-edit').forEach(function(btn) {
            btn.onclick = function() {
                var reg = obtenerRegistros().find(function(x) { return x.id === btn.getAttribute('data-id'); });
                if (reg) {
                    cargarFormulario(reg);
                    if (typeof window.mostrarPantalla === 'function') window.mostrarPantalla('registro-asesoria');
                }
            };
        });
        cont.querySelectorAll('.ra-hist-pdf').forEach(function(btn) {
            btn.onclick = function() {
                var reg = obtenerRegistros().find(function(x) { return x.id === btn.getAttribute('data-id'); });
                if (!reg || typeof window.entregarHtmlEnVentanaPdf !== 'function') return;
                obtenerLogoRegistro().then(function(logo) {
                    window.entregarHtmlEnVentanaPdf(construirHtmlRegistroAsesoria(reg, logo));
                });
            };
        });
        cont.querySelectorAll('.ra-hist-del').forEach(function(btn) {
            btn.onclick = function() {
                if (!confirm('¿Eliminar este registro?')) return;
                guardarRegistros(obtenerRegistros().filter(function(x) { return x.id !== btn.getAttribute('data-id'); }));
                renderHistorialRegistro();
            };
        });
    }

    function renderHistorialRegistro() {
        renderHistorialRegistroCore();
        injectBotonLimpiarTodo();
    }

    function renderGestionFirmasRegistro() {
        var cont = document.getElementById('ra-firmas-gestion');
        if (!cont) return;
        var map = obtenerFirmasGuardadas();
        var keys = Object.keys(map);
        if (!keys.length) {
            cont.innerHTML = '<div class="hist-empty">No hay firmas guardadas.</div>';
            return;
        }
        cont.innerHTML = keys.map(function(k) {
            var f = map[k];
            return '<div class="ra-firma-guard-item">'
                + '<img src="' + f.dataUrl + '" alt="">'
                + '<div><strong>' + escHtml(f.nombre || k) + '</strong>'
                + '<div class="ra-hist-meta">' + escHtml(k) + '</div></div>'
                + '<button type="button" class="ra-firma-del" data-id="' + escHtml(k) + '">Eliminar</button>'
                + '</div>';
        }).join('');
        cont.querySelectorAll('.ra-firma-del').forEach(function(btn) {
            btn.onclick = function() {
                if (!confirm('¿Eliminar firma guardada?')) return;
                var m = obtenerFirmasGuardadas();
                delete m[btn.getAttribute('data-id')];
                guardarFirmasMap(m);
                renderGestionFirmasRegistro();
                if (firmaFuncionarioPad) firmaFuncionarioPad.refrescarGuardada();
                if (firmaUsuarioPad) firmaUsuarioPad.refrescarGuardada();
            };
        });
    }
    window.renderGestionFirmasRegistro = renderGestionFirmasRegistro;
    window.renderHistorialRegistro = renderHistorialRegistro;

    function cargarPantallaRegistroAsesoria() {
        if (typeof window.mostrarPantalla === 'function') {
            window.mostrarPantalla('registro-asesoria');
            return;
        }
        abrirModuloRegistroAsesoria();
    }

    function initRegistroAsesoriaCore() {
        wireConsentimientoPersonas();
        injectBotonLimpiarTodo();

        var mountFunc = document.getElementById('ra-firma-funcionario');
        var mountUser = document.getElementById('ra-firma-usuario');
        if (!mountFunc || !mountUser) return;

        var fecha = document.getElementById('ra-fecha');
        if (fecha && !fecha.value && window.fechaHoyLocalYMD) fecha.value = fechaHoyLocalYMD();

        firmaFuncionarioPad = crearFirmaEnLinea(mountFunc, {
            lineLabel: 'FIRMA FUNCIONARIO',
            signerKey: claveFirmanteFuncionario
        });
        firmaUsuarioPad = crearFirmaEnLinea(mountUser, {
            lineLabel: 'FIRMA DE USUARIO',
            signerKey: function() {
                var u = (document.getElementById('ra-usuario') || {}).value || '';
                var p = leerPersonasDesdeDom()[0];
                return u || (p && p.nombre) || 'usuario';
            }
        });

        var desc = document.getElementById('ra-descripcion');
        if (desc && !desc.dataset.raInputWired) {
            desc.dataset.raInputWired = '1';
            desc.addEventListener('input', function() {
                desc.style.height = 'auto';
                desc.style.height = Math.max(120, desc.scrollHeight) + 'px';
            });
        }

        var btnAdd = document.getElementById('ra-add-persona');
        if (btnAdd && !btnAdd.dataset.raWired) {
            btnAdd.dataset.raWired = '1';
            btnAdd.onclick = function() { agregarFilaPersona(); };
        }

        var btnGuardar = document.getElementById('ra-guardar');
        if (btnGuardar && !btnGuardar.dataset.raWired) {
            btnGuardar.dataset.raWired = '1';
            btnGuardar.onclick = guardarRegistroActual;
        }

        var btnPdf = document.getElementById('ra-generar-pdf');
        if (btnPdf && !btnPdf.dataset.raWired) {
            btnPdf.dataset.raWired = '1';
            btnPdf.onclick = generarPdfRegistro;
        }

        var btnLimpiar = document.getElementById('ra-limpiar');
        if (btnLimpiar && !btnLimpiar.dataset.raWired) {
            btnLimpiar.dataset.raWired = '1';
            btnLimpiar.onclick = function() {
                if (_modoSoloLectura) return;
                if (confirm('¿Limpiar el formulario?')) limpiarFormulario();
            };
        }

        var userInput = document.getElementById('ra-usuario');
        var inspectorInput = document.getElementById('inspector');
        if (inspectorInput && !inspectorInput.dataset.raWired) {
            inspectorInput.dataset.raWired = '1';
            inspectorInput.addEventListener('input', function() {
                if (firmaFuncionarioPad) firmaFuncionarioPad.refrescarGuardada();
            });
        }
        if (userInput && !userInput.dataset.raWired) {
            userInput.dataset.raWired = '1';
            userInput.addEventListener('input', function() {
                if (firmaUsuarioPad) firmaUsuarioPad.refrescarGuardada();
            });
        }

        if (!document.querySelector('#ra-personas-lista .ra-persona-row')) agregarFilaPersona();
        renderGestionFirmasRegistro();
    }

    function initRegistroAsesoria() {
        bootstrapRaApp();
    }

    window.initRegistroAsesoria = initRegistroAsesoria;
    window.bootstrapRaApp = bootstrapRaApp;
    window.abrirModuloRegistroAsesoria = abrirModuloRegistroAsesoria;
    window.renderDashboard = renderDashboard;
    window.syncPendientesRa = syncPendientes;
    window.cargarPantallaRegistroAsesoria = cargarPantallaRegistroAsesoria;
    window.limpiarTodosRegistrosAsesoria = limpiarTodosRegistrosAsesoria;
    window.generarPdfRegistroAsesoriaDesdeDatos = function(datos) {
        return obtenerLogoRegistro().then(function(logo) {
            return construirHtmlRegistroAsesoria(datos, logo);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapRaApp);
    } else {
        bootstrapRaApp();
    }
    wireAutoUpdateDesdeSW();
})();
