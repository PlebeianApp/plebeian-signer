import { IdentityId, PermissionId, RelayId, NwcConnectionId, CashuMintId } from './index';

describe('EntityId Value Objects', () => {
  describe('IdentityId', () => {
    it('should generate unique IDs', () => {
      const id1 = IdentityId.generate();
      const id2 = IdentityId.generate();

      expect(id1.toString()).not.toEqual(id2.toString());
    });

    it('should create from existing string value', () => {
      const value = 'test-identity-id-123';
      const id = IdentityId.from(value);

      expect(id.toString()).toEqual(value);
    });

    it('should be equal when values match', () => {
      const value = 'same-id';
      const id1 = IdentityId.from(value);
      const id2 = IdentityId.from(value);

      expect(id1.equals(id2)).toBe(true);
    });

    it('should not be equal when values differ', () => {
      const id1 = IdentityId.from('id-1');
      const id2 = IdentityId.from('id-2');

      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('PermissionId', () => {
    it('should generate unique IDs', () => {
      const id1 = PermissionId.generate();
      const id2 = PermissionId.generate();

      expect(id1.toString()).not.toEqual(id2.toString());
    });

    it('should create from existing string value', () => {
      const value = 'test-permission-id-456';
      const id = PermissionId.from(value);

      expect(id.toString()).toEqual(value);
    });
  });

  describe('RelayId', () => {
    it('should generate unique IDs', () => {
      const id1 = RelayId.generate();
      const id2 = RelayId.generate();

      expect(id1.toString()).not.toEqual(id2.toString());
    });

    it('should create from existing string value', () => {
      const value = 'test-relay-id-789';
      const id = RelayId.from(value);

      expect(id.toString()).toEqual(value);
    });
  });

  describe('NwcConnectionId', () => {
    it('should generate unique IDs', () => {
      const id1 = NwcConnectionId.generate();
      const id2 = NwcConnectionId.generate();

      expect(id1.toString()).not.toEqual(id2.toString());
    });
  });

  describe('CashuMintId', () => {
    it('should generate unique IDs', () => {
      const id1 = CashuMintId.generate();
      const id2 = CashuMintId.generate();

      expect(id1.toString()).not.toEqual(id2.toString());
    });
  });
});
