/* ==========================================================================
   PZ.store — capa de datos.
   Todo vive en memoria y se persiste en IndexedDB (con fallback a
   localStorage). Esta es la única pieza que hay que reemplazar para pasar
   a un backend en la nube (Supabase, Firebase, API propia).
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  const DB_NAME = 'pizzeria-diego';
  const STORE = 'kv';
  const KEY = 'data-v1';
  const LS_KEY = 'pizzeria-diego-data-v1';

  /* ---------- Persistencia (IndexedDB -> localStorage) ---------- */
  const idb = {
    db: null,
    open() {
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no-idb'));
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => { this.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      });
    },
    get(k) {
      return new Promise((res, rej) => {
        const t = this.db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
        t.onsuccess = () => res(t.result);
        t.onerror = () => rej(t.error);
      });
    },
    set(k, v) {
      return new Promise((res, rej) => {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
  };

  let useIdb = false;
  let saveTimer = null;
  const listeners = new Set();

  const S = (PZ.store = {
    data: null,

    async init() {
      try { await idb.open(); useIdb = true; } catch (e) { useIdb = false; }
      let raw = null;
      if (useIdb) raw = await idb.get(KEY);
      if (!raw) {
        const ls = localStorage.getItem(LS_KEY);
        if (ls) raw = JSON.parse(ls);
      }
      if (raw) {
        S.data = S.migrate(raw);
      } else {
        S.data = await S.seed();
        await S.flush();
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },

    migrate(d) {
      const base = S.defaults();
      d.settings = deepMerge(base.settings, d.settings || {});
      for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
      return d;
    },

    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => S.flush(), 200);
      listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    },

    async flush() {
      clearTimeout(saveTimer);
      try {
        if (useIdb) await idb.set(KEY, S.data);
        else localStorage.setItem(LS_KEY, JSON.stringify(S.data));
      } catch (e) {
        console.error(e);
        PZ.toast('No se pudo guardar. Exportá un respaldo desde Configuración.', 'err', 6000);
      }
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async replaceAll(newData) {
      S.data = S.migrate(newData);
      await S.flush();
      S.save();
    },

    /* =================== Datos por defecto =================== */
    defaults() {
      return {
        version: 1,
        settings: {
          business: {
            name: 'Pizzería Diego',
            slogan: 'Pizza a la piedra, con amor',
            address: 'Av. Siempre Viva 742',
            city: 'Buenos Aires',
            phone: '11 5555-1234',
            whatsapp: '1155551234',
            cuit: '',
            taxCondition: 'Monotributista',
            instagram: '@pizzeriadiego',
          },
          ticket: {
            width: 80,
            showLogo: true,
            logo: null,
            qrMode: 'instagram', // instagram | custom | none
            qrText: '',
            footer: '¡Gracias por elegirnos! Buen provecho',
            legend: 'Comprobante no válido como factura',
            pos: 1,
            copies: 1,
            autoPrint: true,
            printKitchen: true,
            printMode: 'browser', // browser | bluetooth | rawbt
          },
          payments: {
            alias: 'PIZZERIA.DIEGO.MP',
            cbu: '',
            holder: 'Diego',
            bank: 'Mercado Pago',
            qrImage: null,
            qrLink: '',
            cashDiscountPct: 0,
            cardSurchargePct: 0,
            enableCard: true,
          },
          halfPricing: 'max', // max | avg
          prepMinutes: 35,
          zones: [
            { id: 'z1', name: 'Zona 1 · hasta 10 cuadras', fee: 1500 },
            { id: 'z2', name: 'Zona 2 · hasta 20 cuadras', fee: 2500 },
            { id: 'z3', name: 'Zona 3 · más lejos', fee: 3500 },
          ],
          drivers: ['Carlos', 'Lucas'],
          theme: 'margherita',
          motion: true,
        },
        users: [],
        categories: [],
        products: [],
        extras: [],
        customers: [],
        orders: [],
        cashSessions: [],
        cashMoves: [],
        ingredients: [],
        stockMoves: [],
        counters: { order: 1, ticket: 1 },
        audit: [],
        demo: false,
      };
    },

    async seed() {
      const d = S.defaults();
      d.users = [
        { id: 'u1', name: 'Diego', username: 'diego', passHash: await U.sha256('pizza123'), role: 'admin', active: true },
        { id: 'u2', name: 'Caja', username: 'caja', passHash: await U.sha256('caja123'), role: 'cajero', active: true },
        { id: 'u3', name: 'Cocina', username: 'cocina', passHash: await U.sha256('cocina123'), role: 'cocina', active: true },
      ];
      d.categories = [
        { id: 'c-piz', name: 'Pizzas', icon: '🍕', allowHalf: true },
        { id: 'c-esp', name: 'Especiales', icon: '⭐', allowHalf: true },
        { id: 'c-emp', name: 'Empanadas', icon: '🥟', allowHalf: false },
        { id: 'c-fai', name: 'Fainá y más', icon: '🥧', allowHalf: false },
        { id: 'c-beb', name: 'Bebidas', icon: '🥤', allowHalf: false },
        { id: 'c-pos', name: 'Postres', icon: '🍮', allowHalf: false },
      ];
      d.ingredients = [
        { id: 'i-muz', name: 'Muzzarella', unit: 'kg', stock: 18, min: 5, cost: 9500 },
        { id: 'i-har', name: 'Harina 000', unit: 'kg', stock: 40, min: 10, cost: 900 },
        { id: 'i-sal', name: 'Salsa de tomate', unit: 'lt', stock: 12, min: 4, cost: 2200 },
        { id: 'i-jam', name: 'Jamón cocido', unit: 'kg', stock: 4, min: 1.5, cost: 11000 },
        { id: 'i-ceb', name: 'Cebolla', unit: 'kg', stock: 6, min: 2, cost: 1200 },
        { id: 'i-cal', name: 'Longaniza calabresa', unit: 'kg', stock: 2.5, min: 1, cost: 13000 },
        { id: 'i-ace', name: 'Aceitunas', unit: 'kg', stock: 1.2, min: 0.5, cost: 8000 },
        { id: 'i-cru', name: 'Jamón crudo', unit: 'kg', stock: 0.8, min: 1, cost: 26000 },
        { id: 'i-car', name: 'Cajas de pizza', unit: 'u', stock: 180, min: 60, cost: 450 },
        { id: 'i-gar', name: 'Garbanzos (fainá)', unit: 'kg', stock: 5, min: 1.5, cost: 2800 },
      ];
      const pz = (name, desc, chica, grande, recipe, color) => ({
        id: U.uid('p-'), categoryId: 'c-piz', name, desc, active: true, color,
        variants: [
          { id: 'grande', name: 'Grande', price: grande, factor: 1 },
          { id: 'chica', name: 'Chica', price: chica, factor: 0.6 },
        ],
        recipe,
      });
      const base = [{ ingredientId: 'i-muz', qty: 0.35 }, { ingredientId: 'i-har', qty: 0.3 }, { ingredientId: 'i-sal', qty: 0.15 }, { ingredientId: 'i-car', qty: 1 }];
      const withX = (extra) => base.concat(extra);
      d.products = [
        pz('Muzzarella', 'Salsa, muzzarella, orégano y aceitunas', 9500, 13500, withX([{ ingredientId: 'i-ace', qty: 0.02 }]), '#f4d35e'),
        pz('Napolitana', 'Muzza, rodajas de tomate, ajo y perejil', 10500, 15000, base, '#e63946'),
        pz('Fugazzeta', 'Rellena de muzza con cebolla y orégano', 11000, 15800, withX([{ ingredientId: 'i-ceb', qty: 0.25 }, { ingredientId: 'i-muz', qty: 0.15 }]), '#e9c46a'),
        pz('Calabresa', 'Muzza con longaniza calabresa', 11000, 16000, withX([{ ingredientId: 'i-cal', qty: 0.12 }]), '#b3261e'),
        pz('Especial', 'Muzza, jamón, morrones y huevo', 11500, 16500, withX([{ ingredientId: 'i-jam', qty: 0.12 }]), '#f4a261'),
        pz('Jamón y morrones', 'Muzza, jamón cocido y morrones asados', 11000, 16000, withX([{ ingredientId: 'i-jam', qty: 0.12 }]), '#d62828'),
        pz('Cuatro quesos', 'Muzza, roquefort, provolone y parmesano', 12500, 17800, withX([{ ingredientId: 'i-muz', qty: 0.1 }]), '#ffe08a'),
        pz('Rúcula y crudo', 'Muzza, rúcula fresca, jamón crudo y parmesano', 13500, 19000, withX([{ ingredientId: 'i-cru', qty: 0.1 }]), '#52b788'),
      ];
      const one = (categoryId, name, desc, price, extra = {}) => ({
        id: U.uid('p-'), categoryId, name, desc, active: true,
        variants: [{ id: 'u', name: 'Unidad', price, factor: 1 }], recipe: [], ...extra,
      });
      d.products.push(
        { ...pz('Provolone y tomate', 'Provolone gratinado, tomate y albahaca', 12500, 18000, base, '#e76f51'), categoryId: 'c-esp' },
        { ...pz('Palmitos', 'Muzza, jamón, palmitos y salsa golf', 13000, 18500, base, '#90be6d'), categoryId: 'c-esp' },
        { ...pz('Pizza Diego', 'La de la casa: muzza, panceta, cheddar y verdeo', 13500, 19500, base, '#ff8c42'), categoryId: 'c-esp' },
        {
          id: U.uid('p-'), categoryId: 'c-emp', name: 'Empanada de carne', desc: 'Cortada a cuchillo, al horno', active: true,
          variants: [{ id: 'u', name: 'Unidad', price: 1500, factor: 1 }, { id: 'doc', name: 'Docena', price: 16000, factor: 12 }], recipe: [],
        },
        {
          id: U.uid('p-'), categoryId: 'c-emp', name: 'Empanada jamón y queso', desc: 'Clásica', active: true,
          variants: [{ id: 'u', name: 'Unidad', price: 1500, factor: 1 }, { id: 'doc', name: 'Docena', price: 16000, factor: 12 }], recipe: [],
        },
        {
          id: U.uid('p-'), categoryId: 'c-emp', name: 'Empanada de humita', desc: 'Choclo cremoso', active: true,
          variants: [{ id: 'u', name: 'Unidad', price: 1500, factor: 1 }, { id: 'doc', name: 'Docena', price: 16000, factor: 12 }], recipe: [],
        },
        one('c-fai', 'Fainá', 'Porción de fainá de garbanzos', 1800, { recipe: [{ ingredientId: 'i-gar', qty: 0.05 }] }),
        one('c-fai', 'Fugazza', 'Sin queso, cebolla y orégano', 9000),
        one('c-fai', 'Calzone', 'Jamón, muzza y tomate', 11500),
        one('c-beb', 'Coca-Cola 1.5L', '', 4200),
        one('c-beb', 'Sprite 1.5L', '', 4000),
        one('c-beb', 'Agua 500ml', '', 1800),
        one('c-beb', 'Cerveza Quilmes 1L', '', 4500),
        one('c-beb', 'Cerveza artesanal IPA', 'Pinta', 5000),
        one('c-pos', 'Flan casero', 'Con dulce de leche', 4000),
        one('c-pos', 'Helado 1/4 kg', '', 6000),
      );
      d.extras = [
        { id: 'e1', name: 'Extra muzzarella', price: 2500 },
        { id: 'e2', name: 'Huevo', price: 1000 },
        { id: 'e3', name: 'Aceitunas extra', price: 800 },
        { id: 'e4', name: 'Morrones', price: 1500 },
        { id: 'e5', name: 'Borde relleno', price: 3000 },
        { id: 'e6', name: 'Sin sal / sin orégano', price: 0 },
      ];
      d.customers = [
        { id: 'cl1', name: 'María González', phone: '11 4455-6677', address: 'Mitre 1234, 2°B', zoneId: 'z1', notes: 'Timbre no anda, llamar', createdAt: Date.now() - 40 * 864e5 },
        { id: 'cl2', name: 'Juan Pérez', phone: '11 3322-1100', address: 'Belgrano 560', zoneId: 'z2', notes: '', createdAt: Date.now() - 30 * 864e5 },
        { id: 'cl3', name: 'Lucía Fernández', phone: '11 6789-0123', address: 'San Martín 88', zoneId: 'z1', notes: 'Siempre pide fugazzeta', createdAt: Date.now() - 20 * 864e5 },
        { id: 'cl4', name: 'Club El Fortín', phone: '11 2233-4455', address: 'Rivadavia 3000', zoneId: 'z3', notes: 'Pedidos grandes los viernes', createdAt: Date.now() - 12 * 864e5 },
      ];
      S.data = d;
      S.seedDemoHistory(d);
      return d;
    },

    /** Genera 14 días de ventas ficticias para que la demo se vea viva */
    seedDemoHistory(d) {
      const pizzas = d.products.filter((p) => p.categoryId === 'c-piz' || p.categoryId === 'c-esp');
      const others = d.products.filter((p) => !(p.categoryId === 'c-piz' || p.categoryId === 'c-esp'));
      const methods = ['efectivo', 'efectivo', 'transferencia', 'transferencia', 'qr', 'qr', 'tarjeta'];
      const types = ['mostrador', 'delivery', 'delivery', 'retiro', 'mesa'];
      const rnd = (a) => a[Math.floor(Math.random() * a.length)];
      const today = U.startOfDay();
      for (let day = 14; day >= 1; day--) {
        const dayStart = new Date(today.getTime() - day * 864e5);
        const dow = dayStart.getDay();
        const n = Math.round((dow === 5 || dow === 6 ? 34 : dow === 0 ? 28 : 18) * (0.8 + Math.random() * 0.4));
        const session = {
          id: U.uid('cs-'), openedAt: dayStart.getTime() + 18.5 * 36e5, openedBy: 'u1', openingAmount: 20000,
          closedAt: null, closedBy: 'u1', countedCash: 0, expectedCash: 0, diff: 0, notes: '',
        };
        let cashIn = 0;
        for (let i = 0; i < n; i++) {
          const hour = Math.random() < 0.15 ? 12 + Math.random() * 2 : 19.5 + Math.random() * 4;
          const at = dayStart.getTime() + hour * 36e5;
          const items = [];
          const np = 1 + Math.floor(Math.random() * 2.4);
          for (let k = 0; k < np; k++) {
            const p = rnd(pizzas);
            const v = Math.random() < 0.8 ? p.variants[0] : p.variants[1];
            if (Math.random() < 0.18) {
              const p2 = rnd(pizzas);
              const v2 = p2.variants.find((x) => x.id === v.id) || p2.variants[0];
              items.push(S.makeItem({ product: p, variant: v, half: { product: p2, variant: v2 }, qty: 1 }));
            } else items.push(S.makeItem({ product: p, variant: v, qty: 1 }));
          }
          if (Math.random() < 0.6) { const o = rnd(others); items.push(S.makeItem({ product: o, variant: o.variants[0], qty: 1 + Math.floor(Math.random() * 2) })); }
          const type = rnd(types);
          const zone = type === 'delivery' ? rnd(d.settings.zones) : null;
          const cust = type === 'delivery' || Math.random() < 0.3 ? rnd(d.customers) : null;
          const subtotal = items.reduce((a, it) => a + it.total, 0);
          const total = subtotal + (zone ? zone.fee : 0);
          const method = rnd(methods);
          const tendered = method === 'efectivo' ? Math.ceil(total / 5000) * 5000 : total;
          if (method === 'efectivo') cashIn += total;
          const ticketN = d.counters.ticket++;
          d.orders.push({
            id: U.uid('o-'), number: d.counters.order++, ticketNumber: ticketN,
            createdAt: at, paidAt: at + 60000, userId: 'u2', type,
            table: type === 'mesa' ? String(1 + Math.floor(Math.random() * 12)) : '',
            customerId: cust ? cust.id : null, customerName: cust ? cust.name : '', phone: cust ? cust.phone : '', address: cust && type === 'delivery' ? cust.address : '',
            zoneId: zone ? zone.id : null, items, subtotal, discountAmount: 0, discount: null, surcharge: 0,
            deliveryFee: zone ? zone.fee : 0, total,
            payments: [{ method, amount: total, tendered, change: tendered - total, ref: '' }],
            paid: true, status: 'entregado', statusTimes: { pendiente: at, entregado: at + 40 * 60000 },
            driver: type === 'delivery' ? rnd(d.settings.drivers) : '', cashSessionId: session.id, notes: '', voided: false,
          });
        }
        session.closedAt = dayStart.getTime() + 24 * 36e5 - 60000;
        session.expectedCash = session.openingAmount + cashIn - 5000;
        const diff = Math.random() < 0.7 ? 0 : Math.round((Math.random() * 2000 - 1000) / 100) * 100;
        session.countedCash = session.expectedCash + diff;
        session.diff = diff;
        d.cashSessions.push(session);
        d.cashMoves.push({ id: U.uid('cm-'), sessionId: session.id, type: 'egreso', amount: 5000, reason: 'Compra de verdura', at: session.openedAt + 36e5, userId: 'u1' });
      }
      d.demo = true;
    },

    /* =================== Helpers de catálogo =================== */
    category: (id) => S.data.categories.find((c) => c.id === id),
    product: (id) => S.data.products.find((p) => p.id === id),
    user: (id) => S.data.users.find((u) => u.id === id),
    customer: (id) => S.data.customers.find((c) => c.id === id),
    zone: (id) => S.data.settings.zones.find((z) => z.id === id),

    /** Construye una línea de pedido con precio calculado */
    makeItem({ product, variant, half = null, extras = [], qty = 1, notes = '' }) {
      let unit = variant.price;
      if (half) {
        const p2 = half.variant.price;
        unit = S.data.settings.halfPricing === 'avg' ? Math.round((unit + p2) / 2) : Math.max(unit, p2);
      }
      const extrasTotal = extras.reduce((a, e) => a + (Number(e.price) || 0), 0);
      unit += extrasTotal;
      let name = product.name;
      if (half) name = `½ ${product.name} + ½ ${half.product.name}`;
      return {
        id: U.uid('it-'),
        productId: product.id,
        variantId: variant.id,
        variantName: product.variants.length > 1 ? variant.name : '',
        half: half ? { productId: half.product.id, name: half.product.name } : null,
        name,
        extras: extras.map((e) => ({ id: e.id, name: e.name, price: Number(e.price) || 0 })),
        qty,
        unitPrice: unit,
        total: unit * qty,
        notes,
      };
    },

    /* =================== Pedidos =================== */
    computeTotals(o) {
      const p = S.data.settings.payments;
      o.subtotal = o.items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
      let disc = 0;
      if (o.discount && o.discount.value) {
        disc = o.discount.type === '%' ? Math.round((o.subtotal * o.discount.value) / 100) : Number(o.discount.value);
      }
      o.discountAmount = Math.min(disc, o.subtotal);
      o.deliveryFee = o.type === 'delivery' ? Number(o.deliveryFee) || 0 : 0;
      o.total = Math.max(0, o.subtotal - o.discountAmount + o.deliveryFee);
      return o;
    },

    createOrder(draft, { paid = false, payments = [], adjust = {} } = {}) {
      const d = S.data;
      const now = Date.now();
      const o = {
        id: U.uid('o-'),
        number: d.counters.order++,
        ticketNumber: null,
        createdAt: now,
        paidAt: null,
        userId: PZ.auth.current ? PZ.auth.current.id : null,
        type: draft.type || 'mostrador',
        table: draft.table || '',
        customerId: draft.customerId || null,
        customerName: draft.customerName || '',
        phone: draft.phone || '',
        address: draft.address || '',
        zoneId: draft.zoneId || null,
        items: draft.items.map((x) => ({ ...x })),
        discount: draft.discount || null,
        surcharge: 0,
        deliveryFee: draft.deliveryFee || 0,
        payments: [],
        paid: false,
        status: 'pendiente',
        statusTimes: { pendiente: now },
        driver: draft.driver || '',
        cashSessionId: null,
        notes: draft.notes || '',
        eta: draft.eta || '',
        voided: false,
      };
      S.computeTotals(o);
      // Cliente: alta/actualización automática si hay teléfono o nombre
      if (!o.customerId && (o.phone || (o.customerName && o.type === 'delivery'))) {
        const c = S.upsertCustomer({ name: o.customerName, phone: o.phone, address: o.address, zoneId: o.zoneId });
        o.customerId = c.id;
      } else if (o.customerId && o.address) {
        const c = S.customer(o.customerId);
        if (c && !c.address) c.address = o.address;
      }
      d.orders.push(o);
      S.applyStock(o, -1);
      if (paid) S.payOrder(o.id, payments, { silent: true, ...adjust });
      S.save();
      return o;
    },

    /**
     * Registra el cobro. `adjust` trae el descuento por efectivo o el
     * recargo por tarjeta calculados en la pantalla de cobro.
     */
    payOrder(orderId, payments, { silent = false, cashDiscount = 0, surcharge = 0 } = {}) {
      const o = S.order(orderId);
      if (!o) return null;
      const sess = S.currentSession();
      S.computeTotals(o);
      o.cashDiscount = Math.round(cashDiscount) || 0;
      o.surcharge = Math.round(surcharge) || 0;
      o.total = Math.max(0, o.total - o.cashDiscount + o.surcharge);
      o.payments = payments.map((p) => ({ ...p }));
      o.paid = true;
      o.paidAt = Date.now();
      o.ticketNumber = S.data.counters.ticket++;
      o.cashSessionId = sess ? sess.id : null;
      if (!silent) S.save();
      return o;
    },

    order: (id) => S.data.orders.find((o) => o.id === id),

    setStatus(orderId, status) {
      const o = S.order(orderId);
      if (!o) return;
      o.status = status;
      o.statusTimes = o.statusTimes || {};
      o.statusTimes[status] = Date.now();
      S.save();
    },

    voidOrder(orderId, reason) {
      const o = S.order(orderId);
      if (!o || o.voided) return;
      o.voided = true;
      o.voidReason = reason || '';
      o.voidedAt = Date.now();
      o.voidedBy = PZ.auth.current ? PZ.auth.current.id : null;
      o.status = 'cancelado';
      S.applyStock(o, +1);
      S.log('anulación', `Pedido #${o.number} anulado: ${reason || 'sin motivo'}`);
      S.save();
    },

    log(action, detail) {
      S.data.audit.unshift({ at: Date.now(), userId: PZ.auth.current ? PZ.auth.current.id : null, action, detail });
      if (S.data.audit.length > 500) S.data.audit.length = 500;
    },

    /* =================== Clientes =================== */
    upsertCustomer({ id, name, phone, address, zoneId, notes }) {
      const clean = (s) => String(s || '').replace(/\D/g, '');
      let c = id ? S.customer(id) : phone ? S.data.customers.find((x) => clean(x.phone) && clean(x.phone) === clean(phone)) : null;
      if (!c) {
        c = { id: U.uid('cl-'), name: name || 'Cliente', phone: phone || '', address: address || '', zoneId: zoneId || null, notes: notes || '', createdAt: Date.now() };
        S.data.customers.push(c);
      } else {
        if (name) c.name = name;
        if (phone) c.phone = phone;
        if (address) c.address = address;
        if (zoneId) c.zoneId = zoneId;
        if (notes !== undefined) c.notes = notes;
      }
      return c;
    },

    customerStats(cid) {
      const os = S.data.orders.filter((o) => o.customerId === cid && !o.voided);
      const total = os.reduce((a, o) => a + (o.paid ? o.total : 0), 0);
      const last = os.reduce((a, o) => Math.max(a, o.createdAt), 0);
      const fav = {};
      os.forEach((o) => o.items.forEach((it) => { fav[it.name] = (fav[it.name] || 0) + it.qty; }));
      const favName = Object.entries(fav).sort((a, b) => b[1] - a[1])[0];
      return { count: os.length, total, last, fav: favName ? favName[0] : '' };
    },

    /* =================== Caja =================== */
    currentSession: () => S.data.cashSessions.find((s) => !s.closedAt) || null,

    openSession(amount, notes = '') {
      if (S.currentSession()) return S.currentSession();
      const s = { id: U.uid('cs-'), openedAt: Date.now(), openedBy: PZ.auth.current.id, openingAmount: Number(amount) || 0, closedAt: null, notes };
      S.data.cashSessions.push(s);
      S.log('caja', `Apertura de caja con ${U.money(s.openingAmount)}`);
      S.save();
      return s;
    },

    sessionSummary(s) {
      const orders = S.data.orders.filter((o) => o.cashSessionId === s.id && o.paid);
      const valid = orders.filter((o) => !o.voided);
      const byMethod = { efectivo: 0, transferencia: 0, qr: 0, tarjeta: 0 };
      valid.forEach((o) => o.payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; }));
      const moves = S.data.cashMoves.filter((m) => m.sessionId === s.id);
      const ingresos = moves.filter((m) => m.type === 'ingreso').reduce((a, m) => a + m.amount, 0);
      const egresos = moves.filter((m) => m.type === 'egreso').reduce((a, m) => a + m.amount, 0);
      const sales = valid.reduce((a, o) => a + o.total, 0);
      const expectedCash = s.openingAmount + byMethod.efectivo + ingresos - egresos;
      return {
        orders: valid, voided: orders.filter((o) => o.voided), byMethod, moves, ingresos, egresos, sales, expectedCash,
        tickets: valid.length, avg: valid.length ? sales / valid.length : 0,
        discounts: valid.reduce((a, o) => a + (o.discountAmount || 0), 0),
        delivery: valid.reduce((a, o) => a + (o.deliveryFee || 0), 0),
      };
    },

    closeSession(counted, notes = '') {
      const s = S.currentSession();
      if (!s) return null;
      const sum = S.sessionSummary(s);
      s.closedAt = Date.now();
      s.closedBy = PZ.auth.current.id;
      s.expectedCash = sum.expectedCash;
      s.countedCash = Number(counted) || 0;
      s.diff = s.countedCash - s.expectedCash;
      s.closeNotes = notes;
      S.log('caja', `Cierre de caja. Esperado ${U.money(s.expectedCash)}, contado ${U.money(s.countedCash)}`);
      S.save();
      return s;
    },

    addCashMove(type, amount, reason) {
      const s = S.currentSession();
      if (!s) return null;
      const m = { id: U.uid('cm-'), sessionId: s.id, type, amount: Number(amount) || 0, reason, at: Date.now(), userId: PZ.auth.current.id };
      S.data.cashMoves.push(m);
      S.save();
      return m;
    },

    /* =================== Stock =================== */
    applyStock(o, sign) {
      o.items.forEach((it) => {
        const parts = it.half ? [[it.productId, 0.5], [it.half.productId, 0.5]] : [[it.productId, 1]];
        parts.forEach(([pid, share]) => {
          const p = S.product(pid);
          if (!p || !p.recipe || !p.recipe.length) return;
          const v = p.variants.find((x) => x.id === it.variantId) || p.variants[0];
          const factor = (v && v.factor) || 1;
          p.recipe.forEach((r) => {
            const ing = S.data.ingredients.find((i) => i.id === r.ingredientId);
            if (!ing) return;
            // las cajas no se dividen en mitades
            const q = ing.unit === 'u' ? r.qty * it.qty * (it.half && share === 0.5 && pid === it.half.productId ? 0 : 1) : r.qty * factor * share * it.qty;
            ing.stock = Math.round((ing.stock + sign * q) * 1000) / 1000;
          });
        });
      });
    },

    stockMove(ingredientId, delta, reason) {
      const ing = S.data.ingredients.find((i) => i.id === ingredientId);
      if (!ing) return;
      ing.stock = Math.round((ing.stock + Number(delta)) * 1000) / 1000;
      S.data.stockMoves.unshift({ id: U.uid('sm-'), ingredientId, delta: Number(delta), reason, at: Date.now(), userId: PZ.auth.current.id });
      if (S.data.stockMoves.length > 1000) S.data.stockMoves.length = 1000;
      S.save();
    },

    lowStock: () => S.data.ingredients.filter((i) => i.stock <= i.min),

    /* =================== Demo =================== */
    clearDemo() {
      const d = S.data;
      d.orders = [];
      d.cashSessions = [];
      d.cashMoves = [];
      d.stockMoves = [];
      d.counters = { order: 1, ticket: 1 };
      d.demo = false;
      S.log('sistema', 'Se borraron las ventas de demostración');
      S.save();
    },
  });

  function deepMerge(base, over) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(over || {})) {
      const bv = base ? base[k] : undefined;
      const ov = over[k];
      out[k] = bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov) ? deepMerge(bv, ov) : ov;
    }
    return out;
  }
})(window.PZ);
