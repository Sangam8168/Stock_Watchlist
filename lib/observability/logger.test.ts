import test from 'node:test';
import assert from 'node:assert/strict';
import { log, guard } from './logger.ts';

/** Capture what actually reaches stdout/stderr. */
function capture(fn: () => void | Promise<void>) {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (s: string) => void lines.push(s);
  const done = () => Object.assign(console, orig);
  const r = fn();
  if (r instanceof Promise) return r.then(() => (done(), lines));
  done();
  return Promise.resolve(lines);
}

test('redacts secret-looking keys', async () => {
  const lines = await capture(() =>
    log.info('t', { password: 'hunter2', FINNHUB_API_KEY: 'abc123', symbol: 'NVDA' })
  );
  const out = lines.join('');
  assert.ok(!out.includes('hunter2'), 'password leaked');
  assert.ok(!out.includes('abc123'), 'api key leaked');
  assert.match(out, /NVDA/, 'non-secret context should survive');
});

test('redacts credentials embedded in connection strings', async () => {
  const lines = await capture(() =>
    log.info('t', { uri: 'mongodb+srv://user:s3cr3t@cluster0.example.net/db' })
  );
  const out = lines.join('');
  assert.ok(!out.includes('s3cr3t'), 'mongo password leaked');
  assert.match(out, /\*\*\*@/);
});

test('redacts nested values, not just top level', async () => {
  const lines = await capture(() => log.info('t', { outer: { inner: { token: 'leakme' } } }));
  assert.ok(!lines.join('').includes('leakme'));
});

test('guard returns typed success', async () => {
  const res = await guard('x', async () => 42);
  assert.deepEqual(res, { ok: true, data: 42 });
});

test('guard converts a throw into a logged, generic failure', async () => {
  let res: Awaited<ReturnType<typeof guard<never>>> | undefined;
  const lines = await capture(async () => {
    res = await guard('boom', async () => {
      throw new Error('internal detail with s3cr3t');
    });
  });
  assert.equal(res?.ok, false);
  // The client must not receive internals…
  assert.ok(!JSON.stringify(res).includes('internal detail'));
  // …but the log must retain them for debugging.
  assert.match(lines.join(''), /boom\.failed/);
});
