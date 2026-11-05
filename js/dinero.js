/* ============================================================
   SIR·TECH POS · Dinero / Caja
   ============================================================ */

var rangoDinero = null;

function rangoMesActual() {
  var hoy = new Date();
  var d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: inputDate(d), hasta: hoyInput() };
}

async function vistaDinero() {
  if (!rangoDinero) rangoDinero = rangoMesActual();

  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Dinero</h2><p class="sub">Caja, gastos y movimientos</p></div>' +
      '<button class="btn" id="btn-mov"><i class="ti ti-plus"></i> Movimiento</button>' +
    "</div>" +
    '<div class="filtros">' +
      '<label class="lb-inline">Desde</label><input type="date" id="d-desde" value="' + rangoDinero.desde + '">' +
      '<label class="lb-inline">Hasta</label><input type="date" id="d-hasta" value="' + rangoDinero.hasta + '">' +
      '<button class="btn-ghost" id="d-mes">Este mes</button>' +
    "</div>" +
    '<div id="zona-dinero">' + cargando() + "</div>";

  $("#btn-mov").addEventListener("click", function () { modalMovimiento(); });
  $("#d-mes").addEventListener("click", function () { rangoDinero = rangoMesActual(); vistaDinero(); });
  $("#d-desde").addEventListener("change", function () { rangoDinero.desde = this.value; pintarDinero(); });
  $("#d-hasta").addEventListener("change", function () { rangoDinero.hasta = this.value; pintarDinero(); });

  pintarDinero();
}

async function pintarDinero() {
  var zona = $("#zona-dinero");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    var res = await Promise.all([
      pagosEntre(rangoDinero.desde, rangoDinero.hasta),
      movimientosEntre(rangoDinero.desde, rangoDinero.hasta),
      listarMovimientos(rangoDinero.desde, rangoDinero.hasta)
    ]);
    var pagos = res[0];
    var movs = res[1];
    var detalle = res[2];

    var caja = { efectivo: 0, nequi: 0 };
    var otros = { transferencia: 0, tarjeta: 0, otro: 0 };

    pagos.forEach(function (p) {
      if (p.metodo === "efectivo") caja.efectivo += Number(p.monto);
      else if (p.metodo === "nequi") caja.nequi += Number(p.monto);
      else otros[p.metodo] = (otros[p.metodo] || 0) + Number(p.monto);
    });

    var gastos = 0, ingresosExtras = 0;
    movs.forEach(function (m) {
      var v = Number(m.monto);
      if (m.tipo === "gasto" || m.tipo === "proveedor") { caja[m.cuenta] -= v; gastos += v; }
      else if (m.tipo === "retiro") { caja[m.cuenta] -= v; }
      else if (m.tipo === "abono") { caja[m.cuenta] -= v; }
      else if (m.tipo === "prestamo" || m.tipo === "ingreso") { caja[m.cuenta] += v; ingresosExtras += v; }
      else if (m.tipo === "traslado") {
        caja[m.cuenta] -= v;
        caja[m.cuenta === "efectivo" ? "nequi" : "efectivo"] += v;
      }
    });

    var totalPagos = pagos.reduce(function (s, p) { return s + Number(p.monto); }, 0);
    var cobrado = detalle.slice();

    zona.innerHTML =
      '<div class="kpis">' +
        kpi("Efectivo", cop(caja.efectivo), "ti-cash", caja.efectivo < 0 ? "rojo" : "verde") +
        kpi("Nequi", cop(caja.nequi), "ti-device-mobile", caja.nequi < 0 ? "rojo" : "verde") +
        kpi("Cobrado", cop(totalPagos), "ti-receipt") +
        kpi("Gastos", cop(gastos), "ti-trending-down", "rojo") +
      "</div>" +
      (otros.transferencia || otros.tarjeta || otros.otro
        ? '<p class="mini-nota">Otros medios: ' +
          [otros.transferencia ? "transferencia " + cop(otros.transferencia) : "",
           otros.tarjeta ? "tarjeta " + cop(otros.tarjeta) : "",
           otros.otro ? "otro " + cop(otros.otro) : ""].filter(Boolean).join(" · ") + "</p>"
        : "") +

      '<div class="box box-tabla">' +
        "<h3>Movimientos del periodo</h3>" +
        (detalle.length
          ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cuenta</th><th>Persona / nota</th><th class="der">Monto</th><th></th></tr></thead><tbody>' +
            detalle.map(function (m) {
              var t = tipoMovInfo(m.tipo);
              var entra = m.tipo === "prestamo" || m.tipo === "ingreso";
              return "<tr>" +
                "<td>" + fdate(m.creado_en) + "</td>" +
                "<td><b>" + esc(t.n) + "</b></td>" +
                "<td>" + esc(capital(m.cuenta)) + "</td>" +
                "<td>" + esc([m.persona, m.nota].filter(Boolean).join(" · ") || "—") + "</td>" +
                '<td class="der mono ' + (entra ? "verde" : "rojo") + '">' + (entra ? "+" : "−") + cop(m.monto) + "</td>" +
                '<td class="der"><button class="x" data-borrar-mov="' + m.id + '"><i class="ti ti-trash"></i></button></td></tr>';
            }).join("") + "</tbody></table></div>"
          : vacio("No hay movimientos en este periodo.", "ti-wallet")) +
      "</div>";

    $$("[data-borrar-mov]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("¿Eliminar este movimiento?")) return;
        try {
          await eliminarMovimiento(b.dataset.borrarMov);
          toast("Movimiento eliminado");
          pintarDinero();
        } catch (e) { toast(errorDe(e), "error"); }
      });
    });
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

function capital(s) {
  return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
}

function modalMovimiento() {
  abrirModal(
    "<h3>Registrar movimiento</h3>" +
    '<form id="form-mov" class="form-modal">' +
      '<label class="lb">Tipo</label>' +
      '<select id="mv-tipo">' + TIPOS_MOV.map(function (t) { return '<option value="' + t.k + '">' + t.n + "</option>"; }).join("") + "</select>" +
      '<label class="lb">Cuenta</label>' +
      '<select id="mv-cuenta"><option value="efectivo">Efectivo</option><option value="nequi">Nequi</option></select>' +
      '<label class="lb">Monto</label>' +
      '<input id="mv-monto" type="number" inputmode="numeric" placeholder="0" required>' +
      '<label class="lb">Persona (opcional)</label>' +
      '<input id="mv-persona" placeholder="Proveedor, dueño, cliente…">' +
      '<label class="lb">Nota</label>' +
      '<input id="mv-nota" placeholder="Ej. recibo de luz">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-check"></i> Registrar</button></div>' +
    "</form>"
  );
  $("#form-mov").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await crearMovimiento({
        tipo: $("#mv-tipo").value,
        cuenta: $("#mv-cuenta").value,
        monto: $("#mv-monto").value,
        persona: $("#mv-persona").value,
        nota: $("#mv-nota").value
      });
      cerrarModal();
      toast("Movimiento registrado");
      pintarDinero();
    } catch (err) { toast(errorDe(err), "error"); }
  });
  setTimeout(function () { $("#mv-monto").focus(); }, 50);
}
