/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bookmark, EncryptedVault, PermissionLevel, SyncFlow, ExtensionSettings, VaultSnapshot } from './types';
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

  readonly metaProperties = ['syncFlow', 'vaultSnapshots', 'maxBackups', 'permissionLevel', 'recklessMode', 'whitelistedHosts', 'domainIdentitySelections', 'bookmarks', 'devMode', 'paused', 'stayUnlocked', 'nip60Enabled', 'relaySyncIdentityId', 'relaySyncAuthOnly', 'relaySyncLastPushed', 'nip60CustomRelaysEnabled', 'nip60CustomRelays'];
  readonly DEFAULT_MAX_BACKUPS = 5;

  #normalizeHost(host: string): string {
    return host.trim().toLowerCase();
  }
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
   * Gets the current permission level with migration from legacy recklessMode.
   */
  getPermissionLevel(): PermissionLevel {
    if (this.#extensionSettings?.permissionLevel) {
      return this.#extensionSettings.permissionLevel;
    }
    // Migrate from legacy recklessMode
    if (this.#extensionSettings?.recklessMode) {
      return 'reckless';
    }
    return 'forever'; // Default: remember permissions permanently
  }

  /**
   * Sets the permission level and immediately saves it.
   */
  async setPermissionLevel(level: PermissionLevel): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        permissionLevel: level,
      };
    } else {
      this.#extensionSettings.permissionLevel = level;
      // Clear legacy recklessMode to avoid confusion
      delete this.#extensionSettings.recklessMode;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /** @deprecated Use setPermissionLevel instead */
  async setRecklessMode(enabled: boolean): Promise<void> {
    await this.setPermissionLevel(enabled ? 'reckless' : 'forever');
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
   * Sets paused state and immediately saves it.
   * When paused, the signer will reject all NIP-07 and WebLN requests.
   */
  async setPaused(paused: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        paused,
      };
    } else {
      this.#extensionSettings.paused = paused;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Returns whether the signer is currently paused.
   */
  isPaused(): boolean {
    return this.#extensionSettings?.paused ?? false;
  }

  /**
   * Sets NIP-60 relay wallet sync and immediately saves it.
   */
  async setNip60Enabled(enabled: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        nip60Enabled: enabled,
      };
    } else {
      this.#extensionSettings.nip60Enabled = enabled;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Returns whether NIP-60 relay wallet sync is enabled.
   */
  isNip60Enabled(): boolean {
    return this.#extensionSettings?.nip60Enabled ?? true;
  }

  // =========================================================================
  // Relay Sync settings
  // =========================================================================

  /**
   * Sets the identity whose keypair signs vault events on relays.
   */
  async setRelaySyncIdentityId(id: string | undefined): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        relaySyncIdentityId: id,
      };
    } else {
      this.#extensionSettings.relaySyncIdentityId = id;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Gets the identity ID designated for relay sync.
   */
  getRelaySyncIdentityId(): string | undefined {
    return this.#extensionSettings?.relaySyncIdentityId;
  }

  /**
   * Sets whether to only publish vault to AUTH-required relays.
   */
  async setRelaySyncAuthOnly(authOnly: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        relaySyncAuthOnly: authOnly,
      };
    } else {
      this.#extensionSettings.relaySyncAuthOnly = authOnly;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Returns whether relay sync is restricted to AUTH-required relays.
   */
  isRelaySyncAuthOnly(): boolean {
    return this.#extensionSettings?.relaySyncAuthOnly ?? false;
  }

  /**
   * Sets the last successful relay push timestamp.
   */
  async setRelaySyncLastPushed(timestamp: number): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        relaySyncLastPushed: timestamp,
      };
    } else {
      this.#extensionSettings.relaySyncLastPushed = timestamp;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Gets the last successful relay push timestamp (0 if never pushed).
   */
  getRelaySyncLastPushed(): number {
    return this.#extensionSettings?.relaySyncLastPushed ?? 0;
  }

  /**
   * Sets whether custom NIP-60 sync relays are enabled.
   */
  async setNip60CustomRelaysEnabled(enabled: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        nip60CustomRelaysEnabled: enabled,
      };
    } else {
      this.#extensionSettings.nip60CustomRelaysEnabled = enabled;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Returns whether custom NIP-60 sync relays are enabled.
   */
  isNip60CustomRelaysEnabled(): boolean {
    return this.#extensionSettings?.nip60CustomRelaysEnabled ?? false;
  }

  /**
   * Sets the custom NIP-60 relay URLs.
   */
  async setNip60CustomRelays(relays: string[]): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        nip60CustomRelays: relays,
      };
    } else {
      this.#extensionSettings.nip60CustomRelays = relays;
    }

    await this.saveFullData(this.#extensionSettings);
  }

  /**
   * Returns the custom NIP-60 relay URLs (empty array if none configured).
   */
  getNip60CustomRelays(): string[] {
    return this.#extensionSettings?.nip60CustomRelays ?? [];
  }

  /**
   * Sets the "Stay Unlocked" preference and immediately saves it.
   * When enabled, the vault password is stored in plaintext in local storage
   * so the vault can auto-unlock on browser restart.
   */
  async setStayUnlocked(enabled: boolean): Promise<void> {
    if (!this.#extensionSettings) {
      this.#extensionSettings = {
        stayUnlocked: enabled,
      };
    } else {
      this.#extensionSettings.stayUnlocked = enabled;
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

  getSelectedIdentityIdForHost(host: string | null | undefined): string | undefined {
    if (!host) {
      return undefined;
    }

    return this.#extensionSettings?.domainIdentitySelections?.[this.#normalizeHost(host)];
  }

  async setSelectedIdentityIdForHost(
    host: string,
    identityId: string | null | undefined
  ): Promise<void> {
    const normalizedHost = this.#normalizeHost(host);
    if (!normalizedHost) {
      return;
    }

    if (!this.#extensionSettings) {
      this.#extensionSettings = {};
    }

    const selections = {
      ...(this.#extensionSettings.domainIdentitySelections ?? {}),
    };

    if (identityId) {
      selections[normalizedHost] = identityId;
    } else {
      delete selections[normalizedHost];
    }

    this.#extensionSettings.domainIdentitySelections =
      Object.keys(selections).length > 0 ? selections : undefined;

    await this.saveFullData(this.#extensionSettings);
  }

  async removeSelectedIdentityIdForIdentity(identityId: string): Promise<void> {
    if (!this.#extensionSettings?.domainIdentitySelections) {
      return;
    }

    const selections = Object.fromEntries(
      Object.entries(this.#extensionSettings.domainIdentitySelections).filter(
        ([, selectedIdentityId]) => selectedIdentityId !== identityId
      )
    );

    this.#extensionSettings.domainIdentitySelections =
      Object.keys(selections).length > 0 ? selections : undefined;

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
