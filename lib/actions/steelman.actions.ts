'use server';

// "Steelman the other side" — the strongest honest case against your own thesis.
//
// This is the one feature here that genuinely needs a language model: there is
// no deterministic way to argue a position you haven't written down. Everything
// else in this app is computed, and deliberately so.
//
// Three constraints shape the implementation:
//   1. The model has no live data. It must reason from the thesis structure and
//      general knowledge, and say so rather than inventing prices or news.
//   2. The output must be risks and counterarguments, never a recommendation.
//   3. It costs money and latency per call, so it is rate limited and never
//      runs automatically.

import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import { log } from '@/lib/observability/logger';
import { rateLimit, rateLimitMessage } from '@/lib/observability/rate-limit';
import { GEMINI_MODEL } from '@/lib/ai/model';

const MODEL = GEMINI_MODEL;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface BearCase {
  ok: boolean;
  points?: string[];
  reason?: string;
}

function buildPrompt(input: {
  symbol: string; company: string; direction: string; thesis: string | null;
  entryLow: number | null; entryHigh: number | null;
  invalidationPrice: number | null; targetPrice: number | null; catalystNote: string | null;
}): string {
  const side = input.direction === 'short' ? 'short' : 'long';
  const opposing = side === 'short' ? 'the stock rising' : 'the stock falling';

  return `You are a rigorous, sceptical analyst helping someone pressure-test their own reasoning.

Their position on ${input.company} (${input.symbol}):
- Direction: ${side}
- Their reasoning: ${input.thesis || '(none written)'}
- Entry zone: ${input.entryLow ?? '?'}–${input.entryHigh ?? '?'}
- They consider themselves wrong at: ${input.invalidationPrice ?? '(not set)'}
- Target: ${input.targetPrice ?? '(not set)'}
- Catalyst they are watching: ${input.catalystNote || '(none)'}

Give the strongest honest case for ${opposing} — the argument a well-informed
person who disagrees with them would make.

Rules you must follow:
- Output 3 to 5 points. One sentence each. No preamble, no conclusion.
- Each point must be a specific, checkable risk or counterargument, not a
  platitude. "The market could go down" is useless.
- You do NOT have live market data. Never state a current price, a recent
  move, or recent news as fact. If a point depends on current conditions,
  phrase it as something to verify.
- If their reasoning has a structural weakness — an invalidation so far away
  it can't realistically be hit, a target with no stated mechanism, a
  catalyst that cuts both ways — say so plainly. That is the most useful
  thing you can offer.
- Never tell them to buy, sell, hold, or size a position. You are listing
  risks, not giving advice.
- Return ONLY a JSON array of strings. No markdown, no code fences.`;
}

export async function getBearCase(symbol: string): Promise<BearCase> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return { ok: false, reason: 'Please sign in again.' };

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, reason: 'Not configured — set GEMINI_API_KEY to enable this.' };
  }

  // Each call costs a model invocation; this is the most expensive per-click
  // action in the app.
  const rl = await rateLimit(user.id, 'email'); // same tight bucket as email
  if (!rl.allowed) return { ok: false, reason: rateLimitMessage(rl) };

  const { connectToDatabase } = await import('@/database/mongoose');
  const { Watchlist } = await import('@/database/models/watchlist.model');
  await connectToDatabase();

  const item = await Watchlist.findOne({ userId: user.id, symbol: symbol.trim().toUpperCase() }).lean();
  if (!item) return { ok: false, reason: 'That stock isn’t on your watchlist.' };

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt({
          symbol: item.symbol,
          company: item.company,
          direction: item.direction ?? 'long',
          thesis: item.thesis ?? null,
          entryLow: item.entryLow ?? null,
          entryHigh: item.entryHigh ?? null,
          invalidationPrice: item.invalidationPrice ?? null,
          targetPrice: item.targetPrice ?? null,
          catalystNote: item.catalystNote ?? null,
        }) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600, responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      log.error('steelman.provider_error', new Error(`HTTP ${res.status}`), { symbol: item.symbol });
      return { ok: false, reason: 'That service is unavailable right now.' };
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Models drift from format instructions; salvage the array rather than
    // failing the whole call on a stray code fence.
    const cleaned = text.replace(/```json|```/g, '').trim();
    let points: unknown;
    try {
      points = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\[[\s\S]*\]/);
      points = m ? JSON.parse(m[0]) : null;
    }

    if (!Array.isArray(points) || !points.length) {
      log.warn('steelman.unparseable', { symbol: item.symbol, sample: cleaned.slice(0, 200) });
      return { ok: false, reason: 'Couldn’t read the response — try again.' };
    }

    return {
      ok: true,
      points: points
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, 5)
        .map((p) => p.trim()),
    };
  } catch (err) {
    log.error('steelman.failed', err, { symbol: item.symbol });
    return { ok: false, reason: 'Something went wrong generating the bear case.' };
  }
}
