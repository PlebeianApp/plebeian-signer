/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bookmark, EncryptedVault, SyncFlow, ExtensionSettings, VaultSnapshot } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handler for extension settings stored outside the encrypted vault.
 * This includes sync preferences, backups, reckless mode, whitelisted hosts, etc.
 */
export abstract class SignerMetaHandler {
  get extensionSettings(): ExtensionSettings | undefined {
    return this.#extensionSettings;
  }

  /** @deprecated Use extensionSettings instead */
  get signerMetaData(): ExtensionSettings | undefined {
    return this.#extensionSettings;
  }

  #extensionSettings?: ExtensionSettings;

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

  setFullData(data: ExtensionSettings) {
    this.#extensionSettings = data;
  }

  abstract saveFullData(data: ExtensionSettings): Promise<void>;

  /**
   * Sets the sync flow preference for the user and immediately saves it.
   */
  async setSyncFlow(flow: SyncFlow): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        syncFlow: flow,
      };
    } else {
      this.#extensionSettings.syncFlow = flow;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /** @deprecated Use setSyncFlow instead */
  async setBrowserSyncFlow(flow: SyncFlow): Promise<void> {
    return this.setSyncFlow(flow);
  }

  abstract clearData(keep: string[]): Promise<void>;

  /**
   * Sets the reckless mode and immediately saves it.
   */
  async setRecklessMode(enabled: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        recklessMode: enabled,
      };
    } else {
      this.#extensionSettings.recklessMode = enabled;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Sets dev mode and immediately saves it.
   */
  async setDevMode(enabled: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        devMode: enabled,
      };
    } else {
      this.#extensionSettings.devMode = enabled;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Adds a host to the whitelist and immediately saves it.
   */
  async addWhitelistedHost(host: string): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        whitelistedHosts: [host],
      };
    } else {
      const hosts = this.#extensionSettings.whitelistedHosts ?? [];
      if (!hosts.includes(host)) {
        hosts.push(host);
        this.#extensionSettings.whitelistedHosts = hosts;
      }
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Removes a host from the whitelist and immediately saves it.
   */
  async removeWhitelistedHost(host: string): Promise<void> {
    if (!this.#extensionSettings?.whitelistedHosts) {
      return;
    }

    this.#extensionSettings.whitelistedHosts = this.#extensionSettings.whitelistedHosts.filter(
      (h) => h !== host
    );

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Sets the bookmarks array and immediately saves it.
   */
  async setBookmarks(bookmarks: Bookmark[]): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        bookmarks,
      };
    } else {
      this.#extensionSettings.bookmarks = bookmarks;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Gets the current bookmarks.
   */
  getBookmarks(): Bookmark[] {
    return this.#extensionSettings?.bookmarks ?? [];
  }

  /**
   * Gets the maximum number of backups to keep.
   */
  getMaxBackups(): number {
    return this.#extensionSettings?.maxBackups ?? this.DEFAULT_MAX_BACKUPS;
  }

  /**
   * Sets the maximum number of backups to keep and immediately saves it.
   */
  async setMaxBackups(count: number): Promise<void> {
    const clampedCount = Math.max(1, Math.min(20, count)); // Clamp between 1-20
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        maxBackups: clampedCount,
      };
    } else {
      this.#extensionSettings.maxBackups = clampedCount;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Gets all vault backups, sorted newest first.
   */
  getBackups(): VaultSnapshot[] {
    const backups = this.#extensionSettings?.vaultSnapshots ?? [];
    return [...backups].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Gets a specific backup by ID.
   */
  getBackupById(id: string): VaultSnapshot | undefined {
    return this.#extensionSettings?.vaultSnapshots?.find(b => b.id === id);
  }

  /**
   * Creates a new backup of the vault data.
   * Automatically removes old backups if exceeding maxBackups.
   */
  async createBackup(
    encryptedVault: EncryptedVault,
    reason: 'manual' | 'auto' | 'pre-restore' = 'manual'
  ): Promise<VaultSnapshot> {
    const now = new Date();
    const dateTimeString = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const identityCount = encryptedVault.identities?.length ?? 0;

    const snapshot: VaultSnapshot = {
      id: uuidv4(),
      fileName: `Vault Backup - ${dateTimeString}`,
      createdAt: now.toISOString(),
      data: JSON.parse(JSON.stringify(encryptedVault)), // Deep clone
      identityCount,
      reason,
    };

    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        vaultSnapshots: [snapshot],
      };
    } else {
      const existingBackups = this.#extensionSettings.vaultSnapshots ?? [];
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

      this.#extensionSettings.vaultSnapshots = [...otherBackups, ...trimmedAutoBackups];
    }

    await this.saveFullData(this.#extensionSettings);
    return snapshot;
  }

  /**
   * Deletes a backup by ID.
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    if (!this.#extensionSettings?.vaultSnapshots) {
      return false;
    }

    const initialLength = this.#extensionSettings.vaultSnapshots.length;
    this.#extensionSettings.vaultSnapshots = this.#extensionSettings.vaultSnapshots.filter(
      b => b.id !== backupId
    );

    if (this.#extensionSettings.vaultSnapshots.length < initialLength) {
      await this.saveFullData(this.#extensionSettings);
      return true;
    }
    return false;
  }

  /**
   * Gets the data from a backup for restoration.
   * Note: The caller should create a pre-restore backup before calling this.
   */
  getBackupData(backupId: string): EncryptedVault | undefined {
    const backup = this.getBackupById(backupId);
    return backup?.data;
  }
}
