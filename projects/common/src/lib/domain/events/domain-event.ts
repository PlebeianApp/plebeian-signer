/**
 * Base class for all domain events.
 * Domain events capture significant occurrences in the domain that
 * domain experts care about.
 */
export abstract class DomainEvent {
  readonly occurredAt: Date;
  readonly eventId: string;

  constructor() {
    this.occurredAt = new Date();
    this.eventId = crypto.randomUUID();
  }

  /**
   * Get the event type identifier.
   * Used for event routing and serialization.
   */
  abstract get eventType(): string;
}

/**
 * Interface for entities that can raise domain events.
 */
export interface EventRaiser {
  /**
   * Pull all pending domain events from the entity.
   * This clears the internal event list.
   */
  pullDomainEvents(): DomainEvent[];
}

/**
 * Base class for aggregate roots that can raise domain events.
 */
export abstract class AggregateRoot implements EventRaiser {
  private _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  /**
   * Check if there are any pending domain events.
   */
  hasPendingEvents(): boolean {
    return this._domainEvents.length > 0;
  }
}
