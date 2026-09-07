import {inngest} from "@/lib/inngest/client";
import {NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT} from "@/lib/inngest/prompts";
import {sendNewsSummaryEmail, sendWelcomeEmail, sendWatchlistDigestEmail} from "@/lib/nodemailer";
import {getAllUsersForNewsEmail, getUserContactById} from "@/lib/actions/user.actions";
import {buildUserDigest} from "@/lib/watchlist/digest";
import {usersWithRecentActivity} from "@/lib/watchlist/digest-dispatch";
import { getWatchlistSymbolsByEmail } from "@/lib/actions/watchlist.actions";
import { getNews } from "@/lib/actions/finnhub.actions";
import { getFormattedTodayDate } from "@/lib/utils";
import { getDistinctWatchedSymbols, refreshSymbols, flagStaleTheses } from "@/lib/watchlist/pipeline";
import { isMarketOpen } from "@/lib/market";

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email' },
    { event: 'app/user.created'},
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile)

        const response = await step.ai.infer('generate-welcome-intro', {
            model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
            body: {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt }
                        ]
                    }]
            }
        })

        await step.run('send-welcome-email', async () => {
            const part = response.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) ||'Thanks for joining Stock Watchlist. You now have the tools to track markets and make smarter moves.'

            const { data: { email, name } } = event;

            return await sendWelcomeEmail({ email, name, intro: introText });
        })

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }
    }
)

export const sendDailyNewsSummary = inngest.createFunction(
    { id: 'daily-news-summary' },
    [ { event: 'app/send.daily.news' }, { cron: '0 12 * * *' } ],
    async ({ step }) => {
        // Step #1: Get all users for news delivery
        const users = await step.run('get-all-users', getAllUsersForNewsEmail)

        if(!users || users.length === 0) return { success: false, message: 'No users found for news email' };

        // Step #2: For each user, get watchlist symbols -> fetch news (fallback to general)
        const results = await step.run('fetch-user-news', async () => {
            const perUser: Array<{ user: UserForNewsEmail; articles: MarketNewsArticle[] }> = [];
            for (const user of users as UserForNewsEmail[]) {
                try {
                    const symbols = await getWatchlistSymbolsByEmail(user.email);
                    let articles = await getNews(symbols);
                    // Enforce max 6 articles per user
                    articles = (articles || []).slice(0, 6);
                    // If still empty, fallback to general
                    if (!articles || articles.length === 0) {
                        articles = await getNews();
                        articles = (articles || []).slice(0, 6);
                    }
                    perUser.push({ user, articles });
                } catch (e) {
                    console.error('daily-news: error preparing user news', user.email, e);
                    perUser.push({ user, articles: [] });
                }
            }
            return perUser;
        });

        // Step #3: (placeholder) Summarize news via AI
        const userNewsSummaries: { user: UserForNewsEmail; newsContent: string | null }[] = [];

        for (const { user, articles } of results) {
                try {
                    const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}', JSON.stringify(articles, null, 2));

                    const response = await step.ai.infer(`summarize-news-${user.email}`, {
                        model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
                        body: {
                            contents: [{ role: 'user', parts: [{ text:prompt }]}]
                        }
                    });

                    const part = response.candidates?.[0]?.content?.parts?.[0];
                    const newsContent = (part && 'text' in part ? part.text : null) || 'No market news.'

                    userNewsSummaries.push({ user, newsContent });
                } catch (e) {
                    console.error('Failed to summarize news for : ', user.email);
                    userNewsSummaries.push({ user, newsContent: null });
                }
            }

        // Step #4: (placeholder) Send the emails
        await step.run('send-news-emails', async () => {
                await Promise.all(
                    userNewsSummaries.map(async ({ user, newsContent}) => {
                        if(!newsContent) return false;

                        return await sendNewsSummaryEmail({ email: user.email, date: getFormattedTodayDate(), newsContent })
                    })
                )
            })

        return { success: true, message: 'Daily news summary emails sent successfully' }
    }
)

// Ingestion: poll every symbol *anyone* watches (deduped), every 15 min.
// Snapshots + symbol-level events are written once and shared by every watcher —
// the fetch cost is O(distinct symbols), not O(users × symbols). Tiered: symbols
// in someone's "active" category poll every cycle; the rest poll ~hourly.
export const pollWatchlistSymbols = inngest.createFunction(
    { id: 'poll-watchlist-symbols', concurrency: 1 },
    [ { event: 'app/watchlist.poll' }, { cron: '*/15 * * * *' } ],
    async ({ step }) => {
        const minute = new Date().getUTCMinutes();
        const marketOpen = isMarketOpen();

        // Off-hours: one sweep an hour is enough for overnight news / earnings rolls.
        if (!marketOpen && minute >= 15) {
            return { success: true, message: 'Market closed — skipping intraday cycle', polled: 0 };
        }

        // During RTH: full sweep on the top of the hour, "active" symbols only otherwise.
        const activeOnly = marketOpen && minute >= 15;
        const symbols = await step.run('get-symbols', () => getDistinctWatchedSymbols(activeOnly));
        if (!symbols.length) return { success: true, message: 'No symbols to poll', polled: 0, tier: activeOnly ? 'active' : 'all' };

        const BATCH = 20;
        let wrote = 0;
        let events = 0;
        for (let i = 0; i < symbols.length; i += BATCH) {
            const slice = symbols.slice(i, i + BATCH);
            const results = await step.run(`refresh-batch-${i / BATCH}`, () => refreshSymbols(slice));
            wrote += results.filter((r) => r.wrote).length;
            events += results.reduce((n, r) => n + r.events, 0);
        }

        return { success: true, polled: symbols.length, tier: activeOnly ? 'active' : 'all', snapshotsWritten: wrote, changeEvents: events };
    }
)

// "Return later" via email. Two-stage fan-out so this scales to any number of
// users:
//   1. dispatcher (cron) — find only the users who *have* activity in the window
//      and emit one event per user, in batches.
//   2. worker — one invocation per user, Inngest-parallelised with a concurrency
//      cap and a send rate limit; idempotency keyed to (user, day) so a retry
//      or a duplicate event never double-sends.
export const dispatchWatchlistDigests = inngest.createFunction(
    { id: 'watchlist-digest-dispatch' },
    [ { event: 'app/watchlist.digest' }, { cron: '30 12 * * 1-5' } ],
    async ({ step }) => {
        const userIds: string[] = await step.run('find-active-users', () => usersWithRecentActivity(24));
        if (!userIds.length) return { success: true, dispatched: 0 };

        const day = new Date().toISOString().slice(0, 10);
        const BATCH = 250;
        for (let i = 0; i < userIds.length; i += BATCH) {
            const slice = userIds.slice(i, i + BATCH);
            await step.sendEvent(`emit-${i / BATCH}`, slice.map((userId) => ({
                name: 'app/watchlist.digest.user',
                data: { userId, day },
            })));
        }
        return { success: true, dispatched: userIds.length };
    }
)

export const sendUserWatchlistDigest = inngest.createFunction(
    {
        id: 'watchlist-digest-user',
        concurrency: { limit: 20 },              // at most 20 digests built at once
        throttle: { limit: 100, period: '60s' }, // ≤ 100 emails/min (well under Gmail's cap)
        idempotency: 'event.data.userId + "-" + event.data.day',
    },
    { event: 'app/watchlist.digest.user' },
    async ({ event, step }) => {
        const { userId } = event.data as { userId: string; day: string };

        const contact = await step.run('get-contact', () => getUserContactById(userId));
        if (!contact) return { success: false, reason: 'no contact' };

        const digest = await step.run('build-digest', () => buildUserDigest(userId, 24));
        if (!digest.hasContent) return { success: true, sent: false };

        await step.run('send', () =>
            sendWatchlistDigestEmail({
                email: contact.email,
                date: getFormattedTodayDate(),
                summaryLine: digest.summaryLine,
                body: digest.bodyHtml,
                watchlistUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/watchlist`,
            })
        );
        return { success: true, sent: true };
    }
)

// Housekeeping: nudge the user to cull "active"/"developing" items that have
// generated no meaningful change in 30+ days.
export const flagStaleThesesDaily = inngest.createFunction(
    { id: 'flag-stale-theses' },
    [ { event: 'app/watchlist.flag-stale' }, { cron: '0 13 * * 1-5' } ],
    async ({ step }) => {
        const flagged = await step.run('flag-stale', flagStaleTheses);
        return { success: true, flagged };
    }
)
