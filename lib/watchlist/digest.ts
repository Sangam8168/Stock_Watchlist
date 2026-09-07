// Per-user "what changed" digest — the email counterpart of the on-site
// "While you were away" panel. Same source of truth (materialized ChangeEvents),
// windowed to the last N hours and filtered to items the user wants notified on.

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { loadChangeEvents, type MergedEvent } from '@/lib/watchlist/changes-read';
import { severityTier, TIER_META, CHANGE_TYPE_LABEL } from '@/lib/changes/display';

export interface UserDigest {
  hasContent: boolean;
  summaryLine: string;
  bodyHtml: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function buildUserDigest(userId: string, sinceHours = 24): Promise<UserDigest> {
  await connectToDatabase();

  const now = Date.now();
  const items = (await Watchlist.find({ userId, notify: true }).lean()).filter(
    (i) => !i.mutedUntil || new Date(i.mutedUntil).getTime() <= now
  );
  if (!items.length) return { hasContent: false, summaryLine: '', bodyHtml: '' };

  const notifySymbols = items.map((i) => i.symbol);
  const since = new Date(Date.now() - sinceHours * 3600_000);

  const bySymbol = await loadChangeEvents(userId, notifySymbols, { since, perSymbolCap: 6 });
  const events: MergedEvent[] = [...bySymbol.values()].flat().sort((a, b) => b.severity - a.severity);

  if (!events.length) return { hasContent: false, summaryLine: '', bodyHtml: '' };

  const invalidated = new Set(events.filter((e) => e.type === 'invalidation_breached').map((e) => e.symbol));
  const attention = new Set(events.filter((e) => e.severity >= 50 && !invalidated.has(e.symbol)).map((e) => e.symbol));

  const parts: string[] = [];
  if (invalidated.size) parts.push(`${invalidated.size} invalidated`);
  if (attention.size) parts.push(`${attention.size} need${attention.size === 1 ? 's' : ''} attention`);
  const summaryLine = `${events.length} update${events.length === 1 ? '' : 's'} across ${bySymbol.size} name${bySymbol.size === 1 ? '' : 's'}${parts.length ? ` — ${parts.join(', ')}` : ''}`;

  const groups = [...bySymbol.entries()].sort(
    (a, b) => Math.max(...b[1].map((e) => e.severity)) - Math.max(...a[1].map((e) => e.severity))
  );

  const bodyHtml = groups
    .map(([symbol, evs]) => {
      const company = items.find((i) => i.symbol === symbol)?.company ?? symbol;
      const tier = severityTier(Math.max(...evs.map((e) => e.severity)));
      const dot = TIER_META[tier].dot.includes('red')
        ? '#ef4444'
        : TIER_META[tier].dot.includes('amber')
          ? '#f59e0b'
          : TIER_META[tier].dot.includes('yellow')
            ? '#eab308'
            : '#6b7280';
      const rows = evs
        .map(
          (e) => `
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.55;color:#CCDADC;">
              <span style="color:#6b7280;font-size:12px;">${esc(CHANGE_TYPE_LABEL[e.type] ?? e.type)}</span><br>
              ${esc(e.detail)}
            </p>`
        )
        .join('');
      return `
        <div style="border:1px solid #30333A;border-radius:8px;padding:16px;margin:0 0 12px 0;">
          <p style="margin:0 0 10px 0;font-size:15px;font-weight:600;color:#ffffff;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:8px;"></span>
            ${esc(symbol)} <span style="color:#6b7280;font-weight:400;font-size:13px;">${esc(company)}</span>
          </p>
          ${rows}
        </div>`;
    })
    .join('');

  return { hasContent: true, summaryLine, bodyHtml };
}
