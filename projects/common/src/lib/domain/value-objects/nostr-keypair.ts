import { bech32 } from '@scure/base';
import * as utils from '@noble/curves/abstract/utils';
import { getPublicKey, generateSecretKey } from 'nostr-tools';

/**
 * Value object encapsulating a Nostr keypair.
 * Provides type-safe access to public key operations while protecting the private key.
 *
 * The private key is never exposed directly - all operations that need it
 * are performed through methods on this class.
 */
export class NostrKeyPair {
  private readonly _privateKeyHex: string;
  private readonly _publicKeyHex: string;

  private constructor(privateKeyHex: string, publicKeyHex: string) {
    this._privateKeyHex = privateKeyHex;
    this._publicKeyHex = publicKeyHex;
  }

  /**
   * Generate a new random keypair.
   */
  static generate(): NostrKeyPair {
    const privateKeyBytes = generateSecretKey();
    const privateKeyHex = utils.bytesToHex(privateKeyBytes);
    const publicKeyHex = getPublicKey(privateKeyBytes);
    return new NostrKeyPair(privateKeyHex, publicKeyHex);
  }

  /**
   * Create a keypair from an existing private key.
   * Accepts either hex or nsec format.
   *
   * @throws InvalidNostrKeyError if the key is invalid
   */
  static fromPrivateKey(privateKey: string): NostrKeyPair {
    try {
      const hex = NostrKeyPair.normalizeToHex(privateKey);
      NostrKeyPair.validateHexKey(hex);
      const publicKeyHex = NostrKeyPair.derivePublicKey(hex);
      return new NostrKeyPair(hex, publicKeyHex);
    } catch (error) {
      throw new InvalidNostrKeyError(
        `Invalid private key: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  /**
   * Reconstitute a keypair from storage.
   * Assumes the stored hex is valid (from trusted source).
   */
  static fromStorage(privateKeyHex: string): NostrKeyPair {
    const publicKeyHex = NostrKeyPair.derivePublicKey(privateKeyHex);
    return new NostrKeyPair(privateKeyHex, publicKeyHex);
  }

  /**
   * Get the public key in hex format.
   */
  get publicKeyHex(): string {
    return this._publicKeyHex;
  }

  /**
   * Get the public key in npub (bech32) format.
   */
  get npub(): string {
    const data = utils.hexToBytes(this._publicKeyHex);
    const words = bech32.toWords(data);
    return bech32.encode('npub', words, 5000);
  }

  /**
   * Get the private key in nsec (bech32) format.
   * Use with caution - only for display/export purposes.
   */
  get nsec(): string {
    const data = utils.hexToBytes(this._privateKeyHex);
    const words = bech32.toWords(data);
    return bech32.encode('nsec', words, 5000);
  }

  /**
   * Get the private key bytes for cryptographic operations.
   * Internal use only - required for signing and encryption.
   */
  getPrivateKeyBytes(): Uint8Array {
    return utils.hexToBytes(this._privateKeyHex);
  }

  /**
   * Get the private key hex for storage.
   * This should only be used when persisting to encrypted storage.
   */
  toStorageHex(): string {
    return this._privateKeyHex;
  }

  /**
   * Check if this keypair has the same public key as another.
   */
  hasSamePublicKey(other: NostrKeyPair): boolean {
    return this._publicKeyHex === other._publicKeyHex;
  }

  /**
   * Check if this keypair matches a given public key.
   */
  matchesPublicKey(publicKeyHex: string): boolean {
    return this._publicKeyHex === publicKeyHex;
  }

  /**
   * Value equality based on public key.
   * Two keypairs are equal if they represent the same identity.
   */
  equals(other: NostrKeyPair): boolean {
    return this._publicKeyHex === other._publicKeyHex;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private static normalizeToHex(privateKey: string): string {
    if (privateKey.startsWith('nsec')) {
      return NostrKeyPair.nsecToHex(privateKey);
    }
    return privateKey;
  }

  private static nsecToHex(nsec: string): string {
    const { prefix, words } = bech32.decode(nsec as `${string}1${string}`, 5000);
    if (prefix !== 'nsec') {
      throw new Error('Invalid nsec prefix');
    }
    const data = new Uint8Array(bech32.fromWords(words));
    return utils.bytesToHex(data);
  }

  private static validateHexKey(hex: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('Private key must be 64 hex characters');
    }
  }

  private static derivePublicKey(privateKeyHex: string): string {
    const privateKeyBytes = utils.hexToBytes(privateKeyHex);
    return getPublicKey(privateKeyBytes);
  }
}

/**
 * Error thrown when a Nostr key is invalid.
 */
export class InvalidNostrKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNostrKeyError';
  }
}

/**
 * Utility functions for public key operations (no private key needed).
 */
export class NostrPublicKey {
  private constructor(private readonly _hex: string) {}

  /**
   * Create from hex or npub format.
   */
  static from(publicKey: string): NostrPublicKey {
    if (publicKey.startsWith('npub')) {
      const hex = NostrPublicKey.npubToHex(publicKey);
      return new NostrPublicKey(hex);
    }
    NostrPublicKey.validateHex(publicKey);
    return new NostrPublicKey(publicKey);
  }

  get hex(): string {
    return this._hex;
  }

  get npub(): string {
    const data = utils.hexToBytes(this._hex);
    const words = bech32.toWords(data);
    return bech32.encode('npub', words, 5000);
  }

  /**
   * Get a shortened display version of the public key.
   */
  shortened(prefixLength = 8, suffixLength = 4): string {
    const npub = this.npub;
    return `${npub.slice(0, prefixLength)}...${npub.slice(-suffixLength)}`;
  }

  equals(other: NostrPublicKey): boolean {
    return this._hex === other._hex;
  }

  toString(): string {
    return this._hex;
  }

  private static npubToHex(npub: string): string {
    const { prefix, words } = bech32.decode(npub as `${string}1${string}`, 5000);
    if (prefix !== 'npub') {
      throw new InvalidNostrKeyError('Invalid npub prefix');
    }
    const data = new Uint8Array(bech32.fromWords(words));
    return utils.bytesToHex(data);
  }

  private static validateHex(hex: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new InvalidNostrKeyError('Public key must be 64 hex characters');
    }
  }
}
