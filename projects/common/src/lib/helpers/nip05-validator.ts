/**
 * NIP-05 Verification Helper
 *
 * Directly validates NIP-05 identifiers by fetching the .well-known/nostr.json
 * file and comparing the pubkey.
 */

export interface Nip05ValidationResult {
  valid: boolean;
  pubkey?: string;
  relays?: string[];
  error?: string;
}

/**
 * Parse a NIP-05 identifier into its components
 * @param nip05 - The NIP-05 identifier (e.g., "me@mleku.dev" or "_@mleku.dev")
 * @returns Object with name and domain, or null if invalid
 */
export function parseNip05(nip05: string): { name: string; domain: string } | null {
  if (!nip05 || typeof nip05 !== 'string') {
    return null;
  }

  const parts = nip05.toLowerCase().trim().split('@');
  if (parts.length !== 2) {
    return null;
  }

  const [name, domain] = parts;
  if (!name || !domain) {
    return null;
  }

  // Basic domain validation
  if (!domain.includes('.') || domain.includes('/')) {
    return null;
  }

  return { name, domain };
}

/**
 * Validate a NIP-05 identifier against a pubkey
 *
 * @param nip05 - The NIP-05 identifier (e.g., "me@mleku.dev")
 * @param expectedPubkey - The expected pubkey in hex format
 * @param timeoutMs - Fetch timeout in milliseconds
 * @returns Validation result with status and any discovered relays
 */
export async function validateNip05(
  nip05: string,
  expectedPubkey: string,
  timeoutMs = 10000
): Promise<Nip05ValidationResult> {
  const parsed = parseNip05(nip05);
  if (!parsed) {
    return { valid: false, error: 'Invalid NIP-05 format' };
  }

  const { name, domain } = parsed;
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Check if the names object exists and contains the requested name
    if (!data.names || typeof data.names !== 'object') {
      return { valid: false, error: 'Invalid nostr.json structure: missing names' };
    }

    // NIP-05 names are case-insensitive
    const pubkeyFromJson = data.names[name] || data.names[name.toLowerCase()];

    if (!pubkeyFromJson) {
      return { valid: false, error: `Name "${name}" not found in nostr.json` };
    }

    // Compare pubkeys (case-insensitive hex comparison)
    const normalizedExpected = expectedPubkey.toLowerCase();
    const normalizedFound = pubkeyFromJson.toLowerCase();
    const valid = normalizedExpected === normalizedFound;

    // Extract relays if present
    let relays: string[] | undefined;
    if (data.relays && typeof data.relays === 'object') {
      const relayList = data.relays[pubkeyFromJson] || data.relays[normalizedFound];
      if (Array.isArray(relayList)) {
        relays = relayList;
      }
    }

    return {
      valid,
      pubkey: pubkeyFromJson,
      relays,
      error: valid ? undefined : 'Pubkey mismatch',
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { valid: false, error: 'Request timeout' };
      }
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Unknown error' };
  }
}
