/* ============================================================
   SIR·TECH POS · Arranque, sesión y navegación
   ============================================================ */

const TABS = [
  { k: "inicio",    n: "Inicio",       i: "ti-home" },
  { k: "ordenes",   n: "Reparaciones", i: "ti-tools" },
  { k: "clientes",  n: "Clientes",     i: "ti-users" },
  { k: "dinero",    n: "Dinero",       i: "ti-wallet" },
  { k: "reportes",  n: "Reportes",     i: "ti-chart-bar" }
];

const RUTAS = {
  inicio: vistaInicio,
  ordenes: vistaOrdenes,
  nueva: vistaNueva,
  orden: vistaOrden,
  clientes: vistaClientes,
  cliente: vistaCliente,
  dinero: vistaDinero,
  reportes: vistaReportes
};

function navegar(hash) {
  if (location.hash === hash) recargar();
  else location.hash = hash;
}

async function recargar() {
  await router();
}

function rutaActual() {
  var h = location.hash.replace(/^#\/?/, "");
  var partes = h.split("/");
  return { ruta: partes[0] || "inicio", params: partes.slice(1) };
}

async function router() {
  var r = rutaActual();
  var fn = RUTAS[r.ruta] || vistaInicio;
  marcarTab(r.ruta);
  try {
    await fn(r.params);
  } catch (e) {
    $("#vista").innerHTML = vacio(errorDe(e), "ti-alert-triangle");
  }
}

function marcarTab(ruta) {
  var mapa = { orden: "ordenes", nueva: "ordenes", cliente: "clientes" };
  var activo = mapa[ruta] || ruta;
  $$("#tabs [data-tab]").forEach(function (b) {
    b.classList.toggle("on", b.dataset.tab === activo);
  });
}

/* ---------------- ARRANQUE ---------------- */
document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  montarTabs();
  $("#form-login").addEventListener("submit", hacerLogin);
  $("#btn-salir").addEventListener("click", async function () {
    await salir();
    mostrarLogin();
  });
  $("#btn-nueva").addEventListener("click", function () { navegar("#/nueva"); });
  $("#btn-cuenta").addEventListener("click", modalCuenta);

  window.addEventListener("hashchange", router);

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-hash]");
    if (el) {
      e.preventDefault();
      navegar(el.dataset.hash);
    }
  });

  sb.auth.onAuthStateChange(function (evento, session) {
    if (evento === "SIGNED_OUT") mostrarLogin();
  });

  var s = await sesionActual();
  if (s) await entrarApp();
  else mostrarLogin();
}

function montarTabs() {
  $("#tabs").innerHTML = TABS.map(function (t) {
    return '<button class="tab" data-tab="' + t.k + '"><i class="ti ' + t.i + '"></i>' + t.n + "</button>";
  }).join("");

  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (!b) return;
    navegar("#/" + b.dataset.tab);
  });
}

function mostrarLogin() {
  $("#app").classList.add("oculto");
  $("#login").classList.remove("oculto");
  $("#msg-login").textContent = "";
  $("#btn-entrar").disabled = false;
  setTimeout(function () { var e = $("#email"); if (e) e.focus(); }, 80);
}

async function hacerLogin(e) {
  e.preventDefault();
  var btn = $("#btn-entrar");
  var msg = $("#msg-login");
  btn.disabled = true;
  msg.textContent = "Entrando…";
  msg.className = "msg";
  try {
    await entrar($("#email").value.trim(), $("#pass").value);
    await entrarApp();
  } catch (err) {
    var t = errorDe(err);
    if (/invalid login|invalid credentials|credenciales/i.test(t)) t = "Correo o contraseña incorrectos.";
    msg.textContent = t;
    msg.className = "msg error";
  } finally {
    btn.disabled = false;
  }
}

async function entrarApp() {
  var perfil;
  try {
    perfil = await perfilActual();
  } catch (e) {
    perfil = null;
  }

  if (!perfil || !perfil.activo) {
    $("#msg-login").textContent = "Tu usuario no tiene permisos. Pídele al dueño que lo active.";
    $("#msg-login").className = "msg error";
    await salir();
    mostrarLogin();
    return;
  }

  $("#login").classList.add("oculto");
  $("#app").classList.remove("oculto");

  if (!location.hash || location.hash === "#") location.hash = "#/inicio";
  await router();
}

/* ======================= INICIO ======================= */
async function vistaInicio() {
  $("#vista").innerHTML = cargando();
  var d = await datosPanel();

  var abiertas = d.abiertas || [];
  var listas = abiertas.filter(function (o) { return o.estado === "listo"; });
  var atrasadas = abiertas.filter(function (o) {
    return o.fecha_prometida && diasEntre(o.fecha_prometida, new Date()) > 0;
  });
  var porCobrar = (d.cartera || []).reduce(function (s, c) { return s + Number(c.saldo); }, 0);
  var cobradoHoy = (d.pagosHoy || []).reduce(function (s, p) { return s + Number(p.monto); }, 0);
  var urgentes = abiertas.filter(function (o) { return o.prioridad === "urgente"; });

  $("#vista").innerHTML =
    '<div class="pagina-head">' +
      '<div><h2>Hola, bienvenido</h2><p class="sub">' + fechaLarga() + "</p></div>" +
      '<button class="btn" data-hash="#/nueva"><i class="ti ti-plus"></i> Nueva orden</button>' +
    "</div>" +

    '<div class="kpis">' +
      kpi("Órdenes abiertas", abiertas.length, "ti-progress") +
      kpi("Listas para entregar", listas.length, "ti-circle-check", listas.length ? "verde" : "") +
      kpi("Atrasadas", atrasadas.length, "ti-alarm", atrasadas.length ? "rojo" : "") +
      kpi("Cobrado hoy", cop(cobradoHoy), "ti-cash") +
      kpi("Por cobrar", cop(porCobrar), "ti-alert-circle", porCobrar > 0 ? "rojo" : "verde") +
    "</div>" +

    '<div class="grid-2">' +
      '<section class="box">' +
        '<div class="box-head"><h3><i class="ti ti-circle-check"></i> Listas para entregar</h3>' +
          '<a class="mini-link" data-hash="#/ordenes">Ver tablero</a></div>' +
        (listas.length ? '<div class="lista-ordenes">' + listas.map(filaInicio).join("") + "</div>"
          : vacio("No hay equipos listos pendientes de entrega.", "ti-checks")) +
      "</section>" +

      '<section class="box">' +
        '<div class="box-head"><h3><i class="ti ti-alarm"></i> Atrasadas</h3></div>' +
        (atrasadas.length ? '<div class="lista-ordenes">' + atrasadas.map(filaInicio).join("") + "</div>"
          : vacio("Ninguna orden atrasada. Bien ahí.", "ti-mood-smile")) +
      "</section>" +
    "</div>" +

    '<div class="grid-2">' +
      '<section class="box">' +
        '<div class="box-head"><h3><i class="ti ti-wallet"></i> Cartera</h3>' +
          '<a class="mini-link" data-hash="#/clientes">Clientes</a></div>' +
        ((d.cartera || []).length
          ? '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Cliente</th><th class="der">Saldo</th></tr></thead><tbody>' +
            d.cartera.slice(0, 8).map(function (c) {
              return '<tr class="fila-link" data-hash="#/orden/' + c.id + '">' +
                '<td class="mono">#' + String(c.numero).padStart(4, "0") + "</td>" +
                "<td>" + esc(c.cliente || "—") + "<small class=\"block\">" + esc(c.equipo || "") + "</small></td>" +
                '<td class="der mono rojo">' + cop(c.saldo) + "</td></tr>";
            }).join("") + "</tbody></table></div>"
          : vacio("Nadie debe nada.", "ti-check")) +
      "</section>" +

      '<section class="box">' +
        '<div class="box-head"><h3><i class="ti ti-shield-check"></i> Garantías por vencer</h3></div>' +
        ((d.garantias || []).length
          ? '<div class="lista-ordenes">' + d.garantias.map(function (g) {
              var dias = diasEntre(new Date(), g.garantia_hasta);
              return '<a class="fila-orden" data-hash="#/orden/' + g.id + '">' +
                "<div><b>" + esc(g.equipo) + "</b><small>" + esc((g.clientes || {}).nombre || "") + "</small></div>" +
                '<span class="tag-warn">' + (dias <= 0 ? "vence hoy" : "en " + dias + " día" + (dias === 1 ? "" : "s")) + "</span></a>";
            }).join("") + "</div>"
          : vacio("Sin garantías próximas a vencer.", "ti-shield-check")) +
      "</section>" +
    "</div>" +

    (urgentes.length
      ? '<section class="box borde-urgente"><h3><i class="ti ti-flame"></i> Urgentes</h3><div class="lista-ordenes">' +
        urgentes.map(filaInicio).join("") + "</div></section>"
      : "");
}

function filaInicio(o) {
  var c = o.clientes || {};
  var atras = o.fecha_prometida && diasEntre(o.fecha_prometida, new Date()) > 0;
  return '<a class="fila-orden" data-hash="#/orden/' + o.id + '">' +
    "<div><b>#" + String(o.numero).padStart(4, "0") + " · " + esc(o.equipo) + "</b>" +
    "<small>" + esc(c.nombre || "Sin cliente") + (o.fecha_prometida ? " · " + fdate(o.fecha_prometida) : "") + "</small></div>" +
    '<span class="' + (Number(o.saldo) > 0.5 ? "monto-deuda" : "monto-ok") + '">' + (Number(o.saldo) > 0.5 ? cop(o.saldo) : "Pagado") + "</span>" +
    "</a>";
}

function fechaLarga() {
  return new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

/* ======================= MI CUENTA ======================= */
async function modalCuenta() {
  var s = await sesionActual();
  var correo = s ? s.user.email : "";
  abrirModal(
    "<h3>Mi cuenta</h3>" +
    '<p class="modal-sub">' + esc(correo) + "</p>" +
    '<form id="form-cuenta" class="form-modal">' +
      '<label class="lb">Nueva contraseña</label>' +
      '<input id="ct-pass" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo 8 caracteres" required>' +
      '<label class="lb">Repetir contraseña</label>' +
      '<input id="ct-pass2" type="password" autocomplete="new-password" minlength="8" required>' +
      '<div class="modal-acciones"><button type="button" class="btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="btn"><i class="ti ti-check"></i> Cambiar</button></div>' +
    "</form>"
  );
  $("#form-cuenta").addEventListener("submit", async function (e) {
    e.preventDefault();
    var p1 = $("#ct-pass").value, p2 = $("#ct-pass2").value;
    if (p1 !== p2) { toast("Las contraseñas no coinciden", "error"); return; }
    if (p1.length < 8) { toast("Usa al menos 8 caracteres", "error"); return; }
    try {
      var res = await sb.auth.updateUser({ password: p1 });
      if (res.error) throw res.error;
      cerrarModal();
      toast("Contraseña actualizada");
    } catch (err) { toast(errorDe(err), "error"); }
  });
  setTimeout(function () { $("#ct-pass").focus(); }, 50);
}
