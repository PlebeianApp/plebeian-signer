/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { BrowserSyncHandler } from './browser-sync-handler';
import { BrowserSessionHandler } from './browser-session-handler';
import {
  VaultSession,
  EncryptedVault,
  SyncFlow,
  ExtensionSettings,
  RelayData,
  CashuMintRecord,
  CashuProof,
} from './types';
import { SignerMetaHandler } from './signer-meta-handler';
import { CryptoHelper } from '@common';
import { Buffer } from 'buffer';
import {
  addIdentity,
  deleteIdentity,
  switchIdentity,
  updateIdentityWalletPrivkey,
} from './related/identity';
import { deletePermission } from './related/permission';
import { createNewVault, deleteVault, unlockVault } from './related/vault';
import { addRelay, deleteRelay, updateRelay } from './related/relay';
import {
  addNwcConnection,
  deleteNwcConnection,
  updateNwcConnectionBalance,
} from './related/nwc';
import {
  addCashuMint,
  deleteCashuMint,
  encryptCashuMint,
  updateCashuMintProofs,
} from './related/cashu';

export class SyncQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncQuotaExceededError';
  }
}

export interface StorageServiceConfig {
  browserSessionHandler: BrowserSessionHandler;
  browserSyncYesHandler: BrowserSyncHandler;
  browserSyncNoHandler: BrowserSyncHandler;
  signerMetaHandler: SignerMetaHandler;
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly latestVersion = 2;
  isInitialized = false;

  #browserSessionHandler!: BrowserSessionHandler;
  #browserSyncYesHandler!: BrowserSyncHandler;
  #browserSyncNoHandler!: BrowserSyncHandler;
  #signerMetaHandler!: SignerMetaHandler;

  initialize(config: StorageServiceConfig): void {
    // Always set fresh handlers to ensure no stale in-memory state
    // This is important because extension pages may share some context
    this.#browserSessionHandler = config.browserSessionHandler;
    this.#browserSyncYesHandler = config.browserSyncYesHandler;
    this.#browserSyncNoHandler = config.browserSyncNoHandler;
    this.#signerMetaHandler = config.signerMetaHandler;
    this.isInitialized = true;
  }

  async enableBrowserSyncFlow(flow: SyncFlow): Promise<void> {
    this.assureIsInitialized();

    this.#signerMetaHandler.setSyncFlow(flow);
  }

  /**
   * Switch the sync flow at runtime, migrating vault data between handlers.
   * Copies encrypted vault from the current handler to the new one,
   * clears the old handler, and updates the sync flow setting.
   *
   * Throws SyncQuotaExceededError if the vault is too large for sync storage.
   */
  async switchSyncFlow(newFlow: SyncFlow): Promise<void> {
    this.assureIsInitialized();

    const currentFlow = this.getSyncFlow();
    if (currentFlow === newFlow) return;

    const currentHandler = this.getBrowserSyncHandler();
    const newHandler = newFlow === SyncFlow.BROWSER_SYNC
      ? this.#browserSyncYesHandler
      : this.#browserSyncNoHandler;

    // Copy vault data to the new handler
    const vault = currentHandler.encryptedVault;
    if (vault) {
      try {
        await newHandler.saveAndSetFullData(vault);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('QUOTA') || msg.includes('quota')) {
          throw new SyncQuotaExceededError(
            'Vault is too large for browser sync storage. Cashu tokens need to be migrated to relay storage (NIP-60) first.'
          );
        }
        throw err;
      }
    }

    // Clear the old handler
    await currentHandler.clearData();

    // Update the sync flow setting
    await this.#signerMetaHandler.setSyncFlow(newFlow);
  }

  async loadExtensionSettings(): Promise<ExtensionSettings | undefined> {
    this.assureIsInitialized();

    const data = await this.#signerMetaHandler.loadFullData();
    if (Object.keys(data).length === 0) {
      // No data available yet.
      return undefined;
    }

    this.#signerMetaHandler.setFullData(data as ExtensionSettings);
    return data as ExtensionSettings;
  }

  /** @deprecated Use loadExtensionSettings instead */
  async loadSignerMetaData(): Promise<ExtensionSettings | undefined> {
    return this.loadExtensionSettings();
  }

  async loadVaultSession(): Promise<VaultSession | undefined> {
    this.assureIsInitialized();

    const data = await this.#browserSessionHandler.loadFullData();
    // Check for a VaultSession-specific property rather than just non-empty storage.
    // Session storage may contain other data (e.g., extensionLogs, profileMetadataCache)
    // that is not part of the vault session. The 'iv' property is always present
    // in a valid VaultSession.
    if (!data['iv']) {
      // No vault session data available (vault not unlocked).
      // Clear any stale in-memory cache to ensure consistent state.
      this.#browserSessionHandler.clearInMemoryData();
      return undefined;
    }

    // Set the existing data for in-memory usage.
    this.#browserSessionHandler.setFullData(data as VaultSession);
    return data as VaultSession;
  }

  /** @deprecated Use loadVaultSession instead */
  async loadBrowserSessionData(): Promise<VaultSession | undefined> {
    return this.loadVaultSession();
  }

  /**
   * Load and migrate the encrypted vault data. If no data is available yet,
   * the returned object is undefined.
   */
  async loadAndMigrateEncryptedVault(): Promise<EncryptedVault | undefined> {
    this.assureIsInitialized();
    const unmigratedEncryptedVault =
      await this.getBrowserSyncHandler().loadUnmigratedData();
    const { encryptedVault, migrationWasPerformed } =
      this.#migrateEncryptedVault(unmigratedEncryptedVault);

    if (!encryptedVault) {
      // Nothing to do at this point.
      return undefined;
    }

    // There is data. Check, if it was migrated.
    if (migrationWasPerformed) {
      // Persist the migrated data back to the browser sync storage.
      this.getBrowserSyncHandler().saveAndSetFullData(encryptedVault);
    } else {
      // Set the data for in-memory usage.
      this.getBrowserSyncHandler().setFullData(encryptedVault);
    }

    return encryptedVault;
  }

  /** @deprecated Use loadAndMigrateEncryptedVault instead */
  async loadAndMigrateBrowserSyncData(): Promise<EncryptedVault | undefined> {
    return this.loadAndMigrateEncryptedVault();
  }

  async deleteVault(doNotSetIsInitializedToFalse = false) {
    await deleteVault.call(this, doNotSetIsInitializedToFalse);
  }

  async resetExtension() {
    this.assureIsInitialized();
    await this.getBrowserSyncHandler().clearData();
    await this.getBrowserSessionHandler().clearData();
    await this.getSignerMetaHandler().clearData([]);
    this.isInitialized = false;
  }

  async lockVault(): Promise<void> {
    this.assureIsInitialized();
    this.flushRelaySync();
    await this.getBrowserSessionHandler().clearData();
    this.getBrowserSessionHandler().clearInMemoryData();
    // Note: We don't set isInitialized = false here because the sync data
    // (encrypted vault) is still loaded and we need it to unlock again
  }

  async unlockVault(password: string): Promise<void> {
    await unlockVault.call(this, password);
  }

  async createNewVault(password: string): Promise<void> {
    await createNewVault.call(this, password);
    this.scheduleRelaySync();
  }

  async addIdentity(data: {
    nick: string;
    privkeyString: string;
  }): Promise<void> {
    await addIdentity.call(this, data);
    this.scheduleRelaySync();
  }

  async deleteIdentity(identityId: string | undefined): Promise<void> {
    await deleteIdentity.call(this, identityId);
    this.scheduleRelaySync();
  }

  async switchIdentity(identityId: string | null): Promise<void> {
    await switchIdentity.call(this, identityId);
    this.scheduleRelaySync();
  }

  async updateIdentityWalletPrivkey(
    identityId: string,
    walletPrivkeyHex: string
  ): Promise<void> {
    await updateIdentityWalletPrivkey.call(this, identityId, walletPrivkeyHex);
    this.scheduleRelaySync();
  }

  async deletePermission(permissionId: string) {
    await deletePermission.call(this, permissionId);
    this.scheduleRelaySync();
  }

  async addRelay(data: {
    identityId: string;
    url: string;
    write: boolean;
    read: boolean;
  }): Promise<void> {
    await addRelay.call(this, data);
    this.scheduleRelaySync();
  }

  async deleteRelay(relayId: string): Promise<void> {
    await deleteRelay.call(this, relayId);
    this.scheduleRelaySync();
  }

  async updateRelay(relayClone: RelayData): Promise<void> {
    await updateRelay.call(this, relayClone);
    this.scheduleRelaySync();
  }

  async addNwcConnection(data: {
    name: string;
    connectionUrl: string;
  }): Promise<void> {
    await addNwcConnection.call(this, data);
    this.scheduleRelaySync();
  }

  async deleteNwcConnection(connectionId: string): Promise<void> {
    await deleteNwcConnection.call(this, connectionId);
    this.scheduleRelaySync();
  }

  async updateNwcConnectionBalance(
    connectionId: string,
    balanceMillisats: number
  ): Promise<void> {
    await updateNwcConnectionBalance.call(this, connectionId, balanceMillisats);
    this.scheduleRelaySync();
  }

  async addCashuMint(data: {
    name: string;
    mintUrl: string;
    unit?: string;
  }): Promise<CashuMintRecord> {
    const result = await addCashuMint.call(this, data);
    this.scheduleRelaySync();
    return result;
  }

  async deleteCashuMint(mintId: string): Promise<void> {
    await deleteCashuMint.call(this, mintId);
    this.scheduleRelaySync();
  }

  async updateCashuMintProofs(
    mintId: string,
    proofs: CashuProof[],
    skipVaultProofs = false
  ): Promise<void> {
    await updateCashuMintProofs.call(this, mintId, proofs, skipVaultProofs);
    this.scheduleRelaySync();
  }

  /**
   * Strip proofs from vault — re-encrypt all mints with empty proofs.
   * Used during NIP-60 migration to remove proofs from local storage
   * after they've been pushed to relays.
   */
  async stripProofsFromVault(): Promise<void> {
    this.assureIsInitialized();

    const mints = this.getBrowserSessionHandler().browserSessionData?.cashuMints ?? [];
    const encryptedMints = [];
    for (const mint of mints) {
      const metaOnly = { ...mint, proofs: [] as CashuProof[], cachedBalance: 0, cachedBalanceAt: undefined };
      const encrypted = await encryptCashuMint.call(this, metaOnly);
      encryptedMints.push(encrypted);
    }
    await this.getBrowserSyncHandler().saveAndSetPartialData_CashuMints({ cashuMints: encryptedMints });
    this.scheduleRelaySync();
  }

  exportVault(): string {
    this.assureIsInitialized();
    const vaultJson = JSON.stringify(
      this.getBrowserSyncHandler().encryptedVault,
      undefined,
      4
    );
    return vaultJson;
  }

  async importVault(allegedEncryptedVault: EncryptedVault) {
    this.assureIsInitialized();

    const isValidData = this.#allegedEncryptedVaultIsValid(
      allegedEncryptedVault
    );
    if (!isValidData) {
      throw new Error('The imported data is not valid.');
    }

    await this.getBrowserSyncHandler().saveAndSetFullData(
      allegedEncryptedVault
    );
    this.scheduleRelaySync();
  }

  getBrowserSyncHandler(): BrowserSyncHandler {
    this.assureIsInitialized();

    switch (this.#signerMetaHandler.extensionSettings?.syncFlow) {
      case SyncFlow.BROWSER_SYNC:
        return this.#browserSyncYesHandler;

      case SyncFlow.NO_SYNC:
      case SyncFlow.RELAY_SYNC:
      default:
        return this.#browserSyncNoHandler;
    }
  }

  getBrowserSessionHandler(): BrowserSessionHandler {
    this.assureIsInitialized();

    return this.#browserSessionHandler;
  }

  getSignerMetaHandler(): SignerMetaHandler {
    this.assureIsInitialized();

    return this.#signerMetaHandler;
  }

  /**
   * Get the current sync flow setting.
   * Returns NO_SYNC if not initialized or no setting found.
   */
  getSyncFlow(): SyncFlow {
    if (!this.isInitialized || !this.#signerMetaHandler?.extensionSettings) {
      return SyncFlow.NO_SYNC;
    }
    return this.#signerMetaHandler.extensionSettings.syncFlow ?? SyncFlow.NO_SYNC;
  }

  // -----------------------------------------------------------------------
  // Relay Sync scheduling
  // -----------------------------------------------------------------------

  #relaySyncTimer?: ReturnType<typeof setTimeout>;
  #relaySyncCallback?: () => void;

  /**
   * Set the callback that pushes the vault to relays.
   * Called by the app component after vault unlock.
   */
  setRelaySyncCallback(cb: () => void): void {
    this.#relaySyncCallback = cb;
  }

  /**
   * Schedule a debounced relay push (5s). Called after every mutating operation.
   * No-op if sync flow is not RELAY_SYNC.
   */
  scheduleRelaySync(): void {
    if (this.getSyncFlow() !== SyncFlow.RELAY_SYNC) return;
    clearTimeout(this.#relaySyncTimer);
    this.#relaySyncTimer = setTimeout(() => this.#relaySyncCallback?.(), 5000);
  }

  /**
   * Flush any pending relay sync immediately (e.g., before locking vault).
   */
  flushRelaySync(): void {
    if (this.getSyncFlow() !== SyncFlow.RELAY_SYNC) return;
    clearTimeout(this.#relaySyncTimer);
    this.#relaySyncCallback?.();
  }

  /**
   * Throws an exception if the service is not initialized.
   */
  assureIsInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        'StorageService is not initialized. Please call "initialize(...)" before doing anything else.'
      );
    }
  }

  async encrypt(value: string): Promise<string> {
    const vaultSession = this.getBrowserSessionHandler().vaultSession;
    if (!vaultSession) {
      throw new Error('Vault session is undefined.');
    }

    // v2: Use pre-derived key directly with AES-GCM
    if (vaultSession.vaultKey) {
      return this.encryptV2(value, vaultSession.iv, vaultSession.vaultKey);
    }

    // v1: Use PBKDF2 with password
    if (!vaultSession.vaultPassword) {
      throw new Error('No vault password or key available.');
    }
    return CryptoHelper.encrypt(
      value,
      vaultSession.iv,
      vaultSession.vaultPassword
    );
  }

  /**
   * v2 encryption: Use pre-derived key bytes directly with AES-GCM (no key derivation)
   */
  async encryptV2(text: string, ivBase64: string, keyBase64: string): Promise<string> {
    const keyBytes = Buffer.from(keyBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const cipherText = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(text)
    );

    return Buffer.from(cipherText).toString('base64');
  }

  async decrypt(
    value: string,
    returnType: 'string' | 'number' | 'boolean'
  ): Promise<any> {
    const vaultSession = this.getBrowserSessionHandler().vaultSession;
    if (!vaultSession) {
      throw new Error('Vault session is undefined.');
    }

    // v2: Use pre-derived key directly with AES-GCM
    if (vaultSession.vaultKey) {
      const decryptedValue = await this.decryptV2(
        value,
        vaultSession.iv,
        vaultSession.vaultKey
      );
      return this.parseDecryptedValue(decryptedValue, returnType);
    }

    // v1: Use PBKDF2 with password
    if (!vaultSession.vaultPassword) {
      throw new Error('No vault password or key available.');
    }
    return this.decryptWithLockedVault(
      value,
      returnType,
      vaultSession.iv,
      vaultSession.vaultPassword
    );
  }

  /**
   * v2 decryption: Use pre-derived key bytes directly with AES-GCM (no key derivation)
   */
  async decryptV2(encryptedBase64: string, ivBase64: string, keyBase64: string): Promise<string> {
    const keyBytes = Buffer.from(keyBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    const cipherText = Buffer.from(encryptedBase64, 'base64');

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherText
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Parse a decrypted string value into the desired type
   */
  private parseDecryptedValue(
    decryptedValue: string,
    returnType: 'string' | 'number' | 'boolean'
  ): any {
    switch (returnType) {
      case 'number':
        return parseInt(decryptedValue);
      case 'boolean':
        return decryptedValue === 'true';
      case 'string':
      default:
        return decryptedValue;
    }
  }

  /**
   * v1: Decrypt with locked vault using password (PBKDF2)
   */
  async decryptWithLockedVault(
    value: string,
    returnType: 'string' | 'number' | 'boolean',
    iv: string,
    password: string
  ): Promise<any> {
    const decryptedValue = await CryptoHelper.decrypt(value, iv, password);
    return this.parseDecryptedValue(decryptedValue, returnType);
  }

  /**
   * v2: Decrypt with locked vault using pre-derived key (Argon2id)
   */
  async decryptWithLockedVaultV2(
    value: string,
    returnType: 'string' | 'number' | 'boolean',
    iv: string,
    keyBase64: string
  ): Promise<any> {
    const decryptedValue = await this.decryptV2(value, iv, keyBase64);
    return this.parseDecryptedValue(decryptedValue, returnType);
  }

  /**
   * Migrate the encrypted vault to the latest version.
   */
  #migrateEncryptedVault(encryptedVault: Partial<Record<string, any>>): {
    encryptedVault?: EncryptedVault;
    migrationWasPerformed: boolean;
  } {
    if (Object.keys(encryptedVault).length === 0) {
      // First run. There is no encrypted vault yet.
      return {
        encryptedVault: undefined,
        migrationWasPerformed: false,
      };
    }

    // Will be implemented if migration is required.
    return {
      encryptedVault: encryptedVault as EncryptedVault,
      migrationWasPerformed: false,
    };
  }

  #allegedEncryptedVaultIsValid(data: EncryptedVault): boolean {
    if (typeof data.iv === 'undefined') {
      return false;
    }

    if (typeof data.version !== 'number') {
      return false;
    }

    if (typeof data.vaultHash === 'undefined') {
      return false;
    }

    if (typeof data.selectedIdentityId === 'undefined') {
      return false;
    }

    if (
      typeof data.identities === 'undefined' ||
      !Array.isArray(data.identities)
    ) {
      return false;
    }

    if (
      typeof data.permissions === 'undefined' ||
      !Array.isArray(data.permissions)
    ) {
      return false;
    }

    if (typeof data.relays === 'undefined' || !Array.isArray(data.relays)) {
      return false;
    }

    return true;
  }
}
