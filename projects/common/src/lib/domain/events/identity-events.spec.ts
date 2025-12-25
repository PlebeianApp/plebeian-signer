import {
  IdentityCreated,
  IdentityRenamed,
  IdentitySelected,
  IdentitySigned,
  IdentityDeleted,
} from './identity-events';

describe('Identity Domain Events', () => {
  describe('IdentityCreated', () => {
    it('should store identity creation data', () => {
      const event = new IdentityCreated('id-123', 'pubkey-abc', 'Alice');

      expect(event.identityId).toEqual('id-123');
      expect(event.publicKey).toEqual('pubkey-abc');
      expect(event.nickname).toEqual('Alice');
    });

    it('should have correct event type', () => {
      const event = new IdentityCreated('id', 'pubkey', 'name');

      expect(event.eventType).toEqual('identity.created');
    });

    it('should have inherited base properties', () => {
      const event = new IdentityCreated('id', 'pubkey', 'name');

      expect(event.eventId).toBeTruthy();
      expect(event.occurredAt).toBeInstanceOf(Date);
    });
  });

  describe('IdentityRenamed', () => {
    it('should store rename data', () => {
      const event = new IdentityRenamed('id-123', 'OldName', 'NewName');

      expect(event.identityId).toEqual('id-123');
      expect(event.oldNickname).toEqual('OldName');
      expect(event.newNickname).toEqual('NewName');
    });

    it('should have correct event type', () => {
      const event = new IdentityRenamed('id', 'old', 'new');

      expect(event.eventType).toEqual('identity.renamed');
    });
  });

  describe('IdentitySelected', () => {
    it('should store selection data with previous identity', () => {
      const event = new IdentitySelected('id-new', 'id-old');

      expect(event.identityId).toEqual('id-new');
      expect(event.previousIdentityId).toEqual('id-old');
    });

    it('should handle null previous identity', () => {
      const event = new IdentitySelected('id-new', null);

      expect(event.identityId).toEqual('id-new');
      expect(event.previousIdentityId).toBeNull();
    });

    it('should have correct event type', () => {
      const event = new IdentitySelected('id', null);

      expect(event.eventType).toEqual('identity.selected');
    });
  });

  describe('IdentitySigned', () => {
    it('should store signing data', () => {
      const event = new IdentitySigned('id-123', 1, 'event-id-abc');

      expect(event.identityId).toEqual('id-123');
      expect(event.eventKind).toBe(1);
      expect(event.signedEventId).toEqual('event-id-abc');
    });

    it('should have correct event type', () => {
      const event = new IdentitySigned('id', 1, 'event-id');

      expect(event.eventType).toEqual('identity.signed');
    });

    it('should handle various event kinds', () => {
      const kindExamples = [0, 1, 3, 4, 7, 30023, 10002];

      kindExamples.forEach(kind => {
        const event = new IdentitySigned('id', kind, 'event');
        expect(event.eventKind).toBe(kind);
      });
    });
  });

  describe('IdentityDeleted', () => {
    it('should store deletion data', () => {
      const event = new IdentityDeleted('id-123', 'pubkey-abc');

      expect(event.identityId).toEqual('id-123');
      expect(event.publicKey).toEqual('pubkey-abc');
    });

    it('should have correct event type', () => {
      const event = new IdentityDeleted('id', 'pubkey');

      expect(event.eventType).toEqual('identity.deleted');
    });
  });
});
