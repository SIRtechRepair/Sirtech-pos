/* ============================================================
   SIR·TECH POS · Reparaciones
   ============================================================ */

let modoOrdenes = "tablero";
let filtroOrdenes = { texto: "", estado: "", desde: "", hasta: "" };

/* ======================= LISTADO ======================= */
async function vistaOrdenes() {
  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Reparaciones</h2><p class="sub">Órdenes de servicio técnico</p></div>' +
      '<div class="seg" id="seg-modo">' +
        '<button data-modo="tablero" class="' + (modoOrdenes === "tablero" ? "on" : "") + '"><i class="ti ti-layout-kanban"></i> Tablero</button>' +
        '<button data-modo="lista" class="' + (modoOrdenes === "lista" ? "on" : "") + '"><i class="ti ti-list"></i> Lista</button>' +
      '</div>' +
    '</div>' +
    '<div class="filtros">' +
      '<div class="f-busca"><i class="ti ti-search"></i><input id="f-texto" placeholder="Buscar por cliente, equipo, IMEI o #orden" value="' + esc(filtroOrdenes.texto) + '"></div>' +
      '<select id="f-estado" class="' + (modoOrdenes === "tablero" ? "oculto" : "") + '">' +
        '<option value="">Todos los estados</option>' +
        ESTADOS.map(function (e) { return '<option value="' + e.k + '"' + (filtroOrdenes.estado === e.k ? " selected" : "") + '>' + e.n + "</option>"; }).join("") +
      '</select>' +
      '<input type="date" id="f-desde" class="' + (modoOrdenes === "tablero" ? "oculto" : "") + '" value="' + esc(filtroOrdenes.desde) + '" title="Desde">' +
      '<input type="date" id="f-hasta" class="' + (modoOrdenes === "tablero" ? "oculto" : "") + '" value="' + esc(filtroOrdenes.hasta) + '" title="Hasta">' +
      '<button class="btn-ghost" id="f-limpiar" title="Limpiar filtros"><i class="ti ti-filter-off"></i></button>' +
    '</div>' +
    '<div id="zona-ordenes">' + cargando() + "</div>";

  $("#seg-modo").addEventListener("click", function (e) {
    var b = e.target.closest("[data-modo]");
    if (!b || b.dataset.modo === modoOrdenes) return;
    modoOrdenes = b.dataset.modo;
    vistaOrdenes();
  });

  var buscar = debounce(function () { cargarOrdenes(); }, 300);
  $("#f-texto").addEventListener("input", function () { filtroOrdenes.texto = this.value; buscar(); });
  $("#f-estado").addEventListener("change", function () { filtroOrdenes.estado = this.value; cargarOrdenes(); });
  $("#f-desde").addEventListener("change", function () { filtroOrdenes.desde = this.value; cargarOrdenes(); });
  $("#f-hasta").addEventListener("change", function () { filtroOrdenes.hasta = this.value; cargarOrdenes(); });
  $("#f-limpiar").addEventListener("click", function () {
    filtroOrdenes = { texto: "", estado: "", desde: "", hasta: "" };
    vistaOrdenes();
  });

  cargarOrdenes();
}

async function cargarOrdenes() {
  var zona = $("#zona-ordenes");
  if (!zona) return;
  zona.innerHTML = cargando();
  try {
    var op = { texto: filtroOrdenes.texto, limite: 500 };
    if (modoOrdenes === "tablero") {
      op.estados = ESTADOS_ABIERTOS;
    } else {
      if (filtroOrdenes.estado) op.estados = [filtroOrdenes.estado];
      if (filtroOrdenes.desde) op.desde = filtroOrdenes.desde;
      if (filtroOrdenes.hasta) op.hasta = filtroOrdenes.hasta;
    }
    var ordenes = await listarOrdenes(op);
    zona.innerHTML = modoOrdenes === "tablero" ? htmlTablero(ordenes) : htmlLista(ordenes);
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

function htmlTablero(ordenes) {
  return '<div class="kanban">' + ESTADOS_ABIERTOS.map(function (k) {
    var col = estadoInfo(k);
    var lista = ordenes.filter(function (o) { return o.estado === k; });
    return '<section class="kanban-col">' +
      '<header style="--pc:' + col.c + '"><span class="dot"></span>' + esc(col.n) + "<b>" + lista.length + "</b></header>" +
      '<div class="kanban-body">' +
        (lista.length ? lista.map(cardOrden).join("") : '<p class="mini-vacio">Sin órdenes</p>') +
      "</div></section>";
  }).join("") + "</div>";
}

function cardOrden(o) {
  var c = o.clientes || {};
  var atras = o.fecha_prometida && diasEntre(o.fecha_prometida, new Date()) > 0;
  return '<article class="card-orden' + (o.prioridad === "urgente" ? " urgente" : "") + '" data-hash="#/orden/' + o.id + '">' +
    '<div class="co-top"><span class="num">#' + String(o.numero).padStart(4, "0") + "</span>" +
      (o.prioridad === "urgente" ? '<span class="tag-urgente">Urgente</span>' : "") + "</div>" +
    "<b>" + esc(o.equipo) + "</b>" +
    "<small>" + esc(c.nombre || "Sin cliente") + "</small>" +
    '<div class="co-foot"><span class="' + (Number(o.saldo) > 0.5 ? "deuda" : "pagado") + '">' +
      (Number(o.saldo) > 0.5 ? cop(o.saldo) : "Pagado") + "</span>" +
      '<span class="mini">' + fdate(o.fecha_recibido) + "</span></div>" +
    (o.fecha_prometida ? '<div class="prom' + (atras ? " atras" : "") + '"><i class="ti ti-calendar-event"></i> ' + fdate(o.fecha_prometida) + "</div>" : "") +
    "</article>";
}

function htmlLista(ordenes) {
  if (!ordenes.length) return vacio("No hay órdenes con esos filtros.", "ti-inbox");
  return '<div class="box tabla-wrap"><table class="tabla">' +
    "<thead><tr><th>#</th><th>Cliente</th><th>Equipo</th><th>Estado</th><th>Recibida</th><th class=\"der\">Total</th><th class=\"der\">Saldo</th><th></th></tr></thead><tbody>" +
    ordenes.map(function (o) {
      var c = o.clientes || {};
      return '<tr class="fila-link" data-hash="#/orden/' + o.id + '">' +
        "<td class=\"mono\">#" + String(o.numero).padStart(4, "0") + "</td>" +
        "<td><b>" + esc(c.nombre || "—") + "</b><small class=\"block\">" + esc(c.telefono || "") + "</small></td>" +
        "<td>" + esc(o.equipo) + (o.imei ? '<small class="block mono">' + esc(o.imei) + "</small>" : "") + "</td>" +
        "<td>" + badgeEstado(o.estado) + "</td>" +
        "<td>" + fdate(o.fecha_recibido) + "</td>" +
        '<td class="der mono">' + cop(o.total) + "</td>" +
        '<td class="der mono ' + (Number(o.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(o.saldo) + "</td>" +
        '<td class="der"><i class="ti ti-chevron-right"></i></td>' +
        "</tr>";
    }).join("") +
    "</tbody></table></div>";
}

/* ======================= NUEVA ORDEN ======================= */
async function vistaNueva() {
  var catalogo = [];
  try { catalogo = await serviciosCatalogo(); }
  catch (e) { toast("No se pudo cargar el catálogo de servicios. Ejecuta sql/08_servicios.sql.", "error"); }

  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<button class="btn-ghost" data-hash="#/ordenes"><i class="ti ti-arrow-left"></i></button>' +
      '<div><h2>Nueva orden</h2><p class="sub">Registra el equipo que entra al taller</p></div>' +
    "</div>" +
    '<form id="form-orden" class="form-orden" autocomplete="off">' +
      '<div class="grid-2">' +

        '<section class="box">' +
          "<h3><i class=\"ti ti-user\"></i> Cliente</h3>" +
          '<label class="lb">Nombre</label>' +
          '<div class="campo-busca"><input id="o-nombre" placeholder="Buscar o escribir el nombre" required>' +
            '<div class="sugerencias" id="o-sugerencias"></div></div>' +
          '<input type="hidden" id="o-cliente-id">' +
          '<label class="lb">Teléfono</label>' +
          '<input id="o-telefono" inputmode="tel" placeholder="300 000 0000">' +
        "</section>" +

        '<section class="box">' +
          "<h3><i class=\"ti ti-device-mobile\"></i> Equipo</h3>" +
          '<div class="grid-2-in">' +
            '<div><label class="lb">Equipo *</label><input id="o-equipo" placeholder="iPhone 11" required></div>' +
            '<div><label class="lb">IMEI / serial</label><input id="o-imei" placeholder="Opcional"></div>' +
            '<div><label class="lb">Marca</label><input id="o-marca" placeholder="Apple"></div>' +
            '<div><label class="lb">Modelo</label><input id="o-modelo" placeholder="A2111"></div>' +
          "</div>" +
          '<label class="lb">Falla reportada</label>' +
          '<textarea id="o-falla" rows="2" placeholder="No enciende, pantalla rota…"></textarea>' +
        "</section>" +
      "</div>" +

      '<section class="box box-servicios">' +
        '<div class="box-head"><h3><i class="ti ti-tools"></i> Servicios de reparación</h3>' +
          '<button type="button" class="btn-ghost" id="btn-add-item"><i class="ti ti-plus"></i> Agregar servicio</button></div>' +
        '<div class="servicios-grid">' +
          '<div class="servicios-lista">' +
            '<div id="items"></div>' +
            '<p class="mini-vacio" id="items-vacio">Agrega el primer servicio de la reparación.</p>' +
          "</div>" +
          '<aside class="box resumen resumen-serv">' +
            '<div class="res-linea grande"><span>Cobrado</span><b id="t-total">$0</b></div>' +
            '<div class="res-linea mini"><span>Repuesto</span><b id="t-repuestos">$0</b></div>' +
            '<div class="res-linea mini"><span>Gastos</span><b id="t-gastos">$0</b></div>' +
            '<div class="res-linea mini"><span>Envíos</span><b id="t-envio">$0</b></div>' +
            '<div class="res-linea mini"><span>Descuento</span><b id="t-descuento">$0</b></div>' +
            '<div class="sep"></div>' +
            '<div class="res-linea"><span>Ganancia</span><b id="t-ganancia">$0</b></div>' +
            '<div class="sep"></div>' +
            '<div class="res-linea mini"><span>Abono inicial</span><b id="t-abono">$0</b></div>' +
            '<div class="res-linea"><span>Debe</span><b id="t-debe">$0</b></div>' +
          "</aside>" +
        "</div>" +
      "</section>" +

      '<div class="grid-2">' +
        '<section class="box">' +
          "<h3><i class=\"ti ti-cash\"></i> Cobro</h3>" +
          '<div class="grid-3-in">' +
            '<div><label class="lb">Gastos generales</label><input id="o-gastos" type="number" inputmode="numeric" value="0"></div>' +
            '<div><label class="lb">Descuento</label><input id="o-descuento" type="number" inputmode="numeric" value="0"></div>' +
            '<div><label class="lb">Garantía (días)</label><input id="o-garantia" type="number" inputmode="numeric" value="30"></div>' +
          "</div>" +
          '<label class="lb">Abono inicial (opcional)</label>' +
          '<div class="fila-inline">' +
            '<input id="o-abono" type="number" inputmode="numeric" placeholder="0">' +
            '<select id="o-metodo">' + METODOS.map(function (m) { return '<option value="' + m.k + '">' + m.n + "</option>"; }).join("") + "</select>" +
          "</div>" +
        "</section>" +

        '<section class="box">' +
          "<h3><i class=\"ti ti-calendar\"></i> Taller</h3>" +
          '<div class="grid-2-in">' +
            '<div><label class="lb">Fecha prometida</label><input id="o-prometida" type="date"></div>' +
            '<div><label class="lb">Técnico</label><input id="o-tecnico" placeholder="Opcional"></div>' +
          "</div>" +
          '<label class="lb">Prioridad</label>' +
          '<select id="o-prioridad"><option value="normal">Normal</option><option value="urgente">Urgente</option></select>' +
          '<label class="lb">Notas internas</label>' +
          '<textarea id="o-notas" rows="2" placeholder="Patrón, observaciones, accesorios que deja…"></textarea>' +
        "</section>" +
      "</div>" +

      '<div class="acciones-final">' +
        '<a class="btn-ghost" data-hash="#/ordenes">Cancelar</a>' +
        '<button type="submit" class="btn" id="btn-crear"><i class="ti ti-device-floppy"></i> Crear orden</button>' +
      "</div>" +
    "</form>";

  montarDatalist(catalogo);
  montarBuscadorCliente($("#o-nombre"), $("#o-cliente-id"), $("#o-telefono"));
  agregarFilaItem();
  $$("#o-gastos, #o-descuento, #o-abono").forEach(function (el) { el.addEventListener("input", recalcularForm); });
  $("#btn-add-item").addEventListener("click", function () { agregarFilaItem(); });
  $("#items").addEventListener("click", function (e) {
    var b = e.target.closest("[data-quitar]");
    if (b) {
      var filas = $$("#items .fila-item");
      if (filas.length > 1) b.closest(".fila-item").remove();
      recalcularForm();
    }
  });
  $("#items").addEventListener("input", recalcularForm);
  $("#form-orden").addEventListener("submit", guardarNuevaOrden);
  recalcularForm();
}

function agregarFilaItem(datos) {
  var d = datos || {};
  var div = document.createElement("div");
  div.className = "fila-item";
  div.innerHTML =
    '<input class="it-serv" list="lista-servicios" placeholder="Servicio (buscar…)" value="' + esc(d.descripcion || "") + '" required>' +
    '<input class="it-cant" type="number" min="0.5" step="0.5" value="' + (d.cantidad || 1) + '" title="Cantidad">' +
    '<input class="it-precio" type="number" inputmode="numeric" placeholder="Cobrado" value="' + (d.precio_unitario || "") + '" title="Cobrado">' +
    '<input class="it-repuestos" type="number" inputmode="numeric" placeholder="Repuesto" value="' + (d.costo_repuestos || "") + '" title="Costo de repuesto">' +
    '<input class="it-costo" type="number" inputmode="numeric" placeholder="Gastos" value="' + (d.costo_unitario || "") + '" title="Gastos del servicio">' +
    '<input class="it-envio" type="number" inputmode="numeric" placeholder="Envío" value="' + (d.envio || "") + '" title="Envío">' +
    '<span class="it-sub mono">$0</span>' +
    '<button type="button" class="x" data-quitar title="Quitar"><i class="ti ti-x"></i></button>';
  $("#items").appendChild(div);
  recalcularForm();
}

function leerItems() {
  return $$("#items .fila-item").map(function (f) {
    return {
      descripcion: $(".it-serv", f).value.trim(),
      cantidad: num($(".it-cant", f).value) || 1,
      precio_unitario: num($(".it-precio", f).value),
      costo_unitario: num($(".it-costo", f).value),
      envio: num($(".it-envio", f).value),
      costo_repuestos: num($(".it-repuestos", f).value)
    };
  }).filter(function (i) { return i.descripcion; });
}

function montarDatalist(lista) {
  var dl = $("#lista-servicios");
  if (!dl) return;
  dl.innerHTML = (lista || []).map(function (s) {
    return '<option value="' + esc(s.nombre) + '"></option>';
  }).join("");
}

function recalcularForm() {
  if (!$("#items")) return;
  var items = leerItems();
  var total = items.reduce(function (s, i) { return s + i.precio_unitario * i.cantidad; }, 0);
  var envio = items.reduce(function (s, i) { return s + i.envio; }, 0);
  var repuestos = items.reduce(function (s, i) { return s + i.costo_repuestos; }, 0);
  var costoSer = items.reduce(function (s, i) { return s + i.costo_unitario * i.cantidad; }, 0);
  var desc = num($("#o-descuento") ? $("#o-descuento").value : 0);
  var gastos = num($("#o-gastos") ? $("#o-gastos").value : 0);
  var abono = num($("#o-abono") ? $("#o-abono").value : 0);

  $$("#items .fila-item").forEach(function (f) {
    var c = num($(".it-cant", f).value) || 1;
    var p = num($(".it-precio", f).value);
    $(".it-sub", f).textContent = cop(c * p);
  });

  var ganancia = total - desc - costoSer - envio - repuestos - gastos;
  var debe = total - desc - abono;

  $("#t-total").textContent = cop(total - desc);
  $("#t-repuestos").textContent = cop(repuestos);
  $("#t-gastos").textContent = cop(costoSer + gastos);
  $("#t-envio").textContent = cop(envio);
  $("#t-descuento").textContent = cop(desc);
  $("#t-ganancia").textContent = cop(ganancia);
  $("#t-ganancia").className = ganancia < 0 ? "rojo" : "verde";
  $("#t-abono").textContent = cop(abono);
  $("#t-debe").textContent = cop(debe);
  $("#t-debe").className = debe > 0.5 ? "rojo" : "verde";
  if ($("#items-vacio")) $("#items-vacio").classList.toggle("oculto", items.length > 0);
}

async function guardarNuevaOrden(e) {
  e.preventDefault();
  var btn = $("#btn-crear");
  btn.disabled = true;
  try {
    var items = leerItems();
    if (!items.length) throw new Error("Agrega al menos un servicio.");

    var catalogo = await serviciosCatalogo();
    items.forEach(function (i) {
      var s = servicioPorNombre(i.descripcion, catalogo);
      if (!s) throw new Error('Servicio no válido: "' + i.descripcion + '". Elígelo del listado.');
      i.servicio_id = s.id;
      i.descripcion = s.nombre;
    });

    var cab = {
      cliente_id: Number($("#o-cliente-id").value) || null,
      cliente_nombre: $("#o-nombre").value,
      cliente_telefono: $("#o-telefono").value,
      equipo: $("#o-equipo").value,
      marca: $("#o-marca").value,
      modelo: $("#o-modelo").value,
      imei: $("#o-imei").value,
      falla: $("#o-falla").value,
      tecnico: $("#o-tecnico").value,
      prioridad: $("#o-prioridad").value,
      gastos: $("#o-gastos").value,
      descuento: $("#o-descuento").value,
      garantia_dias: $("#o-garantia").value,
      fecha_prometida: $("#o-prometida").value || null,
      notas: $("#o-notas").value
    };
    var pago = Number($("#o-abono").value) > 0
      ? { monto: $("#o-abono").value, metodo: $("#o-metodo").value }
      : null;

    var orden = await crearOrden(cab, items, pago);
    _clientesCache = null;
    toast("Orden #" + String(orden.numero).padStart(4, "0") + " creada");
    navegar("#/orden/" + orden.id);
  } catch (err) {
    toast(errorDe(err), "error");
    btn.disabled = false;
  }
}

/* ======================= DETALLE ======================= */
async function vistaOrden(params) {
  var v = $("#vista");
  v.innerHTML = cargando();
  var d;
  try {
    d = await obtenerOrden(params[0]);
  } catch (e) {
    v.innerHTML = vacio("No se encontró la orden.", "ti-file-off");
    return;
  }
  var o = d.orden;
  var c = o.clientes || {};
  var e = estadoInfo(o.estado);
  var margen = (o.ganancia !== undefined && o.ganancia !== null)
    ? Number(o.ganancia)
    : Number(o.total) - Number(o.costo_servicios || 0) - Number(o.costo_repuestos) - Number(o.envio) - Number(o.gastos);
  var esFinal = ESTADOS_FINALES.indexOf(o.estado) > -1;

  var catalogo = [];
  try { catalogo = await serviciosCatalogo(); } catch (err) { /* el detalle sigue funcionando */ }

  v.innerHTML =
    '<div class="pagina-head">' +
      '<button class="btn-ghost" data-hash="#/ordenes"><i class="ti ti-arrow-left"></i></button>' +
      '<div class="crece"><h2>Orden #' + String(o.numero).padStart(4, "0") + "</h2>" +
        '<p class="sub">' + badgeEstado(o.estado) + " · Recibida " + fdatetime(o.fecha_recibido) + "</p></div>" +
      '<div class="acciones-head">' +
        (c.telefono ? '<a class="btn-ghost" target="_blank" rel="noopener" href="' + waLink(c.telefono, mensajeWhatsApp(o)) + '"><i class="ti ti-brand-whatsapp"></i><span class="solo-pc"> WhatsApp</span></a>' : "") +
        '<button class="btn-ghost" id="btn-editar"><i class="ti ti-edit"></i><span class="solo-pc"> Editar</span></button>' +
      "</div>" +
    "</div>" +

    '<div class="detalle-grid">' +
      '<div class="col-main">' +

        '<section class="box estados-box">' +
          '<div class="estado-actual" style="--pc:' + e.c + '"><i class="ti ' + e.i + '"></i><b>' + esc(e.n) + "</b></div>" +
          '<div class="estado-botones">' +
            ESTADOS.filter(function (x) { return ["diagnostico","esperando_repuesto","reparando","listo","no_reparable","cancelado"].indexOf(x.k) > -1; })
              .map(function (x) {
                return '<button class="btn-estado' + (x.k === o.estado ? " on" : "") + '" data-estado="' + x.k + '" style="--pc:' + x.c + '">' + esc(x.n) + "</button>";
              }).join("") +
          "</div>" +
          (o.estado === "listo"
            ? '<div class="entrega-bar">' +
                (Number(o.saldo) > 0.5
                  ? '<span class="aviso"><i class="ti ti-alert-triangle"></i> Saldo pendiente de ' + cop(o.saldo) + ". Cobra para entregar.</span>" +
                    '<button class="btn btn-sm" id="btn-pago-rapido"><i class="ti ti-cash"></i> Cobrar saldo</button>'
                  : '<span class="ok"><i class="ti ti-circle-check"></i> Pagada. Lista para entregar.</span>' +
                    '<button class="btn verde btn-sm" id="btn-entregar"><i class="ti ti-hand-stop"></i> Entregar</button>') +
              "</div>"
            : "") +
        "</section>" +

        '<section class="box">' +
          '<div class="box-head"><h3><i class="ti ti-tools"></i> Servicios de reparación</h3>' +
            (esFinal ? "" : '<button class="btn-ghost btn-sm" id="btn-add-item"><i class="ti ti-plus"></i> Agregar servicio</button>') + "</div>" +
          (d.items.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Servicio</th><th class="der">Cant.</th><th class="der">Cobrado</th><th class="der">Repuesto</th><th class="der">Gastos</th><th class="der">Envío</th><th class="der">Subtotal</th><th></th></tr></thead><tbody>' +
            d.items.map(function (i) {
              var rep = i.tipo === "repuesto";
              return "<tr><td>" + esc(i.descripcion) + (rep ? ' <span class="tag">Repuesto histórico</span>' : "") + "</td>" +
                '<td class="der mono">' + i.cantidad + "</td>" +
                '<td class="der mono">' + cop(i.precio_unitario) + "</td>" +
                '<td class="der mono">' + cop(rep ? i.costo_unitario : i.costo_repuestos) + "</td>" +
                '<td class="der mono">' + (rep ? "—" : cop(i.costo_unitario)) + "</td>" +
                '<td class="der mono">' + (rep ? "—" : cop(i.envio)) + "</td>" +
                '<td class="der mono">' + cop(Number(i.precio_unitario) * Number(i.cantidad)) + "</td>" +
                '<td class="der">' + (esFinal ? "" : '<button class="x" data-borrar-item="' + i.id + '"><i class="ti ti-trash"></i></button>') + "</td></tr>";
            }).join("") + "</tbody></table></div>"
            : vacio("Sin servicios registrados.", "ti-list-details")) +
        "</section>" +

        '<section class="box">' +
          '<div class="box-head"><h3><i class="ti ti-cash"></i> Abonos</h3>' +
            (esFinal ? "" : '<button class="btn-ghost btn-sm" id="btn-add-pago"><i class="ti ti-plus"></i> Registrar abono</button>') + "</div>" +
          (d.pagos.length ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Método</th><th>Nota</th><th class="der">Monto</th><th></th></tr></thead><tbody>' +
            d.pagos.map(function (p) {
              return "<tr><td>" + fdatetime(p.fecha) + "</td><td>" + badgeMetodo(p.metodo) + "</td>" +
                "<td>" + esc(p.nota || "—") + "</td>" +
                '<td class="der mono">' + cop(p.monto) + "</td>" +
                "<td>" + (esFinal ? "" : '<button class="x" data-borrar-pago="' + p.id + '"><i class="ti ti-trash"></i></button>') + "</td></tr>";
            }).join("") + "</tbody></table></div>"
            : vacio("Todavía no hay abonos.", "ti-receipt")) +
        "</section>" +

        '<section class="box">' +
          "<h3><i class=\"ti ti-history\"></i> Historial</h3>" +
          '<div class="timeline">' +
            (d.historial.length ? d.historial.map(function (h) {
              return '<div class="tl-item" style="--pc:' + estadoInfo(h.estado).c + '"><span class="tl-dot"></span>' +
                "<div><b>" + esc(estadoInfo(h.estado).n) + "</b><small>" + fdatetime(h.creado_en) + "</small></div></div>";
            }).join("") : '<p class="mini-vacio">Sin movimientos.</p>') +
          "</div>" +
        "</section>" +
      "</div>" +

      '<aside class="col-side">' +
        '<section class="box resumen">' +
          '<div class="res-linea grande"><span>Cobrado</span><b>' + cop(o.total) + "</b></div>" +
          '<div class="res-linea mini"><span>Repuesto</span><b>' + cop(o.costo_repuestos) + "</b></div>" +
          '<div class="res-linea mini"><span>Gastos</span><b>' + cop(Number(o.costo_servicios) + Number(o.gastos)) + "</b></div>" +
          '<div class="res-linea mini"><span>Envíos</span><b>' + cop(o.envio) + "</b></div>" +
          '<div class="res-linea mini"><span>Descuento</span><b>' + cop(o.descuento) + "</b></div>" +
          '<div class="sep"></div>' +
          '<div class="res-linea"><span>Ganancia</span><b class="' + (margen < 0 ? "rojo" : "verde") + '">' + cop(margen) + "</b></div>" +
          '<div class="sep"></div>' +
          '<div class="res-linea"><span>Abonos</span><b class="verde">' + cop(o.pagado) + "</b></div>" +
          '<div class="res-linea"><span>Debe</span><b class="' + (Number(o.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(o.saldo) + "</b></div>" +
        "</section>" +

        '<section class="box">' +
          "<h3><i class=\"ti ti-user\"></i> Cliente</h3>" +
          '<a class="cliente-link" ' + (o.cliente_id ? 'data-hash="#/cliente/' + o.cliente_id + '"' : "") + ">" +
            "<b>" + esc(c.nombre || "—") + "</b><small>" + esc(c.telefono || "") + "</small></a>" +
        "</section>" +

        '<section class="box">' +
          "<h3><i class=\"ti ti-device-mobile\"></i> Equipo</h3>" +
          '<div class="datos">' +
            filaDato("Equipo", o.equipo) +
            (o.marca ? filaDato("Marca", o.marca) : "") +
            (o.modelo ? filaDato("Modelo", o.modelo) : "") +
            (o.imei ? filaDato("IMEI", o.imei, "mono") : "") +
            (o.tecnico ? filaDato("Técnico", o.tecnico) : "") +
            (o.fecha_prometida ? filaDato("Prometida", fdate(o.fecha_prometida)) : "") +
            (o.fecha_entregado ? filaDato("Entregado", fdatetime(o.fecha_entregado)) : "") +
            (o.garantia_hasta ? filaDato("Garantía hasta", fdate(o.garantia_hasta)) : "") +
          "</div>" +
          (o.falla ? '<div class="bloque-texto"><span class="lb">Falla reportada</span><p>' + esc(o.falla) + "</p></div>" : "") +
          (o.diagnostico ? '<div class="bloque-texto"><span class="lb">Diagnóstico</span><p>' + esc(o.diagnostico) + "</p></div>" : "") +
          (o.notas ? '<div class="bloque-texto"><span class="lb">Notas</span><p>' + esc(o.notas) + "</p></div>" : "") +
        "</section>" +
      "</aside>" +
    "</div>";

  montarDatalist(catalogo);
  conectarDetalle(o, d);
}

function filaDato(label, valor, clase) {
  return '<div class="dato"><span>' + esc(label) + '</span><b class="' + (clase || "") + '">' + esc(valor) + "</b></div>";
}

function mensajeWhatsApp(o) {
  var c = o.clientes || {};
  var e = estadoInfo(o.estado);
  var txt = "Hola " + (c.nombre || "") + ", te escribimos de SIR·TECH.\n\n" +
    "Orden #" + String(o.numero).padStart(4, "0") + "\n" +
    "Equipo: " + o.equipo + "\n" +
    "Estado: " + e.n + "\n";
  if (o.estado === "listo") {
    txt += "Total: " + cop(o.total) + "\n";
    if (Number(o.saldo) > 0.5) txt += "Saldo pendiente: " + cop(o.saldo) + "\n";
    txt += "\nTu equipo está listo para retirar. ¡Te esperamos!";
  }
  return txt;
}

function conectarDetalle(o, d) {
  var esFinal = ESTADOS_FINALES.indexOf(o.estado) > -1;

  $$(".btn-estado").forEach(function (b) {
    b.addEventListener("click", async function () {
      if (b.dataset.estado === o.estado) return;
      try {
        await cambiarEstado(o.id, b.dataset.estado);
        toast("Estado actualizado");
        recargar();
      } catch (e) { toast(errorDe(e), "error"); }
    });
  });

  var btnEntregar = $("#btn-entregar");
  if (btnEntregar) btnEntregar.addEventListener("click", async function () {
    if (!confirm("¿Entregar la orden #" + String(o.numero).padStart(4, "0") + "?\nEsto inicia la garantía.")) return;
    try {
      await cambiarEstado(o.id, "entregado");
      toast("Orden entregada");
      recargar();
    } catch (e) { toast(errorDe(e), "error"); }
  });

  var btnPagoRapido = $("#btn-pago-rapido");
  if (btnPagoRapido) btnPagoRapido.addEventListener("click", function () { modalPago(o, Number(o.saldo)); });

  var btnAddItem = $("#btn-add-item");
  if (btnAddItem) btnAddItem.addEventListener("click", function () { modalItem(o); });

  var btnAddPago = $("#btn-add-pago");
  if (btnAddPago) btnAddPago.addEventListener("click", function () { modalPago(o); });

  var btnEditar = $("#btn-editar");
  if (btnEditar) btnEditar.addEventListener("click", function () { modalEditar(o); });

  $$("[data-borrar-item]").forEach(function (b) {
    b.addEventListener("click", async function () {
      if (!confirm("¿Eliminar este ítem?")) return;
      await eliminarItem(b.dataset.borrarItem);
      toast("Ítem eliminado");
      recargar();
    });
  });

  $$("[data-borrar-pago]").forEach(function (b) {
    b.addEventListener("click", async function () {
      if (!confirm("¿Eliminar este abono?")) return;
      await eliminarPago(b.dataset.borrarPago);
      toast("Abono eliminado");
      recargar();
    });
  });
}

/* ======================= MODALES ======================= */
function modalItem(o) {
  abrirModal(
    "<h3>Agregar servicio</h3>" +
    '<form id="form-item" class="form-modal">' +
      '<label class="lb">Servicio</label>' +
      '<input id="it-serv" list="lista-servicios" placeholder="Buscar servicio…" required>' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Cantidad</label><input id="it-cant" type="number" min="0.5" step="0.5" value="1"></div>' +
        '<div><label class="lb">Cobrado</label><input id="it-precio" type="number" inputmode="numeric" value="0"></div>' +
        '<div><label class="lb">Repuesto</label><input id="it-repuestos" type="number" inputmode="numeric" value="0"></div>' +
        '<div><label class="lb">Gastos</label><input id="it-costo" type="number" inputmode="numeric" value="0"></div>' +
        '<div><label class="lb">Envío</label><input id="it-envio" type="number" inputmode="numeric" value="0"></div>' +
      "</div>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-plus"></i> Agregar</button></div>' +
    "</form>"
  );
  $("#form-item").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      var s = servicioPorNombre($("#it-serv").value, await serviciosCatalogo());
      if (!s) throw new Error("Selecciona un servicio del listado.");
      await agregarItem(o.id, {
        servicio_id: s.id,
        descripcion: s.nombre,
        cantidad: $("#it-cant").value,
        precio_unitario: $("#it-precio").value,
        costo_unitario: $("#it-costo").value,
        envio: $("#it-envio").value,
        costo_repuestos: $("#it-repuestos").value
      });
      cerrarModal();
      toast("Servicio agregado");
      recargar();
    } catch (err) { toast(errorDe(err), "error"); }
  });
  setTimeout(function () { $("#it-serv").focus(); }, 50);
}

function modalPago(o, sugerido) {
  abrirModal(
    "<h3>Registrar abono</h3>" +
    "<p class=\"modal-sub\">Orden #" + String(o.numero).padStart(4, "0") + " · Saldo " + cop(o.saldo) + "</p>" +
    '<form id="form-pago" class="form-modal">' +
      '<label class="lb">Monto</label>' +
      '<input id="pg-monto" type="number" inputmode="numeric" value="' + (sugerido || "") + '" placeholder="0" required>' +
      '<label class="lb">Método</label>' +
      '<select id="pg-metodo">' + METODOS.map(function (m) { return '<option value="' + m.k + '">' + m.n + "</option>"; }).join("") + "</select>" +
      '<label class="lb">Nota (opcional)</label>' +
      '<input id="pg-nota" placeholder="Ej. abono en efectivo">' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-check"></i> Registrar</button></div>' +
    "</form>"
  );
  $("#form-pago").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await agregarPago(o.id, {
        monto: $("#pg-monto").value,
        metodo: $("#pg-metodo").value,
        nota: $("#pg-nota").value
      });
      cerrarModal();
      toast("Abono registrado");
      recargar();
    } catch (err) { toast(errorDe(err), "error"); }
  });
  setTimeout(function () { $("#pg-monto").focus(); }, 50);
}

function modalEditar(o) {
  abrirModal(
    "<h3>Editar orden #" + String(o.numero).padStart(4, "0") + "</h3>" +
    '<form id="form-editar" class="form-modal">' +
      '<label class="lb">Equipo</label><input id="ed-equipo" value="' + esc(o.equipo) + '" required>' +
      '<div class="grid-2-in">' +
        '<div><label class="lb">Marca</label><input id="ed-marca" value="' + esc(o.marca || "") + '"></div>' +
        '<div><label class="lb">Modelo</label><input id="ed-modelo" value="' + esc(o.modelo || "") + '"></div>' +
        '<div><label class="lb">IMEI / serial</label><input id="ed-imei" value="' + esc(o.imei || "") + '"></div>' +
        '<div><label class="lb">Técnico</label><input id="ed-tecnico" value="' + esc(o.tecnico || "") + '"></div>' +
        '<div><label class="lb">Envío adicional</label><input id="ed-envio" type="number" value="' + Number(o.envio_extra || 0) + '"></div>' +
        '<div><label class="lb">Otros gastos</label><input id="ed-gastos" type="number" value="' + Number(o.gastos) + '"></div>' +
        '<div><label class="lb">Descuento</label><input id="ed-descuento" type="number" value="' + Number(o.descuento) + '"></div>' +
        '<div><label class="lb">Garantía (días)</label><input id="ed-garantia" type="number" value="' + Number(o.garantia_dias) + '"></div>' +
        '<div><label class="lb">Fecha prometida</label><input id="ed-prometida" type="date" value="' + inputDate(o.fecha_prometida) + '"></div>' +
        '<div><label class="lb">Prioridad</label><select id="ed-prioridad"><option value="normal"' + (o.prioridad === "normal" ? " selected" : "") + ">Normal</option><option value=\"urgente\"" + (o.prioridad === "urgente" ? " selected" : "") + ">Urgente</option></select></div>" +
      "</div>" +
      '<label class="lb">Falla reportada</label><textarea id="ed-falla" rows="2">' + esc(o.falla || "") + "</textarea>" +
      '<label class="lb">Diagnóstico</label><textarea id="ed-diagnostico" rows="2">' + esc(o.diagnostico || "") + "</textarea>" +
      '<label class="lb">Notas</label><textarea id="ed-notas" rows="2">' + esc(o.notas || "") + "</textarea>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>", "ancho"
  );
  $("#form-editar").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await actualizarOrden(o.id, {
        equipo: $("#ed-equipo").value,
        marca: $("#ed-marca").value,
        modelo: $("#ed-modelo").value,
        imei: $("#ed-imei").value,
        tecnico: $("#ed-tecnico").value,
        envio_extra: $("#ed-envio").value,
        gastos: $("#ed-gastos").value,
        descuento: $("#ed-descuento").value,
        garantia_dias: $("#ed-garantia").value,
        fecha_prometida: $("#ed-prometida").value || null,
        prioridad: $("#ed-prioridad").value,
        falla: $("#ed-falla").value,
        diagnostico: $("#ed-diagnostico").value,
        notas: $("#ed-notas").value
      });
      cerrarModal();
      toast("Orden actualizada");
      recargar();
    } catch (err) { toast(errorDe(err), "error"); }
  });
}

/* ======================= BUSCADOR DE CLIENTE ======================= */
function montarBuscadorCliente(input, oculto, telefono) {
  var cont = $("#o-sugerencias");
  var buscar = debounce(async function () {
    var t = input.value.trim();
    if (t.length < 2) { cont.classList.remove("on"); cont.innerHTML = ""; return; }
    try {
      var res = await buscarClientes(t, 8);
      cont.innerHTML = res.length
        ? res.map(function (c) {
            return '<button type="button" data-id="' + c.id + '" data-nombre="' + esc(c.nombre) + '" data-tel="' + esc(c.telefono || "") + '">' +
              esc(c.nombre) + "<small>" + esc(c.telefono || "sin teléfono") + "</small></button>";
          }).join("")
        : '<p class="sug-vacio">Cliente nuevo</p>';
      cont.classList.add("on");
    } catch (e) { /* silencio */ }
  }, 250);

  input.addEventListener("input", function () {
    oculto.value = "";
    buscar();
  });

  cont.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-id]");
    if (!b) return;
    input.value = b.dataset.nombre;
    oculto.value = b.dataset.id;
    if (telefono && b.dataset.tel) telefono.value = b.dataset.tel;
    cont.classList.remove("on");
    cont.innerHTML = "";
  });

  document.addEventListener("click", function (e) {
    if (!cont.contains(e.target) && e.target !== input) cont.classList.remove("on");
  });
}
