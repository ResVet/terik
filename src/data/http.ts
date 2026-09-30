/** Fetch JSON with a timeout, retries on 429/5xx and network errors, and an abort signal. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends ApiError {
  constructor(readonly retryAfterSeconds: number) {
    super('Rate limited by the data service', 429, true);
    this.name = 'RateLimitError';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(signal.reason);
      },
      { once: true },
    );
  });

interface Options {
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  retries?: number;
}

export async function getJson<T>(url: string, { signal, timeoutMs = 30_000, retries = 2 }: Options = {}): Promise<T> {
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (response.status === 429) {
        const header = Number(response.headers.get('Retry-After'));
        throw new RateLimitError(Number.isFinite(header) && header > 0 ? header : 60);
      }
      if (!response.ok) {
        let reason = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { reason?: unknown };
          if (typeof body.reason === 'string') reason = body.reason;
        } catch {
          // Body was not JSON; keep the status text.
        }
        throw new ApiError(reason, response.status, response.status >= 500);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      const retryable = error instanceof ApiError ? error.retryable && !(error instanceof RateLimitError) : true;
      if (!retryable || attempt >= retries) throw error;
      attempt++;
      await sleep(600 * 2 ** attempt + Math.random() * 300, signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
