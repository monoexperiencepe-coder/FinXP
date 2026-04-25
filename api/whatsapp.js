/**
 * Webhook WhatsApp (Meta) — GET (VERIFY_TOKEN) + POST: texto, VINCULAR, respuesta auto.
 * Env: VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * No secretos en código. No modifica api/chat.js.
 */

const { createClient } = require('@supabase/supabase-js');

function getQueryParam(query, key) {
  if (!query || typeof query !== 'object') return undefined;
  return query[key];
}

function parseJsonBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body;
  return {};
}

/**
 * Primer mensaje entrante del payload estándar de WhatsApp Cloud API.
 */
function extractFirstIncomingMessage(body) {
  const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
  const changes = entry && Array.isArray(entry.changes) ? entry.changes[0] : null;
  const value = changes?.value;
  const messages = value && Array.isArray(value.messages) ? value.messages : null;
  const msg = messages && messages.length > 0 ? messages[0] : null;
  return msg || null;
}

/**
 * Log útil sin volcar PII completo ni payloads enormes.
 */
function safeLogWebhookBody(body) {
  const msg = extractFirstIncomingMessage(body);
  const summary = {
    object: body?.object,
    entryLen: Array.isArray(body?.entry) ? body.entry.length : 0,
    message: msg
      ? {
          from: msg.from,
          type: msg.type,
          textBody:
            msg.type === 'text' && msg.text && typeof msg.text.body === 'string'
              ? `${msg.text.body.slice(0, 120)}${msg.text.body.length > 120 ? '…' : ''}`
              : undefined,
        }
      : null,
  };
  console.log('[whatsapp] webhook summary', JSON.stringify(summary));

  try {
    const raw = JSON.stringify(body);
    const max = 4000;
    console.log(
      '[whatsapp] body raw',
      raw.length > max ? `${raw.slice(0, max)}… (${raw.length} chars total)` : raw,
    );
  } catch (e) {
    console.log('[whatsapp] body raw (stringify error)', String(e));
  }
}

const MSG_FALLBACK_GASTO = "Puedo ayudarte a registrar gastos 💸 prueba algo como: 'pollo 15'";
const MSG_DOMINIO_FINANZAS = `Solo puedo ayudarte con tus finanzas 💸
prueba algo como: 'pollo 15' o 'cuanto gasté hoy'`;
const MSG_INTENT_EDIT = 'Aún no puedo editar gastos 😅 pronto lo podrás hacer desde la app';
const MSG_INTENT_QUERY = 'Pronto podrás consultar tus gastos por aquí 📊';
const MSG_SIN_GASTOS_HOY = `Aún no registras gastos hoy 👀
prueba algo como: 'almuerzo 15'`;
const MSG_SIN_GASTOS_MES = 'Aún no tienes gastos registrados este mes 👍';
const MSG_TIME_FUTURE = 'Aún no puedo registrar gastos futuros 😅';
const MSG_TIME_PAST =
  'Aún no puedo registrar gastos de ayer por aquí 😅 Quita la palabra "ayer" o regístralo con fecha en la app.';

const MSG_VINCULO_OK = 'Listo ✅ Tu WhatsApp ya está vinculado a tu cuenta.';
const MSG_VINCULO_BAD = 'Código inválido o vencido.';
const MSG_REQUIERE_VINCULO = 'Para usar este asistente, primero vincula tu cuenta desde la app.';
const MSG_NO_ENTENDI_LINEAS = "No entendí 😅 prueba algo como: 'almuerzo 15'";

let supabaseServiceSingleton = null;

function getServiceSupabase() {
  if (supabaseServiceSingleton) return supabaseServiceSingleton;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabaseServiceSingleton = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return supabaseServiceSingleton;
}

/**
 * Envía un mensaje de texto por la Cloud API de Meta.
 * @param {string} to
 * @param {string} text
 */
async function sendWhatsappTextMessage(to, text) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] falta PHONE_NUMBER_ID o WHATSAPP_TOKEN; no se envía');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error('[whatsapp] Graph API', res.status, raw);
  } else {
    console.log('[whatsapp] enviado OK', raw.length > 500 ? `${raw.slice(0, 500)}…` : raw);
  }
}

/**
 * Parsea "VINCULAR {code}" (sin distinguir mayúsculas en el prefijo). Devuelve code o null.
 * @param {string} [text]
 */
function parseVincularCode(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length < 10) return null; // mínimo "VINCULAR x"
  const u = t.toUpperCase();
  if (!u.startsWith('VINCULAR ')) return null;
  const code = t.slice('VINCULAR '.length).trim();
  return code || null;
}

/**
 * Intenta vincular wa_id (from) al user del código. Si aplica, envía WhatsApp y return true.
 * @param {string} from
 * @param {string} textBody
 * @returns {Promise<boolean>} true = ya se respondió por WA (VINCULAR o error de vinculación)
 */
async function tryVinculacionIfApplicable(from, textBody) {
  const code = parseVincularCode(textBody);
  if (code == null) return false;

  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[whatsapp] VINCULAR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    try {
      await sendWhatsappTextMessage(
        from,
        'Ahora no se puede vincular. Intentá de nuevo en un rato o verificá la app.',
      );
    } catch (e) {
      console.error('[whatsapp] VINCULAR env error', e);
    }
    return true;
  }

  const { data: row, error: selErr } = await supabase
    .from('whatsapp_link_codes')
    .select('id, user_id, used_at, expires_at')
    .eq('code', code)
    .is('used_at', null)
    .maybeSingle();

  if (selErr) {
    console.error('[whatsapp] VINCULAR select', selErr);
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  if (!row) {
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  if (new Date(row.expires_at) <= new Date()) {
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  const nowIso = new Date().toISOString();

  const { error: upsertErr } = await supabase
    .from('whatsapp_links')
    .upsert({ user_id: row.user_id, wa_id: from, verified_at: nowIso }, { onConflict: 'user_id' });

  if (upsertErr) {
    console.error('[whatsapp] VINCULAR upsert whatsapp_links', upsertErr);
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  const { error: useErr } = await supabase
    .from('whatsapp_link_codes')
    .update({ used_at: nowIso })
    .eq('id', row.id)
    .is('used_at', null);

  if (useErr) {
    console.error('[whatsapp] VINCULAR used_at', useErr);
  }

  try {
    await sendWhatsappTextMessage(from, MSG_VINCULO_OK);
  } catch (e) {
    console.error('[whatsapp] VINCULAR ok message', e);
  }
  return true;
}

/**
 * Verifica si el remitente ya está vinculado en whatsapp_links.
 * @param {string} waId
 * @returns {Promise<boolean>}
 */
async function isLinkedWaId(waId) {
  const supabase = getServiceSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('whatsapp_links')
    .select('user_id')
    .eq('wa_id', waId)
    .maybeSingle();
  if (error) {
    console.error('[whatsapp] link lookup', error);
    return false;
  }
  return !!data?.user_id;
}

/**
 * Obtiene user_id vinculado desde whatsapp_links.
 * @param {string} waId
 * @returns {Promise<string | null>}
 */
async function getLinkedUserIdByWaId(waId) {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('whatsapp_links')
    .select('user_id')
    .eq('wa_id', waId)
    .maybeSingle();
  if (error) {
    console.error('[whatsapp] linked user lookup', error);
    return null;
  }
  return typeof data?.user_id === 'string' ? data.user_id : null;
}

function monthKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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

function categoryEmoji(categoryId) {
  const map = {
    comida: '🍔',
    transporte: '🚌',
    transferencia: '💸',
    compras: '🛒',
    vivienda: '🏠',
    salud: '💊',
    servicios: '💡',
    suscripciones: '📱',
    educacion: '📚',
    ocio: '🎬',
    otros: '📦',
  };
  return map[categoryId] || '💸';
}

/**
 * Texto normalizado para keywords (minúsculas, sin tildes).
 */
function normalizeIntentText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
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

/**
 * Comando de edición / corrección (no soportado aún).
 * @returns {'command' | 'query' | null}
 */
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

/**
 * Referencias relativas al día (no soportadas salvo "hoy" implícito).
 * "mañana" normaliza a "manana" (sin tilde).
 * @returns {'future' | 'past' | null}
 */
function detectRelativeDayMarker(text) {
  const n = normalizeIntentText(text).replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (/\bmanana\b/.test(n)) return 'future';
  if (/\bayer\b/.test(n)) return 'past';
  return null;
}

/**
 * Misma heurística que usa el parser por trozo: parece registro de gasto.
 */
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

/**
 * Línea válida para guardar: hay monto parseable y queda texto descriptivo (letras), no solo número.
 */
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

/**
 * True si algún trozo (línea o segmento coma/;/y) parece gasto.
 */
function messageAppearsToBeExpenseRegistration(text) {
  const rawLines = String(text || '')
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = rawLines.length > 0 ? rawLines : [String(text || '').trim()].filter(Boolean);
  const chunks = lines.flatMap((ln) => expandExpenseSegments(ln));
  return chunks.some((c) => textLooksLikeExpenseCandidate(c));
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

function lineHasDigit(s) {
  return /\d/.test(String(s || ''));
}

/**
 * Parte una línea en posibles gastos: primero `;`, luego `,`, luego ` y `.
 * Solo divide cuando hay 2+ trozos y cada trozo trae al menos un dígito (evita partir frases normales).
 */
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

function formatPen(amount) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.00$/, '');
}

async function saveExpenseFromWhatsapp(userId, parsed) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error('Falta configuración de Supabase');
  const now = new Date();
  const fechaIso = now.toISOString();
  const mes = monthKeyLocal(now);
  const payload = {
    user_id: userId,
    fecha: fechaIso,
    cuenta: 'Principal',
    medio_de_pago: 'WhatsApp',
    banco: 'N/A',
    categoria: parsed.categoryId,
    comercio: parsed.comercio,
    es_esencial: false,
    estado_de_animo: null,
    moneda: 'PEN',
    descripcion: parsed.description,
    importe: parsed.amount,
    mes,
    xp_ganado: 10,
  };
  const { error } = await supabase.from('expenses').insert(payload);
  if (error) throw error;
}

function dayBoundsLocal(refDate = new Date()) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0, 0, 0, 0);
  const end = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Calcula cuánto va gastado HOY en la categoría, para el usuario.
 * @param {string} userId
 * @param {string} categoryId
 * @returns {Promise<number>}
 */
async function getTodaySpentByCategory(userId, categoryId) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { startIso, endIso } = dayBoundsLocal(new Date());
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .eq('categoria', categoryId)
    .gte('fecha', startIso)
    .lt('fecha', endIso);
  if (error) {
    console.error('[whatsapp] today category sum error', error);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.importe || 0), 0);
}

async function getTodayTotalSpent(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { startIso, endIso } = dayBoundsLocal(new Date());
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .gte('fecha', startIso)
    .lt('fecha', endIso);
  if (error) {
    console.error('[whatsapp] today total sum error', error);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.importe || 0), 0);
}

const CATEGORY_ORDER_RESUMEN = [
  'comida',
  'transporte',
  'transferencia',
  'compras',
  'vivienda',
  'salud',
  'servicios',
  'suscripciones',
  'educacion',
  'ocio',
  'otros',
];

function labelForCategoryId(id) {
  const map = {
    comida: 'comida',
    transporte: 'transporte',
    transferencia: 'transferencia',
    compras: 'compras',
    vivienda: 'vivienda',
    salud: 'salud',
    servicios: 'servicios',
    suscripciones: 'suscripciones',
    educacion: 'educacion',
    ocio: 'ocio',
    otros: 'otros',
  };
  return map[id] || id;
}

/** Líneas "emoji categoría: S/X" solo para montos > 0. */
function categoryLinesFromByCat(byCat) {
  const lines = [];
  const seen = new Set();
  for (const id of CATEGORY_ORDER_RESUMEN) {
    const v = byCat[id];
    if (v > 0) {
      lines.push(`${categoryEmoji(id)} ${labelForCategoryId(id)}: S/${formatPen(v)}`);
      seen.add(id);
    }
  }
  for (const id of Object.keys(byCat)) {
    if (!seen.has(id) && byCat[id] > 0) {
      lines.push(`${categoryEmoji(id)} ${labelForCategoryId(id)}: S/${formatPen(byCat[id])}`);
    }
  }
  return lines;
}

/**
 * Suma de importes de hoy por categoria (clave = valor en columna categoria).
 */
async function getTodayTotalsByCategory(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return {};
  const { startIso, endIso } = dayBoundsLocal(new Date());
  const { data, error } = await supabase
    .from('expenses')
    .select('categoria, importe')
    .eq('user_id', userId)
    .gte('fecha', startIso)
    .lt('fecha', endIso);
  if (error) {
    console.error('[whatsapp] today by-category error', error);
    return {};
  }
  const totals = {};
  for (const row of data || []) {
    const cat = typeof row.categoria === 'string' && row.categoria ? row.categoria : 'otros';
    totals[cat] = (totals[cat] || 0) + Number(row.importe || 0);
  }
  return totals;
}

/**
 * Texto de "resumen de hoy" con categorías con gasto > 0.
 */
async function buildResumenHoyMessage(userId) {
  const byCat = await getTodayTotalsByCategory(userId);
  const total = Object.values(byCat).reduce((s, v) => s + v, 0);
  if (total <= 0) return MSG_SIN_GASTOS_HOY;
  const lines = categoryLinesFromByCat(byCat);
  return `Así va tu día 👇\n\n${lines.join('\n')}\n\nTotal: S/${formatPen(total)} 💸`;
}

/**
 * Respuesta "cuanto … hoy": total + desglose por categoría (> 0).
 */
async function buildCuantoHoyMessage(userId) {
  const byCat = await getTodayTotalsByCategory(userId);
  const total = Object.values(byCat).reduce((s, v) => s + v, 0);
  if (total <= 0) return MSG_SIN_GASTOS_HOY;
  const lines = categoryLinesFromByCat(byCat);
  return `Hoy llevas S/${formatPen(total)} 💸\n${lines.join('\n')}`;
}

/**
 * Consultas de lectura soportadas (hoy, sin IA).
 * @returns {{ kind: 'resumen_hoy' } | { kind: 'total_hoy' } | { kind: 'voy_en_categoria', tail: string } | null}
 */
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

/**
 * Si el mensaje es una consulta de hoy soportada, responde por WhatsApp y devuelve true.
 */
async function tryHandleTodayExpenseQuery(waFrom, textBody, userId) {
  const q = parseTodayExpenseQuery(textBody);
  if (!q) return false;

  let reply;
  if (q.kind === 'total_hoy') {
    reply = await buildCuantoHoyMessage(userId);
  } else if (q.kind === 'voy_en_categoria') {
    const { categoryId, categoryLabel } = detectCategoryInfo(q.tail.toLowerCase());
    const t = await getTodaySpentByCategory(userId, categoryId);
    const em = categoryEmoji(categoryId);
    reply = t <= 0 ? MSG_SIN_GASTOS_HOY : `Hoy llevas S/${formatPen(t)} en ${categoryLabel} ${em}`;
  } else if (q.kind === 'resumen_hoy') {
    reply = await buildResumenHoyMessage(userId);
  } else {
    return false;
  }

  try {
    await sendWhatsappTextMessage(waFrom, reply);
  } catch (e) {
    console.error('[whatsapp] tryHandleTodayExpenseQuery send', e);
  }
  return true;
}

/**
 * Mes calendario actual (columna expenses.mes, formato YYYY-MM).
 */
function currentMonthKey() {
  return monthKeyLocal(new Date());
}

async function getMonthTotalsByCategory(userId, mesKey) {
  const supabase = getServiceSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('expenses')
    .select('categoria, importe')
    .eq('user_id', userId)
    .eq('mes', mesKey);
  if (error) {
    console.error('[whatsapp] month by-category error', error);
    return {};
  }
  const totals = {};
  for (const row of data || []) {
    const cat = typeof row.categoria === 'string' && row.categoria ? row.categoria : 'otros';
    totals[cat] = (totals[cat] || 0) + Number(row.importe || 0);
  }
  return totals;
}

async function getMonthTotalSpent(userId, mesKey) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .eq('mes', mesKey);
  if (error) {
    console.error('[whatsapp] month total error', error);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.importe || 0), 0);
}

async function getMonthSpentByCategory(userId, categoryId, mesKey) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .eq('categoria', categoryId)
    .eq('mes', mesKey);
  if (error) {
    console.error('[whatsapp] month category sum error', error);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.importe || 0), 0);
}

function hasMonthQueryContext(normalized) {
  return /\beste\s+mes\b/.test(normalized) || /\bdel\s+mes\b/.test(normalized);
}

/**
 * @returns {{ kind: 'resumen_mes' } | { kind: 'total_mes' } | { kind: 'voy_en_categoria_mes', tail: string } | null}
 */
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

async function buildResumenMesMessage(userId, mesKey) {
  const byCat = await getMonthTotalsByCategory(userId, mesKey);
  const total = Object.values(byCat).reduce((s, v) => s + v, 0);
  if (total <= 0) return MSG_SIN_GASTOS_MES;
  const lines = categoryLinesFromByCat(byCat);
  return `Resumen del mes 👇\n\n${lines.join('\n')}\n\nTotal: S/${formatPen(total)} 💸`;
}

async function buildCuantoMesTotalMessage(userId, mesKey) {
  const t = await getMonthTotalSpent(userId, mesKey);
  if (t <= 0) return MSG_SIN_GASTOS_MES;
  return `Este mes llevas S/${formatPen(t)} 💸`;
}

async function tryHandleMonthExpenseQuery(waFrom, textBody, userId) {
  const q = parseMonthExpenseQuery(textBody);
  if (!q) return false;

  const mesKey = currentMonthKey();

  let reply;
  if (q.kind === 'total_mes') {
    reply = await buildCuantoMesTotalMessage(userId, mesKey);
  } else if (q.kind === 'voy_en_categoria_mes') {
    const { categoryId, categoryLabel } = detectCategoryInfo(q.tail.toLowerCase());
    const t = await getMonthSpentByCategory(userId, categoryId, mesKey);
    const em = categoryEmoji(categoryId);
    reply = t <= 0 ? MSG_SIN_GASTOS_MES : `Este mes llevas S/${formatPen(t)} en ${categoryLabel} ${em}`;
  } else if (q.kind === 'resumen_mes') {
    reply = await buildResumenMesMessage(userId, mesKey);
  } else {
    return false;
  }

  try {
    await sendWhatsappTextMessage(waFrom, reply);
  } catch (e) {
    console.error('[whatsapp] tryHandleMonthExpenseQuery send', e);
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = getQueryParam(req.query, 'hub.mode');
    const verifyToken = getQueryParam(req.query, 'hub.verify_token');
    const challenge = getQueryParam(req.query, 'hub.challenge');

    const expected = process.env.VERIFY_TOKEN;
    if (expected == null || expected === '') {
      console.warn('[whatsapp] GET: falta VERIFY_TOKEN en entorno');
      return res.status(403).end();
    }

    if (verifyToken !== expected) {
      return res.status(403).end();
    }

    console.log('[whatsapp] GET verify ok', { mode, challengeLen: String(challenge ?? '').length });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(challenge != null ? String(challenge) : '');
  }

  if (req.method === 'POST') {
    const body = parseJsonBody(req);
    safeLogWebhookBody(body);

    const msg = extractFirstIncomingMessage(body);
    if (msg) {
      const from = msg.from;
      const type = msg.type;
      const textBody =
        type === 'text' && msg.text && typeof msg.text.body === 'string' ? msg.text.body : undefined;
      console.log('[whatsapp] incoming', JSON.stringify({ from, type, textBody }));

      if (type === 'text' && from != null && from !== '') {
        const waFrom = String(from);
        try {
          const vincularHandled = await tryVinculacionIfApplicable(waFrom, textBody);
          if (!vincularHandled) {
            const linkedUserId = await getLinkedUserIdByWaId(waFrom);
            if (!linkedUserId) {
              await sendWhatsappTextMessage(waFrom, MSG_REQUIERE_VINCULO);
              return res.status(200).json({ ok: true });
            }
            const intent = detectNonExpenseIntent(textBody);
            if (intent === 'command') {
              await sendWhatsappTextMessage(waFrom, MSG_INTENT_EDIT);
              return res.status(200).json({ ok: true });
            }
            const handledTodayQuery = await tryHandleTodayExpenseQuery(waFrom, textBody, linkedUserId);
            if (handledTodayQuery) {
              return res.status(200).json({ ok: true });
            }
            const handledMonthQuery = await tryHandleMonthExpenseQuery(waFrom, textBody, linkedUserId);
            if (handledMonthQuery) {
              return res.status(200).json({ ok: true });
            }
            if (intent === 'query') {
              await sendWhatsappTextMessage(waFrom, MSG_INTENT_QUERY);
              return res.status(200).json({ ok: true });
            }
            if (!messageAppearsToBeExpenseRegistration(textBody)) {
              if (!isFinanceRelated(textBody)) {
                await sendWhatsappTextMessage(waFrom, MSG_DOMINIO_FINANZAS);
                return res.status(200).json({ ok: true });
              }
              await sendWhatsappTextMessage(waFrom, MSG_FALLBACK_GASTO);
              return res.status(200).json({ ok: true });
            }
            const dayMarker = detectRelativeDayMarker(textBody);
            if (dayMarker === 'future') {
              await sendWhatsappTextMessage(waFrom, MSG_TIME_FUTURE);
              return res.status(200).json({ ok: true });
            }
            if (dayMarker === 'past') {
              await sendWhatsappTextMessage(waFrom, MSG_TIME_PAST);
              return res.status(200).json({ ok: true });
            }
            const batch = parseMultipleExpensesFromText(textBody);
            if (batch.valid.length === 0) {
              await sendWhatsappTextMessage(waFrom, MSG_NO_ENTENDI_LINEAS);
              return res.status(200).json({ ok: true });
            }
           
            try {
              await Promise.all(
                batch.valid.map((e) => saveExpenseFromWhatsapp(linkedUserId, e)),
              );
            
              const summaryLines = batch.valid.map(
                (e) => `• S/${formatPen(e.amount)} en ${e.categoryLabel}`,
              );
            
              const todayTotal = await getTodayTotalSpent(linkedUserId);
            
              await sendWhatsappTextMessage(
                waFrom,
                `Listo 👍 guardé:\n${summaryLines.join('\n')}\n\nHoy ya vas S/${formatPen(todayTotal)} 💸`,
              );
            } catch (saveErr) {
              console.error('[whatsapp] save expense error', saveErr);
              await sendWhatsappTextMessage(
                waFrom,
                'No pude registrar ese gasto ahora. Inténtalo de nuevo en un momento.',
              );
            }
            return res.status(200).json({ ok: true });
          }
        } catch (e) {
          console.error('[whatsapp] error al procesar / responder', e);
        }
      }
    } else {
      console.log('[whatsapp] incoming (sin mensaje en payload)');
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
