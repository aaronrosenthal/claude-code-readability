export type FetchLike = (url: string) => Promise<Response>;

export interface ClientOptions {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export type FetchError =
  | { kind: 'client'; status: number; body: string }
  | { kind: 'server'; status: number; attempts: number }
  | { kind: 'network'; message: string; attempts: number }
  | { kind: 'invalid-json'; status: number };

export type FetchResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: FetchError };

type Attempt<T> =
  | { retryable: false; result: FetchResult<T> }
  | { retryable: true; error: FetchError };

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 200;

export async function fetchJson<T>(url: string, options: ClientOptions): Promise<FetchResult<T>> {
  const { maxAttempts = DEFAULT_MAX_ATTEMPTS, baseDelayMs = DEFAULT_BASE_DELAY_MS } = options;

  for (let attemptNumber = 1; ; attemptNumber++) {
    const attempt = await tryOnce<T>(url, options.fetch, attemptNumber);
    if (!attempt.retryable) return attempt.result;
    if (attemptNumber === maxAttempts) return { ok: false, error: attempt.error };

    await options.sleep(baseDelayMs * 2 ** (attemptNumber - 1));
  }
}

async function tryOnce<T>(url: string, fetchFn: FetchLike, attempts: number): Promise<Attempt<T>> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { retryable: true, error: { kind: 'network', message, attempts } };
  }

  if (response.status >= 500) {
    return { retryable: true, error: { kind: 'server', status: response.status, attempts } };
  }
  if (response.status >= 400) {
    const body = await response.text();
    return { retryable: false, result: { ok: false, error: { kind: 'client', status: response.status, body } } };
  }

  try {
    const value = (await response.json()) as T;
    return { retryable: false, result: { ok: true, value, attempts } };
  } catch {
    return { retryable: false, result: { ok: false, error: { kind: 'invalid-json', status: response.status } } };
  }
}
