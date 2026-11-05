#!/usr/bin/env python3
"""
Genera los SQL de catálogo e importación de ventas de accesorios y equipos
desde las hojas de Google Sheets.

Salida:
  sql/12_seed_productos.sql       catálogo de accesorios (sin datos personales)
  sql/13_import_accesorios.sql    ventas históricas de accesorios (datos personales)
  sql/14_import_equipos.sql       ventas e inventario histórico de equipos (datos personales)

Los archivos 13 y 14 están en .gitignore.
"""

import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

DOC_ACC = "1ePVsNJrsi8XNToOvXiJ8BXTlXcLxeSAc1K3LwP5uR8I"
DOC_EQ = "1V3UdLb1YeV_ZHfArLiM6Lu6Z9RipNCFPxHDbZ4H2xe8"
BASE = "https://docs.google.com/spreadsheets/d/{doc}/gviz/tq?tqx=out:csv&sheet={sheet}"
DEST = os.path.join(os.path.dirname(__file__), "..", "sql")


def descargar(doc, sheet):
    url = BASE.format(doc=doc, sheet=urllib.parse.quote(sheet))
    with urllib.request.urlopen(url, timeout=90) as r:
        return r.read().decode("utf-8-sig")


def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).upper()
    return re.sub(r"\s+", " ", s).strip()


def money(v):
    s = str(v or "").replace("$", "").replace(" ", "")
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        p = s.split(",")
        s = s.replace(".", "").replace(",", ".") if len(p[-1]) in (1, 2) else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def fecha(v):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(v or "").strip())
    if not m:
        return None
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"


def q(v):
    return "'" + str(v if v is not None else "").replace("'", "''") + "'"


def categoria(nombre):
    n = norm(nombre)
    if "CABLE" in n:
        return "Cable"
    if "CARGADOR" in n or "CABEZOTE" in n or "ADAPTADOR" in n:
        return "Cargador"
    if "VIDRIO" in n or "MICA" in n or "TEMPLADO" in n:
        return "Vidrio"
    if "FORRO" in n or "CARCASA" in n or "CASE" in n:
        return "Forro"
    if "AIRPOD" in n or "AIPOD" in n or "AUDIFONO" in n or "AURICULAR" in n:
        return "Audífonos"
    if "BATERIA" in n or "BATERÍA" in n:
        return "Batería"
    if "RELOJ" in n or "SMARTWATCH" in n:
        return "Reloj"
    if "PARLANTE" in n or "ALTAVOZ" in n:
        return "Parlante"
    if "MEMORIA" in n or "USB" in n or "SSD" in n:
        return "Memoria"
    return "General"


def leer_accesorios():
    ventas = list(csv.reader(io.StringIO(descargar(DOC_ACC, "2026"))))
    inv = list(csv.reader(io.StringIO(descargar(DOC_ACC, "INVENTARIO"))))
    ventas = [r for r in ventas[1:] if len(r) > 13 and r[4].strip()]
    inv = [r for r in inv[1:] if r and r[0].strip()]

    def fila_venta(r):
        return {
            "fecha": fecha(r[3]),
            "producto": r[4].strip(),
            "proveedor": r[5].strip(),
            "comprador": r[6].strip(),
            "total": money(r[7]),
            "costo": money(r[8]),
            "envio": money(r[9]),
            "abonos": money(r[11]),
            "debe": money(r[12]),
            "estado": r[13].strip().upper(),
        }

    return [fila_venta(r) for r in ventas], [
        {"producto": r[0].strip(), "costo": money(r[1]), "precio": money(r[2]), "vendido": money(r[3])}
        for r in inv
    ]


def leer_equipos():
    def filas(doc, sheet):
        rows = list(csv.reader(io.StringIO(descargar(doc, sheet))))
        return rows[0], [r for r in rows[1:] if len(r) > 1 and r[1].strip()]

    hs, sneider = filas(DOC_EQ, "SNEIDER")
    hc, sociedad = filas(DOC_EQ, "SOCIEDAD")

    def f_sneider(r):
        return {
            "hoja": "SNEIDER",
            "fecha": fecha(r[0]),
            "equipo": r[1].strip(),
            "vendedor": r[2].strip(),
            "cpu": r[3].strip(),
            "ram": r[4].strip(),
            "almacenamiento": r[5].strip(),
            "detalles": r[6].strip(),
            "comprador": r[7].strip(),
            "contacto": r[8].strip(),
            "total": money(r[9]),
            "costo": money(r[10]),
            "comision": 0.0,
            "envio": money(r[11]),
            "gastos": money(r[12]),
            "inicial": 0.0,
            "ncuotas": 0,
            "valor_cuota": 0.0,
            "cuotas": [],
            "abonos": money(r[14]),
            "debe": money(r[15]),
            "notas": r[16].strip(),
            "estado": r[17].strip().upper(),
            "dequien": "",
            "agregados": [],
        }

    def f_sociedad(r):
        cuotas = [money(r[i]) for i in range(17, 29)] if len(r) > 28 else []
        rep = r[35].strip() if len(r) > 35 else ""
        pre = money(r[36]) if len(r) > 36 else 0.0
        return {
            "hoja": "SOCIEDAD",
            "fecha": fecha(r[0]),
            "equipo": r[1].strip(),
            "vendedor": r[2].strip(),
            "cpu": "",
            "ram": r[3].strip(),
            "almacenamiento": r[4].strip(),
            "detalles": "",
            "comprador": r[6].strip(),
            "contacto": r[7].strip(),
            "total": money(r[8]),
            "costo": money(r[9]),
            "comision": money(r[10]),
            "envio": money(r[11]),
            "gastos": money(r[12]),
            "inicial": money(r[14]),
            "ncuotas": int(money(r[15])),
            "valor_cuota": money(r[16]),
            "cuotas": cuotas,
            "abonos": money(r[29]),
            "debe": money(r[30]),
            "notas": r[31].strip(),
            "estado": r[32].strip().upper(),
            "dequien": r[5].strip(),
            "agregados": [{"descripcion": rep, "precio": pre}] if rep else [],
        }

    return [f_sneider(r) for r in sneider], [f_sociedad(r) for r in sociedad]


def catalogo(ventas, inv):
    prods = {}
    for i in inv:
        k = norm(i["producto"])
        prods[k] = {
            "nombre": i["producto"],
            "categoria": categoria(i["producto"]),
            "precio": i["precio"],
            "costo": i["costo"],
            "proveedor": "",
            "fecha": "1900-01-01",
        }
    for v in ventas:
        k = norm(v["producto"])
        p = prods.setdefault(k, {
            "nombre": v["producto"],
            "categoria": categoria(v["producto"]),
            "precio": 0.0,
            "costo": 0.0,
            "proveedor": "",
            "fecha": "1900-01-01",
        })
        if not p["proveedor"] and v["proveedor"]:
            p["proveedor"] = v["proveedor"]
        if v["fecha"] and v["fecha"] >= p["fecha"]:
            p["fecha"] = v["fecha"]
            if v["total"] > 0:
                p["precio"] = v["total"]
            if v["costo"] > 0:
                p["costo"] = v["costo"]
    return prods


def escribir_seed(prods):
    lines = [
        "-- ============================================================",
        "-- SIR·TECH POS · 12 · Catálogo inicial de accesorios",
        "-- Generado desde las hojas 2026 e INVENTARIO.",
        "-- No contiene datos personales.",
        "-- ============================================================",
        "",
        "insert into public.productos",
        "  (nombre, categoria, costo, costo_referencia, precio, stock, proveedor, activo)",
        "select v.nombre, v.categoria, v.costo, v.costo, v.precio, 0, v.proveedor, true",
        "from (values",
    ]
    items = sorted(prods.values(), key=lambda p: norm(p["nombre"]))
    for i, p in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(
            "  (" + q(p["nombre"]) + ", " + q(p["categoria"]) + ", "
            + str(round(p["costo"], 2)) + ", " + str(round(p["precio"], 2)) + ", "
            + q(p["proveedor"] or None) + ")" + comma
        )
    lines += [
        ") as v(nombre, categoria, costo, precio, proveedor)",
        "where not exists (",
        "  select 1 from public.productos p",
        "   where public.norm_producto(p.nombre) = public.norm_producto(v.nombre)",
        ");",
        "",
        "select count(*) as productos_catalogo from public.productos;",
        "",
    ]
    open(os.path.join(DEST, "12_seed_productos.sql"), "w", encoding="utf-8").write("\n".join(lines))
    return len(items)


def escribir_accesorios(ventas):
    lines = [
        "-- ============================================================",
        "-- SIR·TECH POS · 13 · Importación histórica de accesorios",
        "-- ⚠️ Contiene nombres de compradores. No subir a GitHub.",
        "-- Generado desde la hoja 2026.",
        "-- ============================================================",
        "",
        "create table if not exists public._imp_acc (",
        "  fecha date, producto text, proveedor text, comprador text,",
        "  total numeric(12,2), costo numeric(12,2), envio numeric(12,2),",
        "  abonos numeric(12,2), debe numeric(12,2), estado text",
        ");",
        "truncate public._imp_acc;",
        "insert into public._imp_acc values",
    ]
    for i, v in enumerate(ventas):
        comma = "," if i < len(ventas) - 1 else ""
        lines.append(
            "  (" + q(v["fecha"]) + ", " + q(v["producto"]) + ", " + q(v["proveedor"]) + ", "
            + q(v["comprador"]) + ", " + str(round(v["total"], 2)) + ", "
            + str(round(v["costo"], 2)) + ", " + str(round(v["envio"], 2)) + ", "
            + str(round(v["abonos"], 2)) + ", " + str(round(v["debe"], 2)) + ", "
            + q(v["estado"]) + ")" + comma
        )
    lines += [
        ";",
        "",
        "do $$",
        "declare",
        "  r record; v_venta bigint; v_prod bigint;",
        "begin",
        "  if exists (select 1 from public.migraciones where clave = 'import_accesorios_2026') then",
        "    return;",
        "  end if;",
        "",
        "  for r in select * from public._imp_acc loop",
        "    select id into v_prod from public.productos",
        "     where public.norm_producto(nombre) = public.norm_producto(r.producto) limit 1;",
        "",
        "    if r.estado = 'GARANTIA' then",
        "      if v_prod is not null then",
        "        insert into public.accesorio_garantias",
        "          (fecha, producto_id, cantidad, origen, motivo, producto_reemplazo_id,",
        "           cantidad_reemplazo, costo_defectuoso, costo_reemplazo, estado, notas)",
        "        values (r.fecha::timestamptz, v_prod, 1, 'post_venta', 'Garantía histórica',",
        "                v_prod, 1, 0, r.costo, 'reemplazada', 'Importado hoja 2026');",
        "      end if;",
        "    else",
        "      if v_prod is null then",
        "        insert into public.productos (nombre, categoria, costo, costo_referencia, precio, stock, activo)",
        "        values (r.producto, 'General', r.costo, r.costo, r.total, 0, true)",
        "        returning id into v_prod;",
        "      end if;",
        "",
        "      insert into public.accesorio_ventas",
        "        (fecha, cliente_nombre, envio, historico, notas)",
        "      values (r.fecha::timestamptz, r.comprador, r.envio, true, 'Importado hoja 2026')",
        "      returning id into v_venta;",
        "",
        "      insert into public.accesorio_venta_items",
        "        (venta_id, producto_id, descripcion, cantidad, precio_unitario,",
        "         costo_unitario, costo_total, historico)",
        "      values (v_venta, v_prod, r.producto, 1, r.total, r.costo, r.costo, true);",
        "",
        "      if r.abonos > 0 then",
        "        insert into public.accesorio_pagos",
        "          (venta_id, fecha, monto, metodo, nota)",
        "        values (v_venta, r.fecha::timestamptz, r.abonos, 'efectivo', 'Abono histórico');",
        "      end if;",
        "    end if;",
        "  end loop;",
        "",
        "  insert into public.migraciones (clave) values ('import_accesorios_2026')",
        "  on conflict (clave) do nothing;",
        "end $$;",
        "",
        "drop table if exists public._imp_acc;",
        "",
        "select count(*) as ventas_accesorios from public.accesorio_ventas where historico;",
        "select count(*) as garantias_accesorios from public.accesorio_garantias;",
        "",
    ]
    open(os.path.join(DEST, "13_import_accesorios.sql"), "w", encoding="utf-8").write("\n".join(lines))
    return len(ventas)


def escribir_equipos(sneider, sociedad):
    filas = sneider + sociedad
    lines = [
        "-- ============================================================",
        "-- SIR·TECH POS · 14 · Importación histórica de equipos",
        "-- ⚠️ Contiene nombres y contactos de compradores. No subir a GitHub.",
        "-- Generado desde las hojas SNEIDER y SOCIEDAD.",
        "-- ============================================================",
        "",
        "create table if not exists public._imp_eq (",
        "  hoja text, fecha date, equipo text, vendedor text, cpu text, ram text,",
        "  almacenamiento text, detalles text, comprador text, contacto text,",
        "  total numeric(12,2), costo numeric(12,2), comision numeric(12,2),",
        "  envio numeric(12,2), gastos numeric(12,2), inicial numeric(12,2),",
        "  ncuotas integer, valor_cuota numeric(12,2), cuotas jsonb,",
        "  abonos numeric(12,2), debe numeric(12,2), notas text, estado text,",
        "  dequien text, agregados jsonb",
        ");",
        "truncate public._imp_eq;",
        "insert into public._imp_eq values",
    ]
    for i, v in enumerate(filas):
        comma = "," if i < len(filas) - 1 else ""
        cuotas = json.dumps([round(x, 2) for x in v["cuotas"]])
        agregados = json.dumps(v["agregados"], ensure_ascii=False)
        lines.append(
            "  (" + ", ".join([
                q(v["hoja"]), q(v["fecha"]), q(v["equipo"]), q(v["vendedor"]),
                q(v["cpu"]), q(v["ram"]), q(v["almacenamiento"]), q(v["detalles"]),
                q(v["comprador"]), q(v["contacto"]),
                str(round(v["total"], 2)), str(round(v["costo"], 2)),
                str(round(v["comision"], 2)), str(round(v["envio"], 2)),
                str(round(v["gastos"], 2)), str(round(v["inicial"], 2)),
                str(v["ncuotas"]), str(round(v["valor_cuota"], 2)),
                q(cuotas) + "::jsonb", str(round(v["abonos"], 2)),
                str(round(v["debe"], 2)), q(v["notas"]), q(v["estado"]),
                q(v["dequien"]), q(agregados) + "::jsonb",
            ]) + ")" + comma
        )
    lines += [
        ";",
        "",
        "do $$",
        "declare",
        "  r record; v_venta bigint; v_cuota bigint; v_num int; v_pago numeric;",
        "  v_monto numeric; v_idx int; v_ag jsonb; v_acum numeric;",
        "begin",
        "  if exists (select 1 from public.migraciones where clave = 'import_equipos_2026') then",
        "    return;",
        "  end if;",
        "",
        "  for r in select * from public._imp_eq loop",
        "    if r.estado in ('DISPONIBLE','EN REPARACION')",
        "       and trim(coalesce(r.comprador,'')) = ''",
        "       and r.abonos <= 0 and r.inicial <= 0 then",
        "      insert into public.equipos_unidades",
        "        (modelo, cpu, ram, almacenamiento, costo, precio_sugerido, estado,",
        "         origen, de_quien_es, notas, historico)",
        "      values (r.equipo, nullif(r.cpu,''), nullif(r.ram,''), nullif(r.almacenamiento,''),",
        "              r.costo, r.total,",
        "              case when r.estado = 'DISPONIBLE' then 'disponible' else 'en_reparacion' end,",
        "              r.hoja, nullif(r.dequien,''), nullif(r.notas,''), true);",
        "    else",
        "      insert into public.equipo_ventas",
        "        (fecha, equipo, cpu, ram, almacenamiento, detalles, vendedor, comprador,",
        "         contacto, total, costo, comision, envio, gastos, inicial, numero_cuotas,",
        "         valor_cuota, estado_equipo, origen, de_quien_es, notas, historico, estado_pago)",
        "      values (r.fecha::timestamptz, r.equipo, nullif(r.cpu,''), nullif(r.ram,''),",
        "              nullif(r.almacenamiento,''), nullif(r.detalles,''), nullif(r.vendedor,''),",
        "              nullif(r.comprador,''), nullif(r.contacto,''), r.total, r.costo,",
        "              r.comision, r.envio, r.gastos,",
        "              case when r.hoja = 'SNEIDER' then r.abonos else r.inicial end,",
        "              case when r.hoja = 'SNEIDER' then 0 else r.ncuotas end,",
        "              case when r.hoja = 'SNEIDER' then 0 else r.valor_cuota end,",
        "              case r.estado when 'EN REPARACION' then 'en_reparacion' when 'DISPONIBLE' then 'disponible' else 'vendido' end,",
        "              r.hoja, nullif(r.dequien,''), nullif(r.notas,''), true,",
        "              case when r.debe > 0.5 then 'por_pagar' else 'pagada' end)",
        "      returning id into v_venta;",
        "",
        "      v_pago := case when r.hoja = 'SNEIDER' then r.abonos else r.inicial end;",
        "      v_acum := v_pago;",
        "      if v_pago > 0 then",
        "        insert into public.equipo_pagos",
        "          (venta_id, fecha, monto, metodo, tipo, nota)",
        "        values (v_venta, r.fecha::timestamptz, v_pago, 'efectivo', 'inicial',",
        "                case when r.hoja = 'SNEIDER' then 'Abono histórico' else 'Inicial histórico' end);",
        "      end if;",
        "",
        "      v_num := 0;",
        "      if r.hoja <> 'SNEIDER' and jsonb_typeof(r.cuotas) = 'array' then",
        "        v_idx := 0;",
        "        for v_monto in select (value #>> '{}')::numeric from jsonb_array_elements(r.cuotas) loop",
        "          v_idx := v_idx + 1;",
        "          if v_monto > 0 then",
        "            v_num := v_idx;",
        "            insert into public.equipo_cuotas",
        "              (venta_id, numero, fecha_vencimiento, monto)",
        "            values (v_venta, v_idx,",
        "                    (r.fecha::timestamptz at time zone 'America/Bogota')::date + (v_idx || ' months')::interval,",
        "                    v_monto)",
        "            returning id into v_cuota;",
        "            insert into public.equipo_pagos",
        "              (venta_id, cuota_id, fecha, monto, metodo, tipo, nota)",
        "            values (v_venta, v_cuota,",
        "                    (r.fecha::timestamptz at time zone 'America/Bogota')::date + (v_idx || ' months')::interval,",
        "                    v_monto, 'efectivo', 'cuota', 'Cuota histórica (fecha estimada)');",
        "            v_acum := v_acum + v_monto;",
        "          end if;",
        "        end loop;",
        "      end if;",
        "",
        "      if r.hoja <> 'SNEIDER' and r.abonos - v_acum > 0.5 then",
        "        insert into public.equipo_pagos",
        "          (venta_id, fecha, monto, metodo, tipo, nota)",
        "        values (v_venta, r.fecha::timestamptz, r.abonos - v_acum, 'efectivo', 'abono', 'Ajuste histórico');",
        "      end if;",
        "",
        "      if r.debe > 0.5 then",
        "        insert into public.equipo_cuotas",
        "          (venta_id, numero, fecha_vencimiento, monto)",
        "        values (v_venta, v_num + 1,",
        "                (r.fecha::date + ((v_num + 1) || ' months')::interval)::date,",
        "                r.debe);",
        "      end if;",
        "",
        "      if r.agregados is not null then",
        "        for v_ag in select * from jsonb_array_elements(r.agregados) loop",
        "          if trim(coalesce(v_ag->>'descripcion','')) <> '' then",
        "            insert into public.equipo_venta_agregados",
        "              (venta_id, descripcion, cantidad, precio_unitario, costo_unitario, costo_total, historico)",
        "            values (v_venta, v_ag->>'descripcion', 1,",
        "                    coalesce((v_ag->>'precio')::numeric,0), 0, 0, true);",
        "          end if;",
        "        end loop;",
        "      end if;",
        "    end if;",
        "  end loop;",
        "",
        "  insert into public.migraciones (clave) values ('import_equipos_2026')",
        "  on conflict (clave) do nothing;",
        "end $$;",
        "",
        "drop table if exists public._imp_eq;",
        "",
        "select count(*) as ventas_equipos from public.equipo_ventas where historico;",
        "select count(*) as unidades_equipos from public.equipos_unidades where historico;",
        "",
    ]
    open(os.path.join(DEST, "14_import_equipos.sql"), "w", encoding="utf-8").write("\n".join(lines))
    return len(filas)


def main():
    ventas_acc, inv = leer_accesorios()
    sneider, sociedad = leer_equipos()
    prods = catalogo(ventas_acc, inv)
    n_prod = escribir_seed(prods)
    n_acc = escribir_accesorios(ventas_acc)
    n_eq = escribir_equipos(sneider, sociedad)
    print(f"productos catálogo: {n_prod}")
    print(f"ventas accesorios: {n_acc}")
    print(f"filas equipos: {n_eq}")


if __name__ == "__main__":
    main()
