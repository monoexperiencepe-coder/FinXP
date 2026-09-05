/**
 * Pure WhatsApp URL helpers (sin dependencias de React Native).
 * Usado por whatsappLaunch.ts y tests node:test.
 */

/** @param {string} ua */
function detectMobileWebFromUserAgent(ua) {
  if (!ua) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(ua);
}

/** @param {{ isMobileWeb?: boolean }} ctx */
function whatsappWebLinkTargetFromContext(ctx = {}) {
  return ctx.isMobileWeb ? '_blank' : '_self';
}

/** @param {string} rawUrl */
function normalizeWhatsappLaunchUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('URL de WhatsApp inválida en la respuesta del servidor.');
  }

  const host = u.hostname.replace(/^www\./, '');
  let phone = '';
  let text = u.searchParams.get('text') || '';

  if (host === 'wa.me') {
    phone = u.pathname.replace(/^\//, '').replace(/\D/g, '');
  } else {
    phone = (u.searchParams.get('phone') || '').replace(/\D/g, '');
  }

  if (!phone || phone.length < 8) {
    throw new Error('El servidor no devolvió un número de WhatsApp válido.');
  }

  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** @param {string} url */
function extractVincularCodeFromLaunchUrl(url) {
  try {
    const u = new URL(url);
    const text = u.searchParams.get('text') || '';
    const m = text.match(/VINCULAR\s+(\d{6,10})/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** @param {string} rawUrl */
function whatsappLaunchMeta(rawUrl) {
  const normalized = normalizeWhatsappLaunchUrl(rawUrl);
  const u = new URL(normalized);
  const phone = u.pathname.replace(/^\//, '').replace(/\D/g, '');
  const text = u.searchParams.get('text') || '';
  return {
    phoneDigits: phone.length,
    hasVincularText: /vincular/i.test(text),
  };
}

module.exports = {
  detectMobileWebFromUserAgent,
  whatsappWebLinkTargetFromContext,
  normalizeWhatsappLaunchUrl,
  extractVincularCodeFromLaunchUrl,
  whatsappLaunchMeta,
};
