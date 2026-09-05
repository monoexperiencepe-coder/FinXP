import {
  CANONICAL_PRODUCTION_ORIGIN,
  canonicalRedirectUrl,
  resolveApiBaseUrl as resolveApiBaseUrlPure,
  shouldRedirectToCanonical,
} from './siteUrlCore';

export {
  CANONICAL_PRODUCTION_ORIGIN,
  canonicalRedirectUrl,
  shouldRedirectToCanonical,
};

export function resolveApiBaseUrl(options?: {
  platformOs?: string;
  webOrigin?: string | null;
  envSiteUrl?: string | null;
}): string {
  return resolveApiBaseUrlPure({
    platformOs: options?.platformOs,
    webOrigin: options?.webOrigin,
    envSiteUrl: options?.envSiteUrl ?? process.env.EXPO_PUBLIC_SITE_URL ?? null,
  });
}

export function resolveApiEndpoint(path: string, options?: {
  platformOs?: string;
  webOrigin?: string | null;
}): string {
  const base = resolveApiBaseUrl(options);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
