import type { JobQueue } from './queue-sdk.ts';

export interface WebhookDeps {
  invoices: { markPaid(invoiceId: string): void };
  subscriptions: { cancel(subscriptionId: string, reason: string): boolean };
  queue: JobQueue;
}

export interface HandlerResult {
  status: 'handled' | 'ignored' | 'duplicate';
}

export function handleWebhook(rawBody: string, deps: WebhookDeps): HandlerResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webhook payloads are untyped JSON from the provider
  const event: any = JSON.parse(rawBody);

  switch (event.type) {
    case 'invoice.paid':
      deps.invoices.markPaid(event.data.id);
      return { status: 'handled' };

    case 'invoice.payment_failed':
      deps.queue.enqueue({
        name: 'send-dunning-email',
        payload: { invoiceId: event.data.id, attempt: event.data.attempt_count },
        // @ts-expect-error -- the SDK's types omit the 'priority' field (fixed in v5)
        priority: 'high',
      });
      return { status: 'handled' };

    case 'customer.subscription.deleted': {
      const reason = event.data.cancellation_reason ?? 'unspecified';
      if (!deps.subscriptions.cancel(event.data.id, reason)) return { status: 'duplicate' };

      deps.queue.enqueue({
        name: 'send-winback-email',
        payload: { subscriptionId: event.data.id, customerId: event.data.customer },
        // @ts-expect-error -- the SDK's types omit the 'priority' field (fixed in v5)
        priority: 'low',
      });
      return { status: 'handled' };
    }

    default:
      return { status: 'ignored' };
  }
}
