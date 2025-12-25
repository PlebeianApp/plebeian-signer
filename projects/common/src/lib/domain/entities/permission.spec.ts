import { Permission, PermissionChecker } from './permission';
import { IdentityId } from '../value-objects';

describe('Permission Entity', () => {
  const testIdentityId = IdentityId.from('identity-1');
  const testHost = 'example.com';
  const testMethod = 'signEvent';

  describe('allow', () => {
    it('should create an allow permission', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod);

      expect(permission.isAllowed()).toBe(true);
    });

    it('should create permission with kind for signEvent', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod, 1);

      expect(permission.isAllowed()).toBe(true);
    });
  });

  describe('deny', () => {
    it('should create a deny permission', () => {
      const permission = Permission.deny(testIdentityId, testHost, testMethod);

      expect(permission.isAllowed()).toBe(false);
    });
  });

  describe('matches', () => {
    it('should match when all parameters are the same', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod);

      expect(permission.matches(testIdentityId, testHost, testMethod)).toBe(true);
    });

    it('should not match when identity differs', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod);
      const differentIdentity = IdentityId.from('identity-2');

      expect(permission.matches(differentIdentity, testHost, testMethod)).toBe(false);
    });

    it('should not match when host differs', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod);

      expect(permission.matches(testIdentityId, 'other.com', testMethod)).toBe(false);
    });

    it('should not match when method differs', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod);

      expect(permission.matches(testIdentityId, testHost, 'getPublicKey')).toBe(false);
    });

    it('should match any kind when permission has no kind specified', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod);

      expect(permission.matches(testIdentityId, testHost, testMethod, 1)).toBe(true);
      expect(permission.matches(testIdentityId, testHost, testMethod, 30023)).toBe(true);
    });

    it('should only match specific kind when permission has kind', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod, 1);

      expect(permission.matches(testIdentityId, testHost, testMethod, 1)).toBe(true);
      expect(permission.matches(testIdentityId, testHost, testMethod, 30023)).toBe(false);
    });
  });

  describe('fromSnapshot', () => {
    it('should reconstruct permission from snapshot', () => {
      const original = Permission.allow(testIdentityId, testHost, testMethod, 1);
      const snapshot = original.toSnapshot();

      const restored = Permission.fromSnapshot(snapshot);

      expect(restored.isAllowed()).toBe(true);
      expect(restored.matches(testIdentityId, testHost, testMethod, 1)).toBe(true);
    });
  });

  describe('toSnapshot', () => {
    it('should create valid snapshot', () => {
      const permission = Permission.allow(testIdentityId, testHost, testMethod, 1);
      const snapshot = permission.toSnapshot();

      expect(snapshot.identityId).toEqual(testIdentityId.toString());
      expect(snapshot.host).toEqual(testHost);
      expect(snapshot.method).toEqual(testMethod);
      expect(snapshot.methodPolicy).toEqual('allow');
      expect(snapshot.kind).toBe(1);
    });
  });
});

describe('PermissionChecker', () => {
  const identity1 = IdentityId.from('identity-1');
  const identity2 = IdentityId.from('identity-2');

  describe('check', () => {
    it('should return true for allowed permission', () => {
      const permissions = [
        Permission.allow(identity1, 'example.com', 'signEvent'),
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity1, 'example.com', 'signEvent')).toBe(true);
    });

    it('should return false for denied permission', () => {
      const permissions = [
        Permission.deny(identity1, 'example.com', 'signEvent'),
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity1, 'example.com', 'signEvent')).toBe(false);
    });

    it('should return undefined when no matching permission exists', () => {
      const permissions = [
        Permission.allow(identity1, 'example.com', 'signEvent'),
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity2, 'example.com', 'signEvent')).toBeUndefined();
    });

    it('should check kind-specific permissions first', () => {
      const permissions = [
        Permission.deny(identity1, 'example.com', 'signEvent', 1), // Deny kind 1
        Permission.allow(identity1, 'example.com', 'signEvent'),   // Allow all others
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity1, 'example.com', 'signEvent', 1)).toBe(false);
      expect(checker.check(identity1, 'example.com', 'signEvent', 30023)).toBe(true);
    });

    it('should handle multiple identities', () => {
      const permissions = [
        Permission.allow(identity1, 'example.com', 'signEvent'),
        Permission.deny(identity2, 'example.com', 'signEvent'),
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity1, 'example.com', 'signEvent')).toBe(true);
      expect(checker.check(identity2, 'example.com', 'signEvent')).toBe(false);
    });

    it('should handle multiple hosts', () => {
      const permissions = [
        Permission.allow(identity1, 'allowed.com', 'signEvent'),
        Permission.deny(identity1, 'denied.com', 'signEvent'),
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity1, 'allowed.com', 'signEvent')).toBe(true);
      expect(checker.check(identity1, 'denied.com', 'signEvent')).toBe(false);
      expect(checker.check(identity1, 'unknown.com', 'signEvent')).toBeUndefined();
    });

    it('should handle multiple methods', () => {
      const permissions = [
        Permission.allow(identity1, 'example.com', 'getPublicKey'),
        Permission.deny(identity1, 'example.com', 'signEvent'),
      ];
      const checker = new PermissionChecker(permissions);

      expect(checker.check(identity1, 'example.com', 'getPublicKey')).toBe(true);
      expect(checker.check(identity1, 'example.com', 'signEvent')).toBe(false);
    });
  });
});
