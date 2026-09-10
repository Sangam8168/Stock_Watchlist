import PortfolioView from '@/components/watchlist/PortfolioView';
import WatchlistNav from '@/components/watchlist/WatchlistNav';

export const metadata = { title: 'Portfolio — Stock Watchlist' };

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <WatchlistNav />
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Portfolio</h1>
        <p className="mt-1 text-sm text-gray-500">
          What you own, not what you&rsquo;re considering. Same thesis, same alerts — but the
          question is now whether it still holds.
        </p>
      </div>
      <PortfolioView />
    </div>
  );
}
