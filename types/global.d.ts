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
        renderAs?: 'button' | 'text';
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
        unconfirmedFields: string[];
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
            maxSeverity: number;
            events: SerializedChangeEvent[];
            /** Literal "was → now" values measured across your away-window. */
            deltas: ValueDelta[];
        }>;
    };
}

export {};
