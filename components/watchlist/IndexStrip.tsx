'use client';

import { memo } from 'react';
import useTradingViewWidget from '@/hooks/useTradingViewWidget';

const INDEXES = [
  { symbol: 'AMEX:SPY', name: 'S&P 500' },
  { symbol: 'NASDAQ:QQQ', name: 'Nasdaq 100' },
  { symbol: 'AMEX:DIA', name: 'Dow Jones' },
  { symbol: 'AMEX:IWM', name: 'Russell 2000' },
];

function MiniIndex({ symbol }: { symbol: string }) {
  const ref = useTradingViewWidget(
    'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js',
    {
      symbol,
      width: '100%',
      height: 120,
      locale: 'en',
      dateRange: '1D',
      colorTheme: 'dark',
      isTransparent: true,
      autosize: false,
      chartOnly: false,
      noTimeScale: true,
    },
    120
  );
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-1">
      <div className="tradingview-widget-container" ref={ref} style={{ height: 120 }}>
        <div className="tradingview-widget-container__widget" />
      </div>
    </div>
  );
}

function IndexStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {INDEXES.map((i) => (
        <MiniIndex key={i.symbol} symbol={i.symbol} />
      ))}
    </div>
  );
}

export default memo(IndexStrip);
