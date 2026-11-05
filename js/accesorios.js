/* ============================================================
   SIR·TECH POS · Accesorios, inventario FIFO y garantías
   ============================================================ */

let modoAcc = "inventario";
let _accStock = null;
let _accVentas = null;
let _accGarantias = null;

function accMetodos(sel) {
  return METODOS_PAGO.filter(function (m) { return m.k !== "mixto"; })
    .map(function (m) {
      return '<option value="' + m.k + '"' + (m.k === sel ? " selected" : "") + ">" + m.n + "</option>";
    }).join("");
}

function accProductoPorNombre(nombre) {
  var n = normalizarTexto(nombre);
  if (!n) return null;
  return (_accStock || []).find(function (p) { return normalizarTexto(p.nombre) === n; }) || null;
}

function accDatalist() {
  return '<datalist id="acc-prod-dl">' + (_accStock || []).map(function (p) {
    return '<option value="' + esc(p.nombre) + '"></option>';
  }).join("") + "</datalist>";
}

async function vistaAccesorios() {
  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Accesorios</h2><p class="sub">Inventario, ventas y garantías</p></div>' +
      '<div class="seg" id="acc-modo">' +
        '<button data-acc="inventario"><i class="ti ti-box"></i> Inventario</button>' +
        '<button data-acc="ventas"><i class="ti ti-shopping-cart"></i> Ventas</button>' +
        '<button data-acc="garantias"><i class="ti ti-shield-check"></i> Garantías</button>' +
      "</div>" +
    "</div>" +
    '<div id="zona-acc">' + cargando() + "</div>";

  $("#acc-modo").addEventListener("click", function (e) {
    var b = e.target.closest("[data-acc]");
    if (!b || b.dataset.acc === modoAcc) return;
    modoAcc = b.dataset.acc;
    $$("#acc-modo [data-acc]").forEach(function (x) {
      x.classList.toggle("on", x.dataset.acc === modoAcc);
    });
    pintarAccesorios();
  });

  $$("#acc-modo [data-acc]").forEach(function (x) {
    x.classList.toggle("on", x.dataset.acc === modoAcc);
  });
  pintarAccesorios();
}

async function pintarAccesorios() {
  var zona = $("#zona-acc");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    if (modoAcc === "inventario") {
      _accStock = await db(sb.from("v_accesorio_stock").select("*").order("nombre"));
      zona.innerHTML = htmlInventarioAcc();
      conectarInventarioAcc();
    } else if (modoAcc === "ventas") {
      _accStock = await db(sb.from("v_accesorio_stock").select("*").order("nombre"));
      _accVentas = await db(sb.from("v_accesorio_ventas").select("*").order("fecha", { ascending: false }).limit(400));
      zona.innerHTML = htmlVentasAcc();
      conectarVentasAcc();
    } else {
      _accStock = await db(sb.from("v_accesorio_stock").select("*").order("nombre"));
      _accGarantias = await db(sb.from("accesorio_garantias").select("*").order("fecha", { ascending: false }).limit(300));
      zona.innerHTML = htmlGarantiasAcc();
      conectarGarantiasAcc();
    }
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

/* ---------------- Inventario ---------------- */
function htmlInventarioAcc() {
  var prods = _accStock || [];
  var unidades = prods.reduce(function (s, p) { return s + Number(p.stock || 0); }, 0);
  var valor = prods.reduce(function (s, p) { return s + Number(p.stock || 0) * Number(p.costo_promedio || 0); }, 0);
  var bajos = prods.filter(function (p) { return Number(p.stock) <= Number(p.stock_minimo || 0); }).length;

  return '<div class="kpis">' +
      kpi("Productos", prods.length, "ti-box") +
      kpi("Unidades", unidades, "ti-stack") +
      kpi("Valor inventario", cop(valor), "ti-coin") +
      kpi("Stock bajo", bajos, "ti-alert-triangle", bajos ? "rojo" : "verde") +
    "</div>" +
    '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-box"></i> Inventario</h3>' +
        '<div class="acciones-head">' +
          '<div class="f-busca"><i class="ti ti-search"></i><input id="acc-buscar" placeholder="Buscar producto…"></div>' +
          '<button class="btn btn-sm" id="acc-nuevo"><i class="ti ti-plus"></i> Nuevo producto</button>' +
        "</div></div>" +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr>' +
        "<th>Producto</th><th>Categoría</th><th class=\"der\">Stock</th><th class=\"der\">Costo prom.</th>" +
        "<th class=\"der\">Precio</th><th class=\"der\">Mínimo</th><th></th></tr></thead><tbody id=\"acc-tbody\">" +
        filasInventarioAcc(prods) +
      "</tbody></table></div>" +
    "</div>" + accDatalist();
}

function filasInventarioAcc(prods) {
  if (!prods.length) return '<tr><td colspan="7">' + vacio("Sin productos. Registra un ingreso.", "ti-box") + "</td></tr>";
  return prods.map(function (p) {
    var bajo = Number(p.stock) <= Number(p.stock_minimo || 0);
    return "<tr><td><b>" + esc(p.nombre) + "</b>" + (p.activo ? "" : ' <span class="tag">Inactivo</span>') + "</td>" +
      "<td>" + esc(p.categoria || "General") + "</td>" +
      '<td class="der mono ' + (bajo ? "rojo" : "") + '">' + p.stock + "</td>" +
      '<td class="der mono">' + cop(p.costo_promedio) + "</td>" +
      '<td class="der mono">' + cop(p.precio) + "</td>" +
      '<td class="der mono">' + p.stock_minimo + "</td>" +
      '<td class="der"><span class="acciones-item">' +
        '<button class="x" data-ingreso="' + p.id + '" title="Ingreso"><i class="ti ti-truck-delivery"></i></button>' +
        '<button class="x" data-editar-prod="' + p.id + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
      "</span></td></tr>";
  }).join("");
}

function conectarInventarioAcc() {
  $("#acc-nuevo").addEventListener("click", function () { modalIngresoAcc(null); });
  $("#acc-buscar").addEventListener("input", function () {
    var t = normalizarTexto(this.value);
    var filtrados = (_accStock || []).filter(function (p) {
      return !t || normalizarTexto(p.nombre).indexOf(t) > -1 || normalizarTexto(p.categoria).indexOf(t) > -1;
    });
    $("#acc-tbody").innerHTML = filasInventarioAcc(filtrados);
  });
  $$("[data-ingreso]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = (_accStock || []).find(function (x) { return String(x.id) === String(b.dataset.ingreso); });
      if (p) modalIngresoAcc(p);
    });
  });
  $$("[data-editar-prod]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = (_accStock || []).find(function (x) { return String(x.id) === String(b.dataset.editarProd); });
      if (p) modalEditarProducto(p);
    });
  });
}

async function modalIngresoAcc(producto) {
  var esNuevo = !producto;
  abrirModal(
    "<h3>" + (esNuevo ? "Nuevo producto" : "Ingreso de inventario") + "</h3>" +
    '<form id="form-ingreso" class="form-modal">' +
      '<label class="lb">Producto</label>' +
      '<input id="ing-nombre" list="acc-prod-dl" placeholder="Buscar o escribir producto…" value="' + esc(producto ? producto.nombre : "") + '" ' + (esNuevo ? "" : "readonly") + ' required>' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Categoría</label><input id="ing-categoria" value="' + esc(producto ? producto.categoria || "" : "") + '" placeholder="General"></div>' +
        '<div><label class="lb">Precio de venta</label><input id="ing-precio" type="number" inputmode="numeric" value="' + (producto ? Number(producto.precio || 0) : 0) + '"></div>' +
        '<div><label class="lb">Cantidad</label><input id="ing-cant" type="number" inputmode="numeric" value="1" required></div>' +
        '<div><label class="lb">Costo unitario</label><input id="ing-costo" type="number" inputmode="numeric" value="' + (producto ? Number(producto.costo_promedio || 0) : 0) + '" required></div>' +
        '<div><label class="lb">Proveedor</label><input id="ing-proveedor" placeholder="Opcional"></div>' +
        '<div><label class="lb">Fecha</label><input id="ing-fecha" type="date" value="' + hoyInput() + '"></div>' +
      "</div>" +
      '<label class="lb">Nota</label><input id="ing-nota" placeholder="Opcional">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-device-floppy"></i> Guardar ingreso</button></div>' +
    "</form>"
  );
  if (!esNuevo) {
    var dl = document.getElementById("acc-prod-dl");
    if (!dl) document.body.insertAdjacentHTML("beforeend", accDatalist());
  }
  $("#form-ingreso").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var nombre = $("#ing-nombre").value.trim();
      var existente = accProductoPorNombre(nombre);
      var prod = {
        nombre: existente ? existente.nombre : nombre,
        categoria: $("#ing-categoria").value.trim() || "General",
        precio: num($("#ing-precio").value)
      };
      var lote = {
        cantidad: num($("#ing-cant").value),
        costo_unitario: num($("#ing-costo").value),
        proveedor: $("#ing-proveedor").value.trim(),
        fecha: $("#ing-fecha").value || hoyInput(),
        nota: $("#ing-nota").value.trim()
      };
      await db(sb.rpc("ingresar_lote", { p_producto: prod, p_lote: lote }));
      cerrarModal();
      toast("Ingreso registrado");
      pintarAccesorios();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

function modalEditarProducto(p) {
  abrirModal(
    "<h3>Editar producto</h3>" +
    '<form id="form-prod" class="form-modal">' +
      '<label class="lb">Producto</label><input value="' + esc(p.nombre) + '" readonly>' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Categoría</label><input id="pr-categoria" value="' + esc(p.categoria || "") + '"></div>' +
        '<div><label class="lb">Precio de venta</label><input id="pr-precio" type="number" value="' + Number(p.precio || 0) + '"></div>' +
        '<div><label class="lb">Stock mínimo</label><input id="pr-min" type="number" value="' + Number(p.stock_minimo || 0) + '"></div>' +
        '<div><label class="lb">Estado</label><select id="pr-activo"><option value="true"' + (p.activo ? " selected" : "") + '>Activo</option><option value="false"' + (!p.activo ? " selected" : "") + '>Inactivo</option></select></div>' +
      "</div>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>"
  );
  $("#form-prod").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.from("productos").update({
        categoria: $("#pr-categoria").value.trim() || "General",
        precio: num($("#pr-precio").value),
        stock_minimo: num($("#pr-min").value),
        activo: $("#pr-activo").value === "true"
      }).eq("id", p.id));
      cerrarModal();
      toast("Producto actualizado");
      pintarAccesorios();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

/* ---------------- Ventas ---------------- */
function htmlVentasAcc() {
  var ventas = _accVentas || [];
  var total = ventas.reduce(function (s, v) { return s + Number(v.total || 0); }, 0);
  var gan = ventas.reduce(function (s, v) { return s + Number(v.ganancia || 0); }, 0);
  var debe = ventas.reduce(function (s, v) { return s + Number(v.saldo || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Ventas", ventas.length, "ti-shopping-cart") +
      kpi("Total", cop(total), "ti-receipt") +
      kpi("Ganancia", cop(gan), "ti-trending-up", gan >= 0 ? "verde" : "rojo") +
      kpi("Por cobrar", cop(debe), "ti-cash", debe > 0 ? "rojo" : "verde") +
    "</div>" +
    '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-shopping-cart"></i> Ventas de accesorios</h3>' +
        '<button class="btn btn-sm" id="acc-vender"><i class="ti ti-plus"></i> Nueva venta</button></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Fecha</th><th>Cliente</th>' +
        '<th class="der">Total</th><th class="der">Ganancia</th><th class="der">Abonos</th><th class="der">Debe</th><th>Estado</th><th></th></tr></thead><tbody>' +
        (ventas.length ? ventas.map(function (v) {
          return "<tr><td class=\"mono\">" + v.numero + "</td><td>" + fdate(v.fecha) + "</td><td>" + esc(v.cliente_nombre || "—") + "</td>" +
            '<td class="der mono">' + cop(v.total) + "</td>" +
            '<td class="der mono ' + (Number(v.ganancia) < 0 ? "rojo" : "verde") + '">' + cop(v.ganancia) + "</td>" +
            '<td class="der mono">' + cop(v.pagado) + "</td>" +
            '<td class="der mono ' + (Number(v.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(v.saldo) + "</td>" +
            "<td>" + (Number(v.saldo) > 0.5 ? '<span class="tag">Por pagar</span>' : '<span class="tag tag-serv">Pagada</span>') + "</td>" +
            '<td class="der"><button class="x" data-ver-acc="' + v.id + '" title="Ver"><i class="ti ti-eye"></i></button></td></tr>';
        }).join("") : '<tr><td colspan="9">' + vacio("Sin ventas registradas.", "ti-receipt") + "</td></tr>") +
      "</tbody></table></div></div>" + accDatalist();
}

function conectarVentasAcc() {
  $("#acc-vender").addEventListener("click", modalVentaAcc);
  $$("[data-ver-acc]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = (_accVentas || []).find(function (x) { return String(x.id) === String(b.dataset.verAcc); });
      if (v) modalDetalleVentaAcc(v);
    });
  });
}

function modalVentaAcc() {
  var dl = document.getElementById("acc-prod-dl");
  if (!dl) document.body.insertAdjacentHTML("beforeend", accDatalist());
  abrirModal(
    "<h3>Nueva venta de accesorios</h3>" +
    '<form id="form-venta-acc" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Fecha</label><input id="va-fecha" type="date" value="' + hoyInput() + '"></div>' +
        '<div><label class="lb">Cliente</label><input id="va-cliente" placeholder="Opcional"></div>' +
      "</div>" +
      '<div class="box-head" style="margin-top:14px"><h3>Productos</h3><button type="button" class="btn-ghost btn-sm" id="va-add"><i class="ti ti-plus"></i> Agregar</button></div>' +
      '<div id="va-items"></div>' +
      '<div class="grid-3-in">' +
        '<div><label class="lb">Descuento</label><input id="va-desc" type="number" value="0"></div>' +
        '<div><label class="lb">Envío</label><input id="va-envio" type="number" value="0"></div>' +
        '<div><label class="lb">Gastos</label><input id="va-gastos" type="number" value="0"></div>' +
      "</div>" +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Abono inicial</label><input id="va-abono" type="number" value="0"></div>' +
        '<div><label class="lb">Método</label><select id="va-metodo">' + accMetodos("efectivo") + "</select></div>" +
      "</div>" +
      '<div class="res-linea" style="margin-top:12px"><span>Total</span><b id="va-total">$0</b></div>' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-check"></i> Registrar venta</button></div>' +
    "</form>", "ancho"
  );
  $("#va-add").addEventListener("click", function () { vaFila(); });
  $("#va-items").addEventListener("input", vaRecalcular);
  $("#va-items").addEventListener("click", function (e) {
    var b = e.target.closest("[data-quitar-va]");
    if (b) { b.closest(".fila-item").remove(); vaRecalcular(); }
  });
  $$("#va-desc, #va-envio, #va-gastos, #va-abono").forEach(function (el) {
    el.addEventListener("input", vaRecalcular);
  });
  vaFila();
  $("#form-venta-acc").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var items = $$("#va-items .fila-acc").map(function (f) {
        var p = accProductoPorNombre($(".va-prod", f).value);
        return {
          producto: p,
          descripcion: $(".va-prod", f).value.trim(),
          cantidad: num($(".va-cant", f).value) || 1,
          precio_unitario: num($(".va-precio", f).value)
        };
      }).filter(function (i) { return i.descripcion; });
      if (!items.length) throw new Error("Agrega al menos un producto.");
      items.forEach(function (i) {
        if (!i.producto) throw new Error('Producto no encontrado: "' + i.descripcion + '"');
      });
      var abono = num($("#va-abono").value);
      var venta = {
        fecha: $("#va-fecha").value ? $("#va-fecha").value + "T12:00:00" : new Date().toISOString(),
        cliente_nombre: $("#va-cliente").value.trim(),
        descuento: num($("#va-desc").value),
        envio: num($("#va-envio").value),
        gastos: num($("#va-gastos").value),
        notas: ""
      };
      var pagos = abono > 0 ? [{
        monto: abono,
        metodo: $("#va-metodo").value,
        fecha: venta.fecha,
        nota: "Abono inicial"
      }] : [];
      await db(sb.rpc("vender_accesorios", {
        p_venta: venta,
        p_items: items.map(function (i) {
          return { producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precio_unitario };
        }),
        p_pagos: pagos
      }));
      cerrarModal();
      toast("Venta registrada");
      pintarAccesorios();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

function vaFila(producto) {
  var p = producto || null;
  var div = document.createElement("div");
  div.className = "fila-acc";
  div.innerHTML =
    '<input class="va-prod" list="acc-prod-dl" placeholder="Producto…" value="' + esc(p ? p.nombre : "") + '" required>' +
    '<input class="va-cant" type="number" min="0.5" step="0.5" value="1" title="Cantidad">' +
    '<input class="va-precio" type="number" inputmode="numeric" value="' + (p ? Number(p.precio || 0) : 0) + '" title="Precio">' +
    '<span class="it-sub mono">$0</span>' +
    '<button type="button" class="x" data-quitar-va title="Quitar"><i class="ti ti-x"></i></button>';
  $("#va-items").appendChild(div);
  $(".va-prod", div).addEventListener("change", function () {
    var prod = accProductoPorNombre(this.value);
    if (prod) $(".va-precio", div).value = Number(prod.precio || 0);
    vaRecalcular();
  });
  vaRecalcular();
}

function vaRecalcular() {
  if (!$("#va-items")) return;
  var total = 0;
  $$("#va-items .fila-acc").forEach(function (f) {
    var c = num($(".va-cant", f).value) || 1;
    var p = num($(".va-precio", f).value);
    total += c * p;
    $(".it-sub", f).textContent = cop(c * p);
  });
  var desc = num($("#va-desc").value);
  $("#va-total").textContent = cop(total - desc);
}

async function modalDetalleVentaAcc(v) {
  try {
    var [items, pagos] = await Promise.all([
      db(sb.from("accesorio_venta_items").select("*").eq("venta_id", v.id).order("id")),
      db(sb.from("accesorio_pagos").select("*").eq("venta_id", v.id).order("fecha"))
    ]);
    var pagado = pagos.reduce(function (s, p) { return s + Number(p.monto); }, 0);
    var saldo = Number(v.total) - pagado;
    abrirModal(
      "<h3>Venta #" + v.numero + "</h3>" +
      '<p class="modal-sub">' + fdate(v.fecha) + " · " + esc(v.cliente_nombre || "Cliente ocasional") + "</p>" +
      '<div class="res-linea grande"><span>Total</span><b>' + cop(v.total) + "</b></div>" +
      '<div class="res-linea mini"><span>Ganancia</span><b>' + cop(v.ganancia) + "</b></div>" +
      '<div class="res-linea mini"><span>Abonos</span><b>' + cop(pagado) + "</b></div>" +
      '<div class="res-linea"><span>Debe</span><b class="' + (saldo > 0.5 ? "rojo" : "verde") + '">' + cop(saldo) + "</b></div>" +
      '<div class="sep"></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="der">Cant.</th><th class="der">Precio</th><th class="der">Costo</th></tr></thead><tbody>' +
        items.map(function (i) {
          return "<tr><td>" + esc(i.descripcion) + "</td><td class=\"der mono\">" + i.cantidad + "</td><td class=\"der mono\">" + cop(i.precio_unitario) + "</td><td class=\"der mono\">" + cop(i.costo_total) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
      '<div class="sep"></div>' +
      '<div class="box-head"><h3>Abonos</h3>' + (saldo > 0.5 ? '<button class="btn-ghost btn-sm" id="acc-abonar"><i class="ti ti-plus"></i> Registrar abono</button>' : "") + "</div>" +
      (pagos.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Método</th><th>Nota</th><th class="der">Monto</th><th></th></tr></thead><tbody>' +
        pagos.map(function (p) {
          return "<tr><td>" + fdatetime(p.fecha) + "</td><td>" + badgeMetodo(p.metodo) + "</td><td>" + esc(p.nota || "—") + "</td><td class=\"der mono\">" + cop(p.monto) + "</td>" +
            '<td class="der"><button class="x" data-borrar-pago-acc="' + p.id + '"><i class="ti ti-trash"></i></button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="mini-vacio">Sin abonos.</p>') +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cerrar</button></div>',
      "ancho"
    );
    var btn = $("#acc-abonar");
    if (btn) btn.addEventListener("click", function () { modalAbonoAcc(v, saldo); });
    $$("[data-borrar-pago-acc]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("¿Eliminar este abono?")) return;
        await db(sb.from("accesorio_pagos").delete().eq("id", b.dataset.borrarPagoAcc));
        toast("Abono eliminado");
        pintarAccesorios();
        cerrarModal();
      });
    });
  } catch (e) { toast(errorDe(e), "error"); }
}

function modalAbonoAcc(v, saldo) {
  abrirModal(
    "<h3>Registrar abono</h3>" +
    '<form id="form-abono-acc" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Fecha</label><input id="aa-fecha" type="date" value="' + hoyInput() + '" required></div>' +
        '<div><label class="lb">Monto</label><input id="aa-monto" type="number" value="' + (saldo || "") + '" required></div>' +
        '<div><label class="lb">Método</label><select id="aa-metodo">' + accMetodos("efectivo") + "</select></div>" +
        '<div><label class="lb">Nota</label><input id="aa-nota" placeholder="Opcional"></div>' +
      "</div>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-check"></i> Registrar</button></div>' +
    "</form>"
  );
  $("#form-abono-acc").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.from("accesorio_pagos").insert({
        venta_id: v.id,
        fecha: fechaPago($("#aa-fecha").value),
        monto: num($("#aa-monto").value),
        metodo: $("#aa-metodo").value,
        nota: $("#aa-nota").value.trim() || null
      }));
      cerrarModal();
      toast("Abono registrado");
      pintarAccesorios();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

/* ---------------- Garantías ---------------- */
function htmlGarantiasAcc() {
  var gs = _accGarantias || [];
  var prod = {};
  (_accStock || []).forEach(function (p) { prod[p.id] = p.nombre; });
  return '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-shield-check"></i> Garantías</h3>' +
        '<button class="btn btn-sm" id="acc-garantia"><i class="ti ti-plus"></i> Registrar garantía</button></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Producto</th><th class="der">Cant.</th>' +
        '<th>Origen</th><th>Reemplazo</th><th class="der">Costo</th><th>Estado</th></tr></thead><tbody>' +
        (gs.length ? gs.map(function (g) {
          return "<tr><td>" + fdate(g.fecha) + "</td><td>" + esc(prod[g.producto_id] || "—") + "</td>" +
            '<td class="der mono">' + g.cantidad + "</td><td>" + (g.origen === "tienda" ? "Tienda" : "Post-venta") + "</td>" +
            "<td>" + esc(prod[g.producto_reemplazo_id] || "—") + "</td>" +
            '<td class="der mono">' + cop(Number(g.costo_defectuoso) + Number(g.costo_reemplazo)) + "</td>" +
            "<td>" + esc(g.estado) + "</td></tr>";
        }).join("") : '<tr><td colspan="7">' + vacio("Sin garantías registradas.", "ti-shield-check") + "</td></tr>") +
      "</tbody></table></div></div>" + accDatalist();
}

function conectarGarantiasAcc() {
  $("#acc-garantia").addEventListener("click", modalGarantiaAcc);
}

function modalGarantiaAcc() {
  var dl = document.getElementById("acc-prod-dl");
  if (!dl) document.body.insertAdjacentHTML("beforeend", accDatalist());
  abrirModal(
    "<h3>Registrar garantía</h3>" +
    '<form id="form-garantia" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Producto defectuoso</label><input id="ga-prod" list="acc-prod-dl" placeholder="Buscar producto…" required></div>' +
        '<div><label class="lb">Cantidad</label><input id="ga-cant" type="number" value="1" required></div>' +
        '<div><label class="lb">Origen</label><select id="ga-origen"><option value="post_venta">Falla post-venta</option><option value="tienda">Defectuoso en tienda</option></select></div>' +
        '<div><label class="lb">Venta # (opcional)</label><input id="ga-venta" type="number" placeholder="Opcional"></div>' +
        '<div><label class="lb">Producto de reemplazo</label><input id="ga-rep" list="acc-prod-dl" placeholder="Opcional"></div>' +
        '<div><label class="lb">Cantidad reemplazo</label><input id="ga-cant-rep" type="number" value="0"></div>' +
      "</div>" +
      '<label class="lb">Motivo</label><input id="ga-motivo" placeholder="Falla, defecto de fábrica…">' +
      '<label class="lb">Notas</label><input id="ga-notas" placeholder="Opcional">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-check"></i> Registrar</button></div>' +
    "</form>"
  );
  $("#form-garantia").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var p = accProductoPorNombre($("#ga-prod").value);
      if (!p) throw new Error("Selecciona el producto defectuoso del listado.");
      var rep = accProductoPorNombre($("#ga-rep").value);
      var venta = $("#ga-venta").value ? Number($("#ga-venta").value) : null;
      await db(sb.rpc("registrar_garantia_accesorio", {
        p: {
          producto_id: p.id,
          cantidad: num($("#ga-cant").value) || 1,
          origen: $("#ga-origen").value,
          venta_id: venta,
          motivo: $("#ga-motivo").value.trim(),
          producto_reemplazo_id: rep ? rep.id : null,
          cantidad_reemplazo: num($("#ga-cant-rep").value),
          notas: $("#ga-notas").value.trim()
        }
      }));
      cerrarModal();
      toast("Garantía registrada");
      pintarAccesorios();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}
