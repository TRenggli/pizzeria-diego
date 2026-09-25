import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/load.mjs';

const { U } = loadApp();

test('parseMoney entiende montos como los escribe la gente', () => {
  assert.equal(U.parseMoney('$ 23.000'), 23000);
  assert.equal(U.parseMoney('23000'), 23000);
  assert.equal(U.parseMoney('1.234,50'), 1234.5);
  assert.equal(U.parseMoney(''), 0);
  assert.equal(U.parseMoney(1500), 1500);
});

test('money formatea en pesos sin decimales', () => {
  assert.match(U.money(16600).replace(/\s/g, ' '), /\$ ?16\.600/);
  assert.match(U.money(1234.6), /1\.235/);
});

test('CUIL: valida el dígito verificador', () => {
  assert.equal(U.validCuil('20-12345678-6'), true);
  assert.equal(U.validCuil('20123456786'), true);
  assert.equal(U.validCuil('27123456780'), true);
  assert.equal(U.validCuil('27123456781'), false, 'dígito verificador incorrecto');
  assert.equal(U.validCuil('2012345678'), false, 'faltan dígitos');
  assert.equal(U.validCuil('99123456786'), false, 'prefijo inexistente');
  assert.equal(U.formatCuil('20123456786'), '20-12345678-6');
});

test('rangos de fechas', () => {
  const now = new Date(2026, 8, 25, 21, 30); // 25/09/2026 21:30
  const [a, b] = U.rangeBounds('mesant', {}, now);
  assert.equal(new Date(a).toISOString().slice(0, 10), new Date(2026, 7, 1).toISOString().slice(0, 10));
  assert.equal(new Date(b).getDate(), 31);
  assert.equal(new Date(b).getMonth(), 7);
  const [h] = U.rangeBounds('hoy', {}, now);
  assert.equal(new Date(h).getHours(), 0);
  const [y1, y2] = U.rangeBounds('ayer', {}, now);
  assert.equal(new Date(y1).getDate(), 24);
  assert.equal(new Date(y2).getDate(), 24);
  const [s7] = U.rangeBounds('7d', {}, now);
  assert.equal(new Date(s7).getDate(), 19);
  const [c1, c2] = U.rangeBounds('custom', { from: '2026-09-01', to: '2026-09-10' }, now);
  assert.equal(new Date(c1).getDate(), 1);
  assert.equal(new Date(c2).getDate(), 10);
});

test('teléfono para WhatsApp con código de país', () => {
  assert.equal(U.phoneForWa('11 5555-1234'), '5491155551234');
  assert.equal(U.phoneForWa('011 5555-1234'), '5491155551234');
});
