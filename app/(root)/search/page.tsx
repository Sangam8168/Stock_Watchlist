import DiscoverView from '@/components/search/DiscoverView';
import { getDiscovery, getTrending } from '@/lib/actions/discover.actions';

export const metadata = { title: 'Search · Stock Watchlist' };

// Both reads hit only our own cached snapshots, so this page costs zero
// provider quota no matter how often it is opened.
//
// force-dynamic is load-bearing. Both actions call headers() for the session,
// and both wrap everything in try/catch — which swallows the error Next throws
// to mark a route dynamic. Without this the build "succeeds" and ships a
// permanently empty static page instead of failing loudly.
export const dynamic = 'force-dynamic';
export default async function SearchPage() {
  const [discovery, trending] = await Promise.all([getDiscovery(5), getTrending(6)]);
  return <DiscoverView discovery={discovery} trending={trending} />;
}
