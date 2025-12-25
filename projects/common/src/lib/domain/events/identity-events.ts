import { DomainEvent } from './domain-event';

/**
 * Event raised when a new identity is created.
 */
export class IdentityCreated extends DomainEvent {
  readonly eventType = 'identity.created';

  constructor(
    readonly identityId: string,
    readonly publicKey: string,
    readonly nickname: string
  ) {
    super();
  }
}

/**
 * Event raised when an identity is renamed.
 */
export class IdentityRenamed extends DomainEvent {
  readonly eventType = 'identity.renamed';

  constructor(
    readonly identityId: string,
    readonly oldNickname: string,
    readonly newNickname: string
  ) {
    super();
  }
}

/**
 * Event raised when an identity is selected (made active).
 */
export class IdentitySelected extends DomainEvent {
  readonly eventType = 'identity.selected';

  constructor(
    readonly identityId: string,
    readonly previousIdentityId: string | null
  ) {
    super();
  }
}

/**
 * Event raised when an identity signs an event.
 */
export class IdentitySigned extends DomainEvent {
  readonly eventType = 'identity.signed';

  constructor(
    readonly identityId: string,
    readonly eventKind: number,
    readonly signedEventId: string
  ) {
    super();
  }
}

/**
 * Event raised when an identity is deleted.
 */
export class IdentityDeleted extends DomainEvent {
  readonly eventType = 'identity.deleted';

  constructor(
    readonly identityId: string,
    readonly publicKey: string
  ) {
    super();
  }
}
