import type { RightPaneBrowserSource } from '../types';

export type BrowserEmbedFallbackReason = 'known-restricted-host' | 'load-timeout';

const KNOWN_RESTRICTED_HOST_SUFFIXES = [
  'qq.com',
  'weixin.qq.com',
  'wechat.com',
];

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase();
}

export function isKnownRestrictedEmbedHost(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  return KNOWN_RESTRICTED_HOST_SUFFIXES.some((suffix) => (
    normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`)
  ));
}

export function getBrowserEmbedFallbackReason(
  url: string,
  _source: RightPaneBrowserSource,
): BrowserEmbedFallbackReason | null {
  try {
    const { hostname } = new URL(url);
    return isKnownRestrictedEmbedHost(hostname) ? 'known-restricted-host' : null;
  } catch {
    return null;
  }
}
