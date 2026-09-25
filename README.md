# 🍕 Pizzería Diego — Sistema de gestión

Sistema web para una pizzería. Anda en el celular, la tablet o cualquier compu con Chrome, se instala como una app y **no necesita internet para funcionar** una vez cargado.

## Qué hace

| Módulo | Qué incluye |
|---|---|
| **🧾 Tickets** (lo urgente) | Comprobante de pago profesional para efectivo, transferencia, QR y tarjeta: logo, datos del local, número correlativo `0001-00000001`, detalle, vuelto, sello PAGADO, QR a Instagram o reseñas y la leyenda "no válido como factura". Papel de 58 u 80 mm. Comanda aparte para cocina. |
| **🍕 Vender** | Punto de venta táctil, **mitad y mitad**, tamaños, agregados, aclaraciones, mostrador, delivery, para retirar y mesa. Descuentos (más del 20% pide la clave de un administrador). |
| **💸 Cobro** | Efectivo con cálculo de vuelto y billetes sugeridos · Transferencia con alias/CBU para copiar · QR de Mercado Pago en pantalla · Tarjeta · **Pago mixto** · % de descuento por efectivo y % de recargo por tarjeta configurables. |
| **🔥 Pedidos** | Tablero en vivo: Recibido → Horno → Listo → En camino → Entregado. Cronómetro, alerta de demora, sonido al entrar un pedido, aviso por WhatsApp, repartidor y link a Google Maps. |
| **💰 Caja** | Apertura con fondo, ingresos y retiros, arqueo parcial, cierre Z con conteo de billetes, faltante o sobrante e historial de cierres. |
| **👥 Clientes** | Se cargan solos al tomar un pedido. Historial, su gusto favorito, notas ("el timbre no anda") y **repetir pedido** con un toque. |
| **📋 Menú** | Productos, tamaños, categorías, agregados, marcar como agotado, **aumento masivo de precios por %** y carta imprimible en PDF. |
| **📦 Stock** | Insumos con mínimo, alertas y lista de compras para WhatsApp. Se descuenta solo por receta al vender. |
| **📈 Reportes** | Ventas por día, hora y día de la semana, productos top, gustos favoritos, medios de pago, tipo de pedido, mejores clientes y repartidores. Exporta a Excel (CSV). |
| **⚙️ Config** | Datos del negocio, impresora, cobros, zonas de envío, usuarios y roles, temas, respaldos y registro de actividad. |

**Temas por sabor de pizza:** Margherita, Pepperoni, Fugazzeta, Cuatro quesos, Rúcula y crudo, Napolitana y Horno de barro (oscuro).

## Usuarios de demo

| Usuario | Contraseña | Rol |
|---|---|---|
| `diego` | `pizza123` | Administrador (todo) |
| `caja` | `caja123` | Cajero/a |
| `cocina` | `cocina123` | Solo tablero de pedidos |

> ⚠️ **Antes de usarlo de verdad:** cambiar las contraseñas (menú del usuario → Cambiar mi contraseña) y borrar las ventas de demo (Configuración → Respaldo y sistema).

## Cómo imprimir tickets

En **Configuración → Ticket e impresora** hay 3 modos:

1. **Del sistema / PDF.** Usa el diálogo de impresión del navegador. Sirve para cualquier impresora instalada o para guardar PDF.
2. **Bluetooth directo.** Para térmicas ESC/POS (las chinas de 58/80 mm tipo "POS-5802", "MTP-II", Xprinter, etc.) desde **Chrome en Android**. Se imprime sin diálogo.
3. **App RawBT (Android).** Si el Bluetooth directo no conecta, instalar la app gratuita *RawBT* desde Play Store, emparejar la impresora ahí y elegir este modo. Es la opción más compatible.

Recomendado para arrancar: **tablet o celular Android + térmica Bluetooth de 58 u 80 mm + RawBT**.

## Probarlo en tu compu

```bash
python -m http.server 8765
```

Y abrir http://localhost:8765

## Publicarlo (gratis) para que el cliente entre desde el celular

Es un sitio 100% estático (HTML/CSS/JS, sin build). Cualquiera de estas opciones sirve:

- **Netlify Drop:** entrar a https://app.netlify.com/drop y arrastrar la carpeta. En 30 segundos queda con una URL `https://...netlify.app`.
- **GitHub Pages:** subir el repo → Settings → Pages → branch `main` / root.
- **Vercel** o **Cloudflare Pages:** importar el repo, sin configuración.

Después, en el celular: abrir la URL en Chrome → menú ⋮ → **"Instalar app"**. Queda con ícono propio y en pantalla completa.

> Hace falta HTTPS (lo dan todas esas plataformas) para que funcionen el Bluetooth, la instalación como app y el modo sin conexión.

## Dónde se guardan los datos (importante)

En esta versión los datos quedan **en el dispositivo** (IndexedDB del navegador). Consecuencias:

- Cada celular o tablet tiene sus propios datos. Si usan uno solo para caja, perfecto.
- **Hay que descargar un respaldo cada semana** (Configuración → Respaldo y sistema) y guardarlo en Drive o mandarlo por mail.
- El login protege el uso diario, pero no reemplaza a un servidor. No es seguridad de nivel bancario.

### Próximo paso sugerido: nube

Toda la lectura y escritura de datos pasa por `js/store.js`. Para sincronizar varios dispositivos (caja + cocina + dueño viendo reportes desde su casa), hay que reemplazar esa capa por **Supabase** (Postgres + login real + tiempo real, con plan gratuito). El resto de la app no cambia.

## Otras ideas para el futuro

- **Factura electrónica ARCA/AFIP** (vía un servicio como TusFacturas o Facturante), para emitir factura C o B desde el mismo cobro.
- **Menú online con pedidos por WhatsApp** que caen directo en el tablero.
- **Cobro con QR dinámico de Mercado Pago** (con el monto exacto) y confirmación automática del pago.
- **Programa de puntos:** la 10ª pizza gratis.
- **Promos por día** ("martes 2x1 en muzza").

## Estructura

```
index.html            entrada
css/styles.css        estilos y temas por sabor
js/core.js            utilidades, modales, toasts y confeti
js/store.js           datos (IndexedDB) ← la pieza a reemplazar para ir a la nube
js/auth.js            login, roles y permisos
js/ticket.js          tickets HTML + ESC/POS + Bluetooth + RawBT + WhatsApp
js/charts.js          gráficos livianos
js/app.js             navegación y pantalla principal
js/views/*.js         una pantalla por archivo
sw.js                 modo sin conexión
vendor/qrcode.js      generador de QR (MIT)
```
