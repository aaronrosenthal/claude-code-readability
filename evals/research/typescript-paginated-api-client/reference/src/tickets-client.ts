import { TicketsApiError } from './errors.ts';
import type { FetchLike, Ticket, TicketPage } from './types.ts';

export interface TicketsClientOptions {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  maxRateLimitRetries?: number;
}

const PAGE_SIZE = 100;
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 5;
const DEFAULT_RETRY_AFTER_MS = 1000;

interface TicketsResponseBody {
  data: Ticket[];
  next_cursor: string | null;
}

export class TicketsClient {
  #options: TicketsClientOptions;

  constructor(options: TicketsClientOptions) {
    this.#options = options;
  }

  async listPage(cursor?: string): Promise<TicketPage> {
    const response = await this.#get(this.#pageUrl(cursor));
    const body = (await response.json()) as TicketsResponseBody;
    return { tickets: body.data, nextCursor: body.next_cursor };
  }

  async *listAll(): AsyncGenerator<Ticket> {
    let cursor: string | undefined;
    do {
      const page = await this.listPage(cursor);
      yield* page.tickets;
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
  }

  #pageUrl(cursor?: string): string {
    const url = `${this.#options.baseUrl}/tickets?limit=${PAGE_SIZE}`;
    return cursor === undefined ? url : `${url}&cursor=${encodeURIComponent(cursor)}`;
  }

  async #get(url: string): Promise<Response> {
    const { fetch, sleep, token, maxRateLimitRetries = DEFAULT_MAX_RATE_LIMIT_RETRIES } = this.#options;

    for (let retries = 0; ; retries++) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (response.status === 429 && retries < maxRateLimitRetries) {
        await sleep(retryAfterMs(response));
        continue;
      }
      if (!response.ok) {
        throw new TicketsApiError(response.status, `Tickets API responded with ${response.status}`);
      }
      return response;
    }
  }
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'));
  return seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}
