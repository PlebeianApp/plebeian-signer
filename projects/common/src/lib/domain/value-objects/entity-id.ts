/**
 * Base class for strongly-typed entity IDs.
 * Prevents mixing up different ID types (e.g., IdentityId vs PermissionId).
 */
export abstract class EntityId<T extends string = string> {
  protected constructor(protected readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error(`${this.constructor.name} cannot be empty`);
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: EntityId<T>): boolean {
    if (!(other instanceof this.constructor)) {
      return false;
    }
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }
}
