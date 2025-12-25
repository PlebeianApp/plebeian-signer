import { NostrKeyPair, InvalidNostrKeyError } from './nostr-keypair';

describe('NostrKeyPair Value Object', () => {
  // Known test vectors
  const TEST_PRIVATE_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('generate', () => {
    it('should generate a valid keypair', () => {
      const keyPair = NostrKeyPair.generate();

      expect(keyPair.publicKeyHex).toBeTruthy();
      expect(keyPair.publicKeyHex.length).toBe(64);
    });

    it('should generate unique keypairs each time', () => {
      const keyPair1 = NostrKeyPair.generate();
      const keyPair2 = NostrKeyPair.generate();

      expect(keyPair1.publicKeyHex).not.toEqual(keyPair2.publicKeyHex);
    });
  });

  describe('fromPrivateKey', () => {
    it('should create keypair from valid hex private key', () => {
      const keyPair = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);

      expect(keyPair.publicKeyHex).toBeTruthy();
      expect(keyPair.publicKeyHex.length).toBe(64);
    });

    it('should throw InvalidNostrKeyError for empty string', () => {
      expect(() => NostrKeyPair.fromPrivateKey('')).toThrowError(InvalidNostrKeyError);
    });

    it('should throw InvalidNostrKeyError for invalid hex', () => {
      expect(() => NostrKeyPair.fromPrivateKey('not-valid-hex')).toThrowError(InvalidNostrKeyError);
    });

    it('should throw InvalidNostrKeyError for hex that is too short', () => {
      const shortHex = '0123456789abcdef';
      expect(() => NostrKeyPair.fromPrivateKey(shortHex)).toThrowError(InvalidNostrKeyError);
    });
  });

  describe('public key formats', () => {
    it('should return hex public key', () => {
      const keyPair = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);

      expect(keyPair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return npub format', () => {
      const keyPair = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);

      expect(keyPair.npub).toMatch(/^npub1[a-z0-9]+$/);
    });

    it('should return nsec format', () => {
      const keyPair = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);

      expect(keyPair.nsec).toMatch(/^nsec1[a-z0-9]+$/);
    });
  });

  describe('getPrivateKeyBytes', () => {
    it('should return 32-byte Uint8Array', () => {
      const keyPair = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);
      const bytes = keyPair.getPrivateKeyBytes();

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });
  });

  describe('toStorageHex', () => {
    it('should return the hex private key for storage', () => {
      const keyPair = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);

      expect(keyPair.toStorageHex()).toEqual(TEST_PRIVATE_KEY_HEX);
    });
  });

  describe('deterministic derivation', () => {
    it('should derive the same public key from the same private key', () => {
      const keyPair1 = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);
      const keyPair2 = NostrKeyPair.fromPrivateKey(TEST_PRIVATE_KEY_HEX);

      expect(keyPair1.publicKeyHex).toEqual(keyPair2.publicKeyHex);
    });
  });
});
