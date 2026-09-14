// Structured logging. Two silent server-action failures shipped to production
// during development — both looked like "the button is broken" and produced no
// trace at all. Anything that can fail should pass through here so there is a
// record with enough context to act on.
//
// Deliberately vendor-free: JSON to stdout is what Vercel, CloudWatch, Datadog
// and friends all ingest. Point a drain at it, or add a DSN later, without
// touching call sites.

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Keys whose values must never reach a log line. */
const REDACT = /^(password|token|secret|key|authorization|cookie|mongodb_uri|.*_key|.*_secret)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') {
    // Catch connection strings and bearer tokens pasted into free text.
    return value
      .replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+@/gi, '$1***@')
      .replace(/\b(bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1***');
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? '***' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, event: string, context?: Record<string, unknown>, err?: unknown) {
  const line: Record<string, unknown> = {
    level,
    event,
    at: new Date().toISOString(),
    ...(context ? { ctx: redact(context) } : {}),
  };

  if (err !== undefined) {
    line.error =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 12).join('\n') }
        : { message: String(err) };
  }

  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (event: string, ctx?: Record<string, unknown>) =>
    process.env.NODE_ENV !== 'production' && emit('debug', event, ctx),
  info: (event: string, ctx?: Record<string, unknown>) => emit('info', event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>, err?: unknown) => emit('warn', event, ctx, err),
  error: (event: string, err: unknown, ctx?: Record<string, unknown>) => emit('error', event, ctx, err),
};

/** Shape every server action returns, so the client never has to guess. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Wraps a server action so a thrown error becomes a logged, typed failure
 * instead of an unhandled promise rejection the UI silently swallows.
 *
 * The message returned to the client is deliberately generic — the detail goes
 * to the log, not to the browser.
 */
export async function guard<T>(
  event: string,
  fn: () => Promise<T>,
  ctx?: Record<string, unknown>
): Promise<ActionResult<T>> {
  const started = Date.now();
  try {
    const data = await fn();
    log.debug(`${event}.ok`, { ...ctx, ms: Date.now() - started });
    return { ok: true, data };
  } catch (err) {
    log.error(`${event}.failed`, err, { ...ctx, ms: Date.now() - started });
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
