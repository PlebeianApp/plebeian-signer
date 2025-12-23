import { ExtensionMethod, Nip07MethodPolicy } from '@common';

export interface Permission_DECRYPTED {
  id: string;
  identityId: string;
  host: string;
  method: ExtensionMethod;
  methodPolicy: Nip07MethodPolicy;
  kind?: number;
}

export interface Permission_ENCRYPTED {
  id: string;
  identityId: string;
  host: string;
  method: string;
  methodPolicy: string;
  kind?: string;
}

export interface Identity_DECRYPTED {
  id: string;
  createdAt: string;
  nick: string;
  privkey: string;
}

export type Identity_ENCRYPTED = Identity_DECRYPTED;

export interface Relay_DECRYPTED {
  id: string;
  identityId: string;
  url: string;
  read: boolean;
  write: boolean;
}

export interface Relay_ENCRYPTED {
  id: string;
  identityId: string;
  url: string;
  read: string;
  write: string;
}

/**
 * NWC (Nostr Wallet Connect) connection - Decrypted
 * Stores NIP-47 wallet connection data
 */
export interface NwcConnection_DECRYPTED {
  id: string;
  name: string;                 // User-defined wallet name
  connectionUrl: string;        // Full nostr+walletconnect:// URL
  walletPubkey: string;         // Wallet service pubkey
  relayUrl: string;             // Relay URL for NWC communication
  secret: string;               // Client secret key (32-byte hex)
  lud16?: string;               // Optional lightning address
  createdAt: string;            // ISO timestamp
  cachedBalance?: number;       // Balance in millisatoshis
  cachedBalanceAt?: string;     // ISO timestamp when balance was fetched
}

/**
 * NWC connection - Encrypted for storage
 */
export interface NwcConnection_ENCRYPTED {
  id: string;
  name: string;
  connectionUrl: string;
  walletPubkey: string;
  relayUrl: string;
  secret: string;
  lud16?: string;
  createdAt: string;
  cachedBalance?: string;       // Encrypted as string
  cachedBalanceAt?: string;
}

/**
 * Cashu Proof - represents a single ecash token
 * This is the actual money stored locally
 */
export interface CashuProof {
  id: string;       // Keyset ID from mint
  amount: number;   // Satoshi amount
  secret: string;   // Blinded secret
  C: string;        // Unblinded signature (commitment)
  receivedAt?: string; // ISO timestamp when token was received
}

/**
 * Cashu Mint Connection - Decrypted
 * Stores NIP-60 Cashu mint connection data with local proofs
 */
export interface CashuMint_DECRYPTED {
  id: string;
  name: string;                 // User-defined mint name
  mintUrl: string;              // Mint API URL
  unit: string;                 // Unit (default: 'sat')
  createdAt: string;            // ISO timestamp
  proofs: CashuProof[];         // Unspent proofs for this mint
  cachedBalance?: number;       // Sum of proof amounts (sats)
  cachedBalanceAt?: string;     // When balance was calculated
}

/**
 * Cashu Mint Connection - Encrypted for storage
 */
export interface CashuMint_ENCRYPTED {
  id: string;
  name: string;
  mintUrl: string;
  unit: string;
  createdAt: string;
  proofs: string;               // JSON stringified and encrypted
  cachedBalance?: string;
  cachedBalanceAt?: string;
}

export interface BrowserSyncData_PART_Unencrypted {
  version: number;
  iv: string;
  vaultHash: string;
  // Version 2+: Random 32-byte salt for Argon2id key derivation (base64)
  // Version 1: Not present (uses PBKDF2 with hardcoded salt)
  salt?: string;
}

export interface BrowserSyncData_PART_Encrypted {
  selectedIdentityId: string | null;
  permissions: Permission_ENCRYPTED[];
  identities: Identity_ENCRYPTED[];
  relays: Relay_ENCRYPTED[];
  nwcConnections?: NwcConnection_ENCRYPTED[];
  cashuMints?: CashuMint_ENCRYPTED[];
}

export type BrowserSyncData = BrowserSyncData_PART_Unencrypted &
  BrowserSyncData_PART_Encrypted;

export enum BrowserSyncFlow {
  NO_SYNC = 0,
  BROWSER_SYNC = 1,
  SIGNER_SYNC = 2,
  CUSTOM_SYNC = 3,
}

export interface BrowserSessionData {
  // The following properties purely come from the browser session storage
  // and will never be going into the browser sync storage.
  vaultPassword?: string; // v1 only: raw password for PBKDF2
  vaultKey?: string; // v2+: pre-derived key bytes (base64) from Argon2id

  // The following properties initially come from the browser sync storage.
  iv: string;
  // Version 2+: Random salt for Argon2id (base64)
  salt?: string;
  permissions: Permission_DECRYPTED[];
  identities: Identity_DECRYPTED[];
  selectedIdentityId: string | null;
  relays: Relay_DECRYPTED[];
  nwcConnections?: NwcConnection_DECRYPTED[];
  cashuMints?: CashuMint_DECRYPTED[];
}

export interface SignerMetaData_VaultSnapshot {
  id: string;
  fileName: string;
  createdAt: string; // ISO timestamp
  data: BrowserSyncData;
  identityCount: number;
  reason?: 'manual' | 'auto' | 'pre-restore'; // Why was this backup created
}

export const SIGNER_META_DATA_KEY = {
  vaultSnapshots: 'vaultSnapshots',
};

/**
 * Bookmark entry for storing user bookmarks
 */
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export interface SignerMetaData {
  syncFlow?: number; // 0 = no sync, 1 = browser sync, (future: 2 = Signer sync, 3 = Custom sync (bring your own sync))

  vaultSnapshots?: SignerMetaData_VaultSnapshot[];

  // Maximum number of automatic backups to keep (default: 5)
  maxBackups?: number;

  // Reckless mode: auto-approve all actions without prompting
  recklessMode?: boolean;

  // Whitelisted hosts: auto-approve all actions from these hosts
  whitelistedHosts?: string[];

  // User bookmarks
  bookmarks?: Bookmark[];

  // Dev mode: show test permission prompt button in settings
  devMode?: boolean;
}

/**
 * Cached profile metadata from kind 0 events
 */
export interface ProfileMetadata {
  pubkey: string;
  name?: string;
  display_name?: string;
  displayName?: string; // Some clients use this instead
  picture?: string;
  banner?: string;
  about?: string;
  website?: string;
  nip05?: string;
  lud06?: string;
  lud16?: string;
  fetchedAt: number; // Timestamp when this was fetched
}

/**
 * Cache for profile metadata, stored in session storage
 */
export type ProfileMetadataCache = Record<string, ProfileMetadata>;
