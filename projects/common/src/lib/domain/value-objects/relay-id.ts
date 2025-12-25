import { v4 as uuidv4 } from 'uuid';
import { EntityId } from './entity-id';

/**
 * Strongly-typed identifier for Relay entities.
 * Prevents accidental mixing with other ID types.
 */
export class RelayId extends EntityId<'RelayId'> {
  private readonly _brand = 'RelayId' as const;

  private constructor(value: string) {
    super(value);
  }

  /**
   * Generate a new unique RelayId.
   */
  static generate(): RelayId {
    return new RelayId(uuidv4());
  }

  /**
   * Create a RelayId from an existing string value.
   * Use this when reconstituting from storage.
   */
  static from(value: string): RelayId {
    return new RelayId(value);
  }

  /**
   * Type guard to check if two IDs are equal.
   */
  override equals(other: RelayId): boolean {
    return other instanceof RelayId && this._value === other._value;
  }
}
