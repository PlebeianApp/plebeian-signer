import { v4 as uuidv4 } from 'uuid';
import { EntityId } from './entity-id';

/**
 * Strongly-typed identifier for Identity entities.
 * Prevents accidental mixing with other ID types.
 */
export class IdentityId extends EntityId<'IdentityId'> {
  private readonly _brand = 'IdentityId' as const;

  private constructor(value: string) {
    super(value);
  }

  /**
   * Generate a new unique IdentityId.
   */
  static generate(): IdentityId {
    return new IdentityId(uuidv4());
  }

  /**
   * Create an IdentityId from an existing string value.
   * Use this when reconstituting from storage.
   */
  static from(value: string): IdentityId {
    return new IdentityId(value);
  }

  /**
   * Type guard to check if two IDs are equal.
   */
  override equals(other: IdentityId): boolean {
    return other instanceof IdentityId && this._value === other._value;
  }
}
