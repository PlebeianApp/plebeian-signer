import { IdentityId, RelayId } from '../value-objects';

/**
 * Snapshot of a relay for persistence.
 */
export interface RelaySnapshot {
  id: string;
  identityId: string;
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * Query criteria for finding relays.
 */
export interface RelayQuery {
  identityId?: IdentityId;
  url?: string;
  read?: boolean;
  write?: boolean;
}

/**
 * Repository interface for Relay aggregate.
 */
export interface RelayRepository {
  /**
   * Find a relay by its ID.
   */
  findById(id: RelayId): Promise<RelaySnapshot | undefined>;

  /**
   * Find relays matching the query criteria.
   */
  find(query: RelayQuery): Promise<RelaySnapshot[]>;

  /**
   * Find a relay by URL for a specific identity.
   * Used for duplicate detection.
   */
  findByUrl(identityId: IdentityId, url: string): Promise<RelaySnapshot | undefined>;

  /**
   * Get all relays for an identity.
   */
  findByIdentity(identityId: IdentityId): Promise<RelaySnapshot[]>;

  /**
   * Get all relays.
   */
  findAll(): Promise<RelaySnapshot[]>;

  /**
   * Save a new or updated relay.
   */
  save(relay: RelaySnapshot): Promise<void>;

  /**
   * Delete a relay by its ID.
   */
  delete(id: RelayId): Promise<boolean>;

  /**
   * Delete all relays for an identity.
   * Used when deleting an identity (cascade delete).
   */
  deleteByIdentity(identityId: IdentityId): Promise<number>;

  /**
   * Count relays matching the query.
   */
  count(query?: RelayQuery): Promise<number>;
}

/**
 * Error thrown when a relay operation fails.
 */
export class RelayRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: RelayErrorCode
  ) {
    super(message);
    this.name = 'RelayRepositoryError';
  }
}

export enum RelayErrorCode {
  DUPLICATE_URL = 'DUPLICATE_URL',
  NOT_FOUND = 'NOT_FOUND',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  STORAGE_FAILED = 'STORAGE_FAILED',
}
