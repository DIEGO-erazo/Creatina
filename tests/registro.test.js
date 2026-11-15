import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveDeFecha, fechaDeClave, esClaveValida, diasEntre, calcularEstadisticas, celdasDelMes, registrosDeEjemplo, ultimosDias,
} from '../js/registro.js';

const fecha = (a, m, d, h = 12) => new Date(a, m - 1, d, h);

test('la clave usa la fecha local aunque sea de noche', () => {
  // A las 23:30 sigue siendo el mismo día (con toISOString en UTC-6 saldría el día siguiente).
  assert.equal(claveDeFecha(fecha(2026, 11, 14, 23)), '2026-11-14');
  assert.equal(claveDeFecha(fecha(2026, 1, 5, 0)), '2026-01-05');
});

test('fechaDeClave devuelve medianoche local del mismo día', () => {
  const f = fechaDeClave('2026-03-09');
  assert.deepEqual([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours()], [2026, 2, 9, 0]);
});

test('valida claves', () => {
  assert.ok(esClaveValida('2026-02-28'));
  assert.ok(!esClaveValida('2026-02-30'));
  assert.ok(!esClaveValida('hola'));
  assert.ok(!esClaveValida(20261114));
});

test('diasEntre cruza meses y años', () => {
  assert.equal(diasEntre(fecha(2025, 12, 31), fecha(2026, 1, 1)), 1);
  assert.equal(diasEntre(fecha(2026, 2, 1), fecha(2026, 3, 1)), 28);
});

test('sin registros todo es cero', () => {
  const e = calcularEstadisticas(new Set(), fecha(2026, 11, 14));
  assert.equal(e.primera, null);
  assert.equal(e.racha, 0);
  assert.equal(e.noTomados, 0);
});

test('hoy sin registrar no cuenta como fallado ni rompe la racha', () => {
  const hoy = fecha(2026, 11, 14);
  const r = new Set(['2026-11-11', '2026-11-12', '2026-11-13']);
  const e = calcularEstadisticas(r, hoy);
  assert.equal(e.tomadoHoy, false);
  assert.equal(e.racha, 3);
  assert.equal(e.noTomados, 0);
  assert.equal(e.cumplimiento, 100);
});

test('cuenta días no tomados, racha y mejor racha', () => {
  const hoy = fecha(2026, 11, 14);
  // 1-4 tomados, 5 y 6 no, 7-12 tomados, 13 no, 14 tomado
  const r = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14']);
  const e = calcularEstadisticas(r, hoy);
  assert.equal(e.primera, '2026-11-01');
  assert.equal(e.tomados, 11);
  assert.equal(e.noTomados, 3);
  assert.equal(e.racha, 1);
  assert.equal(e.mejorRacha, 6);
  assert.equal(e.cumplimiento, Math.round((11 / 14) * 100));
});

test('los registros futuros o inválidos se ignoran', () => {
  const hoy = fecha(2026, 11, 14);
  const e = calcularEstadisticas(new Set(['2026-11-14', '2026-12-01', 'basura']), hoy);
  assert.equal(e.tomados, 1);
  assert.equal(e.primera, '2026-11-14');
});

test('calendario: relleno inicial, estados y días editables', () => {
  const hoy = fecha(2026, 11, 14);
  const r = new Set(['2026-11-10', '2026-11-12']);
  const celdas = celdasDelMes(2026, 10, r, hoy); // noviembre 2026 empieza en domingo
  const dias = celdas.filter((c) => c.estado !== 'vacio');
  assert.equal(celdas.length - dias.length, new Date(2026, 10, 1).getDay());
  assert.equal(dias.length, 30);
  const estado = (d) => dias[d - 1].estado;
  assert.equal(estado(9), 'sin-dato');   // antes de empezar
  assert.equal(estado(10), 'tomado');
  assert.equal(estado(11), 'no-tomado');
  assert.equal(estado(13), 'no-tomado');
  assert.equal(estado(14), 'pendiente');
  assert.equal(estado(20), 'sin-dato');  // futuro
  assert.equal(dias[13].esHoy, true);
  assert.equal(dias[14].editable, false);
});

test('los datos de ejemplo son coherentes', () => {
  const hoy = fecha(2026, 11, 14);
  const e = calcularEstadisticas(registrosDeEjemplo(hoy), hoy);
  assert.equal(e.tomados + e.noTomados, 41);
  assert.ok(e.racha >= 1 && e.mejorRacha >= e.racha);
});

test('franja de la semana: 7 días que terminan hoy', () => {
  const hoy = fecha(2026, 11, 14); // sábado
  const dias = ultimosDias(new Set(['2026-11-09', '2026-11-11', '2026-11-12']), 7, hoy);
  assert.equal(dias.length, 7);
  assert.deepEqual(dias.map((d) => d.inicial).join(''), 'DLMMJVS');
  assert.deepEqual(dias.map((d) => d.estado), ['sin-dato', 'tomado', 'no-tomado', 'tomado', 'tomado', 'no-tomado', 'pendiente']);
  assert.equal(dias[6].esHoy, true);
});
