/**
 * Webhook WhatsApp (Meta) — GET (VERIFY_TOKEN) + POST: texto, VINCULAR, respuesta auto.
 * Env: VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, META_APP_SECRET,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * No secretos en código. No modifica api/chat.js.
 *
 * Raw body: `module.exports.config.api.bodyParser = false` (requerido para firma Meta).
 */

const { createClient } = require('@supabase/supabase-js');
const { readRawBodyWithMeta, verifyMetaSignature, diagnoseMetaSignature } = require('./_lib/meta-signature');
const {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
} = require('./_lib/webhook-idempotency');
const { checkRateLimit } = require('./_lib/rate-limit');
const { loadUserExpenseContext, saveWhatsappExpenseBatch } = require('./_lib/expense-save');
const {
  attemptVincularLink,
  userMessageForOutcome,
  MSG_VINCULO_NEUTRAL,
  maskWaId,
} = require('./_lib/vincular');
const { dayBoundsLima, currentYearMonthLima, resolveExpenseCategory } = require('../lib/expense-domain');
const {
  getQueryParam,
  extractFirstIncomingMessage,
  describeWebhookEventKind,
  parseVincularCode,
  detectCategoryInfo,
  detectNonExpenseIntent,
  detectRelativeDayMarker,
  isFinanceRelated,
  messageAppearsToBeExpenseRegistration,
  parseMultipleExpensesFromText,
  parseTodayExpenseQuery,
  parseMonthExpenseQuery,
  formatPen,
} = require('./_lib/whatsapp-parsers');

/**
 * Log estructurado sin PII ni payload completo.
 * @param {unknown} body
 * @param {ReturnType<typeof extractFirstIncomingMessage>} msg
 */
function safeLogWebhookEvent(body, msg) {
  const kind = describeWebhookEventKind(body);
  const payload = {
    object: body?.object,
    entryLen: Array.isArray(body?.entry) ? body.entry.length : 0,
    eventKind: kind.eventKind,
    field: kind.field,
    hasMessages: kind.hasMessages,
    hasStatuses: kind.hasStatuses,
    statusCount: kind.statusCount,
    messageId: typeof msg?.id === 'string' ? msg.id : null,
    waId: msg?.from ? maskWaId(String(msg.from)) : null,
    type: msg?.type ?? null,
    textLen:
      msg?.type === 'text' && msg?.text && typeof msg.text.body === 'string'
        ? msg.text.body.length
        : 0,
  };
  if (!msg && kind.hasStatuses && Array.isArray(body?.entry?.[0]?.changes?.[0]?.value?.statuses)) {
    const st = body.entry[0].changes[0].value.statuses[0];
    payload.statusType = typeof st?.status === 'string' ? st.status : null;
  }
  console.log('[whatsapp] webhook event', JSON.stringify(payload));
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

const MSG_REQUIERE_VINCULO = 'Para usar este asistente, primero vincula tu cuenta desde la app.';
const MSG_NO_ENTENDI_LINEAS = "No entendí 😅 prueba algo como: 'almuerzo 15'";
const MSG_RATE_LIMIT = 'Recibimos muchos mensajes. Esperá unos minutos e intentá de nuevo.';

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

function toMessagePreview(textBody) {
  if (typeof textBody !== 'string' || textBody.trim() === '') return null;
  let normalized = textBody.replace(/\s+/g, ' ').trim();
  // Evita persistir códigos potencialmente sensibles en previews.
  normalized = normalized.replace(/\b(vincular)\s+([a-z0-9_-]{4,})\b/gi, '$1 ******');
  return normalized.slice(0, 120);
}

async function trackWhatsappMessageUsage({ userId, waId, messageType, textBody }) {
  try {
    const supabase = getServiceSupabase();
    if (!supabase) return;
    const payload = {
      user_id: userId ?? null,
      wa_id: waId ?? null,
      channel: 'whatsapp',
      message_type: messageType || 'otro',
      message_preview: toMessagePreview(textBody),
    };
    const { error } = await supabase.from('message_usage').insert(payload);
    if (error) {
      console.error('[whatsapp] message_usage insert error', error);
    }
  } catch (e) {
    console.error('[whatsapp] message_usage track error', e);
  }
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
      await sendWhatsappTextMessage(from, MSG_VINCULO_NEUTRAL);
    } catch (e) {
      console.error('[whatsapp] VINCULAR env error', e);
    }
    return true;
  }

  const result = await attemptVincularLink(supabase, from, code);
  try {
    await sendWhatsappTextMessage(from, userMessageForOutcome(result.outcome));
  } catch (e) {
    console.error('[whatsapp] VINCULAR send', e);
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

function categoryEmojiForName(categoryName) {
  const n = String(categoryName || '').toLowerCase();
  if (/comida|aliment|restaurant|pollo|almuerzo/.test(n)) return '🍔';
  if (/transport|taxi|uber|movilidad/.test(n)) return '🚌';
  if (/yape|plin|transfer/.test(n)) return '💸';
  if (/compra|mercado|bodega|tienda/.test(n)) return '🛒';
  if (/vivienda|alquiler|renta|hogar/.test(n)) return '🏠';
  if (/salud|farmacia|medicina|doctor/.test(n)) return '💊';
  if (/servicio|luz|agua|internet/.test(n)) return '💡';
  if (/suscrip|netflix|spotify/.test(n)) return '📱';
  if (/educa|curso|colegio|universidad/.test(n)) return '📚';
  if (/ocio|cine|fiesta/.test(n)) return '🎬';
  if (/gym|gimnasio|fitness/.test(n)) return '💪';
  return '💸';
}

async function getUserGastoCategories(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_categories')
    .select('nombre, tipo')
    .eq('user_id', userId)
    .eq('tipo', 'gasto');
  if (error) {
    console.error('[whatsapp] user categories load', error);
    return [];
  }
  return data || [];
}

async function resolveCategoryNameForQuery(userId, tailText) {
  const categories = await getUserGastoCategories(userId);
  const { categoryId, categoryLabel } = detectCategoryInfo(String(tailText || '').toLowerCase());
  return resolveExpenseCategory(
    categories,
    { categoryId, categoryLabel, description: tailText },
    tailText,
  ).categoria;
}

/**
 * Calcula cuánto va gastado HOY en la categoría, para el usuario.
 * @param {string} userId
 * @param {string} categoryName
 * @returns {Promise<number>}
 */
async function getTodaySpentByCategory(userId, categoryName) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { startIso, endIso } = dayBoundsLima(new Date());
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .eq('categoria', categoryName)
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
  const { startIso, endIso } = dayBoundsLima(new Date());
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

const CATEGORY_ORDER_RESUMEN = [];

function labelForCategoryName(name) {
  return String(name || 'Otros');
}

/** Líneas "emoji categoría: S/X" solo para montos > 0. */
function categoryLinesFromByCat(byCat) {
  const entries = Object.entries(byCat)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries.map(([name, v]) => `${categoryEmojiForName(name)} ${labelForCategoryName(name)}: S/${formatPen(v)}`);
}

/**
 * Suma de importes de hoy por categoria (clave = valor en columna categoria).
 */
async function getTodayTotalsByCategory(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return {};
  const { startIso, endIso } = dayBoundsLima(new Date());
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
 * Si el mensaje es una consulta de hoy soportada, responde por WhatsApp y devuelve true.
 */
async function tryHandleTodayExpenseQuery(waFrom, textBody, userId) {
  const q = parseTodayExpenseQuery(textBody);
  if (!q) return false;

  let reply;
  if (q.kind === 'total_hoy') {
    reply = await buildCuantoHoyMessage(userId);
  } else if (q.kind === 'voy_en_categoria') {
    const categoryName = await resolveCategoryNameForQuery(userId, q.tail);
    const t = await getTodaySpentByCategory(userId, categoryName);
    const em = categoryEmojiForName(categoryName);
    reply = t <= 0 ? MSG_SIN_GASTOS_HOY : `Hoy llevas S/${formatPen(t)} en ${categoryName} ${em}`;
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
  return currentYearMonthLima(new Date());
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

async function getMonthSpentByCategory(userId, categoryName, mesKey) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .eq('categoria', categoryName)
    .eq('mes', mesKey);
  if (error) {
    console.error('[whatsapp] month category sum error', error);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.importe || 0), 0);
}

/**
 * Insights breves solo para resumen mensual (sin IA).
 * @param {Record<string, number>} byCat
 * @param {number} total
 * @returns {string[]}
 */
function buildMonthResumenInsightLines(byCat, total) {
  const out = [];
  if (total <= 0) return out;

  let maxShare = 0;
  let maxCatId = null;
  for (const id of Object.keys(byCat)) {
    const v = Number(byCat[id] || 0);
    if (v <= 0) continue;
    const share = v / total;
    if (share > maxShare) {
      maxShare = share;
      maxCatId = id;
    }
  }
  if (maxCatId != null && maxShare > 0.5) {
    out.push(`👀 Estás gastando bastante en ${labelForCategoryName(maxCatId)}`);
  }

  if (total > 500) {
    out.push('💡 Este mes ya llevas un gasto considerable');
  }

  const entries = Object.entries(byCat).filter(([, v]) => Number(v) > 0);
  if (entries.length >= 2) {
    const sorted = entries.sort((a, b) => Number(b[1]) - Number(a[1]));
    const [topName, topVal] = sorted[0];
    const [secondName, secondVal] = sorted[1];
    if (topVal > secondVal) {
      out.push(`📊 Gastas más en ${labelForCategoryName(topName)} que en ${labelForCategoryName(secondName)}`);
    }
  }

  return out;
}

async function buildResumenMesMessage(userId, mesKey) {
  const byCat = await getMonthTotalsByCategory(userId, mesKey);
  const total = Object.values(byCat).reduce((s, v) => s + v, 0);
  if (total <= 0) return MSG_SIN_GASTOS_MES;
  const lines = categoryLinesFromByCat(byCat);
  const body = `Resumen del mes 👇\n\n${lines.join('\n')}\n\nTotal: S/${formatPen(total)} 💸`;
  const insights = buildMonthResumenInsightLines(byCat, total);
  if (insights.length === 0) return body;
  return `${body}\n\n${insights.join('\n')}`;
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
    const categoryName = await resolveCategoryNameForQuery(userId, q.tail);
    const t = await getMonthSpentByCategory(userId, categoryName, mesKey);
    const em = categoryEmojiForName(categoryName);
    reply = t <= 0 ? MSG_SIN_GASTOS_MES : `Este mes llevas S/${formatPen(t)} en ${categoryName} ${em}`;
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

/**
 * Procesa un mensaje de texto ya validado (firma + idempotencia + rate limit).
 * @returns {Promise<{ financialCommitted: boolean }>}
 */
async function processIncomingTextMessage(waFrom, textBody, messageId) {
  const vincularHandled = await tryVinculacionIfApplicable(waFrom, textBody);
  if (vincularHandled) {
    const linkedAfterVincular = await getLinkedUserIdByWaId(waFrom);
    await trackWhatsappMessageUsage({
      userId: linkedAfterVincular,
      waId: waFrom,
      messageType: 'vincular',
      textBody,
    });
    return { financialCommitted: false };
  }

  const linkedUserId = await getLinkedUserIdByWaId(waFrom);
  if (!linkedUserId) {
    await sendWhatsappTextMessage(waFrom, MSG_REQUIERE_VINCULO);
    return { financialCommitted: false };
  }

  const intent = detectNonExpenseIntent(textBody);
  if (intent === 'command') {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'comando',
      textBody,
    });
    await sendWhatsappTextMessage(waFrom, MSG_INTENT_EDIT);
    return { financialCommitted: false };
  }

  const handledTodayQuery = await tryHandleTodayExpenseQuery(waFrom, textBody, linkedUserId);
  if (handledTodayQuery) {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'consulta',
      textBody,
    });
    return { financialCommitted: false };
  }

  const handledMonthQuery = await tryHandleMonthExpenseQuery(waFrom, textBody, linkedUserId);
  if (handledMonthQuery) {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'consulta',
      textBody,
    });
    return { financialCommitted: false };
  }

  if (intent === 'query') {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'consulta',
      textBody,
    });
    await sendWhatsappTextMessage(waFrom, MSG_INTENT_QUERY);
    return { financialCommitted: false };
  }

  if (!messageAppearsToBeExpenseRegistration(textBody)) {
    if (!isFinanceRelated(textBody)) {
      await trackWhatsappMessageUsage({
        userId: linkedUserId,
        waId: waFrom,
        messageType: 'fuera_dominio',
        textBody,
      });
      await sendWhatsappTextMessage(waFrom, MSG_DOMINIO_FINANZAS);
      return { financialCommitted: false };
    }
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'fallback',
      textBody,
    });
    await sendWhatsappTextMessage(waFrom, MSG_FALLBACK_GASTO);
    return { financialCommitted: false };
  }

  const dayMarker = detectRelativeDayMarker(textBody);
  if (dayMarker === 'future') {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'comando',
      textBody,
    });
    await sendWhatsappTextMessage(waFrom, MSG_TIME_FUTURE);
    return { financialCommitted: false };
  }
  if (dayMarker === 'past') {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'comando',
      textBody,
    });
    await sendWhatsappTextMessage(waFrom, MSG_TIME_PAST);
    return { financialCommitted: false };
  }

  const batch = parseMultipleExpensesFromText(textBody);
  if (batch.valid.length === 0) {
    await trackWhatsappMessageUsage({
      userId: linkedUserId,
      waId: waFrom,
      messageType: 'fallback',
      textBody,
    });
    await sendWhatsappTextMessage(waFrom, MSG_NO_ENTENDI_LINEAS);
    return { financialCommitted: false };
  }

  await trackWhatsappMessageUsage({
    userId: linkedUserId,
    waId: waFrom,
    messageType: 'gasto',
    textBody,
  });

  const supabase = getServiceSupabase();
  if (!supabase) throw new Error('Falta configuración de Supabase');

  let saveBatch;
  try {
    const context = await loadUserExpenseContext(supabase, linkedUserId);
    saveBatch = await saveWhatsappExpenseBatch(
      supabase,
      linkedUserId,
      batch.valid,
      context,
      messageId,
      textBody,
    );
  } catch (saveErr) {
    console.error('[whatsapp] save expense error', saveErr);
    try {
      await sendWhatsappTextMessage(
        waFrom,
        'No pude registrar ese gasto ahora. Inténtalo de nuevo en un momento.',
      );
    } catch (notifyErr) {
      console.error('[whatsapp] save expense notify error', notifyErr);
    }
    throw saveErr;
  }

  const summaryLines = batch.valid.map((e, i) => {
    const cat = saveBatch.results[i]?.categoria || e.categoryLabel;
    return `• S/${formatPen(e.amount)} en ${cat}`;
  });
  const todayTotal = await getTodayTotalSpent(linkedUserId);

  try {
    await sendWhatsappTextMessage(
      waFrom,
      `Listo 👍 guardé:\n${summaryLines.join('\n')}\n\nHoy ya vas S/${formatPen(todayTotal)} 💸`,
    );
  } catch (outboundErr) {
    console.error('[whatsapp] outbound after save', outboundErr);
  }

  return { financialCommitted: saveBatch.anyFinancialCommit };
}

async function whatsappWebhookHandler(req, res) {
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
    let rawBody;
    let bodyMeta = {
      source: 'unknown',
      preParsedObject: false,
      reqBodyType: 'unknown',
      representations: [],
      sameStreamAndSerialized: null,
    };
    try {
      const read = await readRawBodyWithMeta(req);
      rawBody = read.raw;
      bodyMeta = {
        source: read.source,
        preParsedObject: read.preParsedObject,
        reqBodyType: read.reqBodyType,
        representations: read.representations,
        sameStreamAndSerialized: read.sameStreamAndSerialized,
      };
    } catch (readErr) {
      console.error('[whatsapp] raw body read error', readErr);
      return res.status(400).json({ error: 'Invalid body' });
    }

    const signatureHeader = req.headers['x-hub-signature-256'];
    const sig = verifyMetaSignature(rawBody, signatureHeader);
    if (!sig.ok) {
      console.warn(
        '[whatsapp] signature reject',
        JSON.stringify(diagnoseMetaSignature(rawBody, signatureHeader, bodyMeta)),
      );
      return res.status(sig.statusCode).json({ error: sig.error });
    }

    let body;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const msg = extractFirstIncomingMessage(body);
    safeLogWebhookEvent(body, msg);

    if (!msg) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (msg.type !== 'text' || msg.from == null || msg.from === '') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const messageId = typeof msg.id === 'string' ? msg.id : null;
    if (!messageId) {
      console.warn('[whatsapp] text message without message.id — ignored');
      return res.status(200).json({ ok: true, ignored: true });
    }

    const waFrom = String(msg.from);
    const textBody =
      msg.text && typeof msg.text.body === 'string' ? msg.text.body : undefined;
    if (!textBody) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    console.log(
      '[whatsapp] incoming',
      JSON.stringify({
        waId: maskWaId(waFrom),
        type: msg.type,
        messageId,
        textLen: textBody.length,
      }),
    );

    const supabase = getServiceSupabase();
    if (!supabase) {
      return res.status(503).json({ error: 'Server configuration error' });
    }

    const claim = await claimWebhookEvent(supabase, { messageId, waId: waFrom });
    if (claim.action === 'deduplicated' && claim.status === 'processed') {
      return res.status(200).json({ ok: true, deduplicated: true });
    }
    if (claim.action === 'error') {
      console.error('[whatsapp] idempotency claim error', claim.error);
      return res.status(500).json({ error: 'Idempotency unavailable' });
    }

    const msgRate = await checkRateLimit(supabase, waFrom, 'message');
    if (msgRate.limited) {
      try {
        await sendWhatsappTextMessage(waFrom, MSG_RATE_LIMIT);
      } catch (rateNotifyErr) {
        console.error('[whatsapp] rate limit notify', rateNotifyErr);
      }
      await markWebhookProcessed(supabase, messageId);
      return res.status(200).json({ ok: true, rateLimited: true, failClosed: !!msgRate.failClosed });
    }

    let financialCommitted = false;
    try {
      const result = await processIncomingTextMessage(waFrom, textBody, messageId);
      financialCommitted = result.financialCommitted;
      await markWebhookProcessed(supabase, messageId);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[whatsapp] error al procesar / responder', e);
      if (!financialCommitted) {
        await markWebhookFailed(supabase, messageId);
        return res.status(500).json({ error: 'Processing failed' });
      }
      await markWebhookProcessed(supabase, messageId);
      return res.status(200).json({ ok: true, partial: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/** Vercel Node serverless: desactiva bodyParser para conservar raw body (firma Meta). */
whatsappWebhookHandler.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = whatsappWebhookHandler;
module.exports.config = whatsappWebhookHandler.config;
