/* ============================================================
   SIR·TECH POS · Reportes
   ============================================================ */

var mesReporte = inputDate(new Date()).slice(0, 7);
var modoReporte = "mes";
var rangoReporte = { desde: mesReporte, hasta: mesReporte };

function rangoMes(mes) {
  var partes = mes.split("-");
  var y = Number(partes[0]), m = Number(partes[1]);
  var ultimo = new Date(y, m, 0).getDate();
  return {
    desde: mes + "-01",
    hasta: mes + "-" + String(ultimo).padStart(2, "0")
  };
}

function rangoReporteActual() {
  if (modoReporte === "todo") {
    return { desde: "1900-01-01", hasta: hoyInput() };
  }
  if (modoReporte === "rango") {
    var a = rangoReporte.desde || mesReporte;
    var b = rangoReporte.hasta || mesReporte;
    if (a > b) { var t = a; a = b; b = t; }
    return { desde: rangoMes(a).desde, hasta: rangoMes(b).hasta };
  }
  return rangoMes(mesReporte);
}

function refrescarFiltrosReporte() {
  if (!$("#r-modo")) return;
  $$("#r-modo [data-rmodo]").forEach(function (b) {
    b.classList.toggle("on", b.dataset.rmodo === modoReporte);
  });
  if ($("#r-fechas")) $("#r-fechas").classList.toggle("oculto", modoReporte === "todo");
  if ($("#r-mes")) $("#r-mes").classList.toggle("oculto", modoReporte !== "mes");
  if ($("#r-rango")) $("#r-rango").classList.toggle("oculto", modoReporte !== "rango");
}

async function vistaReportes() {
  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Reportes</h2><p class="sub">Resultados del negocio</p></div>' +
      '<div class="reportes-filtros">' +
        '<div class="seg" id="r-modo">' +
          '<button data-rmodo="mes"><i class="ti ti-calendar"></i> Mes</button>' +
          '<button data-rmodo="rango"><i class="ti ti-calendar-stats"></i> Rango</button>' +
          '<button data-rmodo="todo"><i class="ti ti-infinity"></i> Todo</button>' +
        "</div>" +
        '<div id="r-fechas" class="rango-fechas">' +
          '<input type="month" id="r-mes" value="' + mesReporte + '">' +
          '<span id="r-rango" class="rango-meses oculto">' +
            '<input type="month" id="r-desde" value="' + rangoReporte.desde + '" title="Desde">' +
            '<span class="mini">a</span>' +
            '<input type="month" id="r-hasta" value="' + rangoReporte.hasta + '" title="Hasta">' +
          "</span>" +
        "</div>" +
      "</div>" +
    "</div>" +
    '<div id="zona-reportes">' + cargando() + "</div>";

  $("#r-modo").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rmodo]");
    if (!b) return;
    modoReporte = b.dataset.rmodo;
    refrescarFiltrosReporte();
    pintarReportes();
  });

  $("#r-mes").addEventListener("change", function () {
    if (!this.value) { this.value = mesReporte; return; }
    mesReporte = this.value;
    if (modoReporte === "mes") pintarReportes();
  });

  $("#r-desde").addEventListener("change", function () {
    if (!this.value) { this.value = rangoReporte.desde; return; }
    rangoReporte.desde = this.value;
    if (modoReporte === "rango") pintarReportes();
  });

  $("#r-hasta").addEventListener("change", function () {
    if (!this.value) { this.value = rangoReporte.hasta; return; }
    rangoReporte.hasta = this.value;
    if (modoReporte === "rango") pintarReportes();
  });

  refrescarFiltrosReporte();
  pintarReportes();
}

async function pintarReportes() {
  var zona = $("#zona-reportes");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    var r = rangoReporteActual();
    var donde = modoReporte === "mes" ? "el mes" : (modoReporte === "todo" ? "todo el tiempo" : "el rango");
    var titulo = modoReporte === "mes" ? "Resultado del mes" : "Resultado del período";
    var periodoTexto = modoReporte === "todo"
      ? "Todo el tiempo"
      : "Período: " + fdate(r.desde) + " a " + fdate(r.hasta);
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
    var gastosTotal = costoSer + gastosOrden;
    var margen = sum(entregadas, "ganancia");
    if (!margen && entregadas.length) margen = facturado - gastosTotal - costoRep - envios;
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
          "<h3>" + titulo + "</h3>" +
          '<div class="datos">' +
            filaDato("Facturado", cop(facturado)) +
            filaDato("− Repuesto", cop(costoRep)) +
            filaDato("− Gastos", cop(gastosTotal)) +
            filaDato("− Envíos", cop(envios)) +
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
            : vacio("Sin cobros en " + donde + ".", "ti-receipt")) +
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

      '<p class="mini-nota">' + periodoTexto +
        " · Órdenes recibidas: " + recibidas.length +
        " · Entregadas: " + entregadas.length + "</p>";
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
