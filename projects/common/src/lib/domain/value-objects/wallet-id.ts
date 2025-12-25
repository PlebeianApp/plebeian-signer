import { v4 as uuidv4 } from 'uuid';
import { EntityId } from './entity-id';

/**
 * Strongly-typed identifier for NWC wallet connection entities.
 */
export class NwcConnectionId extends EntityId<'NwcConnectionId'> {
  private readonly _brand = 'NwcConnectionId' as const;

  private constructor(value: string) {
    super(value);
  }

  static generate(): NwcConnectionId {
    return new NwcConnectionId(uuidv4());
  }

  static from(value: string): NwcConnectionId {
    return new NwcConnectionId(value);
  }

  override equals(other: NwcConnectionId): boolean {
    return other instanceof NwcConnectionId && this._value === other._value;
  }
}

/**
 * Strongly-typed identifier for Cashu mint entities.
 */
export class CashuMintId extends EntityId<'CashuMintId'> {
  private readonly _brand = 'CashuMintId' as const;

  private constructor(value: string) {
    super(value);
  }

  static generate(): CashuMintId {
    return new CashuMintId(uuidv4());
  }

  static from(value: string): CashuMintId {
    return new CashuMintId(value);
  }

  override equals(other: CashuMintId): boolean {
    return other instanceof CashuMintId && this._value === other._value;
  }
}
