import { Nip07Method, Nip07MethodPolicy } from '@common';

export interface Permission_DECRYPTED {
  id: string;
  identityId: string;
  host: string;
  method: Nip07Method;
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
}

export interface SignerMetaData_VaultSnapshot {
  fileName: string;
  data: BrowserSyncData;
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

  // Reckless mode: auto-approve all actions without prompting
  recklessMode?: boolean;

  // Whitelisted hosts: auto-approve all actions from these hosts
  whitelistedHosts?: string[];

  // User bookmarks
  bookmarks?: Bookmark[];
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
