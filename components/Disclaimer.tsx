/**
 * Required context, not decoration. The app displays market data and prompts
 * buy/sell decisions, so it has to be unambiguous that it is neither advice nor
 * a source of record — and that prices are delayed.
 */
export default function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[11px] leading-relaxed text-gray-600">
        Informational only — not financial advice. Prices are delayed and may be inaccurate.
      </p>
    );
  }

  return (
    <div className="surface-quiet text-[11px] leading-relaxed text-gray-600">
      <p className="font-semibold text-gray-500">Informational purposes only</p>
      <p className="mt-1">
        Stock Watchlist is a research and note-keeping tool. Nothing here is financial,
        investment, tax or legal advice, and no output constitutes a recommendation to buy
        or sell any security. &ldquo;Entry&rdquo;, &ldquo;invalidation&rdquo; and
        &ldquo;target&rdquo; are levels <em>you</em> choose; the app only reports when price
        crosses them.
      </p>
      <p className="mt-1">
        Market data is supplied by third parties, is typically <strong>delayed</strong>, may be
        incomplete or wrong, and must not be relied on for trading decisions. Verify against
        your broker before acting. Do your own research.
      </p>
    </div>
  );
}
