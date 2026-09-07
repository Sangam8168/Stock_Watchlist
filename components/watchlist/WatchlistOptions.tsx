'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Printer, FileDown, ClipboardCopy, RotateCcw, Trash2, Zap, Sparkles, Maximize2 } from 'lucide-react';
import { downloadCsv, copyForSheets } from '@/lib/watchlist/export';
import { clearWatchlist } from '@/lib/actions/watchlist.actions';
import type { UiPrefs } from '@/hooks/useUiPrefs';

interface Props {
  entries: WatchlistEntry[];
  prefs: UiPrefs;
  setPref: <K extends keyof UiPrefs>(k: K, v: UiPrefs[K]) => void;
  resetPrefs: () => void;
  onChanged: () => void;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`ml-auto inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-yellow-500' : 'bg-gray-600'
      }`}
    >
      <span className={`h-3 w-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
    </span>
  );
}

export default function WatchlistOptions({ entries, prefs, setPref, resetPrefs, onChanged }: Props) {
  const [confirming, setConfirming] = useState(false);

  const nukeAll = async () => {
    if (!confirming) {
      setConfirming(true);
      toast.warning('Click "Delete everything" again to confirm', { duration: 4000 });
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    const res = await clearWatchlist();
    toast.success(`Deleted ${res.removed} item${res.removed === 1 ? '' : 's'}`);
    setConfirming(false);
    onChanged();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:border-yellow-500 hover:text-yellow-500">
          Options <ChevronDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 border-gray-600 bg-gray-800 text-gray-300">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-500">Export</DropdownMenuLabel>
        <DropdownMenuItem className="cursor-pointer focus:bg-gray-700 focus:text-gray-100" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print watchlist
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onClick={() => { downloadCsv(entries); toast.success('watchlist.csv downloaded'); }}
        >
          <FileDown className="mr-2 h-4 w-4" /> Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onClick={async () => {
            const ok = await copyForSheets(entries);
            toast[ok ? 'success' : 'error'](ok ? 'Copied — paste into Excel / Sheets' : 'Clipboard blocked by the browser');
          }}
        >
          <ClipboardCopy className="mr-2 h-4 w-4" /> Copy for Excel / Sheets
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-gray-700" />
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-500">Display</DropdownMenuLabel>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onSelect={(e) => { e.preventDefault(); setPref('realtime', !prefs.realtime); }}
        >
          <Zap className="mr-2 h-4 w-4" /> Realtime updates <Toggle on={prefs.realtime} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onSelect={(e) => { e.preventDefault(); setPref('animations', !prefs.animations); }}
        >
          <Sparkles className="mr-2 h-4 w-4" /> Animations <Toggle on={prefs.animations} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onSelect={(e) => { e.preventDefault(); setPref('fullWidth', !prefs.fullWidth); }}
        >
          <Maximize2 className="mr-2 h-4 w-4" /> Full width <Toggle on={prefs.fullWidth} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onSelect={(e) => { e.preventDefault(); setPref('compact', !prefs.compact); }}
        >
          <Maximize2 className="mr-2 h-4 w-4 rotate-90" /> Compact rows <Toggle on={prefs.compact} />
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-gray-700" />
        <DropdownMenuItem
          className="cursor-pointer focus:bg-gray-700 focus:text-gray-100"
          onClick={() => { resetPrefs(); toast.success('View settings reset'); }}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Reset view settings
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-300"
          onSelect={(e) => { e.preventDefault(); nukeAll(); }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {confirming ? 'Click again to confirm' : 'Delete everything'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
