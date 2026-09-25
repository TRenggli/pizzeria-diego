import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, withMenu } from './helpers/load.mjs';

function setup() {
  const app = loadApp();
  withMenu(app.S);
  // números reservados para no depender de la nube
  app.localStorage.setItem('pz-pool-br-1', JSON.stringify({ order: [[100, 199]], ticket: [[500, 599]] }));
  return app;
}
const P = (S, id) => S.product(id);
const V = (S, id, v) => S.product(id).variants.find((x) => x.id === v);

test('mitad y mitad: por defecto se cobra la más cara', () => {
  const { S } = setup();
  const it = S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande'), half: { product: P(S, 'p-esp'), variant: V(S, 'p-esp', 'grande') } });
  assert.equal(it.unitPrice, 14000);
  assert.equal(it.name, '½ Muzzarella + ½ Especial');
});

test('mitad y mitad: con precio promedio', () => {
  const { S } = setup();
  S.data.settings.halfPricing = 'avg';
  const it = S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande'), half: { product: P(S, 'p-esp'), variant: V(S, 'p-esp', 'grande') } });
  assert.equal(it.unitPrice, 12000);
});

test('agregados suman al precio unitario y la cantidad multiplica', () => {
  const { S } = setup();
  const it = S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande'), extras: [S.data.extras[0]], qty: 3 });
  assert.equal(it.unitPrice, 11000);
  assert.equal(it.total, 33000);
});

test('costo de mercadería según receta (las cajas no se achican por tamaño)', () => {
  const { S } = setup();
  const grande = S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande') });
  const chica = S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'chica') });
  assert.equal(grande.cost, 3500); // 0,3 kg × 10.000 + 1 caja × 500
  assert.equal(chica.cost, 2000);  // 0,15 kg × 10.000 + 1 caja × 500
});

test('totales: descuento % redondeado, descuento $ con tope y envío solo en delivery', () => {
  const { S } = setup();
  const items = [S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande'), qty: 1 }), S.makeItem({ product: P(S, 'p-esp'), variant: V(S, 'p-esp', 'chica'), qty: 1 })];
  const a = S.computeTotals({ type: 'mostrador', items, discount: { type: '%', value: 15 }, deliveryFee: 1500 });
  assert.equal(a.subtotal, 19000);
  assert.equal(a.discountAmount, 2850);
  assert.equal(a.deliveryFee, 0, 'el envío no se cobra si no es delivery');
  assert.equal(a.total, 16150);
  const b = S.computeTotals({ type: 'delivery', items, discount: { type: '$', value: 50000 }, deliveryFee: 1500 });
  assert.equal(b.discountAmount, 19000, 'el descuento no puede superar el subtotal');
  assert.equal(b.total, 1500);
});

test('venta cobrada en efectivo con descuento por efectivo', () => {
  const { S } = setup();
  const draft = { type: 'mostrador', items: [S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande'), qty: 2 })] };
  const o = S.createOrder(draft, { paid: true, payments: [{ method: 'efectivo', amount: 18000, tendered: 20000, change: 2000 }], adjust: { cashDiscount: 2000 } });
  assert.equal(o.subtotal, 20000);
  assert.equal(o.cashDiscount, 2000);
  assert.equal(o.total, 18000);
  assert.equal(o.paid, true);
  assert.equal(o.number, 100, 'número de pedido del bloque reservado');
  assert.equal(o.ticketNumber, 500, 'número de comprobante del bloque reservado');
  const pays = o.payments.reduce((a, p) => a + p.amount, 0);
  assert.equal(pays, o.total, 'los pagos suman el total (lo mismo que exige el servidor)');
});

test('la numeración avanza y no se repite', () => {
  const { S } = setup();
  const nums = [1, 2, 3].map(() => S.nextNumber('order'));
  assert.equal(new Set(nums).size, 3);
  assert.equal(nums[1], nums[0] + 1);
});

test('stock: descuenta por receta y la mitad y mitad usa una sola caja', () => {
  const { S } = setup();
  const muz = S.data.ingredients[0];
  const cajas = S.data.ingredients[1];
  S.createOrder({ type: 'mostrador', items: [S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande'), half: { product: P(S, 'p-esp'), variant: V(S, 'p-esp', 'grande') } })] });
  assert.equal(Math.round(muz.stock * 1000) / 1000, 9.7);
  assert.equal(cajas.stock, 99);
});

test('cierre de caja: efectivo esperado = fondo + ventas en efectivo + ingresos − retiros', () => {
  const { S } = setup();
  S.openSession(20000);
  const it = () => [S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande') })];
  S.createOrder({ type: 'mostrador', items: it() }, { paid: true, payments: [{ method: 'efectivo', amount: 10000, tendered: 10000 }] });
  S.createOrder({ type: 'mostrador', items: it() }, { paid: true, payments: [{ method: 'qr', amount: 10000 }] });
  S.createOrder({ type: 'mostrador', items: it() }, { paid: true, payments: [{ method: 'efectivo', amount: 4000 }, { method: 'transferencia', amount: 6000 }] });
  S.addCashMove('ingreso', 5000, 'Cambio');
  S.addCashMove('egreso', 3000, 'Verdura', 'Mercadería');
  const sum = S.sessionSummary(S.currentSession());
  assert.equal(sum.sales, 30000);
  assert.equal(sum.byMethod.efectivo, 14000);
  assert.equal(sum.byMethod.qr, 10000);
  assert.equal(sum.byMethod.transferencia, 6000);
  assert.equal(sum.expectedCash, 20000 + 14000 + 5000 - 3000);
  assert.equal(S.data.expenses.length, 1, 'el retiro con categoría quedó como gasto');
  assert.equal(S.data.expenses[0].source, 'caja');
  const closed = S.closeSession(35500);
  assert.equal(closed.diff, -500, 'faltan $500');
});

test('ganancia: ventas − gastos, y rendimiento por persona', () => {
  const { S } = setup();
  S.openSession(0);
  const it = () => [S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande') })];
  S.createOrder({ type: 'mostrador', items: it() }, { paid: true, payments: [{ method: 'efectivo', amount: 10000 }] });
  S.addExpense({ category: 'Sueldos', amount: 4000, employeeId: 'u-owner' });
  S.addExpense({ category: 'Alquiler', amount: 1000 });
  const p = S.profit(0, Date.now() + 1000);
  assert.equal(p.sales, 10000);
  assert.equal(p.expenses, 5000);
  assert.equal(p.result, 5000);
  assert.equal(p.cogs, 3500);
  const st = S.employeeStats(0, Date.now() + 1000)['u-owner'];
  assert.equal(st.sales, 10000);
  assert.equal(st.tickets, 1);
  assert.equal(st.salary, 4000);
});

test('anular requiere conexión', async () => {
  const { S, setOnline } = setup();
  const o = S.createOrder({ type: 'mostrador', items: [S.makeItem({ product: P(S, 'p-muz'), variant: V(S, 'p-muz', 'grande') })] });
  setOnline(false);
  await assert.rejects(() => S.voidOrder(o.id, 'error de carga'), /conexión/);
});
