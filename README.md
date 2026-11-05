# SIR·TECH POS

Sistema de control para el taller: **reparaciones**, clientes, cartera, caja y reportes.
HTML + JavaScript puro, sin frameworks ni build. Base de datos en Supabase.

## Estado actual (5 nov 2026)

- ✅ Esquema y seguridad aplicados en Supabase
- ✅ Histórico importado: 1.409 órdenes, 915 clientes, 2.129 ítems, 1.382 abonos
- ✅ Usuario administrador activo
- ⬜ Falta publicar en GitHub Pages (sección 3)

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

Cada archivo abre y cierra su propia transacción: si algo falla, no deja datos a medias.

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

---

## 3. Publicar en GitHub Pages

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

Regla clave, tomada de tus Excel:

```
total de la orden   = suma de ítems (precio × cantidad) − descuento
costo de repuestos  = suma de ítems tipo "repuesto" (costo × cantidad)
margen              = total − costo_repuestos − envío − gastos
saldo               = total − suma de abonos
```

- **El envío y los gastos son costos del negocio**, no se suman al total (igual que en tu hoja).
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
sql/               esquema, seguridad e importación
import/            script que genera los SQL desde los Excel
```

---

## 6. Pendiente (siguiente fase)

- **Accesorios**: catálogo con stock, costo promedio y venta rápida (el catálogo ya existe en el Excel de accesorios).
- **Equipos**: inventario por IMEI, venta con inicial y cuotas, consignación.
- Fotos y firma al recibir el equipo (hoy es solo texto, por decisión de operación).
- Impresión de recibos (hoy se comparte por WhatsApp).
