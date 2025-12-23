/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bookmark, BrowserSyncData, BrowserSyncFlow, SignerMetaData, SignerMetaData_VaultSnapshot } from './types';
import { v4 as uuidv4 } from 'uuid';

export abstract class SignerMetaHandler {
  get signerMetaData(): SignerMetaData | undefined {
    return this.#signerMetaData;
  }

  #signerMetaData?: SignerMetaData;

  readonly metaProperties = ['syncFlow', 'vaultSnapshots', 'maxBackups', 'recklessMode', 'whitelistedHosts', 'bookmarks', 'devMode'];
  readonly DEFAULT_MAX_BACKUPS = 5;
  /**
   * Load the full data from the storage. If the storage is used for storing
   * other data (e.g. browser sync data when the user decided to NOT sync),
   * make sure to handle the "meta properties" to only load these.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards to update the in-memory data.
   */
  abstract loadFullData(): Promise<Partial<Record<string, any>>>;

  setFullData(data: SignerMetaData) {
    this.#signerMetaData = data;
  }

  abstract saveFullData(data: SignerMetaData): Promise<void>;

  /**
   * Sets the browser sync flow for the user and immediately saves it.
   */
  async setBrowserSyncFlow(flow: BrowserSyncFlow): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        syncFlow: flow,
      };
    } else {
      this.#signerMetaData.syncFlow = flow;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  abstract clearData(keep: string[]): Promise<void>;

  /**
   * Sets the reckless mode and immediately saves it.
   */
  async setRecklessMode(enabled: boolean): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        recklessMode: enabled,
      };
    } else {
      this.#signerMetaData.recklessMode = enabled;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Sets dev mode and immediately saves it.
   */
  async setDevMode(enabled: boolean): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        devMode: enabled,
      };
    } else {
      this.#signerMetaData.devMode = enabled;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Adds a host to the whitelist and immediately saves it.
   */
  async addWhitelistedHost(host: string): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        whitelistedHosts: [host],
      };
    } else {
      const hosts = this.#signerMetaData.whitelistedHosts ?? [];
      if (!hosts.includes(host)) {
        hosts.push(host);
        this.#signerMetaData.whitelistedHosts = hosts;
      }
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Removes a host from the whitelist and immediately saves it.
   */
  async removeWhitelistedHost(host: string): Promise<void> {
    if (!this.#signerMetaData?.whitelistedHosts) {
      return;
    }

    this.#signerMetaData.whitelistedHosts = this.#signerMetaData.whitelistedHosts.filter(
      (h) => h !== host
    );

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Sets the bookmarks array and immediately saves it.
   */
  async setBookmarks(bookmarks: Bookmark[]): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        bookmarks,
      };
    } else {
      this.#signerMetaData.bookmarks = bookmarks;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Gets the current bookmarks.
   */
  getBookmarks(): Bookmark[] {
    return this.#signerMetaData?.bookmarks ?? [];
  }

  /**
   * Gets the maximum number of backups to keep.
   */
  getMaxBackups(): number {
    return this.#signerMetaData?.maxBackups ?? this.DEFAULT_MAX_BACKUPS;
  }

  /**
   * Sets the maximum number of backups to keep and immediately saves it.
   */
  async setMaxBackups(count: number): Promise<void> {
    const clampedCount = Math.max(1, Math.min(20, count)); // Clamp between 1-20
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        maxBackups: clampedCount,
      };
    } else {
      this.#signerMetaData.maxBackups = clampedCount;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Gets all vault backups, sorted newest first.
   */
  getBackups(): SignerMetaData_VaultSnapshot[] {
    const backups = this.#signerMetaData?.vaultSnapshots ?? [];
    return [...backups].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Gets a specific backup by ID.
   */
  getBackupById(id: string): SignerMetaData_VaultSnapshot | undefined {
    return this.#signerMetaData?.vaultSnapshots?.find(b => b.id === id);
  }

  /**
   * Creates a new backup of the vault data.
   * Automatically removes old backups if exceeding maxBackups.
   */
  async createBackup(
    browserSyncData: BrowserSyncData,
    reason: 'manual' | 'auto' | 'pre-restore' = 'manual'
  ): Promise<SignerMetaData_VaultSnapshot> {
    const now = new Date();
    const dateTimeString = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const identityCount = browserSyncData.identities?.length ?? 0;

    const snapshot: SignerMetaData_VaultSnapshot = {
      id: uuidv4(),
      fileName: `Vault Backup - ${dateTimeString}`,
      createdAt: now.toISOString(),
      data: JSON.parse(JSON.stringify(browserSyncData)), // Deep clone
      identityCount,
      reason,
    };

    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        vaultSnapshots: [snapshot],
      };
    } else {
      const existingBackups = this.#signerMetaData.vaultSnapshots ?? [];
      existingBackups.push(snapshot);

      // Enforce max backups limit (only for auto backups, keep manual and pre-restore)
      const maxBackups = this.getMaxBackups();
      const autoBackups = existingBackups.filter(b => b.reason === 'auto');
      const otherBackups = existingBackups.filter(b => b.reason !== 'auto');

      // Sort auto backups by date (newest first) and keep only maxBackups
      autoBackups.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const trimmedAutoBackups = autoBackups.slice(0, maxBackups);

      this.#signerMetaData.vaultSnapshots = [...otherBackups, ...trimmedAutoBackups];
    }

    await this.saveFullData(this.#signerMetaData);
    return snapshot;
  }

  /**
   * Deletes a backup by ID.
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    if (!this.#signerMetaData?.vaultSnapshots) {
      return false;
    }

    const initialLength = this.#signerMetaData.vaultSnapshots.length;
    this.#signerMetaData.vaultSnapshots = this.#signerMetaData.vaultSnapshots.filter(
      b => b.id !== backupId
    );

    if (this.#signerMetaData.vaultSnapshots.length < initialLength) {
      await this.saveFullData(this.#signerMetaData);
      return true;
    }
    return false;
  }

  /**
   * Gets the data from a backup for restoration.
   * Note: The caller should create a pre-restore backup before calling this.
   */
  getBackupData(backupId: string): BrowserSyncData | undefined {
    const backup = this.getBackupById(backupId);
    return backup?.data;
  }
}
