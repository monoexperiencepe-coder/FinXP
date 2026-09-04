/**
 * Idempotencia de webhooks WhatsApp por message.id (wamid).
 * Requiere tabla whatsapp_webhook_events (migración en repo, no aplicada automáticamente).
 *
 * Máquina de estados:
 *   (nuevo) --INSERT--> processing
 *   processing --mark processed--> processed (dedupe forever)
 *   processing --mark failed--> failed
 *   failed --atomic reclaim--> processing (permite retry Meta sin duplicar gasto si expenses tienen source_message_id)
 *   processing stale (> STALE_PROCESSING_MS) --reclaim--> processing (recupera multi-gasto parcial)
 */

const STALE_PROCESSING_MS = 2 * 60 * 1000;

/**
 * @typedef {'processing'|'processed'|'failed'} WebhookEventStatus
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ messageId: string, waId?: string|null, eventType?: string }} params
 * @returns {Promise<
 *   | { action: 'claim', eventId: string, retry?: boolean }
 *   | { action: 'deduplicated', status: WebhookEventStatus }
 *   | { action: 'error', retryable: boolean, error?: unknown }
 * >}
 */
async function claimWebhookEvent(supabase, { messageId, waId = null, eventType = 'message' }) {
  const { data: inserted, error: insertErr } = await supabase
    .from('whatsapp_webhook_events')
    .insert({
      message_id: messageId,
      wa_id: waId,
      event_type: eventType,
      status: 'processing',
    })
    .select('id')
    .maybeSingle();

  if (!insertErr && inserted?.id) {
    return { action: 'claim', eventId: inserted.id };
  }

  if (insertErr?.code !== '23505') {
    return { action: 'error', retryable: true, error: insertErr };
  }

  const { data: existing, error: selErr } = await supabase
    .from('whatsapp_webhook_events')
    .select('id, status')
    .eq('message_id', messageId)
    .maybeSingle();

  if (selErr || !existing) {
    return { action: 'error', retryable: true, error: selErr ?? new Error('missing row after conflict') };
  }

  if (existing.status === 'processed' || existing.status === 'processing') {
    if (existing.status === 'processing') {
      const reclaimed = await tryReclaimStaleProcessing(supabase, messageId);
      if (reclaimed) {
        return { action: 'claim', eventId: existing.id, retry: true, stale: true };
      }
    }
    return { action: 'deduplicated', status: existing.status };
  }

  if (existing.status === 'failed') {
    const { data: reclaimed, error: updErr } = await supabase
      .from('whatsapp_webhook_events')
      .update({
        status: 'processing',
        received_at: new Date().toISOString(),
        processed_at: null,
      })
      .eq('message_id', messageId)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle();

    if (updErr) {
      return { action: 'error', retryable: true, error: updErr };
    }
    if (reclaimed?.id) {
      return { action: 'claim', eventId: reclaimed.id, retry: true };
    }
    return { action: 'deduplicated', status: 'processing' };
  }

  return { action: 'deduplicated', status: existing.status };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} messageId
 */
async function markWebhookProcessed(supabase, messageId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('whatsapp_webhook_events')
    .update({ status: 'processed', processed_at: now })
    .eq('message_id', messageId);
  if (error) {
    console.error('[whatsapp] idempotency mark processed', error);
  }
}

/**
 * Permite retry de Meta si falló antes de commits financieros.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} messageId
 */
async function markWebhookFailed(supabase, messageId) {
  const { error } = await supabase
    .from('whatsapp_webhook_events')
    .update({ status: 'failed', processed_at: null })
    .eq('message_id', messageId)
    .eq('status', 'processing');
  if (error) {
    console.error('[whatsapp] idempotency mark failed', error);
  }
}

/**
 * Reclama eventos processing antiguos (crash mid-batch / outbound fail).
 */
async function tryReclaimStaleProcessing(supabase, messageId) {
  const { data: row, error } = await supabase
    .from('whatsapp_webhook_events')
    .select('id, received_at')
    .eq('message_id', messageId)
    .eq('status', 'processing')
    .maybeSingle();

  if (error || !row?.received_at) return false;

  const ageMs = Date.now() - new Date(row.received_at).getTime();
  if (ageMs < STALE_PROCESSING_MS) return false;

  const { data: updated, error: updErr } = await supabase
    .from('whatsapp_webhook_events')
    .update({ received_at: new Date().toISOString() })
    .eq('message_id', messageId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();

  if (updErr || !updated?.id) return false;
  return true;
}

module.exports = {
  STALE_PROCESSING_MS,
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
};
