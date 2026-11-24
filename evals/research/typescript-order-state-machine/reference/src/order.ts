import { InvalidTransitionError } from './errors.ts';
import type { HistoryEntry, OrderEvent, OrderStatus } from './types.ts';

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  pending: { pay: 'paid', cancel: 'cancelled' },
  paid: { pack: 'packed', cancel: 'refunding' },
  packed: { ship: 'shipped', cancel: 'refunding' },
  shipped: { deliver: 'delivered' },
  delivered: { refund: 'refunded' },
  refunding: { refund: 'refunded' },
  cancelled: {},
  refunded: {},
};

export class Order {
  readonly id: string;
  #now: () => Date;
  #status: OrderStatus = 'pending';
  #history: HistoryEntry[] = [];

  constructor(id: string, now: () => Date = () => new Date()) {
    this.id = id;
    this.#now = now;
  }

  get status(): OrderStatus {
    return this.#status;
  }

  get history(): HistoryEntry[] {
    return [...this.#history];
  }

  canApply(event: OrderEvent): boolean {
    return TRANSITIONS[this.#status][event] !== undefined;
  }

  apply(event: OrderEvent): void {
    const to = TRANSITIONS[this.#status][event];
    if (to === undefined) throw new InvalidTransitionError(this.#status, event);

    this.#history.push({ event, from: this.#status, to, at: this.#now() });
    this.#status = to;
  }
}
