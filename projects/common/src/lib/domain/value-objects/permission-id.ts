import { v4 as uuidv4 } from 'uuid';
import { EntityId } from './entity-id';

/**
 * Strongly-typed identifier for Permission entities.
 * Prevents accidental mixing with other ID types.
 */
export class PermissionId extends EntityId<'PermissionId'> {
  private readonly _brand = 'PermissionId' as const;

  private constructor(value: string) {
    super(value);
  }

  /**
   * Generate a new unique PermissionId.
   */
  static generate(): PermissionId {
    return new PermissionId(uuidv4());
  }

  /**
   * Create a PermissionId from an existing string value.
   * Use this when reconstituting from storage.
   */
  static from(value: string): PermissionId {
    return new PermissionId(value);
  }

  /**
   * Type guard to check if two IDs are equal.
   */
  override equals(other: PermissionId): boolean {
    return other instanceof PermissionId && this._value === other._value;
  }
}
