import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PriceMarquee from "@/components/PriceMarquee";
import AnimatedChart from "@/components/AnimatedChart";
import { getMarketPulse } from "@/lib/actions/market-pulse.actions";

/** What the product actually does, in the order you'd experience it. */
const BEATS = [
    { step: "01", title: "Write the thesis", body: "Entry zone, invalidation, target, catalyst. A ticker on its own can't tell you when something matters." },
    { step: "02", title: "We watch the levels", body: "Prices, earnings dates and news are polled continuously and diffed against your thesis — not a flat 5% rule." },
    { step: "03", title: "Come back to the delta", body: "Not another price grid: what changed since you last looked, what it means, and what needs a decision." },
];

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) redirect("/");

    const pulse = await getMarketPulse();

    return (
        <main className="auth-layout">
            <section className="auth-left-section scrollbar-hide-default">
                <Link href="/" className="auth-logo flex items-center gap-2">
                    <Image src="/assets/icons/logo.svg" alt="Stock Watchlist logo" width={32} height={32} className="h-8 w-8" />
                    <span className="text-xl font-semibold text-gray-100">Stock Watchlist</span>
                </Link>

                <div className="pb-6 lg:pb-8 flex-1">{children}</div>
            </section>

            <section className="auth-right-section justify-between">
                <div className="-mx-6 md:-mx-6 lg:-mx-18 -mt-4 md:-mt-6 lg:-mt-12">
                    <PriceMarquee quotes={pulse.quotes} />
                </div>

                <div className="hidden md:flex flex-1 items-center justify-center py-8">
                    <AnimatedChart pulse={pulse} />
                </div>

                <div className="z-10 relative w-full max-w-[560px] self-center">
                    <ol className="space-y-2.5">
                        {BEATS.map((b, i) => (
                            <li
                                key={b.step}
                                className="auth-beat group flex gap-4 rounded-xl border border-gray-700/50 bg-gray-800/30 p-4 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-yellow-500/40 hover:bg-gray-800/60"
                                style={{ animationDelay: `${i * 110}ms` }}
                            >
                                <span className="mt-0.5 font-mono text-xs text-gray-600 transition-colors group-hover:text-yellow-500">
                                    {b.step}
                                </span>
                                <span>
                                    <span className="block text-sm font-semibold text-gray-100">{b.title}</span>
                                    <span className="mt-1 block text-xs leading-relaxed text-gray-500">{b.body}</span>
                                </span>
                            </li>
                        ))}
                    </ol>

                    {pulse.source === "live" && pulse.asOf && (
                        <p className="mt-4 text-center text-[11px] text-gray-600">
                            Live from the same feed the app uses · as of{" "}
                            {new Date(pulse.asOf).toLocaleString("en-US", {
                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                        </p>
                    )}
                </div>
            </section>
        </main>
    );
};

export default Layout;
