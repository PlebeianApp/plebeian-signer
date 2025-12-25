import { ExtensionMethod, Nip07MethodPolicy } from '@common';

// =============================================================================
// STORAGE DATA TRANSFER OBJECTS (DTOs)
// These types represent data as stored in browser storage
// =============================================================================

/**
 * Permission as stored in encrypted vault (encrypted string fields)
 */
export interface StoredPermission {
  id: string;
  identityId: string;
  host: string;
  method: string;
  methodPolicy: string;
  kind?: string;
}

/**
 * Permission in session memory (typed fields)
 */
export interface PermissionData {
  id: string;
  identityId: string;
  host: string;
  method: ExtensionMethod;
  methodPolicy: Nip07MethodPolicy;
  kind?: number;
}

/**
 * Identity as stored in encrypted vault
 */
export interface StoredIdentity {
  id: string;
  createdAt: string;
  nick: string;
  privkey: string;
}

/**
 * Identity in session memory (same structure, just semantic clarity)
 */
export type IdentityData = StoredIdentity;

/**
 * Relay as stored in encrypted vault (encrypted boolean fields)
 */
export interface StoredRelay {
  id: string;
  identityId: string;
  url: string;
  read: string;
  write: string;
}

/**
 * Relay in session memory (typed boolean fields)
 */
export interface RelayData {
  id: string;
  identityId: string;
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * NWC (Nostr Wallet Connect) connection in session memory
 * Stores NIP-47 wallet connection data
 */
export interface NwcConnectionRecord {
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
 * NWC connection as stored in encrypted vault
 */
export interface StoredNwcConnection {
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
 * Cashu Mint Connection in session memory
 * Stores NIP-60 Cashu mint connection data with local proofs
 */
export interface CashuMintRecord {
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
 * Cashu Mint Connection as stored in encrypted vault
 */
export interface StoredCashuMint {
  id: string;
  name: string;
  mintUrl: string;
  unit: string;
  createdAt: string;
  proofs: string;               // JSON stringified and encrypted
  cachedBalance?: string;
  cachedBalanceAt?: string;
}

// =============================================================================
// ENCRYPTED VAULT
// The vault is the encrypted container holding all sensitive data
// =============================================================================

/**
 * Vault header - unencrypted metadata needed to decrypt the vault
 */
export interface EncryptedVaultHeader {
  version: number;
  iv: string;
  vaultHash: string;
  // Version 2+: Random 32-byte salt for Argon2id key derivation (base64)
  // Version 1: Not present (uses PBKDF2 with hardcoded salt)
  salt?: string;
}

/**
 * Vault content - encrypted payload containing all sensitive data
 */
export interface EncryptedVaultContent {
  selectedIdentityId: string | null;
  permissions: StoredPermission[];
  identities: StoredIdentity[];
  relays: StoredRelay[];
  nwcConnections?: StoredNwcConnection[];
  cashuMints?: StoredCashuMint[];
}

/**
 * Complete encrypted vault as stored in browser sync storage
 */
export type EncryptedVault = EncryptedVaultHeader & EncryptedVaultContent;

/**
 * Sync flow preference for vault data
 */
export enum SyncFlow {
  NO_SYNC = 0,
  BROWSER_SYNC = 1,
  SIGNER_SYNC = 2,
  CUSTOM_SYNC = 3,
}

// =============================================================================
// VAULT SESSION
// Runtime state when vault is unlocked
// =============================================================================

/**
 * Vault session - decrypted vault data in session memory
 */
export interface VaultSession {
  // The following properties purely come from the browser session storage
  // and will never be going into the browser sync storage.
  vaultPassword?: string; // v1 only: raw password for PBKDF2
  vaultKey?: string; // v2+: pre-derived key bytes (base64) from Argon2id

  // The following properties initially come from the browser sync storage.
  iv: string;
  // Version 2+: Random salt for Argon2id (base64)
  salt?: string;
  permissions: PermissionData[];
  identities: IdentityData[];
  selectedIdentityId: string | null;
  relays: RelayData[];
  nwcConnections?: NwcConnectionRecord[];
  cashuMints?: CashuMintRecord[];
}

// =============================================================================
// EXTENSION SETTINGS
// Non-vault configuration stored separately
// =============================================================================

/**
 * Vault snapshot for backup/restore
 */
export interface VaultSnapshot {
  id: string;
  fileName: string;
  createdAt: string; // ISO timestamp
  data: EncryptedVault;
  identityCount: number;
  reason?: 'manual' | 'auto' | 'pre-restore'; // Why was this backup created
}

export const EXTENSION_SETTINGS_KEYS = {
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

/**
 * Extension settings - non-vault configuration
 */
export interface ExtensionSettings {
  syncFlow?: number; // 0 = no sync, 1 = browser sync, (future: 2 = Signer sync, 3 = Custom sync)

  vaultSnapshots?: VaultSnapshot[];

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

// =============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// These will be removed in a future version
// =============================================================================

/** @deprecated Use StoredPermission instead */
export type Permission_ENCRYPTED = StoredPermission;
/** @deprecated Use PermissionData instead */
export type Permission_DECRYPTED = PermissionData;
/** @deprecated Use StoredIdentity instead */
export type Identity_ENCRYPTED = StoredIdentity;
/** @deprecated Use IdentityData instead */
export type Identity_DECRYPTED = IdentityData;
/** @deprecated Use StoredRelay instead */
export type Relay_ENCRYPTED = StoredRelay;
/** @deprecated Use RelayData instead */
export type Relay_DECRYPTED = RelayData;
/** @deprecated Use StoredNwcConnection instead */
export type NwcConnection_ENCRYPTED = StoredNwcConnection;
/** @deprecated Use NwcConnectionRecord instead */
export type NwcConnection_DECRYPTED = NwcConnectionRecord;
/** @deprecated Use StoredCashuMint instead */
export type CashuMint_ENCRYPTED = StoredCashuMint;
/** @deprecated Use CashuMintRecord instead */
export type CashuMint_DECRYPTED = CashuMintRecord;
/** @deprecated Use EncryptedVaultHeader instead */
export type BrowserSyncData_PART_Unencrypted = EncryptedVaultHeader;
/** @deprecated Use EncryptedVaultContent instead */
export type BrowserSyncData_PART_Encrypted = EncryptedVaultContent;
/** @deprecated Use EncryptedVault instead */
export type BrowserSyncData = EncryptedVault;
/** @deprecated Use SyncFlow instead */
export const BrowserSyncFlow = SyncFlow;
/** @deprecated Use SyncFlow instead */
export type BrowserSyncFlow = SyncFlow;
/** @deprecated Use VaultSession instead */
export type BrowserSessionData = VaultSession;
/** @deprecated Use VaultSnapshot instead */
export type SignerMetaData_VaultSnapshot = VaultSnapshot;
/** @deprecated Use EXTENSION_SETTINGS_KEYS instead */
export const SIGNER_META_DATA_KEY = EXTENSION_SETTINGS_KEYS;
/** @deprecated Use ExtensionSettings instead */
export type SignerMetaData = ExtensionSettings;
