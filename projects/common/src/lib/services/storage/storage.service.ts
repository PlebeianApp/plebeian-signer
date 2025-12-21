/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { BrowserSyncHandler } from './browser-sync-handler';
import { BrowserSessionHandler } from './browser-session-handler';
import {
  BrowserSessionData,
  BrowserSyncData,
  BrowserSyncFlow,
  SignerMetaData,
  Relay_DECRYPTED,
} from './types';
import { SignerMetaHandler } from './signer-meta-handler';
import { CryptoHelper } from '@common';
import { Buffer } from 'buffer';
import {
  addIdentity,
  deleteIdentity,
  switchIdentity,
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
  updateCashuMintProofs,
} from './related/cashu';
import { CashuMint_DECRYPTED, CashuProof } from './types';

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
    if (this.isInitialized) {
      return;
    }
    this.#browserSessionHandler = config.browserSessionHandler;
    this.#browserSyncYesHandler = config.browserSyncYesHandler;
    this.#browserSyncNoHandler = config.browserSyncNoHandler;
    this.#signerMetaHandler = config.signerMetaHandler;
    this.isInitialized = true;
  }

  async enableBrowserSyncFlow(flow: BrowserSyncFlow): Promise<void> {
    this.assureIsInitialized();

    this.#signerMetaHandler.setBrowserSyncFlow(flow);
  }

  async loadSignerMetaData(): Promise<SignerMetaData | undefined> {
    this.assureIsInitialized();

    const data = await this.#signerMetaHandler.loadFullData();
    if (Object.keys(data).length === 0) {
      // No data available yet.
      return undefined;
    }

    this.#signerMetaHandler.setFullData(data as SignerMetaData);
    return data as SignerMetaData;
  }

  async loadBrowserSessionData(): Promise<BrowserSessionData | undefined> {
    this.assureIsInitialized();

    const data = await this.#browserSessionHandler.loadFullData();
    if (Object.keys(data).length === 0) {
      // No data available yet (e.g. because the vault was not unlocked).
      return undefined;
    }

    // Set the existing data for in-memory usage.
    this.#browserSessionHandler.setFullData(data as BrowserSessionData);
    return data as BrowserSessionData;
  }

  /**
   * Load and migrate the browser sync data. If no data is available yet,
   * the returned object is undefined.
   */
  async loadAndMigrateBrowserSyncData(): Promise<BrowserSyncData | undefined> {
    this.assureIsInitialized();
    const unmigratedBrowserSyncData =
      await this.getBrowserSyncHandler().loadUnmigratedData();
    const { browserSyncData, migrationWasPerformed } =
      this.#migrateBrowserSyncData(unmigratedBrowserSyncData);

    if (!browserSyncData) {
      // Nothing to do at this point.
      return undefined;
    }

    // There is data. Check, if it was migrated.
    if (migrationWasPerformed) {
      // Persist the migrated data back to the browser sync storage.
      this.getBrowserSyncHandler().saveAndSetFullData(browserSyncData);
    } else {
      // Set the data for in-memory usage.
      this.getBrowserSyncHandler().setFullData(browserSyncData);
    }

    return browserSyncData;
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
  }

  async addIdentity(data: {
    nick: string;
    privkeyString: string;
  }): Promise<void> {
    await addIdentity.call(this, data);
  }

  async deleteIdentity(identityId: string | undefined): Promise<void> {
    await deleteIdentity.call(this, identityId);
  }

  async switchIdentity(identityId: string | null): Promise<void> {
    await switchIdentity.call(this, identityId);
  }

  async deletePermission(permissionId: string) {
    await deletePermission.call(this, permissionId);
  }

  async addRelay(data: {
    identityId: string;
    url: string;
    write: boolean;
    read: boolean;
  }): Promise<void> {
    await addRelay.call(this, data);
  }

  async deleteRelay(relayId: string): Promise<void> {
    await deleteRelay.call(this, relayId);
  }

  async updateRelay(relayClone: Relay_DECRYPTED): Promise<void> {
    await updateRelay.call(this, relayClone);
  }

  async addNwcConnection(data: {
    name: string;
    connectionUrl: string;
  }): Promise<void> {
    await addNwcConnection.call(this, data);
  }

  async deleteNwcConnection(connectionId: string): Promise<void> {
    await deleteNwcConnection.call(this, connectionId);
  }

  async updateNwcConnectionBalance(
    connectionId: string,
    balanceMillisats: number
  ): Promise<void> {
    await updateNwcConnectionBalance.call(this, connectionId, balanceMillisats);
  }

  async addCashuMint(data: {
    name: string;
    mintUrl: string;
    unit?: string;
  }): Promise<CashuMint_DECRYPTED> {
    return await addCashuMint.call(this, data);
  }

  async deleteCashuMint(mintId: string): Promise<void> {
    await deleteCashuMint.call(this, mintId);
  }

  async updateCashuMintProofs(
    mintId: string,
    proofs: CashuProof[]
  ): Promise<void> {
    await updateCashuMintProofs.call(this, mintId, proofs);
  }

  exportVault(): string {
    this.assureIsInitialized();
    const vaultJson = JSON.stringify(
      this.getBrowserSyncHandler().browserSyncData,
      undefined,
      4
    );
    return vaultJson;
  }

  async importVault(allegedBrowserSyncData: BrowserSyncData) {
    this.assureIsInitialized();

    const isValidData = this.#allegedBrowserSyncDataIsValid(
      allegedBrowserSyncData
    );
    if (!isValidData) {
      throw new Error('The imported data is not valid.');
    }

    await this.getBrowserSyncHandler().saveAndSetFullData(
      allegedBrowserSyncData
    );
  }

  getBrowserSyncHandler(): BrowserSyncHandler {
    this.assureIsInitialized();

    switch (this.#signerMetaHandler.signerMetaData?.syncFlow) {
      case BrowserSyncFlow.NO_SYNC:
        return this.#browserSyncNoHandler;

      case BrowserSyncFlow.BROWSER_SYNC:
      default:
        return this.#browserSyncYesHandler;
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
   * Get the current browser sync flow setting.
   * Returns NO_SYNC if not initialized or no setting found.
   */
  getSyncFlow(): BrowserSyncFlow {
    if (!this.isInitialized || !this.#signerMetaHandler?.signerMetaData) {
      return BrowserSyncFlow.NO_SYNC;
    }
    return this.#signerMetaHandler.signerMetaData.syncFlow ?? BrowserSyncFlow.NO_SYNC;
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
    const browserSessionData =
      this.getBrowserSessionHandler().browserSessionData;
    if (!browserSessionData) {
      throw new Error('Browser session data is undefined.');
    }

    // v2: Use pre-derived key directly with AES-GCM
    if (browserSessionData.vaultKey) {
      return this.encryptV2(value, browserSessionData.iv, browserSessionData.vaultKey);
    }

    // v1: Use PBKDF2 with password
    if (!browserSessionData.vaultPassword) {
      throw new Error('No vault password or key available.');
    }
    return CryptoHelper.encrypt(
      value,
      browserSessionData.iv,
      browserSessionData.vaultPassword
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
    const browserSessionData =
      this.getBrowserSessionHandler().browserSessionData;
    if (!browserSessionData) {
      throw new Error('Browser session data is undefined.');
    }

    // v2: Use pre-derived key directly with AES-GCM
    if (browserSessionData.vaultKey) {
      const decryptedValue = await this.decryptV2(
        value,
        browserSessionData.iv,
        browserSessionData.vaultKey
      );
      return this.parseDecryptedValue(decryptedValue, returnType);
    }

    // v1: Use PBKDF2 with password
    if (!browserSessionData.vaultPassword) {
      throw new Error('No vault password or key available.');
    }
    return this.decryptWithLockedVault(
      value,
      returnType,
      browserSessionData.iv,
      browserSessionData.vaultPassword
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
   * Migrate the browser sync data to the latest version.
   */
  #migrateBrowserSyncData(browserSyncData: Partial<Record<string, any>>): {
    browserSyncData?: BrowserSyncData;
    migrationWasPerformed: boolean;
  } {
    if (Object.keys(browserSyncData).length === 0) {
      // First run. There is no browser sync data yet.
      return {
        browserSyncData: undefined,
        migrationWasPerformed: false,
      };
    }

    // Will be implemented if migration is required.
    return {
      browserSyncData: browserSyncData as BrowserSyncData,
      migrationWasPerformed: false,
    };
  }

  #allegedBrowserSyncDataIsValid(data: BrowserSyncData): boolean {
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
