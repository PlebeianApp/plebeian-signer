import { Buffer } from 'buffer';
import { CryptoHelper } from '../../helpers/crypto-helper';
import {
  EncryptionContext,
  isV2Context,
} from './encryption-context';

/**
 * Service responsible for encrypting and decrypting data.
 * Abstracts away vault version differences (v1 PBKDF2 vs v2 Argon2id).
 *
 * This is an infrastructure service - it knows nothing about domain concepts,
 * only about cryptographic operations.
 */
export class EncryptionService {
  constructor(private readonly context: EncryptionContext) {}

  /**
   * Encrypt a string value.
   */
  async encryptString(value: string): Promise<string> {
    if (isV2Context(this.context)) {
      return this.encryptWithKeyV2(value);
    }
    return CryptoHelper.encrypt(value, this.context.iv, this.context.password);
  }

  /**
   * Encrypt a number value (converts to string first).
   */
  async encryptNumber(value: number): Promise<string> {
    return this.encryptString(value.toString());
  }

  /**
   * Encrypt a boolean value (converts to string first).
   */
  async encryptBoolean(value: boolean): Promise<string> {
    return this.encryptString(value.toString());
  }

  /**
   * Decrypt a value to string.
   */
  async decryptString(encrypted: string): Promise<string> {
    if (isV2Context(this.context)) {
      return this.decryptWithKeyV2(encrypted);
    }
    return CryptoHelper.decrypt(encrypted, this.context.iv, this.context.password);
  }

  /**
   * Decrypt a value to number.
   */
  async decryptNumber(encrypted: string): Promise<number> {
    const decrypted = await this.decryptString(encrypted);
    return parseInt(decrypted, 10);
  }

  /**
   * Decrypt a value to boolean.
   */
  async decryptBoolean(encrypted: string): Promise<boolean> {
    const decrypted = await this.decryptString(encrypted);
    return decrypted === 'true';
  }

  /**
   * Get the encryption context (for serialization or passing to other services).
   */
  getContext(): EncryptionContext {
    return this.context;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // V2 encryption/decryption using pre-derived Argon2id key
  // ─────────────────────────────────────────────────────────────────────────

  private async encryptWithKeyV2(text: string): Promise<string> {
    if (!isV2Context(this.context)) {
      throw new Error('V2 encryption requires keyBase64');
    }

    const keyBytes = Buffer.from(this.context.keyBase64, 'base64');
    const iv = Buffer.from(this.context.iv, 'base64');

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const cipherText = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(text)
    );

    return Buffer.from(cipherText).toString('base64');
  }

  private async decryptWithKeyV2(encryptedBase64: string): Promise<string> {
    if (!isV2Context(this.context)) {
      throw new Error('V2 decryption requires keyBase64');
    }

    const keyBytes = Buffer.from(this.context.keyBase64, 'base64');
    const iv = Buffer.from(this.context.iv, 'base64');
    const cipherText = Buffer.from(encryptedBase64, 'base64');

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherText
    );

    return new TextDecoder().decode(decrypted);
  }
}

/**
 * Factory function to create an EncryptionService from session data.
 */
export function createEncryptionService(params: {
  iv: string;
  vaultPassword?: string;
  vaultKey?: string;
}): EncryptionService {
  if (params.vaultKey) {
    return new EncryptionService({
      version: 2,
      iv: params.iv,
      keyBase64: params.vaultKey,
    });
  }

  if (params.vaultPassword) {
    return new EncryptionService({
      version: 1,
      iv: params.iv,
      password: params.vaultPassword,
    });
  }

  throw new Error('Either vaultPassword or vaultKey must be provided');
}
