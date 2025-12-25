import { IdentityId, RelayId } from '../value-objects';
import type { RelaySnapshot } from '../repositories/relay-repository';

/**
 * Relay entity - represents a Nostr relay configuration for an identity.
 */
export class Relay {
  private readonly _id: RelayId;
  private readonly _identityId: IdentityId;
  private _url: string;
  private _read: boolean;
  private _write: boolean;

  private constructor(
    id: RelayId,
    identityId: IdentityId,
    url: string,
    read: boolean,
    write: boolean
  ) {
    this._id = id;
    this._identityId = identityId;
    this._url = Relay.normalizeUrl(url);
    this._read = read;
    this._write = write;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factory Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new relay configuration.
   *
   * @param identityId - The identity this relay belongs to
   * @param url - The relay WebSocket URL
   * @param read - Whether to read events from this relay
   * @param write - Whether to write events to this relay
   */
  static create(
    identityId: IdentityId,
    url: string,
    read = true,
    write = true
  ): Relay {
    Relay.validateUrl(url);

    return new Relay(
      RelayId.generate(),
      identityId,
      url,
      read,
      write
    );
  }

  /**
   * Reconstitute a relay from storage.
   */
  static fromSnapshot(snapshot: RelaySnapshot): Relay {
    return new Relay(
      RelayId.from(snapshot.id),
      IdentityId.from(snapshot.identityId),
      snapshot.url,
      snapshot.read,
      snapshot.write
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────────────

  get id(): RelayId {
    return this._id;
  }

  get identityId(): IdentityId {
    return this._identityId;
  }

  get url(): string {
    return this._url;
  }

  get read(): boolean {
    return this._read;
  }

  get write(): boolean {
    return this._write;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update the relay URL.
   */
  updateUrl(newUrl: string): void {
    Relay.validateUrl(newUrl);
    this._url = Relay.normalizeUrl(newUrl);
  }

  /**
   * Enable reading from this relay.
   */
  enableRead(): void {
    this._read = true;
  }

  /**
   * Disable reading from this relay.
   */
  disableRead(): void {
    this._read = false;
  }

  /**
   * Enable writing to this relay.
   */
  enableWrite(): void {
    this._write = true;
  }

  /**
   * Disable writing to this relay.
   */
  disableWrite(): void {
    this._write = false;
  }

  /**
   * Set both read and write permissions.
   */
  setPermissions(read: boolean, write: boolean): void {
    this._read = read;
    this._write = write;
  }

  /**
   * Check if this relay is enabled for either read or write.
   */
  isEnabled(): boolean {
    return this._read || this._write;
  }

  /**
   * Check if this relay has the same URL as another (case-insensitive).
   */
  hasSameUrl(url: string): boolean {
    return this._url.toLowerCase() === Relay.normalizeUrl(url).toLowerCase();
  }

  /**
   * Check if this relay belongs to a specific identity.
   */
  belongsTo(identityId: IdentityId): boolean {
    return this._identityId.equals(identityId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert to a snapshot for persistence.
   */
  toSnapshot(): RelaySnapshot {
    return {
      id: this._id.value,
      identityId: this._identityId.value,
      url: this._url,
      read: this._read,
      write: this._write,
    };
  }

  /**
   * Create a clone for modification without affecting the original.
   */
  clone(): Relay {
    return new Relay(
      this._id,
      this._identityId,
      this._url,
      this._read,
      this._write
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Equality
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check equality based on relay ID.
   */
  equals(other: Relay): boolean {
    return this._id.equals(other._id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private static normalizeUrl(url: string): string {
    let normalized = url.trim();
    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  private static validateUrl(url: string): void {
    const normalized = Relay.normalizeUrl(url);

    if (!normalized) {
      throw new InvalidRelayUrlError('Relay URL cannot be empty');
    }

    // Must start with wss:// or ws://
    if (!normalized.startsWith('wss://') && !normalized.startsWith('ws://')) {
      throw new InvalidRelayUrlError(
        'Relay URL must start with wss:// or ws://'
      );
    }

    // Try to parse as URL
    try {
      new URL(normalized);
    } catch {
      throw new InvalidRelayUrlError(`Invalid relay URL: ${url}`);
    }
  }
}

/**
 * Error thrown when a relay URL is invalid.
 */
export class InvalidRelayUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRelayUrlError';
  }
}

/**
 * Helper to convert relay list to NIP-65 format.
 */
export function toNip65RelayList(
  relays: Relay[]
): Record<string, { read: boolean; write: boolean }> {
  const result: Record<string, { read: boolean; write: boolean }> = {};

  for (const relay of relays) {
    if (relay.isEnabled()) {
      result[relay.url] = {
        read: relay.read,
        write: relay.write,
      };
    }
  }

  return result;
}
