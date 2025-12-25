import {
  RelayRepositoryError,
  RelayErrorCode,
} from '../../domain/repositories/relay-repository';
import type {
  RelayRepository,
  RelaySnapshot,
  RelayQuery,
} from '../../domain/repositories/relay-repository';
import { IdentityId, RelayId } from '../../domain/value-objects';
import { EncryptionService } from '../encryption';

/**
 * Encrypted relay as stored in browser sync storage.
 */
interface EncryptedRelay {
  id: string;
  identityId: string;
  url: string;
  read: string;
  write: string;
}

/**
 * Storage adapter interface for relays.
 */
export interface RelayStorageAdapter {
  // Session (in-memory, decrypted) operations
  getSessionRelays(): RelaySnapshot[];
  setSessionRelays(relays: RelaySnapshot[]): void;
  saveSessionData(): Promise<void>;

  // Sync (persistent, encrypted) operations
  getSyncRelays(): EncryptedRelay[];
  saveSyncRelays(relays: EncryptedRelay[]): Promise<void>;
}

/**
 * Implementation of RelayRepository using browser storage.
 */
export class BrowserRelayRepository implements RelayRepository {
  constructor(
    private readonly storage: RelayStorageAdapter,
    private readonly encryption: EncryptionService
  ) {}

  async findById(id: RelayId): Promise<RelaySnapshot | undefined> {
    const relays = this.storage.getSessionRelays();
    return relays.find((r) => r.id === id.value);
  }

  async find(query: RelayQuery): Promise<RelaySnapshot[]> {
    let relays = this.storage.getSessionRelays();

    if (query.identityId) {
      const identityIdValue = query.identityId.value;
      relays = relays.filter((r) => r.identityId === identityIdValue);
    }
    if (query.url) {
      const urlLower = query.url.toLowerCase();
      relays = relays.filter((r) => r.url.toLowerCase() === urlLower);
    }
    if (query.read !== undefined) {
      const read = query.read;
      relays = relays.filter((r) => r.read === read);
    }
    if (query.write !== undefined) {
      const write = query.write;
      relays = relays.filter((r) => r.write === write);
    }

    return relays;
  }

  async findByUrl(identityId: IdentityId, url: string): Promise<RelaySnapshot | undefined> {
    const relays = this.storage.getSessionRelays();
    return relays.find(
      (r) =>
        r.identityId === identityId.value &&
        r.url.toLowerCase() === url.toLowerCase()
    );
  }

  async findByIdentity(identityId: IdentityId): Promise<RelaySnapshot[]> {
    const relays = this.storage.getSessionRelays();
    return relays.filter((r) => r.identityId === identityId.value);
  }

  async findAll(): Promise<RelaySnapshot[]> {
    return this.storage.getSessionRelays();
  }

  async save(relay: RelaySnapshot): Promise<void> {
    // Check for duplicate URL for the same identity (excluding self)
    const existing = await this.findByUrl(
      IdentityId.from(relay.identityId),
      relay.url
    );
    if (existing && existing.id !== relay.id) {
      throw new RelayRepositoryError(
        'A relay with the same URL already exists for this identity',
        RelayErrorCode.DUPLICATE_URL
      );
    }

    const sessionRelays = this.storage.getSessionRelays();
    const existingIndex = sessionRelays.findIndex((r) => r.id === relay.id);

    if (existingIndex >= 0) {
      sessionRelays[existingIndex] = relay;
    } else {
      sessionRelays.push(relay);
    }

    this.storage.setSessionRelays(sessionRelays);
    await this.storage.saveSessionData();

    // Encrypt and save to sync storage
    const encryptedRelay = await this.encryptRelay(relay);
    const syncRelays = this.storage.getSyncRelays();

    // Find by decrypting IDs
    let syncIndex = -1;
    for (let i = 0; i < syncRelays.length; i++) {
      try {
        const decryptedId = await this.encryption.decryptString(syncRelays[i].id);
        if (decryptedId === relay.id) {
          syncIndex = i;
          break;
        }
      } catch {
        // Skip corrupted entries
      }
    }

    if (syncIndex >= 0) {
      syncRelays[syncIndex] = encryptedRelay;
    } else {
      syncRelays.push(encryptedRelay);
    }

    await this.storage.saveSyncRelays(syncRelays);
  }

  async delete(id: RelayId): Promise<boolean> {
    const sessionRelays = this.storage.getSessionRelays();
    const initialLength = sessionRelays.length;
    const filtered = sessionRelays.filter((r) => r.id !== id.value);

    if (filtered.length === initialLength) {
      return false;
    }

    this.storage.setSessionRelays(filtered);
    await this.storage.saveSessionData();

    // Remove from sync storage
    const encryptedId = await this.encryption.encryptString(id.value);
    const syncRelays = this.storage.getSyncRelays();
    const filteredSync = syncRelays.filter((r) => r.id !== encryptedId);
    await this.storage.saveSyncRelays(filteredSync);

    return true;
  }

  async deleteByIdentity(identityId: IdentityId): Promise<number> {
    const sessionRelays = this.storage.getSessionRelays();
    const initialLength = sessionRelays.length;
    const filtered = sessionRelays.filter((r) => r.identityId !== identityId.value);
    const deletedCount = initialLength - filtered.length;

    if (deletedCount === 0) {
      return 0;
    }

    this.storage.setSessionRelays(filtered);
    await this.storage.saveSessionData();

    // Remove from sync storage
    const encryptedIdentityId = await this.encryption.encryptString(identityId.value);
    const syncRelays = this.storage.getSyncRelays();
    const filteredSync = syncRelays.filter((r) => r.identityId !== encryptedIdentityId);
    await this.storage.saveSyncRelays(filteredSync);

    return deletedCount;
  }

  async count(query?: RelayQuery): Promise<number> {
    if (query) {
      const results = await this.find(query);
      return results.length;
    }
    return this.storage.getSessionRelays().length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async encryptRelay(relay: RelaySnapshot): Promise<EncryptedRelay> {
    return {
      id: await this.encryption.encryptString(relay.id),
      identityId: await this.encryption.encryptString(relay.identityId),
      url: await this.encryption.encryptString(relay.url),
      read: await this.encryption.encryptBoolean(relay.read),
      write: await this.encryption.encryptBoolean(relay.write),
    };
  }
}

/**
 * Factory function to create a BrowserRelayRepository.
 */
export function createRelayRepository(
  storage: RelayStorageAdapter,
  encryption: EncryptionService
): RelayRepository {
  return new BrowserRelayRepository(storage, encryption);
}
