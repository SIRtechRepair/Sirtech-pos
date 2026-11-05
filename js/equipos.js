/* ============================================================
   SIR·TECH POS · Equipos, inventario y créditos
   ============================================================ */

let modoEq = "ventas";
let origenEq = "";
let filtroEq = [];

function mesSiguiente() {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function sumarMeses(fecha, meses) {
  var p = String(fecha).split("-");
  var d = new Date(Number(p[0]), Number(p[1]) - 1 + meses, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
}

function eqTelefono(v) {
  var raw = String(v.contacto || "").replace(/\D/g, "");
  if (raw.length >= 10 && raw.length <= 11) return "57" + raw.slice(-10);
  var tel = String(v.cliente_telefono || "").replace(/\D/g, "");
  if (tel.length >= 10) return "57" + tel.slice(-10);
  return "";
}

function eqWhatsApp(v) {
  var tel = eqTelefono(v);
  if (!tel) {
    toast("No hay un teléfono válido registrado para este cliente.", "error");
    return;
  }
  var msg = "Hola " + (v.comprador || "") + ", te escribimos de SIR·TECH. " +
    "Tu equipo " + v.equipo + " está en mora con " + (v.dias_mora || 0) +
    " días de atraso. Saldo pendiente: " + cop(v.saldo) + ". " +
    "Por favor comunícate para ponerte al día.";
  window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent(msg), "_blank");
}

function eqCoincide(v) {
  if (!filtroEq.length) return true;
  return filtroEq.some(function (f) {
    if (f === "pagada") return Number(v.saldo) <= 0.5 && v.estado_pago !== "cancelada";
    if (f === "por_pagar") return Number(v.saldo) > 0.5 && v.estado_pago !== "cancelada";
    if (f === "en_mora") return !!v.en_mora;
    return v.estado_equipo === f;
  });
}

function marcarFiltrosEq() {
  $$("#eq-filtros [data-feq]").forEach(function (b) {
    if (b.dataset.feq === "limpiar") b.classList.toggle("on", filtroEq.length === 0);
    else b.classList.toggle("on", filtroEq.indexOf(b.dataset.feq) > -1);
  });
}

function eqMetodos(sel) {
  return METODOS_PAGO.filter(function (m) { return m.k !== "mixto"; })
    .map(function (m) {
      return '<option value="' + m.k + '"' + (m.k === sel ? " selected" : "") + ">" + m.n + "</option>";
    }).join("");
}

function eqBadgePago(v) {
  return Number(v.saldo) > 0.5
    ? '<span class="tag">Por pagar</span>'
    : '<span class="tag tag-serv">Pagada</span>';
}

async function vistaEquipos() {
  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Equipos</h2><p class="sub">Inventario, ventas y créditos</p></div>' +
      '<div class="reportes-filtros">' +
        '<div class="seg" id="eq-modo">' +
          '<button data-eq="ventas"><i class="ti ti-receipt"></i> Ventas</button>' +
          '<button data-eq="creditos"><i class="ti ti-credit-card"></i> Créditos</button>' +
          '<button data-eq="inventario"><i class="ti ti-device-mobile"></i> Inventario</button>' +
        "</div>" +
        '<select id="eq-origen"><option value="">Todos</option><option value="SNEIDER">Sneider</option><option value="SOCIEDAD">Sociedad</option></select>' +
      "</div>" +
    "</div>" +
    '<div class="filtros" id="eq-filtros">' +
      '<span class="mini">Estado:</span>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="pagada">Pagada</button>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="por_pagar">Por pagar</button>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="en_mora">En mora</button>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="en_reparacion">En reparación</button>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="garantia">Garantía</button>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="disponible">Disponible</button>' +
      '<button class="btn-ghost btn-sm filtro-chip" data-feq="limpiar">Todos</button>' +
    "</div>" +
    '<div id="zona-eq">' + cargando() + "</div>";

  $("#eq-filtros").addEventListener("click", function (e) {
    var b = e.target.closest("[data-feq]");
    if (!b) return;
    var f = b.dataset.feq;
    if (f === "limpiar") filtroEq = [];
    else if (filtroEq.indexOf(f) > -1) filtroEq = filtroEq.filter(function (x) { return x !== f; });
    else filtroEq.push(f);
    marcarFiltrosEq();
    pintarEquipos();
  });

  $("#eq-modo").addEventListener("click", function (e) {
    var b = e.target.closest("[data-eq]");
    if (!b || b.dataset.eq === modoEq) return;
    modoEq = b.dataset.eq;
    $$("#eq-modo [data-eq]").forEach(function (x) { x.classList.toggle("on", x.dataset.eq === modoEq); });
    pintarEquipos();
  });
  $("#eq-origen").value = origenEq;
  $("#eq-origen").addEventListener("change", function () {
    origenEq = this.value;
    pintarEquipos();
  });
  $$("#eq-modo [data-eq]").forEach(function (x) { x.classList.toggle("on", x.dataset.eq === modoEq); });
  marcarFiltrosEq();
  pintarEquipos();
}

async function pintarEquipos() {
  var zona = $("#zona-eq");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    if ($("#eq-filtros")) $("#eq-filtros").classList.toggle("oculto", modoEq === "inventario");
    if (modoEq === "inventario") {
      var q = sb.from("equipos_unidades").select("*")
        .in("estado", ["disponible", "en_reparacion", "consignacion"])
        .order("creado_en", { ascending: false }).limit(500);
      if (origenEq) q = q.eq("origen", origenEq);
      var unidades = await db(q);
      zona.innerHTML = htmlInvEq(unidades);
      conectarInvEq(unidades);
    } else {
      var qv = sb.from("v_equipo_ventas").select("*").order("fecha", { ascending: false }).limit(500);
      if (modoEq === "creditos") qv = qv.gt("saldo", 0.5);
      if (origenEq) qv = qv.eq("origen", origenEq);
      var ventas = await db(qv);
      ventas = ventas.filter(eqCoincide);
      zona.innerHTML = modoEq === "creditos" ? htmlCreditosEq(ventas) : htmlVentasEq(ventas);
      conectarVentasEq(ventas);
    }
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

/* ---------------- Ventas ---------------- */
function htmlVentasEq(ventas) {
  var total = ventas.reduce(function (s, v) { return s + Number(v.total || 0); }, 0);
  var gan = ventas.reduce(function (s, v) { return s + Number(v.ganancia || 0); }, 0);
  var ab = ventas.reduce(function (s, v) { return s + Number(v.pagado || 0); }, 0);
  var debe = ventas.reduce(function (s, v) { return s + Number(v.saldo || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Ventas", ventas.length, "ti-receipt") +
      kpi("Total", cop(total), "ti-cash") +
      kpi("Ganancia", cop(gan), "ti-trending-up", gan >= 0 ? "verde" : "rojo") +
      kpi("Por cobrar", cop(debe), "ti-credit-card", debe > 0 ? "rojo" : "verde") +
    "</div>" +
    '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-receipt"></i> Ventas de equipos</h3>' +
        '<button class="btn btn-sm" id="eq-vender"><i class="ti ti-plus"></i> Nueva venta</button></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Fecha</th><th>Equipo</th><th>Comprador</th>' +
        '<th class="der">Total</th><th class="der">Abonos</th><th class="der">Debe</th><th>Estado</th><th>Origen</th><th></th></tr></thead><tbody>' +
        (ventas.length ? ventas.map(function (v) {
          return "<tr><td class=\"mono\">" + v.numero + "</td><td>" + fdate(v.fecha) + "</td><td><b>" + esc(v.equipo) + "</b></td>" +
            "<td>" + esc(v.comprador || "—") + "</td>" +
            '<td class="der mono">' + cop(v.total) + "</td>" +
            '<td class="der mono">' + cop(v.pagado) + "</td>" +
            '<td class="der mono ' + (Number(v.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(v.saldo) + "</td>" +
            "<td>" + eqBadgePago(v) + (v.en_mora ? ' <span class="tag tag-mora">Mora ' + v.dias_mora + "d</span>" : "") + "</td><td>" + esc(v.origen) + "</td>" +
            '<td class="der"><button class="x" data-ver-eq="' + v.id + '" title="Ver"><i class="ti ti-eye"></i></button></td></tr>';
        }).join("") : '<tr><td colspan="10">' + vacio("Sin ventas registradas.", "ti-receipt") + "</td></tr>") +
      "</tbody></table></div></div>";
}

/* ---------------- Créditos ---------------- */
function htmlCreditosEq(ventas) {
  var debe = ventas.reduce(function (s, v) { return s + Number(v.saldo || 0); }, 0);
  var cuotas = ventas.reduce(function (s, v) { return s + Number(v.cuotas_pendientes || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Ventas con deuda", ventas.length, "ti-credit-card", "rojo") +
      kpi("Por cobrar", cop(debe), "ti-cash", "rojo") +
      kpi("Cuotas pendientes", cuotas, "ti-calendar-event") +
      kpi("Promedio deuda", cop(ventas.length ? debe / ventas.length : 0), "ti-chart-bar") +
    "</div>" +
    '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-credit-card"></i> Créditos pendientes</h3></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Fecha</th><th>Equipo</th><th>Comprador</th>' +
        '<th class="der">Total</th><th class="der">Abonos</th><th class="der">Debe</th><th class="der">Cuotas</th><th>Mora</th><th></th></tr></thead><tbody>' +
        (ventas.length ? ventas.map(function (v) {
          return "<tr><td class=\"mono\">" + v.numero + "</td><td>" + fdate(v.fecha) + "</td><td><b>" + esc(v.equipo) + "</b></td>" +
            "<td>" + esc(v.comprador || "—") + "</td>" +
            '<td class="der mono">' + cop(v.total) + "</td>" +
            '<td class="der mono">' + cop(v.pagado) + "</td>" +
            '<td class="der mono rojo">' + cop(v.saldo) + "</td>" +
            '<td class="der mono">' + (v.cuotas_pendientes || 0) + "</td>" +
            "<td>" + (v.en_mora ? '<span class="tag tag-mora">' + v.dias_mora + " días</span>" : "—") + "</td>" +
            '<td class="der"><span class="acciones-item">' +
              (v.en_mora ? '<button class="x" data-wa-eq="' + v.id + '" title="WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>' : "") +
              '<button class="x" data-ver-eq="' + v.id + '" title="Ver"><i class="ti ti-eye"></i></button>' +
            "</span></td></tr>";
        }).join("") : '<tr><td colspan="10">' + vacio("Sin créditos pendientes.", "ti-circle-check") + "</td></tr>") +
      "</tbody></table></div></div>";
}

function conectarVentasEq(ventas) {
  var btn = $("#eq-vender");
  if (btn) btn.addEventListener("click", modalVentaEq);
  $$("[data-ver-eq]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = ventas.find(function (x) { return String(x.id) === String(b.dataset.verEq); });
      if (v) modalDetalleEq(v);
    });
  });
  $$("[data-wa-eq]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = ventas.find(function (x) { return String(x.id) === String(b.dataset.waEq); });
      if (v) eqWhatsApp(v);
    });
  });
}

/* ---------------- Inventario ---------------- */
function htmlInvEq(unidades) {
  var costo = unidades.reduce(function (s, u) { return s + Number(u.costo || 0); }, 0);
  var precio = unidades.reduce(function (s, u) { return s + Number(u.precio_sugerido || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Equipos", unidades.length, "ti-device-mobile") +
      kpi("Costo inventario", cop(costo), "ti-coin") +
      kpi("Precio esperado", cop(precio), "ti-tag") +
      kpi("En reparación", unidades.filter(function (u) { return u.estado === "en_reparacion"; }).length, "ti-tool") +
    "</div>" +
    '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-device-mobile"></i> Inventario de equipos</h3>' +
        '<button class="btn btn-sm" id="eq-nuevo"><i class="ti ti-plus"></i> Nuevo equipo</button></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>IMEI</th><th>Modelo</th><th>RAM</th><th>Almacenamiento</th>' +
        '<th class="der">Costo</th><th class="der">Precio</th><th>Estado</th><th>Origen</th><th>De quién</th><th></th></tr></thead><tbody>' +
        (unidades.length ? unidades.map(function (u) {
          return "<tr><td class=\"mono\">" + esc(u.imei || "—") + "</td><td><b>" + esc(u.modelo) + "</b></td>" +
            "<td>" + esc(u.ram || "—") + "</td><td>" + esc(u.almacenamiento || "—") + "</td>" +
            '<td class="der mono">' + cop(u.costo) + "</td>" +
            '<td class="der mono">' + cop(u.precio_sugerido) + "</td>" +
            "<td>" + esc(u.estado) + "</td><td>" + esc(u.origen) + "</td><td>" + esc(u.de_quien_es || "—") + "</td>" +
            '<td class="der"><button class="x" data-editar-eq="' + u.id + '" title="Editar"><i class="ti ti-pencil"></i></button></td></tr>';
        }).join("") : '<tr><td colspan="10">' + vacio("Sin equipos en inventario.", "ti-device-mobile") + "</td></tr>") +
      "</tbody></table></div></div>";
}

function conectarInvEq(unidades) {
  $("#eq-nuevo").addEventListener("click", modalNuevoEquipo);
  $$("[data-editar-eq]").forEach(function (b) {
    b.addEventListener("click", function () {
      var u = (unidades || []).find(function (x) { return String(x.id) === String(b.dataset.editarEq); });
      if (u) modalEditarEquipo(u);
    });
  });
}

function modalEditarEquipo(u) {
  abrirModal(
    "<h3>Editar equipo</h3>" +
    '<form id="form-eq-edit" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">IMEI</label><input id="ee-imei" value="' + esc(u.imei || "") + '"></div>' +
        '<div><label class="lb">Modelo</label><input id="ee-modelo" value="' + esc(u.modelo) + '" required></div>' +
        '<div><label class="lb">RAM</label><input id="ee-ram" value="' + esc(u.ram || "") + '"></div>' +
        '<div><label class="lb">Almacenamiento</label><input id="ee-almac" value="' + esc(u.almacenamiento || "") + '"></div>' +
        '<div><label class="lb">Costo</label><input id="ee-costo" type="number" value="' + Number(u.costo || 0) + '"></div>' +
        '<div><label class="lb">Precio esperado</label><input id="ee-precio" type="number" value="' + Number(u.precio_sugerido || 0) + '"></div>' +
        '<div><label class="lb">Estado</label><select id="ee-estado">' +
          ["disponible", "en_reparacion", "consignacion", "vendido", "garantia", "devuelto"].map(function (x) {
            return '<option value="' + x + '"' + (u.estado === x ? " selected" : "") + ">" + x + "</option>";
          }).join("") + "</select></div>" +
        '<div><label class="lb">Origen</label><select id="ee-origen"><option value="SNEIDER"' + (u.origen === "SNEIDER" ? " selected" : "") + '>Sneider</option><option value="SOCIEDAD"' + (u.origen === "SOCIEDAD" ? " selected" : "") + '>Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label><input id="ee-dequien" value="' + esc(u.de_quien_es || "") + '"></div>' +
      "</div>" +
      '<label class="lb">Notas</label><input id="ee-notas" value="' + esc(u.notas || "") + '">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );
  $("#form-eq-edit").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.from("equipos_unidades").update({
        imei: $("#ee-imei").value.trim() || null,
        modelo: $("#ee-modelo").value.trim(),
        ram: $("#ee-ram").value.trim() || null,
        almacenamiento: $("#ee-almac").value.trim() || null,
        costo: num($("#ee-costo").value),
        precio_sugerido: num($("#ee-precio").value),
        estado: $("#ee-estado").value,
        origen: $("#ee-origen").value,
        de_quien_es: $("#ee-dequien").value.trim() || null,
        notas: $("#ee-notas").value.trim() || null
      }).eq("id", u.id));
      cerrarModal();
      toast("Equipo actualizado");
      pintarEquipos();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

/* ---------------- Modales ---------------- */
function modalNuevoEquipo() {
  abrirModal(
    "<h3>Nuevo equipo en inventario</h3>" +
    '<form id="form-eq-nuevo" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">IMEI</label><input id="en-imei" placeholder="Opcional"></div>' +
        '<div><label class="lb">Modelo *</label><input id="en-modelo" placeholder="iPhone 13"></div>' +
        '<div><label class="lb">CPU</label><input id="en-cpu" placeholder="Opcional"></div>' +
        '<div><label class="lb">RAM</label><input id="en-ram" placeholder="4GB"></div>' +
        '<div><label class="lb">Almacenamiento</label><input id="en-almac" placeholder="128GB"></div>' +
        '<div><label class="lb">Color</label><input id="en-color" placeholder="Opcional"></div>' +
        '<div><label class="lb">Costo</label><input id="en-costo" type="number" value="0"></div>' +
        '<div><label class="lb">Precio esperado</label><input id="en-precio" type="number" value="0"></div>' +
        '<div><label class="lb">Origen</label><select id="en-origen"><option value="SNEIDER">Sneider</option><option value="SOCIEDAD">Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label><input id="en-dequien" placeholder="Opcional"></div>' +
      "</div>" +
      '<label class="lb">Notas</label><input id="en-notas" placeholder="Opcional">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );
  $("#form-eq-nuevo").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.from("equipos_unidades").insert({
        imei: $("#en-imei").value.trim() || null,
        modelo: $("#en-modelo").value.trim(),
        cpu: $("#en-cpu").value.trim() || null,
        ram: $("#en-ram").value.trim() || null,
        almacenamiento: $("#en-almac").value.trim() || null,
        color: $("#en-color").value.trim() || null,
        costo: num($("#en-costo").value),
        precio_sugerido: num($("#en-precio").value),
        estado: "disponible",
        origen: $("#en-origen").value,
        de_quien_es: $("#en-dequien").value.trim() || null,
        notas: $("#en-notas").value.trim() || null
      }));
      cerrarModal();
      toast("Equipo registrado");
      pintarEquipos();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

async function modalVentaEq() {
  var q = sb.from("equipos_unidades").select("*")
    .in("estado", ["disponible", "en_reparacion", "consignacion"])
    .order("modelo").limit(300);
  if (origenEq) q = q.eq("origen", origenEq);
  var unidades = [];
  try { unidades = await db(q); } catch (e) { unidades = []; }

  abrirModal(
    "<h3>Nueva venta de equipo</h3>" +
    '<form id="form-eq-venta" class="form-modal">' +
      '<label class="lb">Equipo del inventario (opcional)</label>' +
      '<select id="ev-unidad"><option value="">Venta libre / sin IMEI</option>' +
        unidades.map(function (u) {
          return '<option value="' + u.id + '">' + esc(u.modelo) + " · " + esc(u.ram || "") + " " + esc(u.almacenamiento || "") + " · IMEI " + esc(u.imei || "—") + "</option>";
        }).join("") + "</select>" +
      '<label class="lb">Tipo de pago</label>' +
      '<select id="ev-tipo"><option value="contado">Contado</option><option value="cuotas">A cuotas</option></select>' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Fecha</label><input id="ev-fecha" type="date" value="' + hoyInput() + '"></div>' +
        '<div><label class="lb">Equipo *</label><input id="ev-equipo" placeholder="iPhone 13"></div>' +
        '<div><label class="lb">CPU</label><input id="ev-cpu"></div>' +
        '<div><label class="lb">RAM</label><input id="ev-ram"></div>' +
        '<div><label class="lb">Almacenamiento</label><input id="ev-almac"></div>' +
        '<div><label class="lb">Vendedor</label><input id="ev-vendedor"></div>' +
        '<div><label class="lb">Comprador</label><input id="ev-comprador"></div>' +
        '<div><label class="lb">Contacto</label><input id="ev-contacto"></div>' +
        '<div><label class="lb">Precio de venta de contado</label><input id="ev-total" type="number" value="0"></div>' +
        '<div><label class="lb">Costo</label><input id="ev-costo" type="number" value="0"></div>' +
        '<div><label class="lb">Comisión</label><input id="ev-comision" type="number" value="0"></div>' +
        '<div><label class="lb">Envío</label><input id="ev-envio" type="number" value="0"></div>' +
        '<div><label class="lb">Gastos</label><input id="ev-gastos" type="number" value="0"></div>' +
        '<div><label class="lb">Origen</label><select id="ev-origen"><option value="SNEIDER">Sneider</option><option value="SOCIEDAD">Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label><input id="ev-dequien" placeholder="Opcional"></div>' +
        '<div><label class="lb">Estado del equipo</label><select id="ev-estado"><option value="vendido">Vendido</option><option value="en_reparacion">En reparación</option><option value="disponible">Disponible</option></select></div>' +
      "</div>" +
      '<div id="ev-financiacion" class="box oculto" style="margin-top:12px;margin-bottom:0">' +
        '<div class="grid-2-in">' +
          '<div><label class="lb">Cuota inicial</label><input id="ev-inicial" type="number" value="0"></div>' +
          '<div><label class="lb">Número de cuotas</label><input id="ev-ncuotas" type="number" value="0"></div>' +
          '<div><label class="lb">Mes del primer pago</label><input id="ev-primer-pago" type="month" value="' + mesSiguiente() + '"></div>' +
          '<div><label class="lb">Cuota mensual (calculada)</label><input id="ev-vcuota" type="number" readonly></div>' +
        "</div>" +
        '<div class="sep"></div>' +
        '<div class="res-linea mini"><span>Monto a financiar</span><b id="ev-fin-monto">$0</b></div>' +
        '<div class="res-linea mini"><span>Interés (70% anual)</span><b id="ev-fin-interes">$0</b></div>' +
        '<div class="res-linea mini"><span>Total a cobrar con interés</span><b id="ev-fin-total">$0</b></div>' +
      "</div>" +
      '<label class="lb">Método de pago</label><select id="ev-metodo">' + eqMetodos("efectivo") + "</select>" +
      '<label class="lb">Notas</label><input id="ev-notas" placeholder="Opcional">' +
      '<div class="res-linea" style="margin-top:12px"><span>Total a registrar</span><b id="ev-total-reg">$0</b></div>' +
      '<div class="res-linea mini"><span>Ganancia estimada</span><b id="ev-ganancia">$0</b></div>' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-check"></i> Registrar venta</button></div>' +
    "</form>", "ancho"
  );

  function financiacion() {
    var contado = num($("#ev-total").value);
    var inicial = num($("#ev-inicial").value);
    var n = Math.max(0, Math.round(num($("#ev-ncuotas").value)));
    var monto = Math.max(contado - inicial, 0);
    var interes = monto * 0.70 * (n / 12);
    var totalCobrar = contado + interes;
    var saldoFin = monto + interes;
    var cuota = n > 0 ? saldoFin / n : 0;
    var tipo = $("#ev-tipo").value;
    var totalReg = tipo === "cuotas" ? totalCobrar : contado;

    $("#ev-vcuota").value = tipo === "cuotas" ? Math.round(cuota) : 0;
    $("#ev-fin-monto").textContent = cop(monto);
    $("#ev-fin-interes").textContent = cop(interes);
    $("#ev-fin-total").textContent = cop(totalCobrar);
    $("#ev-total-reg").textContent = cop(totalReg);

    var g = totalReg - num($("#ev-costo").value) - num($("#ev-comision").value) - num($("#ev-envio").value) - num($("#ev-gastos").value);
    $("#ev-ganancia").textContent = cop(g);
    $("#ev-ganancia").className = g < 0 ? "rojo" : "verde";

    return {
      contado: contado, inicial: inicial, n: n, monto: monto,
      interes: interes, totalCobrar: totalCobrar, saldoFin: saldoFin,
      cuota: cuota, totalReg: totalReg
    };
  }

  function toggleFinanciacion() {
    var cuotas = $("#ev-tipo").value === "cuotas";
    $("#ev-financiacion").classList.toggle("oculto", !cuotas);
    if (!cuotas) {
      $("#ev-inicial").value = 0;
      $("#ev-ncuotas").value = 0;
    }
    financiacion();
  }

  $("#ev-tipo").addEventListener("change", toggleFinanciacion);
  $$("#ev-total, #ev-costo, #ev-comision, #ev-envio, #ev-gastos, #ev-inicial, #ev-ncuotas").forEach(function (el) {
    el.addEventListener("input", financiacion);
  });
  toggleFinanciacion();

  $("#ev-unidad").addEventListener("change", function () {
    var sel = this.value;
    var u = unidades.find(function (x) { return String(x.id) === sel; });
    if (!u) return;
    $("#ev-equipo").value = u.modelo || "";
    $("#ev-cpu").value = u.cpu || "";
    $("#ev-ram").value = u.ram || "";
    $("#ev-almac").value = u.almacenamiento || "";
    $("#ev-costo").value = Number(u.costo || 0);
    $("#ev-total").value = Number(u.precio_sugerido || 0);
    $("#ev-origen").value = u.origen || "SNEIDER";
    $("#ev-dequien").value = u.de_quien_es || "";
    financiacion();
  });

  $("#form-eq-venta").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var tipo = $("#ev-tipo").value;
      var fin = financiacion();
      if (!fin.contado || fin.contado <= 0) throw new Error("Escribe el precio de venta de contado.");
      if (tipo === "cuotas") {
        if (fin.n <= 0) throw new Error("Escribe el número de cuotas.");
        if (fin.inicial < 0 || fin.inicial >= fin.contado) throw new Error("La cuota inicial debe ser menor al precio de contado.");
        if (fin.cuota <= 0) throw new Error("La cuota mensual debe ser mayor a 0.");
      }

      var totalReg = tipo === "cuotas" ? fin.totalCobrar : fin.contado;
      var inicial = tipo === "cuotas" ? fin.inicial : fin.contado;
      var ncuotas = tipo === "cuotas" ? fin.n : 0;
      var vcuota = tipo === "cuotas" ? Math.round(fin.cuota) : 0;
      var primerMes = $("#ev-primer-pago") && $("#ev-primer-pago").value ? $("#ev-primer-pago").value : mesSiguiente();
      var primerPago = primerMes + "-01";

      var venta = {
        fecha: $("#ev-fecha").value ? $("#ev-fecha").value + "T12:00:00" : new Date().toISOString(),
        unidad_id: $("#ev-unidad").value || null,
        equipo: $("#ev-equipo").value.trim(),
        cpu: $("#ev-cpu").value.trim(),
        ram: $("#ev-ram").value.trim(),
        almacenamiento: $("#ev-almac").value.trim(),
        vendedor: $("#ev-vendedor").value.trim(),
        comprador: $("#ev-comprador").value.trim(),
        contacto: $("#ev-contacto").value.trim(),
        total: totalReg,
        costo: num($("#ev-costo").value),
        comision: num($("#ev-comision").value),
        envio: num($("#ev-envio").value),
        gastos: num($("#ev-gastos").value),
        inicial: inicial,
        numero_cuotas: ncuotas,
        valor_cuota: vcuota,
        origen: $("#ev-origen").value,
        de_quien_es: $("#ev-dequien").value.trim(),
        estado_equipo: $("#ev-estado").value,
        notas: $("#ev-notas").value.trim()
      };
      if (!venta.equipo) throw new Error("Escribe el equipo.");
      if (venta.total <= 0) throw new Error("El total debe ser mayor a 0.");

      var pagos = inicial > 0 ? [{
        monto: inicial,
        metodo: $("#ev-metodo").value,
        tipo: "inicial",
        fecha: venta.fecha,
        nota: tipo === "cuotas" ? "Cuota inicial" : "Contado"
      }] : [];

      var ventaId = await db(sb.rpc("crear_venta_equipo", { p_venta: venta, p_pagos: pagos, p_agregados: [] }));
      if (ventaId) {
        var cambios = { precio_contado: fin.contado };
        if (tipo === "cuotas") cambios.primer_pago = primerPago;
        await db(sb.from("equipo_ventas").update(cambios).eq("id", ventaId));

        if (tipo === "cuotas") {
          var cuotas = await db(sb.from("equipo_cuotas").select("id,numero").eq("venta_id", ventaId).order("numero"));
          for (var i = 0; i < cuotas.length; i++) {
            await db(sb.from("equipo_cuotas")
              .update({ fecha_vencimiento: sumarMeses(primerPago, i) })
              .eq("id", cuotas[i].id));
          }
        }
      }
      cerrarModal();
      toast("Venta de equipo registrada");
      pintarEquipos();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

async function modalDetalleEq(v) {
  try {
    try {
      var fresh = await db(sb.from("v_equipo_ventas").select("*").eq("id", v.id).single());
      if (fresh) v = fresh;
    } catch (e) { /* usar el registro de la lista */ }

    var [cuotas, pagos, agregados] = await Promise.all([
      db(sb.from("equipo_cuotas").select("*").eq("venta_id", v.id).order("numero")),
      db(sb.from("equipo_pagos").select("*").eq("venta_id", v.id).order("fecha")),
      db(sb.from("equipo_venta_agregados").select("*").eq("venta_id", v.id).order("id"))
    ]);
    abrirModal(
      "<h3>Venta #" + v.numero + " · " + esc(v.equipo) + "</h3>" +
      '<p class="modal-sub">' + fdate(v.fecha) + " · " + esc(v.comprador || "Sin comprador") + " · " + esc(v.origen) + "</p>" +
      '<div class="res-linea grande"><span>Total</span><b>' + cop(v.total) + "</b></div>" +
      '<div class="res-linea mini"><span>Ganancia</span><b>' + cop(v.ganancia) + "</b></div>" +
      '<div class="res-linea mini"><span>Abonos</span><b>' + cop(v.pagado) + "</b></div>" +
      '<div class="res-linea"><span>Debe</span><b class="' + (Number(v.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(v.saldo) + "</b></div>" +
      (v.primer_pago ? '<div class="res-linea mini"><span>Primer pago</span><b>' + fdate(v.primer_pago) + "</b></div>" : "") +
      (v.en_mora ? '<div class="aviso"><i class="ti ti-alert-triangle"></i> En mora: ' + v.dias_mora + ' días. ' +
        '<button type="button" class="btn btn-sm" id="eq-wa"><i class="ti ti-brand-whatsapp"></i> Informar por WhatsApp</button></div>' : "") +
      '<div class="sep"></div>' +
      '<div class="box-head"><h3>Cuotas</h3>' + (Number(v.saldo) > 0.5 ? '<button class="btn-ghost btn-sm" id="eq-abono"><i class="ti ti-plus"></i> Abono general</button>' : "") + "</div>" +
      (cuotas.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Vence</th><th class="der">Monto</th><th class="der">Pagado</th><th>Estado</th><th></th></tr></thead><tbody>' +
        cuotas.map(function (c) {
          return "<tr><td>" + c.numero + "</td><td>" + fdate(c.fecha_vencimiento) + "</td>" +
            '<td class="der mono">' + cop(c.monto) + "</td>" +
            '<td class="der mono">' + cop(c.pagado) + "</td>" +
            "<td>" + c.estado + "</td>" +
            '<td class="der"><span class="acciones-item">' +
              '<button class="x" data-editar-cuota="' + c.id + '" title="Editar cuota"><i class="ti ti-pencil"></i></button>' +
              (c.estado !== "pagada" ? '<button class="x" data-pagar-cuota="' + c.id + '" title="Pagar cuota"><i class="ti ti-cash"></i></button>' : "") +
            "</span></td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="mini-vacio">Sin cuotas. Puedes registrar abonos generales.</p>') +
      '<div class="box-head" style="margin-top:14px"><h3>Pagos</h3></div>' +
      (pagos.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Método</th><th>Nota</th><th class="der">Monto</th><th></th></tr></thead><tbody>' +
        pagos.map(function (p) {
          return "<tr><td>" + fdatetime(p.fecha) + "</td><td>" + esc(p.tipo) + "</td><td>" + badgeMetodo(p.metodo) + "</td><td>" + esc(p.nota || "—") + "</td><td class=\"der mono\">" + cop(p.monto) + "</td>" +
            '<td class="der"><button class="x" data-borrar-pago-eq="' + p.id + '" title="Eliminar pago"><i class="ti ti-trash"></i></button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="mini-vacio">Sin pagos.</p>') +
      (agregados.length ? '<div class="box-head" style="margin-top:14px"><h3>Agregados</h3></div><div class="datos">' +
        agregados.map(function (a) { return filaDato(a.descripcion, cop(a.precio_unitario)); }).join("") + "</div>" : "") +
      '<div class="modal-acciones">' +
        '<button type="button" class="btn-ghost" id="eq-editar-venta"><i class="ti ti-edit"></i> Editar venta</button>' +
        '<button type="button" class="btn-ghost" data-cerrar>Cerrar</button></div>',
      "ancho"
    );
    var btnAb = $("#eq-abono");
    if (btnAb) btnAb.addEventListener("click", function () { modalPagoEq(v, null); });
    $$("[data-pagar-cuota]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = cuotas.find(function (x) { return String(x.id) === String(b.dataset.pagarCuota); });
        if (c) modalPagoEq(v, c);
      });
    });
    var btnEd = $("#eq-editar-venta");
    if (btnEd) btnEd.addEventListener("click", function () { modalEditarVentaEq(v); });
    var btnWa = $("#eq-wa");
    if (btnWa) btnWa.addEventListener("click", function () { eqWhatsApp(v); });
    $$("[data-editar-cuota]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = cuotas.find(function (x) { return String(x.id) === String(b.dataset.editarCuota); });
        if (c) modalEditarCuotaEq(c, v);
      });
    });
    $$("[data-borrar-pago-eq]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("¿Eliminar este pago? El saldo se recalcula.")) return;
        try {
          await db(sb.from("equipo_pagos").delete().eq("id", b.dataset.borrarPagoEq));
          toast("Pago eliminado");
          pintarEquipos();
          modalDetalleEq(v);
        } catch (err) { toast(errorDe(err), "error"); }
      });
    });
  } catch (e) { toast(errorDe(e), "error"); }
}

function modalEditarVentaEq(v) {
  abrirModal(
    "<h3>Editar venta #" + v.numero + "</h3>" +
    '<form id="form-eq-edit-venta" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Fecha</label><input id="ve-fecha" type="date" value="' + inputDate(v.fecha) + '"></div>' +
        '<div><label class="lb">Equipo</label><input id="ve-equipo" value="' + esc(v.equipo) + '" required></div>' +
        '<div><label class="lb">Comprador</label><input id="ve-comprador" value="' + esc(v.comprador || "") + '"></div>' +
        '<div><label class="lb">Contacto</label><input id="ve-contacto" value="' + esc(v.contacto || "") + '"></div>' +
        '<div><label class="lb">Precio contado</label><input id="ve-contado" type="number" value="' + Number(v.precio_contado || v.total || 0) + '"></div>' +
        '<div><label class="lb">Total</label><input id="ve-total" type="number" value="' + Number(v.total || 0) + '"></div>' +
        '<div><label class="lb">Costo</label><input id="ve-costo" type="number" value="' + Number(v.costo || 0) + '"></div>' +
        '<div><label class="lb">Comisión</label><input id="ve-comision" type="number" value="' + Number(v.comision || 0) + '"></div>' +
        '<div><label class="lb">Envío</label><input id="ve-envio" type="number" value="' + Number(v.envio || 0) + '"></div>' +
        '<div><label class="lb">Gastos</label><input id="ve-gastos" type="number" value="' + Number(v.gastos || 0) + '"></div>' +
        '<div><label class="lb">Inicial</label><input id="ve-inicial" type="number" value="' + Number(v.inicial || 0) + '"></div>' +
        '<div><label class="lb">Número de cuotas</label><input id="ve-ncuotas" type="number" value="' + Number(v.numero_cuotas || 0) + '"></div>' +
        '<div><label class="lb">Valor de cuota</label><input id="ve-vcuota" type="number" value="' + Number(v.valor_cuota || 0) + '"></div>' +
        '<div><label class="lb">Primer pago</label><input id="ve-primer-pago" type="date" value="' + inputDate(v.primer_pago) + '"></div>' +
        '<div><label class="lb">Origen</label><select id="ve-origen"><option value="SNEIDER"' + (v.origen === "SNEIDER" ? " selected" : "") + '>Sneider</option><option value="SOCIEDAD"' + (v.origen === "SOCIEDAD" ? " selected" : "") + '>Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label><input id="ve-dequien" value="' + esc(v.de_quien_es || "") + '"></div>' +
        '<div><label class="lb">Estado del equipo</label><select id="ve-estado">' +
          ["vendido", "en_reparacion", "disponible", "garantia", "devuelto"].map(function (x) {
            return '<option value="' + x + '"' + (v.estado_equipo === x ? " selected" : "") + ">" + x + "</option>";
          }).join("") + "</select></div>" +
      "</div>" +
      '<label class="lb">Notas</label><input id="ve-notas" value="' + esc(v.notas || "") + '">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );
  $("#form-eq-edit-venta").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.from("equipo_ventas").update({
        fecha: $("#ve-fecha").value ? $("#ve-fecha").value + "T12:00:00" : v.fecha,
        equipo: $("#ve-equipo").value.trim(),
        comprador: $("#ve-comprador").value.trim() || null,
        contacto: $("#ve-contacto").value.trim() || null,
        precio_contado: num($("#ve-contado").value),
        total: num($("#ve-total").value),
        costo: num($("#ve-costo").value),
        comision: num($("#ve-comision").value),
        envio: num($("#ve-envio").value),
        gastos: num($("#ve-gastos").value),
        inicial: num($("#ve-inicial").value),
        numero_cuotas: num($("#ve-ncuotas").value),
        valor_cuota: num($("#ve-vcuota").value),
        primer_pago: $("#ve-primer-pago").value || null,
        origen: $("#ve-origen").value,
        de_quien_es: $("#ve-dequien").value.trim() || null,
        estado_equipo: $("#ve-estado").value,
        notas: $("#ve-notas").value.trim() || null
      }).eq("id", v.id));
      toast("Venta actualizada");
      pintarEquipos();
      modalDetalleEq(v);
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

function modalEditarCuotaEq(c, v) {
  abrirModal(
    "<h3>Editar cuota " + c.numero + "</h3>" +
    '<form id="form-cuota-edit" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Vencimiento</label><input id="ce-fecha" type="date" value="' + inputDate(c.fecha_vencimiento) + '"></div>' +
        '<div><label class="lb">Monto</label><input id="ce-monto" type="number" value="' + Number(c.monto) + '" required></div>' +
      "</div>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>"
  );
  $("#form-cuota-edit").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.from("equipo_cuotas").update({
        fecha_vencimiento: $("#ce-fecha").value || null,
        monto: num($("#ce-monto").value)
      }).eq("id", c.id));
      toast("Cuota actualizada");
      modalDetalleEq(v);
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

function modalPagoEq(v, cuota) {
  var sugerido = cuota ? (Number(cuota.monto) - Number(cuota.pagado)) : Number(v.saldo);
  abrirModal(
    "<h3>" + (cuota ? "Pagar cuota " + cuota.numero : "Abono general") + "</h3>" +
    '<p class="modal-sub">Venta #' + v.numero + " · Debe " + cop(v.saldo) + "</p>" +
    '<form id="form-pago-eq" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Fecha</label><input id="pe-fecha" type="date" value="' + hoyInput() + '" required></div>' +
        '<div><label class="lb">Monto</label><input id="pe-monto" type="number" value="' + sugerido + '" required></div>' +
        '<div><label class="lb">Método</label><select id="pe-metodo">' + eqMetodos("efectivo") + "</select></div>" +
        '<div><label class="lb">Nota</label><input id="pe-nota" placeholder="Opcional"></div>' +
      "</div>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-check"></i> Registrar pago</button></div>' +
    "</form>"
  );
  $("#form-pago-eq").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await db(sb.rpc("registrar_pago_equipo", {
        p_venta_id: v.id,
        p_cuota_id: cuota ? cuota.id : null,
        p_monto: num($("#pe-monto").value),
        p_metodo: $("#pe-metodo").value,
        p_fecha: fechaPago($("#pe-fecha").value),
        p_nota: $("#pe-nota").value.trim()
      }));
      cerrarModal();
      toast("Pago registrado");
      pintarEquipos();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}
