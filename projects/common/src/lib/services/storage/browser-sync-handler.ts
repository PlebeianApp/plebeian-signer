/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EncryptedVault,
  StoredCashuMint,
  StoredIdentity,
  StoredNwcConnection,
  StoredPermission,
  StoredRelay,
} from './types';

/**
 * This class handles the data that is synced between browser instances.
 * In addition to the sensitive data that is encrypted, it also contains
 * some unencrypted properties (like, version and the vault hash).
 */
export abstract class BrowserSyncHandler {
  get encryptedVault(): EncryptedVault | undefined {
    return this.#encryptedVault;
  }

  /** @deprecated Use encryptedVault instead */
  get browserSyncData(): EncryptedVault | undefined {
    return this.#encryptedVault;
  }

  get ignoreProperties(): string[] {
    return this.#ignoreProperties;
  }

  #encryptedVault?: EncryptedVault;
  #ignoreProperties: string[] = [];

  setIgnoreProperties(properties: string[]) {
    this.#ignoreProperties = properties;
  }

  /**
   * Load data from the sync data storage. This data might be
   * outdated (i.e. it is unmigrated), so check the unencrypted property "version" after loading.
   * Also make sure to handle the "ignore properties" (if available).
   */
  abstract loadUnmigratedData(): Promise<Partial<Record<string, any>>>;

  /**
   * Persist the full data to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setFullData(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetFullData(data: EncryptedVault): Promise<void>;

  setFullData(data: EncryptedVault) {
    this.#encryptedVault = JSON.parse(JSON.stringify(data));
  }

  /**
   * Persist the permissions to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Permissions(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Permissions(data: {
    permissions: StoredPermission[];
  }): Promise<void>;
  setPartialData_Permissions(data: { permissions: StoredPermission[] }) {
    if (!this.#encryptedVault) {
      return;
    }
    this.#encryptedVault.permissions = Array.from(data.permissions);
  }

  /**
   * Persist the identities to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Identities(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Identities(data: {
    identities: StoredIdentity[];
  }): Promise<void>;

  setPartialData_Identities(data: { identities: StoredIdentity[] }) {
    if (!this.#encryptedVault) {
      return;
    }
    this.#encryptedVault.identities = Array.from(data.identities);
  }

  /**
   * Persist the selected identity id to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_SelectedIdentityId(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void>;

  setPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }) {
    if (!this.#encryptedVault) {
      return;
    }
    this.#encryptedVault.selectedIdentityId = data.selectedIdentityId;
  }

  abstract saveAndSetPartialData_Relays(data: {
    relays: StoredRelay[];
  }): Promise<void>;
  setPartialData_Relays(data: { relays: StoredRelay[] }) {
    if (!this.#encryptedVault) {
      return;
    }
    this.#encryptedVault.relays = Array.from(data.relays);
  }

  /**
   * Persist the NWC connections to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_NwcConnections(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_NwcConnections(data: {
    nwcConnections: StoredNwcConnection[];
  }): Promise<void>;
  setPartialData_NwcConnections(data: {
    nwcConnections: StoredNwcConnection[];
  }) {
    if (!this.#encryptedVault) {
      return;
    }
    this.#encryptedVault.nwcConnections = Array.from(data.nwcConnections);
  }

  /**
   * Persist the Cashu mints to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_CashuMints(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_CashuMints(data: {
    cashuMints: StoredCashuMint[];
  }): Promise<void>;
  setPartialData_CashuMints(data: { cashuMints: StoredCashuMint[] }) {
    if (!this.#encryptedVault) {
      return;
    }
    this.#encryptedVault.cashuMints = Array.from(data.cashuMints);
  }

  /**
   * Clear all data from the sync data storage.
   */
  abstract clearData(): Promise<void>;
}
