import {serve} from "inngest/next";
import {inngest} from "@/lib/inngest/client";
import {
    sendDailyNewsSummary,
    sendSignUpEmail,
    pollWatchlistSymbols,
    flagStaleThesesDaily,
    dispatchWatchlistDigests,
    sendUserWatchlistDigest,
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        sendSignUpEmail,
        sendDailyNewsSummary,
        pollWatchlistSymbols,
        flagStaleThesesDaily,
        dispatchWatchlistDigests,
        sendUserWatchlistDigest,
    ],
})
