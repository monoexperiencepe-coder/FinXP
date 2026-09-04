/**
 * Rate limiting simple por wa_id + ventana fija (compatible serverless / Supabase).
 *
 * Límites por defecto:
 * - vincular: 5 intentos / 10 min
 * - message: 40 mensajes / 10 min
 */

const WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_LIMITS = {
  vincular: 5,
  message: 40,
};

function windowKey(nowMs = Date.now()) {
  return String(Math.floor(nowMs / WINDOW_MS));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} waId
 * @param {'vincular'|'message'} action
 * @param {number} [maxAttempts]
 * @returns {Promise<{ limited: boolean, count: number, max: number }>}
 */
async function checkRateLimit(supabase, waId, action, maxAttempts) {
  const max = maxAttempts ?? DEFAULT_LIMITS[action] ?? 40;
  const key = windowKey();
  const trimmedWa = String(waId || '').trim();
  if (!trimmedWa) {
    return { limited: false, count: 0, max };
  }

  const { data: row, error: selErr } = await supabase
    .from('whatsapp_rate_limits')
    .select('attempt_count')
    .eq('wa_id', trimmedWa)
    .eq('action', action)
    .eq('window_key', key)
    .maybeSingle();

  if (selErr) {
    console.error('[whatsapp] rate limit select', selErr);
    return { limited: true, count: 0, max, failClosed: true };
  }

  const current = Number(row?.attempt_count ?? 0);
  if (current >= max) {
    return { limited: true, count: current, max };
  }

  const next = current + 1;
  const { error: upsertErr } = await supabase.from('whatsapp_rate_limits').upsert(
    {
      wa_id: trimmedWa,
      action,
      window_key: key,
      attempt_count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wa_id,action,window_key' },
  );

  if (upsertErr) {
    console.error('[whatsapp] rate limit upsert', upsertErr);
    return { limited: true, count: current, max, failClosed: true };
  }

  return { limited: next > max, count: next, max };
}

module.exports = {
  WINDOW_MS,
  DEFAULT_LIMITS,
  windowKey,
  checkRateLimit,
};
