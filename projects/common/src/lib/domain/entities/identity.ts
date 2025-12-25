import { AggregateRoot } from '../events/domain-event';
import { IdentityCreated, IdentityRenamed, IdentitySigned } from '../events/identity-events';
import {
  IdentityId,
  Nickname,
  NostrKeyPair,
} from '../value-objects';
import type { IdentitySnapshot } from '../repositories/identity-repository';

/**
 * Represents an unsigned Nostr event template.
 * This is what gets passed to the sign method.
 */
export interface UnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

/**
 * Represents a signed Nostr event.
 */
export interface SignedEvent extends UnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}

/**
 * Signing function type - injected to avoid coupling to nostr-tools.
 */
export type SigningFunction = (event: UnsignedEvent, privateKeyBytes: Uint8Array) => SignedEvent;

/**
 * Encryption function types for NIP-04 and NIP-44.
 */
export type EncryptFunction = (
  privateKeyBytes: Uint8Array,
  peerPubkey: string,
  plaintext: string
) => Promise<string>;

export type DecryptFunction = (
  privateKeyBytes: Uint8Array,
  peerPubkey: string,
  ciphertext: string
) => Promise<string>;

/**
 * Identity entity - represents a Nostr identity with its keypair.
 *
 * This is an aggregate root that encapsulates all operations
 * related to a single Nostr identity.
 */
export class Identity extends AggregateRoot {
  private readonly _id: IdentityId;
  private _nickname: Nickname;
  private readonly _keyPair: NostrKeyPair;
  private readonly _createdAt: Date;

  private constructor(
    id: IdentityId,
    nickname: Nickname,
    keyPair: NostrKeyPair,
    createdAt: Date
  ) {
    super();
    this._id = id;
    this._nickname = nickname;
    this._keyPair = keyPair;
    this._createdAt = createdAt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factory Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new identity with an optional private key.
   * If no private key is provided, a new one will be generated.
   *
   * @param nickname - User-friendly name for this identity
   * @param privateKey - Optional private key (hex or nsec format)
   * @throws InvalidNicknameError if nickname is invalid
   * @throws InvalidNostrKeyError if private key is invalid
   */
  static create(nickname: string, privateKey?: string): Identity {
    const keyPair = privateKey
      ? NostrKeyPair.fromPrivateKey(privateKey)
      : NostrKeyPair.generate();

    const identity = new Identity(
      IdentityId.generate(),
      Nickname.create(nickname),
      keyPair,
      new Date()
    );

    identity.addDomainEvent(
      new IdentityCreated(
        identity._id.value,
        identity.publicKey,
        identity.nickname
      )
    );

    return identity;
  }

  /**
   * Reconstitute an identity from storage.
   * This bypasses validation since data comes from trusted storage.
   */
  static fromSnapshot(snapshot: IdentitySnapshot): Identity {
    return new Identity(
      IdentityId.from(snapshot.id),
      Nickname.fromStorage(snapshot.nick),
      NostrKeyPair.fromStorage(snapshot.privkey),
      new Date(snapshot.createdAt)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Getters (Read-only access to state)
  // ─────────────────────────────────────────────────────────────────────────

  get id(): IdentityId {
    return this._id;
  }

  get nickname(): string {
    return this._nickname.value;
  }

  get publicKey(): string {
    return this._keyPair.publicKeyHex;
  }

  get npub(): string {
    return this._keyPair.npub;
  }

  get nsec(): string {
    return this._keyPair.nsec;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Rename this identity.
   *
   * @param newNickname - The new nickname
   * @throws InvalidNicknameError if nickname is invalid
   */
  rename(newNickname: string): void {
    const oldNickname = this._nickname.value;
    this._nickname = Nickname.create(newNickname);

    this.addDomainEvent(
      new IdentityRenamed(this._id.value, oldNickname, newNickname)
    );
  }

  /**
   * Sign a Nostr event with this identity's private key.
   *
   * @param event - The unsigned event template
   * @param signFn - The signing function (injected to avoid coupling)
   * @returns The signed event with id, pubkey, and sig
   */
  sign(event: UnsignedEvent, signFn: SigningFunction): SignedEvent {
    const signedEvent = signFn(event, this._keyPair.getPrivateKeyBytes());

    this.addDomainEvent(
      new IdentitySigned(this._id.value, event.kind, signedEvent.id)
    );

    return signedEvent;
  }

  /**
   * Encrypt a message using NIP-04 encryption.
   *
   * @param plaintext - The message to encrypt
   * @param recipientPubkey - The recipient's public key (hex)
   * @param encryptFn - The NIP-04 encryption function
   */
  async encryptNip04(
    plaintext: string,
    recipientPubkey: string,
    encryptFn: EncryptFunction
  ): Promise<string> {
    return encryptFn(
      this._keyPair.getPrivateKeyBytes(),
      recipientPubkey,
      plaintext
    );
  }

  /**
   * Decrypt a message using NIP-04 decryption.
   *
   * @param ciphertext - The encrypted message
   * @param senderPubkey - The sender's public key (hex)
   * @param decryptFn - The NIP-04 decryption function
   */
  async decryptNip04(
    ciphertext: string,
    senderPubkey: string,
    decryptFn: DecryptFunction
  ): Promise<string> {
    return decryptFn(
      this._keyPair.getPrivateKeyBytes(),
      senderPubkey,
      ciphertext
    );
  }

  /**
   * Encrypt a message using NIP-44 encryption.
   *
   * @param plaintext - The message to encrypt
   * @param recipientPubkey - The recipient's public key (hex)
   * @param encryptFn - The NIP-44 encryption function
   */
  async encryptNip44(
    plaintext: string,
    recipientPubkey: string,
    encryptFn: EncryptFunction
  ): Promise<string> {
    return encryptFn(
      this._keyPair.getPrivateKeyBytes(),
      recipientPubkey,
      plaintext
    );
  }

  /**
   * Decrypt a message using NIP-44 decryption.
   *
   * @param ciphertext - The encrypted message
   * @param senderPubkey - The sender's public key (hex)
   * @param decryptFn - The NIP-44 decryption function
   */
  async decryptNip44(
    ciphertext: string,
    senderPubkey: string,
    decryptFn: DecryptFunction
  ): Promise<string> {
    return decryptFn(
      this._keyPair.getPrivateKeyBytes(),
      senderPubkey,
      ciphertext
    );
  }

  /**
   * Check if this identity has the same private key as another.
   * Used for duplicate detection.
   */
  hasSameKeyAs(other: Identity): boolean {
    return this._keyPair.hasSamePublicKey(other._keyPair);
  }

  /**
   * Check if this identity matches a given public key.
   */
  matchesPublicKey(publicKey: string): boolean {
    return this._keyPair.matchesPublicKey(publicKey);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert to a snapshot for persistence.
   */
  toSnapshot(): IdentitySnapshot {
    return {
      id: this._id.value,
      nick: this._nickname.value,
      privkey: this._keyPair.toStorageHex(),
      createdAt: this._createdAt.toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Equality
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check equality based on identity ID.
   */
  equals(other: Identity): boolean {
    return this._id.equals(other._id);
  }
}
