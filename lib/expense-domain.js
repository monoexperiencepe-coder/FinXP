/**
 * Lógica pura de dominio compartida App ↔ WhatsApp (CommonJS para api/ y lib/).
 * Fuente de verdad para: fechas Lima, XP, racha, resolución de categorías.
 */

const LIMA_TZ = 'America/Lima';
const XP_REGISTRAR_GASTO = 10;
const XP_REGISTRAR_INGRESO = 20;

const XP_TO_NEXT_BY_LEVEL = {
  1: 500,
  2: 700,
  3: 1300,
  4: 500,
  5: 2000,
};

/** Alias semánticos → tokens normalizados para matchear user_categories.nombre */
const SEMANTIC_CATEGORY_ALIASES = {
  comida: ['comida', 'alimentacion', 'alimentación', 'restaurante', 'supermercado', 'delivery', 'almuerzo', 'desayuno', 'cena'],
  transporte: ['transporte', 'movilidad', 'taxi', 'uber', 'pasaje', 'combi'],
  transferencia: ['transferencia', 'yape', 'plin'],
  compras: ['compras', 'mercado', 'bodega', 'tienda', 'shopping'],
  vivienda: ['vivienda', 'alquiler', 'renta', 'departamento', 'hogar'],
  salud: ['salud', 'farmacia', 'medicina', 'doctor', 'clinica', 'clínica'],
  servicios: ['servicios', 'luz', 'agua', 'internet', 'telefono', 'teléfono'],
  suscripciones: ['suscripcion', 'suscripción', 'suscripciones', 'netflix', 'spotify'],
  educacion: ['educacion', 'educación', 'curso', 'colegio', 'universidad', 'estudio'],
  ocio: ['ocio', 'cine', 'fiesta', 'salida', 'entretenimiento'],
  otros: ['otro', 'otros', 'general', 'misc', 'varios'],
};

function xpRequiredForNextLevel(nivel) {
  return XP_TO_NEXT_BY_LEVEL[nivel] ?? 2500;
}

function normalizeCategoryToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function limaDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** YYYY-MM-DD en America/Lima */
function toDateKeyLima(date = new Date()) {
  const p = limaDateParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** YYYY-MM en America/Lima */
function currentYearMonthLima(date = new Date()) {
  const p = limaDateParts(date);
  return `${p.year}-${p.month}`;
}

function addDaysToDateKey(dateKey, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
  if (!m) return dateKey;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Mediodía Lima como ISO (Perú UTC-5 sin DST) */
function expenseFechaIsoLima(date = new Date()) {
  const dateKey = toDateKeyLima(date);
  return `${dateKey}T12:00:00.000-05:00`;
}

/** Límites del día calendario en Lima para queries */
function dayBoundsLima(refDate = new Date()) {
  const dateKey = toDateKeyLima(refDate);
  const nextKey = addDaysToDateKey(dateKey, 1);
  return {
    dateKey,
    startIso: `${dateKey}T00:00:00.000-05:00`,
    endIso: `${nextKey}T00:00:00.000-05:00`,
  };
}

function bumpRacha(ultimo, prevRacha, todayKey = toDateKeyLima()) {
  const prev = Number(prevRacha) || 0;
  if (!ultimo) return { rachaActual: 1, ultimoRegistro: todayKey };
  const ultimoKey =
    typeof ultimo === 'string' && ultimo.length >= 10 ? ultimo.slice(0, 10) : String(ultimo);
  if (ultimoKey === todayKey) return { rachaActual: prev, ultimoRegistro: todayKey };
  const yesterday = addDaysToDateKey(todayKey, -1);
  if (ultimoKey === yesterday) return { rachaActual: prev + 1, ultimoRegistro: todayKey };
  return { rachaActual: 1, ultimoRegistro: todayKey };
}

function applyXpToProfile({ nivel, xpActual, xpParaSiguienteNivel, gain }) {
  let n = Number(nivel) || 1;
  let xp = Number(xpActual) || 0;
  let xpNext = Number(xpParaSiguienteNivel) || xpRequiredForNextLevel(n);
  xp += Number(gain) || 0;
  while (xpNext > 0 && xp >= xpNext) {
    xp -= xpNext;
    n += 1;
    xpNext = xpRequiredForNextLevel(n);
  }
  return { nivel: n, xpActual: xp, xpParaSiguienteNivel: xpNext };
}

function mapMoneda(value, fallback = 'PEN') {
  const v = String(value || fallback).toUpperCase();
  return v === 'USD' ? 'USD' : 'PEN';
}

/**
 * Resuelve categoría del gasto contra taxonomía real del usuario.
 * @param {Array<{ nombre: string, tipo?: string }>} userCategories
 * @param {{ categoryId: string, categoryLabel: string, description?: string }} parsed
 * @param {string} [rawText]
 */
function resolveExpenseCategory(userCategories, parsed, rawText) {
  const categories = (userCategories || []).filter((c) => c && c.tipo !== 'ingreso');
  const textNorm = normalizeCategoryToken(rawText || parsed.description || parsed.categoryLabel || '');
  const descNorm = normalizeCategoryToken(parsed.description || '');

  // 1. Match directo por nombre de user_categories
  for (const cat of categories) {
    const nameNorm = normalizeCategoryToken(cat.nombre);
    if (!nameNorm || nameNorm.length < 2) continue;
    const tokens = nameNorm.split(/\s+/).filter(Boolean);
    const inText = textNorm.includes(nameNorm) || descNorm.includes(nameNorm);
    const wordMatch = tokens.some((t) => t.length >= 3 && (textNorm.split(/\s+/).includes(t) || descNorm.split(/\s+/).includes(t)));
    if (inText || wordMatch) {
      return { categoria: cat.nombre, matchKind: 'direct' };
    }
  }

  // 2. Alias semánticos del parser → nombre de categoría del usuario
  const semanticId = parsed.categoryId || 'otros';
  const aliases = SEMANTIC_CATEGORY_ALIASES[semanticId] || SEMANTIC_CATEGORY_ALIASES.otros;
  for (const cat of categories) {
    const nameNorm = normalizeCategoryToken(cat.nombre);
    if (aliases.some((a) => nameNorm.includes(a) || a.includes(nameNorm))) {
      return { categoria: cat.nombre, matchKind: 'semantic' };
    }
  }

  // 3. Fallback: categoría genérica existente
  const otros = categories.find((c) => {
    const n = normalizeCategoryToken(c.nombre);
    return n.includes('otro') || n.includes('general') || n.includes('vario');
  });
  if (otros) return { categoria: otros.nombre, matchKind: 'fallback_otros' };

  if (categories.length > 0) {
    return { categoria: categories[0].nombre, matchKind: 'fallback_first' };
  }

  // Sin categorías cargadas: capitalizar label semántico
  const label = parsed.categoryLabel || semanticId;
  const titled = label.charAt(0).toUpperCase() + label.slice(1);
  return { categoria: titled, matchKind: 'fallback_semantic' };
}

function buildWhatsappExpensePayload({
  userId,
  parsed,
  categoria,
  moneda,
  messageId,
  expenseIndex,
  refDate = new Date(),
}) {
  const description = parsed.description || parsed.categoryLabel || 'Registro WhatsApp';
  return {
    user_id: userId,
    fecha: expenseFechaIsoLima(refDate),
    cuenta: 'Principal',
    medio_de_pago: 'WhatsApp',
    banco: '',
    categoria,
    comercio: (parsed.comercio || description).slice(0, 40),
    es_esencial: false,
    estado_de_animo: null,
    moneda: mapMoneda(moneda),
    descripcion: description.trim(),
    importe: parsed.amount,
    mes: currentYearMonthLima(refDate),
    xp_ganado: XP_REGISTRAR_GASTO,
    source_message_id: messageId,
    source_expense_index: expenseIndex,
  };
}

module.exports = {
  LIMA_TZ,
  XP_REGISTRAR_GASTO,
  XP_REGISTRAR_INGRESO,
  xpRequiredForNextLevel,
  normalizeCategoryToken,
  toDateKeyLima,
  currentYearMonthLima,
  addDaysToDateKey,
  expenseFechaIsoLima,
  dayBoundsLima,
  bumpRacha,
  applyXpToProfile,
  mapMoneda,
  resolveExpenseCategory,
  buildWhatsappExpensePayload,
  SEMANTIC_CATEGORY_ALIASES,
};
