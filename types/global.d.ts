declare global {
    type SignInFormData = {
        email: string;
        password: string;
    };

    type SignUpFormData = {
        fullName: string;
        email: string;
        password: string;
        country: string;
        investmentGoals: string;
        riskTolerance: string;
        preferredIndustry: string;
    };

    type CountrySelectProps = {
        name: string;
        label: string;
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FormInputProps = {
        name: string;
        label: string;
        placeholder: string;
        type?: string;
        register: UseFormRegister;
        error?: FieldError;
        validation?: RegisterOptions;
        disabled?: boolean;
        value?: string;
    };

    type Option = {
        value: string;
        label: string;
    };

    type SelectFieldProps = {
        name: string;
        label: string;
        placeholder: string;
        options: readonly Option[];
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FooterLinkProps = {
        text: string;
        linkText: string;
        href: string;
    };

    type SearchCommandProps = {
        renderAs?: 'button' | 'text' | 'hidden';
        label?: string;
        initialStocks: StockWithWatchlistStatus[];
    };

    type UserForNewsEmail = {
        id: string;
        email: string;
        name: string;
    };

    type WelcomeEmailData = {
        email: string;
        name: string;
        intro: string;
    };

    type User = {
        id: string;
        name: string;
        email: string;
    };

    type Stock = {
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    };

    type StockWithWatchlistStatus = Stock & {
        isInWatchlist: boolean;
    };

    type FinnhubSearchResult = {
        symbol: string;
        description: string;
        displaySymbol?: string;
        type: string;
    };

    type FinnhubSearchResponse = {
        count: number;
        result: FinnhubSearchResult[];
    };

    type StockDetailsPageProps = {
        params: Promise<{
            symbol: string;
        }>;
    };

    type WatchlistButtonProps = {
        symbol: string;
        company: string;
        isInWatchlist: boolean;
        showTrashIcon?: boolean;
        type?: 'button' | 'icon';
        onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
    };

    type QuoteData = {
        c?: number;
        dp?: number;
    };

    type ProfileData = {
        name?: string;
        marketCapitalization?: number;
    };

    type FinancialsData = {
        metric?: { [key: string]: number };
    };

    type SelectedStock = {
        symbol: string;
        company: string;
        currentPrice?: number;
    };

    type WatchlistTableProps = {
        watchlist: StockWithData[];
    };

    type StockWithData = {
        userId: string;
        symbol: string;
        company: string;
        addedAt: Date;
        currentPrice?: number;
        changePercent?: number;
        priceFormatted?: string;
        changeFormatted?: string;
        marketCap?: string;
        peRatio?: string;
    };

    type AlertsListProps = {
        alertData: Alert[] | undefined;
    };

    type MarketNewsArticle = {
        id: number;
        headline: string;
        summary: string;
        source: string;
        url: string;
        datetime: number;
        category: string;
        related: string;
        image?: string;
    };

    type WatchlistNewsProps = {
        news?: MarketNewsArticle[];
    };

    type AlertData = {
        symbol: string;
        company: string;
        alertName: string;
        alertType: 'upper' | 'lower';
        threshold: string;
    };

    type AlertModalProps = {
        alertId?: string;
        alertData?: AlertData;
        action?: string;
        open: boolean;
        setOpen: (open: boolean) => void;
    };

    type RawNewsArticle = {
        id: number;
        headline?: string;
        summary?: string;
        source?: string;
        url?: string;
        datetime?: number;
        image?: string;
        category?: string;
        related?: string;
    };

    type Alert = {
        id: string;
        symbol: string;
        company: string;
        alertName: string;
        currentPrice: number;
        alertType: 'upper' | 'lower';
        threshold: number;
        changePercent?: number;
    };

    // ---- "Since you left" watchlist ----------------------------------------

    type LeanSnapshot = {
        _id: unknown;
        symbol: string;
        capturedAt: Date;
        asOf: Date;
        stale: boolean;
        /** The exchange has no listing under this symbol — renamed, delisted or demerged. */
        symbolNotFound?: boolean;
        source: string;
        price?: number;
        changePercent?: number;
        dayHigh?: number;
        dayLow?: number;
        prevClose?: number;
        week52High?: number;
        week52Low?: number;
        peRatio?: number;
        marketCap?: number;
        nextEarningsDate?: Date;
        newsHash?: string;
        newsCount?: number;
        topHeadline?: string;
        unconfirmedFields?: string[];
        return1W?: number;
        return1M?: number;
        return3M?: number;
        return6M?: number;
        returnYTD?: number;
        return1Y?: number;
        dividendPerShare?: number;
        dividendYield?: number;
        dividendGrowth5Y?: number;
        payoutRatio?: number;
        revenuePerShare?: number;
        revenueTTM?: number;
        eps?: number;
        revenueGrowth?: number;
        epsGrowth?: number;
        beta?: number;
        earningsTime?: string;
        epsEstimate?: number;
        revenueEstimate?: number;
        lastEarningsDate?: Date;
        lastEpsActual?: number;
        lastEpsEstimate?: number;
        lastEpsSurprisePct?: number;
        analystRating?: string;
        analystCount?: number;
        sector?: string;
        currency?: string;
    };

    type SerializedChangeEvent = {
        symbol: string;
        type: string;
        severity: number;
        title: string;
        detail: string;
        createdAt: string;
        data: Record<string, unknown>;
    };

    type WatchlistCategoryName = 'active' | 'developing' | 'longterm' | 'earnings' | 'speculative';

    type WatchlistEntry = {
        symbol: string;
        company: string;
        /** Named list this item sits in — "Main" when the user hasn't made others. */
        list: string;
        category: WatchlistCategoryName;
        thesis: string | null;
        direction: 'long' | 'short';
        entryLow: number | null;
        entryHigh: number | null;
        invalidationPrice: number | null;
        targetPrice: number | null;
        catalystDate: string | null;
        catalystNote: string | null;
        catalystTradingDays: number | null;
        notify: boolean;
        sensitivity: number;
        alertTone: 'signal' | 'all';
        mutedUntil: string | null;
        owned: boolean;
        ownedAt: string | null;
        ownedPrice: number | null;
        /** % move since you bought (owned items only) */
        ownedReturnPct: number | null;
        lastReviewedAt: string | null;
        /** Days since the thesis/levels were last touched — staleness nudge */
        daysSinceReview: number | null;
        addedAt: string;
        priceHistory: number[];
        price: number | null;
        changePercent: number | null;
        week52High: number | null;
        week52Low: number | null;
        marketCap: number | null;
        peRatio: number | null;
        dataAsOf: string | null;
        stale: boolean;
        return1W: number | null;
        return1M: number | null;
        return3M: number | null;
        return6M: number | null;
        returnYTD: number | null;
        return1Y: number | null;
        dividendPerShare: number | null;
        dividendYield: number | null;
        dividendGrowth5Y: number | null;
        payoutRatio: number | null;
        revenueTTM: number | null;
        eps: number | null;
        revenueGrowth: number | null;
        epsGrowth: number | null;
        beta: number | null;
        earningsTime: string | null;
        epsEstimate: number | null;
        revenueEstimate: number | null;
        lastEarningsDate: string | null;
        lastEpsActual: number | null;
        lastEpsEstimate: number | null;
        lastEpsSurprisePct: number | null;
        analystRating: string | null;
        analystCount: number | null;
        sector: string | null;
        currency: string | null;
        /** Shares you hold — powers market value, P&L and % of portfolio. */
        shares: number | null;
        marketValue: number | null;
        profitLoss: number | null;
        unconfirmedFields: string[];
        symbolNotFound: boolean;
        distanceToEntryPct: number | null;
        unseenCount: number;
        topUnseenSeverity: number;
        events: SerializedChangeEvent[];
    };

    /**
     * `undefined` means "leave this field alone"; `null` means "clear it".
     * The distinction matters — Mongoose strips `undefined` out of `$set`, so a
     * cleared field has to travel as an explicit null and become an `$unset`.
     */
    type AddWatchlistInput = {
        symbol: string;
        company: string;
        list?: string;
        category?: WatchlistCategoryName;
        thesis?: string | null;
        direction?: 'long' | 'short';
        entryLow?: number | null;
        entryHigh?: number | null;
        invalidationPrice?: number | null;
        targetPrice?: number | null;
        catalystDate?: string | null;
        catalystNote?: string | null;
        notify?: boolean;
        shares?: number | null;
        sensitivity?: number;
        alertTone?: 'signal' | 'all';
    };

    /** A single "was → now" measurement, shown next to the change events. */
    type ValueDelta = {
        label: string;
        before: number | null;
        after: number | null;
        kind: 'price' | 'percent' | 'ratio' | 'plain';
        /**
         * Which way is good for the user's thesis. 'toward-zero' is for signed
         * gaps like distance-to-entry, where −8% → −14% is *worse* even though
         * the number went down — what matters is the magnitude closing.
         */
        goodDirection?: 'up' | 'down' | 'toward-zero';
    };

    type ChangeHistoryEntry = SerializedChangeEvent & {
        company: string;
        scope: 'thesis' | 'symbol';
    };

    type SinceYouLeftDigest = {
        lastVisit: string | null;
        /** Whether an empty digest can honestly be reported as "nothing happened". */
        coverage: {
            total: number;
            fresh: number;
            degraded: number;
            blind: number;
            unseen: string[];
            delisted: string[];
            oldestUnseenAt: string | null;
            canAssertQuiet: boolean;
        };
        counts: {
            itemsTracked: number;
            needsAttention: number;
            invalidated: number;
            quiet: number;
            unseenEvents: number;
        };
        groups: Array<{
            symbol: string;
            company: string;
            /** Named list the symbol sits in, so each list can show only its own. */
            list: string;
            maxSeverity: number;
            events: SerializedChangeEvent[];
            /** Literal "was → now" values measured across your away-window. */
            deltas: ValueDelta[];
        }>;
    };
}

export {};
