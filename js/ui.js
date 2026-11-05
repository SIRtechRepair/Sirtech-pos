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

function cop(v) {
  var n = Math.round(Number(v) || 0);
  return (n < 0 ? "-$" : "$") + MONEY.format(Math.abs(n));
}

function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(v);
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
  return Math.round((d2 - d1) / 86400000);
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
  box.innerHTML = html;
  m.classList.remove("oculto");
  document.body.classList.add("sin-scroll");
}

function cerrarModal() {
  $("#modal").classList.add("oculto");
  $("#modal-box").innerHTML = "";
  document.body.classList.remove("sin-scroll");
}

document.addEventListener("click", function (e) {
  if (e.target && e.target.id === "modal") cerrarModal();
  var c = e.target.closest && e.target.closest("[data-cerrar]");
  if (c) cerrarModal();
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") cerrarModal();
});

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
