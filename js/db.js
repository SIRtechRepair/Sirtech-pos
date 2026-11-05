/* ============================================================
   SIR·TECH POS · Acceso a datos
   ============================================================ */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

async function db(promise) {
  const res = await promise;
  if (res.error) throw res.error;
  return res.data;
}

/* ---------------- SESIÓN ---------------- */
async function sesionActual() {
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

async function perfilActual() {
  const s = await sesionActual();
  if (!s) return null;
  const rows = await db(sb.from("perfiles").select("*").eq("id", s.user.id).limit(1));
  return rows && rows[0] ? rows[0] : null;
}

async function entrar(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

async function salir() {
  await sb.auth.signOut();
}

/* ---------------- CLIENTES ---------------- */
async function buscarClientes(texto, limite) {
  const t = (texto || "").trim().replace(/[,()]/g, " ");
  let q = sb.from("clientes").select("id,nombre,telefono,telefono_norm");
  if (t) {
    const tel = telNorm(t);
    const filtros = ["nombre.ilike.%" + t + "%"];
    if (tel.length >= 3) filtros.push("telefono_norm.ilike.%" + tel + "%");
    q = q.or(filtros.join(","));
  }
  q = q.order("nombre").limit(limite || 20);
  return db(q);
}

async function clientesConResumen() {
  const filas = await db(sb.rpc("resumen_clientes"));
  return (filas || []).map(function (r) {
    return {
      cliente: {
        id: r.id, nombre: r.nombre, telefono: r.telefono,
        telefono_norm: r.telefono_norm, creado_en: r.creado_en
      },
      ordenes: Number(r.ordenes) || 0,
      total: Number(r.total) || 0,
      saldo: Number(r.saldo) || 0
    };
  });
}

async function clientePorId(id) {
  const rows = await db(sb.from("clientes").select("*").eq("id", id).limit(1));
  return rows && rows[0] ? rows[0] : null;
}

async function crearCliente(datos) {
  const tel = (datos.telefono || "").trim();
  const fila = {
    nombre: (datos.nombre || "").trim(),
    telefono: tel || null,
    telefono_norm: telNorm(tel) || null,
    email: (datos.email || "").trim() || null,
    notas: (datos.notas || "").trim() || null
  };
  const rows = await db(sb.from("clientes").insert(fila).select().single());
  return rows;
}

async function actualizarCliente(id, datos) {
  const tel = (datos.telefono || "").trim();
  const fila = {
    nombre: (datos.nombre || "").trim(),
    telefono: tel || null,
    telefono_norm: telNorm(tel) || null,
    email: (datos.email || "").trim() || null,
    notas: (datos.notas || "").trim() || null,
    actualizado_en: new Date().toISOString()
  };
  return db(sb.from("clientes").update(fila).eq("id", id).select().single());
}

/* ---------------- ÓRDENES ---------------- */
const CAMPOS_ORDEN =
  "id,numero,cliente_id,equipo,marca,modelo,imei,color,falla,diagnostico,tecnico,estado," +
  "prioridad,envio,gastos,descuento,total,costo_repuestos,pagado,saldo,garantia_dias," +
  "garantia_hasta,fecha_recibido,fecha_prometida,fecha_entregado,notas,historico,creado_en," +
  "clientes(nombre,telefono)";

async function listarOrdenes(opciones) {
  const o = opciones || {};
  let q = sb.from("ordenes").select(CAMPOS_ORDEN);

  if (o.estados && o.estados.length) q = q.in("estado", o.estados);
  if (o.desde) q = q.gte("fecha_recibido", o.desde + "T00:00:00");
  if (o.hasta) q = q.lte("fecha_recibido", o.hasta + "T23:59:59");
  if (o.clienteId) q = q.eq("cliente_id", o.clienteId);
  if (o.soloHistorico === false) q = q.eq("historico", false);

  if (o.texto) {
    const t = o.texto.trim().replace(/[,()]/g, " ");
    const partes = ["equipo.ilike.%" + t + "%", "imei.ilike.%" + t + "%", "falla.ilike.%" + t + "%"];
    if (/^\d+$/.test(t)) partes.push("numero.eq." + t);
    const cli = await buscarClientes(t, 30);
    if (cli.length) partes.push("cliente_id.in.(" + cli.map(function (c) { return c.id; }).join(",") + ")");
    q = q.or(partes.join(","));
  }

  q = q.order("prioridad", { ascending: false })
       .order("fecha_recibido", { ascending: false })
       .limit(o.limite || 1000);

  return db(q);
}

async function obtenerOrden(id) {
  const orden = await db(sb.from("ordenes").select(CAMPOS_ORDEN).eq("id", id).single());
  const [items, pagos, historial, garantias] = await Promise.all([
    db(sb.from("orden_items").select("*").eq("orden_id", id).order("id")),
    db(sb.from("pagos").select("*").eq("orden_id", id).order("fecha")),
    db(sb.from("historial_estados").select("*").eq("orden_id", id).order("creado_en")),
    db(sb.from("garantias").select("*").eq("orden_id", id).order("fecha", { ascending: false }))
  ]);
  return { orden: orden, items: items, pagos: pagos, historial: historial, garantias: garantias };
}

async function crearOrden(cab, items, pago) {
  let clienteId = cab.cliente_id || null;

  if (!clienteId) {
    const nombre = (cab.cliente_nombre || "").trim();
    if (!nombre) throw new Error("Escribe el nombre del cliente.");
    const nuevo = await crearCliente({ nombre: nombre, telefono: cab.cliente_telefono });
    clienteId = nuevo.id;
  }

  const fila = {
    cliente_id: clienteId,
    equipo: (cab.equipo || "").trim() || "Equipo",
    marca: (cab.marca || "").trim() || null,
    modelo: (cab.modelo || "").trim() || null,
    imei: (cab.imei || "").trim() || null,
    color: (cab.color || "").trim() || null,
    falla: (cab.falla || "").trim() || null,
    diagnostico: (cab.diagnostico || "").trim() || null,
    tecnico: (cab.tecnico || "").trim() || null,
    estado: cab.estado || "recibido",
    prioridad: cab.prioridad || "normal",
    envio: num(cab.envio),
    gastos: num(cab.gastos),
    descuento: num(cab.descuento),
    garantia_dias: Math.max(0, Math.round(num(cab.garantia_dias))),
    fecha_prometida: cab.fecha_prometida || null,
    notas: (cab.notas || "").trim() || null,
    creado_por: (await sesionActual()).user.id
  };

  const orden = await db(sb.from("ordenes").insert(fila).select().single());

  const filas = (items || []).filter(function (i) { return i.descripcion && i.descripcion.trim(); })
    .map(function (i) {
      return {
        orden_id: orden.id,
        tipo: i.tipo === "repuesto" ? "repuesto" : "servicio",
        descripcion: i.descripcion.trim(),
        cantidad: num(i.cantidad) || 1,
        costo_unitario: num(i.costo_unitario),
        precio_unitario: num(i.precio_unitario)
      };
    });
  if (filas.length) await db(sb.from("orden_items").insert(filas));

  if (pago && num(pago.monto) > 0) {
    await db(sb.from("pagos").insert({
      orden_id: orden.id,
      monto: num(pago.monto),
      metodo: pago.metodo || "efectivo",
      nota: "Abono inicial",
      usuario: (await sesionActual()).user.id
    }));
  }

  return orden;
}

async function actualizarOrden(id, campos) {
  const permitidos = ["equipo", "marca", "modelo", "imei", "color", "falla", "diagnostico",
    "tecnico", "estado", "prioridad", "envio", "gastos", "descuento", "garantia_dias",
    "fecha_prometida", "notas", "cliente_id"];
  const fila = {};
  permitidos.forEach(function (k) {
    if (k in campos) fila[k] = campos[k];
  });
  return db(sb.from("ordenes").update(fila).eq("id", id).select().single());
}

async function cambiarEstado(id, estado) {
  return db(sb.from("ordenes").update({ estado: estado }).eq("id", id).select().single());
}

/* ---------------- ÍTEMS ---------------- */
async function agregarItem(ordenId, item) {
  return db(sb.from("orden_items").insert({
    orden_id: ordenId,
    tipo: item.tipo === "repuesto" ? "repuesto" : "servicio",
    descripcion: item.descripcion.trim(),
    cantidad: num(item.cantidad) || 1,
    costo_unitario: num(item.costo_unitario),
    precio_unitario: num(item.precio_unitario)
  }).select().single());
}

async function eliminarItem(id) {
  return db(sb.from("orden_items").delete().eq("id", id));
}

/* ---------------- PAGOS ---------------- */
async function agregarPago(ordenId, pago) {
  const s = await sesionActual();
  return db(sb.from("pagos").insert({
    orden_id: ordenId,
    monto: num(pago.monto),
    metodo: pago.metodo || "efectivo",
    nota: (pago.nota || "").trim() || null,
    fecha: pago.fecha ? new Date(pago.fecha + "T" + new Date().toTimeString().slice(0, 8)).toISOString() : new Date().toISOString(),
    usuario: s ? s.user.id : null
  }).select().single());
}

async function eliminarPago(id) {
  return db(sb.from("pagos").delete().eq("id", id));
}

/* ---------------- MOVIMIENTOS DE DINERO ---------------- */
async function listarMovimientos(desde, hasta) {
  let q = sb.from("movimientos_dinero").select("*").order("creado_en", { ascending: false }).limit(300);
  if (desde) q = q.gte("creado_en", desde + "T00:00:00");
  if (hasta) q = q.lte("creado_en", hasta + "T23:59:59");
  return db(q);
}

async function crearMovimiento(mov) {
  const s = await sesionActual();
  return db(sb.from("movimientos_dinero").insert({
    tipo: mov.tipo,
    cuenta: mov.cuenta || "efectivo",
    monto: num(mov.monto),
    persona: (mov.persona || "").trim() || null,
    nota: (mov.nota || "").trim() || null,
    usuario: s ? s.user.id : null
  }).select().single());
}

async function eliminarMovimiento(id) {
  return db(sb.from("movimientos_dinero").delete().eq("id", id));
}

/* ---------------- CONSULTAS DE REPORTES ---------------- */
async function ordenesEntre(desde, hasta) {
  return db(sb.from("ordenes").select("id,numero,estado,total,costo_repuestos,envio,gastos,descuento,saldo,pagado,fecha_recibido,fecha_entregado,equipo,falla,tecnico,historico").gte("fecha_recibido", desde + "T00:00:00").lte("fecha_recibido", hasta + "T23:59:59").limit(3000));
}

async function ordenesEntregadasEntre(desde, hasta) {
  return db(sb.from("ordenes").select("id,numero,total,costo_repuestos,envio,gastos,descuento,garantia_dias,fecha_entregado,equipo,tecnico").eq("estado", "entregado").gte("fecha_entregado", desde + "T00:00:00").lte("fecha_entregado", hasta + "T23:59:59").limit(3000));
}

async function pagosEntre(desde, hasta) {
  return db(sb.from("pagos").select("id,orden_id,monto,metodo,fecha").gte("fecha", desde + "T00:00:00").lte("fecha", hasta + "T23:59:59"));
}

async function movimientosEntre(desde, hasta) {
  return db(sb.from("movimientos_dinero").select("id,tipo,cuenta,monto,creado_en").gte("creado_en", desde + "T00:00:00").lte("creado_en", hasta + "T23:59:59"));
}

/* ---------------- PANEL ---------------- */
async function datosPanel() {
  const abiertas = await db(sb.from("ordenes").select("id,numero,estado,prioridad,total,saldo,equipo,cliente_id,fecha_prometida,fecha_recibido,garantia_hasta,garantia_dias,clientes(nombre,telefono)").in("estado", ESTADOS_ABIERTOS));
  const cartera = await db(sb.from("v_cartera").select("*").order("fecha_recibido").limit(200));
  const hoy = hoyInput();
  const pagosHoy = await db(sb.from("pagos").select("monto,metodo").gte("fecha", hoy + "T00:00:00"));
  const garantias = await db(sb.from("ordenes").select("id,numero,equipo,garantia_hasta,clientes(nombre,telefono)").not("garantia_hasta", "is", null).gte("garantia_hasta", hoy).lte("garantia_hasta", inputDate(new Date(Date.now() + 7 * 86400000))));
  return { abiertas: abiertas, cartera: cartera, pagosHoy: pagosHoy, garantias: garantias };
}
