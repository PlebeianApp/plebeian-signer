import {
  IdentityRepositoryError,
  IdentityErrorCode,
} from '../../domain/repositories/identity-repository';
import type {
  IdentityRepository,
  IdentitySnapshot,
} from '../../domain/repositories/identity-repository';
import { IdentityId } from '../../domain/value-objects';
import { EncryptionService } from '../encryption';
import { NostrHelper } from '../../helpers/nostr-helper';

/**
 * Encrypted identity as stored in browser sync storage.
 */
interface EncryptedIdentity {
  id: string;
  nick: string;
  privkey: string;
  createdAt: string;
}

/**
 * Storage adapter interface - abstracts browser storage operations.
 * Implementations provided by Chrome/Firefox specific code.
 */
export interface IdentityStorageAdapter {
  // Session (in-memory, decrypted) operations
  getSessionIdentities(): IdentitySnapshot[];
  setSessionIdentities(identities: IdentitySnapshot[]): void;
  saveSessionData(): Promise<void>;

  getSessionSelectedId(): string | null;
  setSessionSelectedId(id: string | null): void;

  // Sync (persistent, encrypted) operations
  getSyncIdentities(): EncryptedIdentity[];
  saveSyncIdentities(identities: EncryptedIdentity[]): Promise<void>;

  getSyncSelectedId(): string | null;
  saveSyncSelectedId(id: string | null): Promise<void>;
}

/**
 * Implementation of IdentityRepository using browser storage.
 * Handles encryption/decryption transparently.
 */
export class BrowserIdentityRepository implements IdentityRepository {
  constructor(
    private readonly storage: IdentityStorageAdapter,
    private readonly encryption: EncryptionService
  ) {}

  async findById(id: IdentityId): Promise<IdentitySnapshot | undefined> {
    const identities = this.storage.getSessionIdentities();
    return identities.find((i) => i.id === id.value);
  }

  async findByPublicKey(publicKey: string): Promise<IdentitySnapshot | undefined> {
    const identities = this.storage.getSessionIdentities();
    return identities.find((i) => {
      try {
        const derivedPubkey = NostrHelper.pubkeyFromPrivkey(i.privkey);
        return derivedPubkey === publicKey;
      } catch {
        return false;
      }
    });
  }

  async findByPrivateKey(privateKey: string): Promise<IdentitySnapshot | undefined> {
    // Normalize the private key to hex format
    let privkeyHex: string;
    try {
      privkeyHex = NostrHelper.getNostrPrivkeyObject(privateKey.toLowerCase()).hex;
    } catch {
      return undefined;
    }

    const identities = this.storage.getSessionIdentities();
    return identities.find((i) => i.privkey === privkeyHex);
  }

  async findAll(): Promise<IdentitySnapshot[]> {
    return this.storage.getSessionIdentities();
  }

  async save(identity: IdentitySnapshot): Promise<void> {
    // Check for duplicate private key (excluding self)
    const existing = await this.findByPrivateKey(identity.privkey);
    if (existing && existing.id !== identity.id) {
      throw new IdentityRepositoryError(
        `An identity with the same private key already exists: ${existing.nick}`,
        IdentityErrorCode.DUPLICATE_PRIVATE_KEY
      );
    }

    // Update session storage
    const sessionIdentities = this.storage.getSessionIdentities();
    const existingIndex = sessionIdentities.findIndex((i) => i.id === identity.id);

    if (existingIndex >= 0) {
      // Update existing
      sessionIdentities[existingIndex] = identity;
    } else {
      // Add new
      sessionIdentities.push(identity);

      // Auto-select if first identity
      if (sessionIdentities.length === 1) {
        this.storage.setSessionSelectedId(identity.id);
      }
    }

    this.storage.setSessionIdentities(sessionIdentities);
    await this.storage.saveSessionData();

    // Encrypt and save to sync storage
    const encryptedIdentity = await this.encryptIdentity(identity);
    const syncIdentities = this.storage.getSyncIdentities();
    const syncIndex = syncIdentities.findIndex(
      async (i) => (await this.encryption.decryptString(i.id)) === identity.id
    );

    if (syncIndex >= 0) {
      syncIdentities[syncIndex] = encryptedIdentity;
    } else {
      syncIdentities.push(encryptedIdentity);
    }

    await this.storage.saveSyncIdentities(syncIdentities);

    // Update selected ID in sync if this was the first identity
    if (sessionIdentities.length === 1) {
      const encryptedId = await this.encryption.encryptString(identity.id);
      await this.storage.saveSyncSelectedId(encryptedId);
    }
  }

  async delete(id: IdentityId): Promise<boolean> {
    const sessionIdentities = this.storage.getSessionIdentities();
    const initialLength = sessionIdentities.length;
    const filtered = sessionIdentities.filter((i) => i.id !== id.value);

    if (filtered.length === initialLength) {
      return false; // Nothing was deleted
    }

    // Update selected identity if needed
    const currentSelectedId = this.storage.getSessionSelectedId();
    if (currentSelectedId === id.value) {
      const newSelectedId = filtered.length > 0 ? filtered[0].id : null;
      this.storage.setSessionSelectedId(newSelectedId);
    }

    this.storage.setSessionIdentities(filtered);
    await this.storage.saveSessionData();

    // Remove from sync storage
    const encryptedId = await this.encryption.encryptString(id.value);
    const syncIdentities = this.storage.getSyncIdentities();
    const filteredSync = syncIdentities.filter((i) => i.id !== encryptedId);
    await this.storage.saveSyncIdentities(filteredSync);

    // Update selected ID in sync
    const newSelectedId = this.storage.getSessionSelectedId();
    const encryptedSelectedId = newSelectedId
      ? await this.encryption.encryptString(newSelectedId)
      : null;
    await this.storage.saveSyncSelectedId(encryptedSelectedId);

    return true;
  }

  async getSelectedId(): Promise<IdentityId | null> {
    const selectedId = this.storage.getSessionSelectedId();
    return selectedId ? IdentityId.from(selectedId) : null;
  }

  async setSelectedId(id: IdentityId | null): Promise<void> {
    if (id) {
      // Verify the identity exists
      const exists = await this.findById(id);
      if (!exists) {
        throw new IdentityRepositoryError(
          `Identity not found: ${id.value}`,
          IdentityErrorCode.NOT_FOUND
        );
      }
    }

    this.storage.setSessionSelectedId(id?.value ?? null);
    await this.storage.saveSessionData();

    // Update sync storage
    const encryptedId = id
      ? await this.encryption.encryptString(id.value)
      : null;
    await this.storage.saveSyncSelectedId(encryptedId);
  }

  async count(): Promise<number> {
    return this.storage.getSessionIdentities().length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async encryptIdentity(identity: IdentitySnapshot): Promise<EncryptedIdentity> {
    return {
      id: await this.encryption.encryptString(identity.id),
      nick: await this.encryption.encryptString(identity.nick),
      privkey: await this.encryption.encryptString(identity.privkey),
      createdAt: await this.encryption.encryptString(identity.createdAt),
    };
  }
}

/**
 * Factory function to create a BrowserIdentityRepository.
 */
export function createIdentityRepository(
  storage: IdentityStorageAdapter,
  encryption: EncryptionService
): IdentityRepository {
  return new BrowserIdentityRepository(storage, encryption);
}
