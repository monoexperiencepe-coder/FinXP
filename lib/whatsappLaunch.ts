import { Linking, Platform } from 'react-native';

/** Producción Vercel (fin-xp). Fallback si el bundle native no incluye EXPO_PUBLIC_SITE_URL. */
export const WHATSAPP_API_SITE_FALLBACK = 'https://fin-xp-sigma.vercel.app';

export function whatsappLinkCodeApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/whatsapp-link-code`;
  }
  const base =
    process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '') || WHATSAPP_API_SITE_FALLBACK;
  return `${base}/api/whatsapp-link-code`;
}

/** Logs solo en development — distinguir A–F del flujo de launch. */
export function waLaunchDebug(
  step: string,
  meta?: Record<string, string | number | boolean | null | undefined>,
) {
  if (__DEV__) {
    console.log('[WA Launch]', step, meta ?? {});
  }
}

/**
 * Normaliza api.whatsapp.com/send → wa.me (más fiable en web/mobile).
 * Valida que haya teléfono solo-dígitos (WHATSAPP_BOT_NUMBER del server, no PHONE_NUMBER_ID).
 */
export function normalizeWhatsappLaunchUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('URL de WhatsApp inválida en la respuesta del servidor.');
  }

  const phone = (u.searchParams.get('phone') || '').replace(/\D/g, '');
  const text = u.searchParams.get('text') || '';

  if (!phone || phone.length < 8) {
    throw new Error('El servidor no devolvió un número de WhatsApp válido.');
  }

  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function whatsappLaunchMeta(rawUrl: string): {
  phoneDigits: number;
  hasVincularText: boolean;
} {
  const normalized = normalizeWhatsappLaunchUrl(rawUrl);
  const u = new URL(normalized);
  const phone = u.pathname.replace(/^\//, '').replace(/\D/g, '');
  const text = u.searchParams.get('text') || '';
  return {
    phoneDigits: phone.length,
    hasVincularText: /vincular/i.test(text),
  };
}

/** Web: click programático en anchor real (evita SPA/router que ignora location.assign). */
export function tryOpenWhatsappWeb(url: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_self';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/** Native: whatsapp:// si está instalado, luego wa.me. */
export async function openWhatsappNative(normalizedWaMeUrl: string): Promise<void> {
  const u = new URL(normalizedWaMeUrl);
  const phone = u.pathname.replace(/^\//, '').replace(/\D/g, '');
  const text = u.searchParams.get('text') || '';
  const waScheme = `whatsapp://send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ''}`;

  const candidates = [waScheme, normalizedWaMeUrl];
  let lastErr: unknown = null;
  for (const target of candidates) {
    try {
      if (target.startsWith('whatsapp://')) {
        const canOpen = await Linking.canOpenURL(target);
        if (!canOpen) continue;
      }
      await Linking.openURL(target);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw (
    lastErr instanceof Error
      ? lastErr
      : new Error('No se pudo abrir WhatsApp. Verificá que esté instalado e intentá de nuevo.')
  );
}

/**
 * Web: intento automático + siempre devuelve true para mostrar fallback UI.
 * Native: abre directo; lanza si falla (caller muestra fallback).
 */
export async function launchWhatsappFromServerUrl(rawUrl: string): Promise<{
  normalizedUrl: string;
  showWebFallback: boolean;
}> {
  const normalizedUrl = normalizeWhatsappLaunchUrl(rawUrl);
  const meta = whatsappLaunchMeta(rawUrl);
  waLaunchDebug('D-url-normalized', {
    platform: Platform.OS,
    phoneDigits: meta.phoneDigits,
    hasVincularText: meta.hasVincularText,
  });

  if (Platform.OS === 'web') {
    waLaunchDebug('E-web-nav-attempt', { method: 'anchor-click' });
    const clicked = tryOpenWhatsappWeb(normalizedUrl);
    waLaunchDebug('F-auto-nav-result', { clicked, fallbackRequired: true });
    return { normalizedUrl, showWebFallback: true };
  }

  waLaunchDebug('E-native-nav-attempt', { method: 'linking' });
  await openWhatsappNative(normalizedUrl);
  waLaunchDebug('F-native-nav-result', { ok: true });
  return { normalizedUrl, showWebFallback: false };
}

export function openWhatsappFromPrompt(url: string): void {
  if (Platform.OS === 'web') {
    waLaunchDebug('F-manual-tap', { method: 'anchor-click-user-gesture' });
    tryOpenWhatsappWeb(url);
    return;
  }
  void Linking.openURL(url);
}
