import { IdentityId, PermissionId } from '../value-objects';
import type { ExtensionMethod, Nip07MethodPolicy } from '../../models/nostr';

// Re-export types from models for convenience
// These are the canonical definitions used throughout the app
export type { ExtensionMethod, Nip07MethodPolicy as PermissionPolicy } from '../../models/nostr';

// Local type alias for cleaner code
type PermissionPolicy = Nip07MethodPolicy;

/**
 * Snapshot of a permission for persistence.
 */
export interface PermissionSnapshot {
  id: string;
  identityId: string;
  host: string;
  method: ExtensionMethod;
  methodPolicy: PermissionPolicy;
  kind?: number; // For signEvent, filter by event kind
}

/**
 * Query criteria for finding permissions.
 */
export interface PermissionQuery {
  identityId?: IdentityId;
  host?: string;
  method?: ExtensionMethod;
  kind?: number;
}

/**
 * Repository interface for Permission aggregate.
 */
export interface PermissionRepository {
  /**
   * Find a permission by its ID.
   */
  findById(id: PermissionId): Promise<PermissionSnapshot | undefined>;

  /**
   * Find permissions matching the query criteria.
   */
  find(query: PermissionQuery): Promise<PermissionSnapshot[]>;

  /**
   * Find a specific permission for an identity, host, method, and optionally kind.
   * This is the most common lookup for checking if an action is allowed.
   */
  findExact(
    identityId: IdentityId,
    host: string,
    method: ExtensionMethod,
    kind?: number
  ): Promise<PermissionSnapshot | undefined>;

  /**
   * Get all permissions for an identity.
   */
  findByIdentity(identityId: IdentityId): Promise<PermissionSnapshot[]>;

  /**
   * Get all permissions.
   */
  findAll(): Promise<PermissionSnapshot[]>;

  /**
   * Save a new or updated permission.
   */
  save(permission: PermissionSnapshot): Promise<void>;

  /**
   * Delete a permission by its ID.
   */
  delete(id: PermissionId): Promise<boolean>;

  /**
   * Delete all permissions for an identity.
   * Used when deleting an identity (cascade delete).
   */
  deleteByIdentity(identityId: IdentityId): Promise<number>;

  /**
   * Count permissions matching the query.
   */
  count(query?: PermissionQuery): Promise<number>;
}

/**
 * Error thrown when a permission operation fails.
 */
export class PermissionRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: PermissionErrorCode
  ) {
    super(message);
    this.name = 'PermissionRepositoryError';
  }
}

export enum PermissionErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  STORAGE_FAILED = 'STORAGE_FAILED',
}
