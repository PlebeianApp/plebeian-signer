import { IdentityId } from '../value-objects';

/**
 * Snapshot of an identity for persistence.
 * This is the data structure that gets persisted, separate from the domain entity.
 */
export interface IdentitySnapshot {
  id: string;
  nick: string;
  privkey: string;
  createdAt: string;
}

/**
 * Repository interface for Identity aggregate.
 * Implementations handle encryption and storage specifics.
 */
export interface IdentityRepository {
  /**
   * Find an identity by its ID.
   * Returns undefined if not found.
   */
  findById(id: IdentityId): Promise<IdentitySnapshot | undefined>;

  /**
   * Find an identity by its public key.
   * Returns undefined if not found.
   */
  findByPublicKey(publicKey: string): Promise<IdentitySnapshot | undefined>;

  /**
   * Find an identity by its private key.
   * Used for duplicate detection.
   * Returns undefined if not found.
   */
  findByPrivateKey(privateKey: string): Promise<IdentitySnapshot | undefined>;

  /**
   * Get all identities.
   */
  findAll(): Promise<IdentitySnapshot[]>;

  /**
   * Save a new or updated identity.
   * If an identity with the same ID exists, it will be updated.
   */
  save(identity: IdentitySnapshot): Promise<void>;

  /**
   * Delete an identity by its ID.
   * Returns true if the identity was deleted, false if it didn't exist.
   */
  delete(id: IdentityId): Promise<boolean>;

  /**
   * Get the currently selected identity ID.
   */
  getSelectedId(): Promise<IdentityId | null>;

  /**
   * Set the currently selected identity ID.
   */
  setSelectedId(id: IdentityId | null): Promise<void>;

  /**
   * Count the total number of identities.
   */
  count(): Promise<number>;
}

/**
 * Error thrown when an identity operation fails.
 */
export class IdentityRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: IdentityErrorCode
  ) {
    super(message);
    this.name = 'IdentityRepositoryError';
  }
}

export enum IdentityErrorCode {
  DUPLICATE_PRIVATE_KEY = 'DUPLICATE_PRIVATE_KEY',
  NOT_FOUND = 'NOT_FOUND',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  STORAGE_FAILED = 'STORAGE_FAILED',
}
