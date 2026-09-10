'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, Briefcase, History } from 'lucide-react';

/**
 * Three separate jobs, three pages. Previously the watchlist, the portfolio and
 * the full change history all competed for attention on one screen; splitting
 * them means each page answers one question.
 */
const TABS = [
  { href: '/watchlist', label: 'Watchlist', icon: ListChecks, hint: 'What you might buy' },
  { href: '/watchlist/portfolio', label: 'Portfolio', icon: Briefcase, hint: 'What you own' },
  { href: '/watchlist/history', label: 'History', icon: History, hint: 'Everything that changed' },
];

export default function WatchlistNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-gray-800 print:hidden">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            title={t.hint}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
              active
                ? 'border-yellow-500 font-medium text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
