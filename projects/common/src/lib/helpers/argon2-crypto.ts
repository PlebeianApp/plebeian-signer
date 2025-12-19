/**
 * Secure vault encryption/decryption using Argon2id + AES-GCM
 *
 * - Argon2id key derivation with ~3 second computation time
 * - AES-256-GCM authenticated encryption
 * - Random 32-byte salt per vault
 * - Random 12-byte IV per encryption
 *
 * Note: Uses main thread for Argon2id (via WebAssembly) because Web Workers
 * in browser extensions cannot load external scripts due to CSP restrictions.
 * The deriving modal provides user feedback during the ~3 second derivation.
 */

import { argon2id } from 'hash-wasm';
import { Buffer } from 'buffer';

// Argon2id parameters tuned for ~3 second derivation on typical hardware
const ARGON2_CONFIG = {
  parallelism: 4, // 4 threads
  iterations: 8, // Time cost
  memorySize: 262144, // 256 MB memory
  hashLength: 32, // 256-bit key for AES-256
  outputType: 'binary' as const,
};

/**
 * Derive an encryption key from password using Argon2id
 * @param password - User's password
 * @param salt - Random 32-byte salt
 * @returns 32-byte derived key
 */
export async function deriveKeyArgon2(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  // Use hash-wasm's argon2id (WebAssembly-based, runs on main thread)
  // This blocks the UI for ~3 seconds, which is why we show a modal
  const result = await argon2id({
    password: password,
    salt: salt,
    ...ARGON2_CONFIG,
  });
  return result;
}

/**
 * Generate a random salt for Argon2id
 * @returns Base64 encoded 32-byte salt
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(salt).toString('base64');
}

/**
 * Generate a random IV for AES-GCM
 * @returns Base64 encoded 12-byte IV
 */
export function generateIV(): string {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return Buffer.from(iv).toString('base64');
}

/**
 * Encrypt data using Argon2id-derived key + AES-256-GCM
 * @param plaintext - Data to encrypt
 * @param password - User's password
 * @param saltBase64 - Base64 encoded 32-byte salt
 * @param ivBase64 - Base64 encoded 12-byte IV
 * @returns Base64 encoded ciphertext
 */
export async function encryptWithArgon2(
  plaintext: string,
  password: string,
  saltBase64: string,
  ivBase64: string
): Promise<string> {
  const salt = Buffer.from(saltBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  // Derive key using Argon2id (~3 seconds, in worker)
  const keyBytes = await deriveKeyArgon2(password, salt);

  // Import key for AES-GCM
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Encrypt the data
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(plaintext)
  );

  return Buffer.from(encrypted).toString('base64');
}

/**
 * Decrypt data using Argon2id-derived key + AES-256-GCM
 * @param ciphertextBase64 - Base64 encoded ciphertext
 * @param password - User's password
 * @param saltBase64 - Base64 encoded 32-byte salt
 * @param ivBase64 - Base64 encoded 12-byte IV
 * @returns Decrypted plaintext
 * @throws Error if password is wrong or data is corrupted
 */
export async function decryptWithArgon2(
  ciphertextBase64: string,
  password: string,
  saltBase64: string,
  ivBase64: string
): Promise<string> {
  const salt = Buffer.from(saltBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');

  // Derive key using Argon2id (~3 seconds, in worker)
  const keyBytes = await deriveKeyArgon2(password, salt);

  // Import key for AES-GCM
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt
  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Decryption failed - invalid password or corrupted data');
  }

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

