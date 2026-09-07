// Figures out *which* users have something worth emailing, so the digest cron
// fans out one job per active user instead of computing a digest for every user
// (most of whom are quiet on any given day).

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { ChangeEventModel } from '@/database/models/changeEvent.model';
import { SymbolEventModel } from '@/database/models/symbolEvent.model';

export async function usersWithRecentActivity(sinceHours = 24): Promise<string[]> {
  await connectToDatabase();
  const since = new Date(Date.now() - sinceHours * 3600_000);

  const [thesisUserIds, hotSymbols] = await Promise.all([
    ChangeEventModel.distinct('userId', { createdAt: { $gt: since }, type: { $ne: 'thesis_stale' } }),
    SymbolEventModel.distinct('symbol', { createdAt: { $gt: since } }),
  ]);

  const symbolUserIds = hotSymbols.length
    ? await Watchlist.distinct('userId', { symbol: { $in: hotSymbols as string[] }, notify: true })
    : [];

  return [...new Set([...(thesisUserIds as string[]), ...(symbolUserIds as string[])])];
}
