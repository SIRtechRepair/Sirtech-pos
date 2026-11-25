# SIR·TECH POS

Sistema de control para el taller: **reparaciones**, clientes, cartera, caja y reportes.
HTML + JavaScript puro, sin frameworks ni build. La base de datos vive en Supabase.

> **Este repositorio no contiene datos reales del negocio.**
> Clientes, ventas, costos, proveedores y movimientos viven únicamente en Supabase.
> Los archivos de importación y respaldo se guardan fuera del repositorio, en una
> carpeta privada.

## Estado actual

- ✅ Esquema y seguridad aplicados en Supabase
- ✅ Catálogo de servicios normalizado y costos por reparación (`sql/08_servicios.sql`)
- ✅ Módulos de accesorios (FIFO) y equipos (cuotas/créditos) — requiere `sql/10` a `sql/11`
- ✅ Inventario ampliado (IMEI 1/2, S/N, proveedor y gastos) y comisión automática — requiere `sql/21`
- ✅ Correcciones de auditoría: fechas, cantidades decimales, caja consolidada y topes de abonos — requiere `sql/22`
- ✅ Sesión con caducidad de 24 horas por dispositivo y cierre de sesión local (sin cerrar los demás equipos)
- ✅ Endurecimiento de `costo_fifo` para que solo el staff activo consulte costos — requiere `sql/23_endurecimiento.sql`
- ✅ Publicado en GitHub Pages: <https://sirtechrepair.github.io/Sirtech-pos/>

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
| 3 | `sql/02_seguridad.sql` | Activa RLS y da rol **admin**. Cambia el correo de ejemplo por el tuyo. |
| 4 | `sql/08_servicios.sql` | Catálogo de servicios, normalización y costos por reparación |
| 5 | `sql/09_quitar_recibido.sql` | Elimina el estado "recibido" del flujo |
| 6 | `sql/10_accesorios.sql` | Accesorios, lotes FIFO, ventas, pagos y garantías |
| 7 | `sql/11_equipos.sql` | Equipos, inventario, ventas, cuotas y pagos |
| 8 | `sql/15_ajustes_ventas.sql` | Precio de contado, costo FIFO, corrección de lotes y ajuste de stock |
| 9 | `sql/16_mora_whatsapp.sql` | Primer pago, mora automática y contacto para WhatsApp |
| 10 | `sql/17_costos_servicios_cuotas.sql` | Gastos de reparación sin multiplicar y conteo de cuotas |
| 11 | `sql/18_eliminar_editar_ventas.sql` | Editar/eliminar ventas de accesorios y restaurar stock |
| 12 | `sql/19_dia_limite_mora.sql` | Día límite, mora correcta y abonos aplicados a cuotas |
| 13 | `sql/20_financiamiento_automatico.sql` | Cuotas automáticas desde la fecha de la cuota 1 |
| 14 | `sql/21_equipos_inventario_comision.sql` | IMEI 1/2, serial, proveedor, gastos por equipo y comisión automática |
| 15 | `sql/22_correcciones_auditoria.sql` | Topes de abonos en base de datos e índices para caja consolidada |
| 16 | `sql/23_endurecimiento.sql` | Restringe `costo_fifo` y funciones de apoyo al staff activo |

Cada archivo abre y cierra su propia transacción: si algo falla, no deja datos a medias.

### Datos históricos y catálogo inicial

Los archivos con datos reales **no están en este repositorio**:

- `sql/03` a `06`: clientes, órdenes, ítems y pagos históricos.
- `sql/12`: catálogo inicial de accesorios con costos, precios y proveedores.
- `sql/13` y `14`: ventas históricas de accesorios y equipos.
- `import/`: scripts que generaban esos archivos desde las hojas originales.

Se guardan en una carpeta privada fuera del repo. Para una reinstalación desde cero,
restáuralos desde ese respaldo y ejecútalos entre `sql/02` y `sql/08`, en el orden
indicado en la carpeta privada. **Nunca los subas a GitHub.**

### Seguridad

- RLS activo en todas las tablas. Solo usuarios con perfil **activo** pueden leer o escribir.
- Cualquier persona que se registre queda **inactiva** hasta que un admin la active.
- Recomendado: **Authentication → Providers → Email → desactiva "Allow new users to sign up"**.
- `sql/23_endurecimiento.sql` limita `costo_fifo` al staff activo.
- La sesión dura **24 horas desde el login** en cada dispositivo, sin renovarse con la actividad.
- “Salir” cierra solo el dispositivo actual; en **Mi cuenta** está la opción de cerrar los demás.

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
- Los **abonos** se registran con fecha, monto y medio de pago. Si el abono es **mixto**, se guarda un registro por cada medio para que la caja y los reportes cuadren.
- El **debe** y el **saldo** los calcula la base de datos automáticamente.
- Una orden **no se puede marcar como entregada si tiene saldo**.
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
sql/               esquema, seguridad y migraciones (sin datos reales)
```

### Catálogo de servicios

- Vive en la tabla `servicios` (solo `nombre`, `activo`; **sin precios**).
- Las reparaciones de cada orden se guardan en `orden_items`.
- El desplegable del POS solo permite elegir servicios del catálogo.
- Para agregar un servicio nuevo, ejecuta en Supabase:

```sql
insert into public.servicios (nombre) values ('NOMBRE DEL SERVICIO');
```

---

## 6. Módulos de venta

### Accesorios
- Catálogo con precio de venta y costo de referencia (los datos viven en Supabase).
- **Ingresos por lote**: producto, cantidad, costo unitario, proveedor y fecha.
- **FIFO**: cada venta consume primero los lotes más antiguos.
- Venta rápida, abonos con fecha/método y saldo.
- **Garantías**: producto defectuoso de una venta o de tienda, reemplazo por otro producto del catálogo y descuento automático del inventario.

### Equipos
- Inventario por IMEI (disponible, en reparación, consignación, vendido).
- Ventas de **contado** o **a cuotas**.
- A cuotas: precio de contado, cuota inicial, número de cuotas y **fecha límite de la cuota 1**.
- Interés proporcional al plazo, sumado al total cobrado y a la ganancia.
- **Cuotas automáticas**: al elegir la fecha de la cuota 1, se generan las demás un mes después y se muestra la vista previa.
- El saldo financiado se reparte en cuotas iguales; la última ajusta la diferencia de redondeo.
- Generación automática de cuotas y registro de pagos con fecha y método.
- Filtros por origen, propietario y estado: pagada, por pagar, en mora, en reparación, garantía y disponible.
- **Mora correcta**: solo aparece si una cuota venció y no tiene el pago registrado.
- Los **abonos generales** cubren automáticamente las cuotas más antiguas.
- **Historial por cuota**: cuota pagada, valor, fecha exacta y cumplimiento (al día/en mora).
- Botón de **WhatsApp** para abrir el chat del cliente con el mensaje de mora.
- El saldo y el estado de pago se calculan solos.
- **Inventario ampliado**: IMEI 1 obligatorio, IMEI 2, serial/S/N, proveedor y contacto del proveedor.
- **Gastos del equipo**: lista dinámica de descripción y valor. El costo total es `costo + gastos` y se usa al vender.
- **Comisión automática** según origen y propietario; en los demás casos la comisión es 0.

### Modales
- Las modales **no se cierran** al hacer clic fuera, al arrastrar hacia el fondo ni con `Escape`.
- Solo se cierran con el botón **X**, **Cancelar** o **Cerrar**.

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
