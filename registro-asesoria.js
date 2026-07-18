/**
 * Registro de Asesoría — Proceso de Planeación Estratégica (Versión 03)
 * Formulario offline, firmas táctiles reutilizables y PDF formato CARDIQUE.
 */
(function () {
    'use strict';

    var LS_REGISTROS = 'cardique_registro_asesoria';
    var LS_FIRMAS = 'cardique_firmas_guardadas';
    var LOGO_URL = 'assets/cardique-logo-registro.jpg';
    var VERSION_FORMATO = '03';
    var _logoDataUrl = null;

    function leerJSON(key, def) {
        try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); } catch (e) { return def; }
    }
    function guardarJSON(key, obj) {
        try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
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

    /** Componente reutilizable de firma táctil */
    function crearFirmaTactil(mountEl, opts) {
        opts = opts || {};
        var signerKey = opts.signerKey || function() { return 'firmante'; };
        var signerLabel = opts.signerLabel || 'Firmante';
        var height = opts.height || 150;

        mountEl.innerHTML = ''
            + '<div class="firma-panel">'
            + '<div class="firma-panel-head"><span>' + escHtml(signerLabel) + '</span>'
            + '<button type="button" class="firma-btn-usar" style="display:none;">Usar firma guardada</button></div>'
            + '<canvas class="firma-canvas" height="' + height + '"></canvas>'
            + '<div class="firma-panel-actions">'
            + '<button type="button" class="firma-btn-borrar">Borrar</button>'
            + '<button type="button" class="firma-btn-aceptar">Aceptar</button>'
            + '</div>'
            + '<label class="firma-guardar-lbl"><input type="checkbox" class="firma-guardar-chk"> Guardar esta firma para futuros registros</label>'
            + '<div class="firma-preview-wrap" style="display:none;"><img class="firma-preview" alt="Firma aceptada"/></div>'
            + '</div>';

        var canvas = mountEl.querySelector('.firma-canvas');
        var ctx = canvas.getContext('2d');
        var btnBorrar = mountEl.querySelector('.firma-btn-borrar');
        var btnAceptar = mountEl.querySelector('.firma-btn-aceptar');
        var btnUsar = mountEl.querySelector('.firma-btn-usar');
        var chkGuardar = mountEl.querySelector('.firma-guardar-chk');
        var previewWrap = mountEl.querySelector('.firma-preview-wrap');
        var previewImg = mountEl.querySelector('.firma-preview');
        var accepted = '';
        var isAccepted = false;
        var drawing = false;

        function resizeCanvas() {
            var rect = canvas.getBoundingClientRect();
            var ratio = window.devicePixelRatio || 1;
            canvas.width = Math.max(280, Math.floor(rect.width * ratio));
            canvas.height = Math.floor(height * ratio);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(ratio, ratio);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2.2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rect.width, height);
            if (accepted && isAccepted) {
                var img = new Image();
                img.onload = function() {
                    ctx.drawImage(img, 0, 0, rect.width, height);
                };
                img.src = accepted;
            }
        }

        function pos(ev) {
            var rect = canvas.getBoundingClientRect();
            var t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
            return {
                x: t.clientX - rect.left,
                y: t.clientY - rect.top
            };
        }

        function startDraw(ev) {
            if (isAccepted) return;
            ev.preventDefault();
            drawing = true;
            var p = pos(ev);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        }
        function moveDraw(ev) {
            if (!drawing || isAccepted) return;
            ev.preventDefault();
            var p = pos(ev);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        function endDraw(ev) {
            if (ev) ev.preventDefault();
            drawing = false;
        }

        function limpiarLienzo() {
            isAccepted = false;
            accepted = '';
            previewWrap.style.display = 'none';
            canvas.style.display = 'block';
            mountEl.querySelector('.firma-panel-actions').style.display = 'flex';
            resizeCanvas();
        }

        function aceptarFirma() {
            if (isAccepted) return accepted;
            var blank = document.createElement('canvas');
            blank.width = canvas.width;
            blank.height = canvas.height;
            var bctx = blank.getContext('2d');
            bctx.drawImage(canvas, 0, 0);
            var data = blank.toDataURL('image/png');
            var px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            var empty = true;
            for (var pi = 0; pi < px.length; pi += 4) {
                if (px[pi] !== 255 || px[pi + 1] !== 255 || px[pi + 2] !== 255) {
                    empty = false;
                    break;
                }
            }
            if (empty) {
                alert('Dibuja tu firma antes de aceptar.');
                return '';
            }
            accepted = data;
            isAccepted = true;
            previewImg.src = data;
            previewWrap.style.display = 'block';
            canvas.style.display = 'none';
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
            return accepted;
        }

        function usarGuardada() {
            var id = slugId(typeof signerKey === 'function' ? signerKey() : signerKey);
            var map = obtenerFirmasGuardadas();
            if (!map[id]) return;
            accepted = map[id].dataUrl;
            isAccepted = true;
            previewImg.src = accepted;
            previewWrap.style.display = 'block';
            canvas.style.display = 'none';
        }

        function refrescarUsarGuardada() {
            var id = slugId(typeof signerKey === 'function' ? signerKey() : signerKey);
            var map = obtenerFirmasGuardadas();
            btnUsar.style.display = map[id] ? 'inline-flex' : 'none';
        }

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('mouseleave', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', moveDraw, { passive: false });
        canvas.addEventListener('touchend', endDraw, { passive: false });

        btnBorrar.addEventListener('click', limpiarLienzo);
        btnAceptar.addEventListener('click', aceptarFirma);
        btnUsar.addEventListener('click', usarGuardada);

        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 50);
        refrescarUsarGuardada();

        return {
            aceptar: aceptarFirma,
            borrar: limpiarLienzo,
            getDataUrl: function() { return isAccepted ? accepted : ''; },
            setDataUrl: function(url) {
                if (!url) { limpiarLienzo(); return; }
                accepted = url;
                isAccepted = true;
                previewImg.src = url;
                previewWrap.style.display = 'block';
                canvas.style.display = 'none';
            },
            refrescarGuardada: refrescarUsarGuardada,
            isEmpty: function() { return !isAccepted; }
        };
    }

    function construirHtmlRegistroAsesoria(datos, logoDataUrl) {
        var barFn = window.htmlBarraAccionesPdf;
        var fechaReg = ymdADmy(datos.fecha);
        var personas = datos.personas || [];
        var personasHtml = '';
        if (!personas.length) {
            personasHtml = '<tr><td style="padding:6px 8px;border:1px solid #000;color:#6b7280;font-style:italic;">Sin registros</td></tr>';
        } else {
            personasHtml = personas.map(function(p) {
                return '<tr>'
                    + '<td style="padding:6px 8px;border:1px solid #000;">' + escHtml(p.nombre) + '</td>'
                    + '<td style="padding:6px 8px;border:1px solid #000;">' + escHtml(p.cedula) + '</td>'
                    + '<td style="padding:6px 8px;border:1px solid #000;">' + escHtml(p.telefono) + '</td>'
                    + '</tr>';
            }).join('');
        }

        var firmaFunc = datos.firmaFuncionario
            ? '<img src="' + datos.firmaFuncionario + '" alt="Firma funcionario" style="max-width:100%;max-height:90px;object-fit:contain;display:block;margin:0 auto;">'
            : '<div style="height:90px;"></div>';
        var firmaUser = datos.firmaUsuario
            ? '<img src="' + datos.firmaUsuario + '" alt="Firma usuario" style="max-width:100%;max-height:90px;object-fit:contain;display:block;margin:0 auto;">'
            : '<div style="height:90px;"></div>';

        var logoCell = logoDataUrl
            ? '<img src="' + logoDataUrl + '" alt="CARDIQUE" style="width:72px;height:auto;display:block;margin:0 auto;">'
            : '';

        var CSS = '@page{size:A4;margin:1.2cm 1.4cm}'
            + '*{box-sizing:border-box}'
            + 'body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;margin:0;padding:0;background:#fff}'
            + '.ra-doc{max-width:100%;margin:0 auto}'
            + '.ra-hdr-tbl{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0}'
            + '.ra-hdr-tbl td{border:2px double #000;padding:6px 8px;vertical-align:middle;text-align:center}'
            + '.ra-hdr-logo{width:22%}'
            + '.ra-hdr-mid{width:56%;font-weight:700;font-size:11pt;line-height:1.35}'
            + '.ra-hdr-page{width:22%;font-size:10pt;font-weight:700}'
            + '.ra-sub{font-weight:700;text-align:center;font-size:11pt;margin:8px 0 12px;letter-spacing:.02em}'
            + '.ra-main{width:100%;border-collapse:collapse;table-layout:fixed}'
            + '.ra-main td{border:1px solid #000;padding:8px 10px;vertical-align:top}'
            + '.ra-lbl{font-weight:700;font-size:10.5pt;text-transform:uppercase}'
            + '.ra-val{min-height:22px;font-size:11pt}'
            + '.ra-desc{min-height:140px;white-space:pre-wrap;line-height:1.45}'
            + '.ra-personas{width:100%;border-collapse:collapse;margin-top:6px}'
            + '.ra-personas th,.ra-personas td{border:1px solid #000;padding:5px 6px;font-size:10pt;text-align:left}'
            + '.ra-firmas td{text-align:center;vertical-align:bottom;height:120px}'
            + '.ra-firma-lbl{font-weight:700;font-size:10pt;text-transform:uppercase;padding-top:6px}'
            + '@media print{.no-print-bar,.spacer,.spacer-dash{display:none!important}}';

        var h = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
            + '<meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Registro de Asesoría</title><style>' + CSS + '</style></head><body><div class="ra-doc">';

        if (typeof barFn === 'function') {
            h += barFn({ compact: false });
        }

        h += '<table class="ra-hdr-tbl"><tr>'
            + '<td class="ra-hdr-logo" rowspan="2">' + logoCell + '</td>'
            + '<td class="ra-hdr-mid">REGISTRO DE ASESORÍA</td>'
            + '<td class="ra-hdr-page" rowspan="2">Página<br>1 de 1</td>'
            + '</tr><tr>'
            + '<td class="ra-hdr-mid" style="font-size:10pt;">VERSIÓN: ' + VERSION_FORMATO
            + ' &nbsp;&nbsp; FECHA: ' + escHtml(fechaReg) + '</td>'
            + '</tr></table>'
            + '<div class="ra-sub">PROCESO DE PLANEACIÓN ESTRATÉGICA</div>'
            + '<table class="ra-main">'
            + '<tr><td colspan="2"><span class="ra-lbl">Usuario atendido:</span><div class="ra-val">' + escHtml(datos.usuarioAtendido) + '</div></td>'
            + '<td style="width:28%"><span class="ra-lbl">Fecha:</span><div class="ra-val">' + escHtml(fechaReg) + '</div></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Asunto de la asesoría:</span><div class="ra-val">' + escHtml(datos.asunto) + '</div></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Descripción de las actividades realizadas durante la asesoría:</span>'
            + '<div class="ra-val ra-desc">' + escHtml(datos.descripcion).replace(/\n/g, '<br>') + '</div></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Persona(s)/Entidad(es) (nombre, cédula, teléfono):</span>'
            + '<table class="ra-personas"><thead><tr><th>Nombre</th><th>Cédula</th><th>Teléfono</th></tr></thead><tbody>'
            + personasHtml + '</tbody></table></td></tr>'
            + '<tr><td colspan="3"><span class="ra-lbl">Funcionario encargado de la asesoría:</span>'
            + '<div class="ra-val">' + escHtml(datos.funcionario) + '</div></td></tr>'
            + '<tr class="ra-firmas"><td style="width:50%">' + firmaFunc
            + '<div class="ra-firma-lbl">Firma funcionario</div></td><td style="width:50%">' + firmaUser
            + '<div class="ra-firma-lbl">Firma de usuario</div></td></tr>'
            + '</table></div></body></html>';
        return h;
    }

    var firmaFuncionarioPad = null;
    var firmaUsuarioPad = null;
    var editandoId = null;

    function obtenerDatosFormulario() {
        return {
            usuarioAtendido: (document.getElementById('ra-usuario') || {}).value || '',
            fecha: (document.getElementById('ra-fecha') || {}).value || (window.fechaHoyLocalYMD ? fechaHoyLocalYMD() : ''),
            asunto: (document.getElementById('ra-asunto') || {}).value || '',
            descripcion: (document.getElementById('ra-descripcion') || {}).value || '',
            funcionario: (document.getElementById('ra-funcionario') || {}).value || '',
            personas: leerPersonasDesdeDom(),
            firmaFuncionario: firmaFuncionarioPad ? firmaFuncionarioPad.getDataUrl() : '',
            firmaUsuario: firmaUsuarioPad ? firmaUsuarioPad.getDataUrl() : ''
        };
    }

    function leerPersonasDesdeDom() {
        var filas = document.querySelectorAll('#ra-personas-lista .ra-persona-row');
        var out = [];
        filas.forEach(function(row) {
            var nombre = (row.querySelector('.ra-p-nombre') || {}).value || '';
            var cedula = (row.querySelector('.ra-p-cedula') || {}).value || '';
            var telefono = (row.querySelector('.ra-p-telefono') || {}).value || '';
            if (nombre || cedula || telefono) out.push({ nombre: nombre, cedula: cedula, telefono: telefono });
        });
        return out;
    }

    function agregarFilaPersona(data) {
        data = data || {};
        var lista = document.getElementById('ra-personas-lista');
        if (!lista) return;
        var row = document.createElement('div');
        row.className = 'ra-persona-row';
        row.innerHTML = ''
            + '<input type="text" class="ra-p-nombre" placeholder="Nombre" value="' + escHtml(data.nombre || '') + '">'
            + '<input type="text" class="ra-p-cedula" placeholder="Cédula" value="' + escHtml(data.cedula || '') + '">'
            + '<input type="tel" class="ra-p-telefono" placeholder="Teléfono" value="' + escHtml(data.telefono || '') + '">'
            + '<button type="button" class="ra-btn-quitar" title="Quitar">&#10005;</button>';
        row.querySelector('.ra-btn-quitar').onclick = function() {
            row.remove();
            if (!lista.querySelector('.ra-persona-row')) agregarFilaPersona();
        };
        lista.appendChild(row);
    }

    function limpiarFormulario() {
        editandoId = null;
        var ids = ['ra-usuario', 'ra-asunto', 'ra-descripcion', 'ra-funcionario'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var fecha = document.getElementById('ra-fecha');
        if (fecha) fecha.value = window.fechaHoyLocalYMD ? fechaHoyLocalYMD() : '';
        var lista = document.getElementById('ra-personas-lista');
        if (lista) { lista.innerHTML = ''; agregarFilaPersona(); }
        if (firmaFuncionarioPad) firmaFuncionarioPad.borrar();
        if (firmaUsuarioPad) firmaUsuarioPad.borrar();
        if (firmaFuncionarioPad) firmaFuncionarioPad.refrescarGuardada();
        if (firmaUsuarioPad) firmaUsuarioPad.refrescarGuardada();
    }

    function cargarFormulario(reg) {
        editandoId = reg.id || null;
        document.getElementById('ra-usuario').value = reg.usuarioAtendido || '';
        document.getElementById('ra-fecha').value = reg.fecha || (window.fechaHoyLocalYMD ? fechaHoyLocalYMD() : '');
        document.getElementById('ra-asunto').value = reg.asunto || '';
        document.getElementById('ra-descripcion').value = reg.descripcion || '';
        document.getElementById('ra-funcionario').value = reg.funcionario || '';
        var lista = document.getElementById('ra-personas-lista');
        lista.innerHTML = '';
        (reg.personas && reg.personas.length ? reg.personas : [{}]).forEach(agregarFilaPersona);
        if (firmaFuncionarioPad) {
            firmaFuncionarioPad.setDataUrl(reg.firmaFuncionario || '');
            firmaFuncionarioPad.refrescarGuardada();
        }
        if (firmaUsuarioPad) {
            firmaUsuarioPad.setDataUrl(reg.firmaUsuario || '');
            firmaUsuarioPad.refrescarGuardada();
        }
    }

    function validarFormulario(d) {
        if (!d.usuarioAtendido.trim()) { alert('Indica el usuario atendido.'); return false; }
        if (!d.asunto.trim()) { alert('Indica el asunto de la asesoría.'); return false; }
        if (!d.descripcion.trim()) { alert('Describe las actividades realizadas.'); return false; }
        if (!d.funcionario.trim()) { alert('Indica el funcionario encargado.'); return false; }
        if (firmaFuncionarioPad && firmaFuncionarioPad.isEmpty()) {
            firmaFuncionarioPad.aceptar();
        }
        if (firmaUsuarioPad && firmaUsuarioPad.isEmpty()) {
            firmaUsuarioPad.aceptar();
        }
        d.firmaFuncionario = firmaFuncionarioPad ? firmaFuncionarioPad.getDataUrl() : '';
        d.firmaUsuario = firmaUsuarioPad ? firmaUsuarioPad.getDataUrl() : '';
        if (!d.firmaFuncionario) { alert('La firma del funcionario es obligatoria.'); return false; }
        if (!d.firmaUsuario) { alert('La firma del usuario es obligatoria.'); return false; }
        return true;
    }

    function guardarRegistroActual() {
        var d = obtenerDatosFormulario();
        if (!validarFormulario(d)) return;
        var lista = obtenerRegistros();
        var now = Date.now();
        if (editandoId) {
            lista = lista.map(function(r) {
                if (r.id === editandoId) {
                    return Object.assign({}, r, d, { actualizadoEn: now });
                }
                return r;
            });
        } else {
            lista.unshift(Object.assign({ id: 'ra_' + now, creadoEn: now, actualizadoEn: now }, d));
        }
        if (!guardarRegistros(lista)) {
            alert('No se pudo guardar el registro.');
            return;
        }
        renderHistorialRegistro();
        alert('Registro guardado correctamente.');
    }

    function generarPdfRegistro() {
        var d = obtenerDatosFormulario();
        if (!validarFormulario(d)) return;
        if (typeof window.entregarHtmlEnVentanaPdf !== 'function') {
            alert('Visor PDF no disponible.');
            return;
        }
        obtenerLogoRegistro().then(function(logo) {
            var html = construirHtmlRegistroAsesoria(d, logo);
            window.entregarHtmlEnVentanaPdf(html);
        });
    }

    function renderHistorialRegistro() {
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
                var id = btn.getAttribute('data-id');
                var reg = obtenerRegistros().find(function(x) { return x.id === id; });
                if (reg) cargarFormulario(reg);
            };
        });
        cont.querySelectorAll('.ra-hist-pdf').forEach(function(btn) {
            btn.onclick = function() {
                var id = btn.getAttribute('data-id');
                var reg = obtenerRegistros().find(function(x) { return x.id === id; });
                if (!reg || typeof window.entregarHtmlEnVentanaPdf !== 'function') return;
                obtenerLogoRegistro().then(function(logo) {
                    window.entregarHtmlEnVentanaPdf(construirHtmlRegistroAsesoria(reg, logo));
                });
            };
        });
        cont.querySelectorAll('.ra-hist-del').forEach(function(btn) {
            btn.onclick = function() {
                if (!confirm('¿Eliminar este registro?')) return;
                var id = btn.getAttribute('data-id');
                guardarRegistros(obtenerRegistros().filter(function(x) { return x.id !== id; }));
                renderHistorialRegistro();
            };
        });
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
                var id = btn.getAttribute('data-id');
                var m = obtenerFirmasGuardadas();
                delete m[id];
                guardarFirmasMap(m);
                renderGestionFirmasRegistro();
                if (firmaFuncionarioPad) firmaFuncionarioPad.refrescarGuardada();
                if (firmaUsuarioPad) firmaUsuarioPad.refrescarGuardada();
            };
        });
    }
    window.renderGestionFirmasRegistro = renderGestionFirmasRegistro;
    window.renderHistorialRegistro = renderHistorialRegistro;

    function initRegistroAsesoria() {
        var mountFunc = document.getElementById('ra-firma-funcionario');
        var mountUser = document.getElementById('ra-firma-usuario');
        if (!mountFunc || !mountUser) return;

        var fecha = document.getElementById('ra-fecha');
        if (fecha && !fecha.value && window.fechaHoyLocalYMD) {
            fecha.value = fechaHoyLocalYMD();
        }

        firmaFuncionarioPad = crearFirmaTactil(mountFunc, {
            signerLabel: 'Firma del funcionario',
            signerKey: function() {
                return (document.getElementById('ra-funcionario') || {}).value || 'funcionario';
            }
        });
        firmaUsuarioPad = crearFirmaTactil(mountUser, {
            signerLabel: 'Firma del usuario',
            signerKey: function() {
                var u = (document.getElementById('ra-usuario') || {}).value || '';
                var p = leerPersonasDesdeDom()[0];
                return u || (p && p.nombre) || 'usuario';
            }
        });

        var btnAdd = document.getElementById('ra-add-persona');
        if (btnAdd) btnAdd.onclick = function() { agregarFilaPersona(); };

        var btnGuardar = document.getElementById('ra-guardar');
        if (btnGuardar) btnGuardar.onclick = guardarRegistroActual;

        var btnPdf = document.getElementById('ra-generar-pdf');
        if (btnPdf) btnPdf.onclick = generarPdfRegistro;

        var btnLimpiar = document.getElementById('ra-limpiar');
        if (btnLimpiar) btnLimpiar.onclick = function() {
            if (confirm('¿Limpiar el formulario?')) limpiarFormulario();
        };

        var funcInput = document.getElementById('ra-funcionario');
        var userInput = document.getElementById('ra-usuario');
        if (funcInput) funcInput.addEventListener('input', function() {
            if (firmaFuncionarioPad) firmaFuncionarioPad.refrescarGuardada();
        });
        if (userInput) userInput.addEventListener('input', function() {
            if (firmaUsuarioPad) firmaUsuarioPad.refrescarGuardada();
        });

        if (!document.querySelector('#ra-personas-lista .ra-persona-row')) {
            agregarFilaPersona();
        }
        renderHistorialRegistro();
        renderGestionFirmasRegistro();
    }

    window.initRegistroAsesoria = initRegistroAsesoria;
    window.generarPdfRegistroAsesoriaDesdeDatos = function(datos) {
        return obtenerLogoRegistro().then(function(logo) {
            return construirHtmlRegistroAsesoria(datos, logo);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRegistroAsesoria);
    } else {
        initRegistroAsesoria();
    }
})();
