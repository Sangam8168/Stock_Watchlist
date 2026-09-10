import ChangeHistory from '@/components/watchlist/ChangeHistory';
import WatchlistNav from '@/components/watchlist/WatchlistNav';

export const metadata = { title: 'Change history — Stock Watchlist' };

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <WatchlistNav />
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Change history</h1>
        <p className="mt-1 text-sm text-gray-500">
          Everything the engine recorded, whether or not you&rsquo;ve reviewed it. The
          &ldquo;while you were away&rdquo; panel empties as you triage — this never does.
        </p>
      </div>
      <ChangeHistory />
    </div>
  );
}
