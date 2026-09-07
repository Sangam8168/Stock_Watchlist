import WatchlistView from '@/components/watchlist/WatchlistView';

// Auth is enforced by app/(root)/layout.tsx. The view is client-driven because
// "how far you've caught up" is keyed to a per-browser device id (localStorage),
// which the server can't read at render time.
export default function WatchlistPage() {
  return <WatchlistView />;
}
