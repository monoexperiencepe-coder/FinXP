/**
 * URL canónica de producción y resolución de origin/API base.
 * Sin dependencias de React Native — testeable con node:test.
 */

/** Alias estable de producción (único hardcode production permitido). */
const CANONICAL_PRODUCTION_ORIGIN = 'https://fin-xp-sigma.vercel.app';

/** @param {string | null | undefined} origin */
function isLocalDevOrigin(origin) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * URLs de deployment único de Vercel (no alias, no preview git).
 * Ej: fin-abc123-monoexperiencepe-9704s-projects.vercel.app
 * @param {string | null | undefined} origin
 */
function isVercelDeploymentOrigin(origin) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    if (host === 'fin-xp-sigma.vercel.app') return false;
    if (host === 'ahorra-ya.vercel.app') return true;
    return host.endsWith('-projects.vercel.app');
  } catch {
    return false;
  }
}

/**
 * Origin efectivo para API web: localhost se queda; deployment → canónico.
 * @param {string | null | undefined} origin
 */
function resolveWebOrigin(origin) {
  if (!origin) return CANONICAL_PRODUCTION_ORIGIN;
  if (isLocalDevOrigin(origin)) return origin;
  if (isVercelDeploymentOrigin(origin)) return CANONICAL_PRODUCTION_ORIGIN;
  return origin;
}

/**
 * @param {{
 *   platformOs?: string;
 *   webOrigin?: string | null;
 *   envSiteUrl?: string | null;
 * }} options
 */
function resolveApiBaseUrl(options = {}) {
  const platformOs = options.platformOs ?? 'web';
  const envSiteUrl = options.envSiteUrl?.replace(/\/$/, '') || null;

  if (platformOs === 'web' && options.webOrigin) {
    return resolveWebOrigin(options.webOrigin).replace(/\/$/, '');
  }

  return envSiteUrl || CANONICAL_PRODUCTION_ORIGIN;
}

/**
 * Redirigir solo deployment URLs concretas — no localhost ni previews git-*.
 * @param {string | null | undefined} origin
 */
function shouldRedirectToCanonical(origin) {
  return isVercelDeploymentOrigin(origin);
}

/** @param {string} path */
function canonicalRedirectUrl(path = '/') {
  const base = CANONICAL_PRODUCTION_ORIGIN.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

module.exports = {
  CANONICAL_PRODUCTION_ORIGIN,
  isLocalDevOrigin,
  isVercelDeploymentOrigin,
  resolveWebOrigin,
  resolveApiBaseUrl,
  shouldRedirectToCanonical,
  canonicalRedirectUrl,
};
