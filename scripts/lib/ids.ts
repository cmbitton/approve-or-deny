import { createHash } from 'node:crypto';

// Crockford-style base32 without i, l, o, u: no look-alike characters in a URL.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const LENGTH = 8; // 40 bits: collisions are vanishingly unlikely at this data size, and checked anyway.

/**
 * Stable ID for a plate, derived from its normalized text (the key the pipeline
 * dedupes on). The same plate always gets the same ID, however the data is ordered
 * or filtered, so shared links keep working across rebuilds.
 */
export function plateId(normalizedPlate: string): string {
  const bytes = createHash('sha256').update(`plate:${normalizedPlate}`).digest();
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < LENGTH) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === LENGTH) break;
  }
  return out;
}

/** IDs for every key, throwing if two keys ever collide. */
export function assignIds(keys: Iterable<string>): Map<string, string> {
  const ids = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const key of keys) {
    const id = plateId(key);
    const owner = owners.get(id);
    if (owner !== undefined && owner !== key) throw new Error(`Plate ID collision: "${owner}" and "${key}" both hash to ${id}`);
    owners.set(id, key);
    ids.set(key, id);
  }
  return ids;
}
