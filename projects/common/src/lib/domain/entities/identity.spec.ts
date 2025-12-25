import { Identity, UnsignedEvent, SignedEvent, SigningFunction } from './identity';
import { IdentityCreated, IdentityRenamed, IdentitySigned } from '../events';

describe('Identity Entity', () => {
  const TEST_PRIVATE_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('create', () => {
    it('should create identity with generated keypair when no private key provided', () => {
      const identity = Identity.create('Alice');

      expect(identity.nickname).toEqual('Alice');
      expect(identity.publicKey).toBeTruthy();
      expect(identity.publicKey.length).toBe(64);
    });

    it('should create identity with provided private key', () => {
      const identity = Identity.create('Bob', TEST_PRIVATE_KEY);

      expect(identity.nickname).toEqual('Bob');
      expect(identity.publicKey).toBeTruthy();
    });

    it('should raise IdentityCreated event', () => {
      const identity = Identity.create('Charlie');
      const events = identity.pullDomainEvents();

      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(IdentityCreated);

      const createdEvent = events[0] as IdentityCreated;
      expect(createdEvent.identityId).toEqual(identity.id.toString());
      expect(createdEvent.publicKey).toEqual(identity.publicKey);
      expect(createdEvent.nickname).toEqual('Charlie');
    });

    it('should set createdAt timestamp', () => {
      const before = new Date();
      const identity = Identity.create('Dana');
      const after = new Date();

      expect(identity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(identity.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fromSnapshot', () => {
    it('should reconstruct identity from snapshot', () => {
      const original = Identity.create('Eve', TEST_PRIVATE_KEY);
      original.pullDomainEvents(); // Clear creation event

      const snapshot = original.toSnapshot();
      const restored = Identity.fromSnapshot(snapshot);

      expect(restored.id.toString()).toEqual(original.id.toString());
      expect(restored.nickname).toEqual('Eve');
      expect(restored.publicKey).toEqual(original.publicKey);
    });

    it('should not raise events when loading from snapshot', () => {
      const original = Identity.create('Frank');
      const snapshot = original.toSnapshot();

      const restored = Identity.fromSnapshot(snapshot);
      const events = restored.pullDomainEvents();

      expect(events.length).toBe(0);
    });
  });

  describe('rename', () => {
    it('should update nickname', () => {
      const identity = Identity.create('OldName');
      identity.pullDomainEvents(); // Clear creation event

      identity.rename('NewName');

      expect(identity.nickname).toEqual('NewName');
    });

    it('should raise IdentityRenamed event', () => {
      const identity = Identity.create('OldName');
      identity.pullDomainEvents(); // Clear creation event

      identity.rename('NewName');
      const events = identity.pullDomainEvents();

      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(IdentityRenamed);

      const renamedEvent = events[0] as IdentityRenamed;
      expect(renamedEvent.identityId).toEqual(identity.id.toString());
      expect(renamedEvent.oldNickname).toEqual('OldName');
      expect(renamedEvent.newNickname).toEqual('NewName');
    });
  });

  describe('sign', () => {
    it('should call signing function with event and return signed event', () => {
      const identity = Identity.create('Signer', TEST_PRIVATE_KEY);
      identity.pullDomainEvents();

      const unsignedEvent: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: 'Hello, Nostr!',
      };

      const mockSignFn: SigningFunction = (event, privateKeyBytes) => {
        expect(privateKeyBytes).toBeInstanceOf(Uint8Array);
        expect(privateKeyBytes.length).toBe(32);

        return {
          ...event,
          id: 'mock-event-id',
          pubkey: identity.publicKey,
          sig: 'mock-signature',
        } as SignedEvent;
      };

      const signedEvent = identity.sign(unsignedEvent, mockSignFn);

      expect(signedEvent.id).toEqual('mock-event-id');
      expect(signedEvent.pubkey).toEqual(identity.publicKey);
      expect(signedEvent.sig).toEqual('mock-signature');
    });

    it('should raise IdentitySigned event', () => {
      const identity = Identity.create('Signer', TEST_PRIVATE_KEY);
      identity.pullDomainEvents();

      const unsignedEvent: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: 'Test',
      };

      const mockSignFn: SigningFunction = (event) => ({
        ...event,
        id: 'signed-event-id',
        pubkey: identity.publicKey,
        sig: 'sig',
      } as SignedEvent);

      identity.sign(unsignedEvent, mockSignFn);
      const events = identity.pullDomainEvents();

      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(IdentitySigned);

      const signedEvt = events[0] as IdentitySigned;
      expect(signedEvt.identityId).toEqual(identity.id.toString());
      expect(signedEvt.eventKind).toBe(1);
      expect(signedEvt.signedEventId).toEqual('signed-event-id');
    });
  });

  describe('toSnapshot', () => {
    it('should create complete snapshot for storage', () => {
      const identity = Identity.create('Snapshot Test', TEST_PRIVATE_KEY);
      const snapshot = identity.toSnapshot();

      expect(snapshot.id).toEqual(identity.id.toString());
      expect(snapshot.nick).toEqual('Snapshot Test');
      expect(snapshot.privkey).toBeTruthy();
      expect(snapshot.createdAt).toBeTruthy();
    });
  });

  describe('npub', () => {
    it('should return bech32 encoded public key', () => {
      const identity = Identity.create('NpubTest');

      expect(identity.npub).toMatch(/^npub1[a-z0-9]+$/);
    });
  });

  describe('pullDomainEvents', () => {
    it('should clear events after pulling', () => {
      const identity = Identity.create('Test');

      const firstPull = identity.pullDomainEvents();
      const secondPull = identity.pullDomainEvents();

      expect(firstPull.length).toBe(1);
      expect(secondPull.length).toBe(0);
    });

    it('should accumulate multiple events', () => {
      const identity = Identity.create('Multi');
      identity.rename('Name1');
      identity.rename('Name2');

      const events = identity.pullDomainEvents();

      expect(events.length).toBe(3); // Created + 2 renames
    });
  });
});
