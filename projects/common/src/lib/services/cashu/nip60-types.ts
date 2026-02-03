import type { Proof } from '@cashu/cashu-ts';

/**
 * NIP-60 wallet event (kind 17375) - decrypted content
 */
export interface Nip60WalletConfig {
  mints: string[];
  privkey?: string; // Wallet private key (hex), separate from identity key
}

/**
 * NIP-60 unspent proof event (kind 7375) - decrypted content
 */
export interface Nip60UnspentProofs {
  mint: string;
  proofs: Proof[];
  unit?: string;
  del?: string[]; // Event IDs of destroyed token events
}

/**
 * NIP-60 spending history entry (kind 7376) - decrypted content
 */
export interface Nip60SpendingHistory {
  direction: 'in' | 'out';
  amount: number;
  unit: string;
  mint: string;
}

/**
 * NIP-61 nutzap info (kind 10019) - parsed from tags
 */
export interface NutzapInfo {
  pubkey: string;   // 02-prefixed compressed pubkey for P2PK locking
  mints: string[];  // Preferred mint URLs (from ["mint", url] tags)
  relays: string[]; // Preferred relays (from ["relay", url] tags)
}

/**
 * Parameters for sending a nutzap
 */
export interface NutzapSendParams {
  recipientPubkey: string; // hex Nostr pubkey of recipient
  amount: number;          // sats to send
  mintUrl?: string;        // which mint to use (must be in recipient's 10019)
  eventId?: string;        // event being "zapped" (optional)
  comment?: string;        // optional comment
}

/**
 * Parsed incoming nutzap (kind 9321)
 */
export interface NutzapReceived {
  eventId: string;
  senderPubkey: string;
  amount: number;
  mint: string;
  proofs: Proof[];
  comment?: string;
  targetEventId?: string;
  createdAt: number;
}

/**
 * Result from publishing events to relays
 */
export interface Nip60PublishResult {
  relay: string;
  success: boolean;
  message?: string;
}
