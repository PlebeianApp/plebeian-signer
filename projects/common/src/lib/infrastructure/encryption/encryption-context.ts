/**
 * Context containing the cryptographic parameters needed for encryption/decryption.
 * This abstracts away the vault version differences (v1 PBKDF2 vs v2 Argon2id).
 */
export type EncryptionContext =
  | EncryptionContextV1
  | EncryptionContextV2;

/**
 * v1: PBKDF2-derived key from password
 */
export interface EncryptionContextV1 {
  version: 1;
  iv: string;
  password: string;
}

/**
 * v2: Pre-derived Argon2id key
 */
export interface EncryptionContextV2 {
  version: 2;
  iv: string;
  keyBase64: string;
}

/**
 * Type guard for v1 context
 */
export function isV1Context(ctx: EncryptionContext): ctx is EncryptionContextV1 {
  return ctx.version === 1;
}

/**
 * Type guard for v2 context
 */
export function isV2Context(ctx: EncryptionContext): ctx is EncryptionContextV2 {
  return ctx.version === 2;
}

/**
 * Create an encryption context from session data.
 * Returns undefined if no valid context can be created.
 */
export function createEncryptionContext(params: {
  iv: string;
  vaultPassword?: string;
  vaultKey?: string;
}): EncryptionContext | undefined {
  if (params.vaultKey) {
    return {
      version: 2,
      iv: params.iv,
      keyBase64: params.vaultKey,
    };
  }

  if (params.vaultPassword) {
    return {
      version: 1,
      iv: params.iv,
      password: params.vaultPassword,
    };
  }

  return undefined;
}
