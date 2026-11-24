export interface RunOptions {
  concurrency: number;
  signal?: AbortSignal;
}

export interface JobFailure<J> {
  index: number;
  job: J;
  error: unknown;
}

export interface BatchResult<R, J> {
  results: (R | undefined)[];
  failures: JobFailure<J>[];
  aborted: boolean;
}

export type Worker<J, R> = (job: J, signal: AbortSignal | undefined) => Promise<R>;

export async function runJobs<J, R>(
  jobs: readonly J[],
  worker: Worker<J, R>,
  options: RunOptions,
): Promise<BatchResult<R, J>> {
  const { concurrency, signal } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const results: (R | undefined)[] = jobs.map(() => undefined);
  const failures: JobFailure<J>[] = [];
  let nextIndex = 0;

  async function drainQueue(): Promise<void> {
    while (nextIndex < jobs.length && !signal?.aborted) {
      const index = nextIndex++;
      try {
        results[index] = await worker(jobs[index], signal);
      } catch (error) {
        failures.push({ index, job: jobs[index], error });
      }
    }
  }

  const slots = Math.min(concurrency, jobs.length);
  await Promise.all(Array.from({ length: slots }, drainQueue));

  failures.sort((a, b) => a.index - b.index);
  return { results, failures, aborted: signal?.aborted ?? false };
}
