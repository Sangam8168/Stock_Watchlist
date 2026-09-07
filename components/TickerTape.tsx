'use client';

import { memo } from 'react';
import useTradingViewWidget from '@/hooks/useTradingViewWidget';

// Real, live scrolling quotes across the top of the signed-in app.
// TradingView embed — no API key, no quota.
const CONFIG = {
  symbols: [
    { proName: 'NASDAQ:NVDA', title: 'NVDA' },
    { proName: 'NASDAQ:AAPL', title: 'AAPL' },
    { proName: 'NASDAQ:MSFT', title: 'MSFT' },
    { proName: 'NASDAQ:GOOGL', title: 'GOOGL' },
    { proName: 'NASDAQ:AMZN', title: 'AMZN' },
    { proName: 'NASDAQ:META', title: 'META' },
    { proName: 'NASDAQ:TSLA', title: 'TSLA' },
    { proName: 'NYSE:JPM', title: 'JPM' },
    { proName: 'AMEX:SPY', title: 'S&P 500' },
    { proName: 'NASDAQ:QQQ', title: 'Nasdaq 100' },
  ],
  showSymbolLogo: true,
  isTransparent: true,
  displayMode: 'adaptive',
  colorTheme: 'dark',
  locale: 'en',
};

function TickerTape() {
  const ref = useTradingViewWidget(
    'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js',
    CONFIG,
    46
  );
  return (
    <div className="border-b border-gray-800 bg-gray-900">
      <div className="tradingview-widget-container" ref={ref} style={{ height: 46 }}>
        <div className="tradingview-widget-container__widget" />
      </div>
    </div>
  );
}

export default memo(TickerTape);
