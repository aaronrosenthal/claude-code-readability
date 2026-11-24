import type { Transaction, VendorApi } from './vendor-api.ts';

export interface ExportOptions {
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 1100;

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function exportTransactions(
  api: VendorApi,
  accountId: string,
  options: ExportOptions = {},
): Promise<Transaction[]> {
  const { sleep = realSleep, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = options;

  const transactions: Transaction[] = [];
  let token: string | undefined;

  /* eslint-disable no-await-in-loop -- each request needs the nextToken from the previous response, and the vendor allows one request per second */
  do {
    if (token !== undefined) await sleep(minIntervalMs);

    const page = await api.fetchPage(accountId, token);
    transactions.push(...page.transactions);
    token = page.nextToken ?? undefined;
  } while (token !== undefined);
  /* eslint-enable no-await-in-loop */

  return transactions;
}
