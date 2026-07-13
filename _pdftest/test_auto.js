const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('C:/Users/DAIRON NARVAEZ/Desktop/ProyeCar/index.html', 'utf8');

// Extraer función real
const start = html.indexOf('function htmlPdfEncabezadoParComparacion');
let depth = 0, i = html.indexOf('{', start), end = -1;
for (; i < html.length; i++) {
  if (html[i] === '{') depth++;
  else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = html.slice(start, end);
const cssMatch = html.match(/var CSS = "((?:[^"\\]|\\.)*)";/);
const css = cssMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fnSrc + '; __fn = htmlPdfEncabezadoParComparacion;', ctx);

// Simular modo auto: compD con reciente/anterior del resolver
const compD = {
  modo: 'auto',
  reciente: { proyecto: 'CONTRATO 088-2026', fecha: '2026-07-12' },
  anterior: { proyecto: 'CONTRATO 088-2026', fecha: '2026-07-05' },
  comparables: [{ frente: { nombre: 'Sector Norte' } }]
};

let h = '<div style="page-break-before:always;">';
h += '<h3>Comparación Semanal por Frente</h3>';
if (compD.reciente && compD.anterior) {
  h += ctx.__fn(compD.reciente, compD.anterior);
}
h += '<div>Resumen...</div></div>';

const checks = [
  ['Contiene sub-t Anterior vs', /Anterior vs/.test(h)],
  ['Contiene kpi-card x2', (h.match(/kpi-card/g) || []).length === 2],
  ['Contiene ANTERIOR label', /Anterior<\/div>/.test(h)],
  ['Contiene MAS RECIENTE', /Reciente<\/div>/.test(h)],
  ['Fecha anterior', h.includes('2026-07-05')],
  ['Fecha reciente', h.includes('2026-07-12')],
];
let ok = true;
checks.forEach(function(c) { console.log((c[1] ? 'OK' : 'FAIL') + ' - ' + c[0]); if (!c[1]) ok = false; });

fs.mkdirSync('C:/Users/DAIRON NARVAEZ/Desktop/ProyeCar/_pdftest', { recursive: true });
const fixture = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + css + '</style></head><body>' + h + '</body></html>';
fs.writeFileSync('C:/Users/DAIRON NARVAEZ/Desktop/ProyeCar/_pdftest/auto_fixture.html', fixture);
console.log('\nRESULTADO:', ok ? 'TODOS OK' : 'HAY FALLAS');
process.exit(ok ? 0 : 1);
