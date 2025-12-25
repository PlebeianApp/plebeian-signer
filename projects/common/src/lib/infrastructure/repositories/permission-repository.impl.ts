import type {
  PermissionRepository,
  PermissionSnapshot,
  PermissionQuery,
  ExtensionMethod,
} from '../../domain/repositories/permission-repository';
import { IdentityId, PermissionId } from '../../domain/value-objects';
import { EncryptionService } from '../encryption';

/**
 * Encrypted permission as stored in browser sync storage.
 */
interface EncryptedPermission {
  id: string;
  identityId: string;
  host: string;
  method: string;
  methodPolicy: string;
  kind?: string;
}

/**
 * Storage adapter interface for permissions.
 */
export interface PermissionStorageAdapter {
  // Session (in-memory, decrypted) operations
  getSessionPermissions(): PermissionSnapshot[];
  setSessionPermissions(permissions: PermissionSnapshot[]): void;
  saveSessionData(): Promise<void>;

  // Sync (persistent, encrypted) operations
  getSyncPermissions(): EncryptedPermission[];
  saveSyncPermissions(permissions: EncryptedPermission[]): Promise<void>;
}

/**
 * Implementation of PermissionRepository using browser storage.
 */
export class BrowserPermissionRepository implements PermissionRepository {
  constructor(
    private readonly storage: PermissionStorageAdapter,
    private readonly encryption: EncryptionService
  ) {}

  async findById(id: PermissionId): Promise<PermissionSnapshot | undefined> {
    const permissions = this.storage.getSessionPermissions();
    return permissions.find((p) => p.id === id.value);
  }

  async find(query: PermissionQuery): Promise<PermissionSnapshot[]> {
    let permissions = this.storage.getSessionPermissions();

    if (query.identityId) {
      const identityIdValue = query.identityId.value;
      permissions = permissions.filter((p) => p.identityId === identityIdValue);
    }
    if (query.host) {
      const host = query.host;
      permissions = permissions.filter((p) => p.host === host);
    }
    if (query.method) {
      const method = query.method;
      permissions = permissions.filter((p) => p.method === method);
    }
    if (query.kind !== undefined) {
      const kind = query.kind;
      permissions = permissions.filter((p) => p.kind === kind);
    }

    return permissions;
  }

  async findExact(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    kind?: number
  ): Promise<PermissionSnapshot | undefined> {
    const permissions = this.storage.getSessionPermissions();
    return permissions.find(
      (p) =>
        p.identityId === identityId.value &&
        p.host === host &&
        p.method === method &&
        (kind === undefined ? p.kind === undefined : p.kind === kind)
    );
  }

  async findByIdentity(identityId: IdentityId): Promise<PermissionSnapshot[]> {
    const permissions = this.storage.getSessionPermissions();
    return permissions.filter((p) => p.identityId === identityId.value);
  }

  async findAll(): Promise<PermissionSnapshot[]> {
    return this.storage.getSessionPermissions();
  }

  async save(permission: PermissionSnapshot): Promise<void> {
    const sessionPermissions = this.storage.getSessionPermissions();
    const existingIndex = sessionPermissions.findIndex((p) => p.id === permission.id);

    if (existingIndex >= 0) {
      sessionPermissions[existingIndex] = permission;
    } else {
      sessionPermissions.push(permission);
    }

    this.storage.setSessionPermissions(sessionPermissions);
    await this.storage.saveSessionData();

    // Encrypt and save to sync storage
    const encryptedPermission = await this.encryptPermission(permission);
    const syncPermissions = this.storage.getSyncPermissions();

    // Find by decrypting IDs (expensive but necessary for updates)
    let syncIndex = -1;
    for (let i = 0; i < syncPermissions.length; i++) {
      try {
        const decryptedId = await this.encryption.decryptString(syncPermissions[i].id);
        if (decryptedId === permission.id) {
          syncIndex = i;
          break;
        }
      } catch {
        // Skip corrupted entries
      }
    }

    if (syncIndex >= 0) {
      syncPermissions[syncIndex] = encryptedPermission;
    } else {
      syncPermissions.push(encryptedPermission);
    }

    await this.storage.saveSyncPermissions(syncPermissions);
  }

  async delete(id: PermissionId): Promise<boolean> {
    const sessionPermissions = this.storage.getSessionPermissions();
    const initialLength = sessionPermissions.length;
    const filtered = sessionPermissions.filter((p) => p.id !== id.value);

    if (filtered.length === initialLength) {
      return false;
    }

    this.storage.setSessionPermissions(filtered);
    await this.storage.saveSessionData();

    // Remove from sync storage
    const encryptedId = await this.encryption.encryptString(id.value);
    const syncPermissions = this.storage.getSyncPermissions();
    const filteredSync = syncPermissions.filter((p) => p.id !== encryptedId);
    await this.storage.saveSyncPermissions(filteredSync);

    return true;
  }

  async deleteByIdentity(identityId: IdentityId): Promise<number> {
    const sessionPermissions = this.storage.getSessionPermissions();
    const initialLength = sessionPermissions.length;
    const filtered = sessionPermissions.filter((p) => p.identityId !== identityId.value);
    const deletedCount = initialLength - filtered.length;

    if (deletedCount === 0) {
      return 0;
    }

    this.storage.setSessionPermissions(filtered);
    await this.storage.saveSessionData();

    // Remove from sync storage
    const encryptedIdentityId = await this.encryption.encryptString(identityId.value);
    const syncPermissions = this.storage.getSyncPermissions();
    const filteredSync = syncPermissions.filter((p) => p.identityId !== encryptedIdentityId);
    await this.storage.saveSyncPermissions(filteredSync);

    return deletedCount;
  }

  async count(query?: PermissionQuery): Promise<number> {
    if (query) {
      const results = await this.find(query);
      return results.length;
    }
    return this.storage.getSessionPermissions().length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async encryptPermission(permission: PermissionSnapshot): Promise<EncryptedPermission> {
    const encrypted: EncryptedPermission = {
      id: await this.encryption.encryptString(permission.id),
      identityId: await this.encryption.encryptString(permission.identityId),
      host: await this.encryption.encryptString(permission.host),
      method: await this.encryption.encryptString(permission.method),
      methodPolicy: await this.encryption.encryptString(permission.methodPolicy),
    };

    if (permission.kind !== undefined) {
      encrypted.kind = await this.encryption.encryptNumber(permission.kind);
    }

    return encrypted;
  }
}

/**
 * Factory function to create a BrowserPermissionRepository.
 */
export function createPermissionRepository(
  storage: PermissionStorageAdapter,
  encryption: EncryptionService
): PermissionRepository {
  return new BrowserPermissionRepository(storage, encryption);
}
