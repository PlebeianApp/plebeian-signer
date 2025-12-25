/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EncryptedVault,
  StoredCashuMint,
  StoredIdentity,
  StoredNwcConnection,
  StoredPermission,
  BrowserSyncHandler,
  StoredRelay,
} from '@common';
import browser from 'webextension-polyfill';

/**
 * Handles the browser sync operations when the browser sync is enabled.
 * If it's not enabled, it behaves like the local extension storage (which is fine).
 */
export class FirefoxSyncNoHandler extends BrowserSyncHandler {
  async loadUnmigratedData(): Promise<Partial<Record<string, any>>> {
    const data = await browser.storage.local.get(null);

    // Remove any available "ignore properties".
    this.ignoreProperties.forEach((property) => {
      delete data[property];
    });
    return data;
  }

  async saveAndSetFullData(data: EncryptedVault): Promise<void> {
    await browser.storage.local.set(data as Record<string, any>);
    this.setFullData(data);
  }

  async saveAndSetPartialData_Permissions(data: {
    permissions: StoredPermission[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Permissions(data);
  }

  async saveAndSetPartialData_Identities(data: {
    identities: StoredIdentity[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Identities(data);
  }

  async saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_SelectedIdentityId(data);
  }

  async saveAndSetPartialData_Relays(data: {
    relays: StoredRelay[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Relays(data);
  }

  async saveAndSetPartialData_NwcConnections(data: {
    nwcConnections: StoredNwcConnection[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_NwcConnections(data);
  }

  async saveAndSetPartialData_CashuMints(data: {
    cashuMints: StoredCashuMint[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_CashuMints(data);
  }

  async clearData(): Promise<void> {
    const props = Object.keys(await this.loadUnmigratedData());
    await browser.storage.local.remove(props);
  }
}
