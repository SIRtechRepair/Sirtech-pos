/* ============================================================
   SIR·TECH POS · Reportes
   ============================================================ */

var mesReporte = inputDate(new Date()).slice(0, 7);

function rangoMes(mes) {
  var partes = mes.split("-");
  var y = Number(partes[0]), m = Number(partes[1]);
  var ultimo = new Date(y, m, 0).getDate();
  return {
    desde: mes + "-01",
    hasta: mes + "-" + String(ultimo).padStart(2, "0")
  };
}

async function vistaReportes() {
  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Reportes</h2><p class="sub">Resultados del negocio</p></div>' +
      '<input type="month" id="r-mes" value="' + mesReporte + '">' +
    "</div>" +
    '<div id="zona-reportes">' + cargando() + "</div>";

  $("#r-mes").addEventListener("change", function () {
    mesReporte = this.value;
    pintarReportes();
  });

  pintarReportes();
}

async function pintarReportes() {
  var zona = $("#zona-reportes");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    var r = rangoMes(mesReporte);
    var res = await Promise.all([
      ordenesEntregadasEntre(r.desde, r.hasta),
      ordenesEntre(r.desde, r.hasta),
      pagosEntre(r.desde, r.hasta),
      movimientosEntre(r.desde, r.hasta)
    ]);
    var entregadas = res[0];
    var recibidas = res[1];
    var pagos = res[2];
    var movs = res[3];

    var facturado = sum(entregadas, "total");
    var costoSer = sum(entregadas, "costo_servicios");
    var costoRep = sum(entregadas, "costo_repuestos");
    var envios = sum(entregadas, "envio");
    var gastosOrden = sum(entregadas, "gastos");
    var margen = sum(entregadas, "ganancia");
    if (!margen && entregadas.length) margen = facturado - costoSer - costoRep - envios - gastosOrden;
    var cobrado = sum(pagos, "monto");

    var gastosNegocio = movs.filter(function (m) { return m.tipo === "gasto" || m.tipo === "proveedor"; })
      .reduce(function (s, m) { return s + Number(m.monto); }, 0);

    var porMetodo = {};
    pagos.forEach(function (p) {
      porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + Number(p.monto);
    });

    var equipos = contar(recibidas.map(function (o) { return String(o.equipo || "").toUpperCase().trim(); }).filter(Boolean));
    var fallas = contar(recibidas.reduce(function (acc, o) {
      String(o.falla || "").split(/[,/;]+/).forEach(function (f) {
        var v = f.toUpperCase().trim();
        if (v.length >= 3) acc.push(v);
      });
      return acc;
    }, []));

    var carteraRows = await db(sb.from("v_cartera").select("saldo"));
    var cartera = (carteraRows || []).reduce(function (s, x) { return s + Number(x.saldo); }, 0);

    var ticket = entregadas.length ? facturado / entregadas.length : 0;

    zona.innerHTML =
      '<div class="kpis">' +
        kpi("Entregadas", entregadas.length, "ti-circle-check", "verde") +
        kpi("Facturado", cop(facturado), "ti-receipt") +
        kpi("Cobrado", cop(cobrado), "ti-cash") +
        kpi("Ganancia", cop(margen), "ti-trending-up", margen >= 0 ? "verde" : "rojo") +
      "</div>" +

      '<div class="grid-2">' +
        '<section class="box">' +
          "<h3>Resultado del mes</h3>" +
          '<div class="datos">' +
            filaDato("Facturado", cop(facturado)) +
            filaDato("− Costos de servicios", cop(costoSer)) +
            filaDato("− Repuestos", cop(costoRep)) +
            filaDato("− Envíos", cop(envios)) +
            filaDato("− Gastos de órdenes", cop(gastosOrden)) +
            filaDato("= Ganancia", cop(margen)) +
            filaDato("Ticket promedio", cop(ticket)) +
            filaDato("Gastos del negocio", cop(gastosNegocio)) +
          "</div>" +
        "</section>" +

        '<section class="box">' +
          "<h3>Ingresos por método</h3>" +
          (Object.keys(porMetodo).length
            ? '<div class="datos">' + METODOS.map(function (m) {
                if (!porMetodo[m.k]) return "";
                return filaDato(m.n, cop(porMetodo[m.k]));
              }).join("") + "</div>"
            : vacio("Sin cobros en el mes.", "ti-receipt")) +
          '<div class="sep"></div>' +
          '<div class="res-linea"><span>Cartera total</span><b class="' + (cartera > 0 ? "rojo" : "verde") + '">' + cop(cartera) + "</b></div>" +
        "</section>" +
      "</div>" +

      '<div class="grid-2">' +
        '<section class="box">' +
          "<h3>Equipos más frecuentes</h3>" +
          (equipos.length
            ? '<div class="barras">' + equipos.slice(0, 8).map(function (x) {
                var max = equipos[0][1] || 1;
                return '<div class="barra"><span>' + esc(x[0]) + "</span>" +
                  '<div class="barra-track"><i style="width:' + Math.max(6, (x[1] / max) * 100) + '%"></i></div>' +
                  "<b>" + x[1] + "</b></div>";
              }).join("") + "</div>"
            : vacio("Sin datos.", "ti-device-mobile")) +
        "</section>" +

        '<section class="box">' +
          "<h3>Fallas más comunes</h3>" +
          (fallas.length
            ? '<div class="barras">' + fallas.slice(0, 8).map(function (x) {
                var max = fallas[0][1] || 1;
                return '<div class="barra"><span>' + esc(x[0]) + "</span>" +
                  '<div class="barra-track"><i style="width:' + Math.max(6, (x[1] / max) * 100) + '%"></i></div>' +
                  "<b>" + x[1] + "</b></div>";
              }).join("") + "</div>"
            : vacio("Sin datos.", "ti-tool")) +
        "</section>" +
      "</div>" +

      '<p class="mini-nota">Órdenes recibidas en el mes: ' + recibidas.length +
        " · Entregadas en el mes: " + entregadas.length + "</p>";
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

function sum(arr, campo) {
  return arr.reduce(function (s, x) { return s + Number(x[campo] || 0); }, 0);
}

function contar(lista) {
  var m = {};
  lista.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
  return Object.keys(m).map(function (k) { return [k, m[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
}
