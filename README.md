# 🍕 Pizzería — Sistema de gestión multi-sucursal

Sistema web para pizzerías con una o varias sucursales. Anda en celular, tablet o compu, se instala como app, **guarda todo en la nube** (Supabase) y **sigue funcionando sin internet**: sincroniza solo cuando vuelve la conexión.

## Qué hace

| Módulo | Qué incluye |
|---|---|
| **🧾 Tickets** | Comprobante de pago profesional (efectivo, transferencia, QR, tarjeta): logo, sucursal, número `0001-00000001`, detalle, vuelto, sello PAGADO, QR y leyenda "no válido como factura". 58 u 80 mm. Comanda de cocina. Impresión por navegador/PDF, Bluetooth directo o RawBT. |
| **🍕 Vender** | Punto de venta táctil, mitad y mitad, tamaños, agregados, mostrador, delivery, para retirar y mesa. |
| **💸 Cobro** | Vuelto automático, alias/CBU para copiar, QR de Mercado Pago, tarjeta, pago mixto, descuento por efectivo y recargo por tarjeta. |
| **🔥 Pedidos** | Tablero en vivo **compartido entre equipos**: la caja carga un pedido y aparece al instante en la tablet de cocina. |
| **💰 Caja** | Apertura, ingresos/retiros, arqueo, cierre Z con conteo de billetes. Una caja por sucursal. |
| **🏢 Sucursales** | Panel del dueño: ventas de cada sucursal, comparación, ventas por día apiladas, medios de pago, productos top y horarios pico **de todo el negocio**. Estado en vivo (caja abierta, pedidos en curso). Alta y edición de sucursales. |
| **👥 Clientes** | Compartidos entre sucursales, con historial y "repetir pedido". |
| **📋 Menú** | Compartido por todas las sucursales, con aumento masivo de precios y carta imprimible. |
| **📦 Stock** | Por sucursal, con descuento automático por receta. |
| **📈 Reportes** | De la sucursal activa, más CSV para Excel. |
| **⚙️ Config** | Por sucursal: datos del ticket, impresora, cobros, zonas. Usuarios con rol y sucursales asignadas. |

## Cómo se organiza la información

```
Negocio (organización)          ← tiene un dueño
 ├─ Menú, precios, agregados    ← compartido
 ├─ Clientes                    ← compartido
 ├─ Usuarios (rol + sucursales asignadas)
 └─ Sucursales
     ├─ Configuración (ticket, cobros, zonas de envío)
     ├─ Pedidos y ventas
     ├─ Caja
     └─ Stock
```

| Rol | Puede |
|---|---|
| **Dueño/a** | Todo, en todas las sucursales. Crea sucursales y encargados. |
| **Encargado/a** | Todo en sus sucursales (menú, precios, usuarios, reportes, estadísticas). |
| **Cajero/a** | Vender, pedidos, caja, clientes, historial y stock de su sucursal. |
| **Cocina / Delivery** | Solo el tablero de pedidos. |

Los permisos se aplican **en la base de datos** (Row Level Security de Postgres), no solo en la pantalla: un cajero de una sucursal no puede leer ni modificar datos de otra aunque manipule la app.

## Acceso de demostración

| Usuario | Contraseña | Rol |
|---|---|---|
| `demo@pizzeriadiego.app` | `Pizza2026` | Dueño (sucursales Centro y Palermo, con ventas de ejemplo) |
| `caja.palermo` | `caja1234` | Cajero, solo Palermo |

Los empleados ingresan con **usuario** (sin email). El dueño se registra con su email desde "Creá tu cuenta".

> ⚠️ Antes de producción: cambiar esas contraseñas, borrar las ventas de demo de cada sucursal (Configuración → Respaldo y sistema) y definir `REGISTRATION_CODE` (ver más abajo).

## Sin internet

- Cada equipo guarda una copia local de su sucursal (IndexedDB).
- Los cambios se encolan y se envían apenas vuelve la conexión (indicador ☁️ arriba a la derecha).
- Cada equipo reserva bloques de números de pedido y comprobante, así se puede vender offline sin repetir números entre cajas.
- Si dos equipos cambian el mismo pedido (cocina lo pasa al horno mientras caja lo cobra), se combinan campo por campo: no se pisan.
- Para el **primer** ingreso en un equipo hace falta internet.

## Publicarlo

Es un sitio estático (HTML/CSS/JS, sin compilar). No hace falta una compu prendida: el hosting lo sirve 24/7 y la base está en Supabase.

- **GitHub Pages**: Settings → Pages → rama `main`, carpeta raíz.
- **Netlify Drop**: arrastrar la carpeta a https://app.netlify.com/drop.
- **Vercel / Cloudflare Pages**: importar el repositorio.

En el celular: abrir la URL en Chrome → ⋮ → **Instalar app**.

### Cerrar el registro público

Cualquiera con la URL puede crear un negocio nuevo (queda aislado de los demás). Para que solo se registre quien tenga un código, en Supabase → Edge Functions → Secrets agregar `REGISTRATION_CODE` y pasarle ese código a los clientes nuevos.

## Probarlo local

```bash
python -m http.server 8765
```

## Backend (Supabase)

- Proyecto `pizzeria-diego` (región São Paulo).
- `supabase/migrations/`: tablas, políticas RLS y funciones (estadísticas, numeración, sincronización con merge).
- `supabase/functions/register`: alta de negocio + dueño + primera sucursal.
- `supabase/functions/staff`: alta, cambio de clave y baja de empleados (requiere dueño o encargado).
- La clave de `js/config.js` es la *publishable key*: es pública por diseño; la seguridad la dan las políticas RLS.

## Estructura

```
index.html
css/styles.css         estilos y temas por sabor
css/responsive.css     adaptación a celular, tablet, notebook y pantallas grandes
js/config.js           URL y clave pública de Supabase
js/cloud.js            sesión, lectura/escritura, tiempo real, estadísticas
js/store.js            datos de la sucursal + sincronización offline
js/seed.js             menú de ejemplo y ventas de demo
js/auth.js             roles y permisos
js/ticket.js           tickets HTML + ESC/POS + Bluetooth + RawBT + WhatsApp
js/app.js              ingreso, sucursales, navegación
js/views/*.js          una pantalla por archivo (sucursales.js = panel del dueño)
supabase/              migraciones y funciones del servidor
sw.js                  modo sin conexión
```

## Ideas para seguir

- Factura electrónica ARCA/AFIP desde el cobro.
- Menú online con pedidos por WhatsApp que caen en el tablero.
- QR dinámico de Mercado Pago con confirmación automática.
- Precios distintos por sucursal (hoy el menú es compartido).
- Programa de puntos.
