/* ============================================================
   SIR·TECH POS · Clientes
   ============================================================ */

let filtroClientes = "";

async function vistaClientes() {
  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Clientes</h2><p class="sub">Historial y estado de cuenta</p></div>' +
      '<button class="btn" id="btn-nuevo-cliente"><i class="ti ti-user-plus"></i> Nuevo</button>' +
    "</div>" +
    '<div class="filtros">' +
      '<div class="f-busca"><i class="ti ti-search"></i><input id="c-texto" placeholder="Buscar por nombre o teléfono" value="' + esc(filtroClientes) + '"></div>' +
    "</div>" +
    '<div id="zona-clientes">' + cargando() + "</div>";

  $("#btn-nuevo-cliente").addEventListener("click", function () { modalCliente(null); });

  var buscar = debounce(function () { pintarClientes(); }, 200);
  $("#c-texto").addEventListener("input", function () { filtroClientes = this.value; buscar(); });

  pintarClientes();
}

var _clientesCache = null;

async function pintarClientes() {
  var zona = $("#zona-clientes");
  if (!zona) return;
  try {
    if (!_clientesCache) _clientesCache = await clientesConResumen();
    var t = norm(filtroClientes);
    var lista = _clientesCache.filter(function (r) {
      if (!t) return true;
      return norm(r.cliente.nombre).indexOf(t) > -1 ||
             norm(r.cliente.telefono).indexOf(t) > -1;
    });
    lista.sort(function (a, b) { return norm(a.cliente.nombre).localeCompare(norm(b.cliente.nombre)); });

    $("#zona-clientes").innerHTML =
      '<div class="mini-resumen">' + lista.length + " clientes · " +
        cop(lista.reduce(function (s, r) { return s + r.saldo; }, 0)) + " por cobrar</div>" +
      (lista.length
        ? '<div class="box tabla-wrap"><table class="tabla"><thead><tr><th>Cliente</th><th>Teléfono</th><th class="der">Órdenes</th><th class="der">Total</th><th class="der">Saldo</th><th></th></tr></thead><tbody>' +
          lista.map(function (r) {
            var c = r.cliente;
            return '<tr class="fila-link" data-hash="#/cliente/' + c.id + '">' +
              "<td><b>" + esc(c.nombre) + "</b></td>" +
              '<td class="mono">' + esc(c.telefono || "—") + "</td>" +
              '<td class="der">' + r.ordenes + "</td>" +
              '<td class="der mono">' + cop(r.total) + "</td>" +
              '<td class="der mono ' + (r.saldo > 0.5 ? "rojo" : "verde") + '">' + cop(r.saldo) + "</td>" +
              '<td class="der"><i class="ti ti-chevron-right"></i></td></tr>';
          }).join("") + "</tbody></table></div>"
        : vacio("No hay clientes que coincidan.", "ti-users"));
  } catch (e) {
    zona.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

async function vistaCliente(params) {
  var v = $("#vista");
  v.innerHTML = cargando();
  try {
    var cliente = await clientePorId(params[0]);
    if (!cliente) { v.innerHTML = vacio("Cliente no encontrado.", "ti-user-off"); return; }
    var ordenes = await listarOrdenes({ clienteId: cliente.id, limite: 300 });
    var total = ordenes.reduce(function (s, o) { return s + Number(o.total || 0); }, 0);
    var saldo = ordenes.reduce(function (s, o) { return s + Number(o.saldo || 0); }, 0);
    var abiertas = ordenes.filter(function (o) { return ESTADOS_ABIERTOS.indexOf(o.estado) > -1; }).length;

    v.innerHTML =
      '<div class="pagina-head">' +
        '<button class="btn-ghost" data-hash="#/clientes"><i class="ti ti-arrow-left"></i></button>' +
        '<div class="crece"><h2>' + esc(cliente.nombre) + "</h2>" +
          '<p class="sub">' + esc(cliente.telefono || "Sin teléfono") + " · Cliente desde " + fdate(cliente.creado_en) + "</p></div>" +
        '<div class="acciones-head">' +
          (cliente.telefono ? '<a class="btn-ghost" target="_blank" rel="noopener" href="' + waLink(cliente.telefono, "Hola " + cliente.nombre + ", te escribimos de SIR·TECH.") + '"><i class="ti ti-brand-whatsapp"></i><span class="solo-pc"> WhatsApp</span></a>' : "") +
          '<button class="btn-ghost" id="btn-edit-cliente"><i class="ti ti-edit"></i><span class="solo-pc"> Editar</span></button>' +
          '<button class="btn" data-hash="#/nueva"><i class="ti ti-plus"></i> Orden</button>' +
        "</div>" +
      "</div>" +

      '<div class="kpis">' +
        kpi("Órdenes", ordenes.length, "ti-clipboard-list") +
        kpi("Abiertas", abiertas, "ti-progress") +
        kpi("Facturado", cop(total), "ti-cash") +
        kpi("Por cobrar", cop(saldo), "ti-alert-circle", saldo > 0.5 ? "rojo" : "") +
      "</div>" +

      '<section class="box">' +
        "<h3><i class=\"ti ti-clipboard-list\"></i> Historial de órdenes</h3>" +
        (ordenes.length
          ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Equipo</th><th>Estado</th><th>Fecha</th><th class="der">Total</th><th class="der">Saldo</th></tr></thead><tbody>' +
            ordenes.map(function (o) {
              return '<tr class="fila-link" data-hash="#/orden/' + o.id + '">' +
                '<td class="mono">#' + String(o.numero).padStart(4, "0") + "</td>" +
                "<td>" + esc(o.equipo) + "</td>" +
                "<td>" + badgeEstado(o.estado) + "</td>" +
                "<td>" + fdate(o.fecha_recibido) + "</td>" +
                '<td class="der mono">' + cop(o.total) + "</td>" +
                '<td class="der mono ' + (Number(o.saldo) > 0.5 ? "rojo" : "verde") + '">' + cop(o.saldo) + "</td></tr>";
            }).join("") + "</tbody></table></div>"
          : vacio("Este cliente todavía no tiene órdenes.", "ti-inbox")) +
      "</section>" +
      (cliente.notas ? '<section class="box"><h3>Notas</h3><p class="texto">' + esc(cliente.notas) + "</p></section>" : "");

    $("#btn-edit-cliente").addEventListener("click", function () { modalCliente(cliente); });
  } catch (e) {
    v.innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

function kpi(label, valor, icono, clase) {
  return '<div class="kpi"><i class="ti ' + icono + '"></i><span>' + esc(label) + "</span><b class=\"" + (clase || "") + '">' + valor + "</b></div>";
}

function modalCliente(cliente) {
  var esNuevo = !cliente;
  var c = cliente || {};
  abrirModal(
    "<h3>" + (esNuevo ? "Nuevo cliente" : "Editar cliente") + "</h3>" +
    '<form id="form-cliente" class="form-modal">' +
      '<label class="lb">Nombre</label><input id="cl-nombre" value="' + esc(c.nombre || "") + '" required>' +
      '<label class="lb">Teléfono</label><input id="cl-telefono" inputmode="tel" value="' + esc(c.telefono || "") + '">' +
      '<label class="lb">Correo</label><input id="cl-email" type="email" value="' + esc(c.email || "") + '">' +
      '<label class="lb">Notas</label><textarea id="cl-notas" rows="2">' + esc(c.notas || "") + "</textarea>" +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>' +
    "</form>"
  );
  $("#form-cliente").addEventListener("submit", async function (e) {
    e.preventDefault();
    var datos = {
      nombre: $("#cl-nombre").value,
      telefono: $("#cl-telefono").value,
      email: $("#cl-email").value,
      notas: $("#cl-notas").value
    };
    try {
      if (esNuevo) {
        var nuevo = await crearCliente(datos);
        cerrarModal();
        toast("Cliente creado");
        _clientesCache = null;
        navegar("#/cliente/" + nuevo.id);
      } else {
        await actualizarCliente(cliente.id, datos);
        cerrarModal();
        toast("Cliente actualizado");
        _clientesCache = null;
        recargar();
      }
    } catch (err) { toast(errorDe(err), "error"); }
  });
}
