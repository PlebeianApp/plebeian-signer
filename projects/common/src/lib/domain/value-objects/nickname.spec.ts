import { Nickname, InvalidNicknameError } from './nickname';

describe('Nickname Value Object', () => {
  describe('create', () => {
    it('should create a valid nickname', () => {
      const nickname = Nickname.create('Alice');

      expect(nickname.toString()).toEqual('Alice');
    });

    it('should trim whitespace from nickname', () => {
      const nickname = Nickname.create('  Bob  ');

      expect(nickname.toString()).toEqual('Bob');
    });

    it('should throw InvalidNicknameError for empty string', () => {
      expect(() => Nickname.create('')).toThrowError(InvalidNicknameError);
    });

    it('should throw InvalidNicknameError for whitespace-only string', () => {
      expect(() => Nickname.create('   ')).toThrowError(InvalidNicknameError);
    });

    it('should throw InvalidNicknameError for nickname exceeding 50 characters', () => {
      const longNickname = 'a'.repeat(51);

      expect(() => Nickname.create(longNickname)).toThrowError(InvalidNicknameError);
    });

    it('should allow nickname with exactly 50 characters', () => {
      const maxNickname = 'a'.repeat(50);

      expect(() => Nickname.create(maxNickname)).not.toThrow();
      expect(Nickname.create(maxNickname).toString()).toEqual(maxNickname);
    });

    it('should allow single character nickname', () => {
      const nickname = Nickname.create('X');

      expect(nickname.toString()).toEqual('X');
    });
  });

  describe('fromStorage', () => {
    it('should create nickname from storage without validation', () => {
      // This allows loading potentially invalid data from storage
      // without throwing during deserialization
      const nickname = Nickname.fromStorage('stored-nickname');

      expect(nickname.toString()).toEqual('stored-nickname');
    });

    it('should handle long nicknames from legacy storage', () => {
      const longLegacyNickname = 'a'.repeat(100);
      const nickname = Nickname.fromStorage(longLegacyNickname);

      expect(nickname.toString()).toEqual(longLegacyNickname);
    });
  });

  describe('equals', () => {
    it('should return true for equal nicknames', () => {
      const nick1 = Nickname.create('Alice');
      const nick2 = Nickname.create('Alice');

      expect(nick1.equals(nick2)).toBe(true);
    });

    it('should return false for different nicknames', () => {
      const nick1 = Nickname.create('Alice');
      const nick2 = Nickname.create('Bob');

      expect(nick1.equals(nick2)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const nick1 = Nickname.create('alice');
      const nick2 = Nickname.create('Alice');

      expect(nick1.equals(nick2)).toBe(false);
    });
  });

  describe('InvalidNicknameError', () => {
    it('should be an instance of InvalidNicknameError', () => {
      try {
        Nickname.create('');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidNicknameError);
        expect((e as InvalidNicknameError).message).toContain('cannot be empty');
      }
    });
  });
});
