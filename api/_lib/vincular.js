/**
 * Lógica de vinculación WhatsApp (testeable, respuestas neutras al usuario).
 */

const { checkRateLimit } = require('./rate-limit');

const MSG_VINCULO_OK = 'Listo ✅ Tu WhatsApp ya está vinculado a tu cuenta.';
const MSG_VINCULO_NEUTRAL =
  'No pude completar la vinculación. Genera un nuevo código desde Ahorra Ya e inténtalo nuevamente.';

/**
 * @typedef {'success'|'neutral'|'rate_limited'|'not_vincular'} VincularOutcome
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} from
 * @param {string} code
 * @returns {Promise<{ outcome: VincularOutcome, reason?: string }>}
 */
async function attemptVincularLink(supabase, from, code) {
  const vincularRate = await checkRateLimit(supabase, from, 'vincular');
  if (vincularRate.limited) {
    return { outcome: 'rate_limited', reason: 'rate_limit' };
  }

  const { data: row, error: selErr } = await supabase
    .from('whatsapp_link_codes')
    .select('id, user_id, used_at, expires_at, code')
    .eq('code', code)
    .maybeSingle();

  if (selErr) {
    console.error('[whatsapp] VINCULAR select error', { codeLen: code?.length, err: selErr.message });
    return { outcome: 'neutral', reason: 'db_select_error' };
  }

  if (!row) {
    console.info('[whatsapp] VINCULAR reject', { reason: 'code_not_found', waId: maskWaId(from) });
    return { outcome: 'neutral', reason: 'code_not_found' };
  }

  if (row.used_at != null) {
    console.info('[whatsapp] VINCULAR reject', { reason: 'code_used', waId: maskWaId(from) });
    return { outcome: 'neutral', reason: 'code_used' };
  }

  if (new Date(row.expires_at) <= new Date()) {
    console.info('[whatsapp] VINCULAR reject', { reason: 'code_expired', waId: maskWaId(from) });
    return { outcome: 'neutral', reason: 'code_expired' };
  }

  const nowIso = new Date().toISOString();

  const { error: upsertErr } = await supabase
    .from('whatsapp_links')
    .upsert({ user_id: row.user_id, wa_id: from, verified_at: nowIso }, { onConflict: 'user_id' });

  if (upsertErr) {
    console.error('[whatsapp] VINCULAR upsert error', upsertErr.message);
    return { outcome: 'neutral', reason: 'link_upsert_error' };
  }

  const { data: marked, error: useErr } = await supabase
    .from('whatsapp_link_codes')
    .update({ used_at: nowIso })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  if (useErr) {
    console.error('[whatsapp] VINCULAR used_at error', useErr.message);
    return { outcome: 'neutral', reason: 'mark_used_error' };
  }

  if (!marked?.id) {
    console.info('[whatsapp] VINCULAR reject', { reason: 'code_replay', waId: maskWaId(from) });
    return { outcome: 'neutral', reason: 'code_replay' };
  }

  return { outcome: 'success', reason: 'linked' };
}

function maskWaId(waId) {
  const s = String(waId || '');
  if (s.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

function userMessageForOutcome(outcome) {
  if (outcome === 'success') return MSG_VINCULO_OK;
  return MSG_VINCULO_NEUTRAL;
}

module.exports = {
  MSG_VINCULO_OK,
  MSG_VINCULO_NEUTRAL,
  attemptVincularLink,
  userMessageForOutcome,
  maskWaId,
};
