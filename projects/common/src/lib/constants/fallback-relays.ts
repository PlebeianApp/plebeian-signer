/**
 * Fallback relays used for fetching profile metadata (kind 0 events)
 * and publishing wallet events (NIP-60). These are well-known relays
 * that aggregate profile data and are commonly used by Nostr apps.
 */
export const FALLBACK_PROFILE_RELAYS = [
  'wss://relay.nostr.band/',
  'wss://nostr.wine/',
  'wss://nos.lol/',
  'wss://relay.primal.net/',
  'wss://purplepag.es/',
  'wss://relay.damus.io/',
  'wss://relay.minibits.cash/',
];
