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

function fechaConDia(mes, dia) {
  var p = String(mes).split("-");
  var y = Number(p[0]);
  var m = Number(p[1]);
  var ultimo = new Date(y, m, 0).getDate();
  var d = Math.min(Math.max(1, Math.round(Number(dia) || 5)), ultimo);
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function sumarMesFecha(fechaISO, meses) {
  var p = String(fechaISO).split("-");
  var y = Number(p[0]);
  var m = Number(p[1]);
  var d = Number(p[2]);
  var target = new Date(y, m - 1 + meses, 1);
  var ultimo = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  var dia = Math.min(d, ultimo);
  return target.getFullYear() + "-" + String(target.getMonth() + 1).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
}

/* ---------------- Origen, propietario y comisión ---------------- */
var DE_QUIEN_OPCIONES = [
  { k: "SNEIDER", n: "Sneider" },
  { k: "GAMBOA", n: "Gamboa" },
  { k: "AMBOS", n: "Ambos" }
];

function deQuienNorm(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

function opcionesDeQuien(actual) {
  var val = deQuienNorm(actual);
  var opts = DE_QUIEN_OPCIONES.slice();
  var existe = opts.some(function (o) { return o.k === val; });
  if (val && !existe) opts.push({ k: val, n: String(actual).trim() });
  return opts;
}

function etiquetaDeQuien(v) {
  var val = deQuienNorm(v);
  if (!val) return "—";
  var o = DE_QUIEN_OPCIONES.find(function (x) { return x.k === val; });
  return o ? o.n : String(v).trim();
}

function selectDeQuien(id, actual) {
  var val = deQuienNorm(actual) || "SNEIDER";
  return '<select id="' + id + '">' +
    opcionesDeQuien(actual || val).map(function (o) {
      return '<option value="' + esc(o.k) + '"' + (o.k === val ? " selected" : "") + ">" + esc(o.n) + "</option>";
    }).join("") + "</select>";
}

function setDeQuien(id, valor) {
  var sel = $("#" + id);
  if (!sel) return;
  var val = deQuienNorm(valor) || "SNEIDER";
  var existe = $$("option", sel).some(function (o) { return o.value === val; });
  if (!existe) {
    var opt = document.createElement("option");
    opt.value = val;
    opt.textContent = String(valor || val).trim() || val;
    sel.appendChild(opt);
  }
  sel.value = val;
}

function esComisionGamboa(origen, deQuien) {
  return String(origen || "").toUpperCase() === "SOCIEDAD" && deQuienNorm(deQuien) === "GAMBOA";
}

function comisionAutomatica(total, origen, deQuien) {
  return esComisionGamboa(origen, deQuien) ? Math.round(Number(total || 0) * 0.04) : 0;
}

/* ---------------- Gastos de inventario ---------------- */
function gastosDeUnidad(u) {
  var lista = (u && u.equipo_unidad_gastos) || [];
  return lista.map(function (g) {
    return { descripcion: g.descripcion || "", valor: Number(g.valor || 0) };
  });
}

function totalGastosUnidad(u) {
  return gastosDeUnidad(u).reduce(function (s, g) { return s + Number(g.valor || 0); }, 0);
}

function costoTotalUnidad(u) {
  return Number((u && u.costo) || 0) + totalGastosUnidad(u);
}

function errorEquipo(e) {
  if (e && (e.code === "23505" || /duplicate key|llave duplicada/i.test(String(e.message || e.details || "")))) {
    return "Ya existe un equipo con ese IMEI 1.";
  }
  return errorDe(e);
}

function htmlFilaGasto(g) {
  g = g || {};
  return '<div class="gasto-row" data-gasto>' +
    '<input class="gasto-desc" placeholder="Descripción (pantalla, batería…)" value="' + esc(g.descripcion || "") + '">' +
    '<input class="gasto-valor" type="number" min="0" placeholder="Valor" value="' + Number(g.valor || 0) + '">' +
    '<button type="button" class="x" data-quitar-gasto title="Quitar gasto"><i class="ti ti-trash"></i></button>' +
  "</div>";
}

function leerGastos(form) {
  return $$("[data-gasto]", form).map(function (row) {
    return {
      descripcion: $(".gasto-desc", row).value.trim(),
      valor: num($(".gasto-valor", row).value)
    };
  }).filter(function (g) { return !!g.descripcion; });
}

function actualizarResumenGastos(form) {
  var total = leerGastos(form).reduce(function (s, g) { return s + g.valor; }, 0);
  var tg = $("[data-gastos-total]", form);
  if (tg) tg.textContent = cop(total);

  var costo = $("[data-costo]", form);
  var ct = $("[data-costo-total]", form);
  if (ct) ct.textContent = cop(num(costo ? costo.value : 0) + total);
}

function conectarGastosForm(form, lista) {
  var cont = $("[data-gastos]", form);
  if (!cont) return;

  function agregar(g) {
    cont.insertAdjacentHTML("beforeend", htmlFilaGasto(g));
    actualizarResumenGastos(form);
  }

  (lista && lista.length ? lista : [{}]).forEach(agregar);

  form.addEventListener("click", function (e) {
    if (e.target.closest("[data-add-gasto]")) {
      agregar({});
      var filas = $$("[data-gasto]", form);
      var ultima = filas[filas.length - 1];
      if (ultima) $(".gasto-desc", ultima).focus();
      return;
    }
    var quitar = e.target.closest("[data-quitar-gasto]");
    if (quitar) {
      var row = quitar.closest("[data-gasto]");
      if (row) row.remove();
      if (!$$("[data-gasto]", form).length) agregar({});
      actualizarResumenGastos(form);
    }
  });

  form.addEventListener("input", function (e) {
    if (e.target.classList.contains("gasto-valor") || e.target.hasAttribute("data-costo")) {
      actualizarResumenGastos(form);
    }
  });
}

function eqTelefono(v) {
  var raw = String(v.contacto || "").replace(/\D/g, "");
  if (raw.length === 12 && raw.slice(0, 2) === "57") return raw;
  if (raw.length >= 10 && raw.length <= 11) return "57" + raw.slice(-10);
  var tel = String(v.cliente_telefono || "").replace(/\D/g, "");
  if (tel.length === 12 && tel.slice(0, 2) === "57") return tel;
  if (tel.length >= 10 && tel.length <= 11) return "57" + tel.slice(-10);
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

async function resumenVentasEq() {
  var filas = await dbAll(function () {
    var q = sb.from("v_equipo_ventas")
      .select("total,ganancia,pagado,saldo,cuotas_pendientes,en_mora,estado_pago,estado_equipo")
      .order("id");
    if (origenEq) q = q.eq("origen", origenEq);
    return q;
  });
  return filas.filter(eqCoincide);
}

async function pintarEquipos() {
  var zona = $("#zona-eq");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    if ($("#eq-filtros")) $("#eq-filtros").classList.toggle("oculto", modoEq === "inventario");
    if (modoEq === "inventario") {
      var q = sb.from("equipos_unidades")
        .select("*, equipo_unidad_gastos(id,descripcion,valor)")
        .in("estado", ["disponible", "en_reparacion", "consignacion"])
        .order("creado_en", { ascending: false });
      if (origenEq) q = q.eq("origen", origenEq);
      var unidades = await db(q);
      zona.innerHTML = htmlInvEq(unidades);
      conectarInvEq(unidades);
    } else {
      var buildVentas = function () {
        var qv = sb.from("v_equipo_ventas").select("*").order("fecha", { ascending: false });
        if (modoEq === "creditos") qv = qv.gt("saldo", 0.5);
        if (origenEq) qv = qv.eq("origen", origenEq);
        return qv;
      };
      if (modoEq === "creditos") {
        var todas = await dbAll(buildVentas);
        var ventasCred = todas.filter(eqCoincide);
        zona.innerHTML = htmlCreditosEq(ventasCred, ventasCred);
        conectarVentasEq(ventasCred);
      } else {
        var res = await Promise.all([
          db(buildVentas().limit(500)),
          resumenVentasEq()
        ]);
        var ventas = res[0].filter(eqCoincide);
        zona.innerHTML = htmlVentasEq(ventas, res[1]);
        conectarVentasEq(ventas);
      }
    }
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

/* ---------------- Ventas ---------------- */
function htmlVentasEq(ventas, resumen) {
  var base = resumen || ventas;
  var total = base.reduce(function (s, v) { return s + Number(v.total || 0); }, 0);
  var gan = base.reduce(function (s, v) { return s + Number(v.ganancia || 0); }, 0);
  var debe = base.reduce(function (s, v) { return s + Number(v.saldo || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Ventas", base.length, "ti-receipt") +
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
            '<td class="der"><span class="acciones-item">' +
              '<button class="x" data-ver-eq="' + v.id + '" title="Ver"><i class="ti ti-eye"></i></button>' +
              '<button class="x" data-borrar-eq="' + v.id + '" title="Eliminar venta"><i class="ti ti-trash"></i></button>' +
            "</span></td></tr>";
        }).join("") : '<tr><td colspan="10">' + vacio("Sin ventas registradas.", "ti-receipt") + "</td></tr>") +
      "</tbody></table></div>" +
      (base.length > ventas.length ? '<p class="mini-nota">Mostrando las ' + ventas.length + " ventas más recientes de " + base.length + ".</p>" : "") +
    "</div>";
}

/* ---------------- Créditos ---------------- */
function htmlCreditosEq(ventas, resumen) {
  var base = resumen || ventas;
  var debe = base.reduce(function (s, v) { return s + Number(v.saldo || 0); }, 0);
  var cuotas = base.reduce(function (s, v) { return s + Number(v.cuotas_pendientes || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Ventas con deuda", base.length, "ti-credit-card", "rojo") +
      kpi("Por cobrar", cop(debe), "ti-cash", "rojo") +
      kpi("Cuotas pendientes", cuotas, "ti-calendar-event") +
      kpi("Promedio deuda", cop(base.length ? debe / base.length : 0), "ti-chart-bar") +
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
              '<button class="x" data-borrar-eq="' + v.id + '" title="Eliminar venta"><i class="ti ti-trash"></i></button>' +
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
  $$("[data-borrar-eq]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = ventas.find(function (x) { return String(x.id) === String(b.dataset.borrarEq); });
      if (v) eliminarVentaEq(v);
    });
  });
}

async function eliminarVentaEq(v) {
  if (!confirm("¿Eliminar definitivamente la venta #" + v.numero + " de " + v.equipo + "?")) return;
  if (!confirm("Se borrarán cuotas y pagos. Si el equipo estaba en inventario, volverá a disponible. ¿Continuar?")) return;
  try {
    // Primero borrar la venta: si falla, el equipo no queda libre por error.
    await db(sb.from("equipo_ventas").delete().eq("id", v.id));
    var aviso = "";
    if (v.unidad_id) {
      try {
        await db(sb.from("equipos_unidades").update({
          estado: "disponible",
          actualizado_en: new Date().toISOString()
        }).eq("id", v.unidad_id));
      } catch (e) {
        aviso = "Venta eliminada, pero no se pudo liberar el equipo: " + errorDe(e);
      }
    }
    toast(aviso || "Venta eliminada", aviso ? "error" : "ok");
    cerrarModal();
    pintarEquipos();
  } catch (err) { toast(errorDe(err), "error"); }
}

/* Mantiene el inventario alineado con la venta. El RPC de creación deja la
   unidad en "vendido"; aquí se aplica el estado/origen elegido en el formulario.
   Devuelve null si todo salió bien o el mensaje de error. */
async function sincronizarUnidadVenta(v) {
  if (!v || !v.unidad_id) return null;
  try {
    await db(sb.from("equipos_unidades").update({
      estado: v.estado_equipo || "vendido",
      origen: v.origen || "SNEIDER",
      de_quien_es: v.de_quien_es || null,
      actualizado_en: new Date().toISOString()
    }).eq("id", v.unidad_id));
    return null;
  } catch (e) {
    return errorDe(e);
  }
}

/* ---------------- Inventario ---------------- */
function htmlInvEq(unidades) {
  var costo = unidades.reduce(function (s, u) { return s + costoTotalUnidad(u); }, 0);
  var gastos = unidades.reduce(function (s, u) { return s + totalGastosUnidad(u); }, 0);
  var precio = unidades.reduce(function (s, u) { return s + Number(u.precio_sugerido || 0); }, 0);
  return '<div class="kpis">' +
      kpi("Equipos", unidades.length, "ti-device-mobile") +
      kpi("Costo inventario", cop(costo), "ti-coin") +
      kpi("Gastos", cop(gastos), "ti-receipt") +
      kpi("Precio esperado", cop(precio), "ti-tag") +
      kpi("En reparación", unidades.filter(function (u) { return u.estado === "en_reparacion"; }).length, "ti-tool") +
    "</div>" +
    '<div class="box">' +
      '<div class="box-head"><h3><i class="ti ti-device-mobile"></i> Inventario de equipos</h3>' +
        '<button class="btn btn-sm" id="eq-nuevo"><i class="ti ti-plus"></i> Nuevo equipo</button></div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>IMEI 1</th><th>IMEI 2</th><th>S/N</th><th>Modelo</th>' +
        '<th>RAM / Alm.</th><th class="der">Costo</th><th class="der">Gastos</th><th class="der">Costo total</th>' +
        '<th class="der">Precio</th><th>Estado</th><th>Origen</th><th>De quién</th><th></th></tr></thead><tbody>' +
        (unidades.length ? unidades.map(function (u) {
          var imei1 = u.imei_1 || u.imei;
          var ramAlm = [u.ram, u.almacenamiento].filter(Boolean).join(" · ") || "—";
          return "<tr><td class=\"mono\">" + esc(imei1 || "—") + "</td><td class=\"mono\">" + esc(u.imei_2 || "—") + "</td>" +
            "<td class=\"mono\">" + esc(u.serial_number || "—") + "</td><td><b>" + esc(u.modelo) + "</b></td>" +
            "<td>" + esc(ramAlm) + "</td>" +
            '<td class="der mono">' + cop(u.costo) + "</td>" +
            '<td class="der mono">' + cop(totalGastosUnidad(u)) + "</td>" +
            '<td class="der mono">' + cop(costoTotalUnidad(u)) + "</td>" +
            '<td class="der mono">' + cop(u.precio_sugerido) + "</td>" +
            "<td>" + esc(u.estado) + "</td><td>" + esc(u.origen) + "</td><td>" + esc(etiquetaDeQuien(u.de_quien_es)) + "</td>" +
            '<td class="der"><span class="acciones-item">' +
              '<button class="x" data-editar-eq="' + u.id + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
              '<button class="x" data-borrar-unidad="' + u.id + '" title="Eliminar equipo"><i class="ti ti-trash"></i></button>' +
            "</span></td></tr>";
        }).join("") : '<tr><td colspan="13">' + vacio("Sin equipos en inventario.", "ti-device-mobile") + "</td></tr>") +
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
  $$("[data-borrar-unidad]").forEach(function (b) {
    b.addEventListener("click", async function () {
      var u = (unidades || []).find(function (x) { return String(x.id) === String(b.dataset.borrarUnidad); });
      if (!u) return;
      if (!confirm("¿Eliminar el equipo " + u.modelo + " del inventario?")) return;
      try {
        await db(sb.from("equipos_unidades").delete().eq("id", u.id));
        toast("Equipo eliminado");
        pintarEquipos();
      } catch (err) { toast(errorDe(err), "error"); }
    });
  });
}

function modalEditarEquipo(u) {
  abrirModal(
    "<h3>Editar equipo</h3>" +
    '<form id="form-eq-edit" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">IMEI 1 *</label><input id="ee-imei1" value="' + esc(u.imei_1 || u.imei || "") + '" required></div>' +
        '<div><label class="lb">IMEI 2</label><input id="ee-imei2" value="' + esc(u.imei_2 || "") + '"></div>' +
        '<div><label class="lb">Serial / S/N</label><input id="ee-serial" value="' + esc(u.serial_number || "") + '"></div>' +
        '<div><label class="lb">Modelo *</label><input id="ee-modelo" value="' + esc(u.modelo) + '" required></div>' +
        '<div><label class="lb">CPU</label><input id="ee-cpu" value="' + esc(u.cpu || "") + '"></div>' +
        '<div><label class="lb">RAM</label><input id="ee-ram" value="' + esc(u.ram || "") + '"></div>' +
        '<div><label class="lb">Almacenamiento</label><input id="ee-almac" value="' + esc(u.almacenamiento || "") + '"></div>' +
        '<div><label class="lb">Color</label><input id="ee-color" value="' + esc(u.color || "") + '"></div>' +
        '<div><label class="lb">Proveedor</label><input id="ee-vendor" value="' + esc(u.vendor_name || "") + '"></div>' +
        '<div><label class="lb">Contacto proveedor</label><input id="ee-vendor-contact" value="' + esc(u.vendor_contact || "") + '"></div>' +
        '<div><label class="lb">Costo</label><input id="ee-costo" data-costo type="number" value="' + Number(u.costo || 0) + '"></div>' +
        '<div><label class="lb">Precio esperado</label><input id="ee-precio" type="number" value="' + Number(u.precio_sugerido || 0) + '"></div>' +
        '<div><label class="lb">Estado</label><select id="ee-estado">' +
          ["disponible", "en_reparacion", "consignacion", "vendido", "garantia", "devuelto"].map(function (x) {
            return '<option value="' + x + '"' + (u.estado === x ? " selected" : "") + ">" + x + "</option>";
          }).join("") + "</select></div>" +
        '<div><label class="lb">Origen</label><select id="ee-origen"><option value="SNEIDER"' + (u.origen === "SNEIDER" ? " selected" : "") + '>Sneider</option><option value="SOCIEDAD"' + (u.origen === "SOCIEDAD" ? " selected" : "") + '>Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label>' + selectDeQuien("ee-dequien", u.de_quien_es) + '</div>' +
      "</div>" +
      '<div class="gastos-caja">' +
        '<div class="gastos-head"><label class="lb">Gastos del equipo</label>' +
          '<button type="button" class="btn-ghost btn-sm" data-add-gasto><i class="ti ti-plus"></i> Agregar gasto</button></div>' +
        '<div class="gastos-lista" data-gastos></div>' +
        '<div class="gastos-total mini">Total gastos: <b data-gastos-total>$0</b></div>' +
      "</div>" +
      '<div class="gastos-total mini">Costo total (costo + gastos): <b data-costo-total>$0</b></div>' +
      '<label class="lb">Notas</label><input id="ee-notas" value="' + esc(u.notas || "") + '">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );
  var form = $("#form-eq-edit");
  conectarGastosForm(form, gastosDeUnidad(u));
  actualizarResumenGastos(form);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var costo = num($("#ee-costo").value);
      var precio = num($("#ee-precio").value);
      if (costo < 0 || precio < 0) throw new Error("El costo y el precio no pueden ser negativos.");
      await db(sb.rpc("guardar_equipo_unidad", {
        p_unidad: {
          id: u.id,
          imei_1: $("#ee-imei1").value.trim(),
          imei_2: $("#ee-imei2").value.trim(),
          serial_number: $("#ee-serial").value.trim(),
          modelo: $("#ee-modelo").value.trim(),
          cpu: $("#ee-cpu").value.trim(),
          ram: $("#ee-ram").value.trim(),
          almacenamiento: $("#ee-almac").value.trim(),
          color: $("#ee-color").value.trim(),
          costo: costo,
          precio_sugerido: precio,
          estado: $("#ee-estado").value,
          origen: $("#ee-origen").value,
          de_quien_es: $("#ee-dequien").value,
          vendor_name: $("#ee-vendor").value.trim(),
          vendor_contact: $("#ee-vendor-contact").value.trim(),
          notas: $("#ee-notas").value.trim()
        },
        p_gastos: leerGastos(form)
      }));
      cerrarModal();
      toast("Equipo actualizado");
      pintarEquipos();
    } catch (err) { toast(errorEquipo(err), "error"); }
  });
}

/* ---------------- Modales ---------------- */
function modalNuevoEquipo() {
  abrirModal(
    "<h3>Nuevo equipo en inventario</h3>" +
    '<form id="form-eq-nuevo" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">IMEI 1 *</label><input id="en-imei1" placeholder="Obligatorio" required></div>' +
        '<div><label class="lb">IMEI 2</label><input id="en-imei2" placeholder="Opcional"></div>' +
        '<div><label class="lb">Serial / S/N</label><input id="en-serial" placeholder="Opcional"></div>' +
        '<div><label class="lb">Modelo *</label><input id="en-modelo" placeholder="iPhone 13" required></div>' +
        '<div><label class="lb">CPU</label><input id="en-cpu" placeholder="Opcional"></div>' +
        '<div><label class="lb">RAM</label><input id="en-ram" placeholder="4GB"></div>' +
        '<div><label class="lb">Almacenamiento</label><input id="en-almac" placeholder="128GB"></div>' +
        '<div><label class="lb">Color</label><input id="en-color" placeholder="Opcional"></div>' +
        '<div><label class="lb">Proveedor</label><input id="en-vendor" placeholder="Nombre del vendedor"></div>' +
        '<div><label class="lb">Contacto proveedor</label><input id="en-vendor-contact" placeholder="Teléfono"></div>' +
        '<div><label class="lb">Costo</label><input id="en-costo" data-costo type="number" value="0"></div>' +
        '<div><label class="lb">Precio esperado</label><input id="en-precio" type="number" value="0"></div>' +
        '<div><label class="lb">Origen</label><select id="en-origen"><option value="SNEIDER">Sneider</option><option value="SOCIEDAD">Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label>' + selectDeQuien("en-dequien", "SNEIDER") + '</div>' +
      "</div>" +
      '<div class="gastos-caja">' +
        '<div class="gastos-head"><label class="lb">Gastos del equipo</label>' +
          '<button type="button" class="btn-ghost btn-sm" data-add-gasto><i class="ti ti-plus"></i> Agregar gasto</button></div>' +
        '<div class="gastos-lista" data-gastos></div>' +
        '<div class="gastos-total mini">Total gastos: <b data-gastos-total>$0</b></div>' +
      "</div>" +
      '<div class="gastos-total mini">Costo total (costo + gastos): <b data-costo-total>$0</b></div>' +
      '<label class="lb">Notas</label><input id="en-notas" placeholder="Opcional">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );
  var form = $("#form-eq-nuevo");
  conectarGastosForm(form, []);
  actualizarResumenGastos(form);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var costo = num($("#en-costo").value);
      var precio = num($("#en-precio").value);
      if (costo < 0 || precio < 0) throw new Error("El costo y el precio no pueden ser negativos.");
      await db(sb.rpc("guardar_equipo_unidad", {
        p_unidad: {
          imei_1: $("#en-imei1").value.trim(),
          imei_2: $("#en-imei2").value.trim(),
          serial_number: $("#en-serial").value.trim(),
          modelo: $("#en-modelo").value.trim(),
          cpu: $("#en-cpu").value.trim(),
          ram: $("#en-ram").value.trim(),
          almacenamiento: $("#en-almac").value.trim(),
          color: $("#en-color").value.trim(),
          costo: costo,
          precio_sugerido: precio,
          estado: "disponible",
          origen: $("#en-origen").value,
          de_quien_es: $("#en-dequien").value,
          vendor_name: $("#en-vendor").value.trim(),
          vendor_contact: $("#en-vendor-contact").value.trim(),
          notas: $("#en-notas").value.trim()
        },
        p_gastos: leerGastos(form)
      }));
      cerrarModal();
      toast("Equipo registrado");
      pintarEquipos();
    } catch (err) { toast(errorEquipo(err), "error"); }
  });
}

async function modalVentaEq() {
  var q = sb.from("equipos_unidades")
    .select("*, equipo_unidad_gastos(id,descripcion,valor)")
    .in("estado", ["disponible", "en_reparacion", "consignacion"])
    .order("modelo");
  if (origenEq) q = q.eq("origen", origenEq);
  var unidades = [];
  try { unidades = await db(q); } catch (e) { unidades = []; }

  abrirModal(
    "<h3>Nueva venta de equipo</h3>" +
    '<form id="form-eq-venta" class="form-modal">' +
      '<label class="lb">Equipo del inventario (opcional)</label>' +
      '<select id="ev-unidad"><option value="">Venta libre / sin IMEI</option>' +
        unidades.map(function (u) {
          return '<option value="' + u.id + '">' + esc(u.modelo) + " · " + esc(u.ram || "") + " " + esc(u.almacenamiento || "") + " · IMEI " + esc(u.imei_1 || u.imei || "—") + "</option>";
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
        '<div id="ev-comision-wrap" class="oculto"><label class="lb">Comisión (4% Sneider)</label><input id="ev-comision" type="number" value="0" readonly></div>' +
        '<div><label class="lb">Envío</label><input id="ev-envio" type="number" value="0"></div>' +
        '<div><label class="lb">Gastos</label><input id="ev-gastos" type="number" value="0"></div>' +
        '<div><label class="lb">Origen</label><select id="ev-origen"><option value="SNEIDER">Sneider</option><option value="SOCIEDAD">Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label>' + selectDeQuien("ev-dequien", "SNEIDER") + '</div>' +
        '<div><label class="lb">Estado del equipo</label><select id="ev-estado"><option value="vendido">Vendido</option><option value="en_reparacion">En reparación</option><option value="disponible">Disponible</option></select></div>' +
      "</div>" +
      '<div id="ev-financiacion" class="box oculto" style="margin-top:12px;margin-bottom:0">' +
        '<div class="grid-2-in">' +
          '<div><label class="lb">Cuota inicial</label><input id="ev-inicial" type="number" value="0"></div>' +
          '<div><label class="lb">Número de cuotas</label><input id="ev-ncuotas" type="number" value="0"></div>' +
          '<div><label class="lb">Fecha límite cuota 1</label><input id="ev-primer-pago" type="date" value="' + fechaConDia(mesSiguiente(), 5) + '"></div>' +
          '<div><label class="lb">Cuota mensual (calculada)</label><input id="ev-vcuota" type="number" readonly></div>' +
        "</div>" +
        '<div class="sep"></div>' +
        '<div class="res-linea mini"><span>Monto a financiar</span><b id="ev-fin-monto">$0</b></div>' +
        '<div class="res-linea mini"><span>Interés (70% anual)</span><b id="ev-fin-interes">$0</b></div>' +
        '<div class="res-linea mini"><span>Total a cobrar con interés</span><b id="ev-fin-total">$0</b></div>' +
        '<div id="ev-cuotas-preview" class="tabla-wrap" style="margin-top:10px"></div>' +
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
    var contado = Math.round(num($("#ev-total").value));
    var inicial = Math.round(num($("#ev-inicial").value));
    var n = Math.max(0, Math.round(num($("#ev-ncuotas").value)));
    var monto = Math.max(contado - inicial, 0);
    var interes = Math.round(monto * 0.70 * (n / 12));
    var totalCobrar = contado + interes;
    var saldoFin = Math.max(totalCobrar - inicial, 0);
    var base = n > 0 ? Math.round(saldoFin / n) : 0;
    var tipo = $("#ev-tipo").value;
    var totalReg = tipo === "cuotas" ? totalCobrar : contado;
    var fecha1 = $("#ev-primer-pago") ? $("#ev-primer-pago").value : "";
    var origen = $("#ev-origen").value;
    var deQuien = $("#ev-dequien").value;
    var comision = comisionAutomatica(totalReg, origen, deQuien);

    $("#ev-comision").value = comision;
    $("#ev-comision-wrap").classList.toggle("oculto", !esComisionGamboa(origen, deQuien));

    $("#ev-vcuota").value = tipo === "cuotas" ? base : 0;
    $("#ev-fin-monto").textContent = cop(monto);
    $("#ev-fin-interes").textContent = cop(interes);
    $("#ev-fin-total").textContent = cop(totalCobrar);
    $("#ev-total-reg").textContent = cop(totalReg);

    var g = totalReg - num($("#ev-costo").value) - comision - num($("#ev-envio").value) - num($("#ev-gastos").value);
    $("#ev-ganancia").textContent = cop(g);
    $("#ev-ganancia").className = g < 0 ? "rojo" : "verde";

    var prev = $("#ev-cuotas-preview");
    if (prev) {
      if (tipo === "cuotas" && n > 0 && fecha1) {
        var acum = 0;
        var html = '<table class="tabla"><thead><tr><th>Cuota</th><th>Vence</th><th class="der">Monto</th></tr></thead><tbody>';
        for (var i = 1; i <= n; i++) {
          var montoCuota = i === n ? saldoFin - acum : base;
          acum += montoCuota;
          html += "<tr><td>" + i + "</td><td>" + fdate(sumarMesFecha(fecha1, i - 1)) + '</td><td class="der mono">' + cop(montoCuota) + "</td></tr>";
        }
        html += "</tbody></table>";
        prev.innerHTML = html;
      } else {
        prev.innerHTML = '<p class="mini-vacio">Completa los datos para ver las cuotas.</p>';
      }
    }

    return {
      contado: contado, inicial: inicial, n: n, monto: monto,
      interes: interes, totalCobrar: totalCobrar, saldoFin: saldoFin,
      base: base, totalReg: totalReg, fecha1: fecha1, comision: comision
    };
  }

  function aplicarReglaVenta() {
    var origen = $("#ev-origen").value;
    var deq = $("#ev-dequien");
    if (origen === "SNEIDER") {
      setDeQuien("ev-dequien", "SNEIDER");
      deq.disabled = true;
    } else {
      deq.disabled = false;
    }
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
  $("#ev-origen").addEventListener("change", function () {
    aplicarReglaVenta();
    financiacion();
  });
  $("#ev-dequien").addEventListener("change", financiacion);
  $$("#ev-total, #ev-costo, #ev-envio, #ev-gastos, #ev-inicial, #ev-ncuotas, #ev-primer-pago").forEach(function (el) {
    el.addEventListener("input", financiacion);
  });
  aplicarReglaVenta();
  toggleFinanciacion();

  $("#ev-unidad").addEventListener("change", function () {
    var sel = this.value;
    var u = unidades.find(function (x) { return String(x.id) === sel; });
    if (!u) return;
    $("#ev-equipo").value = u.modelo || "";
    $("#ev-cpu").value = u.cpu || "";
    $("#ev-ram").value = u.ram || "";
    $("#ev-almac").value = u.almacenamiento || "";
    $("#ev-costo").value = costoTotalUnidad(u);
    $("#ev-total").value = Number(u.precio_sugerido || 0);
    $("#ev-origen").value = u.origen || "SNEIDER";
    setDeQuien("ev-dequien", u.de_quien_es || "SNEIDER");
    aplicarReglaVenta();
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
        if (!fin.fecha1) throw new Error("Escribe la fecha límite de la cuota 1.");
        if (fin.inicial < 0 || fin.inicial >= fin.contado) throw new Error("La cuota inicial debe ser menor al precio de contado.");
        if (fin.base <= 0) throw new Error("La cuota mensual debe ser mayor a 0.");
      }

      var totalReg = fin.totalReg;
      var inicial = tipo === "cuotas" ? fin.inicial : fin.contado;
      var ncuotas = tipo === "cuotas" ? fin.n : 0;
      var vcuota = tipo === "cuotas" ? fin.base : 0;
      var primerPago = tipo === "cuotas" ? fin.fecha1 : null;
      var diaLimite = primerPago ? Number(primerPago.slice(8, 10)) : 5;

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
        precio_contado: fin.contado,
        costo: num($("#ev-costo").value),
        comision: fin.comision,
        envio: num($("#ev-envio").value),
        gastos: num($("#ev-gastos").value),
        inicial: inicial,
        numero_cuotas: ncuotas,
        valor_cuota: vcuota,
        primer_pago: primerPago,
        dia_limite: diaLimite,
        origen: $("#ev-origen").value,
        de_quien_es: $("#ev-dequien").value,
        estado_equipo: $("#ev-estado").value,
        notas: $("#ev-notas").value.trim()
      };
      if (!venta.equipo) throw new Error("Escribe el equipo.");
      if (venta.total <= 0) throw new Error("El total debe ser mayor a 0.");
      if (venta.costo < 0 || venta.envio < 0 || venta.gastos < 0) {
        throw new Error("El costo, el envío y los gastos no pueden ser negativos.");
      }

      var pagos = inicial > 0 ? [{
        monto: inicial,
        metodo: $("#ev-metodo").value,
        tipo: "inicial",
        fecha: venta.fecha,
        nota: tipo === "cuotas" ? "Cuota inicial" : "Contado"
      }] : [];

      var ventaId = await db(sb.rpc("crear_venta_equipo", { p_venta: venta, p_pagos: pagos, p_agregados: [] }));
      var syncErr = await sincronizarUnidadVenta(venta);
      cerrarModal();
      if (syncErr) toast("Venta registrada, pero no se actualizó el inventario: " + syncErr, "error");
      else toast("Venta de equipo registrada");
      pintarEquipos();
      if (ventaId) {
        try {
          var nueva = await db(sb.from("v_equipo_ventas").select("*").eq("id", ventaId).single());
          if (nueva) modalDetalleEq(nueva);
        } catch (e) { /* la venta ya quedó creada */ }
      }
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
    var cuotaNum = {};
    cuotas.forEach(function (c) { cuotaNum[c.id] = c.numero; });
    abrirModal(
      "<h3>Venta #" + v.numero + " · " + esc(v.equipo) + "</h3>" +
      '<p class="modal-sub">' + fdate(v.fecha) + " · " + esc(v.comprador || "Sin comprador") + " · " + esc(v.origen) + "</p>" +
      '<div class="res-linea grande"><span>Total</span><b>' + cop(v.total) + "</b></div>" +
      '<div class="res-linea mini"><span>Ganancia</span><b>' + cop(v.ganancia) + "</b></div>" +
      '<div class="res-linea mini"><span>Comisión</span><b>' + cop(v.comision) + "</b></div>" +
      '<div class="res-linea mini"><span>Abonos</span><b>' + cop(v.pagado) + "</b></div>" +
      '<div class="res-linea"><span>Debe</span><b class="' + (Number(v.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(v.saldo) + "</b></div>" +
      (v.en_mora ? '<div class="aviso"><i class="ti ti-alert-triangle"></i> En mora: ' + v.dias_mora + ' días. ' +
        '<button type="button" class="btn btn-sm" id="eq-wa"><i class="ti ti-brand-whatsapp"></i> Informar por WhatsApp</button></div>' : "") +
      '<div class="datos" style="margin-top:10px">' +
        filaDato("Fecha de venta", fdate(v.fecha)) +
        filaDato("Primer pago", v.primer_pago ? fdate(v.primer_pago) : "—") +
        filaDato("Día límite", v.dia_limite || 5) +
        filaDato("Cuotas", v.numero_cuotas || 0) +
        filaDato("Valor cuota", cop(v.valor_cuota || 0)) +
      "</div>" +
      '<div class="sep"></div>' +
      '<div class="box-head"><h3>Cuotas</h3><div class="acciones-head">' +
        '<button class="btn-ghost btn-sm" id="eq-add-cuota"><i class="ti ti-plus"></i> Agregar cuota</button>' +
        (Number(v.saldo) > 0.5 ? '<button class="btn-ghost btn-sm" id="eq-abono"><i class="ti ti-plus"></i> Abono general</button>' : "") +
      "</div></div>" +
      (cuotas.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Vence</th><th class="der">Monto</th><th class="der">Pagado</th><th>Estado</th><th>Cumplimiento</th><th></th></tr></thead><tbody>' +
        cuotas.map(function (c) {
          var mora = c.estado !== "pagada" && c.fecha_vencimiento && c.fecha_vencimiento < hoyInput();
          var cumpl = c.estado === "pagada" ? "Pagada" : (mora ? "En mora (" + diasEntre(c.fecha_vencimiento, new Date()) + "d)" : "Al día");
          return "<tr><td>" + c.numero + "</td><td>" + fdate(c.fecha_vencimiento) + "</td>" +
            '<td class="der mono">' + cop(c.monto) + "</td>" +
            '<td class="der mono">' + cop(c.pagado) + "</td>" +
            "<td>" + c.estado + "</td>" +
            '<td class="' + (mora ? "rojo" : (c.estado === "pagada" ? "verde" : "")) + '">' + cumpl + "</td>" +
            '<td class="der"><span class="acciones-item">' +
              '<button class="x" data-editar-cuota="' + c.id + '" title="Editar cuota"><i class="ti ti-pencil"></i></button>' +
              (c.estado !== "pagada" ? '<button class="x" data-pagar-cuota="' + c.id + '" title="Registrar pago de esta cuota"><i class="ti ti-cash"></i></button>' : "") +
              '<button class="x" data-borrar-cuota="' + c.id + '" title="Eliminar cuota"><i class="ti ti-trash"></i></button>' +
            "</span></td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="mini-vacio">Sin cuotas. Puedes registrar abonos generales.</p>') +
      '<div class="box-head" style="margin-top:14px"><h3>Pagos</h3></div>' +
      (pagos.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Cuota</th><th>Tipo</th><th>Método</th><th>Nota</th><th class="der">Monto</th><th></th></tr></thead><tbody>' +
        pagos.map(function (p) {
          return "<tr><td>" + fdatetime(p.fecha) + "</td><td>" + (p.cuota_id ? "#" + (cuotaNum[p.cuota_id] || "—") : "General") + "</td><td>" + esc(p.tipo) + "</td><td>" + badgeMetodo(p.metodo) + "</td><td>" + esc(p.nota || "—") + "</td><td class=\"der mono\">" + cop(p.monto) + "</td>" +
            '<td class="der"><button class="x" data-borrar-pago-eq="' + p.id + '" title="Eliminar pago"><i class="ti ti-trash"></i></button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="mini-vacio">Sin pagos.</p>') +
      (agregados.length ? '<div class="box-head" style="margin-top:14px"><h3>Agregados</h3></div><div class="datos">' +
        agregados.map(function (a) { return filaDato(a.descripcion, cop(a.precio_unitario)); }).join("") + "</div>" : "") +
      '<div class="modal-acciones">' +
        '<button type="button" class="btn-ghost" id="eq-editar-venta"><i class="ti ti-edit"></i> Editar venta</button>' +
        '<button type="button" class="btn-ghost" id="eq-borrar-venta"><i class="ti ti-trash"></i> Eliminar venta</button>' +
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
    var btnAddCuota = $("#eq-add-cuota");
    if (btnAddCuota) btnAddCuota.addEventListener("click", function () { modalAgregarCuotaEq(v, cuotas); });
    $$("[data-borrar-cuota]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("¿Eliminar esta cuota? Los pagos asociados quedan como abonos generales.")) return;
        try {
          await db(sb.from("equipo_cuotas").delete().eq("id", b.dataset.borrarCuota));
          toast("Cuota eliminada");
          pintarEquipos();
          modalDetalleEq(v);
        } catch (err) { toast(errorDe(err), "error"); }
      });
    });
    var btnEd = $("#eq-editar-venta");
    if (btnEd) btnEd.addEventListener("click", function () { modalEditarVentaEq(v); });
    var btnWa = $("#eq-wa");
    if (btnWa) btnWa.addEventListener("click", function () { eqWhatsApp(v); });
    var btnDelVenta = $("#eq-borrar-venta");
    if (btnDelVenta) btnDelVenta.addEventListener("click", function () { eliminarVentaEq(v); });
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
        '<div><label class="lb">Precio contado</label><input id="ve-contado" type="number" value="' + Number(v.precio_contado || v.total || 0) + '" readonly></div>' +
        '<div><label class="lb">Total</label><input id="ve-total" type="number" value="' + Number(v.total || 0) + '" readonly></div>' +
        '<div><label class="lb">Costo</label><input id="ve-costo" type="number" value="' + Number(v.costo || 0) + '"></div>' +
        '<div id="ve-comision-wrap"><label class="lb">Comisión (4% Sneider)</label><input id="ve-comision" type="number" value="' + Number(v.comision || 0) + '" readonly></div>' +
        '<div><label class="lb">Envío</label><input id="ve-envio" type="number" value="' + Number(v.envio || 0) + '"></div>' +
        '<div><label class="lb">Gastos</label><input id="ve-gastos" type="number" value="' + Number(v.gastos || 0) + '"></div>' +
        '<div><label class="lb">Inicial</label><input id="ve-inicial" type="number" value="' + Number(v.inicial || 0) + '" readonly></div>' +
        '<div><label class="lb">Número de cuotas</label><input id="ve-ncuotas" type="number" value="' + Number(v.numero_cuotas || 0) + '" readonly></div>' +
        '<div><label class="lb">Valor de cuota</label><input id="ve-vcuota" type="number" value="' + Number(v.valor_cuota || 0) + '" readonly></div>' +
        '<div><label class="lb">Primer pago</label><input id="ve-primer-pago" type="date" value="' + inputDate(v.primer_pago) + '" readonly></div>' +
        '<div><label class="lb">Día límite de pago</label><input id="ve-dia-limite" type="number" min="1" max="31" value="' + Number(v.dia_limite || 5) + '"></div>' +
        '<div><label class="lb">Origen</label><select id="ve-origen"><option value="SNEIDER"' + (v.origen === "SNEIDER" ? " selected" : "") + '>Sneider</option><option value="SOCIEDAD"' + (v.origen === "SOCIEDAD" ? " selected" : "") + '>Sociedad</option></select></div>' +
        '<div><label class="lb">De quién es</label>' + selectDeQuien("ve-dequien", v.de_quien_es) + '</div>' +
        '<div><label class="lb">Estado del equipo</label><select id="ve-estado">' +
          ["vendido", "en_reparacion", "disponible", "garantia", "devuelto"].map(function (x) {
            return '<option value="' + x + '"' + (v.estado_equipo === x ? " selected" : "") + ">" + x + "</option>";
          }).join("") + "</select></div>" +
      "</div>" +
      '<p class="mini-nota">El plan de cuotas no se modifica desde aquí: usa las acciones de cada cuota en el detalle. Para cambiar el total, elimina y vuelve a crear la venta.</p>' +
      '<label class="lb">Notas</label><input id="ve-notas" value="' + esc(v.notas || "") + '">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );

  var reglaCambiada = false;

  function aplicarReglaEdit(forzar) {
    var origen = $("#ve-origen").value;
    var deq = $("#ve-dequien");
    if (origen === "SNEIDER") {
      if (forzar) setDeQuien("ve-dequien", "SNEIDER");
      deq.disabled = true;
    } else {
      deq.disabled = false;
    }

    var gamboa = esComisionGamboa(origen, deq.value);
    $("#ve-comision-wrap").classList.toggle("oculto", !gamboa);

    if (reglaCambiada) {
      $("#ve-comision").value = gamboa
        ? comisionAutomatica(num($("#ve-total").value), origen, deq.value)
        : 0;
    }
  }

  $("#ve-origen").addEventListener("change", function () {
    reglaCambiada = true;
    aplicarReglaEdit(true);
  });
  $("#ve-dequien").addEventListener("change", function () {
    reglaCambiada = true;
    aplicarReglaEdit(false);
  });
  $("#ve-total").addEventListener("input", function () {
    if (esComisionGamboa($("#ve-origen").value, $("#ve-dequien").value)) {
      reglaCambiada = true;
    }
    aplicarReglaEdit(false);
  });
  aplicarReglaEdit(false);

  $("#form-eq-edit-venta").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var diaNuevo = Math.min(31, Math.max(1, Math.round(num($("#ve-dia-limite").value) || 5)));
      if (num($("#ve-costo").value) < 0 || num($("#ve-envio").value) < 0 || num($("#ve-gastos").value) < 0) {
        throw new Error("El costo, el envío y los gastos no pueden ser negativos.");
      }
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
        dia_limite: diaNuevo,
        origen: $("#ve-origen").value,
        de_quien_es: $("#ve-dequien").value || null,
        estado_equipo: $("#ve-estado").value,
        notas: $("#ve-notas").value.trim() || null
      }).eq("id", v.id));

      if (diaNuevo !== Number(v.dia_limite || 5)) {
        await db(sb.rpc("aplicar_dia_limite", { p_venta_id: v.id, p_dia: diaNuevo }));
      }

      var syncErr = await sincronizarUnidadVenta({
        unidad_id: v.unidad_id,
        estado_equipo: $("#ve-estado").value,
        origen: $("#ve-origen").value,
        de_quien_es: $("#ve-dequien").value
      });

      if (syncErr) toast("Venta actualizada, pero no se actualizó el inventario: " + syncErr, "error");
      else toast("Venta actualizada");
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

function modalAgregarCuotaEq(v, cuotas) {
  var next = (cuotas || []).reduce(function (m, c) { return Math.max(m, Number(c.numero) || 0); }, 0) + 1;
  abrirModal(
    "<h3>Agregar cuota</h3>" +
    '<p class="modal-sub">Venta #' + v.numero + " · Debe " + cop(v.saldo) + "</p>" +
    '<form id="form-add-cuota" class="form-modal">' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Número de cuota</label><input id="ac-numero" type="number" value="' + next + '" required></div>' +
        '<div><label class="lb">Vencimiento</label><input id="ac-fecha" type="date" value="' + (v.primer_pago ? inputDate(v.primer_pago) : hoyInput()) + '"></div>' +
        '<div><label class="lb">Monto</label><input id="ac-monto" type="number" value="' + Number(v.valor_cuota || 0) + '" required></div>' +
        '<div><label class="lb">Método si ya está pagada</label><select id="ac-metodo">' + eqMetodos("efectivo") + "</select></div>" +
        '<div><label class="lb">Fecha de pago</label><input id="ac-fecha-pago" type="date" value="' + hoyInput() + '"></div>' +
        '<div><label class="lb">Estado</label><label style="display:flex;align-items:center;gap:8px;height:38px"><input type="checkbox" id="ac-pagada" checked style="width:auto;height:auto"> Registrar el pago ahora</label></div>' +
      "</div>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button type="submit" class="btn"><i class="ti ti-check"></i> Agregar cuota</button></div>' +
    "</form>"
  );
  $("#form-add-cuota").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var monto = num($("#ac-monto").value);
      if (monto <= 0) throw new Error("El monto debe ser mayor a 0.");
      if ($("#ac-pagada").checked && monto > Number(v.saldo) + 0.5) {
        throw new Error("El pago supera el saldo pendiente (" + cop(v.saldo) + ").");
      }

      var c = await db(sb.from("equipo_cuotas").insert({
        venta_id: v.id,
        numero: num($("#ac-numero").value),
        fecha_vencimiento: $("#ac-fecha").value || null,
        monto: monto
      }).select().single());

      if ($("#ac-pagada").checked) {
        await db(sb.from("equipo_pagos").insert({
          venta_id: v.id,
          cuota_id: c.id,
          fecha: fechaPago($("#ac-fecha-pago").value),
          monto: monto,
          metodo: $("#ac-metodo").value,
          tipo: "cuota",
          nota: "Cuota histórica",
          usuario: (await sesionActual()).user.id
        }));
      }

      toast("Cuota agregada");
      pintarEquipos();
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
      toast("Pago registrado");
      pintarEquipos();
      modalDetalleEq(v);
    } catch (err) { toast(errorDe(err), "error"); }
  });
}
