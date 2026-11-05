/* ============================================================
   SIR·TECH POS · Configuración
   ============================================================ */

const SUPABASE_URL = "https://fdhehsylvogkrutzlood.supabase.co";
const SUPABASE_KEY = "sb_publishable_6b0PZi4zdpVqqW3gSf-QmA_jzhojg1d";

const CFG = {
  negocio: "SIR·TECH",
  ciudad: "Arauca",
  whatsapp: "573124244589",
  zona: "America/Bogota",
  moneda: "COP"
};

/* Estados de una orden, en el orden del tablero */
const ESTADOS = [
  { k: "diagnostico",        n: "En diagnóstico",     c: "#c9973f", i: "ti-zoom-scan" },
  { k: "esperando_repuesto", n: "Esperando repuesto", c: "#b45309", i: "ti-truck-delivery" },
  { k: "reparando",          n: "Reparando",          c: "#2563eb", i: "ti-tool" },
  { k: "listo",              n: "Listo",              c: "#15803d", i: "ti-circle-check" },
  { k: "entregado",          n: "Entregado",          c: "#4b5563", i: "ti-hand-stop" },
  { k: "no_reparable",       n: "No reparable",       c: "#991b1b", i: "ti-alert-triangle" },
  { k: "cancelado",          n: "Cancelado",          c: "#5b5b5b", i: "ti-x" }
];

const ESTADOS_ABIERTOS = ["diagnostico", "esperando_repuesto", "reparando", "listo"];
const ESTADOS_FINALES  = ["entregado", "no_reparable", "cancelado"];

const METODOS = [
  { k: "efectivo",    n: "Efectivo",    c: "#15803d" },
  { k: "nequi",       n: "Nequi",       c: "#2563eb" },
  { k: "transferencia", n: "Transferencia", c: "#7c3aed" },
  { k: "tarjeta",     n: "Tarjeta",     c: "#b45309" },
  { k: "otro",        n: "Otro",        c: "#6b7280" }
];

/* Métodos disponibles al registrar un pago. "Mixto" se divide en varios
   registros, uno por cada medio, para que la caja y los reportes cuadren. */
const METODOS_PAGO = [
  { k: "efectivo",      n: "Efectivo" },
  { k: "transferencia", n: "Transferencia" },
  { k: "tarjeta",       n: "Tarjeta" },
  { k: "mixto",         n: "Mixto" }
];

const TIPOS_MOV = [
  { k: "gasto",     n: "Gasto del negocio" },
  { k: "proveedor", n: "Pago a proveedor" },
  { k: "retiro",    n: "Retiro del dueño" },
  { k: "prestamo",  n: "Préstamo al negocio" },
  { k: "abono",     n: "Abono de préstamo" },
  { k: "ingreso",   n: "Ingreso / base" },
  { k: "traslado",  n: "Pasar efectivo a Nequi" }
];

function estadoInfo(k) {
  return ESTADOS.find(function (e) { return e.k === k; }) || { k: k, n: k, c: "#6b7280", i: "ti-point" };
}

function metodoInfo(k) {
  return METODOS.find(function (m) { return m.k === k; }) || { k: k, n: k, c: "#6b7280" };
}

function tipoMovInfo(k) {
  return TIPOS_MOV.find(function (t) { return t.k === k; }) || { k: k, n: k };
}
