import { isIP } from 'node:net';

/** Only explicitly configured proxy addresses may supply forwarded client IPs. */
export function parseTrustedProxyCidrs(value?: string): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(',').map(entry => entry.trim());
  for (const entry of entries) {
    const parts = entry.split('/');
    const version = isIP(parts[0] ?? '');
    const prefix = parts[1];
    if (!version || parts.length > 2 || (prefix !== undefined && (
      !/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)
    ))) {
      throw new Error('TRUSTED_PROXY_CIDRS must contain explicit IP addresses or nonzero CIDR prefixes');
    }
  }
  return entries;
}
