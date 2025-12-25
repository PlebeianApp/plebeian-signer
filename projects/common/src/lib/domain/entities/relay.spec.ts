import { Relay, InvalidRelayUrlError, toNip65RelayList } from './relay';
import { IdentityId } from '../value-objects';

describe('Relay Entity', () => {
  const testIdentityId = IdentityId.from('identity-1');
  const validUrl = 'wss://relay.example.com';

  describe('create', () => {
    it('should create relay with default read/write permissions', () => {
      const relay = Relay.create(testIdentityId, validUrl);

      expect(relay.url).toEqual(validUrl);
      expect(relay.read).toBe(true);
      expect(relay.write).toBe(true);
    });

    it('should create relay with specified permissions', () => {
      const relay = Relay.create(testIdentityId, validUrl, true, false);

      expect(relay.read).toBe(true);
      expect(relay.write).toBe(false);
    });

    it('should create relay with read-only permissions', () => {
      const relay = Relay.create(testIdentityId, validUrl, true, false);

      expect(relay.read).toBe(true);
      expect(relay.write).toBe(false);
    });

    it('should create relay with write-only permissions', () => {
      const relay = Relay.create(testIdentityId, validUrl, false, true);

      expect(relay.read).toBe(false);
      expect(relay.write).toBe(true);
    });

    it('should throw InvalidRelayUrlError for invalid URL', () => {
      expect(() => Relay.create(testIdentityId, 'not-a-url')).toThrowError(InvalidRelayUrlError);
    });

    it('should throw InvalidRelayUrlError for http URL', () => {
      expect(() => Relay.create(testIdentityId, 'http://relay.example.com')).toThrowError(InvalidRelayUrlError);
    });

    it('should accept wss:// URL', () => {
      expect(() => Relay.create(testIdentityId, 'wss://relay.example.com')).not.toThrow();
    });

    it('should accept ws:// URL (for local development)', () => {
      expect(() => Relay.create(testIdentityId, 'ws://localhost:8080')).not.toThrow();
    });
  });

  describe('updateUrl', () => {
    it('should update URL to valid new URL', () => {
      const relay = Relay.create(testIdentityId, validUrl);

      relay.updateUrl('wss://new-relay.example.com');

      expect(relay.url).toEqual('wss://new-relay.example.com');
    });

    it('should throw InvalidRelayUrlError for invalid new URL', () => {
      const relay = Relay.create(testIdentityId, validUrl);

      expect(() => relay.updateUrl('not-a-url')).toThrowError(InvalidRelayUrlError);
    });
  });

  describe('read permission toggling', () => {
    it('should enable read', () => {
      const relay = Relay.create(testIdentityId, validUrl, false, false);

      relay.enableRead();

      expect(relay.read).toBe(true);
    });

    it('should disable read', () => {
      const relay = Relay.create(testIdentityId, validUrl, true, true);

      relay.disableRead();

      expect(relay.read).toBe(false);
    });
  });

  describe('write permission toggling', () => {
    it('should enable write', () => {
      const relay = Relay.create(testIdentityId, validUrl, false, false);

      relay.enableWrite();

      expect(relay.write).toBe(true);
    });

    it('should disable write', () => {
      const relay = Relay.create(testIdentityId, validUrl, true, true);

      relay.disableWrite();

      expect(relay.write).toBe(false);
    });
  });

  describe('fromSnapshot', () => {
    it('should reconstruct relay from snapshot', () => {
      const original = Relay.create(testIdentityId, validUrl, true, false);
      const snapshot = original.toSnapshot();

      const restored = Relay.fromSnapshot(snapshot);

      expect(restored.url).toEqual(validUrl);
      expect(restored.read).toBe(true);
      expect(restored.write).toBe(false);
    });
  });

  describe('toSnapshot', () => {
    it('should create valid snapshot', () => {
      const relay = Relay.create(testIdentityId, validUrl, true, false);
      const snapshot = relay.toSnapshot();

      expect(snapshot.identityId).toEqual(testIdentityId.toString());
      expect(snapshot.url).toEqual(validUrl);
      expect(snapshot.read).toBe(true);
      expect(snapshot.write).toBe(false);
    });
  });
});

describe('toNip65RelayList', () => {
  const identityId = IdentityId.from('identity-1');

  it('should convert relays to NIP-65 format', () => {
    const relays = [
      Relay.create(identityId, 'wss://relay1.com', true, true),
      Relay.create(identityId, 'wss://relay2.com', true, false),
      Relay.create(identityId, 'wss://relay3.com', false, true),
    ];

    const nip65List = toNip65RelayList(relays);

    expect(nip65List['wss://relay1.com']).toEqual({ read: true, write: true });
    expect(nip65List['wss://relay2.com']).toEqual({ read: true, write: false });
    expect(nip65List['wss://relay3.com']).toEqual({ read: false, write: true });
  });

  it('should return empty object for empty relay list', () => {
    const nip65List = toNip65RelayList([]);

    expect(nip65List).toEqual({});
  });
});
