/**
 * Value object representing a user-defined nickname for an identity.
 * Self-validating and immutable.
 */
export class Nickname {
  private static readonly MAX_LENGTH = 50;
  private static readonly MIN_LENGTH = 1;

  private constructor(private readonly _value: string) {}

  /**
   * Create a new Nickname from a string value.
   * Trims whitespace and validates length.
   *
   * @throws Error if nickname is empty or too long
   */
  static create(value: string): Nickname {
    const trimmed = value?.trim() ?? '';

    if (trimmed.length < Nickname.MIN_LENGTH) {
      throw new InvalidNicknameError('Nickname cannot be empty');
    }

    if (trimmed.length > Nickname.MAX_LENGTH) {
      throw new InvalidNicknameError(
        `Nickname cannot exceed ${Nickname.MAX_LENGTH} characters`
      );
    }

    return new Nickname(trimmed);
  }

  /**
   * Reconstitute a Nickname from storage without validation.
   * Use only when loading from trusted storage.
   */
  static fromStorage(value: string): Nickname {
    return new Nickname(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Nickname): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }
}

/**
 * Error thrown when nickname validation fails.
 */
export class InvalidNicknameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNicknameError';
  }
}
