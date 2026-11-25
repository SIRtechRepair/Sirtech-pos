/* ============================================================
   SIR·TECH POS · Utilidades de interfaz
   ============================================================ */

const $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
const $$ = function (sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

const MONEY = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function norm(v) {
  return String(v == null ? "" : v)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

function telNorm(v) {
  var d = String(v == null ? "" : v).replace(/\D/g, "");
  if (d.length > 10) d = d.slice(-10);
  return d || "";
}

function num(v) {
  if (v === "" || v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  var s = String(v).replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  var neg = s.charAt(0) === "-";
  s = s.replace(/-/g, "");
  var n;
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) {
    n = Number(s.replace(/\./g, "").replace(",", "."));
  } else {
    n = Number(s.replace(/[.,]/g, ""));
  }
  if (!isFinite(n)) n = 0;
  return neg ? -n : n;
}

/* Cantidades y stock: aceptan decimales (0,5 / 0.5). A diferencia de num(),
   aquí un separador único con 1 o 2 decimales se interpreta como decimal. */
function numCantidad(v) {
  if (v && typeof v === "object" && "valueAsNumber" in v) {
    if (isFinite(v.valueAsNumber)) return v.valueAsNumber;
    v = v.value;
  }
  if (v === "" || v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  var s = String(v).trim().replace(/\s+/g, "").replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  var neg = s.charAt(0) === "-";
  s = s.replace(/-/g, "");
  var n;
  if (s.indexOf(",") > -1) {
    // En Colombia la coma es decimal y el punto de miles.
    n = Number(s.replace(/\./g, "").replace(",", "."));
  } else {
    var puntos = s.split(".");
    if (puntos.length > 2) n = Number(puntos.join(""));
    else if (puntos.length === 2 && puntos[1].length >= 3) n = Number(puntos.join(""));
    else n = Number(s);
  }
  if (!isFinite(n)) n = 0;
  return neg ? -n : n;
}

function cop(v) {
  var n = Math.round(Number(v) || 0);
  return (n < 0 ? "-$" : "$") + MONEY.format(Math.abs(n));
}

function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v).trim();
  // Las columnas date llegan como YYYY-MM-DD y se interpretan en hora local.
  // Las columnas timestamptz llegan con hora y zona; hay que conservarlas.
  var soloFecha = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fdate(v) {
  var d = parseFecha(v);
  if (!d) return "—";
  var hoy = new Date();
  var mismoAno = d.getFullYear() === hoy.getFullYear();
  return d.toLocaleDateString("es-CO", {
    day: "numeric", month: "short", year: mismoAno ? undefined : "numeric"
  });
}

function fhora(v) {
  var d = parseFecha(v);
  if (!d) return "—";
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

function fdatetime(v) {
  var d = parseFecha(v);
  if (!d) return "—";
  return fdate(d) + " · " + fhora(d);
}

function inputDate(v) {
  var d = parseFecha(v);
  if (!d) return "";
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var dia = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + dia;
}

function hoyInput() { return inputDate(new Date()); }

function haceDias(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return inputDate(d);
}

function diasEntre(a, b) {
  var d1 = parseFecha(a), d2 = parseFecha(b);
  if (!d1 || !d2) return 0;
  // Comparar días completos: una orden que vence hoy no está atrasada
  // aunque ya sea la tarde.
  var m1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  var m2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((m2 - m1) / 86400000);
}

/* Límites de un día local expresados como instante UTC, para filtrar
   columnas timestamptz sin depender de la zona horaria de Supabase. */
function inicioDiaISO(v) {
  var d = parseFecha(v);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function finDiaISO(v) {
  var d = parseFecha(v);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/* ---------- avisos ---------- */
var _toastTimer = null;
function toast(msg, tipo) {
  var el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + (tipo || "ok");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.className = "toast oculto"; }, 3200);
}

function errorDe(e) {
  var m = (e && (e.message || e.error_description || e.details || e.hint)) || String(e || "");
  if (/fetch|network|failed to fetch/i.test(m)) return "Sin conexión. Revisa tu internet.";
  return m;
}

/* ---------- modal ---------- */
function abrirModal(html, ancho) {
  var m = $("#modal");
  var box = $("#modal-box");
  box.className = "modal-box" + (ancho ? " " + ancho : "");
  box.innerHTML =
    '<button type="button" class="modal-x" data-cerrar title="Cerrar" aria-label="Cerrar">' +
      '<i class="ti ti-x"></i>' +
    "</button>" + html;
  m.classList.remove("oculto");
  document.body.classList.add("sin-scroll");
}

function cerrarModal() {
  $("#modal").classList.add("oculto");
  $("#modal-box").innerHTML = "";
  document.body.classList.remove("sin-scroll");
}

/* Las modales solo se cierran con sus botones (X, Cancelar o Cerrar).
   No se cierran al hacer clic fuera ni al arrastrar hacia el fondo. */
document.addEventListener("click", function (e) {
  var c = e.target.closest && e.target.closest("[data-cerrar]");
  if (c) cerrarModal();
});

let _ultimoAvisoInvalido = 0;
document.addEventListener("invalid", function (e) {
  if (!e.target || !e.target.closest || !e.target.closest("form")) return;
  if (Date.now() - _ultimoAvisoInvalido < 800) return;
  _ultimoAvisoInvalido = Date.now();
  toast("Completa los campos obligatorios.", "error");
}, true);

/* ---------- piezas reutilizables ---------- */
function badgeEstado(k) {
  var e = estadoInfo(k);
  return '<span class="pill" style="--pc:' + e.c + '"><i class="ti ' + e.i + '"></i>' + esc(e.n) + "</span>";
}

function badgeMetodo(k) {
  var m = metodoInfo(k);
  return '<span class="metodo" style="--pc:' + m.c + '">' + esc(m.n) + "</span>";
}

function vacio(texto, icono) {
  return '<div class="vacio"><i class="ti ' + (icono || "ti-database-off") + '"></i><p>' + esc(texto) + "</p></div>";
}

function cargando() {
  return '<div class="cargando"><i class="ti ti-loader-2 girando"></i> Cargando…</div>';
}

function waLink(telefono, texto) {
  var t = String(telefono || "").replace(/\D/g, "");
  if (t.length === 10) t = "57" + t;
  return "https://wa.me/" + t + "?text=" + encodeURIComponent(texto || "");
}

function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, ms || 250);
  };
}

function atributos(obj) {
  return Object.keys(obj).map(function (k) {
    return k + '="' + esc(obj[k]) + '"';
  }).join(" ");
}
