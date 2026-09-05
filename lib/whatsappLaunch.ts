import { Linking, Platform } from 'react-native';

import {
  detectMobileWebFromUserAgent,
  extractVincularCodeFromLaunchUrl as extractVincularCodeFromLaunchUrlPure,
  normalizeWhatsappLaunchUrl as normalizeWhatsappLaunchUrlPure,
  whatsappLaunchMeta as whatsappLaunchMetaPure,
  whatsappWebLinkTargetFromContext,
} from './whatsappLaunchUrl';

/** Producción Vercel (fin-xp). Fallback si el bundle native no incluye EXPO_PUBLIC_SITE_URL. */
export const WHATSAPP_API_SITE_FALLBACK = 'https://fin-xp-sigma.vercel.app';

export type WhatsappLaunchContext = {
  platformOs: string;
  isWeb: boolean;
  isMobileWeb: boolean;
  isDesktopWeb: boolean;
  isNative: boolean;
  userAgent: string | null;
};

export function getWhatsappLaunchContext(): WhatsappLaunchContext {
  const isWeb = Platform.OS === 'web';
  const ua =
    isWeb && typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : null;
  const isMobileWeb = isWeb && detectMobileWebFromUserAgent(ua || '');
  return {
    platformOs: Platform.OS,
    isWeb,
    isMobileWeb,
    isDesktopWeb: isWeb && !isMobileWeb,
    isNative: !isWeb,
    userAgent: ua,
  };
}

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
 * Valida dígitos (WHATSAPP_BOT_NUMBER del server, no PHONE_NUMBER_ID).
 */
export function normalizeWhatsappLaunchUrl(rawUrl: string): string {
  return normalizeWhatsappLaunchUrlPure(rawUrl);
}

export function extractVincularCodeFromLaunchUrl(url: string): string | null {
  return extractVincularCodeFromLaunchUrlPure(url);
}

export function whatsappLaunchMeta(rawUrl: string): {
  phoneDigits: number;
  hasVincularText: boolean;
} {
  return whatsappLaunchMetaPure(rawUrl);
}

/** Target recomendado para anchor web según dispositivo. */
export function whatsappWebLinkTarget(ctx: WhatsappLaunchContext = getWhatsappLaunchContext()): '_self' | '_blank' {
  return whatsappWebLinkTargetFromContext(ctx);
}

/** Web desktop: anchor programático. Mobile web: NO auto-navegar (requiere tap en <a> real). */
export function tryOpenWhatsappWebAuto(url: string): boolean {
  const ctx = getWhatsappLaunchContext();
  if (!ctx.isWeb || ctx.isMobileWeb || typeof document === 'undefined') return false;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = whatsappWebLinkTarget(ctx);
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

/** Native: whatsapp:// solo en app nativa, nunca en web. */
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

export async function launchWhatsappFromServerUrl(rawUrl: string): Promise<{
  normalizedUrl: string;
  showWebFallback: boolean;
  launchContext: WhatsappLaunchContext;
}> {
  const launchContext = getWhatsappLaunchContext();
  const normalizedUrl = normalizeWhatsappLaunchUrl(rawUrl);
  const meta = whatsappLaunchMeta(rawUrl);

  waLaunchDebug('D-url-normalized', {
    platform: launchContext.platformOs,
    isMobileWeb: launchContext.isMobileWeb,
    phoneDigits: meta.phoneDigits,
    hasVincularText: meta.hasVincularText,
  });

  if (launchContext.isWeb) {
    waLaunchDebug('E-web-branch', {
      isMobileWeb: launchContext.isMobileWeb,
      autoNav: !launchContext.isMobileWeb,
    });
    if (!launchContext.isMobileWeb) {
      waLaunchDebug('E-web-nav-attempt', { method: 'anchor-click-auto' });
      const clicked = tryOpenWhatsappWebAuto(normalizedUrl);
      waLaunchDebug('F-auto-nav-result', { clicked });
    } else {
      waLaunchDebug('F-mobile-web-manual-only', { reason: 'user-tap-required' });
    }
    return { normalizedUrl, showWebFallback: true, launchContext };
  }

  waLaunchDebug('E-native-nav-attempt', { method: 'linking' });
  await openWhatsappNative(normalizedUrl);
  waLaunchDebug('F-native-nav-result', { ok: true });
  return { normalizedUrl, showWebFallback: false, launchContext };
}

/** Solo native: web debe usar <a href> real en UI. */
export function openWhatsappFromPrompt(url: string): void {
  if (Platform.OS === 'web') return;
  void Linking.openURL(url);
}
