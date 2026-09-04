/**
 * Parsers e intents rule-based del bot WhatsApp (funciones puras, testeables).
 */

function getQueryParam(query, key) {
  if (!query || typeof query !== 'object') return undefined;
  return query[key];
}

function parseJsonBody(reqOrString) {
  if (typeof reqOrString === 'string') {
    try {
      return JSON.parse(reqOrString || '{}');
    } catch {
      return {};
    }
  }
  const req = reqOrString;
  if (req == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  return {};
}

function extractFirstIncomingMessage(body) {
  const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
  const changes = entry && Array.isArray(entry.changes) ? entry.changes[0] : null;
  const value = changes?.value;
  const messages = value && Array.isArray(value.messages) ? value.messages : null;
  const msg = messages && messages.length > 0 ? messages[0] : null;
  return msg || null;
}

function normalizeIntentText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

function detectCategoryInfo(textLower) {
  const rules = [
    {
      id: 'comida',
      label: 'comida',
      keys: ['comida', 'almuerzo', 'desayuno', 'cena', 'restaurante', 'menu', 'menú', 'pollo', 'hamburguesa'],
    },
    { id: 'transporte', label: 'transporte', keys: ['taxi', 'uber', 'movilidad', 'combi', 'pasaje', 'transporte'] },
    { id: 'transferencia', label: 'transferencia', keys: ['yape', 'plin', 'transferencia'] },
    { id: 'compras', label: 'compras', keys: ['mercado', 'bodega', 'tienda'] },
    { id: 'vivienda', label: 'vivienda', keys: ['alquiler', 'renta', 'departamento', 'vivienda'] },
    { id: 'salud', label: 'salud', keys: ['salud', 'farmacia', 'medicina', 'doctor', 'clinica'] },
    { id: 'servicios', label: 'servicios', keys: ['luz', 'agua', 'internet', 'telefono', 'servicio'] },
    { id: 'suscripciones', label: 'suscripciones', keys: ['netflix', 'spotify', 'suscripcion', 'suscripciones'] },
    { id: 'educacion', label: 'educacion', keys: ['curso', 'colegio', 'universidad', 'educacion'] },
    { id: 'ocio', label: 'ocio', keys: ['cine', 'ocio', 'fiesta', 'salida'] },
  ];
  for (const r of rules) {
    if (r.keys.some((k) => textLower.includes(k))) return { categoryId: r.id, categoryLabel: r.label };
  }
  return { categoryId: 'otros', categoryLabel: 'otros' };
}

function isFinanceRelated(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;

  const normalized = normalizeIntentText(raw).replace(/\s+/g, ' ').trim();

  const financeKeywords =
    /\b(gasto|gaste|dinero|plata|comida|taxi|mercado|bodega|pago|pague|transferencia|yape|plin|cuanto|resumen|voy|mes|pollo|almuerzo|desayuno|cena|hamburguesa|restaurante|cafe|uber|movilidad|combi|bus|pasaje|cine|netflix|tienda|supermercado)\b/;

  if (financeKeywords.test(normalized)) return true;

  const hasNumber = /\d/.test(raw);
  const hasText = /[a-zA-Z]/.test(raw);

  if (!(hasNumber && hasText)) return false;

  const contextHint =
    /\b(comida|almuerzo|desayuno|cena|taxi|uber|movilidad|pasaje|yape|plin|transferencia|mercado|bodega|tienda|supermercado|pollo|hamburguesa|cafe|restaurante|sol|soles|pen|s\/)\b/;

  return contextHint.test(normalized);
}

function detectNonExpenseIntent(text) {
  const n = normalizeIntentText(text).replace(/\s+/g, ' ').trim();
  if (!n) return null;

  if (/\bno\s+era\b/.test(n)) return 'command';
  if (/\bborra(r|ste|ron|mos)?\b/.test(n)) return 'command';
  if (/\belimina(r|ste|ron|mos)?\b/.test(n)) return 'command';
  if (/\bcorrige(r|mos|ste)?\b/.test(n)) return 'command';
  if (/\bcambia(r|mos|ste|s)?\b/.test(n)) return 'command';

  if (/\bcuanto\b/.test(n)) return 'query';
  if (/\bresumen\b/.test(n)) return 'query';
  if (/\bcomo\s+voy\b/.test(n)) return 'query';
  if (/\bque\s+tal\b/.test(n)) return 'query';

  return null;
}

function detectRelativeDayMarker(text) {
  const n = normalizeIntentText(text).replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (/\bmanana\b/.test(n)) return 'future';
  if (/\bayer\b/.test(n)) return 'past';
  return null;
}

function textLooksLikeExpenseCandidate(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const lower = raw.trim().toLowerCase();
  const amountMatch = lower.match(/(\d+(?:[.,]\d{1,2})?)/);
  const hasExpenseVerb = /(gaste|gast[eé]|pague|pagu[eé]|compre|compr[eé])/.test(lower);
  const hasCurrencyHint = /(s\/|sol|soles|pen)/.test(lower);
  const hasCategoryHint =
    /(comida|almuerzo|taxi|uber|movilidad|combi|pasaje|yape|plin|transferencia|mercado|bodega|tienda|farmacia|internet|luz|agua|cine|alquiler|restaurante|pollo|hamburguesa)/.test(lower);
  return (
    hasExpenseVerb ||
    (amountMatch && (hasCurrencyHint || hasCategoryHint || lower.split(/\s+/).length >= 2))
  );
}

function chunkMeetsNumberPlusTextRule(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const amountMatch = lower.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!amountMatch || amountMatch.index == null) return false;
  const amount = Number.parseFloat(amountMatch[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const start = amountMatch.index;
  const len = amountMatch[0].length;
  let rest = trimmed.slice(0, start) + trimmed.slice(start + len);
  rest = rest.replace(/\d+(?:[.,]\d{1,2})?/g, ' ');
  rest = rest.replace(/\b(s\/\.?|sol(es)?|pen|soles)\b/gi, ' ');
  rest = rest.replace(/\s+/g, ' ').trim();
  return /[a-záéíóúñü]/i.test(rest);
}

function lineHasDigit(s) {
  return /\d/.test(String(s || ''));
}

function expandExpenseSegments(line) {
  const t = String(line || '').trim();
  if (!t) return [];

  const bySemi = t.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  if (bySemi.length > 1 && bySemi.every(lineHasDigit)) {
    return bySemi.flatMap((s) => expandExpenseSegments(s));
  }

  const byComma = t.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (byComma.length > 1 && byComma.every(lineHasDigit)) {
    return byComma.flatMap((s) => expandExpenseSegments(s));
  }

  const byY = t.split(/\s+y\s+/i).map((s) => s.trim()).filter(Boolean);
  if (byY.length > 1 && byY.every(lineHasDigit)) {
    return byY.flatMap((s) => expandExpenseSegments(s));
  }

  return [t];
}

function parseExpenseFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return { kind: 'none' };
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (!textLooksLikeExpenseCandidate(raw)) return { kind: 'none' };
  if (!chunkMeetsNumberPlusTextRule(raw)) return { kind: 'none' };

  const amountMatch = lower.match(/(\d+(?:[.,]\d{1,2})?)/);
  const amount = Number.parseFloat(amountMatch[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return { kind: 'none' };

  const { categoryId, categoryLabel } = detectCategoryInfo(lower);
  const desc = cleanDescriptionText(raw);
  const description = desc || categoryLabel;
  return {
    kind: 'expense',
    amount: Math.round(amount * 100) / 100,
    description,
    categoryId,
    categoryLabel,
    comercio: description.slice(0, 80),
  };
}

function cleanDescriptionText(text) {
  let s = String(text || '');
  s = s.replace(/\b(gaste|gast[eé]|pague|pagu[eé]|compre|compr[eé]|en)\b/gi, ' ');
  s = s.replace(/s\/\.?/gi, ' ');
  s = s.replace(/\bsol(es)?\b/gi, ' ');
  s = s.replace(/\d+(?:[.,]\d{1,2})?/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function messageAppearsToBeExpenseRegistration(text) {
  const rawLines = String(text || '')
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = rawLines.length > 0 ? rawLines : [String(text || '').trim()].filter(Boolean);
  const chunks = lines.flatMap((ln) => expandExpenseSegments(ln));
  return chunks.some((c) => textLooksLikeExpenseCandidate(c));
}

function parseMultipleExpensesFromText(text) {
  const rawLines = String(text || '')
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = rawLines.length > 0 ? rawLines : [String(text || '').trim()].filter(Boolean);

  const chunks = lines.flatMap((ln) => expandExpenseSegments(ln));

  const valid = [];
  for (const chunk of chunks) {
    const parsed = parseExpenseFromText(chunk);
    if (parsed.kind === 'expense') valid.push(parsed);
  }
  return { valid };
}

function parseVincularCode(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length < 10) return null;
  const u = t.toUpperCase();
  if (!u.startsWith('VINCULAR ')) return null;
  const code = t.slice('VINCULAR '.length).trim();
  return code || null;
}

function hasMonthQueryContext(normalized) {
  return /\beste\s+mes\b/.test(normalized) || /\bdel\s+mes\b/.test(normalized);
}

function parseTodayExpenseQuery(text) {
  const n = normalizeIntentText(text).replace(/\s+/g, ' ').trim();
  if (!n) return null;

  if (/\bresumen\b/.test(n) && /\bhoy\b/.test(n)) {
    return { kind: 'resumen_hoy' };
  }

  if (/\bcuanto\b/.test(n) && /\bhoy\b/.test(n)) {
    return { kind: 'total_hoy' };
  }

  if (/\bcuanto\b/.test(n) && /\bvoy\b/.test(n) && /\ben\b/.test(n)) {
    const m = n.match(/\ben\s+(.+)$/);
    if (!m) return null;
    const tail = m[1].trim();
    if (!tail) return null;
    return { kind: 'voy_en_categoria', tail };
  }

  return null;
}

function parseMonthExpenseQuery(text) {
  const n = normalizeIntentText(text).replace(/\s+/g, ' ').trim();
  if (!n || !hasMonthQueryContext(n)) return null;

  if (/\bresumen\b/.test(n) && (/\bdel\s+mes\b/.test(n) || /\beste\s+mes\b/.test(n))) {
    return { kind: 'resumen_mes' };
  }

  if (/\bcuanto\b/.test(n) && /\bvoy\b/.test(n) && /\ben\b/.test(n)) {
    const mEste = n.match(/\ben\s+(.+?)\s+este\s+mes\b/);
    if (mEste) {
      const tail = mEste[1].trim();
      if (tail) return { kind: 'voy_en_categoria_mes', tail };
    }
    const mDel = n.match(/\ben\s+(.+?)\s+del\s+mes\b/);
    if (mDel) {
      const tail = mDel[1].trim();
      if (tail) return { kind: 'voy_en_categoria_mes', tail };
    }
    return null;
  }

  if (/\bcuanto\b/.test(n) && /\b(gaste|llevo|gasto|gastas)\b/.test(n)) {
    return { kind: 'total_mes' };
  }

  return null;
}

function formatPen(amount) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.00$/, '');
}

module.exports = {
  getQueryParam,
  parseJsonBody,
  extractFirstIncomingMessage,
  normalizeIntentText,
  detectCategoryInfo,
  isFinanceRelated,
  detectNonExpenseIntent,
  detectRelativeDayMarker,
  textLooksLikeExpenseCandidate,
  chunkMeetsNumberPlusTextRule,
  messageAppearsToBeExpenseRegistration,
  parseExpenseFromText,
  parseMultipleExpensesFromText,
  parseVincularCode,
  parseTodayExpenseQuery,
  parseMonthExpenseQuery,
  formatPen,
  cleanDescriptionText,
  expandExpenseSegments,
};
