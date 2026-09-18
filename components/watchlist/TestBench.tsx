'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, ChevronDown, Loader2 } from 'lucide-react';
import {
  seedDemoWatchlist,
  simulateSinceYouLeft,
  simulateFeedOutage,
  restoreFeed,
  rewindLastSeen,
} from '@/lib/actions/demo.actions';

/**
 * A reviewer-facing test bench.
 *
 * The app's most important behaviours are the ones that only appear when
 * something goes wrong — an outage, a gap since your last visit. Waiting for
 * those to happen naturally is not an option in a ten-minute review, and
 * describing them is far less convincing than watching them.
 *
 * Every scenario drives the *real* code path rather than a demo branch: the
 * outage flips the same staleness flag a provider failure sets, and the digest
 * runs the real detection engine over synthetic prices. Only the inputs are
 * fabricated — never the behaviour being demonstrated.
 *
 * Gated to the accounts in DEMO_TOOLS_EMAILS, and every action re-checks that
 * server-side, so hiding the panel is not the only thing protecting it.
 */
export default function TestBench({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: (r: never) => string) => {
    setBusy(key);
    try {
      const res = (await fn()) as never;
      toast.success(done(res));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That scenario failed');
    } finally {
      setBusy(null);
    }
  };

  const scenarios: {
    key: string;
    label: string;
    proves: string;
    tone?: 'warn';
    go: () => Promise<void>;
  }[] = [
    {
      key: 'seed',
      label: 'Load a demo watchlist',
      proves: 'Five real theses with entry bands, invalidation levels and catalyst dates.',
      go: () => run('seed', seedDemoWatchlist, (r: { added: number }) => `${r.added} theses added`),
    },
    {
      key: 'away',
      label: 'Simulate being away 2 hours',
      proves: 'Runs the real detection engine over synthetic prices — the events are genuine engine output.',
      go: () => run('away', simulateSinceYouLeft, (r: { events: number }) => `${r.events} events detected`),
    },
    {
      key: 'rewind',
      label: 'Mark everything unread again',
      proves: 'Winds this device’s caught-up marker back a day so the digest can be shown again.',
      go: () => run('rewind', () => rewindLastSeen(24), () => 'Watermark wound back 24h'),
    },
    {
      key: 'outage',
      label: 'Break the price feed',
      proves:
        'The one that matters. No data means no detected changes — which would normally render as a reassuring “all quiet”. Watch it refuse.',
      tone: 'warn',
      go: () =>
        run('outage', () => simulateFeedOutage(3), (r: { symbols: string[] }) =>
          r.symbols.length ? `Feed broken for ${r.symbols.join(', ')}` : 'Add a stock first'
        ),
    },
    {
      key: 'restore',
      label: 'Repair the price feed',
      proves: 'Puts it back. The 15-minute poll would also heal it on its own.',
      go: () => run('restore', restoreFeed, (r: { symbols: number }) => `Restored ${r.symbols} symbols`),
    },
  ];

  return (
    <section className="surface !p-0 overflow-hidden print:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <FlaskConical className="h-4 w-4 text-yellow-500" />
        <span className="text-sm font-semibold text-gray-200">Test bench</span>
        <span className="text-xs text-gray-600">Reproduce the edge cases without waiting for the market</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t hairline p-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {scenarios.map((s) => (
              <li key={s.key}>
                <button
                  onClick={s.go}
                  disabled={busy !== null}
                  className={`flex h-full w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-40 ${
                    s.tone === 'warn'
                      ? 'border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/60'
                      : 'border-white/10 hover:border-gray-500'
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className={`text-sm font-medium ${s.tone === 'warn' ? 'text-amber-400' : 'text-gray-200'}`}>
                      {s.label}
                    </span>
                    {busy === s.key && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-gray-500" />}
                  </span>
                  <span className="text-xs leading-snug text-gray-500">{s.proves}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-gray-600">
            Every scenario drives the real code path — the outage flips the same staleness flag a provider failure
            sets. Only the inputs are synthetic, never the behaviour being shown.
          </p>
        </div>
      )}
    </section>
  );
}
