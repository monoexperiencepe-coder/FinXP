/**
 * Guardado de gastos WhatsApp con paridad App (categoría, moneda, XP, idempotencia financiera).
 */

const {
  XP_REGISTRAR_GASTO,
  toDateKeyLima,
  resolveExpenseCategory,
  buildWhatsappExpensePayload,
  applyXpToProfile,
  bumpRacha,
  mapMoneda,
} = require('../../lib/expense-domain');

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
async function loadUserExpenseContext(supabase, userId) {
  const [profileRes, categoriesRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('moneda_principal, nivel, xp_actual, xp_para_siguiente_nivel, racha_actual, racha_maxima, ultimo_registro')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_categories')
      .select('nombre, tipo, emoji, orden')
      .eq('user_id', userId)
      .eq('tipo', 'gasto')
      .order('orden', { ascending: true }),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (categoriesRes.error) throw categoriesRes.error;

  return {
    profile: profileRes.data,
    categories: categoriesRes.data || [],
  };
}

/**
 * Aplica gamificación vía RPC atómica si existe; fallback JS con read-modify-write.
 */
async function applyExpenseGamification(supabase, userId, xpGain, expenseDateKey) {
  const { error: rpcErr } = await supabase.rpc('apply_expense_gamification', {
    p_user_id: userId,
    p_xp_gain: xpGain,
    p_expense_date_key: expenseDateKey,
  });

  if (!rpcErr) return;

  if (rpcErr.code !== 'PGRST202' && !String(rpcErr.message || '').includes('apply_expense_gamification')) {
    console.warn('[whatsapp] gamification RPC unavailable, using JS fallback', rpcErr.code || rpcErr.message);
  }

  const { data: profile, error: selErr } = await supabase
    .from('user_profiles')
    .select('nivel, xp_actual, xp_para_siguiente_nivel, racha_actual, racha_maxima, ultimo_registro')
    .eq('id', userId)
    .maybeSingle();

  if (selErr || !profile) throw selErr || new Error('Profile not found');

  const ultimoKey = profile.ultimo_registro ? String(profile.ultimo_registro).slice(0, 10) : undefined;
  const streak = bumpRacha(ultimoKey, profile.racha_actual, expenseDateKey);
  const xp = applyXpToProfile({
    nivel: profile.nivel,
    xpActual: profile.xp_actual,
    xpParaSiguienteNivel: profile.xp_para_siguiente_nivel,
    gain: xpGain,
  });

  const { error: updErr } = await supabase
    .from('user_profiles')
    .update({
      xp_actual: xp.xpActual,
      xp_para_siguiente_nivel: xp.xpParaSiguienteNivel,
      nivel: xp.nivel,
      racha_actual: streak.rachaActual,
      racha_maxima: Math.max(Number(profile.racha_maxima) || 0, streak.rachaActual),
      ultimo_registro: `${streak.ultimoRegistro}T12:00:00.000-05:00`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updErr) throw updErr;
}

/**
 * Inserta un gasto con clave idempotente (message_id + index).
 * @returns {Promise<{ inserted: boolean, duplicate: boolean, categoria: string }>}
 */
async function saveWhatsappExpense(supabase, userId, parsed, options) {
  const { messageId, expenseIndex, rawText, profile, categories } = options;
  const resolved = resolveExpenseCategory(categories, parsed, rawText);
  const moneda = mapMoneda(profile?.moneda_principal);
  const payload = buildWhatsappExpensePayload({
    userId,
    parsed,
    categoria: resolved.categoria,
    moneda,
    messageId,
    expenseIndex,
  });

  const { data, error } = await supabase.from('expenses').insert(payload).select('id').maybeSingle();

  if (error?.code === '23505') {
    return { inserted: false, duplicate: true, categoria: resolved.categoria };
  }
  if (error) throw error;

  if (data?.id) {
    await applyExpenseGamification(supabase, userId, XP_REGISTRAR_GASTO, toDateKeyLima());
  }

  return { inserted: true, duplicate: false, categoria: resolved.categoria };
}

/**
 * Guarda batch multi-gasto con idempotencia por índice.
 */
async function saveWhatsappExpenseBatch(supabase, userId, expenses, context, messageId, rawText) {
  const results = [];
  for (let i = 0; i < expenses.length; i += 1) {
    const result = await saveWhatsappExpense(supabase, userId, expenses[i], {
      messageId,
      expenseIndex: i,
      rawText,
      profile: context.profile,
      categories: context.categories,
    });
    results.push(result);
  }
  const insertedCount = results.filter((r) => r.inserted).length;
  return { results, insertedCount, anyFinancialCommit: insertedCount > 0 || results.some((r) => r.duplicate) };
}

module.exports = {
  loadUserExpenseContext,
  saveWhatsappExpense,
  saveWhatsappExpenseBatch,
  applyExpenseGamification,
};
