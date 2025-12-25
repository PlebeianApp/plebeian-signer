import { DomainEvent, AggregateRoot } from './domain-event';

// Concrete implementation for testing
class TestEvent extends DomainEvent {
  readonly eventType = 'test.event';

  constructor(readonly testData: string) {
    super();
  }
}

class TestAggregate extends AggregateRoot {
  doSomething(data: string): void {
    this.addDomainEvent(new TestEvent(data));
  }
}

describe('DomainEvent', () => {
  describe('base properties', () => {
    it('should have occurredAt timestamp', () => {
      const before = new Date();
      const event = new TestEvent('test');
      const after = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should have unique eventId', () => {
      const event1 = new TestEvent('test1');
      const event2 = new TestEvent('test2');

      expect(event1.eventId).not.toEqual(event2.eventId);
    });

    it('should have eventType from subclass', () => {
      const event = new TestEvent('test');

      expect(event.eventType).toEqual('test.event');
    });
  });
});

describe('AggregateRoot', () => {
  describe('domain events', () => {
    it('should collect domain events', () => {
      const aggregate = new TestAggregate();

      aggregate.doSomething('first');
      aggregate.doSomething('second');

      const events = aggregate.pullDomainEvents();

      expect(events.length).toBe(2);
      expect((events[0] as TestEvent).testData).toEqual('first');
      expect((events[1] as TestEvent).testData).toEqual('second');
    });

    it('should clear events after pulling', () => {
      const aggregate = new TestAggregate();
      aggregate.doSomething('test');

      aggregate.pullDomainEvents();
      const secondPull = aggregate.pullDomainEvents();

      expect(secondPull.length).toBe(0);
    });

    it('should preserve event order', () => {
      const aggregate = new TestAggregate();

      aggregate.doSomething('1');
      aggregate.doSomething('2');
      aggregate.doSomething('3');

      const events = aggregate.pullDomainEvents();

      expect(events.map(e => (e as TestEvent).testData)).toEqual(['1', '2', '3']);
    });
  });
});
