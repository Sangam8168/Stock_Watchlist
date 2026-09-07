import TradingViewWidget from "@/components/TradingViewWidget";
import SinceYouLeftStrip from "@/components/watchlist/SinceYouLeftStrip";
import Reveal from "@/components/Reveal";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG
} from "@/lib/constants";

const Home = () => {
    const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

    return (
        <div className="flex min-h-screen home-wrapper">
          <Reveal className="w-full"><SinceYouLeftStrip /></Reveal>
          <section className="grid w-full gap-8 home-section">
              <Reveal className="md:col-span-1 xl:col-span-1" delay={60}>
                  <TradingViewWidget
                    title="Market Overview"
                    scriptUrl={`${scriptUrl}market-overview.js`}
                    config={MARKET_OVERVIEW_WIDGET_CONFIG}
                    className="custom-chart"
                    height={600}
                  />
              </Reveal>
              <Reveal className="md-col-span xl:col-span-2" delay={120}>
                  <TradingViewWidget
                      title="Stock Heatmap"
                      scriptUrl={`${scriptUrl}stock-heatmap.js`}
                      config={HEATMAP_WIDGET_CONFIG}
                      height={600}
                  />
              </Reveal>
          </section>
            <section className="grid w-full gap-8 home-section">
                <Reveal className="h-full md:col-span-1 xl:col-span-1">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        height={600}
                    />
                </Reveal>
                <Reveal className="h-full md:col-span-1 xl:col-span-2" delay={80}>
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </Reveal>
            </section>
        </div>
    )
}

export default Home;
