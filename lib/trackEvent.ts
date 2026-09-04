import { supabase } from '@/lib/supabase';

/**
 * Tracking mínimo de eventos (tabla `app_events`).
 * No lanza: errores solo en consola.
 */
export async function trackEvent(
  eventName: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    const { error } = await supabase.from('app_events').insert({
      user_id: userId,
      event_name: eventName,
      metadata: metadata ?? null,
    });
    if (error) {
      console.error('[trackEvent]', eventName, error);
    }
  } catch (e) {
    console.error('[trackEvent]', eventName, e);
  }
}
