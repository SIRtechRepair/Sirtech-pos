#!/usr/bin/env python3
"""
Genera los archivos SQL de importación de reparaciones históricas
a partir de las dos hojas del Google Sheets.

Uso:
    python3 import/generar_sql.py

Salida (en sql/):
    03_import_clientes.sql
    04_import_ordenes.sql
    05_import_items.sql
    06_import_pagos_estados.sql
"""

import csv
import io
import os
import re
import unicodedata
import urllib.request

DOC = "13gpyT5zu6b9msNCoC-a9r7UsH9uedLNOuLaG4XXcMy0"
GIDS = ["0", "1919512910"]
BASE = f"https://docs.google.com/spreadsheets/d/{DOC}/export?format=csv&gid="
DEST = os.path.join(os.path.dirname(__file__), "..", "sql")
LOTE = 150


# ---------------------------------------------------------------- utilidades
def descargar(gid):
    with urllib.request.urlopen(BASE + gid, timeout=60) as r:
        return r.read().decode("utf-8-sig")


def norm(v):
    s = unicodedata.normalize("NFD", str(v or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def tel_norm(v):
    d = re.sub(r"\D", "", str(v or ""))
    return d[-10:] if len(d) > 10 else d


def num(v):
    if v is None:
        return 0.0
    s = re.sub(r"[^0-9.,-]", "", str(v))
    if not s:
        return 0.0
    negativo = s.startswith("-")
    s = s.replace("-", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(".", "").replace(",", "")
    try:
        n = float(s)
    except ValueError:
        n = 0.0
    return -n if negativo else n


def fecha(v):
    m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", str(v or ""))
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{y:04d}-{mo:02d}-{d:02d}"


def q(v):
    if v is None:
        return "NULL"
    s = str(v).replace("\x00", "").replace("'", "''")
    return "'" + s + "'"


def qn(v):
    return "NULL" if v is None else str(v)


def limpiar(v):
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s or None


# ---------------------------------------------------------------- lectura
filas = []
for gid in GIDS:
    texto = descargar(gid)
    lector = csv.reader(io.StringIO(texto))
    encabezado = next(lector)
    for r in lector:
        if len(r) < 14:
            r = r + [""] * (14 - len(r))
        estado = (r[13] or "").strip().upper()
        if not estado:
            continue
        f = fecha(r[0])
        if not f:
            continue
        filas.append({
            "fecha": f,
            "equipo": limpiar(r[1]) or "Equipo",
            "descripcion": limpiar(r[2]),
            "cliente": limpiar(r[3]),
            "telefono": limpiar(r[4]),
            "total": round(num(r[5]), 2),
            "repuesto": round(num(r[6]), 2),
            "envio": round(num(r[7]), 2),
            "gastos": round(num(r[8]), 2),
            "abonos": round(num(r[10]), 2),
            "notas": limpiar(r[12]),
            "estado": estado,
        })

filas.sort(key=lambda x: (x["fecha"], x["equipo"]))

# ---------------------------------------------------------------- clientes
clientes = {}
mapa_clientes = {}

for f in filas:
    if not f["cliente"]:
        continue
    clave = (norm(f["cliente"]), tel_norm(f["telefono"]))
    if clave not in mapa_clientes:
        mapa_clientes[clave] = len(clientes) + 1
        clientes[mapa_clientes[clave]] = {
            "nombre": f["cliente"],
            "telefono": f["telefono"],
            "telefono_norm": tel_norm(f["telefono"]) or None,
        }

# ---------------------------------------------------------------- órdenes
ordenes = []
items = []
pagos = []
ids_entregadas = []
ids_abiertas = []
ids_reparando = []

for i, f in enumerate(filas, start=1):
    clave = (norm(f["cliente"]), tel_norm(f["telefono"])) if f["cliente"] else None
    cliente_id = mapa_clientes.get(clave) if clave else None

    total = f["total"]
    abonos = f["abonos"]
    saldo = round(total - abonos, 2)

    # estado destino
    if f["estado"] == "EN REPARACION":
        estado = "reparando"
        ids_reparando.append(i)
    elif f["estado"] == "COMPLETADO" and saldo <= 0.5:
        estado = "listo"
        ids_entregadas.append(i)
    else:
        estado = "listo"
        ids_abiertas.append(i)

    fecha_entrega = f["fecha"] + " 12:00:00-05" if f["estado"] == "COMPLETADO" else None

    nota = "Importado del Excel"
    if f["notas"]:
        nota += " · " + f["notas"]

    ordenes.append({
        "id": i,
        "numero": i,
        "cliente_id": cliente_id,
        "equipo": f["equipo"],
        "falla": f["descripcion"],
        "estado": estado,
        "envio": f["envio"],
        "gastos": f["gastos"],
        "fecha": f["fecha"] + " 12:00:00-05",
        "fecha_entrega": fecha_entrega,
        "notas": nota,
    })

    if total > 0:
        items.append((i, "servicio", f["descripcion"] or "Servicio", 1, 0, total))
    if f["repuesto"] > 0:
        items.append((i, "repuesto", "Repuesto (histórico)", 1, f["repuesto"], 0))

    if abonos > 0:
        pagos.append((i, abonos, f["fecha"] + " 12:00:00-05"))

# ---------------------------------------------------------------- escritura
def escribir(nombre, lineas):
    ruta = os.path.join(DEST, nombre)
    with open(ruta, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lineas) + "\n")
    return ruta, len("\n".join(lineas))


def bloques(cabecera, filas_sql, cierre):
    salida = [cabecera]
    for i in range(0, len(filas_sql), LOTE):
        salida.append(cierre[0])
        salida.append(",\n".join(filas_sql[i:i + LOTE]) + ";")
    return salida


# --- clientes
lineas = ["-- SIR·TECH POS · Importación de clientes históricos",
          "-- Ejecutar después de 02_seguridad.sql",
          "begin;", ""]
vals = [
    f"({cid},{q(c['nombre'])},{q(c['telefono'])},{q(c['telefono_norm'])},true)"
    for cid, c in clientes.items()
]
for i in range(0, len(vals), LOTE):
    lineas.append("insert into public.clientes (id,nombre,telefono,telefono_norm,historico) values")
    lineas.append(",\n".join(vals[i:i + LOTE]) + ";")
lineas += [
    "",
    "select setval('public.clientes_id_seq', (select coalesce(max(id),1) from public.clientes));",
    "commit;",
    "",
    f"-- {len(clientes)} clientes importados",
]
escribir("03_import_clientes.sql", lineas)

# --- órdenes
lineas = ["-- SIR·TECH POS · Importación de órdenes históricas",
          "-- Ejecutar después de 03_import_clientes.sql",
          "begin;", ""]
vals = []
for o in ordenes:
    vals.append(
        f"({o['id']},{o['numero']},{qn(o['cliente_id'])},{q(o['equipo'])},{q(o['falla'])},"
        f"{q(o['estado'])},{o['envio']},{o['gastos']},"
        f"'{o['fecha']}',{q(o['fecha_entrega'])},{q(o['notas'])},true)"
    )
for i in range(0, len(vals), LOTE):
    lineas.append("insert into public.ordenes (id,numero,cliente_id,equipo,falla,estado,envio,gastos,fecha_recibido,fecha_entregado,notas,historico) values")
    lineas.append(",\n".join(vals[i:i + LOTE]) + ";")
lineas += [
    "",
    "select setval('public.ordenes_id_seq', (select coalesce(max(id),1) from public.ordenes));",
    "select setval('public.ordenes_numero_seq', (select coalesce(max(numero),1) from public.ordenes));",
    "commit;",
    "",
    f"-- {len(ordenes)} órdenes importadas",
]
escribir("04_import_ordenes.sql", lineas)

# --- ítems
lineas = ["-- SIR·TECH POS · Importación de ítems históricos",
          "-- Ejecutar después de 04_import_ordenes.sql",
          "begin;", ""]
vals = [
    f"({oid},{q(tipo)},{q(desc)},{cant},{costo},{precio})"
    for (oid, tipo, desc, cant, costo, precio) in items
]
for i in range(0, len(vals), LOTE):
    lineas.append("insert into public.orden_items (orden_id,tipo,descripcion,cantidad,costo_unitario,precio_unitario) values")
    lineas.append(",\n".join(vals[i:i + LOTE]) + ";")
lineas += [
    "",
    "select setval('public.orden_items_id_seq', (select coalesce(max(id),1) from public.orden_items));",
    "commit;",
    "",
    f"-- {len(items)} ítems importados",
]
escribir("05_import_items.sql", lineas)

# --- pagos + estados finales
lineas = ["-- SIR·TECH POS · Importación de abonos históricos y estados finales",
          "-- Ejecutar después de 05_import_items.sql",
          "begin;", ""]
vals = [
    f"({oid},{monto},'otro','Abono histórico importado','{fecha}',true)"
    for (oid, monto, fecha) in pagos
]
for i in range(0, len(vals), LOTE):
    lineas.append("insert into public.pagos (orden_id,monto,metodo,nota,fecha,historico) values")
    lineas.append(",\n".join(vals[i:i + LOTE]) + ";")
lineas += [
    "",
    "select setval('public.pagos_id_seq', (select coalesce(max(id),1) from public.pagos));",
    "",
]
if ids_entregadas:
    lineas.append("-- Marcar como entregadas las que quedaron pagadas")
    lineas.append("update public.ordenes set estado = 'entregado' where id in (")
    for i in range(0, len(ids_entregadas), 300):
        lineas.append(",".join(str(x) for x in ids_entregadas[i:i + 300]) + ("," if i + 300 < len(ids_entregadas) else ""))
    lineas.append(");")
    lineas.append("")
lineas += ["commit;", "", f"-- {len(pagos)} abonos · {len(ids_entregadas)} entregadas · {len(ids_abiertas)} abiertas · {len(ids_reparando)} en reparación"]
escribir("06_import_pagos_estados.sql", lineas)

# ---------------------------------------------------------------- resumen
total_cobrado = sum(f["total"] for f in filas)
total_abonos = sum(f["abonos"] for f in filas)
print(f"Registros leídos : {len(filas)}")
print(f"Clientes únicos  : {len(clientes)}")
print(f"Órdenes          : {len(ordenes)}")
print(f"Ítems            : {len(items)}")
print(f"Abonos           : {len(pagos)}")
print(f"Cobrado total    : ${total_cobrado:,.0f}")
print(f"Abonado total    : ${total_abonos:,.0f}")
print(f"Saldo pendiente  : ${total_cobrado - total_abonos:,.0f}")
print(f"  entregadas     : {len(ids_entregadas)}")
print(f"  abiertas       : {len(ids_abiertas)}")
print(f"  en reparación  : {len(ids_reparando)}")
