# SIR·TECH POS

Sistema de control para el taller: **reparaciones**, clientes, cartera, caja y reportes.
HTML + JavaScript puro, sin frameworks ni build. Base de datos en Supabase.

## Estado actual (5 nov 2026)

- ✅ Esquema y seguridad aplicados en Supabase
- ✅ Histórico importado: 1.409 órdenes, 915 clientes, 2.129 ítems, 1.382 abonos
- ✅ Usuario administrador activo
- ✅ Catálogo de servicios normalizado y costos por reparación (`sql/08_servicios.sql`)
- ✅ Módulos de accesorios (FIFO) y equipos (cuotas/créditos) — requiere `sql/10` a `sql/14`
- ✅ Publicado en GitHub Pages: <https://sirtechrepair.github.io/Sirtech-pos/>

> Las secciones 1 y 2 quedan como documentación para reinstalar desde cero.

---

## 1. Base de datos (Supabase)

El proyecto ya está creado:

- **URL:** `https://fdhehsylvogkrutzlood.supabase.co`
- **Publishable key:** está en `js/config.js` (es pública por diseño, la seguridad la da RLS)

### Paso a paso (una sola vez)

En **Supabase → SQL Editor**, ejecuta los archivos **en este orden**:

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `sql/01_esquema.sql` | Tablas, triggers, vistas y función de resumen |
| 2 | — | **Crea tu usuario** en *Authentication → Users → Add user* (correo + contraseña, marca **Auto Confirm User**) |
| 3 | `sql/02_seguridad.sql` | Activa RLS y te da rol **admin** |

> Si ejecutas el paso 3 antes de crear el usuario, no pasa nada: vuelve a correr solo el bloque `do $$ ... $$` del final.

### Importar el histórico (1.409 reparaciones)

> ⚠️ Los archivos `03` a `06` contienen nombres y teléfonos de tus clientes.
> **No se suben a GitHub** (están en `.gitignore`). Se regeneran en tu equipo con
> `python3 import/generar_sql.py`.

Después de lo anterior, ejecuta en orden:

| # | Archivo | Contenido |
|---|---|---|
| 4 | `sql/03_import_clientes.sql` | 915 clientes |
| 5 | `sql/04_import_ordenes.sql` | 1.409 órdenes |
| 6 | `sql/05_import_items.sql` | 2.129 ítems (servicios y repuestos) |
| 7 | `sql/06_import_pagos_estados.sql` | 1.382 abonos y estados finales |
| 8 | `sql/08_servicios.sql` | Catálogo de servicios, normalización y costos por reparación |
| 9 | `sql/09_quitar_recibido.sql` | Elimina el estado "recibido" del flujo |
| 10 | `sql/10_accesorios.sql` | Accesorios, lotes FIFO, ventas, pagos y garantías |
| 11 | `sql/11_equipos.sql` | Equipos, inventario, ventas, cuotas y pagos |
| 12 | `sql/12_seed_productos.sql` | Catálogo inicial de 180 accesorios |
| 13 | `sql/13_import_accesorios.sql` | Histórico de ventas de accesorios |
| 14 | `sql/14_import_equipos.sql` | Histórico de ventas e inventario de equipos |
| 15 | `sql/15_ajustes_ventas.sql` | Precio de contado, costo FIFO, corrección de lotes y ajuste de stock |
| 16 | `sql/16_mora_whatsapp.sql` | Primer pago, mora automática y contacto para WhatsApp |
| 17 | `sql/17_costos_servicios_cuotas.sql` | Gastos de reparación sin multiplicar y conteo de cuotas |
| 18 | `sql/18_eliminar_editar_ventas.sql` | Editar/eliminar ventas de accesorios y restaurar stock |
| 19 | `sql/19_dia_limite_mora.sql` | Día límite, mora correcta y abonos aplicados a cuotas |
| 20 | `sql/20_financiamiento_automatico.sql` | Cuotas automáticas desde la fecha de la cuota 1 |

Cada archivo abre y cierra su propia transacción: si algo falla, no deja datos a medias.

> Los archivos `13` y `14` contienen nombres y contactos de compradores.
> **No se suben a GitHub** (están en `.gitignore`). Se regeneran con:
> `python3 import/importar_ventas.py`

> El paso 8 es el que deja el POS con el catálogo de servicios y la nueva
> estructura de costos. Es idempotente: si lo vuelves a ejecutar, no duplica nada.

**Totales que debes ver al final:**

- Cobrado histórico: **$177.251.100**
- Saldo por cobrar: **$2.470.000**
- Entregadas: 1.374 · Abiertas: 20 · En reparación: 15

Para regenerar los archivos desde los Excel:

```bash
python3 import/generar_sql.py
```

### Seguridad

- RLS activo en todas las tablas. Solo usuarios con perfil **activo** pueden leer o escribir.
- Cualquier persona que se registre queda **inactiva** hasta que un admin la active.
- Recomendado: **Authentication → Providers → Email → desactiva "Enable sign ups"**.
- El registro público está cerrado por RLS aunque los signups estén abiertos.

---

## 2. Correr localmente

```bash
cd Sirtech-pos
python3 -m http.server 8080
```

Abre `http://localhost:8080`.

> No lo abras con doble clic (`file://`): el login necesita un origen HTTP.

### Cambiar la contraseña

Con la sesión iniciada, usa el botón de la **llave** (arriba a la derecha).
No necesitas correo ni confirmación.

---

## 3. Publicar en GitHub Pages

> ✅ Ya está publicado en <https://sirtechrepair.github.io/Sirtech-pos/>.
> Los pasos siguientes quedan como referencia para reinstalar desde cero.

1. Crea un repositorio **vacío** en GitHub llamado `Sirtech-pos` (sin README ni .gitignore).
2. Conecta y sube:

```bash
cd Sirtech-pos
git remote add origin https://github.com/TU-USUARIO/Sirtech-pos.git
git push -u origin main
```

3. En GitHub: **Settings → Pages**
   - Source: *Deploy from a branch*
   - Branch: `main` · carpeta `/ (root)`
   - Save
4. En 1–2 minutos queda en:

```
https://TU-USUARIO.github.io/Sirtech-pos/
```

> Pages gratis requiere repositorio **público**. La app es pública, los datos no:
> sin sesión no se puede leer nada gracias a RLS.

---

## 4. Cómo funciona el dinero

Cada orden puede tener **varias reparaciones** (servicios) en el mismo equipo.
Cada reparación guarda su propio **cobrado, repuesto, gastos y envío**.
El catálogo de servicios solo guarda nombres: **no tiene precios**.

```
cobrado  = suma de precios cobrados − descuento
repuesto = suma de costos de repuestos de cada reparación
gastos   = suma de gastos de cada reparación (+ gastos generales de órdenes antiguas)
envíos   = suma de envíos de cada reparación + envío adicional
ganancia = cobrado − repuesto − gastos − envíos
debe     = cobrado − suma de abonos
```

- **El envío, los repuestos y los gastos son costos del negocio**, no se suman al total.
- Los **abonos** se registran con fecha, monto y medio de pago. Si el abono es **mixto**, se guarda un registro por cada medio (efectivo, transferencia o tarjeta) para que la caja y los reportes cuadren.
- El **debe nunca se escribe a mano**: lo calcula la base de datos cada vez que agregas una reparación o un abono.
- El **saldo nunca se escribe a mano**: lo calcula la base de datos cada vez que agregas un ítem o un abono.
- Una orden **no se puede marcar como entregada si tiene saldo**. La base de datos lo bloquea.
- Al entregar se fija la fecha y se calcula el vencimiento de la garantía.

---

## 5. Estructura

```
index.html
css/pos.css
js/
  config.js        credenciales, estados, métodos de pago
  ui.js            formato de dinero/fechas, modales, toasts
  db.js            todas las consultas a Supabase
  app.js           sesión, navegación, panel de inicio
  reparaciones.js  tablero, nueva orden, detalle, ítems, abonos
  clientes.js      listado, ficha e historial
  dinero.js        caja y movimientos
  reportes.js      resultados del mes, top equipos y fallas
  accesorios.js    inventario FIFO, ventas, abonos y garantías
  equipos.js       inventario, ventas, cuotas y créditos
sql/               esquema, seguridad, importación y catálogo de servicios
import/            script que genera los SQL desde los Excel
```

### Catálogo de servicios

- Vive en la tabla `servicios` (solo `nombre`, `activo`; **sin precios**).
- Las reparaciones de cada orden se siguen guardando en `orden_items`, igual que antes.
- El desplegable del POS solo permite elegir servicios del catálogo, para evitar
  que vuelvan los nombres duplicados.
- Para agregar un servicio nuevo, ejecuta en Supabase:

```sql
insert into public.servicios (nombre) values ('NOMBRE DEL SERVICIO');
```

---

## 6. Módulos de venta

### Accesorios
- Catálogo de 180 productos con precio de venta y costo de referencia.
- **Ingresos por lote**: producto, cantidad, costo unitario, proveedor y fecha.
- **FIFO**: cada venta consume primero los lotes más antiguos.
- Venta rápida, abonos con fecha/método y saldo.
- **Garantías**: producto defectuoso de una venta o de tienda, reemplazo por
  otro producto del catálogo y descuento automático del inventario.

### Equipos
- Inventario por IMEI (disponible, en reparación, consignación, vendido).
- Ventas de **contado** o **a cuotas**.
- A cuotas: precio de contado, cuota inicial, número de cuotas y **fecha límite de la cuota 1**.
- Interés del **70% anual** proporcional al plazo: 6 meses = 35% sobre el monto financiado.
- El interés se suma al total cobrado y a la ganancia.
- **Cuotas automáticas**: al elegir la fecha de la cuota 1, se generan las demás un mes después y se muestra la vista previa.
- El saldo financiado con intereses se reparte en cuotas iguales; la última ajusta la diferencia de redondeo.
- Generación automática de cuotas y registro de pagos con fecha y método.
- Pestañas **Sneider**, **Sociedad** y **Todos** con la misma lógica.
- Filtros por estado: pagada, por pagar, en mora, en reparación, garantía y disponible.
- **Mora correcta**: solo aparece si una cuota venció y no tiene el pago registrado.
- Los **abonos generales** cubren automáticamente las cuotas más antiguas.
- **Historial por cuota**: cuota pagada, valor, fecha exacta y cumplimiento (al día/en mora).
- Botón de **WhatsApp** para abrir el chat del cliente con el mensaje de mora.
- El saldo y el estado de pago se calculan solos.
- Cualquier venta o cuota se puede corregir; los pagos se pueden eliminar y el saldo se recalcula.

### Correcciones de inventario
- En accesorios se puede corregir un lote ya ingresado (cantidad, costo, fecha o proveedor).
- También se puede ajustar el stock actual: si sube se crea un lote de ajuste; si baja se consumen los lotes más antiguos.

### Reparaciones
- El campo **Gastos** de cada línea es el total del trabajo: no se multiplica por la cantidad.
- Botón **Nuevo servicio** para crear servicios que no estén en el catálogo.
- Las órdenes se pueden **eliminar definitivamente** (con doble confirmación).

### Cuotas históricas
- En cualquier venta de equipo se pueden **agregar cuotas** ya pagadas o pendientes.
- Cada cuota se puede editar o eliminar.
- El número de cuotas de la venta se actualiza solo.
- Los pagos de cuotas eliminadas quedan como abonos generales.

### Edición y eliminación general
- Ventas de accesorios: editar cabecera o **eliminar** la venta; al eliminarla se devuelve al stock lo que había consumido.
- Ventas de equipos: editar o **eliminar** la venta desde Ventas o Créditos.
- Equipos del inventario: editar o eliminar.
- Productos de accesorios: editar o eliminar (si no tienen garantías).
- Garantías: eliminar el registro.
- Clientes: editar o eliminar si no tienen órdenes registradas.

### Pendiente (siguiente fase)

- Fotos y firma al recibir el equipo.
- Impresión de recibos.
- Reportes consolidados de accesorios/equipos dentro de la página de Reportes.
